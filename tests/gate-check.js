// gate-check.js - the session filters reach the shared worker's ranking BEFORE its top-N cut (v3.38.13). The worker
// returned its top 100-200 candidates and the tab dropped those failing Status / Created within afterwards, so with a
// strict filter the panel said nothing matched while real matches sat just below the cut. Evals the worker body's
// real passesGate / cosineTopN / bm25Score and the tab's _gateSpec / _workerKeyword / _workerSemantic.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const WS = src.indexOf('\nfunction jitaWorkerBody(');
function fn(name) {   // a function declared at the top of the worker body, one line or many
    const s = src.indexOf('\n    function ' + name + '(', WS);
    if (WS < 0 || s < 0) { throw new Error('could not slice worker ' + name); }
    const line = src.slice(s + 1, src.indexOf('\n', s + 1));
    if ((line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length) { return line; }
    return src.slice(s + 1, src.indexOf('\n    }\n', s + 1) + 6);
}
function member(head) {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 50)); }
    return src.slice(s, src.indexOf('\n    },', s) + 7);
}

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- the worker's scorers ----
const W = new Function('tokenize', 'K1', 'B',
    [fn('matchTerms'), fn('isClosedStatus'), fn('passesGate'), fn('cosineTopN'), fn('bm25Score')].join('\n') +
    '\nreturn { passesGate: passesGate, cosineTopN: cosineTopN, bm25Score: bm25Score };')(
    (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), 1.2, 0.75);
const NOW = Date.parse('2026-10-03T12:00:00Z'), DAY = 86400000;
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const OPEN = { status: 'open', createdDays: 0, now: NOW };

// passesGate: the tab's rule
ok('no gate lets everything through', W.passesGate({ project: 'EDR', status: 'Closed', resolution: 'Fixed' }, null));
ok('Status open drops a resolved defect, by resolution or by a closed status name',
    !W.passesGate({ project: 'EDR', status: 'Open', resolution: 'Fixed' }, OPEN) && !W.passesGate({ project: 'EDR', status: 'Closed' }, OPEN) &&
    W.passesGate({ project: 'EDR', status: 'In Progress' }, OPEN));
const FIXED = { status: 'fixed', createdDays: 0, now: NOW };
ok('Status fixed keeps only resolved defects', W.passesGate({ project: 'EO', status: 'Done' }, FIXED) && !W.passesGate({ project: 'EO', status: 'Open' }, FIXED));
ok('Status never applies to bug reports, which are open by definition', W.passesGate({ project: 'EBR', status: 'Closed' }, OPEN) && W.passesGate({ project: 'EBR', status: 'Open' }, FIXED));
const RECENT = { status: 'all', createdDays: 14, now: NOW };
ok('Created within keeps the recent, drops the old and the undated',
    W.passesGate({ project: 'EDR', created: iso(3) }, RECENT) && !W.passesGate({ project: 'EDR', created: iso(30) }, RECENT) && !W.passesGate({ project: 'EDR' }, RECENT));

// the cut: 250 strong but resolved defects ahead of 50 weaker open ones
const entries = [], docs = [];
for (let i = 0; i < 300; i++) {
    const open = i >= 250, key = 'EDR-' + i;
    entries.push({ key, project: 'EDR', status: open ? 'Open' : 'Closed', resolution: open ? null : 'Fixed', created: iso(5), vec: [open ? 0.5 : 0.9], hay: 'warp crash' });
    docs.push({ key, project: 'EDR', status: open ? 'Open' : 'Closed', resolution: open ? null : 'Fixed', created: iso(5), tf: { warp: open ? 1 : 3 }, len: 10, hay: 'warp crash' });
}
const kw = { N: docs.length, avgdl: 10, df: { warp: 300 }, docs };
const openKeys = (list) => list.filter((r) => r.status === 'Open').length;
let sem = W.cosineTopN([1], entries, 200, null, null, null);
ok('(without a gate the semantic top 200 holds no open defect at all - the old behaviour)', sem.length === 200 && openKeys(sem) === 0, openKeys(sem));
sem = W.cosineTopN([1], entries, 200, null, null, OPEN);
ok('with Status open, the semantic ranking returns the 50 open defects that sat below the cut', sem.length === 50 && openKeys(sem) === 50, sem.length + ' ' + openKeys(sem));
let bm = W.bm25Score(kw, 'warp', null, 200, null, null);
ok('(without a gate the keyword top 200 holds no open defect either)', bm.length === 200 && openKeys(bm) === 0, openKeys(bm));
bm = W.bm25Score(kw, 'warp', null, 200, null, OPEN);
ok('with Status open, the keyword ranking returns them too', bm.length === 50 && openKeys(bm) === 50, bm.length + ' ' + openKeys(bm));
ok('the worker hands the gate a ranking call carries to both scorers',
    src.indexOf('cosineTopN(q, entries, payload.topN || 10, payload.excludeKey, payload.filterTerms, payload.gate)') >= 0 &&
    src.indexOf("bm25Score(idx, payload.text || '', payload.excludeKey, payload.topN || 200, payload.filterTerms, payload.gate)") >= 0);

// ---- the tab sends it ----
const calls = [];
global.JiTA = {
    TOP_N: 8, ui: { filters: { status: 'all', createdDays: 0 } }, rank: { CAND: 50 },
    worker: { _started: true, usable: () => true, call:(type, payload) => { calls.push({ type, payload }); return Promise.resolve({ results: [] }); } }
};
Object.assign(JiTA.ui, eval('({' + member('    _gateSpec: function () {') + '})'));
Object.assign(JiTA.rank, eval('({' + member('    _workerKeyword: function (text, scope, excludeKey, filterTerms, limit) {') + '})'));
const ws = src.indexOf('JiTA.rank._workerSemantic = function (');
eval(src.slice(ws, src.indexOf('\n};', ws) + 3));
ok('no filter set sends no gate', JiTA.ui._gateSpec() === null);
JiTA.ui.filters = { status: 'open', createdDays: 14 };
const g = JiTA.ui._gateSpec();
ok('a set filter is sent as the worker applies it', !!g && g.status === 'open' && g.createdDays === 14 && typeof g.now === 'number', JSON.stringify(g));
JiTA.rank._workerKeyword('warp', 'defects', null, null, 8);
JiTA.rank._workerSemantic('warp', 'defects', null, null);
ok('both ranking calls carry it', calls.length === 2 && calls.every((c) => c.payload.gate && c.payload.gate.status === 'open' && c.payload.gate.createdDays === 14),
    JSON.stringify(calls.map((c) => c.type + ':' + JSON.stringify(c.payload.gate))));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'session filter checks passed.'));
process.exit(fail ? 1 : 0);
