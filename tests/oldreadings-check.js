// oldreadings-check.js - stored log readings of an older reader version are deleted (review 2026-11-20 profile-robust-6
// and boost-robust-7, Schogol's choice of 2026-11-21: only old versions go). Every report the Defect Profile or the
// background reader reads keeps a reading in the meta store (rp:<key>), and nothing ever deleted one: after a reader
// version bump (JiTA.profile.V), the old ones are never used again (_usable) but stayed for good. Checked against the
// real JiTA.db.sweepMeta and JiTA.profile.sweepOld, over an IndexedDB stand-in kept in memory: only rows under the prefix
// that the test drops go, in transactions of SWEEP_N rows at most; a newer build's readings and this version's stay;
// a sweep runs once per reader version a browser runs, never twice at once, and a failed one is tried again.
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const J = JSON.stringify;

let gm = {}, logged = [], caught = [];
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.JiTA = { log: (m) => { logged.push(m); }, caught: (where, e) => { caught.push(where + ': ' + ((e && e.message) || e)); } };
eval(S.top(src, 'JiTA.db'));
JiTA.profile = eval(S.members(src, 'JiTA.profile', ['V', 'CACHE_PREFIX', '_usable', 'SWEPT_KEY', 'SWEEP_DELAY_MS', '_sweeping', 'sweepOld']));
const D = JiTA.db, P = JiTA.profile;

// ---- the meta store, in memory: rows by key, cursors over a key range in key order, each transaction counted ----
// failNext: 'error' or 'abort' makes the next transaction end so after its first row.
let rows, txs, perTx, failNext = null;
const range = (lo, hi, loOpen, hiOpen) => ({ has: (k) => (loOpen ? k > lo : k >= lo) && (hiOpen ? k < hi : k <= hi) });
const fakeDb = {
    transaction: (name, mode) => {
        if (name !== 'meta' || mode !== 'readwrite') { throw new Error('unexpected transaction ' + name + ' ' + mode); }
        if (++txs > 200) { throw new Error('a sweep that never ends'); }
        const tx = { oncomplete: null, onerror: null, onabort: null, error: null }, how = failNext, before = new Map(rows);
        let reads = 0;
        failNext = null;
        const end = () => setImmediate(() => {
            perTx.push(reads);
            if (how) { rows = before; }   // a transaction that fails takes back what it did, as IndexedDB's does
            if (how === 'error') { tx.error = new Error('disk full'); if (tx.onerror) { tx.onerror(); } return; }
            if (how === 'abort') { tx.error = new Error('QuotaExceededError'); if (tx.onabort) { tx.onabort(); } return; }
            if (tx.oncomplete) { tx.oncomplete(); }
        });
        tx.objectStore = () => ({
            openCursor: (r) => {
                const req = { result: null, onsuccess: null }, keys = Array.from(rows.keys()).sort().filter((k) => r.has(k));
                let i = 0;
                const step = () => setImmediate(() => {
                    if (i >= keys.length || (how && reads >= 1)) { req.result = null; if (req.onsuccess) { req.onsuccess(); } end(); return; }
                    const k = keys[i++];
                    let moved = false;
                    reads++;
                    req.result = { key: k, value: rows.get(k), delete: () => { rows.delete(k); }, continue: () => { moved = true; step(); } };
                    if (req.onsuccess) { req.onsuccess(); }
                    if (!moved) { end(); }
                });
                step();
                return req;
            }
        });
        return tx;
    }
};
D.open = () => Promise.resolve(fakeDb);
D._keyRange = () => ({ bound: range });
const reading = (key, v) => ({ k: 'rp:' + key, v: v == null ? null : { v: v, key: key, logs: true } });
function fill(list) { rows = new Map(); list.forEach((r) => { rows.set(r.k, r); }); txs = 0; perTx = []; }
const left = () => Array.from(rows.keys()).sort().join(',');

