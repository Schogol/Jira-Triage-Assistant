// panelattach-check.js - the panel's Attach and lookups (v3.38.28). Evals the real JiTA.link and JiTA.ui pieces
// against stubs:
//  - the defect-side Attach asks Jira for the assignee again after the confirm and refuses a report taken meanwhile
//  - a local DB failure after a successful attach is not reported as "Could not attach" (a retry linked twice)
//  - a refused link or transition carries Jira's own reason; a link type is remembered only when it was found, and a
//    failed read of the types is an error, not a guess
//  - a failed on-demand translation is not cached; one log scan per report, a failed one tried again; an attachment
//    fetch that 403s is no text; an unreadable Original Reporter ID is an error, not "none"; the stale rule matches
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const member = (head, from) => {
    const s = src.indexOf(head, from || 0);
    if (s < 0 || (from == null && src.indexOf(head, s + 1) >= 0)) { throw new Error('could not slice ' + head.trim().slice(0, 50)); }
    return src.slice(s, src.indexOf('\n    },', s) + 7);
};
const uiStart = src.indexOf('\nJiTA.ui = {');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };

// ---- a jQuery stand-in: $.ajax answers from a script; $('<span>') is a small element ----
let ajaxScript = [], ajaxCalls = [];
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
global.$ = (x) => (typeof x === 'string' && x.charAt(0) === '<' ? El() : { text: () => textOf[x] || '' });
const textOf = {};
$.ajax = (o) => {
    ajaxCalls.push(o.url);
    const r = ajaxScript.shift() || { ok: true, data: {} };
    const d = {
        done(f) { if (r.ok) { setImmediate(() => f(r.data)); } return d; },
        fail(f) { if (!r.ok) { setImmediate(() => f(r.xhr)); } return d; }
    };
    return d;
};
let store = {}, toasts = [], logs = [];
global.gmGet = (k, dflt) => (k in store ? store[k] : dflt);
global.gmSet = (k, v) => { store[k] = v; };
global.confirm = () => true;
global.SELECTORS = { SUMMARY_HEADING: 'h1', DESC_CONTAINER: 'desc' };
global.JiTA = { HOST: 'https://jira', MAX_RETRIES: 2, link: {}, ui: {}, db: {}, sync: {}, util: {}, triage: {} };
const log0 = console.log;

