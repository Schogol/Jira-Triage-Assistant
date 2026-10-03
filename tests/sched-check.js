// Eval the real JiTA.leadduty.sched literal out of the file and drive one tick against stubs, to prove the
// background scheduler freezes BOTH months and mirrors both locally - i.e. that neither ledger depends on a
// Lead opening the overlay, and that a QC failure cannot cost the wiki half its refresh.
const fs = require('fs');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const ss = src.indexOf('JiTA.leadduty.sched = {');
const se = src.indexOf('\n};', ss) + 3;
if (ss < 0 || se < 3) { throw new Error('could not slice JiTA.leadduty.sched'); }

// The scheduler reads its page list through wiki.assignedIds, so that one is the REAL function rather than a
// stub: the mirror it writes drives the chip's count, and it must not count a page the exclusions now catch.
// assignedIds delegates to notExcluded (shared with the overlay and the published page), so both come along.
function sliceFn(sig) {
    const s = src.indexOf('        ' + sig);
    const e = src.indexOf('\n        },', s) + '\n        },'.length;
    if (s < 0 || e < 11) { throw new Error('could not slice ' + sig); }
    return src.slice(s, e);
}
const wikiFns = eval('({' + sliceFn('notExcluded: function (ids, pool) {') + '\n'
    + sliceFn('assignedIds: function (record, pool) {') + '})');
// ...and so is the mirror's merge rule (v3.38.14): only marks still waiting for the ledger are carried over.
const carry = eval('({' + sliceFn('carry: function (prev, done) {') + '})').carry;

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const gm = {};
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.window = { addEventListener: () => {} };

// One scenario run. `qcThrows` makes qc.claimMonth reject, so we can check the wiki half still survives;
// `mirrorsReady` is the local-mirror gate that lets a tick run ahead of its six-hourly interval.
function run(qcThrows, mirrorsReady) {
    const calls = [], puts = {};
    const L = {
        _ym: () => '2026-09', _prevYm: () => '2026-08',
        _mirrorsReady: () => Promise.resolve(mirrorsReady !== false),
        isLead: () => true, rootPage: () => '1', ledgerPage: () => '2',
        me: () => ({ handle: 'schogol' }),
        reminder: { mount() {} },
        flushPending: () => { calls.push('flush'); return Promise.resolve(); },
        wiki: {
            localKey: (ym) => 'leadduty:wiki:' + ym,
            notExcluded: wikiFns.notExcluded,
            assignedIds: wikiFns.assignedIds,
            claimMonth(ym) {
                calls.push('wiki.claimMonth:' + ym);
                // p3 was assigned when the month was frozen and only afterwards turned out to sit in an
                // excluded subtree. The month cannot be re-cut, so the pool disowns it on the way out.
                return Promise.resolve({
                    record: { perLead: 9, assign: { schogol: ['p1', 'p2', 'p3'] } },
                    ledgerValue: { done: { '2026-09': { p1: { at: 'LEDGER' } } } },
                    pool: { excludedIds: { p3: true } }
                });
            }
        },
        qc: {
            localKey: (ym) => 'leadduty:qc:' + ym,
            claimMonth(ym) {
                calls.push('qc.claimMonth:' + ym);
                if (qcThrows) { return Promise.reject(new Error('confluence down')); }
                return Promise.resolve({
                    ym: ym, record: { quota: 10 },
                    items: [{ key: 'EBR-1' }, { key: 'EO-2' }],
                    done: { 'EBR-1': { at: 'LEDGER' } }
                });
            }
        },
        report: { publish() { calls.push('publish'); return Promise.resolve({}); } },
        local: {
            // Pre-seed an offline mark in each mirror (pending: the ledger has not taken it yet), so we can see whether
            // the scheduler clobbers it - and, next to it, a mark that is NOT pending: one taken back in another
            // browser, which the ledger rightly lacks and the refresh must not bring back.
            get: (k) => Promise.resolve(k.indexOf('qc') > 0
                ? { done: { 'EO-2': 'OFFLINE', 'EBR-1x': 'UNDONE' }, pending: ['EO-2'] }
                : { done: { p2: 'OFFLINE', p3: 'UNDONE' }, pending: ['p2'] }),
            put: (k, rec) => { puts[k] = rec; return Promise.resolve(); },
            carry: carry
        }
    };
    global.JiTA = { leadduty: L, sched: { tabId: 'T' }, dlog: () => {} };
    eval(src.slice(ss, se));
    L.sched.tick();
    return new Promise((res) => setTimeout(() => res({ calls, puts, S: L.sched }), 30));
}

