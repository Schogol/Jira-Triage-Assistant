// panelattach-check.js - the panel's Attach and lookups (v3.38.28). Evals the real JiTA.link and JiTA.ui pieces
// against stubs:
//  - the defect-side Attach asks Jira for the assignee again after the confirm and refuses a report taken meanwhile
//  - a local DB failure after a successful attach is not reported as "Could not attach" (a retry linked twice)
//  - a refused link or transition carries Jira's own reason; a link type is remembered only when it was found, and a
//    failed read of the types is an error, not a guess
//  - a failed on-demand translation is not cached; one log scan per report, a failed one tried again; an attachment
//    fetch that 403s, hangs or fails is no text; an unreadable Original Reporter ID is an error, not "none"; the
//    closed-report rule matches
const S = require('./source');
const src = S.load();
const ui = (names) => eval(S.members(src, 'JiTA.ui', names));

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
global.JiTA = { HOST: 'https://jira', MAX_RETRIES: 2, link: {}, ui: {}, db: {}, sync: {}, util: {} };
require('./logstub')(JiTA);
const log0 = console.log;

(async () => {
    // ================= Jira's reason =================
    Object.assign(JiTA.link, eval(S.members(src, 'JiTA.link', ['_why', 'dupInfo', 'markDuplicate', '_dupAddOp', 'attachDuplicate'])));
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
    Object.assign(JiTA.ui, ui(['_assigneeCache', 'ASSIGNEE_LANES', 'ASSIGNEE_MS', '_assigneeBusy', '_assigneeWait', '_assigneeAt', '_getAssignee', '_attachReportButton', '_markDupButton', '_linkReport']));
    // Jira's issue view, told to read the issue on screen again (softrefresh-check.js covers the real helpers).
    let onScreen = 'EDR-1', viewRefreshes = 0, shows = [], statusNow = 'Open', patched = [];
    global.jitaCurrentKey = () => onScreen;
    global.jitaRefreshIssueView = () => { viewRefreshes++; };
    global.jitaShowWritten = (key, shown, missed) => { shows.push({ key, shown, missed }); };
    global.jitaStatusText = () => statusNow;
    Object.assign(JiTA.ui, { currentKey: 'EDR-1', toast: (m) => { toasts.push(m); }, _hideTip() {}, softRefreshStatus: (s) => { patched.push(s); }, _fadeOutAndReplace: () => { fades++; },
        // Every report still open; livestatus-check.js covers the real status lookup and an attach refused by it.
        _liveStatus: (keys) => Promise.resolve(keys.reduce((o, k) => { o[k] = 'Open'; return o; }, {})), _statusNow: (k) => { statusReads++; return Promise.resolve({ [k]: k in liveNow ? liveNow[k] : 'Open' }); },
        _isOpenStatus: (s) => !!s && !/closed|attached/i.test(s) });
    const liveNow = {};   // a report's status as the issue read at click time gives it (Open unless set)
    let statusReads = 0;
    JiTA.link.currentUser = () => Promise.resolve('me');
    JiTA.link.attachDuplicate = (a, b) => { attaches.push(a + '->' + b); return Promise.resolve({ attached: true, linked: true }); };
    JiTA.db.deleteDefects = (keys) => { drops.push(keys.join()); return dropFails ? Promise.reject(new Error('QuotaExceededError')) : Promise.resolve(); };
    JiTA.sync._ebrRemoved = () => {};
    const tap = (b) => (b.el.handlers.click || []).forEach((f) => f.call(b, { preventDefault() {}, stopPropagation() {} }));
    // The other rows' Attach buttons on screen, as the list's selector finds them.
    let rows = [];
    const set = (els) => ({ length: els.length,
        not: (x) => set(els.filter((j) => (typeof x === 'string' ? !j.hasClass(x.replace(/^\./, '')) : j !== x))),
        addClass: (c) => { els.forEach((j) => j.addClass(c)); return set(els); }, attr: (k, v) => { els.forEach((j) => j.attr(k, v)); return set(els); } });
    global.$ = (x) => (typeof x === 'string' && x.charAt(0) === '<' ? El() : (x && x.el ? x : (/jita-sd-link/.test(String(x)) ? set(rows) : { text: () => textOf[x] || '' })));
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
    dropFails = true; toasts = []; fades = 0; viewRefreshes = 0;
    console.log = () => {};
    tap(b);
    await flush();
    console.log = log0;
    ok('still unassigned when asked again, it is attached (control)', attaches.join() === 'EBR-10->EDR-1', attaches.join());
    ok('a local DB failure afterwards is not reported as a failed attach', !toasts.some((m) => /Could not attach/.test(m)) && b.text() === '✓ attached' && fades === 1, toasts.join(' | ') + ' / ' + b.text() + ' / ' + fades);
    ok('...and Jira, the defect being on screen, is told to show its new link', viewRefreshes === 1, String(viewRefreshes));
    JiTA.ui.currentKey = 'EBR-3'; onScreen = 'EBR-3';
    logs = []; shows = []; patched = []; statusNow = 'Open'; viewRefreshes = 0;
    console.log = (...a) => { logs.push(a.join(' ')); };
    const m = JiTA.ui._markDupButton('EDR-4');
    tap(m);
    await flush();
    console.log = log0;
    ok('the report-side Attach logs a failed local cleanup instead of leaving it unhandled', logs.some((l) => /could not drop EBR-3/.test(l)), logs.join(' | '));
    ok('...Jira is told to show the report as it is now, watched for its new status', shows.length === 1 && shows[0].key === 'EBR-3' && !shows[0].shown(), JSON.stringify(shows.map((x) => x.key)));
    statusNow = 'Attached';
    ok('...which counts as shown once the lozenge reads anything other than it did', shows[0].shown() === true);
    shows[0].missed();
    ok('...and a Jira that never shows it gets the status patched in by hand, as before', patched.join() === 'Attached' && viewRefreshes === 0, patched.join());
    JiTA.link.attachDuplicate = (a, b2) => { attaches.push(a + '->' + b2); return Promise.resolve({ attached: false, linked: true }); };
    shows = []; patched = [];
    tap(JiTA.ui._markDupButton('EDR-5'));
    await flush();
    ok('a link without the Attached status is shown too, with nothing patched', viewRefreshes === 1 && !shows.length && !patched.length, viewRefreshes + ' ' + shows.length);
    JiTA.link.attachDuplicate = (a, b2) => { attaches.push(a + '->' + b2); return Promise.resolve({ attached: true, linked: true }); };

    // ---- the report-side Attach asks the report's status first ----
    JiTA.ui.currentKey = 'EBR-3'; onScreen = 'EBR-3';
    attaches = []; toasts = []; liveNow['EBR-3'] = 'Attached';
    let m2 = JiTA.ui._markDupButton('EDR-6');
    tap(m2);
    await flush();
    ok('a report attached in Jira since the page was drawn is not linked a second time', attaches.length === 0, attaches.join());
    ok('...the button and a toast say why', m2.text() === 'Attached' && m2.hasClass('jita-sd-noattach') && !m2.hasClass('jita-sd-linking') &&
        toasts.some((t) => /EBR-3 is already Attached in Jira - not linked/.test(t)), m2.text() + ' / ' + toasts.join(' | '));
    statusReads = 0; toasts = [];
    tap(m2);
    await flush();
    ok('...and a second click does nothing, not even ask again', attaches.length === 0 && statusReads === 0 && !toasts.length && m2.text() === 'Attached',
        statusReads + ' / ' + toasts.join(' | ') + ' / ' + m2.text());
    liveNow['EBR-3'] = '';
    m2 = JiTA.ui._markDupButton('EDR-6'); toasts = [];
    tap(m2);
    await flush();
    ok('one Jira no longer has is refused too', attaches.length === 0 && m2.text() === 'gone' && toasts.some((t) => /no longer an open bug report/.test(t)), m2.text() + ' / ' + toasts.join(' | '));
    delete liveNow['EBR-3'];
    const o1 = JiTA.ui._markDupButton('EDR-7'), o2 = JiTA.ui._markDupButton('EDR-8');   // the other rows, offering the same report
    m2 = JiTA.ui._markDupButton('EDR-6');
    rows = [m2, o1, o2];
    tap(m2);
    await flush();
    ok('an open one is linked (control)', attaches.join() === 'EBR-3->EDR-6' && m2.text() === '✓ attached', attaches.join() + ' / ' + m2.text());
    ok('...and the other rows\' Attach stop offering it, which would link it again', o1.hasClass('jita-sd-noattach') && o2.hasClass('jita-sd-noattach') && !m2.hasClass('jita-sd-noattach') &&
        /EBR-3 is linked to EDR-6 now/.test(o1.el.attrs.title || ''), JSON.stringify([o1.el.classes, o2.el.classes]));
    statusReads = 0;
    tap(o1);
    await flush();
    ok('...so a click on one of them links nothing and asks nothing', attaches.length === 1 && statusReads === 0, attaches.join() + ' / ' + statusReads);
    rows = [];

    // ---- an assignee read is kept a while, not for the tab's life ----
    const now0 = Date.now; let clockA = 5e6; Date.now = () => clockA;
    JiTA.ui._assigneeCache = {}; JiTA.ui._assigneeAt = {}; ajaxCalls = [];
    ajaxScript = [{ ok: true, data: { fields: { assignee: { accountId: 'x', displayName: 'Xena' } } } }];
    const who1 = await JiTA.ui._getAssignee('EBR-40');
    clockA += JiTA.ui.ASSIGNEE_MS - 1;
    let who2 = await JiTA.ui._getAssignee('EBR-40');
    ok('an assignee read is used again for a while', ajaxCalls.length === 1 && who1.accountId === 'x' && who2 === who1, String(ajaxCalls.length));
    ajaxScript = [{ ok: true, data: { fields: { assignee: null } } }];
    clockA += 2;
    who2 = await JiTA.ui._getAssignee('EBR-40');
    ok('...and read again once ASSIGNEE_MS is over, so a report given up since can be attached', ajaxCalls.length === 2 && who2 === null, ajaxCalls.length + ' ' + JSON.stringify(who2));
    ok('...a couple of minutes', JiTA.ui.ASSIGNEE_MS >= 60000 && JiTA.ui.ASSIGNEE_MS <= 5 * 60000, String(JiTA.ui.ASSIGNEE_MS));
    Date.now = now0;

    JiTA.ui.currentKey = 'EDR-1'; onScreen = 'EDR-1';
    dropFails = false;

    // ================= the on-demand translation =================
    Object.assign(JiTA.ui, ui(['getIssueText']));
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
    Object.assign(JiTA.ui, ui(['_fetchText', '_logScanCache', '_logExc', 'scanIssueLog', '_scanIssueLog']));
    global.GM_xmlhttpRequest = (o) => setImmediate(() => o.onload({ status: 403, responseText: '<html>Forbidden</html>' }));
    ok('an attachment fetch that 403s is no text, not the error page: null, told apart from an empty log', (await JiTA.ui._fetchText('https://media/x')) === null);
    let asked = null;
    global.GM_xmlhttpRequest = (o) => { asked = o; setImmediate(() => { if (typeof o.ontimeout === 'function') { o.ontimeout(); } }); };
    const hung = await Promise.race([JiTA.ui._fetchText('https://media/slow'), new Promise((r) => setTimeout(() => r('hung'), 500))]);
    ok('...one that hangs gives up after a minute, as no text', asked && asked.timeout === 60000 && hung === null, (asked && asked.timeout) + ' / ' + JSON.stringify(hung));
    global.GM_xmlhttpRequest = (o) => setImmediate(() => o.onerror());
    const failed = await Promise.race([JiTA.ui._fetchText('https://media/x'), new Promise((r) => setTimeout(() => r('hung'), 500))]);
    ok('...and one that fails is no text either', failed === null, JSON.stringify(failed));
    global.GM_xmlhttpRequest = (o) => setImmediate(() => o.onload({ status: 200, responseText: '' }));
    ok('...while an empty log is an empty text', (await JiTA.ui._fetchText('https://media/empty')) === '');
    global.GM_xmlhttpRequest = (o) => setImmediate(() => o.onload({ status: 200, responseText: 'the log' }));
    ok('...while a good one is its text (control)', (await JiTA.ui._fetchText('https://media/x')) === 'the log');
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
    // a log that did not download: drawn as far as it goes, kept for neither the session nor the boost (review 2026-11-20 boost-logic-4)
    console.log = () => {};
    ajaxCalls = []; matched = 0;
    const twoLogs = { ok: true, data: { fields: { attachment: [{ filename: 'logs.txt', content: 'https://media/a' }, { filename: 'big_log.txt', content: 'https://media/b' }] } } };
    ajaxScript = [twoLogs, twoLogs];
    global.GM_xmlhttpRequest = (o) => setImmediate(() => (/\/b$/.test(o.url) ? o.ontimeout() : o.onload({ status: 200, responseText: 'log text' })));
    delete JiTA.ui._logExc['EBR-9'];
    const part1 = await JiTA.ui.scanIssueLog('EBR-9');
    const kept9 = Object.prototype.hasOwnProperty.call(JiTA.ui._logExc, 'EBR-9');
    await JiTA.ui.scanIssueLog('EBR-9');
    console.log = log0;
    ok('a scan with a log that did not download draws what it found, keeps it for nothing, and the next look scans again', !!part1['EDR-7'] && !kept9 && ajaxCalls.length === 2,
        ajaxCalls.length + ' reads, kept ' + kept9);
    global.GM_xmlhttpRequest = (o) => setImmediate(() => o.onload({ status: 200, responseText: 'log text' }));
    ajaxScript = [twoLogs]; delete JiTA.ui._logScanCache['EBR-9'];
    console.log = () => {};
    await JiTA.ui.scanIssueLog('EBR-9');
    console.log = log0;
    ok('...while one that read every log is kept, for the boost too', Object.prototype.hasOwnProperty.call(JiTA.ui._logExc, 'EBR-9') && !!JiTA.ui._logScanCache['EBR-9']);

    // ================= the Original Reporter ID =================
    Object.assign(JiTA.ui, ui(['_getReporterId']));
    global.setTimeout = (f) => { setImmediate(f); return 1; };
    ajaxScript = [{ ok: false, xhr: { status: 401, getResponseHeader: () => null } }];
    err = null;
    let rid = 'unset';
    await JiTA.ui._getReporterId('EBR-1').then((v) => { rid = v; }, (e) => { err = e; });
    ok('an Original Reporter ID that cannot be read is an error, not "none"', !!err && /could not read the Original Reporter ID \(HTTP 401\)/.test(err.message) && rid === 'unset', err ? err.message : JSON.stringify(rid));
    ajaxScript = [{ ok: true, data: { fields: { customfield_11660: '' } } }];
    rid = await JiTA.ui._getReporterId('EBR-1');
    ok('...a report that really has none is still "none" (control)', rid === '', JSON.stringify(rid));

    // ================= the closed-report rule =================
    ok('the closed-report rule targets the list by its id', src.indexOf('#jita-sd-list li.jita-sd-closed { opacity: .6; }') >= 0 && !/\.jita-sd-list\b/.test(src));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'panel and attach checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log = log0; console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