(async () => {
    // ================= Jira's reason =================
    Object.assign(JiTA.link, eval('({' + member('    _why: function (what, xhr) {') + member('    dupInfo: function () {') + member('    markDuplicate: function (ebrKey, otherKey) {') + member('    _dupAddOp: function (info, otherKey) {') +
        (() => { const s = src.indexOf('    attachDuplicate: function (ebrKey, otherKey, statusName, preferredResolution, assigneeAccountId) {'); return src.slice(s, src.indexOf('\n    }\n};', s) + 6); })() + '})'));
    JiTA.link._info = null;
    ajaxScript = [{ ok: true, data: { issueLinkTypes: [{ name: 'Dupe', outward: 'duplicates', inward: 'is duplicated by' }] } },
        { ok: true, data: { transitions: [{ id: '5', name: 'Attached', to: { name: 'Attached' }, fields: { issuelinks: {} } }] } },
        { ok: false, xhr: { status: 400, responseJSON: { errorMessages: [], errors: { customfield_1: 'Team is required.' } } } }];
    let err = null;
    await JiTA.link.attachDuplicate('EBR-1', 'EDR-1', 'Attached', 'Duplicate').catch((e) => { err = e; });
    ok('a refused transition says what Jira said', !!err && /Attached transition failed \(HTTP 400\): Team is required\./.test(err.message), err && err.message);
    ok('a link type that was found is remembered', store.sdDupLink_v2 && store.sdDupLink_v2.name === 'Dupe', JSON.stringify(store.sdDupLink_v2));
    ok('a bare 403 still hints at the permission (control)', /HTTP 403\) - no permission\?$/.test(JiTA.link._why('the duplicate link', { status: 403 }).message));
    JiTA.link._info = null; store = {};
    ajaxScript = [{ ok: true, data: { issueLinkTypes: [{ name: 'Relates', outward: 'relates to', inward: 'relates to' }] } }];
    const guess = await JiTA.link.dupInfo();
    ok('a guessed link type is used for the session but not remembered for good', guess.name === 'Duplicate' && !('sdDupLink_v2' in store), JSON.stringify(store));
    JiTA.link._info = null;
    ajaxScript = [{ ok: false, xhr: { status: 503 } }];
    err = null;
    await JiTA.link.dupInfo().catch((e) => { err = e; });
    ok('a failed read of the link types is an error, not a guess that drives a real link', !!err && /issue link types failed \(HTTP 503\)/.test(err.message), err && err.message);

    // ================= the defect-side Attach =================
    let attaches = [], drops = [], fades = 0, dropFails = false;
    Object.assign(JiTA.ui, eval('({' + member('    _assigneeCache: {},', uiStart).replace(/,\n$/, ',') + '\n' + member('    _getAssignee: function (key) {', uiStart) + member('    _attachReportButton: function (reportKey) {', uiStart) + member('    _markDupButton: function (defectKey) {', uiStart) + '})'));
    Object.assign(JiTA.ui, { currentKey: 'EDR-1', toast: (m) => { toasts.push(m); }, _hideTip() {}, softRefreshStatus() {}, _fadeOutAndReplace: () => { fades++; } });
    JiTA.link.currentUser = () => Promise.resolve('me');
    JiTA.link.attachDuplicate = (a, b) => { attaches.push(a + '->' + b); return Promise.resolve({ attached: true, linked: true }); };
    JiTA.db.deleteDefects = (keys) => { drops.push(keys.join()); return dropFails ? Promise.reject(new Error('QuotaExceededError')) : Promise.resolve(); };
    JiTA.sync._ebrRemoved = () => {};
    const tap = (b) => (b.el.handlers.click || []).forEach((f) => f.call(b, { preventDefault() {}, stopPropagation() {} }));
    global.$ = (x) => (typeof x === 'string' && x.charAt(0) === '<' ? El() : (x && x.el ? x : { text: () => textOf[x] || '' }));
    $.ajax = (o) => { ajaxCalls.push(o.url); const r = ajaxScript.shift() || { ok: true, data: {} }; const d = { done(f) { if (r.ok) { setImmediate(() => f(r.data)); } return d; }, fail(f) { if (!r.ok) { setImmediate(() => f(r.xhr)); } return d; } }; return d; };
    ajaxScript = [{ ok: true, data: { fields: { assignee: null } } },                                              // the gate: unassigned
        { ok: true, data: { fields: { assignee: { accountId: 'bob', displayName: 'Bob' } } } }];             // asked again: Bob took it
    let b = JiTA.ui._attachReportButton('EBR-9');
    await flush();
    ok('the gate offers Attach on an unassigned report (control)', b.text() === 'Attach', b.text());
    toasts = [];
    tap(b);
    await flush();
    ok('a report someone took after the gate is not attached', attaches.length === 0 && toasts.some((m) => /EBR-9 was taken by Bob meanwhile/.test(m)), toasts.join(' | '));
    ok('...and its button says so and goes quiet', b.text() === 'assigned' && (b.el.handlers.click || []).length === 0, b.text());
    ajaxScript = [{ ok: true, data: { fields: { assignee: null } } }, { ok: true, data: { fields: { assignee: null } } }];
    JiTA.ui._assigneeCache = {};
    b = JiTA.ui._attachReportButton('EBR-10');
    await flush();
    dropFails = true; toasts = []; fades = 0;
    console.log = () => {};
    tap(b);
    await flush();
    console.log = log0;
    ok('still unassigned when asked again, it is attached (control)', attaches.join() === 'EBR-10->EDR-1', attaches.join());
    ok('a local DB failure afterwards is not reported as a failed attach', !toasts.some((m) => /Could not attach/.test(m)) && b.text() === '✓ attached' && fades === 1, toasts.join(' | ') + ' / ' + b.text() + ' / ' + fades);
    JiTA.ui.currentKey = 'EBR-3';
    logs = [];
    console.log = (...a) => { logs.push(a.join(' ')); };
    const m = JiTA.ui._markDupButton('EDR-4');
    tap(m);
    await flush();
    console.log = log0;
    ok('the report-side Attach logs a failed local cleanup instead of leaving it unhandled', logs.some((l) => /could not drop EBR-3/.test(l)), logs.join(' | '));
    dropFails = false;

    // ================= the on-demand translation =================
    Object.assign(JiTA.ui, eval('({' + member('    getIssueText: function (key) {', uiStart) + '})'));
    JiTA.ui._qtx = null;
    JiTA.db.getDefect = () => Promise.resolve(null);
    JiTA.util = { cleanForCompare: (t, d) => t + ' ' + d, detectLang: () => 'foreign', toPlainText: (x) => x };
    textOf.h1 = 'Absturz'; textOf.desc = 'beim Abdocken';
    global.jitaTranslateRR = () => Promise.resolve({ fail: true });
    let txt = await JiTA.ui.getIssueText('EBR-5');
    ok('a translation that failed is not cached', txt === 'Absturz beim Abdocken' && JiTA.ui._qtx === null, JSON.stringify(JiTA.ui._qtx));
    global.jitaTranslateRR = () => Promise.resolve({ en: 'Crash on undock' });
    txt = await JiTA.ui.getIssueText('EBR-5');
    ok('...so the next look translates it (control)', txt === 'Crash on undock' && JiTA.ui._qtx && JiTA.ui._qtx.text === 'Crash on undock', txt);

    // ================= attachments and the log scan =================
    JiTA.triage._fetchText = eval('({' + member('    _fetchText: function (url) {', src.indexOf('\nJiTA.triage = {')) + '})')._fetchText;
    Object.assign(JiTA.ui, eval('({' + member('    _fetchText: function (url) {', uiStart) + member('    _logScanCache: {},', uiStart).replace(/,\n$/, ',') + '\n' + member('    scanIssueLog: function (key) {', uiStart) + member('    _scanIssueLog: function (key) {', uiStart) + '})'));
    global.GM_xmlhttpRequest = (o) => setImmediate(() => o.onload({ status: 403, responseText: '<html>Forbidden</html>' }));
    ok('an attachment fetch that 403s is no text, not the error page', (await JiTA.ui._fetchText('https://media/x')) === '');
    let matched = 0;
    JiTA.logsig = { matchText: () => { matched++; return Promise.resolve({ 'EDR-7': { count: 1, msg: 'boom' } }); } };
    global.GM_xmlhttpRequest = (o) => setImmediate(() => o.onload({ status: 200, responseText: 'log text' }));
    ajaxCalls = [];
    console.log = () => {};
    ajaxScript = [{ ok: true, data: { fields: { attachment: [{ filename: 'logs.txt', content: 'https://media/logs' }] } } }];
    const s1 = JiTA.ui.scanIssueLog('EBR-6'), s2 = JiTA.ui.scanIssueLog('EBR-6');
    const r1 = await s1, r2 = await s2;
    console.log = log0;
    ok('two renders of a fresh page scan its logs once', ajaxCalls.length === 1 && matched === 1 && r1['EDR-7'] && r2['EDR-7'], ajaxCalls.length + ' reads, ' + matched + ' matches');
    console.log = () => {};
    ajaxCalls = [];
    ajaxScript = [{ ok: false, xhr: { status: 502 } }];
    const f1 = await JiTA.ui.scanIssueLog('EBR-8');
    ajaxScript = [{ ok: true, data: { fields: { attachment: [] } } }];
    await JiTA.ui.scanIssueLog('EBR-8');
    console.log = log0;
    ok('a scan whose attachment list failed is no hits, and the next look tries again', Object.keys(f1).length === 0 && ajaxCalls.length === 2, ajaxCalls.length + ' reads');

    // ================= the Original Reporter ID =================
    Object.assign(JiTA.ui, eval('({' + member('    _getReporterId: function (key) {', uiStart) + '})'));
    global.setTimeout = (f) => { setImmediate(f); return 1; };
    ajaxScript = [{ ok: false, xhr: { status: 401, getResponseHeader: () => null } }];
    err = null;
    let rid = 'unset';
    await JiTA.ui._getReporterId('EBR-1').then((v) => { rid = v; }, (e) => { err = e; });
    ok('an Original Reporter ID that cannot be read is an error, not "none"', !!err && /could not read the Original Reporter ID \(HTTP 401\)/.test(err.message) && rid === 'unset', err ? err.message : JSON.stringify(rid));
    ajaxScript = [{ ok: true, data: { fields: { customfield_11660: '' } } }];
    rid = await JiTA.ui._getReporterId('EBR-1');
    ok('...a report that really has none is still "none" (control)', rid === '', JSON.stringify(rid));

    // ================= the stale rule =================
    ok('the stale-match rule targets the list by its id', src.indexOf('#jita-sd-list li.jita-sd-stale { opacity: .6; }') >= 0 && !/\.jita-sd-list\b/.test(src));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'panel and attach checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log = log0; console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
