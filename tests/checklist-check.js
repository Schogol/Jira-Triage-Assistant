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
    addEventListener: (ev, fn, cap) => { listeners.push({ ev, fn, cap }); }
};
const listeners = [];
global.window = { addEventListener: (ev, fn) => { listeners.push({ ev, fn, win: true }); }, confirm: (m) => { confirms.push(m); return confirmAnswer; } };
let confirms = [], confirmAnswer = true;
global.GM_addStyle = (css) => { styles.push(css); };
const styles = [];
global.$ = (x) => {
    if (x && typeof x === 'object') { return x; }
    if (typeof x === 'string' && x.charAt(0) === '<') { return N(x); }
    return W([]);
};

// ---- Jira: scripted answers per "METHOD path", every request recorded ----
let ajaxLog = [], answers = {};
$.ajax = (o) => {
    const path = o.url.replace('https://x.atlassian.net', ''), key = o.type + ' ' + path.split('?')[0];
    ajaxLog.push({ method: o.type, path: path, body: o.data ? JSON.parse(o.data) : undefined, headers: o.headers });
    const a = answers[key] || answers[o.type + ' *'] || { ok: true, data: {} }, next = Array.isArray(a) ? (a.length > 1 ? a.shift() : a[0]) : a;
    const d = { done(fn) { if (next.ok) { setImmediate(() => fn(next.data)); } return d; },
        fail(fn) { if (!next.ok) { setImmediate(() => fn({ status: next.status, responseJSON: next.json, getResponseHeader: () => next.retry || null })); } return d; } };
    return d;
};
const puts = () => ajaxLog.filter((r) => r.method === 'PUT');

// ---- JiTA around the checklist ----
let toasts = [], isLead = false, groupMembers = [], issueOf = {}, histOf = {}, sourceOf = {}, readOf = {}, holdingOf = {}, me = 'acc-rep';
global.gmGet = (k, d) => d;
global.gmSet = () => {};
global.jitaCurrentKey = () => onScreen;
let onScreen = '';
global.JiTA = {
    HOST: 'https://x.atlassian.net', dlog: () => {},
    util: { fmtDate: (iso) => 'on ' + String(iso).slice(0, 10), copy: (t) => { copied.push(t); return copyAnswer ? Promise.resolve() : Promise.reject(new Error('no')); } },
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
    leadduty: {
        isLead: () => isLead, me: () => ({ accountId: me, displayName: 'ISD BH Hunter' }),
        group: { members: () => Promise.resolve(groupMembers) },
        _get: (path) => {
            gets.push(path);
            const m = /^\/rest\/api\/3\/issue\/([A-Z]+-\d+)(\?.*)?$/.exec(path);
            if (m && /fields=reporter$/.test(path) && issueOf[m[1]]) { return Promise.resolve({ key: m[1], fields: { reporter: JSON.parse(J(issueOf[m[1]].fields.reporter)) } }); }
            if (m && /fields=\*all/.test(path)) { return issueOf[m[1]] ? Promise.resolve(JSON.parse(J(issueOf[m[1]]))) : Promise.reject(Object.assign(new Error('404'), { status: 404 })); }
            if (m) { return sourceOf[m[1]] ? Promise.resolve(JSON.parse(J(sourceOf[m[1]]))) : Promise.reject(Object.assign(new Error('404'), { status: 404 })); }
            return Promise.reject(new Error('unexpected GET ' + path));
        },
        _changelog: (key) => { gets.push('changelog ' + key); return Promise.resolve(JSON.parse(J(histOf[key] || []))); }
    }
};
let gets = [];
let copied = [], copyAnswer = true, built = 0, fieldRows = [], logText = {};
// The fingerprints of a description: "EXC[<sig>]" for each exception pasted in it.
function fpsOf(text) { const out = [], re = /EXC\[([^\]]+)\]/g; let m; while ((m = re.exec(String(text)))) { out.push({ sig: m[1], msg: m[1] }); } return out; }
Object.assign(JiTA.util, eval('({' + member('    toPlainText: function (d) {') + '})'));
Object.assign(JiTA.logsig, eval('({' + member('    _crashOf: function (sig) {') + '})'));
eval(src.slice(cs + 1, ce) + '\n    _noop: null\n};');
const C = JiTA.checklist;