(async () => {
    Object.keys(gm).forEach((k) => delete gm[k]);
    const a = await run(false);
    ok('the tick freezes the wiki month without the overlay', a.calls.indexOf('wiki.claimMonth:2026-09') !== -1);
    ok('the tick freezes the QC month without the overlay', a.calls.indexOf('qc.claimMonth:2026-08') !== -1, a.calls.join(' '));
    ok('QC is sampled for the PREVIOUS month, not the current one', a.calls.indexOf('qc.claimMonth:2026-09') === -1);
    ok('both local mirrors are written so the chip can count',
        !!a.puts['leadduty:wiki:2026-09'] && !!a.puts['leadduty:qc:2026-08']);
    ok('the QC mirror carries the assigned keys',
        JSON.stringify((a.puts['leadduty:qc:2026-08'] || {}).items) === '["EBR-1","EO-2"]');
    ok('a ledger mark reaches the mirror', (a.puts['leadduty:qc:2026-08'].done || {})['EBR-1'] === 'LEDGER');
    ok('the wiki mirror carries the assigned page ids',
        JSON.stringify((a.puts['leadduty:wiki:2026-09'] || {}).pageIds) === '["p1","p2"]',
        JSON.stringify((a.puts['leadduty:wiki:2026-09'] || {}).pageIds));
    ok('a now-excluded page is not counted by the chip',
        ((a.puts['leadduty:wiki:2026-09'] || {}).pageIds || []).indexOf('p3') === -1);
    ok('an offline mark is NOT clobbered (wiki)', (a.puts['leadduty:wiki:2026-09'].done || {}).p2 === 'OFFLINE');
    ok('an offline mark is NOT clobbered (QC)', (a.puts['leadduty:qc:2026-08'].done || {})['EO-2'] === 'OFFLINE');
    ok('a pending queue survives the refresh', (a.puts['leadduty:qc:2026-08'].pending || []).length === 1);
    ok('a mark taken back elsewhere is not brought back (wiki)', !(a.puts['leadduty:wiki:2026-09'].done || {}).p3, JSON.stringify(a.puts['leadduty:wiki:2026-09'].done));
    ok('...nor in QC', !(a.puts['leadduty:qc:2026-08'].done || {})['EBR-1x'], JSON.stringify(a.puts['leadduty:qc:2026-08'].done));
    ok('the page is republished after both halves', a.calls.indexOf('publish') === a.calls.length - 1, a.calls.join(' '));
    ok('the tick marks itself done', !!gm.leadDutyLastTs && !gm.leadDutyFailTs);
    ok('the lease is released', !gm.leadDutyLease);

    Object.keys(gm).forEach((k) => delete gm[k]);
    const b = await run(true);
    ok('a QC failure still leaves the wiki month mirrored', !!b.puts['leadduty:wiki:2026-09']);
    ok('a QC failure still republishes the page', b.calls.indexOf('publish') !== -1, b.calls.join(' '));
    ok('a QC failure is not treated as a failed tick (no 30-min backoff)', !gm.leadDutyFailTs && !!gm.leadDutyLastTs);

    // The six-hourly interval must not hold a MISSING mirror hostage: the chip cannot count that half of the
    // month until it exists, which is what left the QC checks off the chip until someone opened the tab.
    Object.keys(gm).forEach((k) => delete gm[k]);
    gm.leadDutyLastTs = Date.now();                    // a routine tick just ran
    const c = await run(false, true);
    ok('a fresh interval with both mirrors present does nothing', !c.calls.length, c.calls.join(' '));

    Object.keys(gm).forEach((k) => delete gm[k]);
    gm.leadDutyLastTs = Date.now();                    // same fresh interval...
    const d = await run(false, false);                 // ...but a mirror is missing
    ok('a missing mirror refreshes ahead of the interval', d.calls.indexOf('wiki.claimMonth:2026-09') !== -1,
        d.calls.join(' '));
    ok('and it mirrors the half that was missing', !!d.puts['leadduty:qc:2026-08']);

    // A failed tick still backs off for 30 minutes even with a mirror missing, so a broken ledger cannot
    // turn the missing-mirror path into a once-a-minute retry loop.
    Object.keys(gm).forEach((k) => delete gm[k]);
    gm.leadDutyFailTs = Date.now();
    const e2 = await run(false, false);
    ok('the failure backoff still suppresses a missing-mirror refresh', !e2.calls.length, e2.calls.join(' '));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'scheduler checks passed.'));
    process.exit(fail ? 1 : 0);
})();
