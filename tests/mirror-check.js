// mirror-check.js - the Lead duties local mirror (v3.38.14). flushPending drains the marks made while Confluence was
// unreachable: it used to read only this month's queue of each kind, so a wiki review queued on the 30th, or a QC
// check of the sample month queued late in the month after it, was dropped silently once the month turned. And the
// four mirror refreshes copied every local mark the ledger lacked back over it, so a mark taken back in another
// browser came back as done; only marks still waiting for the ledger are carried now (local.carry). Evals the real
// JiTA.leadduty.local, flushPending and _prevYm against a stubbed meta store and ledger writes.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const member = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 50)); }
    return src.slice(s, src.indexOf('\n    },', s) + 7);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const meta = {};
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
let sent = [], down = {};
global.JiTA = { db: { getMeta: (k) => Promise.resolve(clone(meta[k]) || null), setMeta: (k, v) => { meta[k] = clone(v); return Promise.resolve(); } } };
const L = JiTA.leadduty = eval('({' + member('    local: {') + member('    flushPending: function () {') + member('    _prevYm: function (ym) {') + '})');
Object.assign(L, {
    _ym: () => '2026-10',
    _ymParts: (ym) => ({ y: parseInt(String(ym).slice(0, 4), 10), m: parseInt(String(ym).slice(5, 7), 10) }),
    _p2: (n) => (n < 10 ? '0' : '') + n,
    wiki: { localKey: (ym) => 'leadduty:wiki:' + ym, markReviewed: (id, ym) => { sent.push('review ' + id + '@' + ym); return down[id] ? Promise.reject(new Error('HTTP 503')) : Promise.resolve({ written: true }); } },
    qc: { localKey: (ym) => 'leadduty:qc:' + ym, markChecked: (id, v, ym) => { sent.push(v + ' ' + id + '@' + ym); return down[id] ? Promise.reject(new Error('HTTP 503')) : Promise.resolve({ written: true }); } }
});
const pending = (k) => ((meta[k] && meta[k].pending) || []).join(',');

(async () => {
    // ---- the queues, this month's and the month before's ----
    meta['leadduty:wiki:2026-10'] = { done: { p1: 't' }, pending: ['p1'] };
    meta['leadduty:wiki:2026-09'] = { done: { p7: 't' }, pending: ['p7'] };   // queued offline on the 30th
    meta['leadduty:qc:2026-09'] = { done: { 'EBR-1': 't' }, pending: ['EBR-1'] };
    meta['leadduty:qc:2026-08'] = { done: { 'EBR-8': 't' }, pending: ['EBR-8'] };   // the August sample, checked late in September
    await L.flushPending();
    ok('this month\'s wiki review is sent', sent.indexOf('review p1@2026-10') >= 0, sent.join(' | '));
    ok('so is one queued under last month, for that month', sent.indexOf('review p7@2026-09') >= 0, sent.join(' | '));
    ok('this QC month\'s check is sent', sent.indexOf('ok EBR-1@2026-09') >= 0, sent.join(' | '));
    ok('so is one for the sample month before it', sent.indexOf('ok EBR-8@2026-08') >= 0, sent.join(' | '));
    ok('...and every queue is empty afterwards', ['leadduty:wiki:2026-10', 'leadduty:wiki:2026-09', 'leadduty:qc:2026-09', 'leadduty:qc:2026-08'].every((k) => pending(k) === ''),
        JSON.stringify(Object.keys(meta).map((k) => k + ':' + pending(k))));

    sent = []; down = { p7: true };
    meta['leadduty:wiki:2026-09'] = { done: { p7: 't', p8: 't' }, pending: ['p7', 'p8'] };
    await L.flushPending();
    ok('a mark that still cannot be sent stays queued, and the rest go out', pending('leadduty:wiki:2026-09') === 'p7' && sent.indexOf('review p8@2026-09') >= 0, pending('leadduty:wiki:2026-09'));
    down = {};

    // ---- the merge rule ----
    const done = { p1: 'LEDGER' };
    L.local.carry({ done: { p1: 'LOCAL', p2: 'OFFLINE', p3: 'UNDONE' }, pending: ['p1', 'p2'] }, done);
    ok('a mark still waiting for the ledger is carried into the refreshed mirror', done.p2 === 'OFFLINE');
    ok('a local mark the ledger lacks and is not waiting to send - taken back elsewhere - is not', !('p3' in done), JSON.stringify(done));
    ok('and what the ledger says stands', done.p1 === 'LEDGER');
    ok('no previous mirror: nothing to carry', JSON.stringify(L.local.carry(null, { a: 1 })) === '{"a":1}');
    ok('all four refreshes use the rule', (src.match(/L\.local\.carry\(prev, /g) || []).length === 4 && src.indexOf('Object.keys(prev.done).forEach') < 0,
        String((src.match(/L\.local\.carry\(prev, /g) || []).length));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'mirror checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