// ---- fixtures ----
const EXC = { sig: "keyerror: 'x'|a.py:f>b.py:g>c.py:h", msg: "KeyError: 'x' raised while undocking" };
const adf = (paras, list) => ({ type: 'doc', version: 1, content: paras.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] }))
    .concat(list ? [{ type: 'orderedList', content: list.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) }] : []) });
const NAMES = { summary: 'Summary', customfield_101: 'Severity', customfield_102: 'Impact', customfield_103: 'State', customfield_10001: 'Team', customfield_104: 'Epic Link' };
// A defect as the conversion leaves it: the report's summary, description and labels, its log copied, nothing set.
function converted() {
    return { key: 'EDR-1', names: NAMES, properties: {}, fields: {
        summary: 'game crash when undock', description: adf(['i undock and the game crashes']), labels: ['PlatformWin', 'cloned'],
        attachment: [{ filename: 'logs.txt', size: 100 }], reporter: { accountId: 'acc-rep', displayName: 'ISD BH Hunter' }, assignee: { accountId: 'acc-rep' },
        priority: { id: '3', name: '3 - Medium' }, customfield_101: null, customfield_102: null, customfield_103: null, customfield_10001: null, customfield_104: null,
        issuelinks: [{ type: { name: 'Duplicate' }, inwardIssue: { key: 'EBR-10', fields: { summary: 'game crash when undock' } } }]
    } };
}
// The same defect once its reporter is done with it.
function finished() {
    const i = converted(), f = i.fields;
    f.summary = 'Undocking from a station crashes the client';
    f.description = adf(['Singularity, build 2945678', 'Undocking from any station crashes the client to desktop.', 'EXC[' + EXC.sig + ']'], ['Dock in Jita 4-4', 'Undock', 'Observe the client crashes']);
    f.labels = ['Undock', 'Crash', 'cloned'];
    f.attachment = [{ filename: 'logs.txt', size: 100 }, { filename: 'loglite_undock.txt', size: 5000 }];
    f.customfield_101 = { value: 'A - Crash / Exploit' }; f.customfield_102 = { value: 'Moderate / Limited' }; f.customfield_103 = { value: 'Live Issue' };
    return i;
}
const SRC = { key: 'EBR-10', fields: { summary: 'game crash when undock', description: adf(['i undock and the game crashes']), labels: ['PlatformWin', 'Russian'],
    attachment: [{ filename: 'logs.txt', size: 100, content: 'u-logs' }] } };
const srcObj = () => ({ key: 'EBR-10', summary: SRC.fields.summary, desc: JiTA.util.toPlainText(SRC.fields.description), labels: SRC.fields.labels.slice(),
    attachments: SRC.fields.attachment.map((a) => Object.assign({}, a)) });
const byId = (items, id) => items.filter((it) => it.id === id)[0];

