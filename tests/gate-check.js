// gate-check.js - the session filters reach the shared worker's ranking BEFORE its top-N cut (v3.38.13). The worker
// returned its top 100-200 candidates and the tab dropped those failing Status / Created within afterwards, so with a
// strict filter the panel said nothing matched while real matches sat just below the cut. Evals the real passesGate and
// bm25Score (jitaShared), the worker body's cosineTopN / rankKeyword and the tab's _gateSpec / _workerKeyword /
// _workerSemantic / passesFilter.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const S = require('./source');
const SH = S.shared(src), BODY = S.fn(src, 'jitaWorkerBody');
global.JITA_SH = SH;   // the page's run of it, which passesFilter asks
function member(head) {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 50)); }
    return src.slice(s, src.indexOf('\n    },', s) + 7);
}

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- the worker's scorers: its semantic cut, and its keyword request over a keyword index it holds ----
const RK = BODY.indexOf('\n    async function rankKeyword(') + 1;   // async: S.fn finds plain declarations only
if (RK < 1) { throw new Error('could not slice worker rankKeyword'); }
const WK = new Function('SH', 'var kwCache = null; function ensureIndexes() { return Promise.resolve(); }\n' + S.fn(src, 'cosineTopN', BODY) + '\n' + S.block(BODY, RK) +
    '\nreturn { cosineTopN: cosineTopN, rankKeyword: rankKeyword, hold: function (k) { kwCache = { defects: k, ebr: k }; } };')(SH);
const W = { passesGate: SH.passesGate, cosineTopN: WK.cosineTopN };
(async () => {
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
WK.hold(kw);
let bm = (await WK.rankKeyword({ text: 'warp', scope: 'defects', topN: 200 })).results;
ok('(without a gate the keyword top 200 holds no open defect either)', bm.length === 200 && openKeys(bm) === 0, openKeys(bm));
bm = (await WK.rankKeyword({ text: 'warp', scope: 'defects', topN: 200, gate: OPEN })).results;
ok('with Status open, the keyword ranking returns them too', bm.length === 50 && openKeys(bm) === 50, bm.length + ' ' + openKeys(bm));
bm = (await WK.rankKeyword({ text: 'warp', scope: 'ebr', topN: 200, gate: { status: 'all', createdDays: 14, now: NOW + 30 * DAY } })).results;
ok('...and Created within as well', bm.length === 0, bm.length);
ok('the worker hands the gate a ranking call carries to its semantic scorer',
    src.indexOf('cosineTopN(q, entries, payload.topN || 10, payload.excludeKey, payload.filterTerms, payload.gate)') >= 0);

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

// ---- a reopened defect that kept its resolution: open, as its card shows it ----
const UI = eval(S.members(src, 'JiTA.ui', ['PROGRESS_RE', 'STATUS_CAT', '_statusCat', 'passesFilter']));
const CATS = UI.STATUS_CAT, gated = (g) => Object.assign({ cats: CATS }, g);
const reopened = { project: 'EDR', key: 'EDR-42', status: 'Open', resolution: 'Fixed' }, shut = { project: 'EDR', key: 'EDR-43', status: 'Closed', resolution: 'Fixed' };
ok('the worker, told the statuses\' categories, keeps a reopened defect that kept its resolution under Status open',
    W.passesGate(reopened, gated(OPEN)) && !W.passesGate(reopened, gated(FIXED)));
ok('...still drops a closed one there and keeps it under Status fixed', !W.passesGate(shut, gated(OPEN)) && W.passesGate(shut, gated(FIXED)));
ok('...a status it does not list goes by the older rule (status name or resolution)',
    !W.passesGate({ project: 'EDR', status: 'Won\'t Do', resolution: 'Won\'t Do' }, gated(OPEN)) && W.passesGate({ project: 'EDR', status: 'Triage' }, gated(OPEN)) &&
    !W.passesGate({ project: 'EDR', status: 'Triage', resolution: 'Duplicate' }, gated(OPEN)));
ok('...as statuses are written in Jira (case and spaces)', W.passesGate({ project: 'EDR', status: ' OPEN ', resolution: 'Fixed' }, gated(OPEN)));
JiTA.util = eval('({' + member('    isResolved: function (status, resolution) {') + '\n' + S.member(src, 'JiTA.util', 'isClosedStatus') + '\n})');
Object.assign(JiTA.ui, UI);
JiTA.ui.filters = { status: 'open', createdDays: 0 };
ok('the tab\'s own filter keeps the reopened defect under Open', JiTA.ui.passesFilter(reopened) && !JiTA.ui.passesFilter(shut));
JiTA.ui.filters = { status: 'fixed', createdDays: 0 };
ok('...and leaves it out under Fixed, where its card showed an open dot', !JiTA.ui.passesFilter(reopened) && JiTA.ui.passesFilter(shut));
ok('the tab sends the worker those categories with the gate', JiTA.ui._gateSpec().cats === JiTA.ui.STATUS_CAT);
// the tab's filter judges as its cards do: for every status a defect can carry, passesFilter agrees with _statusCat
const STATUSES = Object.keys(CATS).concat(['Triage', 'Won\'t Do', 'Fixing', 'Resolved', '', ' Closed ']);
let disagree = [];
['open', 'fixed'].forEach((st) => {
    JiTA.ui.filters = { status: st, createdDays: 0 };
    STATUSES.forEach((s) => [null, 'Fixed'].forEach((res) => {
        const d = { project: 'EDR', key: 'EDR-9', status: s, resolution: res }, done = JiTA.ui._statusCat(d) === 'done';
        if (JiTA.ui.passesFilter(d) !== (st === 'open' ? !done : done)) { disagree.push(st + ':' + s + '/' + res); }
    }));
});
ok('the tab\'s filter judges every status as the card\'s dot does', !disagree.length, disagree.join(' '));
JiTA.ui.filters = { status: 'all', createdDays: 0 };
ok('no filter set lets everything through', JiTA.ui.passesFilter({ project: 'EDR', status: 'Closed', resolution: 'Fixed' }));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'session filter checks passed.'));
process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