(async () => {
    // ================= the sweep itself =================
    fill([reading('EBR-1', P.V - 2), reading('EBR-2', P.V), reading('EBR-3', P.V - 1), reading('EBR-4', P.V + 1), reading('EBR-5', null),
        { k: 'rpx', v: { v: 1 } }, { k: 'rq:EBR-1', v: { v: 1 } }, { k: 'checklistLabels', v: { v: 1 } }, { k: 'rp', v: { v: 1 } }]);
    let n = await D.sweepMeta('rp:', (r) => !(r && r.v >= P.V));
    ok('a sweep deletes the rows under its prefix that the test drops: readings of older versions, and an empty one', n === 3 &&
        left() === ['checklistLabels', 'rp', 'rp:EBR-2', 'rp:EBR-4', 'rpx', 'rq:EBR-1'].join(','), n + ' ' + left());
    ok('...this version\'s reading and a newer build\'s stay, and so does every row of another key', rows.has('rp:EBR-2') && rows.has('rp:EBR-4') && rows.has('rq:EBR-1') && rows.has('rpx'));
    // in parts of SWEEP_N rows, each going on after the last key the one before saw
    const N0 = D.SWEEP_N;
    D.SWEEP_N = 3;
    const many = [];
    for (let i = 10; i < 20; i++) { many.push(reading('EBR-' + i, i % 2 ? P.V : P.V - 1)); }
    fill(many.concat([{ k: 'zz', v: { v: 0 } }]));
    n = await D.sweepMeta('rp:', (r) => !(r && r.v >= P.V));
    ok('a long sweep goes in transactions of SWEEP_N rows at most, each on after the last key the one before saw', n === 5 && txs === 4 && Math.max.apply(null, perTx) <= 3 &&
        perTx.reduce((a, b) => a + b, 0) === 10 && left() === many.filter((r) => r.v.v === P.V).map((r) => r.k).sort().concat(['zz']).join(','), n + ' ' + J(perTx) + ' ' + left());
    fill([reading('EBR-1', 0), reading('EBR-2', 0), reading('EBR-3', 0)]);
    n = await D.sweepMeta('rp:', () => true);
    ok('...one of exactly SWEEP_N rows ends too', n === 3 && rows.size === 0 && txs === 2, n + ' ' + txs);
    D.SWEEP_N = N0;
    ok('a part holds a few hundred rows at most', D.SWEEP_N > 0 && D.SWEEP_N <= 1000, String(D.SWEEP_N));
    fill([]);
    n = await D.sweepMeta('rp:', () => true);
    ok('an empty store sweeps nothing, in one transaction', n === 0 && txs === 1);
    fill([reading('EBR-1', 0), reading('EBR-2', 0)]);
    failNext = 'abort';
    const aborted = await Promise.race([D.sweepMeta('rp:', () => true).then(() => 'done', (e) => 'failed: ' + e.message), new Promise((r) => setTimeout(() => r('hung'), 1000))]);
    ok('a transaction that aborts (a full disk) fails the sweep instead of hanging it', aborted === 'failed: QuotaExceededError', aborted);
    failNext = 'error';
    const errored = await Promise.race([D.sweepMeta('rp:', () => true).then(() => 'done', (e) => 'failed: ' + e.message), new Promise((r) => setTimeout(() => r('hung'), 1000))]);
    ok('...and so does one that errs', errored === 'failed: disk full', errored);

    // ================= once per reader version =================
    gm = {}; logged = []; caught = [];
    fill([reading('EBR-1', P.V - 1), reading('EBR-2', P.V), reading('EBR-3', P.V + 1), reading('EBR-4', null), { k: 'rp:EBR-5', v: { key: 'EBR-5', logs: true } }]);
    n = await P.sweepOld();
    ok('the readings of older reader versions are deleted, the ones of this version and of a newer build kept', n === 3 && left() === 'rp:EBR-2,rp:EBR-3', n + ' ' + left());
    ok('...an empty one and one with no version with them: no reader can use those either', !rows.has('rp:EBR-4') && !rows.has('rp:EBR-5'));
    ok('...noting the version that swept, and saying how many went', gm[P.SWEPT_KEY] === P.V && logged.some((m) => /deleted 3 stored log reading\(s\) of an older reader version/.test(m)), J(gm) + ' ' + J(logged));
    rows.set('rp:EBR-9', reading('EBR-9', P.V - 1)); txs = 0; logged = [];
    n = await P.sweepOld();
    ok('...once: a browser that swept for this version does not sweep again', n === 0 && txs === 0 && rows.has('rp:EBR-9') && !logged.length);
    gm[P.SWEPT_KEY] = P.V + 1;   // a newer build swept, and this browser runs this version again
    n = await P.sweepOld();
    ok('a browser back on this version after another one swept sweeps again', n === 1 && !rows.has('rp:EBR-9') && gm[P.SWEPT_KEY] === P.V, n + ' ' + left());
    gm = {}; txs = 0;
    fill([reading('EBR-1', P.V - 1), reading('EBR-2', P.V - 1)]);
    const both = await Promise.all([P.sweepOld(), P.sweepOld()]);
    ok('two calls at once sweep once', both[0] === 2 && both[1] === 0 && txs === 1, J(both) + ' ' + txs);
    gm = {}; logged = [];
    fill([reading('EBR-1', P.V)]);
    n = await P.sweepOld();
    ok('nothing to delete: noted as swept, said nowhere', n === 0 && gm[P.SWEPT_KEY] === P.V && !logged.length);
    gm = {}; caught = [];
    fill([reading('EBR-1', P.V - 1)]);
    failNext = 'abort';
    n = await P.sweepOld();
    ok('a sweep that fails says so in the diagnostics and is not noted, so the next page load tries again', n === 0 && !(P.SWEPT_KEY in gm) && caught.some((c) => /^profile\.sweepOld: QuotaExceededError/.test(c)) && P._sweeping === false,
        J(caught) + ' ' + J(gm));
    n = await P.sweepOld();
    ok('...and the next one does it', n === 1 && gm[P.SWEPT_KEY] === P.V);

    // ================= when it runs =================
    ok('a Jira tab sweeps a minute after it loads, not before the page has drawn', /setTimeout\(function \(\) \{ try \{ JiTA\.profile\.sweepOld\(\); \} catch \(e\) \{ JiTA\.caught\('profile\.sweepOld', e\); \} \}, JiTA\.profile\.SWEEP_DELAY_MS\);/.test(src) &&
        P.SWEEP_DELAY_MS >= 30000);
    ok('the readings are the ones the reader stores (rp:), and only ones it can no longer use go', P.CACHE_PREFIX === 'rp:' && P._usable({ v: P.V }) && !P._usable({ v: P.V - 1 }));

    console.log(fail ? ('\n' + fail + ' FAILURE(S)') : '\nold readings checks passed.');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
