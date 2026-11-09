// checklist-check.js - the Defect checklist (v3.51.0): a card on a defect for its reporter, and for Leads on an ISD member's
// defect, judging the ISD guide's rules for a defect against the defect and against the bug report it was converted from,
// refusing an unassign while items are open, and the writes it offers. Evals the real JiTA.checklist (and JiTA.util's
// toPlainText, JiTA.logsig's _crashOf) against stubbed Jira requests, a stubbed log reader, and a fake jQuery and DOM big
// enough for the card.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('\nJiTA.checklist = {'), ce = src.indexOf('\n    _noop: null\n};', cs);
if (cs < 0 || ce < 0) { throw new Error('could not slice JiTA.checklist'); }
const member = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return src.slice(s, src.indexOf('\n    },', s) + 7);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const J = (x) => JSON.stringify(x);
const settle = async (n) => { for (let i = 0; i < (n || 40); i++) { await new Promise((r) => setImmediate(r)); } };

// ---- a fake DOM node that jQuery code and DOM code can both use ----
function N(html) {
    const m = /class="([^"]*)"/.exec(html || ''), idm = /id="([^"]*)"/.exec(html || ''), tag = (/^<(\w+)/.exec(html || '') || [])[1] || 'div';
    const n = { tag: tag, id: idm ? idm[1] : '', cls: m ? m[1].split(/\s+/).filter(Boolean) : [], attrs: {}, props: {}, kids: [], handlers: {}, _text: '', parentNode: null, length: 1 };
    const hm = /title="([^"]*)"/.exec(html || ''), inner = /^<[^>]*>([^<]*)</.exec(html || '');
    if (hm) { n.attrs.title = hm[1]; }
    if (inner && inner[1]) { n._text = inner[1]; }
    n.addClass = (c) => { String(c || '').split(/\s+/).filter(Boolean).forEach((x) => { if (n.cls.indexOf(x) < 0) { n.cls.push(x); } }); return n; };
    n.removeClass = (c) => { n.cls = n.cls.filter((x) => x !== c); return n; };
    n.toggleClass = (c, on) => (on ? n.addClass(c) : n.removeClass(c));
    n.hasClass = (c) => n.cls.indexOf(c) >= 0;
    n.attr = (k, v) => { if (v === undefined) { return n.attrs[k]; } n.attrs[k] = v; return n; };
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.getAttribute = (k) => (n.attrs[k] == null ? null : n.attrs[k]);
    n.prop = (k, v) => { if (v === undefined) { return n.props[k]; } n.props[k] = v; return n; };
    n.text = (t) => { if (t === undefined) { return n.textContent; } n.textContent = String(t); return n; };
    n.append = (c) => { if (c && typeof c === 'object') { c.parentNode = n; n.kids.push(c); } return n; };
    n.appendTo = (p) => { p.append(n); return n; };
    n.appendChild = (c) => n.append(c);
    n.insertBefore = (c, ref) => {
        if (c.parentNode) { c.parentNode.kids = c.parentNode.kids.filter((k) => k !== c); }
        const i = ref ? n.kids.indexOf(ref) : -1;
        c.parentNode = n;
        if (i < 0) { n.kids.push(c); } else { n.kids.splice(i, 0, c); }
        return c;
    };
    n.removeChild = (c) => { n.kids = n.kids.filter((k) => k !== c); c.parentNode = null; return c; };
    n.remove = () => { if (n.parentNode) { n.parentNode.removeChild(n); } return n; };
    n.on = (ev, fn) => { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return n; };
    n.fire = (ev) => (n.handlers[ev] || []).forEach((fn) => fn.call(n, { preventDefault() {}, stopPropagation() {} }));
    n.empty = () => { n.kids = []; n._text = ''; return n; };
    n.find = (sel) => { const f = all(n).slice(1).filter((k) => match(k, sel)); return f.length === 1 ? f[0] : W(f); };
    n.querySelector = (sel) => all(n).slice(1).filter((k) => match(k, sel))[0] || null;
    n.querySelectorAll = (sel) => all(n).slice(1).filter((k) => match(k, sel));
    Object.defineProperty(n, 'children', { get: () => n.kids.filter((k) => k.tag) });
    Object.defineProperty(n, 'textContent', {
        get: () => n._text + n.kids.map((k) => (k.tag ? k.textContent : (k.data || ''))).join(''),
        set: (t) => { n._text = String(t); n.kids = []; }
    });
    Object.defineProperty(n, 'nextSibling', { get: () => { const p = n.parentNode; if (!p) { return null; } const i = p.kids.indexOf(n); return p.kids[i + 1] || null; } });
    return n;
}
function match(k, sel) {
    if (!k.tag) { return false; }
    if (sel === '*') { return true; }
    if (sel.charAt(0) === '#') { return k.id === sel.slice(1); }
    if (sel.charAt(0) === '.') { return k.cls.indexOf(sel.slice(1)) >= 0; }
    const a = /^\[([\w-]+)\]$/.exec(sel);
    if (a) { return k.attrs[a[1]] != null; }
    return k.tag === sel;
}
function all(n) { const out = [n]; (n.kids || []).forEach((k) => { if (k.tag) { all(k).forEach((d) => out.push(d)); } }); return out; }
function W(list) { return { length: list.length, empty() { return this; }, append() { return this; }, text() { return ''; } }; }
const byCls = (root, c) => all(root).filter((k) => k.hasClass && k.hasClass(c));

// The context column: Jira's Details slot, then whatever JiTA mounts after it.
let column, anchor;
function freshPage() {
    column = N('<div class="column"></div>');
    anchor = N('<div class="details"></div>');
    column.append(anchor);
    column.append(N('<div class="development"></div>'));   // Jira's own groups follow Details
}
freshPage();
let anchorMissing = false;
global.SELECTORS = { SUMMARY_HEADING: 'h1-summary', DESC_CONTAINER: 'desc-container', VC_DETAILS_GROUP: 'vc-details' };
global.document = {
    querySelector: (sel) => (/details-panel-slot|vc-details/.test(sel) && !anchorMissing ? anchor : null),
    querySelectorAll: () => [],
    getElementById: (id) => all(column).filter((k) => k.id === id)[0] || null,
    createTextNode: (t) => ({ data: t }),
    addEventListener: (ev, fn, cap) => { listeners.push({ ev, fn, cap }); },
    dispatchEvent: (ev) => { jiraEvents.push(ev); if (ev.type === 'legacy_refreshIssuePage' && jiraHears) { jiraShows(); } return true; }
};
const listeners = [];
// Jira's issue view: told to read the issue again (the DOM event), it shows the issue as it is now, which changes what the
// page shows (_pageSig reads the Details rows). jiraHears false: a Jira that no longer hears the event.
global.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail !== undefined ? init.detail : null; };
let jiraEvents = [], jiraHears = true, jiraShown = 0;
const jiraShows = () => { fieldRows = [{ label: 'Labels', el: { textContent: 'as Jira shows it now, ' + (++jiraShown) } }]; };
const refreshes = () => jiraEvents.filter((e) => e.type === 'legacy_refreshIssuePage');
global.window = { addEventListener: (ev, fn) => { listeners.push({ ev, fn, win: true }); }, confirm: (m) => { confirms.push(m); return confirmAnswer; },
    location: { reload: () => { reloads++; } } };
let confirms = [], confirmAnswer = true, reloads = 0;
global.GM_addStyle = (css) => { styles.push(css); };
const styles = [];
global.$ = (x) => {
    if (x && typeof x === 'object') { return x; }
    if (typeof x === 'string' && x.charAt(0) === '<') { return N(x); }
    return W([]);
};

// ---- Jira: scripted answers per "METHOD path", every request recorded ----
// As jQuery answers: Jira's answers are JSON, so unless the text is asked for (dataType 'text') it is parsed, and a body
// that does not parse, an empty one included, fails with the answer's own 2xx status (a 204 is not parsed). An answer is
// { ok, status, data } or { ok, status, text }; a refusal { ok: false, status, json, retry }.
let ajaxLog = [], answers = {};
$.ajax = (o) => {
    const path = o.url.replace('https://x.atlassian.net', ''), key = o.type + ' ' + path.split('?')[0];
    ajaxLog.push({ method: o.type, path: path, body: o.data ? JSON.parse(o.data) : undefined, headers: o.headers, dataType: o.dataType });
    const a = answers[key] || answers[o.type + ' *'] || { ok: true, data: {} }, next = Array.isArray(a) ? (a.length > 1 ? a.shift() : a[0]) : a;
    const text = next.text !== undefined ? next.text : (next.data == null || next.data === '' ? '' : (typeof next.data === 'string' ? next.data : J(next.data)));
    let value = text, parseErr = false;
    if (next.ok && o.dataType !== 'text' && next.status !== 204) { try { value = JSON.parse(text); } catch (e) { parseErr = true; } }
    const failed = !next.ok || parseErr;
    const xhr = { status: parseErr ? (next.status || 200) : next.status, responseText: next.json ? J(next.json) : (next.text || ''), getResponseHeader: () => next.retry || null };
    if (o.dataType !== 'text' && next.json) { xhr.responseJSON = next.json; }
    const d = { done(fn) { if (!failed) { setImmediate(() => fn(value)); } return d; },
        fail(fn) { if (failed) { setImmediate(() => fn(xhr)); } return d; } };
    return d;
};
const puts = () => ajaxLog.filter((r) => r.method === 'PUT');

// ---- JiTA around the checklist ----
let toasts = [], isLead = false, groupMembers = [], issueOf = {}, histOf = {}, sourceOf = {}, readOf = {}, holdingOf = {}, me = 'acc-rep';
const gmStore = {};
global.gmGet = (k, d) => (k in gmStore ? gmStore[k] : d);
global.gmSet = (k, v) => { gmStore[k] = JSON.parse(J(v)); };
global.jitaCurrentKey = () => onScreen;
let onScreen = '', checklistOn = true;
global.flagOn = (name) => (name === 'defectChecklist' ? checklistOn : true);
global.JiTA = {
    HOST: 'https://x.atlassian.net', dlog: () => {},
    util: { fmtDate: (iso) => String(iso).slice(0, 10), copy: (t, h) => { copied.push(t); copiedHtml.push(h); return copyAnswer ? Promise.resolve() : Promise.reject(new Error('no')); } },
    logsig: { MIN_FRAMES: 2, CRASH_FRAMES: 2, holding: (sigs) => Promise.resolve(holdingOf), _logBlocks: (t) => String(t).split('\n\n'),
        _fingerprint: (b) => ({ sig: String(b).split('\n')[0].toLowerCase() }) },
    excfind: { _fps: (text) => fpsOf(text), _read: (item) => (readOf[item.key] instanceof Error ? Promise.reject(readOf[item.key]) : Promise.resolve(readOf[item.key])) },
    excnoise: { load: () => Promise.resolve(), counts: (sig) => !/^usererror/.test(sig) },
    profile: { _sigTip: (sig, msg) => 'tip:' + msg, _logFiles: (att) => (att || []).filter((a) => /log/i.test(a.filename) && a.content),
        _fetchLog: (url) => (logText[url] != null ? Promise.resolve(logText[url]) : Promise.reject(new Error('404'))) },
    ocr: { _langFromLabels: () => null },
    ui: { toast: (m) => { toasts.push(m); }, _buildSideGroup: (o) => {
        const g = N('<div class="jita-side-card"></div>'); g.id = o.id;
        const head = N('<div class="head"></div>'), title = N('<span class="jita-side-htitle"></span>'); title._text = o.title;
        head.append(title); g.append(head);
        const body = N('<div class="jita-side-body"></div>'); body.append(N(o.body)); g.append(body);
        built++;
        return g;
    } },
    link: { currentUser: () => Promise.resolve(me) },
    declutter: { _fieldRows: () => fieldRows },
    db: { getMeta: (k) => Promise.resolve(meta[k] || null), setMeta: (k, v) => { meta[k] = JSON.parse(J(v)); return Promise.resolve(); } },
    leadduty: {
        _search: (jql, fields) => { searches.push({ jql, fields }); return searchAnswer instanceof Error ? Promise.reject(searchAnswer) : Promise.resolve(JSON.parse(J(searchAnswer))); },
        isLead: () => isLead, me: () => ({ accountId: me, displayName: 'ISD BH Hunter' }),
        group: { members: () => Promise.resolve(groupMembers) },
        _get: (path) => {
            gets.push(path);
            const em = /^\/rest\/api\/3\/issue\/([A-Z]+-\d+)\/editmeta$/.exec(path);
            if (em) { return editmetaOf[em[1]] ? Promise.resolve(JSON.parse(J(editmetaOf[em[1]]))) : Promise.reject(Object.assign(new Error('403'), { status: 403 })); }
            const m = /^\/rest\/api\/3\/issue\/([A-Z]+-\d+)(\?.*)?$/.exec(path);
            if (m && /fields=reporter$/.test(path) && issueOf[m[1]]) { return Promise.resolve({ key: m[1], fields: { reporter: JSON.parse(J(issueOf[m[1]].fields.reporter)) } }); }
            if (m && /fields=updated$/.test(path) && issueOf[m[1]]) { return Promise.resolve({ key: m[1], fields: { updated: issueOf[m[1]].fields.updated || null } }); }
            if (m && /fields=\*all/.test(path)) { return issueOf[m[1]] ? Promise.resolve(JSON.parse(J(issueOf[m[1]]))) : Promise.reject(Object.assign(new Error('404'), { status: 404 })); }
            if (m) { return sourceOf[m[1]] ? Promise.resolve(JSON.parse(J(sourceOf[m[1]]))) : Promise.reject(Object.assign(new Error('404'), { status: 404 })); }
            return Promise.reject(new Error('unexpected GET ' + path));
        },
        _changelog: (key) => { gets.push('changelog ' + key); return histOf[key] instanceof Error ? Promise.reject(histOf[key]) : Promise.resolve(JSON.parse(J(histOf[key] || []))); }
    }
};
let gets = [], meta = {}, searches = [], searchAnswer = [], editmetaOf = {};
let copied = [], copiedHtml = [], copyAnswer = true, built = 0, fieldRows = [], logText = {};
// The fingerprints of a description: "EXC[<sig>]" for each exception pasted in it.
function fpsOf(text) { const out = [], re = /EXC\[([^\]]+)\]/g; let m; while ((m = re.exec(String(text)))) { out.push({ sig: m[1], msg: m[1] }); } return out; }
Object.assign(JiTA.util, eval('({' + member('    toPlainText: function (d) {') + '})'));
Object.assign(JiTA.logsig, eval('({' + member('    _crashOf: function (sig) {') + '})'));
eval(src.slice(cs + 1, ce) + '\n    _noop: null\n};');
const C = JiTA.checklist;
// The issue on screen, shown without a reload: the real helpers (softrefresh-check.js covers them), with a wait short
// enough for a test.
const hs = src.indexOf('\nvar JITA_REFRESH_EVENT = '), he = src.indexOf('\n}\n', src.indexOf('\nfunction jitaOpenIssue(', hs)) + 3;
if (hs < 0 || he < 3) { throw new Error('could not slice the refresh helpers'); }
(0, eval)(src.slice(hs, he));
global.JITA_REFRESH_MS = 40; global.JITA_REFRESH_STEP_MS = 5;
const waitRefresh = () => new Promise((r) => setTimeout(r, JITA_REFRESH_MS + 40));

