// excboost-check.js - exceptions as ranking evidence (v3.45.0). An exception both sides hold raises a candidate the text
// already matched: x1.3 for the same stack, x1.15 for the same crash site, the % capped at 99, and the row says why.
// Similar defects (on a bug report) are raised by the exceptions in the report's own log; Matching bug reports (on a
// defect) by the defect's exceptions found in each candidate report's cached log reading, which JiTA.logread reads
// ahead for every open report. Evals the real JiTA.rank boost path, JiTA.repexc, JiTA.logread, the logsig 'holding' and
// 'sigsOf' lookups (tab and worker, which must agree), the log scan's exception list, triage's ranking and the row badge.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');

let fail = 0;
// Straight to stdout: the reader's tests silence console.log, which it logs through.
const ok = (n, c, x) => { process.stdout.write((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || '')) + '\n'); if (!c) fail++; };
function once(head, from) {
    const s = src.indexOf(head, from || 0);
    if (s < 0 || (from == null && src.indexOf(head, s + 1) >= 0)) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return s;
}
const member = (head, from) => { const s = once(head, from); return src.slice(s, src.indexOf('\n    },', s) + 7); };
const line = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n', s) + 1); };
const cut = (head, end) => { const s = once(head); return src.slice(s, src.indexOf(end, s) + end.length); };
const tick = () => new Promise((r) => setImmediate(r));
const flush = async (n) => { for (let i = 0; i < (n || 20); i++) { await tick(); } };

// ---- a small fake jQuery, enough for the row badge ----
function El(html) {
    const m = /class="([^"]*)"/.exec(html || '');
    const e = { html: html, cls: m ? m[1].split(/\s+/).filter(Boolean) : [], _text: '', attrs: {}, kids: [], parent: null };
    e.addClass = (c) => { String(c || '').split(/\s+/).filter(Boolean).forEach((x) => { if (e.cls.indexOf(x) < 0) { e.cls.push(x); } }); return e; };
    e.text = (t) => { if (t === undefined) { return e._text; } e._text = String(t); return e; };
    e.attr = (k, v) => { if (v === undefined) { return e.attrs[k]; } e.attrs[k] = v; return e; };
    e.on = () => e;
    e.appendTo = (p) => { e.parent = p; p.kids.push(e); return e; };
    return e;
}
global.$ = (h) => El(h);

let flags = { similarDefects: true, defectProfile: true };
global.flagOn = (n) => !!flags[n];
global.JITA_NO_JIRA_UI = false;
let gm = {};
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? gm[k] : d);

let renders = 0;
global.JiTA = {
    TOP_N: 3, HOST: 'https://jira', EBR_SCOPE: 'project = EBR AND statusCategory != Done', PAGE_SIZE: 100, GM_TEAM_ID: 'abc-38',
    worker: { _started: true, usable: () => true },
    embed: { WARM_WAIT_MS: 5000 },
    rank: { CAND: 50, RRF_K: 60 },
    util: {}, logsig: {}, db: {}, sync: {}, profile: { CACHE_PREFIX: 'rp:', V: 3 },
    ui: { currentKey: null, scheduleRender: () => { renders++; }, _isReportsKey: (k) => /^(EDR|EO|PLAT)-/.test(k), _logExc: {} },
    trend: { badge: () => null },
    excfind: { WAIT_MS: 0, SCOPE: 'project = EBR AND statusCategory != Done AND <not the launcher\'s>' }   // the real one: excfind-check
};
Object.assign(JiTA.util, eval('({' + member('    isResolved: function (status, resolution) {') + member('    staleFactor: function (brCreatedIso, resolutionDateIso) {') +
    member('    humanizeAge: function (days) {') + member('    isClosedStatus: function (status) {') + member('    teamId: function (v) {') +
    member('    isGmTeam: function (v) {') + member('    jqlSince: function (iso, now) {') + '})'));
JiTA.util.fmtDate = (s) => (s ? String(s).slice(0, 10) : '');
let delays = [];
JiTA.util.delay = (ms) => { delays.push(ms); return Promise.resolve(); };
Object.assign(JiTA.logsig, eval('({' + line('    MIN_FRAMES: ') + line('    CRASH_FRAMES: ') + line('    TRACE: ') + line('    isTrace: function (sig) {') + line('    isCut: function (sig) {') +
    line('    _traceKey: function (sig) {') + member('    _crashOf: function (sig) {') + member('    _traceMates: function (idx, sig) {') +
    member('    holding: function (sigs) {') + member('    _holdingLocal: function (sigs) {') + member('    sigsOf: function (key) {') + member('    _sigsOfLocal: function (key) {') + '})'));
Object.assign(JiTA.profile, eval('({' + line('    LOG_V: ') + member('    _usable: function (rec) {') + member('    _logFiles: function (att) {') + '})'));
// What counts (JiTA.excnoise), the real one over the GM and meta stubs (excnoise-check.js covers it).
Object.assign(JiTA.logsig, eval('({' + line('    isUserError: function (sig) {') + line('    _msgKey: function (sig) {') + '})'));
Object.assign(JiTA.util, eval('({' + member('    hash: function (str) {') + '})'));
(0, eval)(cut('JiTA.excnoise = {', '\n};\n'));
['_boostMap', '_boostRow', '_withBoost', '_fuse', '_hybridResults', '_pickMode', 'suggestBest', 'suggestEbrBest'].forEach((n) => {
    (0, eval)(cut('JiTA.rank.' + n + ' = function (', '\n};\n'));
});
(0, eval)(cut('JiTA.repexc = {', '\n    _noop: null\n};\n'));
(0, eval)(cut('JiTA.logread = {', '\n    _noop: null\n};\n'));
const R = JiTA.repexc, LR = JiTA.logread, RK = JiTA.rank;

// Signatures as _fingerprint writes them: "<message>|file:func>...>file:func", innermost last. B2 differs from B only in
// its outer frame, so the two share a crash site (the message and the innermost two frames) but not a stack.
const A = "attributeerror: 'nonetype' object has no attribute 'typeid'|tooltips.py:loadtooltip>baseinfo.py:gettypeid";
const B = 'keyerror: #|slots.py:ondropdata>slots.py:load>slots.py:get';
const B2 = 'keyerror: #|fitting.py:ondrag>slots.py:load>slots.py:get';
const C = 'runtimeerror: dictionary changed size during iteration|sessions.py:tick>sessions.py:prune';
const crash = (s) => JiTA.logsig._crashOf(s);