(async () => {
    // ================= small parts =================
    ok('a field\'s value reads as text: a select, a user, a list, nothing', C._val({ value: 'A - Crash' }) === 'A - Crash' && C._val({ displayName: 'Bob' }) === 'Bob' &&
        C._val([{ value: 'a' }, { value: 'b' }]) === 'a, b' && C._val(null) === '' && C._val('x') === 'x');
    ok('the fields are found by their names', J(C._ids(NAMES, {})) === J({ severity: 'customfield_101', impact: 'customfield_102', state: 'customfield_103', epic: 'customfield_104' }), J(C._ids(NAMES, {})));
    ok('...and of two fields with one name, the one holding a value', C._ids({ cf_a: 'State', cf_b: 'State' }, { cf_b: { value: 'Live Issue' } }).state === 'cf_b' &&
        C._ids({ cf_a: 'State', cf_b: 'State' }, { cf_a: { value: 'None' } }).state === 'cf_a');
    const hist = [
        { author: { accountId: 'acc-rep' }, created: '2026-11-08T10:00:00.000+0000', items: [{ field: 'summary', fromString: 'first summary', toString: 'second' }] },
        { author: { accountId: 'acc-rep' }, created: '2026-11-08T10:05:00.000+0000', items: [{ field: 'summary', fromString: 'second', toString: 'third' }, { field: 'labels', fromString: 'a', toString: 'a b' }] }
    ];
    ok('a field\'s first value is what its first change replaced', C._first(hist, 'summary', 'third') === 'first summary');
    ok('...and what it holds now when it never changed', C._first(hist, 'description', 'now') === 'now');
    const last = C._last(hist, (it) => it.field === 'summary');
    ok('the last change of a field, with its author and time', last && last.item.toString === 'third' && last.by === 'acc-rep' && last.at === '2026-11-08T10:05:00.000+0000', J(last));

    // ---- Priority, Team and Epic Link are FC's ----
    const pr = (by, from, to, at) => ({ author: { accountId: by }, created: at || '2026-11-08T11:00:00.000+0000', items: [{ field: 'priority', fieldId: 'priority', from: from, to: to }] });
    const fcOf = (f, h) => C._fcSet(Object.assign({ priority: { id: '3' } }, f), h, { epic: 'customfield_104' }, 'acc-rep').map((x) => x.name).join(',');
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
    ok('an Epic Link held as the parent epic counts too', fcOf({ parent: { key: 'EDR-5', fields: { issuetype: { name: 'Epic' } } } }, []) === 'Epic Link' &&
        fcOf({ parent: { key: 'EDR-5', fields: { issuetype: { name: 'Story' } } } }, []) === '');

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
    const srcAtt = [{ filename: 'logs.txt', size: 100 }];
    ok('a log attached by the reporter counts', C._newLogs([{ filename: 'logs.txt', size: 100 }, { filename: 'LogLite export.txt', size: 9 }], srcAtt).length === 1);
    ok('...the report\'s own log (same name and size) does not', C._newLogs([{ filename: 'logs.txt', size: 100 }], srcAtt).length === 0);
    ok('...a LogLite workspace counts, an image named like a log does not', C._newLogs([{ filename: 'session.lsw', size: 1 }, { filename: 'catalog.png', size: 1 }], []).length === 1);
    ok('the report\'s labels left on the defect, cloned and jira_escalated aside', J(C._reportLabels(['PlatformWin', 'cloned', 'jira_escalated', 'Crash'], ['PlatformWin', 'cloned', 'jira_escalated'])) === J(['PlatformWin']));
    ok('labels not starting with a capital letter, cloned and jira_escalated aside', J(C._lowerLabels(['ui', 'UI', '3D', 'cloned', 'jira_escalated', 'überlay'])) === J(['ui', 'überlay']));
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
    ok('a defect as the conversion leaves it has every item open but the ones it cannot get wrong',
        openIds(items) === 'summary,desc,build,steps,fields,replabels,logs', openIds(items));
    ok('...its summary is still the report\'s', /Still the bug report's summary/.test(byId(items, 'summary').why));
    ok('...so is its description, and its labels', /Still the bug report's description/.test(byId(items, 'desc').why) && /PlatformWin/.test(byId(items, 'replabels').why) && J(byId(items, 'replabels').left) === J(['PlatformWin']));
    ok('...and the report\'s log does not count as its own', /the bug report's own logs do not count/.test(byId(items, 'logs').why));
    ok('...Severity, Impact and State are named as not set', byId(items, 'fields').why === 'Not set yet: Severity, Impact, State.', byId(items, 'fields').why);
    d = factsOf(finished());
    items = C.items(d);
    ok('a finished defect has every item done', openIds(items) === '' && items.every((it) => it.ok), openIds(items));
    ok('...and says nothing is missing', items.every((it) => it.why === ''));
    const sumOf = (summary) => { const i = finished(); i.fields.summary = summary; return byId(C.items(factsOf(i)), 'summary'); };
    ok('a summary starting with a [tag] is open, saying labels hold those', !sumOf('[UI] Overview flickers').ok && /\[UI\]/.test(sumOf('[UI] Overview flickers').why));
    ok('...so is "NPE: ...", and "(Exploit) ..."', !sumOf('NPE: wallet fails').ok && !sumOf('(Exploit) free isk').ok);
    ok('...but not a time, nor a plain one', sumOf('10:30 downtime shows twice').ok && sumOf('Overview: tabs reset').ok === true);
    const descOf = (paras, list) => { const i = finished(); i.fields.description = adf(paras, list); return C.items(factsOf(i)); };
    ok('the server and build at the top', byId(descOf(['Tranquility 2945678', 'x'], ['a', 'b']), 'build').ok);
    ok('...a missing build is named, with the report\'s build when its log said', (() => { const s = srcObj(); s.build = 2900000; const i = finished(); i.fields.description = adf(['Singularity', 'no number'], ['a', 'b']); const it = byId(C.items(C._facts(i, [], s)), 'build'); return !it.ok && /No build number/.test(it.why) && /build 2900000/.test(it.why); })());
    ok('...a missing server too', /No server name/.test(byId(descOf(['build 2945678'], ['a', 'b']), 'build').why));
    ok('...and both far down the description are not at the top', !byId(descOf(['x'.repeat(320) + ' Tranquility 2945678'], ['a', 'b']), 'build').ok);
    ok('reproduction steps as a list', byId(descOf(['Tranquility 2945678'], ['a', 'b']), 'steps').ok);
    ok('...or written "1. ... 2. ..."', byId(descOf(['Tranquility 2945678', '1. Dock 2. Undock 3. Observe the crash']), 'steps').ok);
    ok('...but not as prose', !byId(descOf(['Tranquility 2945678', 'Dock, then undock and it crashes.']), 'steps').ok);
    ok('...nor as one step', !byId(descOf(['Tranquility 2945678', 'Steps: 1. undock and it crashes.']), 'steps').ok);
    ok('the build and steps items offer a template to copy', /Server: \nBuild: /.test(byId(items, 'build').copy) && /^Reproduction steps:\n1\. /.test(byId(items, 'steps').copy));
    const fieldsOf = (sev, imp, st) => { const i = finished(); i.fields.customfield_101 = sev; i.fields.customfield_102 = imp; i.fields.customfield_103 = st; return byId(C.items(factsOf(i)), 'fields'); };
    ok('Severity, Impact and State: an unset one is named', fieldsOf({ value: 'A' }, null, { value: 'None' }).why === 'Not set yet: Impact.', fieldsOf({ value: 'A' }, null, { value: 'None' }).why);
    ok('...State "None" is set (it is one of its values)', fieldsOf({ value: 'A' }, { value: 'Minor' }, { value: 'None' }).ok);
    ok('...a field this Jira does not have is not asked for, and with none of them, no item', (() => {
        const i = finished(); i.names = { summary: 'Summary' }; return !byId(C.items(factsOf(i)), 'fields');
    })());
    ok('...with some of them, those are asked for', (() => {
        const i = finished(); i.names = { customfield_101: 'Severity', customfield_102: 'Impact' }; i.fields.customfield_102 = null;
        const it = byId(C.items(factsOf(i)), 'fields'); return it && !it.ok && it.why === 'Not set yet: Impact.';
    })());
    ok('Priority, Team and Epic Link: one the reporter set is named', (() => { const i = finished(); i.fields.customfield_10001 = { name: 'Core' }; const it = byId(C.items(factsOf(i)), 'fc'); return !it.ok && /Set on this defect by its reporter: Team/.test(it.why); })());
    ok('a label in lower case is named', (() => { const i = finished(); i.fields.labels = ['undock', 'Crash']; const it = byId(C.items(factsOf(i)), 'caps'); return !it.ok && /undock/.test(it.why); })());
    ok('a defect written from scratch has no rewrite or report-label items', (() => { const ids = C.items(C._facts(finished(), [], null)).map((it) => it.id).join(','); return ids.indexOf('desc') < 0 && ids.indexOf('replabels') < 0 && ids.indexOf('logs') >= 0; })());
    ok('...and its logs need no report to compare with', (() => { const it = byId(C.items(C._facts(finished(), [], null)), 'logs'); return it.ok; })());
    ok('a defect outside EDR is open, and may be marked not needed', (() => { const i = finished(); i.key = 'EO-5'; const it = byId(C.items(factsOf(i)), 'project'); return !it.ok && it.waivable; })());
    // the exception item
    const withExc = (descParas, exc) => { const s = srcObj(); s.exc = exc; const i = finished(); if (descParas) { i.fields.description = adf(descParas, ['a', 'b']); } return byId(C.items(C._facts(i, [], s)), 'exc'); };
    ok('no exception item while the report\'s logs hold none', !withExc(null, []) && !withExc(null, undefined));
    ok('...an open one when they hold some the description does not', (() => { const it = withExc(['Tranquility 2945678', 'no exception here'], [EXC]); return it && !it.ok && it.waivable && /logs hold 1 exception/.test(it.why); })());
    ok('...done once the description holds one of them', withExc(['Tranquility 2945678', 'EXC[' + EXC.sig + ']'], [EXC]).ok);
    // waivers
    const waived = (ids) => { const i = finished(); i.fields.attachment = [{ filename: 'logs.txt', size: 100 }]; i.properties = { 'jita.checklist': { v: 1, w: ids } }; return C.items(factsOf(i)); };
    ok('an item marked Not needed counts as done, and says who marked it', (() => { const it = byId(waived({ logs: { by: 'acc-rep', name: 'Hunter', at: '2026-11-08' } }), 'logs'); return !it.ok && it.waived && it.by.name === 'Hunter'; })());
    ok('...only items the guide lets a defect go without', (() => { const i = converted(); i.properties = { 'jita.checklist': { v: 1, w: { summary: { by: 'x' }, steps: { by: 'x' } } } }; const its = C.items(factsOf(i)); return !byId(its, 'summary').waived && !byId(its, 'steps').waived; })());
    ok('...which are the project, the report\'s labels, the logs and the exception', (() => { const s = srcObj(); s.exc = [EXC]; return C.items(C._facts(converted(), [], s)).filter((it) => it.waivable).map((it) => it.id).join(',') === 'project,replabels,logs,exc'; })());

    // ---- the state ----
    let s0 = srcObj(), st = C._judge(C._facts(finished(), [], s0), 'reporter', 'acc-rep', []);
    ok('while the report\'s logs are read the card cannot be finished, though nothing is open', st.pending && st.open === 0 && !st.complete);
    s0.failed = true;
    st = C._judge(C._facts(finished(), [], s0), 'reporter', 'acc-rep', []);
    ok('...logs that could not be read hold nothing up', !st.pending && st.complete);
    st = C._judge(C._facts(converted(), [], srcObj()), 'reporter', 'acc-rep', []);
    ok('the open items are counted', st.open === 7 && !st.complete, String(st.open));

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
    readOf = { 'EBR-10': { rec: { logs: true, exc: [EXC], build: null } } };
    me = 'acc-other';
    gets = [];
    last2 = await C.load('EDR-1', () => {});
    ok('someone the card is not for reads nothing more than who wrote the defect', last2.sees === '' && !last2.items && J(gets) === J(['/rest/api/3/issue/EDR-1?fields=reporter']), J(gets));
    me = 'acc-rep';

    // ---- the card ----
    onScreen = 'EDR-1';
    C.ensure();
    await settle();
    let g = document.getElementById(C.GROUP_ID), body = g && g.find('#jita-cl');
    ok('the card is mounted right under Details', !!g && anchor.nextSibling === g);
    ok('...its title says how many items are open', g && g.querySelector('[data-jita-title]') && g.querySelector('[data-jita-title]').textContent === 'Defect checklist · 8 open', g && g.querySelector('[data-jita-title]') && g.querySelector('[data-jita-title]').textContent);
    ok('...it names the bug report it was compared with', /Compared with EBR-10, the bug report it was converted from/.test(byCls(body, 'jcl-src')[0].textContent));
    const rows = byCls(body, 'jcl-item');
    ok('...one row per item, open ones marked ○, done ones ✓', rows.length === C.items(C._facts(converted(), [], Object.assign(srcObj(), { exc: [EXC] }))).length &&
        byCls(rows.filter((r) => r.attrs['data-item'] === 'summary')[0], 'jcl-mark')[0].textContent === '○' &&
        byCls(rows.filter((r) => r.attrs['data-item'] === 'caps')[0], 'jcl-mark')[0].textContent === '✓');
    ok('...with what is missing in the hover', /Still the bug report's summary/.test(byCls(rows.filter((r) => r.attrs['data-item'] === 'summary')[0], 'jcl-lbl')[0].attrs.title));
    const actsOf = (id) => byCls(rows.filter((r) => r.attrs['data-item'] === id)[0], 'jcl-act').map((a) => a.textContent).join(',');
    ok('the reporter may take the report\'s labels off, or mark them not needed', actsOf('replabels') === 'Take off,Not needed', actsOf('replabels'));
    ok('...copy a template for the build line and the steps', actsOf('build') === 'Copy' && actsOf('steps') === 'Copy');
    ok('...and mark the logs not needed, but not the summary', actsOf('logs') === 'Not needed' && actsOf('summary') === '');
    const excRows = byCls(body, 'jcl-erow');
    ok('the report\'s exceptions are listed with the defects holding them', excRows.length === 1 && /KeyError/.test(byCls(excRows[0], 'jcl-emsg')[0].textContent) &&
        byCls(excRows[0], 'jcl-edef')[0].textContent === 'EDR-7');
    ok('...each with Copy and Add', byCls(excRows[0], 'jcl-act').map((a) => a.textContent).join(',') === 'Copy,Add');
    let fin = byCls(body, 'jcl-finish')[0];
    ok('the hand-off waits for the last item', fin && fin.props.disabled === true && /8 items still open/.test(fin.attrs.title), fin && fin.attrs.title);
    ok('a defect that is no exploit keeps the exploit steps folded away', !byCls(body, 'jcl-warn').length && byCls(body, 'jcl-mline').some((l) => /Exploit/.test(l.textContent)));

    // a Lead's view
    isLead = true; me = 'acc-lead';
    await C.refresh('EDR-1');
    await settle();
    g = document.getElementById(C.GROUP_ID); body = g.find('#jita-cl');
    const leadActs = byCls(body, 'jcl-act').map((a) => a.textContent);
    ok('a Lead sees the card, but marks nothing and takes nothing off', leadActs.indexOf('Not needed') < 0 && leadActs.indexOf('Take off') < 0 && leadActs.indexOf('Add') < 0 && leadActs.indexOf('Copy') >= 0, leadActs.join(','));
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
    ok('an exception the description holds already is offered for Copy, no longer for Add', byCls(byCls(body, 'jcl-erow')[0], 'jcl-act').map((a) => a.textContent).join(',') === 'Copy');

    // ---- the hand-off ----
    ajaxLog = []; confirms = []; confirmAnswer = false;
    fin.fire('click');
    await settle();
    ok('the unassign asks first, and a no writes nothing', confirms.length === 1 && /Unassign EDR-1 and hand it to FC/.test(confirms[0]) && !puts().length);
    confirmAnswer = true;
    fin.fire('click');
    await settle();
    ok('...a yes unassigns it', puts().length === 1 && puts()[0].path === '/rest/api/3/issue/EDR-1/assignee' && J(puts()[0].body) === J({ accountId: null }), J(puts()));
    ok('...with the token Jira wants for a write', puts()[0].headers['X-Atlassian-Token'] === 'no-check');

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
    ok('...saying why', toasts.length === 1 && /stays assigned until the Defect checklist is done: 8 items still open/.test(toasts[0]), toasts.join(' | '));
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
    ajaxLog = []; toasts = [];
    await C.refresh('EDR-1');
    await settle();
    ok('an unassign that got past it (a shortcut) is put back to its assignee', puts().length === 1 && puts()[0].path === '/rest/api/3/issue/EDR-1/assignee' && J(puts()[0].body) === J({ accountId: 'acc-rep' }), J(puts()));
    ok('...saying why', toasts.some((t) => /It was put back to its assignee/.test(t)), toasts.join(' | '));
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
    await C._waive('EDR-1', 'logs', true);
    await settle();
    let put = puts()[0];
    ok('Not needed is kept on the issue, saying who and when, and asks nothing', confirms.length === 0 && put && put.path === '/rest/api/3/issue/EDR-1/properties/jita.checklist' &&
        put.body.v === 1 && put.body.w.logs.by === 'acc-rep' && put.body.w.logs.name === 'ISD BH Hunter' && !!put.body.w.logs.at, J(put));
    ajaxLog = [];
    answers = { 'GET /rest/api/3/issue/EDR-1/properties/jita.checklist': { ok: true, data: { key: 'jita.checklist', value: { v: 1, w: { logs: { by: 'acc-rep' }, exc: { by: 'acc-rep' } } } } } };
    await C._waive('EDR-1', 'logs', false);
    await settle();
    put = puts()[0];
    ok('...taking it back keeps the other marks (read again first)', put && J(put.body.w) === J({ exc: { by: 'acc-rep' } }), put && J(put.body));
    isLead = true; me = 'acc-lead';
    await C.refresh('EDR-1');
    await settle();
    ajaxLog = [];
    await C._waive('EDR-1', 'logs', true);
    await settle();
    ok('...a Lead marks nothing', !ajaxLog.length);
    isLead = false; me = 'acc-rep';
    await C.refresh('EDR-1');
    await settle();
    answers = {};
    ajaxLog = []; confirms = []; confirmAnswer = false;
    await C._takeLabels('EDR-1', ['PlatformWin']);
    ok('the report\'s labels come off only after a yes', confirms.length === 1 && /PlatformWin/.test(confirms[0]) && /cloned and jira_escalated stay/.test(confirms[0]) && !puts().length);
    confirmAnswer = true;
    await C._takeLabels('EDR-1', ['PlatformWin', 'Russian']);
    await settle();
    ok('...then one edit takes each off', puts().length === 1 && J(puts()[0].body) === J({ update: { labels: [{ remove: 'PlatformWin' }, { remove: 'Russian' }] } }), J(puts()));
    // the exception, added in an expand
    logText = { 'u-logs': "header\n\nkeyerror: 'x'|a.py:f>b.py:g>c.py:h\nTraceback (most recent call last):\n  File a.py\n\nother block" };
    ajaxLog = []; confirms = []; confirmAnswer = true;
    answers = { 'GET /rest/api/3/issue/EDR-1': { ok: true, data: { fields: { description: adf(['what the hunter wrote']) } } } };
    const sNow = C._state['EDR-1'];
    await C._addExc('EDR-1', sNow, EXC);
    await settle();
    put = puts()[0];
    ok('Add asks first, naming the expand\'s title', confirms.length === 1 && /in an expand titled:\n\nKeyError: 'x' raised while undocking/.test(confirms[0]), confirms[0]);
    ok('...reads the description again just before it writes', ajaxLog.filter((r) => r.method === 'GET' && /fields=description/.test(r.path)).length === 1);
    ok('...and appends the exception as the log has it, the hunter\'s text kept', put && put.body.fields.description.content.length === 2 &&
        put.body.fields.description.content[0].content[0].text === 'what the hunter wrote' && /Traceback \(most recent call last\)/.test(put.body.fields.description.content[1].content[0].content[0].text), put && J(put.body));
    ajaxLog = []; confirmAnswer = false;
    await C._addExc('EDR-1', sNow, EXC);
    ok('...a no writes nothing', !ajaxLog.length);
    // Copy
    copied = []; copyAnswer = true;
    const btn = N('<a class="jcl-act">Copy</a>');
    await C._copyExc(sNow, EXC, btn);
    ok('Copy copies the exception as the log has it', copied.length === 1 && /Traceback/.test(copied[0]) && btn.textContent === 'Copied', J(copied));
    copied = []; copyAnswer = false;
    await C._copyExc(sNow, { sig: 'gone|a:b>c:d', msg: 'Gone' }, btn);
    ok('...falls back to the signature\'s text, and asks for a second click when the browser refuses', copied[0] === 'tip:Gone' && btn.textContent === 'Copy again' && toasts.some((t) => /click Copy again/.test(t)));

    // ---- requests ----
    ajaxLog = [];
    answers = { 'PUT /rest/api/3/issue/EDR-9': [{ ok: false, status: 429, retry: '0' }, { ok: true, data: '' }] };
    let res = await C._req('PUT', '/rest/api/3/issue/EDR-9', { fields: {} });
    ok('a write Jira answers 429 is tried again, and an empty answer is fine', ajaxLog.length === 2 && J(res) === '{}', ajaxLog.length + ' ' + J(res));
    answers = { 'PUT /rest/api/3/issue/EDR-9': { ok: false, status: 400, json: { errorMessages: ['Field x is required'], errors: { labels: 'bad label' } } } };
    let err = null;
    try { await C._req('PUT', '/rest/api/3/issue/EDR-9', {}); } catch (e) { err = e; }
    ok('...a refusal says what Jira said, and carries the status', err && err.message === 'Field x is required bad label' && err.status === 400, err && err.message);
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

    // ================= the page observer =================
    const bs = src.indexOf('// ---- Jira boot: watch the DOM'), boot = src.slice(bs, src.indexOf('observer.observe(document.body', bs));
    ok('the page observer puts a wiped card back at once, before its wait', /try \{ JiTA\.checklist\.reensure\(\); \}/.test(boot.slice(0, boot.indexOf('if (scheduled)'))));
    ok('...and, after it, follows the defect on screen and judges it again after a change', /try \{ JiTA\.checklist\.ensure\(\); \}/.test(boot.slice(boot.indexOf('setTimeout(function () {'))));

    // ================= no emoji =================
    const glyphs = Object.keys(C.MARKS).map((k) => C.MARKS[k]).concat(['↻', '▸', '▾']);
    const emoji = glyphs.filter((g2) => Array.from(g2).some((ch) => /\p{Emoji_Presentation}/u.test(ch) || /\p{Extended_Pictographic}/u.test(ch)));
    ok('the card\'s symbols are text, never emoji', emoji.length === 0, emoji.join());
    const block = src.slice(cs, ce);
    ok('...and the card has no dash a reader could take for one', !/[–—]/.test(block));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'defect checklist checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
