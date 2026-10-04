// livestatus-check.js - a bug report attached or closed directly in Jira leaves the open-report lists at once (v3.40.2).
// The lists of open reports (a defect's Matching bug reports, a report's Similar open reports) come from the local copy,
// which hears of such a report only at the next sync, up to 30 minutes later. Evals the real JiTA.ui._liveStatus /
// _checkReportRows / _takeOffList / _collapseRow, the Attach refusal in _attachReportButton, JiTA.sync._ebrRemoved and
// the triage drop (_verifyActionable / _dropClosed) against stubs.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const member = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 50)); }
    return src.slice(s, src.indexOf('\n    },', s) + 7);
};
const line = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 50)); }
    return src.slice(s, src.indexOf('\n', s) + 1);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

// ---- the list on screen, a jQuery stand-in, Jira ----
let rows = [], ajaxScript = {}, ajaxCalls = [], posts = [], postAnswer = null;
const row = (key) => ({ key, getAttribute: (n) => (n === 'data-jita-key' ? key : null) });
function El() {
    const e = { classes: {}, txt: '', attrs: {}, handlers: {} };
    const j = {
        el: e,
        on: (ev, f) => { (e.handlers[ev] = e.handlers[ev] || []).push(f); return j; },
        off: (ev) => { e.handlers[ev] = []; return j; },
        addClass: (c) => { c.split(' ').forEach((x) => { e.classes[x] = true; }); return j; },
        removeClass: (c) => { c.split(' ').forEach((x) => { delete e.classes[x]; }); return j; },
        hasClass: (c) => !!e.classes[c],
        text: (v) => { if (v === undefined) { return e.txt; } e.txt = v; return j; },
        attr: (k, v) => { e.attrs[k] = v; return j; },
        closest: () => j, remove: () => j
    };
    return j;
}
global.$ = (x) => {
    if (x === '#jita-sd-list') { return { children: () => ({ each: (fn) => rows.slice().forEach((r) => fn.call(r)) }) }; }
    if (typeof x === 'string' && x.charAt(0) === '<') { return El(); }
    return x;
};
$.ajax = (o) => {
    ajaxCalls.push(o.url);
    const k = (/issue\/([A-Z]+-\d+)\?/.exec(o.url) || [])[1];
    const r = ajaxScript[k] || { ok: true, data: {} };
    const d = { done(f) { if (r.ok) { setImmediate(() => f(r.data)); } return d; }, fail(f) { if (!r.ok) { setImmediate(() => f(r.xhr)); } return d; } };
    return d;
};
let toasts = [], deleted = [], removed = [], renders = 0, collapsed = [], removedD = null, deleteFails = {};
global.gmSet = () => {};
global.confirm = () => true;
global.JiTA = { HOST: 'https://jira', sched: { tabId: 't1' }, rank: {}, link: {}, ui: {}, db: {}, sync: {}, util: {}, triage: {} };
Object.assign(JiTA.util, eval('({' + member('    isClosedStatus: function (status) {') + '})'));
JiTA.sync._apiPost = (path, body) => { posts.push(body); return postAnswer(body); };
JiTA.db.deleteDefects = (keys) => { deleted.push(keys.join()); return keys.some((k) => deleteFails[k]) ? Promise.reject(new Error('QuotaExceededError')) : Promise.resolve(); };
JiTA.sync._ebrRemoved = (keys) => { removed.push(keys.join()); return removedD ? removedD.promise : Promise.resolve(); };
Object.assign(JiTA.ui, eval('({' + line('    OPEN_OK_MS: ') + line('    _openSeen: {},') + line('    _liveGone: {},') + line('    _isOpenStatus: function (s) {') +
    member('    _liveStatus: function (keys) {') + member('    _checkReportRows: function (still) {') + member('    _takeOffList: function (keys, still) {') +
    member('    _collapseRow: function (el, done) {') + '})'));
const realLive = JiTA.ui._liveStatus, realCollapse = JiTA.ui._collapseRow;
JiTA.ui.scheduleRender = () => { renders++; };
let clock = 1000000;
Date.now = () => clock;