// ---- fixtures ----
const EXC = { sig: "keyerror: 'x'|a.py:f>b.py:g>c.py:h", msg: "KeyError: 'x' raised while undocking" };
const adf = (paras, list) => ({ type: 'doc', version: 1, content: paras.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
    .concat(list ? [{ type: 'orderedList', content: list.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) }] : []) });
const NAMES = { summary: 'Summary', customfield_101: 'Severity', customfield_102: 'Impact', customfield_10001: 'Team', customfield_104: 'Epic Link',
    customfield_105: 'EVE Server', customfield_106: 'EVE Build' };
// The bug report's description, as the in-game reporter writes it, steps and all.
const REPORT_DESC = () => adf(['i undock and the game crashes', 'Reproduction Steps: 1. undock 2. it crashes', 'Session Info: Jita']);
// A defect as the conversion leaves it: the report's summary, description (steps and all) and labels, its log and its
// EVE Server and EVE Build (the player's) copied, nothing set.
function converted() {
    return { key: 'EDR-1', names: NAMES, properties: {}, fields: {
        summary: 'game crash when undock', description: REPORT_DESC(), labels: ['PlatformWin', 'cloned'],
        attachment: [{ filename: 'logs.txt', size: 100 }], reporter: { accountId: 'acc-rep', displayName: 'ISD BH Hunter' }, assignee: { accountId: 'acc-rep' },
        priority: { id: '3', name: '3 - Medium' }, customfield_101: null, customfield_102: null, customfield_10001: null, customfield_104: null,
        customfield_105: { value: 'Tranquility' }, customfield_106: '2900123',
        issuelinks: [{ type: { name: 'Duplicate' }, inwardIssue: { key: 'EBR-10', fields: { summary: 'game crash when undock' } } }]
    } };
}
// The same defect once its reporter is done with it: its steps rewritten in plain words (no list needed), its attachments
// checked.
function finished() {
    const i = converted(), f = i.fields;
    f.summary = 'Undocking from a station crashes the client';
    f.description = adf(['Singularity, build 2945678', 'Undocking from any station crashes the client to desktop.', 'Dock in Jita 4-4, undock, and the client closes.', 'EXC[' + EXC.sig + ']']);
    f.labels = ['Undock', 'Crash', 'cloned'];
    f.attachment = [{ filename: 'logs.txt', size: 100 }, { filename: 'loglite_undock.txt', size: 5000 }];
    f.customfield_101 = { value: 'A - Crash / Exploit' }; f.customfield_102 = { value: 'Moderate / Limited' };
    f.customfield_105 = { value: 'Singularity' }; f.customfield_106 = '2945678';
    i.properties = { 'jita.checklist': { v: 1, ok: { attachments: { by: 'acc-rep', name: 'ISD BH Hunter', at: '2026-11-08T12:00:00.000Z', sig: C._attSig(f.attachment) } } } };
    return i;
}
const SRC = { key: 'EBR-10', fields: { summary: 'game crash when undock', description: REPORT_DESC(), labels: ['PlatformWin', 'Russian'],
    attachment: [{ filename: 'logs.txt', size: 100, content: 'u-logs' }], customfield_105: { value: 'Tranquility' }, customfield_106: '2900123' } };
const srcObj = () => ({ key: 'EBR-10', summary: SRC.fields.summary, desc: JiTA.util.toPlainText(SRC.fields.description), labels: SRC.fields.labels.slice(),
    steps: C._steps(SRC.fields.description, null), eveServer: 'Tranquility', eveBuild: '2900123', attachments: SRC.fields.attachment.map((a) => Object.assign({}, a)) });
// Without the EVE Server and EVE Build fields: the old way, the server and build at the top of the description.
const OLD_NAMES = { summary: 'Summary', customfield_101: 'Severity', customfield_102: 'Impact', customfield_10001: 'Team', customfield_104: 'Epic Link' };
const byId = (items, id) => items.filter((it) => it.id === id)[0];

