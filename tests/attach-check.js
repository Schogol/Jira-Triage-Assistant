// attach-check.js - attach targets (v3.38.4). An attach must only ever link a bug report onto a defect, and only the
// issue on screen. Three ways that went wrong: Triage kept rankings cached under the "reports by this reporter"
// view after the view was switched off on the way to the defect queue, so back on the bug-report queue a digit
// attached a report to another report; the side panel painted a slow answer for the previous issue under the
// next one, and its Attach then acted on the issue on screen; and JiTA.link.attachDuplicate accepted any pair.
// Evals the real attachDuplicate, JiTA.triage (_switchMode, _armAttach) and JiTA.ui (render, renderReports,
// _markDupButton, _attachReportButton) against stubs, holding each asynchronous step open to move on mid-way.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const END = '\n    },';
const slice = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim()); }
    const a = src.indexOf(END, s), b = src.indexOf('\n    }\n};', s);   // a member, or the last one in its object
    return (b >= 0 && b < a) ? src.slice(s, b + '\n    }'.length) + ',' : src.slice(s, a + END.length);
};
const ts = src.indexOf('JiTA.triage = {'), te = src.indexOf('\n};', ts) + 3;
if (ts < 0 || te < 3) { throw new Error('could not slice JiTA.triage'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

// ---- a fake jQuery: the panel list, a few labelled boxes, and button elements ----
const list = { kids: [], emptied: 0, empty() { this.kids = []; this.emptied++; return this; }, append(x) { this.kids.push(x); return this; } };
let modeText = null;
const box = () => ({ text(v) { return this; }, removeClass() { return this; }, empty() { return this; } });
function El(html) {
    const n = { html, classes: {}, handlers: {}, _text: '', attrs: {} };
    n.text = (v) => { if (v === undefined) { return n._text; } n._text = String(v); return n; };
    n.attr = (k, v) => { n.attrs[k] = v; return n; };
    n.on = (ev, fn) => { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return n; };
    n.addClass = (c) => { c.split(' ').forEach((x) => { n.classes[x] = true; }); return n; };
    n.removeClass = (c) => { c.split(' ').forEach((x) => { delete n.classes[x]; }); return n; };
    n.hasClass = (c) => !!n.classes[c];
    n.closest = () => n; n.remove = () => n;
    (/class="([^"]*)"/.exec(html || '') || ['', ''])[1].split(' ').filter(Boolean).forEach((x) => { n.classes[x] = true; });
    return n;
}
global.$ = (x) => {
    if (typeof x !== 'string') { return x; }
    if (x.charAt(0) === '<') { return El(x); }
    if (x === '#jita-sd-list') { return list; }
    if (x === '#jita-sd-mode') { return { text(v) { modeText = v; return this; } }; }
    return box();
};
let ajax = 0;
$.ajax = () => { ajax++; return { done() { return this; }, fail() { return this; } }; };
let confirms = [], toasts = [], statuses = [], snaps = [], attaches = [];
global.confirm = (m) => { confirms.push(m); return true; };
global.gmGet = (k, d) => d;
global.gmSet = () => {};
global.window = {};
global.JITA_IS_FORGE_FRAME = false;
global.JITA_GM_CATEGORIES = ['Gameplay', 'Billing & Account', 'Technical', 'Other'];
global.document = { getElementById: () => null };

// ---- JiTA: the real pieces under test, stubs around them ----
let dupInfos = 0;
global.JiTA = {
    HOST: 'https://x.atlassian.net',
    link: { dupInfo: () => { dupInfos++; return Promise.resolve({}); }, currentUser: () => Promise.resolve('me-id') },
    ui: {},
    db: {}, rank: {}, trend: { warm() {} }, sync: { _ebrRemoved() {} }, util: { fmtDate: (s) => s },
    profile: { renderSection() {}, clear() {} }   // profile-check.js covers the defect profile
};
JiTA.link.attachDuplicate = eval('({' + slice('    attachDuplicate: function (ebrKey, otherKey, statusName, preferredResolution, assigneeAccountId) {') + '})').attachDuplicate;
const realAttach = JiTA.link.attachDuplicate;
Object.assign(JiTA.ui, eval('({' + [
    slice('    render: function (key, background) {'),
    slice('    renderReports: function (key, background) {'),
    slice('    _markDupButton: function (defectKey) {'),
    slice('    _attachReportButton: function (reportKey) {')
].join('') + '})'));
Object.assign(JiTA.ui, {
    currentKey: null, reporterMode: false, simReportsMode: false, trendMode: false, modeOverride: null,
    _ensurePanel() {}, _syncFilterBtn() {}, _filterTerms: () => [], renderLogLink() {}, renderExceptionCluster() {},
    _getCreated: () => Promise.resolve(null), _fitVertical() {}, _snap: (k) => { snaps.push(k); }, _hideTip() {},
    setStatus: (m) => { statuses.push(m); }, setStatusAction: (m) => { statuses.push(m); }, toast: (m) => { toasts.push(m); },
    _item: (r) => ({ row: 'defect', key: r.key, onScreen: JiTA.ui.currentKey }),
    _reportItem: (r) => ({ row: 'report', key: r.key, defect: JiTA.ui.currentKey }),
    _getAssignee: () => Promise.resolve(null), _assigneeCache: {}, _rerenderCurrent() {},
    _liveStatus: (keys) => Promise.resolve(keys.reduce((o, k) => { o[k] = 'Open'; return o; }, {})),   // livestatus-check.js covers the real one
    _isOpenStatus: (s) => !!s && !/closed|attached/i.test(s), _checkReportRows: () => Promise.resolve([])
});
eval('JiTA.triage = ' + src.slice(ts, te - 1) + ';');
const T = JiTA.triage;

(async () => {
    // ================= the backstop =================
    const tryAttach = async (a, b) => {
        dupInfos = 0; ajax = 0;
        let err = null;
        realAttach(a, b, 'Attached', 'Duplicate').catch((e) => { err = e; });
        await flush();
        return { err, sent: dupInfos + ajax };
    };
    let r = await tryAttach('EBR-1', 'EBR-2');
    ok('a report onto a report is refused before anything is sent', !!r.err && /^Refused: /.test(r.err.message) && r.sent === 0, r.err && r.err.message);
    r = await tryAttach('EDR-1', 'EDR-2');
    ok('so is a defect onto a defect', !!r.err && r.sent === 0);
    r = await tryAttach(undefined, 'EDR-2');
    ok('and an attach with no report at all', !!r.err && r.sent === 0);
    const allowed = [];
    for (const d of ['EDR-2', 'EO-3', 'PLAT-4']) { r = await tryAttach('EBR-1', d); allowed.push(!r.err && r.sent > 0); }
    ok('a report onto an EDR, EO or PLAT defect goes ahead', allowed.every(Boolean), allowed.join(','));

    // ================= Triage =================
    Object.assign(T, {
        _disarm() {}, _closeJqlEditor() {}, _flushPos() {}, _syncModeUi() {}, _renderLegend() {}, _renderList() {},
        _render() {}, _prefetch() {}, _renderShell() {}, _fetchQueue: () => Promise.resolve(), _trySeekResume: () => true,
        _lastKey: () => 'k'
    });
    let msgs = [], armed = [];
    T._setMsg = (m) => { msgs.push(m); };
    const realArm = T._arm;
    T._arm = (a) => { armed.push(a); };

    T._mode = 'ebr'; T._busy = false; T._stash = {};
    JiTA.ui.reporterMode = true;
    T._cache = { 'EBR-100': 'reporter list' };
    T._switchMode('defect');
    ok('the move to the defect queue with a report view on drops every cached ranking', Object.keys(T._cache).length === 0, JSON.stringify(T._cache));
    T._switchMode('ebr');
    T._mode = 'ebr'; JiTA.ui.reporterMode = false; JiTA.ui.simReportsMode = false; JiTA.ui.trendMode = false;
    T._cache = { 'EBR-100': 'ranked matches' };
    T._switchMode('defect');
    ok('...with no view on, the rankings are still good and are kept', T._cache['EBR-100'] === 'ranked matches');
    T._switchMode('ebr');

    T._open = true; T._queue = [{ key: 'EBR-100' }]; T._idx = 0;
    T._shownKey = 'EBR-100';   // its list is on screen, as _render leaves it (v3.38.27)
    T._cache = { 'EBR-100': Promise.resolve({ view: 'reporter', results: [{ key: 'EBR-200' }] }) };
    msgs = []; armed = [];
    T._armAttach(1, '1');
    await flush();
    ok('a digit on a list cached under the reporter view arms nothing', armed.length === 0, JSON.stringify(armed));
    ok('...and says the rows are bug reports', msgs.some((m) => /These rows are bug reports/.test(m)), msgs.join(' | '));
    T._cache = { 'EBR-100': Promise.resolve({ view: 'simreports', results: [{ key: 'EBR-200' }] }) };
    armed = [];
    T._armAttach(1, '1');
    await flush();
    ok('...nor one cached under the similar reports view', armed.length === 0);
    T._cache = { 'EBR-100': Promise.resolve({ view: null, results: [{ key: 'EDR-9', pct: 80 }] }) };
    armed = [];
    T._armAttach(1, '1');
    await flush();
    ok('a digit on the ranked defect matches arms the attach', armed.length === 1 && armed[0].matchKey === 'EDR-9', JSON.stringify(armed));
    T._arm = realArm;

    // ================= the panel =================
    // Each step of a render is held open; `at` names the step during which the user moves on (or flips the view).
    const D = {}, calls = { count: 0, rank: 0, enrich: 0 };
    JiTA.ui.getIssueText = () => (D.text = deferred()).promise;
    JiTA.db.countDefectsOnly = JiTA.db.countEbr = () => { calls.count++; return (D.count = deferred()).promise; };
    JiTA.rank.suggestBest = JiTA.rank.suggestEbrBest = () => { calls.rank++; return (D.rank = deferred()).promise; };
    JiTA.db.getDefect = () => { calls.enrich++; return (D.enrich = deferred()).promise; };
    async function run(fn, key, match, at, how, failAt) {
        Object.keys(D).forEach((k) => { delete D[k]; });
        calls.count = calls.rank = calls.enrich = 0;
        list.kids = []; statuses = []; snaps = []; modeText = null;
        JiTA.ui.currentKey = key; JiTA.ui.reporterMode = JiTA.ui.simReportsMode = JiTA.ui.trendMode = false;
        JiTA.ui[fn](key);
        const steps = [['text', 'the text of ' + key], ['count', 42], ['rank', { results: [{ key: match }], mode: 'Keyword' }], ['enrich', null]];
        for (const [stage, value] of steps) {
            await flush();
            if (!D[stage]) { break; }   // the chain stopped before this step
            if (stage === at) { how(); list.kids = []; statuses = []; snaps = []; modeText = null; }   // what is on screen from here on is the new issue's
            if (stage === failAt) { D[stage].reject(new Error('HTTP 502')); break; }
            D[stage].resolve(value);
        }
        await flush(); await flush();
    }
    const away = () => { JiTA.ui.currentKey = 'EBR-999'; };
    const nothingPainted = () => list.kids.length === 0 && statuses.length === 0 && snaps.length === 0 && modeText === null;

    await run('render', 'EBR-1', 'EDR-1', null);
    ok('render: the matches for the issue on screen are painted', list.kids.length === 1 && list.kids[0].key === 'EDR-1' && list.kids[0].onScreen === 'EBR-1', JSON.stringify(list.kids));
    ok('...with its status and snapshot', statuses.join('|') === 'Finding similar defects…|1 suggestions · Keyword · 42 indexed' && snaps.join() === 'EBR-1', statuses.join('|'));
    await run('render', 'EBR-1', 'EDR-1', 'text', away);
    ok('render: moving on while the text is read stops it there, before the DB is even counted', calls.count === 0 && nothingPainted(), JSON.stringify(calls));
    await run('render', 'EBR-1', 'EDR-1', 'count', away);
    ok('...moving on while the DB is counted stops it before the ranking', calls.rank === 0 && nothingPainted(), JSON.stringify(calls));
    await run('render', 'EBR-1', 'EDR-1', 'rank', away);
    ok('...moving on while it ranks paints neither the mode nor the count, nor reads the rows', calls.enrich === 0 && nothingPainted(), JSON.stringify(calls) + ' ' + modeText + ' ' + statuses.join('|'));
    await run('render', 'EBR-1', 'EDR-1', 'enrich', away);
    ok('...moving on while the rows are read paints no rows under the next issue', nothingPainted(), JSON.stringify(list.kids));
    await run('render', 'EBR-1', 'EDR-1', 'rank', () => { JiTA.ui.reporterMode = true; });
    ok('...nor does switching the funnel to another view meanwhile', nothingPainted(), JSON.stringify(list.kids) + ' ' + statuses.join('|'));
    await run('render', 'EBR-1', 'EDR-1', 'text', away, 'text');
    ok('...and an error for the issue left behind is not shown on the next one', nothingPainted(), statuses.join('|'));
    await run('render', 'EBR-1', 'EDR-1', null, null, 'text');
    ok('...while an error on the issue on screen is', statuses.some((m) => /^Error: HTTP 502/.test(m)), statuses.join('|'));

    await run('renderReports', 'EDR-1', 'EBR-9', null);
    ok('renderReports: the reports for the defect on screen are painted, attaching to it', list.kids.length === 1 && list.kids[0].key === 'EBR-9' && list.kids[0].defect === 'EDR-1', JSON.stringify(list.kids));
    await run('renderReports', 'EDR-1', 'EBR-9', 'text', away);
    ok('renderReports: moving on while the text is read stops it there', calls.count === 0 && nothingPainted(), JSON.stringify(calls));
    await run('renderReports', 'EDR-1', 'EBR-9', 'count', away);
    ok('...moving on while the reports are counted stops it before the ranking', calls.rank === 0 && nothingPainted(), JSON.stringify(calls));
    await run('renderReports', 'EDR-1', 'EBR-9', 'rank', away);
    ok('...moving on while it ranks reads and paints nothing', calls.enrich === 0 && nothingPainted(), JSON.stringify(calls));
    await run('renderReports', 'EDR-1', 'EBR-9', 'enrich', away);
    ok('...moving on while the rows are read draws no row whose Attach would target the next issue', nothingPainted(), JSON.stringify(list.kids));
    await run('renderReports', 'EDR-1', 'EBR-9', 'text', away, 'text');
    ok('...and its errors stay with the issue they belong to', nothingPainted(), statuses.join('|'));

    // ---- the two Attach buttons ----
    JiTA.link.attachDuplicate = (a, b) => { attaches.push(a + ' -> ' + b); return new Promise(() => {}); };
    const tap = (el) => el.handlers.click.forEach((f) => f.call(el, { preventDefault() {}, stopPropagation() {} }));
    JiTA.ui.currentKey = 'EBR-1';
    let b = JiTA.ui._markDupButton('EDR-1');
    JiTA.ui.currentKey = 'EBR-2';
    confirms = []; toasts = []; attaches = [];
    tap(b);
    ok('a defect row drawn for one report attaches nothing once another is on screen', attaches.length === 0 && confirms.length === 0, attaches.join());
    ok('...and says why', toasts.some((m) => /drawn for EBR-1/.test(m)), toasts.join('|'));
    JiTA.ui.currentKey = 'EBR-1';
    b = JiTA.ui._markDupButton('EDR-1');
    tap(b);
    ok('...while on its own report it attaches that report', attaches.join() === 'EBR-1 -> EDR-1', attaches.join());

    JiTA.ui.currentKey = 'EDR-1';
    b = JiTA.ui._attachReportButton('EBR-9');
    await flush();
    JiTA.ui.currentKey = 'EBR-5';
    confirms = []; toasts = []; attaches = [];
    tap(b);
    ok('a report row drawn for one defect attaches nothing once another issue is on screen', attaches.length === 0 && confirms.length === 0, attaches.join());
    ok('...and says why', toasts.some((m) => /drawn for EDR-1/.test(m)), toasts.join('|'));
    JiTA.ui.currentKey = 'EDR-1';
    await flush();
    tap(b);
    await flush();
    ok('...while on its own defect it attaches the report to it', attaches.join() === 'EBR-9 -> EDR-1', attaches.join());

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'attach target checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
