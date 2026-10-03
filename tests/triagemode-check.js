// triagemode-check.js - Triage mode fixes (v3.38.27). Evals the real JiTA.triage literal against a catch-all jQuery
// stub and runs the real _render, _armAttach, _fetchQueue, _trySeekResume, _exec, _resolve and the after-action paths:
//  - a digit attaches only from the list on screen (two quick presses while ranking was pending attached blind)
//  - a resume never re-renders under an armed action / the G picker / the viewer / a translation, and the position
//    is not overwritten while a resume is still looking for its target
//  - a queue that stopped short (a failed page, the QUEUE_MAX cap) says so on the counter and in a message
//  - a report attached from the defect queue leaves the parked bug-report queue too
//  - a refused Won't Do says why; an old ranking failure never drops a newer ranking
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s0 = src.indexOf('JiTA.triage = {'), e0 = src.indexOf('\n};', s0) + 3;
const d0 = src.indexOf('JiTA.dv = {');
if (s0 < 0 || d0 < 0) { throw new Error('could not slice JiTA.triage / JiTA.dv'); }
const errText = (() => { const s = src.indexOf('    _errText: function (xhr) {', d0); return src.slice(s, src.indexOf('\n    },', s) + 7); })();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

// a jQuery stand-in that swallows everything _render does to the page
const chain = new Proxy(function () {}, { get: (t, p) => (p === 'length' ? 1 : p === 'then' ? undefined : (p === Symbol.toPrimitive ? () => '' : chain)), apply: () => chain });
global.$ = () => chain;
let progressEl = { textContent: '' };
global.document = { getElementById: (id) => (id === 'jt-progress' ? progressEl : null) };
let msgs = [];
global.JiTA = {
    ui: { _hideTip() {}, _filterTerms: () => [], _filtersActive: () => false },
    util: { fmtDate: () => '', isClosedStatus: () => false, effectiveText: () => 'text' },
    db: { getDefect: () => Promise.resolve(null), deleteDefects: () => Promise.resolve() },
    sync: { _ebrRemoved() {} },
    trend: { MIN: 3, WINDOW_DAYS: 14, badge: () => null },
    dv: {}
};
eval(src.slice(s0, e0));
Object.assign(JiTA.dv, eval('({' + errText + '})'));
const T = JiTA.triage;
let remembered = [];
Object.assign(T, {
    _setMsg: (m) => { msgs.push(m); }, _syncActiveRow() {}, _renderAtt() {}, _renderRail() {}, _prefetch() {},
    _rememberPos: (it) => { remembered.push(it.key); }, _removeRow() {}, _renderList() {}, _appendRows() {},
    _mapAtt: () => [], _mapDet: () => ({}), _queueJql: () => 'project = EBR', order: () => 'oldest'
});