(async () => {
    // ================= small parts =================
    ok('a field\'s value reads as text: a select, a user, a list, nothing', C._val({ value: 'A - Crash' }) === 'A - Crash' && C._val({ displayName: 'Bob' }) === 'Bob' &&
        C._val([{ value: 'a' }, { value: 'b' }]) === 'a, b' && C._val(null) === '' && C._val('x') === 'x');
    ok('the fields are found by their names, Epic Link no longer among them', J(C._ids(NAMES, {})) === J({ severity: 'customfield_101', impact: 'customfield_102', server: 'customfield_105', build: 'customfield_106' }), J(C._ids(NAMES, {})));
    ok('...no State, which this Jira does not have', !('state' in C._ids({ cf_s: 'State' }, {})));
    ok('...the steps field by either of its names', C._ids({ cf_7: 'Steps to Reproduce' }, {}).steps === 'cf_7' && C._ids({ cf_8: 'Reproduction Steps' }, {}).steps === 'cf_8');
    ok('...and of two fields with one name, the one holding a value', C._ids({ cf_a: 'Impact', cf_b: 'Impact' }, { cf_b: { value: 'Minor' } }).impact === 'cf_b' &&
        C._ids({ cf_a: 'Impact', cf_b: 'Impact' }, { cf_a: { value: 'Minor' } }).impact === 'cf_a');
    const hist = [
        { author: { accountId: 'acc-rep' }, created: '2026-11-08T10:00:00.000+0000', items: [{ field: 'summary', fromString: 'first summary', toString: 'second' }] },
        { author: { accountId: 'acc-rep' }, created: '2026-11-08T10:05:00.000+0000', items: [{ field: 'summary', fromString: 'second', toString: 'third' }, { field: 'labels', fromString: 'a', toString: 'a b' }] }
    ];
    ok('a field\'s first value is what its first change replaced', C._first(hist, 'summary', 'third') === 'first summary');
    ok('...and what it holds now when it never changed', C._first(hist, 'description', 'now') === 'now');
    const last = C._last(hist, (it) => it.field === 'summary');
    ok('the last change of a field, with its author and time', last && last.item.toString === 'third' && last.by === 'acc-rep' && last.at === '2026-11-08T10:05:00.000+0000', J(last));

    // ---- Priority and Team are FC's ----
    const pr = (by, from, to, at) => ({ author: { accountId: by }, created: at || '2026-11-08T11:00:00.000+0000', items: [{ field: 'priority', fieldId: 'priority', from: from, to: to }] });
    const fcOf = (f, h) => C._fcSet(Object.assign({ priority: { id: '3' } }, f), h, {}, 'acc-rep').map((x) => x.name).join(',');
    ok('Priority the reporter changed is theirs', fcOf({ priority: { id: '2' } }, [pr('acc-rep', '3', '2')]) === 'Priority');
    ok('...not once they put it back', fcOf({ priority: { id: '3' } }, [pr('acc-rep', '3', '2'), pr('acc-rep', '2', '3')]) === '');
    ok('...nor when FC set it', fcOf({ priority: { id: '1' } }, [pr('acc-fc', '3', '1')]) === '');
    ok('...but when the reporter changed it after FC, it is theirs again', fcOf({ priority: { id: '4' } }, [pr('acc-fc', '3', '1'), pr('acc-rep', '1', '4')]) === 'Priority');
    ok('...and FC changing it after the reporter makes it FC\'s', fcOf({ priority: { id: '1' } }, [pr('acc-rep', '3', '2'), pr('acc-fc', '2', '1')]) === '');
    ok('...and Priority never changed is nobody\'s', fcOf({ priority: { id: '2' } }, []) === '');
    const tm = (by) => ({ author: { accountId: by }, created: '2026-11-08T11:00:00.000+0000', items: [{ field: 'Team', fieldId: 'customfield_10001', from: null, to: '38' }] });
    ok('a Team set when the defect was made counts as the reporter\'s', fcOf({ customfield_10001: { name: 'Core' } }, []) === 'Team');
    ok('...one the reporter set, too', fcOf({ customfield_10001: { name: 'Core' } }, [tm('acc-rep')]) === 'Team');
    ok('...one FC set does not', fcOf({ customfield_10001: { name: 'Core' } }, [tm('acc-fc')]) === '');
    ok('...nor an empty one', fcOf({ customfield_10001: null }, [tm('acc-rep')]) === '');
    ok('an Epic Link or a parent epic is not looked at any more', fcOf({ customfield_104: { key: 'EDR-4' }, parent: { key: 'EDR-5', fields: { issuetype: { name: 'Epic' } } } }, []) === '');

    // ---- the unassign to put back ----
    const NOW = Date.parse('2026-11-08T12:00:00.000Z');
    const as = (by, from, to, ago) => [{ author: { accountId: by }, created: new Date(NOW - ago).toISOString(), items: [{ field: 'assignee', fieldId: 'assignee', from: from, to: to }] }];
    ok('an unassign of mine a moment ago is put back to whoever had it', J(C._revertTo(as('acc-me', 'acc-rep', null, 30000), 'acc-me', NOW)) === J({ from: 'acc-rep', at: new Date(NOW - 30000).toISOString() }));
    ok('...not someone else\'s', C._revertTo(as('acc-fc', 'acc-rep', null, 30000), 'acc-me', NOW) === null);
    ok('...not an old one', C._revertTo(as('acc-me', 'acc-rep', null, 5 * 60000), 'acc-me', NOW) === null);
    ok('...not a hand-over to someone', C._revertTo(as('acc-me', 'acc-rep', 'acc-dev', 30000), 'acc-me', NOW) === null);
    ok('...nor with no one to put it back to', C._revertTo(as('acc-me', null, null, 30000), 'acc-me', NOW) === null);

    // ---- which bug report it came from ----
    const link = (type, key, summary, out) => ({ type: { name: type }, [out ? 'outwardIssue' : 'inwardIssue']: { key: key, fields: { summary: summary } } });
    ok('the report linked as its clone', C._source({ summary: 'x', issuelinks: [link('Duplicate', 'EBR-1', 'x'), link('Cloners', 'EBR-2', 'y', true)] }, []) === 'EBR-2');
    ok('...else the one whose summary was its first summary', C._source({ summary: 'rewritten', issuelinks: [link('Duplicate', 'EBR-1', 'other'), link('Duplicate', 'EBR-2', 'first summary')] }, hist) === 'EBR-2');
    ok('...else, on a converted (cloned) defect, the only one', C._source({ summary: 'new', labels: ['cloned'], issuelinks: [link('Duplicate', 'EBR-3', 'whatever')] }, []) === 'EBR-3');
    ok('...but not on a defect written from scratch with a report attached since', C._source({ summary: 'new', labels: [], issuelinks: [link('Duplicate', 'EBR-3', 'whatever')] }, []) === null);
    ok('...and not when several cannot be told apart', C._source({ summary: 'new', labels: ['cloned'], issuelinks: [link('Duplicate', 'EBR-3', 'a'), link('Duplicate', 'EBR-4', 'b')] }, []) === null);
    ok('...defects linked are no source', C._source({ summary: 'x', labels: ['cloned'], issuelinks: [link('Relates', 'EDR-9', 'x')] }, []) === null);

    // ---- logs, labels, exceptions ----
    ok('the attachments as a set: their names and sizes, in any order', C._attSig([{ filename: 'b.png', size: 2 }, { filename: 'a.txt', size: 1 }]) === 'a.txt:1|b.png:2' && C._attSig([]) === '');
    // ---- server names ----
    const reOf = C._serverRe(['Tranquility', 'Singularity']);
    ok('a server named as given, or the way hunters write it (TQ, SiSi)', reOf.test('Tranquility 2945678') && reOf.test('on TQ, build 2945678') && reOf.test('sisi 123') && reOf.test('Singularity'));
    ok('...as a word of its own, and no name it was not given', !reOf.test('Tranquilityx') && !reOf.test('atqb') && !reOf.test('Duality 2945678'));
    ok('...a name holding a dot or brackets taken as written', C._serverRe(['Test (A.1)']).test('on Test (A.1) build 1234567') && !C._serverRe(['Test (A.1)']).test('Test xA21x'));
    ok('...and with no names, nothing matches', !C._serverRe([]).test('Tranquility'));
    editmetaOf = { 'EDR-1': { fields: { customfield_105: { allowedValues: [{ value: 'Tranquility' }, { value: 'Singularity' }, { value: 'Duality' }] } } } };
    gets = [];
    let names = await C._serverNames('EDR-1', 'customfield_105');
    ok('the server names are the EVE Server field\'s options, as Jira offers them for the defect', J(names) === J(['Tranquility', 'Singularity', 'Duality']) && gets.some((p) => /EDR-1\/editmeta$/.test(p)), J(names) + ' ' + J(gets));
    gets = [];
    names = await C._serverNames('EDR-1', 'customfield_105');
    ok('...kept for a week, not read again', J(names) === J(['Tranquility', 'Singularity', 'Duality']) && !gets.length);
    gets = [];
    editmetaOf['EDR-1'].fields.customfield_999 = { allowedValues: [{ value: 'Other' }] };
    names = await C._serverNames('EDR-1', 'customfield_999');
    ok('...for that field only: another field\'s options are read for it', J(names) === J(['Other']) && gets.length === 1, J(names));
    gets = [];
    await C._serverNames('EDR-1', 'customfield_105');
    gmStore[C.SERVERS_KEY].at = Date.now() - 8 * 24 * 3600 * 1000;
    gets = [];
    await C._serverNames('EDR-1', 'customfield_105');
    ok('...and read again after a week', gets.length === 1);
    delete gmStore[C.SERVERS_KEY];
    editmetaOf = { 'EDR-1': { fields: { customfield_105: { schema: { type: 'string' } } } } };
    ok('...a field with no options (a text field) gives the built-in names', J(await C._serverNames('EDR-1', 'customfield_105')) === J(C.SERVER_NAMES) && !gmStore[C.SERVERS_KEY]);
    editmetaOf = {};
    ok('...as does an editmeta that cannot be read', J(await C._serverNames('EDR-1', 'customfield_105')) === J(C.SERVER_NAMES));
    gets = [];
    ok('...or no EVE Server field at all, with nothing read', J(await C._serverNames('EDR-1', '')) === J(C.SERVER_NAMES) && !gets.length);
    // ---- label suggestions ----
    ok('a label is found by its words: FittingWindow and Fitting_Window by "fitting window", or as one word',
        J(C._labelForms('FittingWindow')) === J([['fitting', 'window'], ['fittingwindow']]) && J(C._labelForms('Fitting_Window')) === J([['fitting', 'window'], ['fittingwindow']]) &&
        J(C._labelForms('SKINR')) === J([['skinr']]) && C._labelForms('PvE').some((f) => J(f) === J(['pve'])));
    ok('...a plural counts as its singular, and the words must follow each other', C._hasRun(['two', 'drones', 'lost'], ['drone']) && C._hasRun(['the', 'fitting', 'windows'], ['fitting', 'window']) &&
        !C._hasRun(['fitting', 'the', 'window'], ['fitting', 'window']) && !C._hasRun(['dronesx'], ['drone']));
    const COUNTS = { Overview: 10, Undock: 5, FittingWindow: 3, lowercase: 9, Rare: 1, PlatformWin: 50, cloned: 99, Crash: 40, Window: 7 };
    const sugD = { summary: 'Undock from a station breaks the Overview', steps: 'open the fitting window', desc: 'lowercase rare crash window platform win cloned',
        labels: ['Crash'], src: { labels: ['PlatformWin'] } };
    const sug = C.suggest(sugD, COUNTS);
    ok('suggested: labels in use whose words the defect\'s text holds, the summary counting most', J(sug.map((x) => x.label)) === J(['Overview', 'Window', 'Undock', 'FittingWindow']), J(sug));
    ok('...each saying on how many defects and where its words are', sug[0].n === 10 && J(sug[0].where) === J(['summary']) && J(sug[1].where) === J(['steps', 'description']), J(sug.slice(0, 2)));
    ok('...never one it has, cloned or jira_escalated, the report\'s own, a rare one, nor one in lower case',
        !sug.some((x) => ['Crash', 'cloned', 'PlatformWin', 'Rare', 'lowercase'].indexOf(x.label) >= 0));
    ok('...at most SUGGEST of them', (() => { const many = {}; for (let i = 0; i < 20; i++) { many['Word' + i] = 5; } return C.suggest({ summary: Object.keys(many).join(' '), labels: [] }, many).length === C.SUGGEST; })());
    ok('...nothing when the text calls for none', C.suggest({ summary: 'nothing here', labels: [] }, COUNTS).length === 0);
    meta = {}; searches = []; C._labelsP = null;
    searchAnswer = [{ fields: { labels: ['Overview', 'Undock'] } }, { fields: { labels: ['Overview'] } }];
    let counts = await C._labelCounts();
    ok('the labels in use are counted by one search of the last year\'s defects', J(counts) === J({ Overview: 2, Undock: 1 }) && searches.length === 1 &&
        searches[0].jql === C.LABELS_JQL && /project = EDR/.test(C.LABELS_JQL) && /created >= -365d/.test(C.LABELS_JQL) && J(searches[0].fields) === J(['labels']), J(searches));
    ok('...and kept in the meta store', !!meta[C.LABELS_KEY] && J(meta[C.LABELS_KEY].c) === J(counts) && meta[C.LABELS_KEY].n === 2);
    C._labelsP = null;
    await C._labelCounts();
    ok('...a count under a week old is not done again', searches.length === 1);
    meta[C.LABELS_KEY].at = Date.now() - 8 * 24 * 3600 * 1000; C._labelsP = null;
    await C._labelCounts();
    ok('...an older one is', searches.length === 2);
    meta = {}; C._labelsP = null; searchAnswer = new Error('HTTP 500');
    let countFailed = false;
    try { await C._labelCounts(); } catch (e) { countFailed = true; }
    await settle();
    ok('...and a count that failed is tried again on the next card', countFailed && C._labelsP === null);
    searchAnswer = [];

    // the reproduction steps
    const stepsOf = (desc, field) => C._steps(desc, field);
    ok('the steps are the description\'s "Reproduction Steps" section, as the in-game reporter writes it', stepsOf(REPORT_DESC(), null).trim() === '1. undock 2. it crashes', J(stepsOf(REPORT_DESC(), null)));
    ok('...or its numbered lists', stepsOf(adf(['intro'], ['Dock', 'Undock']), null) === 'Dock Undock');
    ok('...the hunter\'s own list over the player\'s section left below it', stepsOf(adf(['Reproduction Steps: 1. undock 2. it crashes'], ['Dock', 'Undock', 'Observe']), null) === 'Dock Undock Observe');
    ok('...or a steps field of its own, when it has one filled in', stepsOf(REPORT_DESC(), adf([], ['Open the map', 'Zoom'])) === 'Open the map Zoom' &&
        stepsOf(REPORT_DESC(), adf([])).trim() === '1. undock 2. it crashes');
    ok('...and nothing when none of them is there', stepsOf(adf(['just prose about undocking']), null) === '');
    ok('the report\'s labels left on the defect, cloned and jira_escalated aside', J(C._reportLabels(['PlatformWin', 'cloned', 'jira_escalated', 'Crash'], ['PlatformWin', 'cloned', 'jira_escalated'])) === J(['PlatformWin']));
    ok('the labels a defect has of its own: none of the report\'s, nor cloned and jira_escalated', J(C._ownLabels(['PlatformWin', 'cloned', 'jira_escalated', 'Crash', 'ui'], ['PlatformWin'])) === J(['Crash', 'ui']) &&
        J(C._ownLabels(['Crash'], undefined)) === J(['Crash']));
    ok('an exception in the description by its signature', C._hasExc({ desc: '', fps: [{ sig: EXC.sig }] }, [EXC]));
    ok('...or by its crash site', C._hasExc({ desc: '', fps: [{ sig: "keyerror: 'x'|z.py:q>b.py:g>c.py:h" }] }, [EXC]));
    ok('...or by its message', C._hasExc({ desc: 'see KeyError: \'x\' raised while undocking, every time', fps: [] }, [EXC]));
    ok('...but not by a short one, nor without it', !C._hasExc({ desc: 'error', fps: [] }, [{ sig: 'e|a:b>c:d', msg: 'error' }]) && !C._hasExc({ desc: 'nothing', fps: [] }, [EXC]));
    const doc = adf(['first']), withX = C._withExpand(doc, 'KeyError', 'Traceback...');
    ok('the exception goes at the end of the description, in an expand holding a code block', withX.content.length === 2 && withX.content[1].type === 'expand' &&
        withX.content[1].attrs.title === 'KeyError' && withX.content[1].content[0].type === 'codeBlock' && withX.content[1].content[0].content[0].text === 'Traceback...', J(withX.content[1]));
    ok('...without touching the description it was given', doc.content.length === 1);
    ok('...a defect without a description gets one', J(C._withExpand(null, 'T', 'x')) === J({ type: 'doc', version: 1, content: [{ type: 'expand', attrs: { title: 'T' }, content: [{ type: 'codeBlock', attrs: {}, content: [{ type: 'text', text: 'x' }] }] }] }));
    ok('...and an empty text is the title, never an empty text node', C._withExpand(null, 'T', '').content[0].content[0].content[0].text === 'T');
    ok('an expand\'s title is the message\'s first line, cut at 120', C._title({ msg: 'first line\nsecond' }) === 'first line' && C._title({ msg: 'x'.repeat(200) }).length === 120 && C._title({}) === 'Exception');

    // ================= the items =================
    const factsOf = (issue, h, src) => C._facts(issue, h || [], src === undefined ? srcObj() : src);
    let d = factsOf(converted()), items = C.items(d);
    const openIds = (its) => its.filter((it) => !it.ok && !it.waived).map((it) => it.id).join(',');
    ok('a defect as the conversion leaves it has every item open but the ones it cannot get wrong, in the order a hunter works through them',
        openIds(items) === 'summary,desc,steps,attachments,replabels,labels,fields,build', openIds(items));
    ok('...all of them in that order: text, attachments and labels, then the fields, the exception last', (() => {
        const s = srcObj(); s.exc = [EXC];
        return C.items(C._facts(converted(), [], s)).map((it) => it.id).join(',') === 'summary,desc,steps,attachments,replabels,labels,fields,build,fc,exc';
    })(), (() => { const s = srcObj(); s.exc = [EXC]; return C.items(C._facts(converted(), [], s)).map((it) => it.id).join(','); })());
    ok('...Priority and Team named as left empty for FC to set', byId(items, 'fc').label === 'Priority and Team fields left empty for FC to set' && byId(items, 'fc').ok);
    ok('...its summary is still the report\'s: Summary rewritten, a fitting title in the hover', byId(items, 'summary').label === 'Summary rewritten' &&
        byId(items, 'summary').why === 'Give your defect a fitting title.', byId(items, 'summary').label + ' / ' + byId(items, 'summary').why);
    ok('...no project item, nor one for capital letters', !byId(items, 'project') && !byId(items, 'caps'));
    ok('...so is its description, and its labels', /Still the bug report's description/.test(byId(items, 'desc').why) && /PlatformWin/.test(byId(items, 'replabels').why) && J(byId(items, 'replabels').left) === J(['PlatformWin']));
    ok('...and its reproduction steps, word for word', byId(items, 'steps').label === 'Reproduction steps rewritten' && /Still the bug report's reproduction steps, word for word/.test(byId(items, 'steps').why));
    ok('...its attachments wait for its writer to check them, the report\'s named as such', (() => {
        const it = byId(items, 'attachments'); return !it.ok && it.tick && !it.waivable && /Check they belong to this defect: logs\.txt \(from the bug report\)\./.test(it.why);
    })(), byId(items, 'attachments').why);
    ok('...no logs item: the player\'s logs are fine', !byId(items, 'logs'));
    ok('...its EVE Server and EVE Build are still the player\'s, named, to be set or marked as correct', (() => {
        const it = byId(items, 'build');
        return it.label === 'EVE Server and EVE Build set to where you reproduced it' && /^Still the bug report's, where the player was: Tranquility, build 2900123\. Set them to the server and build you reproduced it on, or mark them as correct if you reproduced it there\./.test(it.why) &&
            it.tick && it.tickLabel === 'They are correct' && it.sig === 'tranquility|2900123' && !it.waivable;
    })(), byId(items, 'build').why);
    ok('...Severity and Impact are named as not set', byId(items, 'fields').why === 'Not set yet: Severity, Impact.', byId(items, 'fields').why);
    d = factsOf(finished());
    items = C.items(d);
    ok('a finished defect has every item done', openIds(items) === '' && items.every((it) => it.ok), openIds(items));
    ok('...and says nothing is missing', items.every((it) => it.why === ''));
    const sumOf = (summary) => { const i = finished(); i.fields.summary = summary; return byId(C.items(factsOf(i)), 'summary'); };
    ok('a summary with a tag is fine: only the report\'s summary is not', sumOf('[UI] Overview flickers').ok && sumOf('NPE: wallet fails').ok && !sumOf('Game crash when undock').ok);
    ok('...and its label says nothing of tags', !/tag/i.test(byId(items, 'summary').label));
    // where it was tested: the EVE Server and EVE Build fields
    const eveOf = (server, build, paras) => { const i = finished(); i.fields.customfield_105 = server; i.fields.customfield_106 = build; if (paras) { i.fields.description = adf(paras, ['a', 'b']); } return byId(C.items(factsOf(i)), 'build'); };
    ok('EVE Server and EVE Build set to something other than the player\'s are done', eveOf({ value: 'Singularity' }, '2945678', ['no server here']).ok &&
        eveOf({ value: 'Singularity' }, '2945678', ['no server here']).label === 'EVE Server and EVE Build set to where you reproduced it');
    ok('...one of them changed is enough', eveOf({ value: 'Tranquility' }, '2945678', ['no server here']).ok && eveOf({ value: 'Singularity' }, '2900123', ['no server here']).ok);
    ok('...both the player\'s still are not, whatever case or spacing, and the old way does not make up for it', (() => {
        const it = eveOf({ value: ' tranquility ' }, '2900123', ['Singularity 2945678', 'x']); return !it.ok && it.tick;
    })());
    const tickedEve = (sig, server) => { const i = finished(); i.fields.customfield_105 = { value: server || 'Tranquility' }; i.fields.customfield_106 = '2900123';
        i.properties = { 'jita.checklist': { v: 1, ok: { attachments: finished().properties['jita.checklist'].ok.attachments, build: { by: 'acc-rep', name: 'Hunter', at: '2026-11-08', sig: sig } } } };
        return byId(C.items(factsOf(i)), 'build'); };
    ok('...until marked as correct, for those values', (() => { const it = tickedEve('tranquility|2900123'); return it.ok && it.tick && it.mark && it.mark.name === 'Hunter'; })());
    ok('...a mark for other values does not count', !tickedEve('singularity|2900123').ok);
    ok('...nor is a mark asked for once they are changed', (() => { const it = tickedEve('tranquility|2900123', 'Duality'); return it.ok && !it.tick; })());
    ok('...and a defect from scratch has nothing to compare them with', (() => { const i = finished(); i.fields.customfield_105 = { value: 'Tranquility' }; i.fields.customfield_106 = '2900123'; return byId(C.items(C._facts(i, [], null)), 'build').ok; })());
    ok('...one empty is named', (() => { const it = eveOf({ value: 'Tranquility' }, null, ['no server here']); return !it.ok && /^Fill in EVE Build with the server and build you reproduced it on/.test(it.why) && !it.tick; })());
    ok('...the old way, at the top of the description, does as well', eveOf(null, null, ['Tranquility 2945678', 'x']).ok);
    ok('...and the report\'s build is named when its log said', (() => { const s = srcObj(); s.build = 2900000; const i = finished(); i.fields.customfield_106 = null; i.fields.description = adf(['nothing'], ['a', 'b']); const it = byId(C.items(C._facts(i, [], s)), 'build'); return !it.ok && /written by build 2900000/.test(it.why); })());
    ok('...with the fields, no template to copy', !byId(items, 'build').copy);
    // the old way, where the defect has no such fields
    const descOf = (paras, list, names) => { const i = finished(); i.names = names || OLD_NAMES; i.fields.description = adf(paras, list); return C.items(factsOf(i)); };
    ok('without the fields: the server and build at the top', byId(descOf(['Tranquility 2945678', 'x'], ['a', 'b']), 'build').ok && byId(descOf(['Tranquility 2945678', 'x'], ['a', 'b']), 'build').label === 'Server and build you reproduced it on, at the top');
    ok('...a missing build is named, with the report\'s build when its log said', (() => { const s = srcObj(); s.build = 2900000; const i = finished(); i.names = OLD_NAMES; i.fields.description = adf(['Singularity', 'no number'], ['a', 'b']); const it = byId(C.items(C._facts(i, [], s)), 'build'); return !it.ok && /No build number/.test(it.why) && /build 2900000/.test(it.why); })());
    ok('...a missing server too', /No server name/.test(byId(descOf(['build 2945678'], ['a', 'b']), 'build').why));
    ok('...both far down the description are not at the top', !byId(descOf(['x'.repeat(320) + ' Tranquility 2945678'], ['a', 'b']), 'build').ok);
    ok('...and a template to copy', /Server: \nBuild: /.test(byId(descOf(['nothing'], ['a', 'b']), 'build').copy));
    // server names from the EVE Server field's options
    ok('the top of the description is read for the server names the EVE Server field offers', (() => {
        const i = finished(); i.names = OLD_NAMES; i.fields.description = adf(['Duality 2945678', 'x']);
        const off = byId(C.items(C._facts(i, [], srcObj(), ['Tranquility', 'Singularity'])), 'build'), on = byId(C.items(C._facts(i, [], srcObj(), ['Tranquility', 'Duality'])), 'build');
        return !off.ok && /No server name \(Tranquility, Singularity\)/.test(off.why) && on.ok;
    })());
    ok('...the built-in names when none are given', (() => { const d0 = C._facts(finished(), [], srcObj()); return J(d0.servers) === J(C.SERVER_NAMES); })());
    // reproduction steps: in any form, just not the bug report's
    ok('reproduction steps rewritten in plain words, no list needed, are done', byId(descOf(['Tranquility 2945678', 'Dock in Jita, undock, and it crashes.']), 'steps').ok);
    ok('...the report\'s steps kept word for word are not, whatever is around them', (() => { const it = byId(descOf(['Tranquility 2945678', 'My own: dock and undock.', 'Reproduction Steps: 1. undock 2. it crashes']), 'steps'); return !it.ok && /word for word/.test(it.why); })());
    ok('...nor kept below the hunter\'s own list', !byId(descOf(['Tranquility 2945678', 'Reproduction Steps: 1. undock 2. it crashes'], ['Dock', 'Undock']), 'steps').ok);
    ok('...in a steps field of its own, too', (() => {
        const i = finished(); i.names = Object.assign({ customfield_107: 'Steps to Reproduce' }, NAMES); i.fields.customfield_107 = adf(['Reproduction Steps: 1. undock 2. it crashes']);
        return !byId(C.items(factsOf(i)), 'steps').ok;
    })());
    ok('...a report\'s short steps are not looked for, so nothing is asked', (() => { const s = srcObj(); s.steps = '1. undock'; return !byId(C.items(C._facts(converted(), [], s)), 'steps'); })());
    ok('...with no report\'s steps to go by, a steps field of its own must be filled in', (() => {
        const i = finished(); i.names = Object.assign({ customfield_107: 'Steps to Reproduce' }, NAMES); i.fields.customfield_107 = null;
        const empty = byId(C.items(C._facts(i, [], null)), 'steps');
        i.fields.customfield_107 = adf(['dock, then undock']);
        const full = byId(C.items(C._facts(i, [], null)), 'steps');
        return empty && !empty.ok && empty.label === 'Steps to Reproduce filled in' && /Write the reproduction steps into Steps to Reproduce/.test(empty.why) && full.ok;
    })());
    ok('...and a defect from scratch without one has no steps item: Also check reminds of them', !byId(C.items(C._facts(finished(), [], null)), 'steps') && C.MORE.some((m) => /Reproduction steps/.test(m)));
    ok('the steps item offers a template to copy', /^Reproduction steps:\n1\. /.test(byId(C.items(factsOf(converted())), 'steps').copy));
    ok('...as a real numbered list too, its three steps empty but the last', (() => {
        const it = byId(C.items(factsOf(converted())), 'steps');
        return it.copy === C.STEPS_TEXT && /^<p>Reproduction steps:<\/p><ol><li><p><\/p><\/li><li><p><\/p><\/li><li><p>Observe that <\/p><\/li><\/ol>$/.test(it.html);
    })(), byId(C.items(factsOf(converted())), 'steps').html);
    ok('...from either form of the item', (() => {
        const i = finished(); i.names = Object.assign({ customfield_107: 'Steps to Reproduce' }, NAMES); i.fields.customfield_107 = null;
        const it = byId(C.items(C._facts(i, [], null)), 'steps'); return it.copy === C.STEPS_TEXT && it.html === C.STEPS_HTML;
    })());
    ok('the old way\'s server and build template, as text and rich text', (() => { const it = byId(descOf(['nothing'], ['a', 'b']), 'build'); return it.copy === C.BUILD_TEXT && it.html === C.BUILD_HTML && /^<p>Server: <\/p><p>Build: <\/p>$/.test(C.BUILD_HTML); })());
    // the attachments, ticked off by their writer
    const attOf = (att, ok0) => { const i = finished(); i.fields.attachment = att; if (ok0 !== undefined) { i.properties = { 'jita.checklist': { v: 1, ok: ok0 } }; } return byId(C.items(factsOf(i)), 'attachments'); };
    const ATT = [{ filename: 'logs.txt', size: 100 }, { filename: 'loglite.txt', size: 5 }];
    ok('attachments ticked off for the set they are count as checked', attOf(ATT, { attachments: { by: 'acc-rep', name: 'Hunter', at: '2026-11-08', sig: C._attSig(ATT) } }).ok);
    ok('...one added since asks again, saying who checked them and when', (() => {
        const it = attOf(ATT.concat([{ filename: 'shot.png', size: 9 }]), { attachments: { by: 'acc-rep', name: 'Hunter', at: '2026-11-08', sig: C._attSig(ATT) } });
        return !it.ok && /^They changed since Hunter checked them on 2026-11-08: check them again\./.test(it.why);
    })(), attOf(ATT.concat([{ filename: 'shot.png', size: 9 }]), { attachments: { by: 'acc-rep', name: 'Hunter', at: '2026-11-08', sig: C._attSig(ATT) } }).why);
    ok('...none at all is asked about too, the tick saying None needed', (() => { const it = attOf([], {}); return !it.ok && it.tickLabel === 'None needed' && it.tickTitle === 'This defect needs no attachments' && /There are none/.test(it.why); })());
    ok('...some, They are good', (() => { const it = attOf(ATT, {}); return it.tickLabel === 'They are good' && /belong to this defect/.test(it.tickTitle); })());
    ok('...and the tick carries the set it is for', attOf(ATT, {}).sig === C._attSig(ATT));
    const fieldsOf = (sev, imp) => { const i = finished(); i.fields.customfield_101 = sev; i.fields.customfield_102 = imp; return byId(C.items(factsOf(i)), 'fields'); };
    ok('Severity and Impact: an unset one is named', fieldsOf({ value: 'A' }, null).why === 'Not set yet: Impact.', fieldsOf({ value: 'A' }, null).why);
    ok('...both set is done, and nothing asks for a State', fieldsOf({ value: 'A' }, { value: 'Minor' }).ok && fieldsOf({ value: 'A' }, { value: 'Minor' }).label === 'Severity and Impact set');
    ok('...a field this Jira does not have is not asked for, and with none of them, no item', (() => {
        const i = finished(); i.names = { summary: 'Summary' }; return !byId(C.items(factsOf(i)), 'fields');
    })());
    ok('...with Severity and no Impact field, Severity alone', (() => {
        const i = finished(); i.names = { customfield_101: 'Severity' }; const it = byId(C.items(factsOf(i)), 'fields'); return it && it.ok;
    })());
    ok('...with some of them, those are asked for', (() => {
        const i = finished(); i.names = { customfield_101: 'Severity', customfield_102: 'Impact' }; i.fields.customfield_102 = null;
        const it = byId(C.items(factsOf(i)), 'fields'); return it && !it.ok && it.why === 'Not set yet: Impact.';
    })());
    ok('Priority and Team: one the reporter set is named', (() => { const i = finished(); i.fields.customfield_10001 = { name: 'Core' }; const it = byId(C.items(factsOf(i)), 'fc'); return !it.ok && /Set on this defect by its reporter: Team\. Put Priority back, and leave Team empty\.$/.test(it.why); })());
    ok('a label in lower case is fine now: there is no such item', (() => { const i = finished(); i.fields.labels = ['undock', 'Crash']; return !byId(C.items(factsOf(i)), 'caps'); })());
    ok('a defect written from scratch has no rewrite or report-label items', (() => { const ids = C.items(C._facts(finished(), [], null)).map((it) => it.id).join(','); return ids.indexOf('desc') < 0 && ids.indexOf('replabels') < 0 && ids.indexOf('attachments') >= 0; })());
    ok('a defect outside EDR is fine: there is no project item', (() => { const i = finished(); i.key = 'EO-5'; return !byId(C.items(factsOf(i)), 'project'); })());
    // labels: the report's taken off, and some of its own added
    const labelsOf = (labels, src) => { const i = finished(); i.fields.labels = labels; return C.items(C._facts(i, [], src === undefined ? srcObj() : src)); };
    ok('the report\'s labels left on can only be taken off: Not needed is not offered', (() => { const it = byId(labelsOf(['PlatformWin', 'Crash']), 'replabels'); return !it.ok && !it.waivable && /^Still the bug report's: PlatformWin\. Take them off; cloned and jira_escalated stay\.$/.test(it.why); })(),
        byId(labelsOf(['PlatformWin', 'Crash']), 'replabels').why);
    ok('right after it: Add appropriate labels, with the suggestions under it', (() => {
        const its = labelsOf(['cloned']), ids = its.map((x) => x.id), it = byId(its, 'labels');
        return ids.indexOf('labels') === ids.indexOf('replabels') + 1 && it.label === 'Add appropriate labels' && !it.ok && it.suggest && it.waivable &&
            /^No labels of its own yet\. Add the ones that fit the bug/.test(it.why);
    })());
    ok('...done with one of its own', byId(labelsOf(['Undock', 'cloned']), 'labels').ok);
    ok('...the report\'s, cloned and jira_escalated are none of its own', !byId(labelsOf(['PlatformWin', 'Russian', 'cloned', 'jira_escalated']), 'labels').ok);
    ok('...and a defect from scratch has the item too, any label but cloned and jira_escalated counting', byId(labelsOf(['PlatformWin'], null), 'labels').ok && !byId(labelsOf(['cloned'], null), 'labels').ok);
    // the exception item
    const withExc = (descParas, exc) => { const s = srcObj(); s.exc = exc; const i = finished(); if (descParas) { i.fields.description = adf(descParas, ['a', 'b']); } return byId(C.items(C._facts(i, [], s)), 'exc'); };
    ok('no exception item while the report\'s logs hold none', !withExc(null, []) && !withExc(null, undefined));
    ok('...an open one when they hold some the description does not', (() => { const it = withExc(['Tranquility 2945678', 'no exception here'], [EXC]); return it && !it.ok && it.waivable && /logs hold 1 exception/.test(it.why); })());
    ok('...saying to add the exceptions related to the bug', withExc(['x'], [EXC]).label === 'Add exceptions related to the bug to your defect description', withExc(['x'], [EXC]).label);
    ok('...done once the description holds one of them', withExc(['Tranquility 2945678', 'EXC[' + EXC.sig + ']'], [EXC]).ok);
    // waivers
    const waived = (ids) => { const i = converted(); i.properties = { 'jita.checklist': { v: 1, w: ids } }; return C.items(factsOf(i)); };
    ok('an item marked Not needed counts as done, and says who marked it', (() => { const it = byId(waived({ labels: { by: 'acc-rep', name: 'Hunter', at: '2026-11-08' } }), 'labels'); return !it.ok && it.waived && it.by.name === 'Hunter'; })());
    ok('...only items the guide lets a defect go without: a Not needed the report\'s labels had before counts no more', (() => {
        const its = waived({ summary: { by: 'x' }, steps: { by: 'x' }, attachments: { by: 'x' }, replabels: { by: 'x' }, build: { by: 'x' } });
        return ['summary', 'steps', 'attachments', 'replabels', 'build'].every((id) => !byId(its, id).waived);
    })());
    ok('...which are labels of its own and the exception', (() => { const s = srcObj(); s.exc = [EXC]; return C.items(C._facts(converted(), [], s)).filter((it) => it.waivable).map((it) => it.id).join(',') === 'labels,exc'; })(),
        (() => { const s = srcObj(); s.exc = [EXC]; return C.items(C._facts(converted(), [], s)).filter((it) => it.waivable).map((it) => it.id).join(','); })());

    // ---- the state ----
    let s0 = srcObj(), st = C._judge(C._facts(finished(), [], s0), 'reporter', 'acc-rep', []);
    ok('while the report\'s logs are read the card cannot be finished, though nothing is open', st.pending && st.open === 0 && !st.complete);
    s0.failed = true;
    st = C._judge(C._facts(finished(), [], s0), 'reporter', 'acc-rep', []);
    ok('...logs that could not be read hold nothing up', !st.pending && st.complete);
    st = C._judge(C._facts(converted(), [], srcObj()), 'reporter', 'acc-rep', []);
    ok('the open items are counted', st.open === 8 && !st.complete, String(st.open));

    // ================= who sees it =================
    const whoOf = (rep, name) => C._who({ fields: { reporter: { accountId: rep, displayName: name } } }, 'acc-me');
    ok('the defect\'s reporter', (await whoOf('acc-me', 'ISD BH Me')) === 'reporter');
    isLead = false;
    ok('...not another bug hunter', (await whoOf('acc-rep', 'ISD BH Hunter')) === '');
    isLead = true;
    ok('a Lead on an ISD member\'s defect', (await whoOf('acc-rep', 'ISD BH Hunter')) === 'lead');
    groupMembers = [{ accountId: 'acc-renamed' }];
    ok('...known by the ISD group when the name does not say', (await whoOf('acc-renamed', 'Hunter')) === 'lead');
    ok('...not on anyone else\'s', (await whoOf('acc-dev', 'FC Developer')) === '');
    isLead = false;

    // ================= reading and drawing =================
    issueOf = { 'EDR-1': converted() };
    sourceOf = { 'EBR-10': SRC };
    histOf = {};
    readOf = { 'EBR-10': { rec: { logs: true, exc: [EXC, { sig: 'usererror: no|a:b>c:d', msg: 'UserError' }], build: 2900000 } } };
    holdingOf = { 'EDR-7': { kind: 'exact', hits: [{ sig: EXC.sig, kind: 'exact' }] }, 'EDR-1': { kind: 'exact', hits: [{ sig: EXC.sig }] } };
    me = 'acc-rep';
    const states = [];
    let last2 = await C.load('EDR-1', (s) => { states.push(s); });
    ok('a load draws twice: the defect and its report first, then what the report\'s logs hold', states.length === 2 && states[0].pending && !states[1].pending, states.map((s) => s.pending).join());
    ok('...the exceptions that count, each with the other defects holding it', J(last2.src.exc) === J([{ sig: EXC.sig, msg: EXC.msg, defects: ['EDR-7'] }]), J(last2.src.exc));
    ok('...and the exception item comes with them', !!byId(last2.items, 'exc') && !byId(states[0].items, 'exc'));
    ok('...with the build the report\'s log was written by', /written by build 2900000/.test(byId(last2.items, 'build').why), byId(last2.items, 'build').why);
    readOf = { 'EBR-10': new Error('403') };
    last2 = await C.load('EDR-1', () => {});
    ok('logs that cannot be read: said, and nothing is held up for them', last2.src.failed && !last2.pending && !byId(last2.items, 'exc'));
    readOf = { 'EBR-10': { rec: { logs: false, exc: [] } } };
    last2 = await C.load('EDR-1', () => {});
    ok('...a reading that never got its logs is no reading either', last2.src.failed && !last2.pending);
    // the server names a load reads the top of the description by: the EVE Server field's options
    delete gmStore[C.SERVERS_KEY];
    editmetaOf = { 'EDR-1': { fields: { customfield_105: { allowedValues: [{ value: 'Chaos' }] } } } };
    const iChaos = converted(); iChaos.fields.description = adf(['Chaos 2945678', 'Undocking crashes the client.']);
    iChaos.fields.customfield_105 = null; iChaos.fields.customfield_106 = null;   // empty: the old way decides
    issueOf = { 'EDR-1': iChaos };
    last2 = await C.load('EDR-1', () => {});
    ok('a load reads the top of the description for the servers the EVE Server field offers', byId(last2.items, 'build').ok, byId(last2.items, 'build').why);
    ok('...and keeps what Jira says the defect was last updated', C._upd['EDR-1'] === '', J(C._upd));
    editmetaOf = {}; delete gmStore[C.SERVERS_KEY];
    iChaos.fields.updated = '2026-11-08T12:00:00.000+0000';
    await C.load('EDR-1', () => {});
    ok('...its `updated`, for the checks to compare with', C._upd['EDR-1'] === '2026-11-08T12:00:00.000+0000', J(C._upd));
    issueOf = { 'EDR-1': converted() };
    // a load that fails once it knows who is looking says who
    histOf['EDR-1'] = new Error('HTTP 500 from Jira');
    let lerr = null;
    try { await C.load('EDR-1', () => {}); } catch (e) { lerr = e; }
    ok('a load that fails once it knows who is looking says who it was', !!lerr && lerr.message === 'HTTP 500 from Jira' && lerr.sees === 'reporter' && lerr.me === 'acc-rep', lerr && J({ m: lerr.message, s: lerr.sees, me: lerr.me }));
    delete histOf['EDR-1'];
    readOf = { 'EBR-10': { rec: { logs: true, exc: [EXC], build: null } } };
    me = 'acc-other';
    gets = [];
    last2 = await C.load('EDR-1', () => {});
    ok('someone the card is not for reads nothing more than who wrote the defect', last2.sees === '' && !last2.items && J(gets) === J(['/rest/api/3/issue/EDR-1?fields=reporter']), J(gets));
    me = 'acc-rep';

    // the bug report's steps, from a steps field of their own
    sourceOf['EBR-11'] = { key: 'EBR-11', fields: { summary: 's', description: REPORT_DESC(), labels: [], attachment: [], customfield_107: adf([], ['Open the map', 'Zoom']) } };
    gets = [];
    const s11 = await C._readSource('EBR-11', { steps: 'customfield_107' });
    ok('the bug report\'s steps are read from the steps field when the defect\'s Jira has one', s11.steps === 'Open the map Zoom' &&
        gets.some((p) => /EBR-11\?fields=summary,description,labels,attachment,customfield_107$/.test(p)), s11.steps + ' / ' + J(gets));
    gets = [];
    const s10 = await C._readSource('EBR-10', { server: 'customfield_105', build: 'customfield_106' });
    ok('...else from its description\'s Reproduction Steps', s10.steps.trim() === '1. undock 2. it crashes', s10.steps);
    ok('its EVE Server and EVE Build, the player\'s, are read too', s10.eveServer === 'Tranquility' && s10.eveBuild === '2900123' &&
        gets.some((p) => /EBR-10\?fields=summary,description,labels,attachment,customfield_105,customfield_106$/.test(p)), J([s10.eveServer, s10.eveBuild]) + ' ' + J(gets));
    const sNone = await C._readSource('EBR-10', {});
    ok('...and nothing is asked for where this Jira has no such fields', sNone.eveServer === '' && sNone.eveBuild === '', J([sNone.eveServer, sNone.eveBuild]));

    // ---- the card ----
    meta = {}; C._labelsP = null;
    searchAnswer = [{ fields: { labels: ['Undock', 'Overview'] } }, { fields: { labels: ['Undock', 'Overview'] } }];
    onScreen = 'EDR-1';
    C.ensure();
    await settle();
    let g = document.getElementById(C.GROUP_ID), body = g && g.find('#jita-cl');
    ok('the card is mounted right under Details', !!g && anchor.nextSibling === g);
    ok('...its title says how many items are open', g && g.querySelector('[data-jita-title]') && g.querySelector('[data-jita-title]').textContent === 'Defect checklist · 9 open', g && g.querySelector('[data-jita-title]') && g.querySelector('[data-jita-title]').textContent);
    ok('...it names the bug report it was compared with', /Compared with EBR-10, the bug report it was converted from/.test(byCls(body, 'jcl-src')[0].textContent));
    const rows = byCls(body, 'jcl-item');
    ok('...one row per item, open ones marked ○, done ones ✓', rows.length === C.items(C._facts(converted(), [], Object.assign(srcObj(), { exc: [EXC] }))).length &&
        byCls(rows.filter((r) => r.attrs['data-item'] === 'summary')[0], 'jcl-mark')[0].textContent === '○' &&
        byCls(rows.filter((r) => r.attrs['data-item'] === 'fc')[0], 'jcl-mark')[0].textContent === '✓');
    ok('...with what is missing in the hover', byCls(rows.filter((r) => r.attrs['data-item'] === 'summary')[0], 'jcl-lbl')[0].attrs.title === 'Give your defect a fitting title.');
    const actsOf = (id) => byCls(rows.filter((r) => r.attrs['data-item'] === id)[0], 'jcl-act').map((a) => a.textContent).join(',');
    ok('the reporter may take the report\'s labels off, but not mark them not needed', actsOf('replabels') === 'Take off', actsOf('replabels'));
    ok('...mark the player\'s EVE Server and EVE Build as correct, copy a template for the steps', actsOf('build') === 'They are correct' && actsOf('steps') === 'Copy', actsOf('build') + ' / ' + actsOf('steps'));
    ok('...and mark labels of its own not needed, the suggested ones listed right under that item', (() => {
        const list = byCls(body, 'jcl-items')[0], kids = list.kids, at = kids.findIndex((k) => k.attrs && k.attrs['data-item'] === 'labels');
        return actsOf('labels') === 'Not needed' && at >= 0 && kids[at + 1] && kids[at + 1].hasClass('jcl-sugg') && byCls(body, 'jcl-sugg').length === 1;
    })(), actsOf('labels'));
    copied = []; copiedHtml = [];
    byCls(rows.filter((r) => r.attrs['data-item'] === 'steps')[0], 'jcl-act')[0].fire('click');
    await settle();
    ok('...which copies the steps as text, and as a numbered list for Jira\'s editor', copied[0] === C.STEPS_TEXT && copiedHtml[0] === C.STEPS_HTML, J(copied) + ' ' + J(copiedHtml));
    ok('...and nothing on a done item, nor a way to skip the summary', actsOf('fc') === '' && actsOf('summary') === '');
    const excRows = byCls(body, 'jcl-erow');
    ok('the report\'s exceptions are listed with the defects holding them', excRows.length === 1 && /KeyError/.test(byCls(excRows[0], 'jcl-emsg')[0].textContent) &&
        byCls(excRows[0], 'jcl-edef')[0].textContent === 'EDR-7');
    ok('...each with Add alone: no Copy', byCls(excRows[0], 'jcl-act').map((a) => a.textContent).join(',') === 'Add', byCls(excRows[0], 'jcl-act').map((a) => a.textContent).join(','));
    const chips = byCls(body, 'jcl-chip');
    ok('the reporter gets labels suggested from the defect\'s text', chips.map((c) => c.textContent).join(',') === '+ Undock' && /On 2 other defects/.test(chips[0].attrs.title),
        chips.map((c) => c.textContent).join(','));
    ajaxLog = []; confirms = []; confirmAnswer = false; reloads = 0;
    chips[0].fire('click');
    await settle();
    ok('...a click asks first, and a no adds nothing', confirms.length === 1 && confirms[0] === 'Add the label Undock to EDR-1?' && !puts().length && !reloads && !refreshes().length, confirms[0]);
    confirmAnswer = true; toasts = []; jiraEvents = []; gets = [];
    chips[0].fire('click');
    await settle();
    ok('...a yes adds it', puts().length === 1 && J(puts()[0].body) === J({ update: { labels: [{ add: 'Undock' }] } }), J(puts()));
    ok('...and Jira is told to read the issue again, so it shows the label and no edit there writes the old labels back', refreshes().length === 1 &&
        refreshes()[0].detail === null && toasts.some((t) => t === 'Added Undock to EDR-1.'), J(jiraEvents) + ' ' + toasts.join(' | '));
    await waitRefresh();
    ok('...with no reload once Jira shows it, and the card read again', reloads === 0 && gets.some((p) => /fields=\*all/.test(p)), reloads + ' ' + J(gets));
    let fin = byCls(body, 'jcl-finish')[0];
    ok('the hand-off waits for the last item', fin && fin.props.disabled === true && /9 items still open/.test(fin.attrs.title), fin && fin.attrs.title);
    ok('a defect that is no exploit keeps the exploit steps folded away', !byCls(body, 'jcl-warn').length && byCls(body, 'jcl-mline').some((l) => /Exploit/.test(l.textContent)));

    // a Lead's view
    isLead = true; me = 'acc-lead';
    await C.refresh('EDR-1');
    await settle();
    g = document.getElementById(C.GROUP_ID); body = g.find('#jita-cl');
    const leadActs = byCls(body, 'jcl-act').map((a) => a.textContent);
    ok('a Lead sees the card, but marks nothing and takes nothing off', leadActs.indexOf('Not needed') < 0 && leadActs.indexOf('Take off') < 0 && leadActs.indexOf('Add') < 0 && leadActs.indexOf('Copy') >= 0, leadActs.join(','));
    ok('...nor anything on the report\'s exceptions', !byCls(byCls(body, 'jcl-erow')[0], 'jcl-act').length);
    ok('...nor gets labels suggested to add', !byCls(body, 'jcl-sugg').length);
    isLead = false; me = 'acc-rep';

    // a finished defect
    issueOf['EDR-1'] = finished();
    await C.refresh('EDR-1');
    await settle();
    g = document.getElementById(C.GROUP_ID); body = g.find('#jita-cl');
    ok('a finished defect reads Ready for FC, in its title too', byCls(body, 'jcl-count')[0].textContent === 'Ready for FC' && g.querySelector('[data-jita-title]').textContent === 'Defect checklist · ready');
    fin = byCls(body, 'jcl-finish')[0];
    ok('...and its hand-off is offered', fin && !fin.props.disabled && fin.handlers.click && fin.handlers.click.length === 1);
    ok('a severity A defect shows the exploit steps in plain sight', byCls(body, 'jcl-warn').length === 1 && /Liaison/.test(byCls(body, 'jcl-warn')[0].textContent));
    ok('an exception the description holds already is no longer offered for Add', byCls(body, 'jcl-erow').length === 1 && !byCls(byCls(body, 'jcl-erow')[0], 'jcl-act').length);

    // ---- the hand-off ----
    ajaxLog = []; confirms = []; confirmAnswer = false; reloads = 0;
    fin.fire('click');
    await settle();
    ok('the unassign asks first, and a no writes nothing', confirms.length === 1 && confirms[0] === 'Unassign EDR-1 and hand it to FC?' && !puts().length && !reloads, confirms[0]);
    confirmAnswer = true; jiraEvents = []; toasts = [];
    fin.fire('click');
    await settle();
    ok('...a yes unassigns it', puts().length === 1 && puts()[0].path === '/rest/api/3/issue/EDR-1/assignee' && J(puts()[0].body) === J({ accountId: null }), J(puts()));
    ok('...with the token Jira wants for a write', puts()[0].headers['X-Atlassian-Token'] === 'no-check');
    await waitRefresh();
    ok('...and Jira shows it, with no reload', refreshes().length === 1 && reloads === 0 && toasts.some((t) => t === 'EDR-1 is unassigned: FC picks it up from here.'), refreshes().length + ' ' + reloads + ' ' + toasts.join(' | '));

    // ---- nobody unassigns an unfinished defect ----
    issueOf['EDR-1'] = converted();
    await C.refresh('EDR-1');
    await settle();
    const pick = (text, type) => {
        let stopped = 0, prevented = 0;
        const opt = { textContent: text };
        C._onPick({ type: type || 'click', target: { closest: (sel) => (/option/.test(sel) ? opt : null) }, preventDefault() { prevented++; }, stopPropagation() { stopped++; }, stopImmediatePropagation() { stopped++; } });
        return prevented && stopped;
    };
    toasts = [];
    ok('"Unassigned" picked in Jira\'s assignee field is refused while items are open', !!pick('Unassigned'));
    ok('...saying why', toasts.length === 1 && /stays assigned until the Defect checklist is done: 9 items still open/.test(toasts[0]), toasts.join(' | '));
    ok('...the mousedown too, so the picker never hears of it', !!pick('Unassigned', 'mousedown') && toasts.length === 1);
    ok('...but nobody else is picked for', !pick('Bob Builder') && !pick('Assign to me'));
    ok('the guard is bound in the capture phase', listeners.some((l) => l.ev === 'click' && l.cap === true && l.fn === C._onPick) && listeners.some((l) => l.ev === 'mousedown' && l.cap === true));
    issueOf['EDR-1'] = finished();
    await C.refresh('EDR-1');
    await settle();
    ok('...and a finished one may be unassigned in Jira itself', !pick('Unassigned'));
    const i4 = finished(); i4.fields.assignee = null;
    issueOf['EDR-1'] = i4;
    histOf['EDR-1'] = [{ author: { accountId: 'acc-rep' }, created: new Date(Date.now() - 20000).toISOString(), items: [{ field: 'assignee', fieldId: 'assignee', from: 'acc-rep', to: null }] }];
    ajaxLog = [];
    await C.refresh('EDR-1');
    await settle();
    ok('...an unassign of a finished defect stays', !puts().length);
    const i5 = converted(); i5.fields.assignee = null;
    issueOf['EDR-1'] = i5;
    histOf['EDR-1'] = [];
    await C.refresh('EDR-1');
    await settle();
    ok('...and on a defect nobody has, there is nothing to refuse', !pick('Unassigned'));
    // a defect a developer took is with FC already
    const i6 = converted(); i6.fields.assignee = { accountId: 'acc-dev', displayName: 'FC Dev' };
    issueOf['EDR-1'] = i6;
    await C.refresh('EDR-1');
    await settle();
    let foot = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-foot')[0];
    ok('a defect a developer took offers no hand-off: it is with FC', !byCls(foot, 'jcl-finish').length && /Assigned to FC Dev: with FC/.test(foot.textContent), foot.textContent);
    ok('...and its Unassigned is refused for nothing', !pick('Unassigned'));
    const i7 = converted(); i7.fields.assignee = null;
    issueOf['EDR-1'] = i7;
    histOf['EDR-1'] = [{ author: { accountId: 'acc-rep' }, created: new Date(Date.now() - 20000).toISOString(), items: [{ field: 'assignee', fieldId: 'assignee', from: 'acc-dev', to: null }] }];
    ajaxLog = [];
    await C.refresh('EDR-1');
    await settle();
    ok('...nor is it put back to the developer once unassigned', !puts().length);
    histOf['EDR-1'] = [];
    // an unassign that got past the picker
    const i3 = converted(); i3.fields.assignee = null;
    issueOf['EDR-1'] = i3;
    histOf['EDR-1'] = [{ author: { accountId: 'acc-rep' }, created: new Date(Date.now() - 20000).toISOString(), items: [{ field: 'assignee', fieldId: 'assignee', from: 'acc-rep', to: null }] }];
    ajaxLog = []; toasts = []; reloads = 0; jiraEvents = [];
    await C.refresh('EDR-1');
    await settle();
    ok('an unassign that got past it (a shortcut) is put back to its assignee', puts().length === 1 && puts()[0].path === '/rest/api/3/issue/EDR-1/assignee' && J(puts()[0].body) === J({ accountId: 'acc-rep' }), J(puts()));
    ok('...saying why', toasts.some((t) => /still open\. Hand it to FC from the card once they are done\. It was put back to its assignee\.$/.test(t)), toasts.join(' | '));
    ok('...and Jira is told to show it', refreshes().length === 1 && refreshes()[0].detail === null, J(jiraEvents));
    await waitRefresh();
    ok('...but never reloading the page unasked', reloads === 0);
    ajaxLog = [];
    await C.refresh('EDR-1');
    await settle();
    ok('...once: the same unassign is never put back twice', !puts().length);
    histOf['EDR-1'] = [];

    // ---- writes ----
    issueOf['EDR-1'] = converted();
    await C.refresh('EDR-1');
    await settle();
    ajaxLog = []; confirms = [];
    answers = { 'GET /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: false, status: 404 } };
    await C._waive('EDR-1', 'replabels', true);
    await settle();
    let put = puts()[0];
    ok('Not needed is kept on the issue, saying who and when, and asks nothing', confirms.length === 0 && put && put.path === '/rest/api/3/issue/EDR-1/properties/jita.checklist' &&
        put.body.v === 1 && put.body.w.replabels.by === 'acc-rep' && put.body.w.replabels.name === 'ISD BH Hunter' && !!put.body.w.replabels.at, J(put));
    ajaxLog = [];
    const KEPT = { v: 1, w: { replabels: { by: 'acc-rep' }, exc: { by: 'acc-rep' } }, ok: { attachments: { by: 'acc-rep', sig: 'logs.txt:100' } } };
    answers = { 'GET /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: true, data: { key: 'jita.checklist', value: KEPT } } };
    await C._waive('EDR-1', 'replabels', false);
    await settle();
    put = puts()[0];
    ok('...taking it back keeps the other marks, the ticks too (read again first)', put && J(put.body.w) === J({ exc: { by: 'acc-rep' } }) && J(put.body.ok) === J(KEPT.ok), put && J(put.body));
    // the attachments ticked off
    ajaxLog = [];
    answers = { 'GET /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: true, data: { key: 'jita.checklist', value: { v: 1, w: { exc: { by: 'acc-rep' } } } } } };
    await C._tick('EDR-1', 'attachments', 'logs.txt:100', true);
    await settle();
    put = puts()[0];
    ok('a tick is kept on the issue for the set of attachments it was for, saying who and when', put && put.body.ok.attachments.sig === 'logs.txt:100' &&
        put.body.ok.attachments.by === 'acc-rep' && put.body.ok.attachments.name === 'ISD BH Hunter' && !!put.body.ok.attachments.at && J(put.body.w) === J({ exc: { by: 'acc-rep' } }), put && J(put.body));
    ajaxLog = [];
    answers = { 'GET /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: true, data: { key: 'jita.checklist', value: KEPT } } };
    await C._tick('EDR-1', 'attachments', '', false);
    await settle();
    put = puts()[0];
    ok('...and taken back', put && J(put.body.ok) === '{}' && J(put.body.w) === J(KEPT.w), put && J(put.body));
    answers = {};
    // ...from the card: the reporter's "They are good"
    await C.refresh('EDR-1');
    await settle();
    let attRow = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-item').filter((r) => r.attrs['data-item'] === 'attachments')[0];
    let attActs = byCls(attRow, 'jcl-act');
    ok('the reporter ticks the attachments off on the card', attActs.map((a) => a.textContent).join(',') === 'They are good', attActs.map((a) => a.textContent).join(','));
    ajaxLog = []; confirms = []; toasts = []; gets = [];
    // as Jira answers it: no property yet, and the new one saved with 201 and no body
    answers = { 'GET /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: false, status: 404 },
        'PUT /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: true, status: 201, text: '' } };
    attActs[0].fire('click');
    await settle();
    ok('...a click ticks them for the set they are, asking nothing', confirms.length === 0 && puts().length === 1 && puts()[0].body.ok.attachments.sig === C._attSig(converted().fields.attachment), J(puts()));
    ok('...and Jira\'s empty answer counts as saved: no "Could not save", and the card is read again', !toasts.some((t) => /Could not save/.test(t)) &&
        gets.some((p) => /fields=\*all/.test(p)), toasts.join(' | ') + ' ' + J(gets));
    // ...and the player's EVE Server and EVE Build marked as correct
    const buildRow = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-item').filter((r) => r.attrs['data-item'] === 'build')[0];
    const buildAct = byCls(buildRow, 'jcl-act')[0];
    ajaxLog = []; confirms = [];
    answers = { 'GET /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: false, status: 404 } };
    ok('the reporter marks the player\'s EVE Server and EVE Build as correct on the card, saying what that means', buildAct.textContent === 'They are correct' && buildAct.attrs.title === 'You reproduced it on this server and build too');
    buildAct.fire('click');
    await settle();
    ok('...a click ticks them for the values they are, asking nothing', confirms.length === 0 && puts().length === 1 && puts()[0].body.ok.build.sig === 'tranquility|2900123' &&
        puts()[0].body.ok.build.by === 'acc-rep', J(puts()));
    answers = {};
    const iNone = converted(); iNone.fields.attachment = [];
    issueOf['EDR-1'] = iNone;
    await C.refresh('EDR-1');
    await settle();
    attRow = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-item').filter((r) => r.attrs['data-item'] === 'attachments')[0];
    ok('...with none, the button says None needed', byCls(attRow, 'jcl-act').map((a) => a.textContent).join(',') === 'None needed');
    const iTicked = converted(); iTicked.properties = { 'jita.checklist': { v: 1, ok: { attachments: { by: 'acc-rep', name: 'Hunter', at: '2026-11-08', sig: C._attSig(iTicked.fields.attachment) } } } };
    issueOf['EDR-1'] = iTicked;
    await C.refresh('EDR-1');
    await settle();
    attRow = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-item').filter((r) => r.attrs['data-item'] === 'attachments')[0];
    ok('...ticked, it says who checked them and when, and can be taken back', /^Checked by Hunter on 2026-11-08$/.test(byCls(attRow, 'jcl-lbl')[0].attrs.title) &&
        byCls(attRow, 'jcl-act').map((a) => a.textContent).join(',') === 'Undo', byCls(attRow, 'jcl-lbl')[0].attrs.title);
    issueOf['EDR-1'] = converted();
    isLead = true; me = 'acc-lead';
    await C.refresh('EDR-1');
    await settle();
    attRow = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-item').filter((r) => r.attrs['data-item'] === 'attachments')[0];
    ok('a Lead does not tick the attachments off', !byCls(attRow, 'jcl-act').length);
    ajaxLog = [];
    await C._waive('EDR-1', 'replabels', true);
    await C._tick('EDR-1', 'attachments', 'x', true);
    await settle();
    ok('...and marks nothing', !ajaxLog.length);
    isLead = false; me = 'acc-rep';
    await C.refresh('EDR-1');
    await settle();
    answers = {};
    ajaxLog = []; confirms = []; confirmAnswer = false; reloads = 0;
    await C._takeLabels('EDR-1', ['PlatformWin']);
    ok('the report\'s labels come off only after a yes', confirms.length === 1 && confirms[0] === 'Take the bug report\'s labels off EDR-1: PlatformWin?\n\ncloned and jira_escalated stay.' && !puts().length && !reloads, confirms[0]);
    confirmAnswer = true; toasts = []; jiraEvents = [];
    await C._takeLabels('EDR-1', ['PlatformWin', 'Russian']);
    await settle();
    ok('...then one edit takes each off', puts().length === 1 && J(puts()[0].body) === J({ update: { labels: [{ remove: 'PlatformWin' }, { remove: 'Russian' }] } }), J(puts()));
    await waitRefresh();
    ok('...and Jira shows it, with no reload', refreshes().length === 1 && reloads === 0 && toasts.some((t) => t === 'Taken off EDR-1: PlatformWin, Russian.'), refreshes().length + ' ' + reloads + ' ' + toasts.join(' | '));
    // the exception, added in an expand
    logText = { 'u-logs': "header\n\nkeyerror: 'x'|a.py:f>b.py:g>c.py:h\nTraceback (most recent call last):\n  File a.py\n\nother block" };
    ajaxLog = []; confirms = []; confirmAnswer = true; reloads = 0; toasts = []; jiraEvents = [];
    answers = { 'GET /rest/api/3/issue/EDR-1': { ok: true, data: { fields: { description: adf(['what the hunter wrote']) } } } };
    const sNow = C._state['EDR-1'];
    await C._addExc('EDR-1', sNow, EXC);
    await settle();
    put = puts()[0];
    ok('Add asks first, naming the expand\'s title', confirms.length === 1 && /in an expand titled:\n\nKeyError: 'x' raised while undocking/.test(confirms[0]), confirms[0]);
    ok('...saying to save an edit of the description first, as one saved afterwards would take the expand out', /\n\nSave or cancel an edit of the description first: saved afterwards, it would take the expand out again\.$/.test(confirms[0]), confirms[0]);
    await waitRefresh();
    ok('...and once the description is written, Jira shows it, with no reload', refreshes().length === 1 && reloads === 0 && toasts.some((t) => t === 'Added to the description of EDR-1.'), refreshes().length + ' ' + reloads + ' ' + toasts.join(' | '));
    ok('...reads the description again just before it writes', ajaxLog.filter((r) => r.method === 'GET' && /fields=description/.test(r.path)).length === 1);
    ok('...and appends the exception as the log has it, the hunter\'s text kept', put && put.body.fields.description.content.length === 2 &&
        put.body.fields.description.content[0].content[0].text === 'what the hunter wrote' && /Traceback \(most recent call last\)/.test(put.body.fields.description.content[1].content[0].content[0].text), put && J(put.body));
    ajaxLog = []; confirmAnswer = false;
    await C._addExc('EDR-1', sNow, EXC);
    ok('...a no writes nothing', !ajaxLog.length);
    ok('the exception is no longer copied from the card: Add is enough', C._copyExc === undefined);
    ajaxLog = []; confirmAnswer = true;
    answers = { 'GET /rest/api/3/issue/EDR-1': { ok: true, data: { fields: { description: adf(['what the hunter wrote']) } } } };
    await C._addExc('EDR-1', sNow, { sig: 'gone|a:b>c:d', msg: 'Gone' });
    await settle();
    put = puts()[0];
    ok('an exception no log holds any more is added as its signature reads', put && put.body.fields.description.content[1].content[0].content[0].text === 'tip:Gone', put && J(put.body));
    answers = {};
    await waitRefresh();
    // a Jira that no longer hears the event
    jiraHears = false; confirmAnswer = true; reloads = 0; jiraEvents = [];
    const keepLog = console.log, logged = [];
    console.log = (...a) => { logged.push(a.join(' ')); };
    try {
        await C._addLabel('EDR-1', 'Undock');
        await settle();
        ok('a write Jira does not show is waited for a moment, not reloaded at once', refreshes().length === 1 && reloads === 0);
        await waitRefresh();
        ok('...then the page reloads, so no edit in Jira writes the old value back, and the console says why', reloads === 1 &&
            logged.some((l) => /Jira did not show the change on EDR-1, so the page reloads to show it\./.test(l)), reloads + ' ' + J(logged));
        reloads = 0;
        await C._addLabel('EDR-1', 'Undock');
        await settle();
        onScreen = 'EDR-2';
        await waitRefresh();
        ok('...but not once another issue is on screen', reloads === 0);
        onScreen = 'EDR-1';
    } finally { console.log = keepLog; jiraHears = true; }

    // ---- requests ----
    ajaxLog = [];
    answers = { 'PUT /rest/api/3/issue/EDR-9': [{ ok: false, status: 429, retry: '0' }, { ok: true, data: '' }] };
    let res = await C._req('PUT', '/rest/api/3/issue/EDR-9', { fields: {} });
    ok('a write Jira answers 429 is tried again, and an empty answer is fine', ajaxLog.length === 2 && J(res) === '{}', ajaxLog.length + ' ' + J(res));
    answers = { 'PUT /rest/api/3/issue/EDR-9': { ok: false, status: 400, json: { errorMessages: ['Field x is required'], errors: { labels: 'bad label' } } } };
    let err = null;
    try { await C._req('PUT', '/rest/api/3/issue/EDR-9', {}); } catch (e) { err = e; }
    ok('...a refusal says what Jira said, and carries the status', err && err.message === 'Field x is required bad label' && err.status === 400, err && err.message);
    // A saved issue property: Jira answers 200 (or 201 when new) with no body, which jQuery fails to parse as JSON.
    ajaxLog = [];
    answers = { 'PUT /rest/api/3/issue/EDR-9/properties/jita.checklist': { ok: true, status: 200, text: '' } };
    err = null; res = null;
    try { res = await C._req('PUT', '/rest/api/3/issue/EDR-9/properties/jita.checklist', { v: 1 }); } catch (e) { err = e; }
    ok('a save Jira answers 200 with no body is a success, not "HTTP 200": the answer is read as text', !err && J(res) === '{}' && ajaxLog[0].dataType === 'text', (err && err.message) + ' ' + J(res));
    answers = { 'PUT /rest/api/3/issue/EDR-9/properties/jita.checklist': { ok: true, status: 201, text: '' } };
    err = null;
    try { await C._req('PUT', '/rest/api/3/issue/EDR-9/properties/jita.checklist', { v: 1 }); } catch (e) { err = e; }
    ok('...201 (a property saved the first time) too', !err, err && err.message);
    answers = { 'PUT /rest/api/3/issue/EDR-9': { ok: true, status: 200, text: 'OK' } };
    err = null;
    try { res = await C._req('PUT', '/rest/api/3/issue/EDR-9', {}); } catch (e) { err = e; }
    ok('...a write may answer something other than JSON', !err && J(res) === '{}', err && err.message);
    answers = { 'GET /rest/api/3/issue/EDR-9': { ok: true, status: 200, text: '<html>log in</html>' } };
    err = null;
    try { await C._req('GET', '/rest/api/3/issue/EDR-9'); } catch (e) { err = e; }
    ok('...but a read must answer JSON (a login page is no empty answer)', err && err.message === 'Jira answered with something other than JSON', err && err.message);
    answers = { 'GET /rest/api/3/issue/EDR-9': { ok: true, status: 200, data: { key: 'EDR-9', fields: { labels: ['A'] } } } };
    res = await C._req('GET', '/rest/api/3/issue/EDR-9');
    ok('...and its JSON is read', res && res.key === 'EDR-9' && J(res.fields.labels) === '["A"]', J(res));
    answers = { 'GET /rest/api/3/issue/EDR-9': { ok: true, status: 200, text: 'null' } };
    res = await C._req('GET', '/rest/api/3/issue/EDR-9');
    ok('...a JSON null as an empty answer', J(res) === '{}', J(res));
    answers = { 'GET /rest/api/3/issue/EDR-9': { ok: false, status: 404, text: 'Not found' } };
    err = null;
    try { await C._req('GET', '/rest/api/3/issue/EDR-9'); } catch (e) { err = e; }
    ok('...a refusal whose answer is not JSON still says its status', err && err.message === 'HTTP 404' && err.status === 404, err && err.message);
    answers = {};

    // ---- the page ----
    ok('a recheck follows an edit made in Jira: the fields are read as the page shows them', (() => {
        fieldRows = [{ label: 'Labels', el: { textContent: 'Crash' } }, { label: 'Reporter', el: { textContent: 'Hunter' } }];
        const a = C._pageSig();
        fieldRows = [{ label: 'Labels', el: { textContent: 'Crash Undock' } }, { label: 'Reporter', el: { textContent: 'Hunter' } }];
        const b = C._pageSig();
        fieldRows = [{ label: 'Labels', el: { textContent: 'Crash Undock' } }, { label: 'Reporter', el: { textContent: 'Someone' } }];
        return a !== b && b === C._pageSig() && /labels/i.test(C.FIELDS_SEEN.source) && !C.FIELDS_SEEN.test('Reporter');
    })());
    fieldRows = [];
    // leaving the defect, and an issue that is no defect
    onScreen = 'EBR-5';
    C.ensure();
    ok('off a defect the card goes', !document.getElementById(C.GROUP_ID));
    // Jira wipes the card: it comes back, painted from the last state, with no new read
    onScreen = 'EDR-1';
    C.ensure();
    await settle();
    const reads = ajaxLog.length;
    column.removeChild(document.getElementById(C.GROUP_ID));
    C.reensure();
    ok('a card Jira wiped comes straight back, with no new read', !!document.getElementById(C.GROUP_ID) && ajaxLog.length === reads);
    // a card mounted later went in between: back under Details
    const other = N('<div class="other"></div>');
    column.insertBefore(other, anchor.nextSibling);
    C._place();
    ok('...and goes back under Details when another card went in between', anchor.nextSibling === document.getElementById(C.GROUP_ID));
    ok('the card\'s style is added once', styles.length === 1);

    // ================= a check that fails =================
    issueOf['EDR-1'] = converted(); histOf['EDR-1'] = new Error('HTTP 500 from Jira.');
    delete C._state['EDR-1']; C._seen = 'stale';
    const said = [], realLog = console.log;
    console.log = (...a) => { said.push(a.map((x) => (x && x.message) || String(x)).join(' ')); };
    try { await C.refresh('EDR-1'); await settle(); } finally { console.log = realLog; }
    g = document.getElementById(C.GROUP_ID); body = g && g.find('#jita-cl');
    ok('a check that fails for the defect\'s reporter shows on the card, saying so', !!g && byCls(body, 'jcl-count')[0].textContent === 'Could not check EDR-1' &&
        byCls(body, 'jcl-failed').length === 1 && g.querySelector('[data-jita-title]').textContent === 'Defect checklist · could not check', g && body.textContent);
    ok('...and why, with nothing refused until it can be checked', /^HTTP 500 from Jira\. Nothing is refused until it can be checked\.$/.test(byCls(body, 'jcl-line')[0].textContent), byCls(body, 'jcl-line')[0].textContent);
    ok('...with a way to check again', byCls(body, 'jcl-again').length === 1 && byCls(body, 'jcl-again')[0].handlers.click.length === 1);
    ok('...and in the console', said.some((l) => /^\[JiTA\] checklist: could not check EDR-1: HTTP 500 from Jira\.$/.test(l)), J(said));
    toasts = [];
    ok('...nothing is refused meanwhile', !pick('Unassigned') && !toasts.length);
    ok('...and it is checked again once the page changes, not on every change of it', C._seen === C._pageSig());
    column.removeChild(document.getElementById(C.GROUP_ID));
    C.reensure();
    ok('...a card Jira wiped comes back saying so', !!document.getElementById(C.GROUP_ID) && byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-failed').length === 1);
    histOf['EDR-1'] = [];
    await C.refresh('EDR-1'); await settle();
    histOf['EDR-1'] = new Error('HTTP 502');
    toasts = []; said.length = 0;
    console.log = (...a) => { said.push(a.map((x) => (x && x.message) || String(x)).join(' ')); };
    try { await C.refresh('EDR-1'); await settle(); } finally { console.log = realLog; }
    body = document.getElementById(C.GROUP_ID).find('#jita-cl');
    ok('a check that fails after a good one keeps that card, and says so in a toast', !byCls(body, 'jcl-failed').length && byCls(body, 'jcl-item').length > 0 &&
        toasts.some((t) => /could not read EDR-1 again: HTTP 502/.test(t)), toasts.join(' | '));
    histOf['EDR-1'] = [];
    // a failure before it knows who is looking
    const kept = issueOf['EDR-1'];
    delete issueOf['EDR-1']; delete C._state['EDR-1']; C.clear();
    const debugged = [], realDlog = JiTA.dlog;
    JiTA.dlog = (...a) => { debugged.push(a.join(' ')); };
    await C.refresh('EDR-1'); await settle();
    JiTA.dlog = realDlog;
    ok('a failure before it knows who is looking draws no card, and is said only with debug logging on', !document.getElementById(C.GROUP_ID) && !C._state['EDR-1'] &&
        debugged.some((l) => /could not read EDR-1/.test(l)), J(debugged));
    issueOf['EDR-1'] = kept;

    // ================= is the defect still as it was read? =================
    issueOf['EDR-1'] = converted(); issueOf['EDR-1'].fields.updated = '2026-11-08T12:00:00.000+0000'; histOf['EDR-1'] = [];
    await C.refresh('EDR-1'); await settle();
    gets = [];
    await C._check(); await settle();
    ok('a check asks Jira one small thing, and with nothing changed reads nothing more', J(gets) === J(['/rest/api/3/issue/EDR-1?fields=updated']), J(gets));
    issueOf['EDR-1'].fields.updated = '2026-11-08T12:00:05.000+0000';
    gets = [];
    await C._check(); await settle();
    ok('...an edit made since reads the defect again', gets.some((p) => /fields=\*all/.test(p)) && C._upd['EDR-1'] === '2026-11-08T12:00:05.000+0000', J(gets));
    gets = [];
    const c1 = C._check(), c2 = C._check();
    await c1; await c2; await settle();
    ok('...one check at a time', gets.filter((p) => /fields=updated$/.test(p)).length === 1, J(gets));
    const goodState = C._state['EDR-1'];
    C._state['EDR-1'] = { key: 'EDR-1', sees: 'reporter', me: 'acc-rep', error: 'HTTP 500' };
    gets = [];
    await C._check(); await settle();
    ok('...and a check that failed waits for the focus or a click on its ↻', !gets.length);
    C._state['EDR-1'] = { key: 'EDR-1', sees: '' };
    await C._check(); await settle();
    ok('...as does a defect the card is not for', !gets.length);
    C._state['EDR-1'] = goodState;
    // after a click or a key, and after the page changed
    const realST = global.setTimeout, realCT = global.clearTimeout, realCheck = C._check;
    let timers = [], cleared = [], checks = 0;
    global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    global.clearTimeout = (t) => { cleared.push(t); };
    C._check = () => { checks++; return Promise.resolve(); };
    try {
        C._inputT = [];
        C._onInput(); C._onInput();
        ok('a click or a key checks the defect soon after, and again later for a slow save, the last one counting', timers.length === 4 &&
            J(timers.slice(2).map((t) => t.ms)) === J(C.INPUT_MS) && J(cleared) === J([1, 2]) && C.INPUT_MS[0] < 3000 && C.INPUT_MS[1] <= 10000, J(timers.map((t) => t.ms)) + ' cleared ' + J(cleared));
        timers[2].fn(); timers[3].fn();
        ok('...each one a check', checks === 2);
        timers = []; C._state['EDR-1'] = { key: 'EDR-1', sees: '' };
        C._onInput();
        ok('...not on a defect the card is not for', !timers.length);
        C._state['EDR-1'] = goodState;
        ok('clicks and keys are heard in the capture phase, before Jira takes them', listeners.some((l) => l.ev === 'mouseup' && l.cap === true && l.fn === C._onInput) &&
            listeners.some((l) => l.ev === 'keyup' && l.cap === true && l.fn === C._onInput));
        timers = []; checks = 0; onScreen = 'EDR-1'; C._key = 'EDR-1'; C._seen = 'before';
        C.ensure();
        ok('a change on the page checks the defect a moment later, rather than reading it in full', timers.length === 1 && timers[0].ms === C.RECHECK_MS && C.RECHECK_MS <= 1500 && C._seen === C._pageSig(),
            J(timers.map((t) => t.ms)));
        timers[0].fn();
        ok('...with a check', checks === 1);
        timers = [];
        C.ensure();
        ok('...and the same page checks nothing', !timers.length);
        checks = 0;
        C._onFocus();
        ok('back in the tab, the defect is checked', checks === 1);
        const realRefresh = C.refresh;
        let refreshes = 0;
        C.refresh = () => { refreshes++; return Promise.resolve(); };
        C._state['EDR-1'] = { key: 'EDR-1', sees: 'reporter', me: 'acc-rep', error: 'HTTP 500' };
        C._lastLoad = Date.now();
        C._onFocus();
        ok('...a check that failed is tried again on the focus, though not straight after the last one', refreshes === 0 && checks === 1);
        C._lastLoad = Date.now() - C.FOCUS_MS - 1;
        C._onFocus();
        ok('...but a while after it', refreshes === 1 && checks === 1);
        C.refresh = realRefresh;
        C._state['EDR-1'] = goodState;
    } finally {
        global.setTimeout = realST; global.clearTimeout = realCT; C._check = realCheck;
    }

    // ================= a defect nobody has before it is done =================
    const iU = converted(); iU.fields.assignee = null;
    issueOf['EDR-1'] = iU; histOf['EDR-1'] = [];
    await C.refresh('EDR-1'); await settle();
    foot = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-foot')[0];
    let take = byCls(foot, 'jcl-finish')[0];
    ok('a defect nobody has before it is done says FC can pick it up, and its reporter may take it', /Unassigned, so FC can pick it up, though items are still open\./.test(foot.textContent) &&
        byCls(foot, 'jcl-early').length === 1 && !!take && take.textContent === 'Assign to me until it is done' && !take.props.disabled, foot.textContent);
    ajaxLog = []; confirms = []; confirmAnswer = false; reloads = 0;
    take.fire('click'); await settle();
    ok('...asking first: a no writes nothing', confirms.length === 1 && confirms[0] === 'Assign EDR-1 to you until its Defect checklist is done? Unassigned, it is where FC picks defects up.' &&
        !puts().length && !reloads, confirms[0]);
    confirmAnswer = true; toasts = []; gets = []; jiraEvents = [];
    take.fire('click'); await settle();
    ok('...a yes assigns it to them', puts().length === 1 && puts()[0].path === '/rest/api/3/issue/EDR-1/assignee' && J(puts()[0].body) === J({ accountId: 'acc-rep' }) &&
        toasts.some((t) => t === 'EDR-1 is assigned to you until the checklist is done.'), J(puts()) + ' ' + toasts.join(' | '));
    await waitRefresh();
    ok('...and Jira shows it, with no reload, and the card reads the defect again', refreshes().length === 1 && reloads === 0 && gets.some((p) => /fields=\*all/.test(p)), refreshes().length + ' ' + reloads + ' ' + J(gets));
    answers = { 'PUT /rest/api/3/issue/EDR-1/assignee': { ok: false, status: 403, json: { errorMessages: ['No permission'] } } };
    await C.refresh('EDR-1'); await settle();
    take = byCls(byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-foot')[0], 'jcl-finish')[0];
    toasts = []; reloads = 0;
    take.fire('click'); await settle();
    ok('...one Jira refuses says why, and the button is back', toasts.some((t) => /^Could not assign EDR-1 to you: No permission$/.test(t)) && !take.props.disabled && take.textContent === 'Assign to me until it is done' && !reloads, toasts.join(' | '));
    answers = {};
    isLead = true; me = 'acc-lead';
    await C.refresh('EDR-1'); await settle();
    foot = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-foot')[0];
    ok('...a Lead is told, but takes nothing', /Unassigned, so FC can pick it up/.test(foot.textContent) && !byCls(foot, 'jcl-finish').length, foot.textContent);
    isLead = false; me = 'acc-rep';
    const iUF = finished(); iUF.fields.assignee = null;
    issueOf['EDR-1'] = iUF;
    await C.refresh('EDR-1'); await settle();
    foot = byCls(document.getElementById(C.GROUP_ID).find('#jita-cl'), 'jcl-foot')[0];
    ok('a finished defect nobody has is with FC, and offers nothing', foot.textContent === 'Unassigned: with FC.' && !byCls(foot, 'jcl-finish').length && !byCls(foot, 'jcl-early').length, foot.textContent);

    // ================= copying rich text (JiTA.util.copy with html) =================
    const realUtil = JiTA.util;
    const U = eval('({' + member('    copy: function (text, html) {') + member('    _copyHtml: function (text, html) {') + '})');
    JiTA.util = U;
    let writes = [], texts = [], writeAnswer = true;
    const nav = { clipboard: { write: (its) => { writes.push(its); return writeAnswer ? Promise.resolve() : Promise.reject(new Error('denied')); },
        writeText: (t) => { texts.push(t); return Promise.resolve(); } } };
    const realNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
    global.ClipboardItem = function (o) { this.o = o; this.types = Object.keys(o); };
    try {
        await U.copy('plain', '<ol><li>a</li></ol>');
        const item = writes[0] && writes[0][0];
        ok('a rich copy gives the clipboard both kinds at once', writes.length === 1 && !!item && J(item.types.slice().sort()) === J(['text/html', 'text/plain']) && !texts.length, J(item && item.types));
        ok('...the HTML and the text as given', !!item && (await item.o['text/html'].text()) === '<ol><li>a</li></ol>' && (await item.o['text/plain'].text()) === 'plain');
        writeAnswer = false; writes = []; texts = [];
        let rr = null;
        await U.copy('plain', '<ol></ol>').then(() => { rr = 'ok'; }, () => { rr = 'refused'; });
        ok('...one the browser refuses copies the text alone', writes.length === 1 && J(texts) === J(['plain']) && rr === 'ok', J(texts) + ' ' + rr);
        // the old way, where the browser has no rich copy
        Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
        delete global.ClipboardItem;
        let execAnswer = true, drawn = null, removed = 0, execs = 0, atCopy = null;
        const selection = { ranges: [], removeAllRanges() { this.ranges = []; }, addRange(r) { this.ranges.push(r); } };
        const realDoc = global.document;
        global.document = Object.assign({}, realDoc, {
            createElement: (t) => { drawn = { tag: t, style: {}, innerHTML: '' }; return drawn; },
            createRange: () => ({ selectNodeContents(n) { this.node = n; } }),
            body: { appendChild() {}, removeChild() { removed++; } },
            execCommand: (c) => { execs++; atCopy = selection.ranges.length ? selection.ranges[0].node : null; return c === 'copy' && execAnswer; }
        });
        global.window.getSelection = () => selection;
        try {
            rr = null;
            await U.copy('plain', '<ol><li>a</li></ol>').then(() => { rr = 'ok'; }, () => { rr = 'refused'; });
            ok('...without it, the HTML is drawn off screen, selected and copied as it is, and taken away', rr === 'ok' && !!drawn && drawn.innerHTML === '<ol><li>a</li></ol>' && atCopy === drawn &&
                execs === 1 && removed === 1 && !selection.ranges.length, rr + ' ' + J(drawn));
            execAnswer = false; rr = null;
            await U.copy('plain', '<p></p>').then(() => { rr = 'ok'; }, () => { rr = 'refused'; });
            ok('...and a refusal there is said', rr === 'refused');
        } finally { global.document = realDoc; delete global.window.getSelection; }
    } finally {
        JiTA.util = realUtil;
        delete global.ClipboardItem;
        if (realNav) { Object.defineProperty(globalThis, 'navigator', realNav); } else { delete globalThis.navigator; }
    }

    // ================= switched off in Settings =================
    issueOf['EDR-1'] = converted();
    histOf['EDR-1'] = [];
    onScreen = 'EDR-1';
    await C.refresh('EDR-1');
    await settle();
    ok('switched on, the card is there (control)', !!document.getElementById(C.GROUP_ID));
    checklistOn = false;
    C.ensure();
    ok('switched off in Settings, the card goes at once', !document.getElementById(C.GROUP_ID));
    C._key = 'EDR-1';
    C.reensure();
    ok('...and is not put back, nor drawn on any read', !document.getElementById(C.GROUP_ID));
    toasts = [];
    C._key = 'EDR-1';
    ok('...nothing is refused', !pick('Unassigned') && !toasts.length);
    const offState = { key: 'EDR-1', sees: 'reporter', me: 'acc-rep', assignee: '', open: 3, d: { reporter: 'acc-rep' },
        hist: [{ author: { accountId: 'acc-rep' }, created: new Date(Date.now() - 5000).toISOString(), items: [{ field: 'assignee', fieldId: 'assignee', from: 'acc-rep', to: null }] }] };
    ajaxLog = [];
    C._guard('EDR-1', offState);
    await settle();
    ok('...and no unassign is put back', !puts().length);
    checklistOn = true;
    C._guard('EDR-1', offState);
    await settle();
    ok('...which, switched on, it would be (control)', puts().length === 1);
    C._key = null;
    const lineOf = (head) => { const i = src.indexOf(head); return src.slice(i, src.indexOf('\n', i) + 1); };
    const flags = eval('(function () { ' + lineOf('var savedVariables = ') + lineOf('var FLAG = ') + ' return { savedVariables: savedVariables, FLAG: FLAG }; })()');
    ok('the checklist is a feature of its own, on by default like every feature', flags.FLAG.defectChecklist === 9 && J(flags.savedVariables[9]) === J(['defectChecklist', '']),
        J(flags.savedVariables[9]));
    const ms = src.indexOf('\nJiTA.menu = {'), menuSrc = src.slice(ms, src.indexOf('\n};\n', ms));
    ok('...switched in Settings > Features, which mounts or takes the card at once',
        /\$feat\.append\(\$cl\);/.test(menuSrc) && /JiTA\.menu\._toggleRow\('Defect checklist', 9, function \(\) \{\n\s+if \(!JITA_NO_JIRA_UI\) \{ JiTA\.checklist\.ensure\(\); \}/.test(menuSrc) &&
        menuSrc.indexOf('$feat.append($cl);') < menuSrc.indexOf("pane('features').append($feat);"));

    // ================= the page observer =================
    const bs = src.indexOf('// ---- Jira boot: watch the DOM'), boot = src.slice(bs, src.indexOf('observer.observe(document.body', bs));
    ok('the page observer puts a wiped card back at once, before its wait', /try \{ JiTA\.checklist\.reensure\(\); \}/.test(boot.slice(0, boot.indexOf('if (scheduled)'))));
    ok('...and, after it, follows the defect on screen and judges it again after a change', /try \{ JiTA\.checklist\.ensure\(\); \}/.test(boot.slice(boot.indexOf('setTimeout(function () {'))));

    // ================= no emoji =================
    const glyphs = Object.keys(C.MARKS).map((k) => C.MARKS[k]).concat(['↻', '▸', '▾']);
    const emoji = glyphs.filter((g2) => Array.from(g2).some((ch) => /\p{Emoji_Presentation}/u.test(ch) || /\p{Extended_Pictographic}/u.test(ch)));
    ok('the card\'s symbols are text, never emoji', emoji.length === 0, emoji.join());
    const block = src.slice(cs, ce);
    const DASHES = new RegExp('[' + String.fromCharCode(0x2013) + String.fromCharCode(0x2014) + ']');   // built from codes: this file may hold no such dash itself
    ok('...and the card has no dash a reader could take for one', !DASHES.test(block));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'defect checklist checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