(async () => {
    // ================= the boost on a row =================
    let r = { key: 'EDR-1', score: 10, rrf: 0.02, pct: 70 };
    RK._boostRow(r, 'exact');
    ok('the same stack raises score, RRF and % by 1.3', Math.abs(r.score - 13) < 1e-9 && Math.abs(r.rrf - 0.026) < 1e-9 && r.pct === 91 && r.excHit === 'exact', JSON.stringify(r));
    r = { key: 'EDR-1', score: 10, rrf: 0.02, pct: 70 };
    RK._boostRow(r, 'site');
    ok('the same crash site raises them by 1.15', Math.abs(r.score - 11.5) < 1e-9 && r.pct === 81 && r.excHit === 'site', JSON.stringify(r));
    r = { key: 'EDR-1', pct: 90 };
    RK._boostRow(r, 'exact');
    ok('...and the % never reaches 100', r.pct === 99, JSON.stringify(r));
    r = { key: 'EDR-1', score: 10, pct: 70 };
    RK._boostRow(r, 'nonsense');
    ok('an unknown kind raises nothing and marks nothing', r.score === 10 && r.pct === 70 && !r.excHit, JSON.stringify(r));
    r = { key: 'EDR-1', score: 10 };
    RK._boostRow(r, 'exact');
    ok('a row with no % yet (the keyword path) gets none', r.pct === undefined && Math.abs(r.score - 13) < 1e-9, JSON.stringify(r));

    const dem = (x) => { x.demoted = true; };
    ok('a map that boosts nothing leaves the demotion as it is', RK._withBoost(dem, {}) === dem && RK._withBoost(dem, null) === dem && RK._withBoost(null, {}) === null);
    r = { key: 'EDR-2', score: 10, pct: 50 };
    RK._withBoost(dem, { 'EDR-2': 'exact' })(r);
    ok('otherwise it demotes, then boosts', r.demoted === true && r.excHit === 'exact' && r.pct === 65, JSON.stringify(r));
    r = { key: 'EDR-3', score: 10, pct: 50 };
    RK._withBoost(null, { 'EDR-2': 'exact' })(r);
    ok('...a row the map does not name is left alone', !r.excHit && r.pct === 50, JSON.stringify(r));

    ok('no boost asked: no map', (await RK._boostMap(null, [{ key: 'a' }])) === null);
    let asked = null;
    let m = await RK._boostMap((keys) => { asked = keys; return { a: 'exact' }; }, [{ key: 'a' }, { key: 'b' }, { key: 'a' }, null]);
    ok('the boost is asked once per candidate, and may answer at once', JSON.stringify(asked) === '["a","b"]' && m.a === 'exact', JSON.stringify(asked));
    m = await RK._boostMap(() => Promise.reject(new Error('down')), [{ key: 'a' }]);
    ok('a boost that fails boosts nothing, and the ranking goes on', m && !Object.keys(m).length);
    m = await RK._boostMap(() => null, [{ key: 'a' }]);
    ok('...as does one that answers nothing', m && !Object.keys(m).length);
    m = await RK._boostMap(() => { throw new Error('bug'); }, [{ key: 'a' }]);
    ok('...or one that throws', m && !Object.keys(m).length);

    // ================= Similar defects: the keyword path =================
    let pulled = null;
    const KW = [{ key: 'EDR-1', score: 10 }, { key: 'EDR-2', score: 9 }, { key: 'EDR-3', score: 8 }, { key: 'EDR-4', score: 7.8 }, { key: 'EDR-5', score: 1 }];
    JiTA.rank.suggest = (text, key, limit) => { pulled = limit; return Promise.resolve(KW.map((x) => Object.assign({}, x))); };
    let out = await RK.suggestBest('t', 'EBR-1', null, 'Keyword', [], null, () => ({ 'EDR-4': 'exact', 'EDR-9': 'exact' }));
    let keys = out.results.map((x) => x.key);
    ok('a boosted defect moves up into the cut', keys.join() === 'EDR-4,EDR-1,EDR-2' && pulled === 50, keys.join() + ' / pulled ' + pulled);
    ok('...ranks first at 100% (the % is top-relative in Keyword), and its row says why',
        out.results[0].pct === 100 && out.results[0].excHit === 'exact' && out.results[1].pct === 99 && !out.results[1].excHit, JSON.stringify(out.results));
    ok('...a defect the text did not find is not added', keys.indexOf('EDR-9') < 0);
    out = await RK.suggestBest('t', 'EBR-1', null, 'Keyword', []);
    ok('no boost: the order the text gave', out.results.map((x) => x.key).join() === 'EDR-1,EDR-2,EDR-3');
    KW[3].status = 'Closed'; KW[3].resolution = 'Fixed'; KW[3].resolutiondate = '2024-01-01';
    out = await RK.suggestBest('t', 'EBR-1', '2026-10-01', 'Keyword', [], null, () => ({ 'EDR-4': 'exact' }));
    const d4 = out.results.filter((x) => x.key === 'EDR-4')[0];
    ok('a long-fixed defect is demoted as before, and the boost comes on top', !d4 && out.results.map((x) => x.key).join() === 'EDR-1,EDR-2,EDR-3',
        out.results.map((x) => x.key + ':' + Math.round(x.score * 100) / 100).join());
    delete KW[3].status; delete KW[3].resolution; delete KW[3].resolutiondate;

    // ================= Similar defects: the hybrid path =================
    JiTA.rank._gateScored = (c) => c;
    let SEM = [{ key: 'EDR-1', score: 0.80 }, { key: 'EDR-2', score: 0.78 }, { key: 'EDR-3', score: 0.77 }, { key: 'EDR-4', score: 0.70 }];
    JiTA.rank._workerSemantic = () => Promise.resolve(SEM.map((x) => Object.assign({}, x)));
    JiTA.rank.suggest = () => Promise.resolve([{ key: 'EDR-1', score: 5 }, { key: 'EDR-2', score: 4 }, { key: 'EDR-3', score: 3 }, { key: 'EDR-4', score: 2 }, { key: 'EDR-6', score: 1 }]);
    let boostKeys = null;
    out = await RK.suggestBest('t', 'EBR-1', null, 'Hybrid', [], null, (ks) => { boostKeys = ks; return { 'EDR-4': 'exact', 'EDR-7': 'exact' }; });
    keys = out.results.map((x) => x.key);
    ok('Hybrid: the boost is asked about every fused candidate, keyword-only ones included', out.mode === 'Hybrid' && boostKeys && boostKeys.join() === 'EDR-1,EDR-2,EDR-3,EDR-4,EDR-6', boostKeys && boostKeys.join());
    ok('...a boosted defect makes the cut, with its cosine % raised', keys.indexOf('EDR-4') >= 0 && out.results.filter((x) => x.key === 'EDR-4')[0].pct === 91 && keys.indexOf('EDR-3') < 0,
        JSON.stringify(out.results));
    ok('...and the list still reads high to low', out.results[0].key === 'EDR-4' && out.results[0].pct >= out.results[1].pct, keys.join());
    ok('...nothing the text did not find joins it', keys.indexOf('EDR-7') < 0);
    out = await RK.suggestBest('t', 'EBR-1', null, 'Hybrid', [], null, () => Promise.reject(new Error('x')));
    ok('...and a failed boost ranks as if there were none', out.mode === 'Hybrid' && out.results.map((x) => x.key).join() === 'EDR-1,EDR-2,EDR-3', out.results.map((x) => x.key).join());

    // ================= Matching bug reports =================
    pulled = null;
    const EK = [{ key: 'EBR-1', score: 10 }, { key: 'EBR-2', score: 9 }, { key: 'EBR-3', score: 8 }, { key: 'EBR-4', score: 7.9 }];
    JiTA.rank.suggestEbr = (text, key, limit) => { pulled = limit; return Promise.resolve(EK.map((x) => Object.assign({}, x, { pct: 1 }))); };
    out = await RK.suggestEbrBest('t', 'EDR-1', 'Keyword', [], null, () => ({ 'EBR-4': 'site' }));
    keys = out.results.map((x) => x.key);
    // EBR-4: 7.9 x 1.15 = 9.085, past EBR-2's 9 and EBR-3's 8.
    ok('Keyword: a wider pull than the cut, so a raised report can move into it', pulled === 50 && keys.join() === 'EBR-1,EBR-4,EBR-2' && out.results.length === 3, keys.join() + ' / ' + pulled);
    ok('...its % top-relative over the cut, and its row says why', out.results[0].pct === 100 && out.results[1].excHit === 'site' && out.results[1].pct === 91 && out.results[2].pct === 90, JSON.stringify(out.results));
    out = await RK.suggestEbrBest('t', 'EDR-1', 'Keyword', []);
    ok('...no boost: the text\'s order, cut to TOP_N', out.results.map((x) => x.key).join() === 'EBR-1,EBR-2,EBR-3' && out.results[2].pct === 80, JSON.stringify(out.results));
    SEM = [{ key: 'EBR-1', score: 0.8 }, { key: 'EBR-2', score: 0.79 }, { key: 'EBR-3', score: 0.78 }, { key: 'EBR-4', score: 0.6 }];
    JiTA.rank.suggestEbr = () => Promise.resolve([{ key: 'EBR-1', score: 3 }, { key: 'EBR-2', score: 2 }, { key: 'EBR-3', score: 1 }, { key: 'EBR-4', score: 0.5 }]);
    out = await RK.suggestEbrBest('t', 'EDR-1', 'Hybrid', [], null, () => ({ 'EBR-4': 'exact' }));
    ok('Hybrid: the boost reaches the reports too', out.results.map((x) => x.key).indexOf('EBR-4') >= 0 && out.results.filter((x) => x.key === 'EBR-4')[0].excHit === 'exact', JSON.stringify(out.results));

    // ================= logsig: which defects hold an exception (tab and worker) =================
    const IDX = {
        sigMap: { [A]: { members: [{ key: 'EDR-1' }, { key: 'EDR-2' }] }, [B]: { members: [{ key: 'EDR-3' }] } },
        crashMap: { [crash(B)]: { members: [{ key: 'EDR-3' }, { key: 'EDR-4' }] }, [crash(A)]: { members: [{ key: 'EDR-1' }] } },
        keyToSigs: { 'EDR-3': [B] }, keyToCrash: { 'EDR-3': [crash(B)] }
    };
    JiTA.logsig.ensure = () => Promise.resolve(IDX);
    let viaWorker = 0;
    JiTA.worker.call = (type, p) => { viaWorker++; return Promise.reject(new Error('old worker')); };
    let h = await JiTA.logsig.holding([A, B2]);
    ok('every defect with the same stack is exact, not just the newest', h['EDR-1'] === 'exact' && h['EDR-2'] === 'exact', JSON.stringify(h));
    ok('...one with only the crash site is site, and exact wins over site', h['EDR-3'] === 'site' && h['EDR-4'] === 'site' && Object.keys(h).length === 4, JSON.stringify(h));
    ok('...asked of the worker first, and answered here when it cannot', viaWorker === 1);
    h = await JiTA.logsig.holding([C]);
    ok('an exception no defect holds raises nothing', !Object.keys(h).length);
    const so = await JiTA.logsig.sigsOf('EDR-3');
    ok('a defect\'s own exceptions: its stacks and its crash sites', so.sigs.join() === B && so.crashes.join() === crash(B), JSON.stringify(so));
    const none = await JiTA.logsig.sigsOf('EDR-9');
    ok('...none for a defect with no pasted exception', none.sigs.length === 0 && none.crashes.length === 0);
    // The worker's twins, from jitaWorkerBody itself: same index, same answers.
    const wfn = (name) => { const s = once('    function ' + name + '('); return src.slice(s, src.indexOf('\n    }\n', s) + 7); };
    const LGT = line('    var LG_TRACE = ');   // the worker's stacktrace tag, and the helpers lgHolding reads it with (lgIsTrace to lgMates)
    const W = new Function('idx', 'var logsigCache = idx, LG_MIN = 2, LG_CRASH = 2;\n' + LGT + wfn('lgCrashOf') + wfn('lgIsTrace') + wfn('lgHolding') + wfn('lgSigsOf') +
        '\nreturn { lgHolding: lgHolding, lgSigsOf: lgSigsOf };')(IDX);
    ok('the worker\'s holding agrees with the tab\'s', JSON.stringify(W.lgHolding([A, B2])) === JSON.stringify(await JiTA.logsig._holdingLocal([A, B2])), JSON.stringify(W.lgHolding([A, B2])));
    ok('...and its sigsOf too', JSON.stringify(W.lgSigsOf('EDR-3')) === JSON.stringify(await JiTA.logsig._sigsOfLocal('EDR-3')) && W.lgSigsOf('EDR-9').sigs.length === 0);
    const W0 = new Function('idx', 'var logsigCache = idx, LG_MIN = 2, LG_CRASH = 2;\n' + LGT + wfn('lgCrashOf') + wfn('lgIsTrace') + wfn('lgHolding') + wfn('lgSigsOf') +
        '\nreturn { lgHolding: lgHolding, lgSigsOf: lgSigsOf };')(null);
    ok('...a worker with no index yet answers nothing rather than throwing', !Object.keys(W0.lgHolding([A])).length && W0.lgSigsOf('EDR-3').sigs.length === 0);
    const opSrc = src.slice(once("            else if (type === 'logsig') {"), once("            else if (type === 'embedPass') {"));
    ok('the worker answers both ops', /op === 'holding'\) \{ result = lgHolding\(payload\.sigs\); \}/.test(opSrc) && /op === 'sigsOf'\) \{ result = lgSigsOf\(payload\.key\); \}/.test(opSrc));
    let wcall = null;
    JiTA.worker.call = (type, p) => { wcall = [type, p]; return Promise.resolve({ 'EDR-1': 'exact' }); };
    h = await JiTA.logsig.holding([A]);
    ok('with a worker that knows the op, it answers', wcall[0] === 'logsig' && wcall[1].op === 'holding' && wcall[1].sigs[0] === A && h['EDR-1'] === 'exact', JSON.stringify(wcall));

    // ================= repexc: a report's own exceptions =================
    let meta = {}, reads = 0;
    JiTA.db.getMeta = (k) => { reads++; return Promise.resolve(meta[k] || null); };
    meta['rp:EBR-1'] = { v: 3, logs: true, exc: [{ sig: A }, { sig: C }] };
    meta['rp:EBR-2'] = { v: 3, logs: false, exc: [] };
    meta['rp:EBR-3'] = { v: 2, logs: true, exc: [{ sig: A }] };
    meta['rp:EBR-4'] = { v: 3, logs: true, hasLog: false, exc: [] };
    ok('a reading whose logs were read gives their exceptions', JSON.stringify(await R._reading('EBR-1')) === JSON.stringify([A, C]));
    ok('...one made without its logs counts as not read', (await R._reading('EBR-2')) === null);
    ok('...so does one from an older reader', (await R._reading('EBR-3')) === null);
    ok('...and a report with no reading', (await R._reading('EBR-9')) === null);
    ok('...a read report with no exceptions has none, which is not the same', JSON.stringify(await R._reading('EBR-4')) === '[]');
    reads = 0;
    await R._reading('EBR-1'); await R._reading('EBR-1');
    ok('a reading is looked up once', reads === 0);
    R.forget('EBR-1');
    await R._reading('EBR-1');
    ok('...until the reader writes a new one', reads === 1);

    let scans = 0;
    JiTA.ui.scanIssueLog = (k) => { scans++; JiTA.ui._logExc[k] = [{ sig: B2 }]; return Promise.resolve({}); };
    ok('a report read ahead is not scanned', JSON.stringify(await R._reportSigs('EBR-1')) === JSON.stringify([A, C]) && scans === 0);
    ok('...one that is not is scanned, as the panel scans it', JSON.stringify(await R._reportSigs('EBR-9')) === JSON.stringify([B2]) && scans === 1);
    JiTA.ui.scanIssueLog = (k) => { scans++; return Promise.resolve({}); };
    delete JiTA.ui._logExc['EBR-8'];
    ok('...a scan that read nothing gives nothing', JSON.stringify(await R._reportSigs('EBR-8')) === '[]');

    // forReport: the defects holding an exception of this report's log.
    let held = [];
    JiTA.logsig.holding = (sigs) => { held.push(sigs.join('+')); return Promise.resolve({ 'EDR-1': 'exact' }); };
    m = await R.forReport('EBR-1');
    ok('a report\'s boost: the defects that hold one of its exceptions', m['EDR-1'] === 'exact' && held[0] === A + '+' + C, JSON.stringify(held));
    await R.forReport('EBR-1');
    ok('...worked out once per report', held.length === 1);
    m = await R.forReport('EBR-4');
    ok('...a log with no exceptions asks nothing', !Object.keys(m).length && held.length === 1);
    JiTA.logsig.holding = () => Promise.reject(new Error('x'));
    meta['rp:EBR-5'] = { v: 3, logs: true, exc: [{ sig: B }] };
    m = await R.forReport('EBR-5');
    ok('...a lookup that fails boosts nothing', m && !Object.keys(m).length);
    JiTA.logsig.holding = () => Promise.resolve({ 'EDR-3': 'site' });
    m = await R.forReport('EBR-5');
    ok('...and is tried again next time', m['EDR-3'] === 'site', JSON.stringify(m));
    R.reset();
    JiTA.logsig.holding = () => Promise.resolve({ 'EDR-7': 'exact' });
    m = await R.forReport('EBR-5');
    ok('a defect sync starts the reports\' boosts over', m['EDR-7'] === 'exact');

    // soon: the list waits a moment for a report's exceptions, and is ranked again when they come late.
    R.WAIT_MS = 30;
    let late = 0;
    let f = await R.soon(Promise.resolve({ 'EDR-1': 'exact' }), () => { late++; });
    ok('known in time: the boost', typeof f === 'function' && f()['EDR-1'] === 'exact' && late === 0);
    f = await R.soon(Promise.resolve({}), () => { late++; });
    ok('...that boosts nothing: none', f === null && late === 0);
    let release;
    f = await R.soon(new Promise((res) => { release = res; }), () => { late++; });
    ok('not known in time: drawn without it', f === null && late === 0);
    release({ 'EDR-1': 'exact' }); await flush();
    ok('...and ranked again when it comes', late === 1);
    f = await R.soon(new Promise((res) => { release = res; }), () => { late++; });
    release({}); await flush();
    ok('...unless it boosts nothing', late === 1);
    f = await R.soon(Promise.reject(new Error('x')), () => { late++; });
    ok('a lookup that fails: none, nothing later', f === null && late === 1);

    // ================= repexc: a defect's exceptions against its candidate reports =================
    JiTA.profile._last = { 'EDR-3': { summary: { excGroups: [{ paths: [{ sig: C, count: 3 }, { sig: A, count: 1 }] }] } } };
    JiTA.logsig.sigsOf = (k) => Promise.resolve(k === 'EDR-3' ? { sigs: [B], crashes: [crash(B)] } : { sigs: [], crashes: [] });
    let ds = await R._defectSigs('EDR-3');
    ok('a defect\'s exceptions: its description\'s and those 2+ of its reports\' logs share', ds.sigs[B] && ds.sigs[C] && !ds.sigs[A] && ds.n === 2, JSON.stringify(ds));
    ok('...with the crash site of each', ds.crashes[crash(B)] && ds.crashes[crash(C)]);
    ok('...and it remembers which profile exceptions it used', R._usedProf['EDR-3'] === C);
    flags.defectProfile = false;
    ds = await R._defectSigs('EDR-3');
    ok('with the profile switched off, the description only', ds.n === 1 && !ds.sigs[C] && R._usedProf['EDR-3'] === '', JSON.stringify(ds));
    flags.defectProfile = true;
    ds = await R._defectSigs('EDR-3');
    ok('the same stack is exact', R._kind([C, A], ds) === 'exact' && R._kind([B], ds) === 'exact');
    ok('...the same crash site only is site', R._kind([B2], ds) === 'site');
    ok('...neither is nothing', R._kind([A], ds) === null && R._kind([], ds) === null && R._kind(null, ds) === null);

    meta['rp:EBR-11'] = { v: 3, logs: true, exc: [{ sig: B2 }] };
    meta['rp:EBR-12'] = { v: 3, logs: true, exc: [{ sig: C }] };
    meta['rp:EBR-13'] = { v: 3, logs: true, exc: [{ sig: A }] };
    reads = 0;
    m = await R.forDefect('EDR-3')(['EBR-11', 'EBR-12', 'EBR-13', 'EBR-14']);
    ok('a defect\'s boost: each candidate whose log holds one of its exceptions', m['EBR-11'] === 'site' && m['EBR-12'] === 'exact' && !m['EBR-13'] && !m['EBR-14'], JSON.stringify(m));
    ok('...read from the cached readings', reads === 4);
    reads = 0;
    JiTA.profile._last = {};
    m = await R.forDefect('EDR-9')(['EBR-15', 'EBR-16']);   // not read yet, so a lookup would show
    ok('a defect with no exceptions raises nothing, and reads nothing', !Object.keys(m).length && reads === 0);

    // profileReady: a finished profile ranks the list again only when its shared exceptions changed it.
    R._usedProf = {};
    renders = 0;
    JiTA.ui.currentKey = 'EDR-3';
    JiTA.profile._last = { 'EDR-3': { summary: { excGroups: [{ paths: [{ sig: C, count: 2 }] }] } } };
    R.profileReady('EDR-3');
    ok('a profile done before any ranking ranks nothing again', renders === 0);
    R._usedProf['EDR-3'] = '';
    R.profileReady('EDR-3');
    ok('one whose shared exceptions the list did not have ranks it again', renders === 1);
    R._usedProf['EDR-3'] = C;
    R.profileReady('EDR-3');
    ok('...one it already had does not', renders === 1);
    R._usedProf['EDR-3'] = '';
    JiTA.ui.currentKey = 'EDR-4';
    R.profileReady('EDR-3');
    ok('...nor one for a defect no longer on screen', renders === 1);

    const bx = R.badge('exact', '<div class="jita-sd-exc"></div>'), bs = R.badge('site', '<span class="jt-mexc"></span>');
    ok('the badge says why', bx.text() === 'same exception in log' && bx.cls.indexOf('exact') >= 0 && /same stack/.test(bx.attr('title')) && /ranks higher/.test(bx.attr('title')), bx.text());
    ok('...for the crash site too', bs.text() === '~ same crash site in log' && bs.cls.indexOf('site') >= 0 && /same crash site/.test(bs.attr('title')), bs.text());
    const sx = R.badge('st-exact', '<span></span>'), ss = R.badge('st-site', '<span></span>'), sm = R.badge('st-msg', '<span></span>');
    ok('a stacktrace\'s badge says it is one: the same stack, styled as an exact match', sx.text() === 'same stacktrace in log' && sx.cls.indexOf('exact') >= 0 &&
        /holds a stacktrace with the same stack/.test(sx.attr('title')) && /ranks higher/.test(sx.attr('title')), sx.text() + ' / ' + sx.attr('title'));
    ok('...the same site, and the same message where one was cut off, as loose ones', ss.text() === '~ same trace site in log' && ss.cls.indexOf('site') >= 0 &&
        sm.text() === '~ same stacktrace message in log' && sm.cls.indexOf('site') >= 0 && /cut one of the two off before its stack/.test(sm.attr('title')), ss.text() + ' / ' + sm.text());

    // ================= the row =================
    JiTA.ui._showTip = () => {}; JiTA.ui._hideTip = () => {};
    Object.assign(JiTA.ui, eval('({' + member('    _row: function (r, target, action, opts) {') + '})'));
    let row = JiTA.ui._row({ key: 'EDR-1', pct: 91, excHit: 'exact', status: 'Open' }, '_self', () => El('<span>'));
    let exc = row.kids.filter((k) => k.cls.indexOf('jita-sd-exc') >= 0);
    ok('a boosted row carries the badge', exc.length === 1 && exc[0].text() === 'same exception in log', row.kids.map((k) => k.html).join(' '));
    row = JiTA.ui._row({ key: 'EDR-2', pct: 60, status: 'Open' }, '_self', () => El('<span>'));
    ok('...a plain one does not', !row.kids.some((k) => k.cls.indexOf('jita-sd-exc') >= 0));
    const css = src.slice(once("    css: '\\\n#jita-sd-panel"), once('    injectCss: function () {'));
    ok('the badge is styled in the panel and in the sidebar', /\.jita-sd-exc \{/.test(css) && /#jita-side-group \.jita-sd-exc \{/.test(css) && /\.jita-sd-exc\.site \{/.test(css));

    // ================= the panel and triage are wired to it =================
    const uiStart = once('\nJiTA.ui = {');
    const render = member('    render: function (key, background) {', uiStart), reports = member('    renderReports: function (key, background) {', uiStart);
    const append = member('    _appendNextReport: function (defectKey, shown) {', uiStart), similar = member('    renderSimilarReports: function (key, background) {', uiStart);
    ok('Similar defects waits a moment for the report\'s exceptions, and is drawn again when they come late',
        /JiTA\.repexc\.soon\(JiTA\.repexc\.forReport\(key\), late\)/.test(render) && /var late = function \(\) \{ if \(!stale\(\)\) \{ JiTA\.ui\.scheduleRender\(\); \} \};/.test(render) &&
        /JiTA\.rank\.suggestBest\(text, key, brCreated, JiTA\.ui\.modeOverride, terms, undefined, got\[1\]\)/.test(render));
    ok('Matching bug reports are raised by the defect\'s exceptions', /JiTA\.rank\.suggestEbrBest\(text, key, JiTA\.ui\.modeOverride, terms, undefined, JiTA\.repexc\.forDefect\(key\)\)/.test(reports));
    ok('...and so is the report slid in after an attach', /suggestEbrBest\(text, defectKey, JiTA\.ui\.modeOverride, terms, undefined, JiTA\.repexc\.forDefect\(defectKey\)\)/.test(append));
    ok('Similar open reports are not (report to report is not asked for)', !/repexc/.test(similar));
    const scan = member('    _scanIssueLog: function (key) {', uiStart);
    ok('the log scan keeps the exceptions it read', /JiTA\.ui\._logExc\[key\] = exc;\n\s*resolve\(merged\);/.test(scan) && /keepExc\(txt\);\n\s*JiTA\.logsig\.matchText/.test(scan) &&
        /if \(!logs\.length\) \{ JiTA\.ui\._logExc\[key\] = \[\]; resolve\(\{\}\); return; \}/.test(scan));
    // ...run: two logs, each fingerprinted, every exception kept once.
    const scanFn = eval('({' + member('    _scanIssueLog: function (key) {', uiStart) + '})')._scanIssueLog;
    const ui0 = JiTA.ui, lp0 = JiTA.profile.logExceptions, mt0 = JiTA.logsig.matchText, log1 = console.log;
    console.log = () => {};
    let atts = [{ filename: 'logs.txt', content: 'u1' }, { filename: 'old_logs.txt', content: 'u2' }, { filename: 'pic.png', content: 'u3' }];
    global.$.ajax = () => { const d = { done: (fn) => { setImmediate(() => fn({ fields: { attachment: atts } })); return d; }, fail: () => d }; return d; };
    JiTA.ui = { _logExc: {}, _fetchText: (u) => Promise.resolve(u === 'u1' ? 'one' : 'two') };
    JiTA.logsig.matchText = () => Promise.resolve({});
    JiTA.profile.logExceptions = (t) => (t === 'one' ? [{ sig: A, msg: 'a' }, { sig: B, msg: 'b' }] : [{ sig: B, msg: 'b' }, { sig: C, msg: 'c' }]);
    await scanFn('EBR-31');
    ok('a scan keeps each exception of the report\'s logs once', (JiTA.ui._logExc['EBR-31'] || []).map((e) => e.sig).join() === [A, B, C].join(), JSON.stringify(JiTA.ui._logExc['EBR-31']));
    atts = [];
    await scanFn('EBR-32');
    ok('...a report with no log has none', JSON.stringify(JiTA.ui._logExc['EBR-32']) === '[]');
    atts = [{ filename: 'logs.txt', content: 'u1' }];
    JiTA.profile.logExceptions = () => { throw new Error('bad block'); };
    const done32 = await Promise.race([scanFn('EBR-33').then(() => 'done'), new Promise((r) => setTimeout(() => r('hung'), 500))]);
    ok('...and one the fingerprinting throws on still finishes the scan', done32 === 'done' && JSON.stringify(JiTA.ui._logExc['EBR-33']) === '[]', done32);
    JiTA.ui = ui0; JiTA.profile.logExceptions = lp0; JiTA.logsig.matchText = mt0; console.log = log1;
    const readFiles = member('    _readFiles: function (issue, rec, zip) {');
    ok('a new reading drops the ranking\'s copy once it is stored', /var stored = function \(\) \{ JiTA\.repexc\.forget\(issue\.key\); return rec; \};/.test(readFiles) && /\.then\(stored, stored\)/.test(readFiles));
    const section = member('    renderSection: function (key, background) {');
    ok('a finished profile tells the boost', /if \(s\.done\) \{ JiTA\.repexc\.profileReady\(key\); \}/.test(section));

    // triage: its _resolve, run against stubbed rankers.
    const tStart = once('\nJiTA.triage = {');
    const resolve = eval('({' + member('    _resolve: function (item) {', tStart) + '})')._resolve;
    let calls = [], soonCalls = 0;
    const T = { _mode: 'ebr', _view: () => null, _cache: {}, _open: true, _queue: [{ key: 'EBR-7' }], _idx: 0, _render() {} };
    const saved = { db: JiTA.db, ui: JiTA.ui, rank: JiTA.rank, repexc: JiTA.repexc, triage: JiTA.triage };
    JiTA.triage = T;
    JiTA.db = { getDefect: () => Promise.resolve({ key: 'EBR-7', created: '2026-10-01' }) };
    JiTA.util.effectiveText = () => 'text';
    JiTA.ui = { _filterTerms: () => [], modeOverride: null };
    JiTA.rank = {
        suggestBest: function () { calls.push(['best', Array.prototype.slice.call(arguments)]); return Promise.resolve({ mode: 'Keyword', results: [] }); },
        suggestEbrBest: function () { calls.push(['ebr', Array.prototype.slice.call(arguments)]); return Promise.resolve({ mode: 'Keyword', results: [] }); }
    };
    const BOOST = () => ({}), DEFB = () => ({});
    JiTA.repexc = { soon: (p, onLate) => { soonCalls++; T._late = onLate; return Promise.resolve(BOOST); }, forReport: () => Promise.resolve({}), forDefect: (k) => { DEFB.key = k; return DEFB; } };
    await resolve.call(T, { key: 'EBR-7' });
    ok('triage, bug-report queue: the report\'s exceptions boost its defect matches', calls[0][0] === 'best' && calls[0][1][6] === BOOST && soonCalls === 1, JSON.stringify(calls[0][1].map((x) => typeof x)));
    ok('...and a late answer ranks it again, as a late Hybrid one does', T._late === calls[0][1][5]);
    calls = []; T._cache = {}; T._mode = 'defect';
    await resolve.call(T, { key: 'EDR-7' });
    ok('...defect queue: the defect\'s exceptions boost its report matches', calls[0][0] === 'ebr' && calls[0][1][5] === DEFB && DEFB.key === 'EDR-7');
    calls = []; T._cache = {}; T._mode = 'ebr'; T._view = () => 'simreports';
    await resolve.call(T, { key: 'EBR-7' });
    ok('...similar open reports: none', calls[0][0] === 'ebr' && calls[0][1].length === 5);
    Object.assign(JiTA, saved);
    const trow = src.slice(once("                    if (meta) { $('<span class=\"jt-mmeta\"></span>').text(meta).appendTo($li); }"), once('                    // Feature C hover preview, same as the panel rows:'));
    ok('triage rows carry the badge', /if \(r\.excHit\) \{ JiTA\.repexc\.badge\(r\.excHit, '<span class="jt-mexc"><\/span>'\)\.appendTo\(\$li\); \}/.test(trow));
    ok('...styled', /'\.jita-triage-view \.jt-mexc \{/.test(src) && /'\.jita-triage-view \.jt-mexc\.site \{/.test(src));

    // ================= the background reading of the open reports' logs =================
    ok('the reader is switched on by default', LR.on() === true);
    gm.jitaLogRead = false;
    ok('...and off by its own switch', LR.on() === false);
    delete gm.jitaLogRead;
    let pages, posted, readsDone, lockFree = true, stamped, lockAsks = 0;
    // Node has a navigator.locks of its own, and a plain assignment to navigator is ignored.
    Object.defineProperty(global, 'navigator', { configurable: true, writable: true,
        value: { locks: { request: (name, opts, fn) => { lockAsks++; return Promise.resolve(fn(lockFree ? { name: name } : null)); } } } });
    JiTA.sync._apiPost = (path, body) => { posted.push(body); const p = pages.shift(); return p instanceof Error ? Promise.reject(p) : Promise.resolve({ data: p }); };
    JiTA.db.setMeta = (k, v) => { stamped[k] = v; return Promise.resolve(); };
    let readScript, items = {};
    JiTA.excfind._read = (item) => { readsDone.push(item.key); items[item.key] = item; const s = readScript[item.key] || 'download'; return s === 'fail' ? Promise.reject(new Error('x'))
        : Promise.resolve({ rec: { logs: s !== 'nolog' }, cached: s === 'cached' }); };
    const iss = (key, extra) => ({ key: key, fields: Object.assign({ status: { name: 'Open' }, labels: ['Russian'], attachment: [{ filename: 'logs.txt', size: 9, content: 'u', id: 1 }] }, extra || {}) });
    function setup() { posted = []; readsDone = []; stamped = {}; readScript = {}; meta = {}; renders = 0; delays = []; }
    const gaps = () => delays.filter((ms) => ms === LR.GAP_MS).length;
    const log0 = console.log;
    console.log = () => {};

    setup();
    pages = [{ issues: [iss('EBR-1'), iss('EBR-2', { status: { name: 'Attached' } }), iss('EBR-3', { customfield_10001: 'abc-38' })], nextPageToken: 't1' }, { issues: [iss('EBR-4')], isLast: true }];
    readScript = { 'EBR-4': 'cached' };
    JiTA.ui = saved.ui; JiTA.ui.currentKey = 'EDR-5';
    let n = await LR.prepare();
    ok('the first pass lists every report the exception search looks in (not the launcher\'s), newest first', posted.length === 2 && posted[0].jql === JiTA.excfind.SCOPE + ' ORDER BY created DESC' && posted[1].nextPageToken === 't1', JSON.stringify(posted.map((p) => p.jql)));
    ok('...asks for what the reader needs', JSON.stringify(posted[0].fields) === JSON.stringify(['status', 'labels', 'attachment', 'customfield_10001']));
    ok('...reads the open ones, not a closed status nor the GM team\'s', readsDone.join() === 'EBR-1,EBR-4', readsDone.join());
    ok('...hands the reader each one\'s labels and attachments', JSON.stringify(items['EBR-1'].fields) === JSON.stringify({ labels: ['Russian'], attachment: [{ filename: 'logs.txt', size: 9, content: 'u' }] }),
        JSON.stringify(items['EBR-1']));
    ok('...counts what it downloaded, not what was cached', n === 1, String(n));
    ok('...and spaces out the downloads only', gaps() === 1, delays.join());
    const marked = (m) => !!m && typeof m.at === 'string' && !isNaN(Date.parse(m.at)) && m.lv === JiTA.profile.LOG_V;
    ok('...and, having read them all, marks when it began, and how it read logs', marked(stamped.logreadAt), JSON.stringify(stamped));
    ok('...a defect on screen ranks its reports again', renders === 1);

    setup();
    meta.logreadAt = { at: new Date(Date.now() - 3600e3).toISOString(), lv: JiTA.profile.LOG_V };
    meta.excFreq = { at: Date.now() - 3600e3, n: 0, c: {} };   // the common ones counted an hour ago: no recount (excnoise-check.js)
    pages = [{ issues: [iss('EBR-9')], isLast: true }];
    readScript = { 'EBR-9': 'cached' };
    JiTA.ui.currentKey = 'EDR-5';
    n = await LR.prepare();
    ok('a later pass lists only the reports updated since the last complete one', posted[0].jql.indexOf(JiTA.excfind.SCOPE + ' AND updated >= "') === 0 &&
        /updated >= "-6\dm" ORDER BY created DESC$/.test(posted[0].jql), posted[0].jql);
    ok('...and with nothing downloaded, ranks nothing again', n === 0 && renders === 0);
    // A mark from a pass that read logs another way: every report again, so their logs are read with stacktraces.
    for (const old of [new Date(Date.now() - 3600e3).toISOString(), { at: new Date(Date.now() - 3600e3).toISOString(), lv: JiTA.profile.LOG_V - 1 }]) {
        setup();
        meta.logreadAt = old;
        meta.excFreq = { at: Date.now() - 3600e3, n: 0, c: {} };   // fresh: only the mark decides here
        pages = [{ issues: [iss('EBR-9')], isLast: true }];
        readScript = { 'EBR-9': 'cached' };
        await LR.prepare();
        ok('a pass after one by an older reader (' + (typeof old === 'string' ? 'its mark a bare date' : 'lv ' + old.lv) + ') lists every report again, and marks it anew',
            posted[0].jql === JiTA.excfind.SCOPE + ' ORDER BY created DESC' && marked(stamped.logreadAt), posted[0].jql);
    }

    setup();
    JiTA.ui.currentKey = 'EDR-5';
    pages = [{ issues: [iss('EBR-1', { attachment: [] }), iss('EBR-2', { attachment: [{ filename: 'screenshot.png', size: 9, content: 'u', id: 2 }] })], isLast: true }];
    n = await LR.prepare();
    ok('a report with no log file attached is read, but nothing was downloaded: no count, no wait', readsDone.slice().sort().join() === 'EBR-1,EBR-2' && n === 0 && gaps() === 0,
        n + ' / ' + delays.join());
    ok('...so nothing ranks again, and the pass still counts as complete', renders === 0 && marked(stamped.logreadAt), JSON.stringify(stamped));

    setup();
    pages = [{ issues: [iss('EBR-1'), iss('EBR-2')], isLast: true }];
    readScript = { 'EBR-1': 'fail', 'EBR-2': 'download' };
    n = await LR.prepare();
    ok('a report that could not be read: the others still are', readsDone.join() === 'EBR-1,EBR-2' && n === 1);
    ok('...but the mark stays, so it is listed again next time', !stamped.logreadAt, JSON.stringify(stamped));
    setup();
    pages = [{ issues: [iss('EBR-1')], isLast: true }];
    readScript = { 'EBR-1': 'nolog' };
    await LR.prepare();
    ok('...nor does one whose log did not download', !stamped.logreadAt);
    setup();
    pages = [{ issues: [iss('EBR-1')], nextPageToken: 't' }, new Error('HTTP 502')];
    await LR.prepare();
    ok('a listing that fails part way reads what it listed, and leaves the mark', readsDone.join() === 'EBR-1' && !stamped.logreadAt, readsDone.join());
    setup();
    pages = [{ issues: [iss('EBR-1')], nextPageToken: 'same' }, { issues: [iss('EBR-2')], nextPageToken: 'same' }];
    await LR.prepare();
    ok('a page token that does not move on ends the listing', posted.length === 2 && readsDone.join() === 'EBR-1,EBR-2', posted.length + ' pages');

    setup();
    pages = [{ issues: [iss('EBR-1'), iss('EBR-2'), iss('EBR-3'), iss('EBR-4')], isLast: true }];
    JiTA.excfind._read = (item) => { readsDone.push(item.key); gm.jitaLogRead = false; return Promise.resolve({ rec: { logs: true }, cached: false }); };
    await LR.prepare();
    ok('switched off during a pass, it stops before the next download', readsDone.length >= 1 && readsDone.length <= LR.CONCURRENCY && !stamped.logreadAt, readsDone.join());
    delete gm.jitaLogRead;
    JiTA.excfind._read = (item) => { readsDone.push(item.key); return Promise.resolve({ rec: { logs: true }, cached: false }); };

    setup();
    JiTA.ui.currentKey = 'EBR-5';
    pages = [{ issues: [iss('EBR-1')], isLast: true }];
    await LR.prepare();
    ok('...on a bug report, a pass that read something redraws nothing', renders === 0);

    setup();
    lockFree = false;
    pages = [{ issues: [iss('EBR-1')], isLast: true }];
    await LR.prepare();
    ok("another tab reading them: this one does not", posted.length === 0, JSON.stringify(posted) + " " + typeof global.navigator.locks.request);
    lockFree = true;
    setup();
    let gate;
    pages = [{ issues: [iss('EBR-1')], isLast: true }];
    JiTA.excfind._read = (item) => new Promise((res) => { gate = () => res({ rec: { logs: true }, cached: false }); });
    const p1 = LR.prepare(), p2 = LR.prepare();
    await flush();
    ok('one pass at a time in a tab', p1 === p2 && posted.length === 1);
    gate(); await p1;
    setup();
    gm.jitaLogRead = false;
    lockAsks = 0; reads = 0;
    await LR.prepare();
    ok('switched off, no pass: not even the lock is asked for', posted.length === 0 && lockAsks === 0 && reads === 0, lockAsks + ' lock, ' + reads + ' meta');
    delete gm.jitaLogRead;
    flags.similarDefects = false;
    await LR.prepare();
    ok('...nor with the Triage Assistant off', posted.length === 0 && lockAsks === 0);
    flags.similarDefects = true;
    console.log = log0;

    const boot = src.slice(once('// ---- Jira boot:'));
    ok('a page load starts a pass, after the page has settled', /setTimeout\(function \(\) \{ try \{ JiTA\.logread\.prepare\(\); \} catch \(e\) \{ \/\* swallow \*\/ \} \}, JiTA\.logread\.START_MS\);/.test(boot) && LR.START_MS >= 30000);
    const menu = member('    render: function () {', once('\nJiTA.menu = {'));
    ok('Settings switches it, under the Triage Assistant', /Read open reports\\' logs/.test(menu) && /gmSet\(JiTA\.logread\.KEY, !JiTA\.logread\.on\(\)\);/.test(menu) &&
        menu.indexOf("Read open reports\\' logs") > menu.indexOf("var $ta = $('<div class=\"jita-menu-sect\"></div>');") && menu.indexOf("Read open reports\\' logs") < menu.indexOf("pane('triage').append($ta);"));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'exception boost checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