(async () => {
    // ================= the status lookup =================
    postAnswer = () => Promise.resolve({ data: { issues: [
        { key: 'EBR-1', fields: { status: { name: 'Open' } } }, { key: 'EBR-2', fields: { status: { name: 'Attached' } } }] } });
    let st = await JiTA.ui._liveStatus(['EBR-1', 'EBR-2', 'EBR-3']);
    ok('one search asks Jira for every row at once', posts.length === 1 && posts[0].jql === 'key in (EBR-1, EBR-2, EBR-3)' && posts[0].maxResults === 3 &&
        posts[0].fields.join() === 'status', JSON.stringify(posts));
    ok('...each report gets its status', st['EBR-1'] === 'Open' && st['EBR-2'] === 'Attached', JSON.stringify(st));
    ok('...and one missing from the answer is no longer a report there', st['EBR-3'] === '', JSON.stringify(st));

    posts = []; ajaxCalls = [];
    postAnswer = () => Promise.reject(Object.assign(new Error('Jira API failed: HTTP 400'), { status: 400 }));
    ajaxScript = {
        'EBR-1': { ok: true, data: { key: 'EBR-1', fields: { status: { name: 'Open' } } } },
        'EBR-2': { ok: false, xhr: { status: 404 } },
        'EBR-3': { ok: false, xhr: { status: 403 } },
        'EBR-4': { ok: true, data: { key: 'EDR-9', fields: { status: { name: 'Open' } } } }
    };
    st = await JiTA.ui._liveStatus(['EBR-1', 'EBR-2', 'EBR-3', 'EBR-4']);
    ok('a search Jira refuses (a key it no longer has) asks each report on its own', ajaxCalls.length === 4 && ajaxCalls.every((u) => /fields=status$/.test(u)), ajaxCalls.join());
    ok('...an open one is open', st['EBR-1'] === 'Open', JSON.stringify(st));
    ok('...one that is not found (404) is gone', st['EBR-2'] === '', JSON.stringify(st));
    ok('...one that could not be read (403) is not checked, so it is never taken off', !('EBR-3' in st), JSON.stringify(st));
    ok('...and one moved to another key is no longer an open report', st['EBR-4'] === '', JSON.stringify(st));

    ajaxCalls = [];
    postAnswer = () => Promise.reject(Object.assign(new Error('Jira API failed: HTTP 503'), { status: 503 }));
    st = await JiTA.ui._liveStatus(['EBR-1', 'EBR-2']);
    ok('a search that fails otherwise checks nothing: every row stays', Object.keys(st).length === 0 && ajaxCalls.length === 0, JSON.stringify(st) + ' ' + ajaxCalls.join());
    posts = [];
    st = await JiTA.ui._liveStatus([]);
    ok('no rows, no request', posts.length === 0 && Object.keys(st).length === 0);

    // ================= the rows on screen =================
    let asked = [], answer = {};
    JiTA.ui._liveStatus = (keys) => { asked.push(keys.join()); const o = {}; keys.forEach((k) => { if (k in answer) { o[k] = answer[k]; } }); return Promise.resolve(o); };
    JiTA.ui._collapseRow = (el) => { collapsed.push(el.key); };
    rows = [row('EBR-1'), row('EBR-2'), row('EDR-5'), row('EBR-3')];
    answer = { 'EBR-1': 'Open', 'EBR-2': 'Attached' };   // EBR-3 could not be checked
    removedD = deferred();
    let still = true, gone = null;
    const p = JiTA.ui._checkReportRows(() => still).then((g) => { gone = g; });
    await flush();
    ok('only the bug reports on screen are asked about', asked.join('|') === 'EBR-1,EBR-2,EBR-3', asked.join('|'));
    ok('a report attached in Jira itself leaves the list', collapsed.join() === 'EBR-2', collapsed.join());
    ok('...and the local copy, with every tab told', deleted.join('|') === 'EBR-2' && removed.join('|') === 'EBR-2', deleted.join('|') + ' / ' + removed.join('|'));
    ok('...the list is not drawn again before the shared worker has dropped it', renders === 0, renders);
    removedD.resolve(); removedD = null;
    await p;
    ok('...then it is, so the next match takes its place', renders === 1 && gone.join() === 'EBR-2', renders + ' ' + gone);
    ok('a report that could not be checked stays where it is', collapsed.indexOf('EBR-3') < 0 && deleted.join().indexOf('EBR-3') < 0);

    asked = []; collapsed = []; deleted = []; removed = []; renders = 0;
    rows = [row('EBR-1'), row('EBR-3'), row('EBR-4')];
    answer = { 'EBR-3': 'Open', 'EBR-4': 'Open' };
    clock += 30 * 1000;
    await JiTA.ui._checkReportRows(() => true);
    ok('a report seen open in the last minute is not asked about again (the filter box redraws on every pause)', asked.join('|') === 'EBR-3,EBR-4', asked.join('|'));
    clock += 61 * 1000;
    asked = [];
    answer = { 'EBR-1': 'Open', 'EBR-3': 'Open', 'EBR-4': 'Open' };
    await JiTA.ui._checkReportRows(() => true);
    ok('...after a minute it is', asked.join('|') === 'EBR-1,EBR-3,EBR-4', asked.join('|'));
    ok('open reports are left alone', collapsed.length === 0 && deleted.length === 0 && renders === 0);

    asked = []; collapsed = []; deleted = []; removed = []; renders = 0;
    rows = [row('EBR-6')];
    answer = { 'EBR-6': 'Closed' };
    await JiTA.ui._checkReportRows(() => false);
    ok('when the list on screen is no longer the one checked, no row is touched and nothing is redrawn', collapsed.length === 0 && renders === 0, collapsed.join() + ' ' + renders);
    ok('...but the closed report still leaves the local copy', deleted.join('|') === 'EBR-6' && removed.join('|') === 'EBR-6', deleted.join('|'));

    collapsed = []; deleted = []; removed = []; renders = 0;
    rows = [row('EBR-2')];
    answer = { 'EBR-2': 'Attached' };
    await JiTA.ui._checkReportRows(() => true);
    ok('a report already taken off that comes back (its delete failed) is only hidden again', collapsed.join() === 'EBR-2' && deleted.length === 0 && renders === 0,
        collapsed.join() + ' / ' + deleted.join('|') + ' / ' + renders);

    collapsed = []; deleted = []; removed = []; renders = 0;
    rows = [row('EBR-7')];
    answer = { 'EBR-7': 'Done' };
    deleteFails['EBR-7'] = true;
    await JiTA.ui._checkReportRows(() => true);
    ok('a delete that fails tells no tab, but the list is still drawn again', removed.length === 0 && renders === 1 && collapsed.join() === 'EBR-7', removed.join() + ' ' + renders);
    renders = 0; deleted = [];
    await JiTA.ui._checkReportRows(() => true);
    ok('...and when it comes back, it is hidden without another delete or redraw, so nothing loops', deleted.length === 0 && renders === 0, deleted.join() + ' ' + renders);

    // ================= the collapse =================
    let doneRan = 0, gonePlain = [];
    const el = { offsetHeight: 40, style: {}, parentNode: { removeChild: (e) => { gonePlain.push(e); } } };
    realCollapse(el, () => { doneRan++; });
    ok('a collapsing row fades out', el.style.opacity === '0' && el.style.maxHeight === '0px', JSON.stringify(el.style));
    await new Promise((r) => setTimeout(r, 360));
    ok('...then leaves the page and runs what comes next', gonePlain[0] === el && doneRan === 1, gonePlain.length + ' ' + doneRan);
    realCollapse(null, () => { doneRan++; });
    ok('with no row, what comes next runs at once', doneRan === 2);

    // ================= Attach =================
    JiTA.ui._liveStatus = realLive;
    JiTA.ui._collapseRow = (e) => { collapsed.push(e.key); };
    Object.assign(JiTA.ui, eval('({' + line('    _assigneeCache: {},') + member('    _getAssignee: function (key) {') + member('    _attachReportButton: function (reportKey) {') + '})'));
    let attaches = [];
    Object.assign(JiTA.ui, { currentKey: 'EDR-1', toast: (m) => { toasts.push(m); }, _hideTip() {}, _fadeOutAndReplace() {} });
    JiTA.link.currentUser = () => Promise.resolve('me');
    JiTA.link.attachDuplicate = (a, b) => { attaches.push(a + '->' + b); return Promise.resolve({ attached: true, linked: true }); };
    const tap = (b) => (b.el.handlers.click || []).forEach((f) => f.call(b, { preventDefault() {}, stopPropagation() {} }));
    ajaxScript = { 'EBR-9': { ok: true, data: { fields: { assignee: null } } } };
    postAnswer = () => Promise.resolve({ data: { issues: [{ key: 'EBR-9', fields: { status: { name: 'Attached' } } }] } });
    rows = [row('EBR-9')]; collapsed = []; deleted = []; removed = []; renders = 0; toasts = [];
    let b = JiTA.ui._attachReportButton('EBR-9');
    await flush();
    ok('the gate offers Attach on an unassigned report (control)', b.text() === 'Attach', b.text());
    tap(b);
    await flush();
    ok('a report already attached in Jira is not attached again', attaches.length === 0, attaches.join());
    ok('...the button and a toast say why', b.text() === 'Attached' && toasts.some((m) => /EBR-9 is already Attached in Jira - not attached/.test(m)), b.text() + ' / ' + toasts.join(' | '));
    ok('...and it leaves the list and the local copy', collapsed.join() === 'EBR-9' && deleted.join('|') === 'EBR-9' && renders === 1, collapsed.join() + ' / ' + deleted.join('|') + ' / ' + renders);

    postAnswer = () => Promise.resolve({ data: { issues: [{ key: 'EBR-8', fields: { status: { name: 'Open' } } }] } });
    ajaxScript = { 'EBR-8': { ok: true, data: { fields: { assignee: null } } } };
    b = JiTA.ui._attachReportButton('EBR-8');
    await flush();
    tap(b);
    await flush();
    ok('an open report is attached as before (control)', attaches.join() === 'EBR-8->EDR-1', attaches.join());

    // ================= the shared worker hears first =================
    let inv = deferred(), resolvedAt = null;
    Object.assign(JiTA.sync, eval('({' + member('    _ebrRemoved: function (keys, fromRemote) {') + '})'));
    JiTA.sync._invalidateWorker = () => inv.promise;
    JiTA.sync._ebrRemoved(['EBR-1']).then(() => { resolvedAt = 'after'; });
    await flush();
    ok('_ebrRemoved resolves only once the shared worker has dropped its indexes', resolvedAt === null);
    inv.resolve();
    await flush();
    ok('...and then it does', resolvedAt === 'after');
    let remote = JiTA.sync._ebrRemoved(['EBR-1'], true);
    ok('...a removal heard from another tab resolves at once', remote && typeof remote.then === 'function');

    // ================= Triage mode =================
    Object.assign(JiTA.sync, { _ebrRemoved: (keys) => { removed.push(keys.join()); return Promise.resolve(); } });
    const T = JiTA.triage;
    Object.assign(T, eval('({' + member('    _verifyActionable: function (key) {') + member('    _dropClosed: function (ebrKey, key, reason) {') + '})'));
    ajaxScript = { 'EBR-5': { ok: true, data: { fields: { status: { name: 'Attached' }, assignee: null } } },
        'EBR-6': { ok: true, data: { fields: { status: { name: 'Open' }, assignee: { accountId: 'bob', displayName: 'Bob' } } } } };
    let v = await T._verifyActionable('EBR-5');
    ok('the re-verify marks a report attached in Jira as closed', v.ok === false && v.closed === true && v.reason === 'already Attached', JSON.stringify(v));
    v = await T._verifyActionable('EBR-6');
    ok('...but not one that is merely assigned to someone else', v.ok === false && !v.closed, JSON.stringify(v));

    let tRenders = 0, msgs = [];
    Object.assign(T, { _mode: 'defect', _open: true, _busy: false, _queue: [{ key: 'EDR-1' }], _idx: 0, _cache: { 'EDR-1': 1 },
        _render() { tRenders++; }, _prefetch() {}, _setMsg(m) { msgs.push(m); } });
    deleted = []; removed = [];
    await T._dropClosed('EBR-5', 'EDR-1', 'already Attached');
    ok('triage: a match attached in Jira leaves the local copy', deleted.join('|') === 'EBR-5' && removed.join('|') === 'EBR-5', deleted.join('|'));
    ok('...the defect\'s matches are ranked again without it', Object.keys(T._cache).length === 0 && tRenders === 1, tRenders);
    ok('...and the message says so', /EBR-5 is already Attached in Jira - taken off the list/.test(msgs[msgs.length - 1] || ''), msgs.join(' | '));

    T._cache = { 'EDR-2': 1 }; tRenders = 0;
    T._queue = [{ key: 'EDR-2' }];
    await T._dropClosed('EBR-5', 'EDR-1', 'already Attached');
    ok('...moved on to another defect meanwhile: the cache goes, but nothing is redrawn under it', Object.keys(T._cache).length === 0 && tRenders === 0, tRenders);
    T._mode = 'ebr'; T._cache = { 'EBR-4': 1 }; T._queue = [{ key: 'EBR-4' }]; tRenders = 0; deleted = [];
    await T._dropClosed('EBR-4', 'EBR-4', 'already Closed');
    ok('in the bug-report queue the closed report itself leaves the local copy, and its message stays', deleted.join('|') === 'EBR-4' && tRenders === 0 && Object.keys(T._cache).length === 1, deleted.join('|') + ' ' + tRenders);

    // ================= wiring =================
    const exec = member('    _exec: function (type, a) {');
    ok('a closed report found by the re-verify is dropped', exec.indexOf('if (v.closed) { T._dropClosed(ebrKey, key, v.reason); }') >= 0);
    const rr = member('    renderReports: function (key, background) {'), sr = member('    renderSimilarReports: function (key, background) {'), ap = member('    _appendNextReport: function (defectKey, shown) {');
    ok('a defect\'s Matching bug reports are checked once drawn', rr.indexOf('JiTA.ui._checkReportRows(function () { return !stale(); });') > rr.indexOf('$list.append(JiTA.ui._reportItem(results[i]));'));
    ok('a report\'s Similar open reports are checked once drawn', sr.indexOf('JiTA.ui._checkReportRows(function () { return JiTA.ui.currentKey === key && JiTA.ui.simReportsMode; });') > sr.indexOf('$list.append(JiTA.ui._simReportItem(results[i]));'));
    ok('a report slid in after an attach is checked too', ap.indexOf('JiTA.ui._checkReportRows(function () { return JiTA.ui.currentKey === defectKey; });') > ap.indexOf('_slideInRow('));

    console.log('\n' + (fail ? 'FAILURE: ' + fail + ' check(s) failed' : 'live status checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
