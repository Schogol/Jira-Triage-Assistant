// JiTA.leadduty.syncMirrors (v3.35.1): the local mirrors the chip and the daily dialog count from are brought up
// to date with the shared ledger. Completions are only ever ADDED, only for items the mirror already lists, a
// missing mirror is left for the scheduler, a failed read changes nothing, and concurrent calls share one read.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s0 = src.indexOf('    syncMirrors: function () {');
const e0 = src.indexOf('\n    },', s0) + '\n    },'.length;
if (s0 < 0 || e0 < 7) { throw new Error('could not slice syncMirrors'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const store = {};
let puts = 0, reads = 0, readImpl;
const L = {
    LEDGER_KEY: 'wikiLedger', QC_LEDGER_KEY: 'qcLedger', _syncing: null,
    _ym: () => '2026-09', _prevYm: () => '2026-08',
    wiki: { localKey: (ym) => 'leadduty:wiki:' + ym }, qc: { localKey: (ym) => 'leadduty:qc:' + ym },
    local: {
        get: (k) => Promise.resolve(store[k] ? JSON.parse(JSON.stringify(store[k])) : null),
        put: (k, v) => { puts++; store[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); }
    },
    ledger: { read: (k) => { reads++; return readImpl(k); } }
};
global.JiTA = { leadduty: L };
Object.assign(L, eval('({' + src.slice(s0, e0) + '})'));

const W = 'leadduty:wiki:2026-09', Q = 'leadduty:qc:2026-08';
function ledgers(wikiDone, qcDone) {
    return (k) => Promise.resolve({ value: k === 'wikiLedger' ? { done: { '2026-09': wikiDone || {} } } : { done: { '2026-08': qcDone || {} } } });
}
function reset(wiki, qc) {
    Object.keys(store).forEach((k) => { delete store[k]; });
    if (wiki) { store[W] = wiki; }
    if (qc) { store[Q] = qc; }
    puts = 0; reads = 0; L._syncing = null;
}

(async () => {
    // The reported case: both pages reviewed elsewhere, the local copy still counting them.
    reset({ ym: '2026-09', pageIds: ['101', '102'], done: {}, pending: [] }, { ym: '2026-08', items: ['EBR-1', 'EDR-2'], done: {}, pending: [] });
    readImpl = ledgers({ '101': { by: 'schogol', at: '2026-09-27T10:00:00Z' }, '102': { by: 'schogol', at: '2026-09-27T11:00:00Z', skipped: true } },
        { 'EBR-1': { by: 'schogol', at: '2026-09-20T09:00:00Z', verdict: 'ok' } });
    let changed = await L.syncMirrors();
    ok('a completion from another browser reaches the mirror', store[W].done['101'] === '2026-09-27T10:00:00Z', JSON.stringify(store[W].done));
    ok('a skipped page counts as handled too', !!store[W].done['102']);
    ok('the QC half is reconciled as well', store[Q].done['EBR-1'] === '2026-09-20T09:00:00Z', JSON.stringify(store[Q].done));
    ok('...only for what the ledger actually has', !store[Q].done['EDR-2']);
    ok('it reports that something changed', changed === true);
    ok('it reads each ledger once', reads === 2, String(reads));

    // Only items this mirror lists: another Lead's pages must not leak into my count.
    reset({ ym: '2026-09', pageIds: ['101'], done: {}, pending: [] }, null);
    readImpl = ledgers({ '999': { by: 'solnichka', at: 'x' } });
    changed = await L.syncMirrors();
    ok('pages assigned to someone else are ignored', !store[W].done['999'] && Object.keys(store[W].done).length === 0, JSON.stringify(store[W].done));
    ok('nothing new means nothing written', changed === false && puts === 0, changed + ' / ' + puts);

    // A mark the ledger has not accepted yet (made offline) must survive; an existing local time is kept.
    reset({ ym: '2026-09', pageIds: ['101', '102'], done: { '102': 'LOCAL' }, pending: ['102'] }, null);
    readImpl = ledgers({ '101': { by: 'schogol', at: 'LEDGER' }, '102': { by: 'schogol', at: 'LEDGER-LATER' } });
    await L.syncMirrors();
    ok('a local-only mark survives', store[W].done['102'] === 'LOCAL', JSON.stringify(store[W].done));
    ok('...and its pending retry is left alone', store[W].pending.length === 1 && store[W].pending[0] === '102');
    ok('while the ledger completion is added beside it', store[W].done['101'] === 'LEDGER');

    // A mirror that does not exist is left for the scheduler to build (it knows the assignment; sync does not).
    reset(null, null);
    readImpl = ledgers({ '101': { by: 'schogol', at: 'x' } }, { 'EBR-1': { at: 'y' } });
    changed = await L.syncMirrors();
    ok('a missing mirror is not invented', !store[W] && !store[Q] && changed === false && puts === 0);

    // One half missing (the QC sample not drawn yet, say) must not cost the other half its update.
    reset(null, { ym: '2026-08', items: ['EBR-1'], done: {}, pending: [] });
    readImpl = ledgers({ '101': { at: 'x' } }, { 'EBR-1': { at: 'y' } });
    changed = await L.syncMirrors();
    ok('with one mirror missing the other is still reconciled', store[Q].done['EBR-1'] === 'y' && changed === true, JSON.stringify(store[Q]) + ' / ' + changed);
    ok('...and the missing one is still not invented', !store[W]);

    // Confluence unreachable: nothing changes, nothing throws, the caller falls back to the mirror.
    reset({ ym: '2026-09', pageIds: ['101'], done: {}, pending: [] }, null);
    readImpl = () => Promise.reject(new Error('HTTP 503'));
    let threw = false;
    try { changed = await L.syncMirrors(); } catch (e) { threw = true; }
    ok('an unreachable ledger never throws', !threw);
    ok('...reports no change', changed === false);
    ok('...and leaves the mirror as it was', Object.keys(store[W].done).length === 0 && puts === 0);

    // The chip on load and the dialog 12s later can overlap: they share one read, and a later call reads afresh.
    reset({ ym: '2026-09', pageIds: ['101'], done: {}, pending: [] }, null);
    let release;
    readImpl = ledgers({ '101': { at: 'z' } });
    const gate = new Promise((r) => { release = r; });
    const slow = readImpl;
    readImpl = (k) => gate.then(() => slow(k));
    const a = L.syncMirrors(), b = L.syncMirrors();
    ok('overlapping calls share one promise', a === b);
    release();
    await a;
    ok('...and one pair of reads', reads === 2, String(reads));
    readImpl = slow;
    await L.syncMirrors();
    ok('a later call reads the ledger again', reads === 4, String(reads));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'mirror sync checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