(async () => {
    // ================= a digit attaches only from the list on screen =================
    T._open = true; T._queue = [{ key: 'EBR-1' }]; T._idx = 0; T._mode = 'ebr';
    const rank = deferred();
    T._resolve = () => rank.promise;
    T._cache = { 'EBR-1': rank.promise };
    T._render();
    ok('while a report is still ranking no list counts as shown', T._shownKey === null, String(T._shownKey));
    let armed = [];
    const realArm = T._arm;
    T._arm = (a) => { armed.push(a); };
    msgs = [];
    T._armAttach(1, '1'); T._armAttach(1, '1');
    rank.resolve({ rec: {}, mode: 'Hybrid', results: [{ key: 'EDR-9', pct: 80 }], view: null });
    await flush();
    ok('two quick presses while it ranks arm nothing', armed.length === 0 && msgs.filter((m) => /Still ranking/.test(m)).length === 2, armed.length + ' armed / ' + msgs.join(' | '));
    ok('once the ranking lands its list counts as shown', T._shownKey === 'EBR-1', String(T._shownKey));
    T._armAttach(1, '1');
    await flush();
    ok('...and a press then arms the attach (control)', armed.length === 1 && armed[0].matchKey === 'EDR-9', JSON.stringify(armed));
    const rerank = deferred();   // a filter change: the same report is ranked again
    T._resolve = () => rerank.promise;
    T._cache = { 'EBR-1': rerank.promise };
    T._render();
    armed = []; msgs = [];
    T._armAttach(1, '1');
    await flush();
    ok('the same report ranked again shows no list until the new one lands', armed.length === 0 && msgs.some((m) => /Still ranking/.test(m)), armed.length + ' armed');
    rerank.resolve({ rec: {}, mode: 'Hybrid', results: [{ key: 'EDR-9', pct: 80 }], view: null });
    await flush();
    T._arm = realArm;

    // ================= resume =================
    remembered = [];
    T._resume = { key: 'EBR-50', created: '2026-01-01' };
    T._render();
    ok('a render while a resume is still looking for its report does not overwrite the saved position', remembered.length === 0, remembered.join());
    T._resume = null;
    T._render();
    ok('...one without a pending resume does (control)', remembered.join() === 'EBR-1', remembered.join());
    let renders = 0;
    const realRender = T._render;
    T._render = () => { renders++; };
    T._queue = [{ key: 'EBR-1', created: '2026-01-02' }, { key: 'EBR-50', created: '2026-01-01' }];
    for (const busy of [{ _armed: { type: 'attach' } }, { _gmPick: true }, { _viewerNode: {} }, { _txShown: true }]) {
        Object.assign(T, { _armed: null, _gmPick: false, _viewerNode: null, _txShown: false }, busy);
        T._resume = { key: 'EBR-50', created: '2026-01-01' };
        renders = 0;
        const moved = T._trySeekResume();
        ok('a deep page landing while ' + Object.keys(busy)[0] + ' is on does not jump, and the resume is dropped', moved === false && renders === 0 && T._resume === null && T._idx === 0, moved + ' / ' + renders);
    }
    Object.assign(T, { _armed: null, _gmPick: false, _viewerNode: null, _txShown: false });
    T._resume = { key: 'EBR-50', created: '2026-01-01' };
    ok('...with nothing going on it seeks as before (control)', T._trySeekResume() === true && T._idx === 1 && renders === 1);
    T._render = realRender;

    // ================= a queue that stopped short =================
    T._trySeekResume = () => false;
    T._render = () => {};
    let pages = [];
    JiTA.sync._apiPost = () => { const p = pages.shift(); return p instanceof Error ? Promise.reject(p) : Promise.resolve({ data: p }); };
    const issue = (k) => ({ key: k, fields: { summary: k } });
    pages = [{ issues: [issue('EBR-1'), issue('EBR-2')], nextPageToken: 't2' }, new Error('Jira API failed: HTTP 502')];
    msgs = [];
    await T._fetchQueue();
    await flush();
    T._idx = 0; T._queueProgress();
    ok('a later page that fails marks the queue partial and says so', T._queuePartial === true && msgs.some((m) => /Only part of the queue is loaded: a later page failed/.test(m)), msgs.join(' | '));
    ok('...and the counter does not read like a complete queue', progressEl.textContent === '1 / 2 (partial)', progressEl.textContent);
    const realMax = T.QUEUE_MAX;
    T.QUEUE_MAX = 2;
    pages = [{ issues: [issue('EBR-1'), issue('EBR-2')], nextPageToken: 't2' }];
    msgs = [];
    await T._fetchQueue();
    await flush();
    T._queueProgress();
    ok('hitting the queue cap says so too', T._queuePartial === true && msgs.some((m) => /capped at 2/.test(m)) && progressEl.textContent === '1 / 2 (partial)', msgs.join(' | ') + ' / ' + progressEl.textContent);
    T.QUEUE_MAX = realMax;
    pages = [{ issues: [issue('EBR-1')], isLast: true }];
    await T._fetchQueue();
    await flush();
    T._queueProgress();
    ok('a complete queue reads as one (control)', T._queuePartial === false && progressEl.textContent === '1 / 1', progressEl.textContent);

    // ================= the parked queue =================
    T._mode = 'defect'; T._queue = [{ key: 'EDR-1' }]; T._idx = 0; T._done = 0;
    T._stash = { ebr: { queue: [{ key: 'EBR-1' }, { key: 'EBR-2' }, { key: 'EBR-3' }], idx: 2, done: true } };
    await T._afterAttachReport('EDR-1', 'EBR-2', 'Attached');
    ok('a report attached from the defect queue leaves the parked bug-report queue', T._stash.ebr.queue.map((q) => q.key).join() === 'EBR-1,EBR-3' && T._stash.ebr.idx === 1,
        T._stash.ebr.queue.map((q) => q.key).join() + ' @' + T._stash.ebr.idx);
    ok('...counted once', T._done === 1, String(T._done));
    T._mode = 'ebr'; T._queue = [{ key: 'EBR-7' }, { key: 'EBR-8' }]; T._idx = 0; T._stash = { defect: { queue: [{ key: 'EDR-1' }], idx: 0 } };
    await T._afterAction('EBR-7', 'Closed');
    ok('an action on this queue still takes the report out of it (control)', T._queue.map((q) => q.key).join() === 'EBR-8' && T._stash.defect.queue.length === 1);

    // ================= a refused Won't Do =================
    T._busy = false; T._queue = [{ key: 'EBR-8' }]; T._idx = 0; msgs = [];
    T._verifyActionable = () => Promise.resolve({ ok: true });
    global.jitaCloseAsWontDo = () => {
        const jq = { done() { return jq; }, fail(fn) { setImmediate(() => fn({ status: 400, responseJSON: { errorMessages: ['Resolution is required.'] } })); return jq; } };
        return jq;
    };
    T._exec('trash', { label: 'Trash' });
    await flush();
    ok('a Won\'t Do that Jira refuses says why', msgs.some((m) => m === 'Failed: could not close it - Resolution is required.') && T._busy === false, msgs.join(' | '));

    // ================= an old failure and a newer ranking =================
    const realResolve = eval('({' + (() => { const s = src.indexOf('    _resolve: function (item) {', s0); return src.slice(s, src.indexOf('\n    },', s) + 7); })() + '})')._resolve;
    T._resolve = realResolve;
    T._mode = 'ebr'; T._view = () => 'defects';
    const fetchD = deferred();
    JiTA.db.getDefect = () => fetchD.promise;
    T._cache = {};
    const first = T._resolve({ key: 'EBR-8' });
    T._cache = { 'EBR-8': 'newer ranking' };   // a filter change replaced the cache, and the report is ranked again
    fetchD.reject(new Error('IDB gone'));
    await first.catch(() => {});
    await flush();
    ok('an old ranking that fails does not drop the newer one of the same report', T._cache['EBR-8'] === 'newer ranking', String(T._cache['EBR-8']));

    // ================= the viewer's parse timer =================
    const viewer = src.slice(src.indexOf('    _openViewer: function', s0), src.indexOf('    _closeViewer: function', s0));
    ok('a parse timer of a viewer that was replaced does nothing', /setTimeout\(function \(\) \{\s*\n\s*if \(T\._viewerNode !== v\) \{ return; \}[^\n]*\n\s*try \{ ParseLogs\(\); \}/.test(viewer));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Triage mode checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
