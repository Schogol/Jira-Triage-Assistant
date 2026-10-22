// excfind-check.js - the exception search (double-tap + on a defect): the open bug reports whose logs hold the
// defect's exceptions. Evals the real JiTA.excfind, JiTA.logsig's fingerprints, JiTA.profile's cache helpers, the Attach
// control's options (JiTA.ui._attachReportButton) and the launcher against stubs and a small DOM.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const once = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return s;
};
const member = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n    },', s) + 7); };
const line = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n', s) + 1); };
const block = (head, end) => { const s = once(head); return src.slice(s, src.indexOf(end, s) + end.length); };
const cut = (a, b) => { const s = once(a); return src.slice(s, src.indexOf(b, s)); };

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async (n) => { for (let i = 0; i < (n || 30); i++) { await new Promise((r) => setImmediate(r)); } };
const settle = async () => { await new Promise((r) => setTimeout(r, 20)); await flush(); };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

// ---- a small DOM, and a jQuery stand-in over it ----
let byId = {};
class Node {
    constructor(tag) { this.tag = tag; this.className = ''; this.attrs = {}; this.kids = []; this.parentNode = null; this.txt = ''; this.handlers = {}; this.props = {}; this.style = {}; }
    get childNodes() { return this.kids.slice(); }
    get isConnected() { let n = this; while (n.parentNode) { n = n.parentNode; } return n === ROOT; }
    appendChild(c) { if (c.parentNode) { c.parentNode.removeChild(c); } c.parentNode = this; this.kids.push(c); return c; }
    removeChild(c) { const i = this.kids.indexOf(c); if (i >= 0) { this.kids.splice(i, 1); } c.parentNode = null; return c; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') { byId[v] = this; } }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    get textContent() { return this.txt + this.kids.map((k) => k.textContent).join(''); }
    set textContent(v) { this.kids.forEach((k) => { k.parentNode = null; }); this.kids = []; this.txt = String(v); }
    hasCls(c) { return this.className.split(/\s+/).indexOf(c) >= 0; }
    all() { return [this].concat(...this.kids.map((k) => k.all())); }
}
const ROOT = new Node('body');
function parse(html) {
    const m = /^<(\w+)([^>]*)>([^<]*)/.exec(html), n = new Node(m[1]), re = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = re.exec(m[2]))) { if (a[1] === 'class') { n.className = a[2]; } else { n.setAttribute(a[1], a[2]); } }
    n.txt = m[3] || '';
    return n;
}
function wrap(nodes) {
    const j = {
        nodes, length: nodes.length,
        appendTo(p) { const t = p.nodes ? p.nodes[0] : p; nodes.forEach((n) => t.appendChild(n)); return j; },
        append(c) { (c.nodes || [c]).forEach((n) => nodes[0].appendChild(n)); return j; },
        text(t) {
            if (t === undefined) { return nodes.map((n) => n.textContent).join(''); }
            nodes.forEach((n) => { n.kids.forEach((k) => { k.parentNode = null; }); n.kids = []; n.txt = String(t); });
            return j;
        },
        attr(k, v) { if (v === undefined) { return nodes[0] ? nodes[0].getAttribute(k) : undefined; } nodes.forEach((n) => n.setAttribute(k, v)); return j; },
        addClass(c) { nodes.forEach((n) => { String(c).split(/\s+/).forEach((x) => { if (x && !n.hasCls(x)) { n.className = (n.className + ' ' + x).trim(); } }); }); return j; },
        removeClass(c) { nodes.forEach((n) => { const drop = String(c).split(/\s+/); n.className = n.className.split(/\s+/).filter((x) => drop.indexOf(x) < 0).join(' '); }); return j; },
        hasClass(c) { return nodes.some((n) => n.hasCls(c)); },
        toggleClass(c, on) { return on ? j.addClass(c) : j.removeClass(c); },
        prop(k, v) { if (v === undefined) { return nodes[0] && nodes[0][k]; } nodes.forEach((n) => { n[k] = v; }); return j; },
        on(ev, f) { nodes.forEach((n) => { (n.handlers[ev] = n.handlers[ev] || []).push(f); }); return j; },
        off(ev) { nodes.forEach((n) => { n.handlers[ev] = []; }); return j; },
        empty() { nodes.forEach((n) => { n.kids.forEach((k) => { k.parentNode = null; }); n.kids = []; n.txt = ''; }); return j; },
        children(sel) { const c = sel ? sel.slice(1) : null; return wrap([].concat(...nodes.map((n) => n.kids.filter((k) => !c || k.hasCls(c))))); },
        closest() { return j; }, remove() { nodes.forEach((n) => { if (n.parentNode) { n.parentNode.removeChild(n); } }); return j; }
    };
    if (nodes[0]) { j[0] = nodes[0]; }
    return j;
}
global.document = {
    createElement: (t) => new Node(t),
    createTextNode: (t) => { const n = new Node('#text'); n.txt = String(t); return n; },
    getElementById: (id) => { const n = byId[id]; return n && n.isConnected ? n : null; },
    querySelector: () => null
};
global.$ = (x) => {
    if (typeof x === 'string' && x.charAt(0) === '<') { return wrap([parse(x)]); }
    if (typeof x === 'string' && x.charAt(0) === '#') { const n = document.getElementById(x.slice(1)); return wrap(n ? [n] : []); }
    if (x && x.nodes) { return x; }
    return wrap(x ? [x] : []);
};
let ajax = {}, ajaxUrls = [];
$.ajax = (o) => {
    ajaxUrls.push(o.url);
    const k = Object.keys(ajax).find((p) => o.url.indexOf(p) >= 0), r = k ? ajax[k] : { ok: false, xhr: { status: 404 } };
    const d = { done(f) { if (r.ok) { setImmediate(() => f(r.data)); } return d; }, fail(f) { if (!r.ok) { setImmediate(() => f(r.xhr)); } return d; } };
    return d;
};
const click = (n, ev) => (n.handlers[ev || 'click'] || []).forEach((f) => f.call(n, { preventDefault() {}, stopPropagation() {} }));
const find = (root, pred) => root.all().filter(pred);
const byCls = (root, c) => find(root, (n) => n.hasCls(c));

// ---- the real code ----
let meta = {}, flags = {}, toasts = [];
global.GM_addStyle = () => {};
global.gmGet = (k, d) => d;
global.gmSet = () => {};
global.flagOn = (n) => flags[n] !== false;
global.confirm = () => true;
global.JITA_NO_JIRA_UI = false;
let crumb = 'EDR-77';
global.jitaCurrentKey = () => crumb;
global.jitaLinkedKeys = (links) => (links || []).map((l) => (l.outwardIssue || l.inwardIssue).key);
global.JiTA = { HOST: 'https://jira', EBR_SCOPE: 'project = EBR AND statusCategory != Done', PAGE_SIZE: 100, util: {}, logsig: {}, ocr: {}, db: {}, sync: {}, ui: {}, menu: {}, link: {} };
Object.assign(JiTA.util, eval('({' + member('    toPlainText: function (d) {') + member('    isClosedStatus: function (status) {') + '})'));
JiTA.util.fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : '');
JiTA.util.delay = (ms) => new Promise((r) => setTimeout(r, ms));
let crashCalls = 0;
Object.assign(JiTA.logsig, eval('({' + line('    MIN_FRAMES: ') + line('    CRASH_FRAMES: ') + line('    TRACE: ') + line('    OPEN_CUT: ') + line('    isTrace: function (sig) {') +
    line('    isCut: function (sig) {') + line('    _traceKey: function (sig) {') + member('    _splitBlocks: function (text) {') + member('    _fingerprint: function (text) {') +
    member('    _crashOf: function (sig) {') + '})'));
// What counts (JiTA.excnoise), the real one over the stubs above (excnoise-check.js covers it).
Object.assign(JiTA.logsig, eval('({' + line('    isUserError: function (sig) {') + line('    _msgKey: function (sig) {') + '})'));
eval(block('JiTA.excnoise = {', '\n};\n'));
const realCrash = JiTA.logsig._crashOf;
JiTA.logsig._crashOf = function (s) { crashCalls++; return realCrash.call(this, s); };
JiTA.ocr._langFromLabels = () => null;
JiTA.db.getMeta = (k) => Promise.resolve(k in meta ? meta[k] : null);
JiTA.db.setMeta = (k, v) => { meta[k] = v; return Promise.resolve(); };
let dbRec = null;
JiTA.db.getDefect = () => Promise.resolve(dbRec);
eval(block('JiTA.profile = {', '\n    _noop: null\n};\n'));
eval(block('JiTA.excfind = {', '\n    _noop: null\n};\n'));
const P = JiTA.profile, X = JiTA.excfind;
X.WAIT_MS = 1;

// ---- exceptions, written as a defect description and as log lines ----
const frames = (list) => list.map((f) => '/eve/client/script/' + f);
const descBlock = (msg, fr) => ['EXCEPTION #1 logged at 10/03/2026 14:02:00', 'Formatted exception info: ' + msg, 'Caught at:'].concat(frames(fr)).concat(['EXCEPTION END']).join(' ');
const FA = ['ui/foo.py(123) OnClick', 'ui/bar.py(45) Load'], FA2 = ['ui/other.py(9) Start', 'ui/foo.py(123) OnClick', 'ui/bar.py(45) Load'];
const FB = ['sys/baz.py(9) Run', 'sys/qux.py(10) Go'];
const fp = (msg, fr) => JiTA.logsig._fingerprint(descBlock(msg, fr));
const A = fp('KeyError: 2', FA), A2 = fp('KeyError: 2', FA2), B = fp('ValueError: bad', FB), L = fp('TypeError: lone', ['sys/one.py(1) Only']);

(async () => {
    // ================= what to look for =================
    const desc = 'Steps: click. ' + descBlock('KeyError: 2', FA) + ' then ' + descBlock('KeyError: 2', FA) + ' and ' + descBlock('TypeError: lone', ['sys/one.py(1) Only']);
    let d = X._fps(desc);
    ok('a description gives each exception with a stack once', d.length === 1 && d[0].sig === A.sig && d[0].msg === 'KeyError: 2', JSON.stringify(d));
    ok('...and none from text without an exception', X._fps('just words').length === 0 && X._fps('').length === 0 && X._fps(null).length === 0);
    ok('A and A2 differ by stack but share a crash site (control)', A.sig !== A2.sig && realCrash(A.sig) === realCrash(A2.sig) && !L.sig);

    const sm = { withLog: 10, excGroups: [
        { msg: 'KeyError: 2', paths: [{ sig: A2.sig, count: 6 }, { sig: A.sig, count: 2 }] },
        { msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 3 }] }
    ] };
    let ts = X.targets([{ sig: A.sig, msg: 'KeyError: 2' }], sm);
    ok('the description\'s exceptions come first, then the most shared', ts.map((t) => t.sig).join() === [A.sig, A2.sig, B.sig].join(), ts.map((t) => t.msg + ' ' + t.count).join(' | '));
    ok('...one in both says both', ts[0].desc === true && ts[0].count === 2 && ts[0].of === 10);
    ok('...each carries its crash site', ts.every((t) => t.crash === realCrash(t.sig)));
    const one = { key: 'EBR-50', log: true, exc: [{ sig: B.sig, msg: 'ValueError: bad' }, { sig: A.sig, msg: 'KeyError: 2' }, { sig: A2.sig, msg: 'KeyError: 2' }] };
    ts = X.targets([{ sig: A.sig, msg: 'KeyError: 2' }], { withLog: 1, excGroups: [] }, one);
    ok('one report attached: every exception in its log is offered, after the description\'s', ts.map((t) => t.sig).join() === [A.sig, B.sig, A2.sig].join() &&
        ts[0].desc && ts[0].one === 'EBR-50' && ts[1].one === 'EBR-50' && !ts[1].desc && ts[1].count === 0, ts.map((t) => t.msg + ' ' + t.one).join(' | '));
    ok('...told apart by their stacks like the rest', !!ts[0].via && !!ts[2].via && ts[0].via !== ts[2].via);
    ok('...and said to come from its log', X._src(ts[1]) === 'in the log of EBR-50' && X._src(ts[0]) === 'in the description, in the log of EBR-50', X._src(ts[0]));
    ok('without it, no exception comes from a single log', X.targets([], sm, null).every((t) => t.one === null));
    const view = (key, logRead, exc) => ({ key, logRead, exc });
    const o1 = X._one({ views: [view('EBR-50', true, one.exc)] });
    ok('a profile with one report gives that report\'s log', o1 && o1.key === 'EBR-50' && o1.log === true && o1.exc.length === 3, JSON.stringify(o1));
    ok('...one not read yet says so, with no exceptions', X._one({ views: [view('EBR-50', null)] }).log === null && X._one({ views: [view('EBR-50', null)] }).exc.length === 0);
    ok('...several reports, or none, give no single log', X._one({ views: [view('EBR-50', true, []), view('EBR-51', true, [])] }) === null && X._one({ views: [] }) === null && X._one(null) === null);
    const many = [];
    for (let i = 0; i < 20; i++) { many.push({ sig: 's' + i + '|a.py:f>b.py:g', count: 30 - i }); }
    ts = X.targets([], { withLog: 40, excGroups: [{ msg: 'm', paths: many }] });
    ok('at most ' + X.MAX_SHARED + ' shared exceptions are offered, the most shared', ts.length === X.MAX_SHARED && ts[0].count === 30 && ts[ts.length - 1].count === 30 - X.MAX_SHARED + 1);
    ok('no description and no profile, nothing to look for', X.targets(null, null).length === 0);
    let tip = P._sigTip(A.sig, 'KeyError: 2');
    ok('a hover text: the message as written, then the stack one frame a line', tip === 'KeyError: 2\n\nStack, innermost last:\n    foo.py: onclick\n    bar.py: load', JSON.stringify(tip));
    tip = P._sigTip([A2.sig, A.sig], 'KeyError: 2');
    ok('...several stacks of one message: the message once, each stack numbered', tip.split('KeyError').length === 2 && /Stack 1 of 2, innermost last:\n    other\.py: start/.test(tip) &&
        /\n\nStack 2 of 2, innermost last:\n    foo\.py: onclick\n    bar\.py: load$/.test(tip), JSON.stringify(tip));
    ok('...with no message given, the signature\'s own', P._sigTip(A.sig).indexOf('keyerror: 2\n') === 0);
    ok('...and a signature without frames is its message alone', P._sigTip('valueerror: x|') === 'valueerror: x');
    ts = X.targets([{ sig: A.sig, msg: 'KeyError: 2' }], { withLog: 10, excGroups: [{ msg: 'KeyError: 2', paths: [{ sig: A2.sig, count: 6 }] }, { msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 6 }] }] });
    ok('two exceptions with one message are told apart by where their stacks differ', !!ts[0].via && !!ts[1].via && ts[0].via !== ts[1].via && /other\.py:start/.test(ts[1].via),
        ts.map((t) => t.via).join(' | '));
    ok('...one with a message of its own needs no such hint', ts[2].via === undefined);

    // ================= matching =================
    const pool = {};
    crashCalls = 0;
    const item = (key, logExc, descExc, created) => ({ key, desc: descExc || [], fields: { summary: key + ' summary', created: created || '2026-10-0' + key.slice(-1) + 'T00:00:00.000+0000', status: { name: 'Open' } } });
    const r1 = X._entry(item('EBR-1'), { exc: [{ sig: A.sig, msg: 'KeyError: 2' }, { sig: B.sig, msg: 'ValueError: bad' }] }, pool);
    const r2 = X._entry(item('EBR-2'), { exc: [{ sig: A.sig, msg: 'KeyError: 2' }] }, pool);
    ok('an exception many reports hold is kept once, its crash site worked out once', r1.log[0] === r2.log[0] && crashCalls === 2 && r1.log[0].crash === realCrash(A.sig), crashCalls);
    ok('...a report keeps its summary, date and status', r1.summary === 'EBR-1 summary' && r1.status === 'Open' && /^2026-10-01/.test(r1.created));
    const tA = { sig: A.sig, crash: realCrash(A.sig), msg: 'KeyError: 2' }, tA2 = { sig: A2.sig, crash: realCrash(A2.sig), msg: 'KeyError: 2' }, tB = { sig: B.sig, crash: realCrash(B.sig), msg: 'ValueError: bad' };
    let m = X.match(r1, [tA]);
    ok('the same stack is an exact match, in the log', m.length === 1 && m[0].exact === true && m[0].where === 'log' && m[0].t === tA);
    m = X.match(r2, [tA2]);
    ok('another stack to the same crash site is a loose one', m.length === 1 && m[0].exact === false);
    ok('another crash site is none', X.match(r2, [tB]).length === 0);
    const r3 = X._entry(item('EBR-3', null, [{ sig: A2.sig, msg: 'KeyError: 2' }]), { exc: [{ sig: A.sig, msg: 'KeyError: 2' }] }, pool);
    m = X.match(r3, [tA2]);
    ok('an exact match in the description beats a loose one in the log', m.length === 1 && m[0].exact && m[0].where === 'description', JSON.stringify(m.map((h) => [h.exact, h.where])));
    m = X.match(r1, [tA2, tB]);
    ok('exact matches are listed first', m.length === 2 && m[0].t === tB && m[0].exact && !m[1].exact);
    ok('nothing ticked, nothing matches', X.match(r1, []).length === 0);
    m = X.match(r2, [tA, tA2]);
    ok('one exception matching two ticked ones that end in one place is said once, by its exact match', m.length === 1 && m[0].exact && m[0].t === tA, JSON.stringify(m.map((x) => [x.t.msg, x.exact])));
    const rA2 = X._entry(item('EBR-7'), { exc: [{ sig: A2.sig }] }, pool);
    m = X.match(rA2, [tA, tA2]);
    ok('...whichever of the two it is', m.length === 1 && m[0].exact && m[0].t === tA2);
    const r4 = X._entry(item('EBR-4'), null, pool);
    ok('a report without a reading holds nothing', r4.log.length === 0 && X.match(r4, [tA]).length === 0);
    ok('two exceptions without a crash site do not match each other loosely', X.match(X._entry(item('EBR-37'), { exc: [{ sig: 'keyerror: y|' }] }, {}), [{ sig: 'valueerror: x|', crash: null }]).length === 0);

    // ================= editing what an exception is looked for by =================
    const UE = "IndustryError: Industry error, msg=IndustryValidationError, dict={'errors': [(<Error.MISMATCH_COST: 25>, (12, 1677))]}";
    const FU = ['ui/industry.py(10) Validate', 'ui/foo.py(123) OnClick', 'ui/bar.py(45) Load'];
    const U = fp(UE, FU), tU = { sig: U.sig, crash: U.crashSig, msg: U.msg };
    const um = (msg, fr) => X._exc(fp(msg, fr || FU).sig).m;
    const samples = ['KeyError: 2', UE, 'Bad 0xFF00 thing (3, 4) id 123456 v 99L', 'list [1, 22] and {7} or 5,6', 'TypeError:   spaced   out'];
    ok('an edit reads numbers as a signature does (in step with _fingerprint)',
        samples.every((msg) => { const f = fp(msg, FA); return X._normMsg(f.msg).toLowerCase() === P._sigParts(f.sig).msg; }),
        samples.map((msg) => X._normMsg(fp(msg, FA).msg)).join(' | '));
    ok('an edit starts from the message as written, numbers and all', X._editText(tU) === UE, X._editText(tU));
    ok('...one cut short ends in a *, for the rest of it', X._editText({ sig: U.sig, msg: 'x'.repeat(X.MSG_CUT) }) === 'x'.repeat(X.MSG_CUT) + '*' &&
        X._editText({ sig: U.sig, msg: 'x'.repeat(X.MSG_CUT - 1) }) === 'x'.repeat(X.MSG_CUT - 1));
    ok('...and one without a message from the signature\'s', X._editText({ sig: U.sig, msg: '' }) === P._sigParts(U.sig).msg);
    ok('a message is cut where a profile reading cuts it', /msg: String\(fp\.msg \|\| ''\)\.slice\(0, (\d+)\)/.exec(src)[1] === String(X.MSG_CUT));
    let re = X._pattern(UE.replace('25', '#'));
    ok('# stands for any number', re.test(um(UE)) && re.test(um(UE.replace('25', '30'))) && re.test(um(UE.replace('25', '7').replace('1677', '42'))), re.source);
    ok('...not for text', !re.test(um(UE.replace('25', 'x'))));
    ok('...and the rest must be as written', !re.test(um(UE.replace('MISMATCH_COST', 'MISSING_ITEM'))));
    ok('...the whole message, not a part of it', !X._pattern('KeyError: 2').test(um('KeyError: 23')) && X._pattern('KeyError: 2').test(um('KeyError: 2')));
    ok('the text an edit starts from matches the exception itself, and no other value', X._pattern(X._editText(tU)).test(um(UE)) && !X._pattern(X._editText(tU)).test(um(UE.replace('25', '30'))));
    ok('...the signature\'s test reads numbers as the signature does (only for a message cut short)', X._pattern(UE).test(um(UE)) && X._pattern(UE).test(um(UE.replace('(12, 1677)', '(3, 4)'))));
    const W = (msg) => X._asWritten(msg).raw;
    let rw = X._rawPattern(UE.replace('25', '#'));
    ok('as written, # stands for any number', rw.test(W(UE)) && rw.test(W(UE.replace('25', '30'))) && !rw.test(W(UE.replace('25', 'x'))), rw.source);
    ok('...and every other number is as written, even one a signature reads as any number', !rw.test(W(UE.replace('(12, 1677)', '(12, 9)'))));
    rw = X._rawPattern("IndustryError: Industry error, msg=IndustryValidationError, dict={'errors': [(<Error.MISMATCH_COST: #>, (12, #))]}");
    ok('...so (12, #) takes 12 and any number, not 13', rw.test(W(UE)) && rw.test(W(UE.replace('1677', '5'))) && !rw.test(W(UE.replace('(12, 1677)', '(13, 1677)'))));
    ok('...* any text, case and spacing aside, the whole message', X._rawPattern('  industryerror:  INDUSTRY error, *').test(W(UE)) && !X._rawPattern('Industry error').test(W(UE)) &&
        X._rawPattern('a.b').test('a.b') && !X._rawPattern('a.b').test('axb'));
    ok('...a # in the message is matched by a # too', X._rawPattern('item #').test(W('Item #')) && X._rawPattern('item #').test(W('item 12')));
    const T = (pat, msg, pre) => X._tokMatch(X._toks(pat), W(msg), pre);
    ok('the tokens match as the test does: # digits, * anything, the rest as written', T('KeyError: #', 'KeyError: 22') && !T('KeyError: #', 'KeyError: x') && T('a*b', 'axxb') &&
        T('a*', 'a') && !T('ab', 'a') && !T('a', 'ab') && T('Item #', 'item #'));
    ok('...and, for a message cut short, may run off its end', T('KeyError: # in *', 'KeyError: 2', true) && T('KeyError: #', 'KeyError: 12', true) && !T('KeyError: x', 'KeyError: 2', true) &&
        !T('KeyError: x', 'KeyError: 2', false));
    ok('...a long message and pattern are no trouble', T('a'.repeat(150) + '*' + 'b#*', 'a'.repeat(150) + 'c'.repeat(300) + 'b12 end'));
    re = X._pattern('IndustryError: Industry error, msg=* dict=*');
    ok('* stands for any text', re.test(um(UE)) && re.test(um('IndustryError: Industry error, msg=Other, dict={}')) && !re.test(um('ValueError: x')), re.source);
    ok('...whatever the case and spacing typed', X._pattern('  industryerror:   INDUSTRY error, *').test(um(UE)));
    ok('...and other regex characters are text', X._pattern('a.b').test('a.b') && !X._pattern('a.b').test('axb') && X._pattern('(x)+[y]$').test('(x)+[y]$'));
    ok('* alone is any message', X._pattern('*').test(um('Whatever: 1')) && X._pattern('*').test(''));
    const eU = X._exc(U.sig);
    ok('an exception keeps its message, frames and crash-site frames apart', eU.m === P._sigParts(U.sig).msg && eU.fr === 'industry.py:validate>foo.py:onclick>bar.py:load' &&
        eU.cfr === 'foo.py:onclick>bar.py:load' && eU.crash === U.crashSig, JSON.stringify(eU));
    ts = X.targets([{ sig: U.sig, msg: U.msg }, { sig: A.sig, msg: 'KeyError: 2' }], null, null, { [U.sig]: 'IndustryError: *' });
    ok('an edited target is looked for by its edit, with its own frames', ts[0].pat === 'IndustryError: *' && ts[0].re.test(eU.m) && ts[0].fr === eU.fr && ts[0].cfr === eU.cfr);
    ok('...the others as they are', ts[1].pat === null && !ts[1].re);
    const pool2 = {}, otherStack = ['ui/other.py(1) Start', 'ui/foo.py(123) OnClick', 'ui/bar.py(45) Load'];
    const tUe = X._withPattern({ sig: U.sig, crash: U.crashSig, msg: U.msg }, UE.replace('25', '#'));
    const rep30 = (key, msg, fr) => X._entry(item(key), { exc: [{ sig: fp(msg, fr).sig, msg: fp(msg, fr).msg }] }, pool2);
    m = X.match(rep30('EBR-31', UE.replace('25', '30'), FU), [tUe]);
    ok('an edit matches another value at the same stack exactly', m.length === 1 && m[0].exact);
    m = X.match(rep30('EBR-32', UE.replace('25', '30'), otherStack), [tUe]);
    ok('...by another stack to the same crash site loosely', m.length === 1 && !m[0].exact);
    ok('...at another crash site not at all', X.match(rep30('EBR-33', UE.replace('25', '30'), FB), [tUe]).length === 0);
    ok('...nor where the rest of the message differs, at either level', X.match(rep30('EBR-34', UE.replace('MISMATCH_COST', 'OTHER'), FU), [tUe]).length === 0 &&
        X.match(rep30('EBR-35', UE.replace('MISMATCH_COST', 'OTHER'), otherStack), [tUe]).length === 0);
    ok('unedited, another value is no match (control)', X.match(rep30('EBR-36', UE.replace('25', '30'), FU), [tU]).length === 0);
    const U2 = UE.replace('(12, 1677)', '(13, 1)');
    ok('two messages a signature reads as one (its tuple read as any numbers)', fp(U2, FU).sig === U.sig);
    ok('...are, unedited, two exceptions: looked for as written, numbers included', X.match(rep30('EBR-37', U2, FU), [tU]).length === 0 &&
        X.match(rep30('EBR-38', U2, otherStack), [tU]).length === 0);
    m = X.match(rep30('EBR-39', UE, FU), [tU]);
    ok('...while the message as written is found, exactly at its stack', m.length === 1 && m[0].exact);
    m = X.match(rep30('EBR-40', UE, otherStack), [tU]);
    ok('...and loosely at another stack to its crash site', m.length === 1 && !m[0].exact);
    ok('...whatever its case', X.match(rep30('EBR-41', UE.toUpperCase(), FU), [tU]).length === 1);
    ok('an edit with # where the numbers differ finds them', X.match(rep30('EBR-42', U2, FU), [X._withPattern({ sig: U.sig, crash: U.crashSig, msg: U.msg }, UE.replace('(12, 1677)', '(#, #)'))]).length === 1);
    ok('...and a number it keeps stays that number', X.match(rep30('EBR-43', U2, FU), [X._withPattern({ sig: U.sig, crash: U.crashSig, msg: U.msg }, UE.replace('(12, 1677)', '(12, #)'))]).length === 0);
    const longA = 'KeyError: ' + 'k'.repeat(250) + ' 7', longB = 'KeyError: ' + 'k'.repeat(250) + ' 8';
    const cutEntry = (msg) => X._entry(item('EBR-44'), { exc: [{ sig: fp(msg, FA).sig, msg: fp(msg, FA).msg.slice(0, X.MSG_CUT) }] }, {});
    const tLong = { sig: fp(longA, FA).sig, crash: fp(longA, FA).crashSig, msg: fp(longA, FA).msg };
    ok('a message a reading cut short is compared as far as it goes', X.match(cutEntry(longA), [tLong]).length === 1 && cutEntry(longA).log[0].cut);
    ok('...beyond it, the signature tells them apart (a bare number it keeps)', X.match(cutEntry(longB), [tLong]).length === 0);
    const tLongE = X._withPattern(Object.assign({}, tLong), 'KeyError: ' + 'k'.repeat(250) + ' #');
    ok('...and an edit is checked as far as the message goes, the rest by the signature', X.match(cutEntry(longB), [tLongE]).length === 1 &&
        X.match(cutEntry('KeyError: ' + 'k'.repeat(249) + 'j 8'), [tLongE]).length === 0);
    const longC = 'KeyError: (5) ' + 'k'.repeat(250) + ' 8', longD = longC.replace('(5)', '(6)');
    const tLongC = X._withPattern({ sig: fp(longC, FA).sig, crash: fp(longC, FA).crashSig, msg: fp(longC, FA).msg }, 'KeyError: (5) ' + 'k'.repeat(250) + ' #');
    ok('...a number it keeps in the part there is stays that number, though the signature reads it as any', fp(longD, FA).sig === fp(longC, FA).sig &&
        X.match(cutEntry(longC), [tLongC]).length === 1 && X.match(cutEntry(longD), [tLongC]).length === 0);
    ok('without the message as written (an older reading), the signature decides alone',
        X.match(X._entry(item('EBR-45'), { exc: [{ sig: fp(U2, FU).sig }] }, {}), [tU]).length === 1 && X._exc(U.sig).raw === null);
    ok('the same exception with another message as written is kept apart, the same one shared', (() => {
        const pl = {}, a = X._entry(item('EBR-46'), { exc: [{ sig: U.sig, msg: UE }] }, pl), b = X._entry(item('EBR-47'), { exc: [{ sig: U.sig, msg: U2 }, { sig: U.sig, msg: UE }] }, pl);
        return a.log[0] === b.log[1] && a.log[0] !== b.log[0];
    })());
    ts = X.targets([{ sig: A.sig, msg: 'KeyError: 2' }], null, null, null,
        { typed: [{ id: 'typed:1', text: 'KeyError: *' }], pasted: [{ sig: B.sig, msg: 'ValueError: bad' }, { sig: A.sig, msg: 'KeyError: 2' }], n: 1 });
    ok('added exceptions come after the defect\'s own: pasted ones at their stack, typed ones last',
        ts.map((t) => t.msg + (t.own ? '+' : '') + (t.typed ? '*' : '')).join() === 'KeyError: 2+,ValueError: bad+,KeyError: *+*', ts.map((t) => t.msg).join());
    ok('...a typed one has no stack, and is not told apart by one', ts[2].typed && ts[2].fr === null && ts[2].cfr === null && !ts[2].via && ts[2].pat === 'KeyError: *');
    ok('...matches its message at any stack, as the same message', (() => { const mm = X.match(X._entry(item('EBR-61'), { exc: [{ sig: A2.sig, msg: 'KeyError: 2' }] }, {}), [ts[2]]); return mm.length === 1 && !mm[0].exact; })());
    ok('...and not another message', X.match(X._entry(item('EBR-62'), { exc: [{ sig: B.sig, msg: 'ValueError: bad' }] }, {}), [ts[2]]).length === 0);
    ok('...its numbers as written too', X.match(X._entry(item('EBR-63'), { exc: [{ sig: A.sig, msg: 'KeyError: 2' }] }, {}), [X._typed({ id: 'typed:9', text: 'KeyError: 3' })]).length === 0 &&
        X.match(X._entry(item('EBR-64'), { exc: [{ sig: A.sig, msg: 'KeyError: 2' }] }, {}), [X._typed({ id: 'typed:9', text: 'KeyError: #' })]).length === 1);
    ok('where an added exception comes from', X._src(ts[2]) === 'added by you, at any stack' && X._src(ts[1]) === 'added by you' && X._src(ts[0]) === 'in the description',
        [X._src(ts[2]), X._src(ts[1]), X._src(ts[0])].join(' | '));
    ok('hovering a typed one says it has no stack', X._tip(ts[2]) === 'Looked for by this message alone, at any stack' && X._tip(ts[0]) === P._sigTip(A.sig, 'KeyError: 2'));

    const reps = [r1, r2, r3, r4];
    reps.forEach((r) => { r.m = X.match(r, [tA2]); });
    let h = X.hits(reps);
    ok('hits: exact matches first, then newest first', h.map((r) => r.key).join() === 'EBR-3,EBR-2,EBR-1', h.map((r) => r.key).join());
    r2.gone = true;
    ok('...a report attached from the window is gone', X.hits(reps).map((r) => r.key).join() === 'EBR-3,EBR-1');
    r2.gone = false;

    // ================= reading a report: the cache, and when it is out of date =================
    let reads = [];
    P._readFiles = (it, rec, zip) => { reads.push({ key: it.key, rec: rec, zip: zip }); return Promise.resolve({ v: P.V, key: it.key, logs: true, hasLog: true, exc: [{ sig: A.sig, msg: 'KeyError: 2' }], logSig: P._logSig(it.fields.attachment) }); };
    const att = (name, size) => ({ filename: name, size: size || 100, content: 'https://jira/att/' + name });
    const it5 = { key: 'EBR-5', desc: [], fields: { attachment: [att('logs.txt', 500)] } };
    meta['rp:EBR-5'] = { v: P.V, key: 'EBR-5', logs: true, hasLog: true, exc: [{ sig: B.sig }], logSig: 'logs.txt:500', lv: P.LOG_V, zip: true, wer: true };
    let r = await X._read(it5);
    ok('a cached reading of the same log files is used, nothing downloaded', r.cached === true && reads.length === 0 && r.rec.exc[0].sig === B.sig);
    meta['rp:EBR-5'].logSig = 'logs.txt:400';
    r = await X._read(it5);
    ok('a log replaced since is read again', r.cached === false && reads.length === 1 && reads[0].rec && reads[0].rec.logs === false && reads[0].rec.exc.length === 0 &&
        reads[0].rec.logSig === undefined, JSON.stringify(reads[0] && reads[0].rec));
    ok('...keeping what the zip said, and without the zip', reads[0].rec.zip === true && reads[0].rec.wer === true && reads[0].zip === false);
    ok('...the cached reading itself is not changed', meta['rp:EBR-5'].logs === true && meta['rp:EBR-5'].exc.length === 1);
    reads = [];
    delete meta['rp:EBR-5'].logSig;
    r = await X._read(it5);
    ok('a reading from before log files were named is used as it is', r.cached === true && reads.length === 0);
    // Read before the reader read stacktraces (it has no lv): its logs again, the zip's part kept.
    meta['rp:EBR-5'] = { v: P.V, key: 'EBR-5', logs: true, hasLog: true, exc: [{ sig: B.sig }], logSig: 'logs.txt:500', zip: true, wer: true };
    r = await X._read(it5);
    ok('a reading made before the reader read stacktraces is read again, its logs only, what the zip said kept', r.cached === false && reads.length === 1 &&
        reads[0].rec.logs === false && reads[0].rec.exc.length === 0 && reads[0].rec.zip === true && reads[0].rec.wer === true && reads[0].zip === false, JSON.stringify(reads[0] && reads[0].rec));
    reads = [];
    meta['rp:EBR-5'].lv = P.LOG_V - 1;
    r = await X._read(it5);
    ok('...as is one made by an older reader that said so', r.cached === false && reads.length === 1 && reads[0].rec.logs === false);
    reads = [];
    meta['rp:EBR-5'] = { v: P.V, key: 'EBR-5', logs: true, hasLog: true, exc: [{ sig: B.sig }], logSig: '', zip: true, hasZip: true };
    r = await X._read({ key: 'EBR-5', desc: [], fields: { attachment: [att('igbr.zip', 900)] } });
    ok('...but one whose log came out of its zip (the report has no log of its own) is used as it is: the zip is not read here, and reading the logs alone would lose it',
        r.cached === true && reads.length === 0 && r.rec.exc[0].sig === B.sig);
    meta['rp:EBR-5'] = { v: P.V, key: 'EBR-5', logs: false, zip: true };
    r = await X._read(it5);
    ok('a reading whose logs failed to download is read again', reads.length === 1 && reads[0].rec.logs === false && reads[0].rec.zip === true);
    reads = [];
    meta['rp:EBR-5'] = { v: P.V - 1, logs: true, exc: [], logSig: 'logs.txt:500' };
    r = await X._read(it5);
    ok('a reading of another shape is read again from scratch', reads.length === 1 && reads[0].rec === null && reads[0].zip === false);
    reads = [];
    delete meta['rp:EBR-5'];
    r = await X._read(it5);
    ok('a report never read is read, its logs only', reads.length === 1 && reads[0].rec === null && reads[0].zip === false && r.cached === false);

    // ================= the search =================
    const page = (keys, extra) => ({ data: Object.assign({ issues: keys.map((k) => ({ key: k.split(':')[0], fields: {
        summary: 'S ' + k, created: '2026-10-' + String(10 + (+k.split('-')[1] % 20)) + 'T00:00:00.000+0000', status: { name: k.indexOf(':att') > 0 ? 'Attached' : 'Open' },
        attachment: [att('logs.txt')], labels: [],
        description: k.indexOf(':desc') > 0 ? descBlock('ValueError: bad', FB) : 'plain'
    } })) }, extra || {}) });
    let pages = {}, bodies = [], inFlight = 0, maxIn = 0, readsStarted = [], held = null;
    JiTA.sync._apiPost = (path, body) => { bodies.push(body); const p = pages[body.nextPageToken || '']; return p instanceof Error ? Promise.reject(p) : Promise.resolve(p); };
    P._readFiles = (it) => {
        readsStarted.push(it.key);
        inFlight++; maxIn = Math.max(maxIn, inFlight);
        const go = () => { inFlight--; return { v: P.V, key: it.key, logs: it.key !== 'EBR-9', hasLog: true, exc: it.key === 'EBR-4' ? [{ sig: A2.sig, msg: 'KeyError: 2' }] : [], logSig: 'logs.txt:100' }; };
        if (held) { return held.promise.then(go); }
        return new Promise((res) => setImmediate(() => res(go())));
    };
    const overlay = () => { const n = new Node('div'); ROOT.appendChild(n); return n; };
    const fresh = () => { const st = X._state('EDR-77', overlay()); X._st = st; return st; };
    meta = { 'rp:EBR-3': { v: P.V, key: 'EBR-3', logs: true, hasLog: true, exc: [{ sig: A.sig, msg: 'KeyError: 2' }], logSig: 'logs.txt:100', lv: P.LOG_V } };
    pages = { '': page(['EBR-1', 'EBR-2:att', 'EBR-3', 'EBR-4'], { nextPageToken: 't2' }), t2: page(['EBR-4', 'EBR-5:desc', 'EBR-9'], { isLast: true }) };
    let st = fresh();
    st.targets = [Object.assign({}, tA, { def: true })]; st.on[A.sig] = true;
    await X._sweep(st);
    ok('every open report is listed, newest first, a page at a time', bodies.length === 2 && bodies[0].jql === X.SCOPE + ' ORDER BY created DESC' && !bodies[0].nextPageToken &&
        bodies[1].nextPageToken === 't2' && bodies[0].fields.indexOf('attachment') >= 0 && bodies[0].fields.indexOf('description') >= 0, JSON.stringify(bodies.map((b) => b.nextPageToken)));
    ok('...the open ones', X.SCOPE.indexOf(JiTA.EBR_SCOPE + ' AND ') === 0, X.SCOPE);
    ok('...less those filed in the launcher, by the label the backlog filter leaves out; one with no labels stays (a bare "not in" drops it)',
        / AND \(labels is EMPTY OR labels not in \("Launcher"\)\)/.test(X.SCOPE));
    ok('...and by the component; one with no component stays', / AND \(component is EMPTY OR component not in \("Launcher"\)\)/.test(X.SCOPE));
    ok('...a report already attached left out, a report listed twice read once', st.n === 5 && readsStarted.join() === 'EBR-1,EBR-4,EBR-5,EBR-9', st.n + ' ' + readsStarted.join());
    ok('...and the Team field no longer asked for', bodies[0].fields.indexOf('customfield_10001') < 0);
    ok('...a cached report is not read again', readsStarted.indexOf('EBR-3') < 0 && st.cached === 1);
    ok('...the search ends done, with what it read', st.done === true && st.read === 5 && st.listed === true, JSON.stringify({ done: st.done, read: st.read }));
    ok('...a report whose logs did not download is counted, to be read again next time', st.failed === 1);
    ok('...the exceptions in a report\'s description come with it', st.reports.find((x) => x.key === 'EBR-5').desc[0].sig === B.sig);
    ok('...and what holds a ticked exception is found: same stack and same crash site', X.hits(st.reports).map((x) => x.key + (x.m[0].exact ? '=' : '~')).join() === 'EBR-3=,EBR-4~',
        X.hits(st.reports).map((x) => x.key).join());

    // concurrency, and closing the window
    bodies = []; readsStarted = []; inFlight = 0; maxIn = 0; meta = {};
    const keys = []; for (let i = 1; i <= 12; i++) { keys.push('EBR-' + (100 + i)); }
    pages = { '': page(keys, { isLast: true }) };
    held = deferred();
    st = fresh(); st.targets = [tA]; st.on[A.sig] = true;
    let sweep = X._sweep(st);
    await settle();
    ok('at most ' + X.CONCURRENCY + ' reports are read at once', readsStarted.length === X.CONCURRENCY && maxIn === X.CONCURRENCY, readsStarted.length + ' / ' + maxIn);
    ROOT.removeChild(st.node);
    held.resolve(); held = null;
    await sweep;
    ok('closing the window starts no new read; the ones under way finish', readsStarted.length === X.CONCURRENCY && st.done === false, readsStarted.length + ' ' + st.done);
    readsStarted = []; meta = {};
    held = deferred();
    st = fresh(); st.targets = [tA]; st.on[A.sig] = true;
    sweep = X._sweep(st);
    await settle();
    fresh();   // the window opened again
    held.resolve(); held = null;
    await sweep;
    ok('...nor does opening it again: the old search stops', readsStarted.length === X.CONCURRENCY && st.done === false, readsStarted.length);

    // a listing that fails, a token that does not move on
    pages = { '': new Error('HTTP 500') };
    st = fresh(); st.targets = [tA]; st.on[A.sig] = true; st.started = true;
    await X._sweep(st);
    ok('a listing that fails is said, and the search ends', /Could not list the open bug reports: HTTP 500/.test(st.error) && st.listed && st.done && st.read === 0);
    ok('...without claiming it read them all', /^Could not list[^·]*· 0 read/.test(X.line(st)), X.line(st));
    bodies = [];
    pages = { '': page(['EBR-1'], { nextPageToken: 'x' }), x: page(['EBR-2'], { nextPageToken: 'x' }) };
    st = fresh(); st.targets = [tA]; st.on[A.sig] = true;
    await X._sweep(st);
    ok('a page token that does not move on ends the listing', bodies.length === 2 && st.done);

    // ================= ticking, and starting =================
    let sweeps = 0;
    const realSweep = X._sweep;
    X._sweep = () => { sweeps++; return Promise.resolve(); };
    st = fresh();
    X._retarget(st);
    ok('nothing to look for yet: no search', sweeps === 0 && st.started === false);
    st.desc = [{ sig: A.sig, msg: 'KeyError: 2' }];
    X._retarget(st);
    ok('the description\'s exception is offered unticked, and nothing is searched yet', sweeps === 0 && !st.started && st.targets.length === 1 && !st.on[A.sig]);
    st.profile = { withLog: 10, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 9 }] }] };
    X._retarget(st);
    ok('...nor a shared one, however many logs share it', sweeps === 0 && st.targets.length === 2 && !st.on[B.sig]);
    st.one = { key: 'EBR-50', log: true, exc: [{ sig: A2.sig, msg: 'KeyError: 2' }] };
    X._retarget(st);
    ok('...nor one from a single report\'s log', sweeps === 0 && st.targets.length === 3 && !st.on[A2.sig]);
    st.one = null;
    st.on[B.sig] = true;
    X._retarget(st);
    ok('the first exception ticked starts the search', sweeps === 1 && st.started);
    st.on[A.sig] = true;
    st.profile = { withLog: 12, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 10 }] }] };
    X._retarget(st);
    ok('...once only, and what was ticked stays ticked as the profile counts more', sweeps === 1 && st.on[A.sig] === true && st.on[B.sig] === true);
    st.reports = [X._entry(item('EBR-6'), { exc: [{ sig: B.sig }] }, st.pool)];
    st.on[B.sig] = true; st.tsig = null;
    X._retarget(st);
    ok('ticking matches what was read again', st.reports[0].m.length === 1 && st.reports[0].m[0].t.sig === B.sig);
    st.on[B.sig] = false; st.tsig = null;
    X._retarget(st);
    ok('...and so does unticking', st.reports[0].m.length === 0);
    st = fresh(); st.desc = [{ sig: A.sig, msg: 'KeyError: 2' }]; st.on[A.sig] = true;
    ROOT.removeChild(st.node);
    X._retarget(st);
    ok('a closed window starts no search', sweeps === 1 && st.started === false);
    X._sweep = realSweep;

    // ================= the window =================
    let built = [], loads = 0, tips = 0, tipBox = null;
    JiTA.ui.injectCss = () => {};
    JiTA.ui.toast = (t) => { toasts.push(t); };
    JiTA.ui._showTip = (r, a, meta, box) => { tips++; tipBox = box; };
    JiTA.ui._hideTip = () => {};
    JiTA.ui._collapseRow = (el, done) => { if (el && el.parentNode) { el.parentNode.removeChild(el); } if (done) { done(); } };
    JiTA.ui._attachReportButton = (key, opts) => { built.push({ key, opts }); return $('<span class="jita-sd-link">Attach</span>'); };
    JiTA.menu._openOverlay = () => {
        const ov = new Node('div'), menu = new Node('div');
        ov.appendChild(menu); ROOT.appendChild(ov);
        return { $overlay: wrap([ov]), $menu: wrap([menu]) };
    };
    const realLoad = X._load;
    X._load = () => { loads++; };
    crumb = 'EBR-5';
    toasts = [];
    ok('off a defect the window does not open, and says why', X.openView() === null && toasts.length === 1 && /Open a defect first/.test(toasts[0]) && loads === 0);
    crumb = 'EDR-77';
    st = X.openView();
    ok('on a defect it opens and starts looking', st && st.key === 'EDR-77' && X._st === st && loads === 1 && X._alive(st));
    ok('...titled with the defect, marked as this window', byId['jx-targets'] && byId['jx-results'] && byId['jx-status'] && st.node.kids[0].hasCls('jita-excfind-view'));
    ok('...saying what it is looking for meanwhile', /Looking for the exceptions of EDR-77/.test(byId['jx-targets'].textContent), byId['jx-targets'].textContent);
    X._load = realLoad;

    st.desc = [{ sig: A.sig, msg: 'KeyError: 2' }]; st.profileDone = true;
    st.profile = { withLog: 4, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 1 }] }] };
    st.started = true;   // the reading itself is tested above
    X._retarget(st);
    const tbox = byId['jx-targets'];
    const unticked = find(tbox, (n) => n.tag === 'input');
    ok('each exception has a box, none ticked, with where it comes from', unticked.length === 2 && unticked.every((n) => n.checked === false) &&
        /KeyError: 2in the description/.test(tbox.textContent) && /ValueError: badin 1 of 4 attached logs/.test(tbox.textContent), tbox.textContent);
    ok('...and the list asks for one to be ticked', /Tick an exception above/.test(byId['jx-results'].textContent), byId['jx-results'].textContent);
    st.on[A.sig] = true;
    X._retarget(st);
    const boxes = find(tbox, (n) => n.tag === 'input');
    ok('a ticked one is drawn ticked', boxes.length === 2 && boxes[0].checked === true && boxes[1].checked === false);
    ok('...its message and stack on hover, one frame a line', find(tbox, (n) => n.hasCls('jx-target'))[0].getAttribute('title') ===
        'KeyError: 2\n\nStack, innermost last:\n    foo.py: onclick\n    bar.py: load', find(tbox, (n) => n.hasCls('jx-target'))[0].getAttribute('title'));

    const add = (key, exc, created, desc) => {
        const it = item(key, null, desc || [], created);
        X._add(st, it, { rec: { logs: true, exc: exc }, cached: false });
    };
    add('EBR-1', [{ sig: A2.sig }], '2026-10-05T00:00:00.000+0000');
    add('EBR-2', [{ sig: B.sig }], '2026-10-06T00:00:00.000+0000');
    add('EBR-3', [{ sig: A.sig }], '2026-10-01T00:00:00.000+0000');
    const res = byId['jx-results'];
    const order = () => res.kids.map((n) => n.getAttribute('data-key')).join();
    ok('the reports holding a ticked exception are listed as they are read, exact first', order() === 'EBR-3,EBR-1', order());
    const row1 = res.kids.find((n) => n.getAttribute('data-key') === 'EBR-1');
    ok('...each says how it matched', /same stack/.test(res.kids[0].textContent) && /~ same crash site/.test(row1.textContent) && /KeyError: 2/.test(row1.textContent), row1.textContent);
    add('EBR-0', [], '2026-09-01T00:00:00.000+0000', [{ sig: A.sig, msg: 'KeyError: 2' }]);
    const row0 = res.kids.find((n) => n.getAttribute('data-key') === 'EBR-0');
    ok('...or that it is in the report\'s description', !!row0 && /KeyError: 2 \(in its description\)/.test(row0.textContent), row0 && row0.textContent);
    X._gone(st, 'EBR-0');
    ok('...with an Attach control for this defect, offered whoever has the report', built.length === 3 && built.every((b) => b.opts.defect === 'EDR-77' && b.opts.anyAssignee === true) &&
        byCls(row1, 'jita-sd-link').length === 1);
    const bo1 = built.find((b) => b.key === 'EBR-1').opts, who1 = byCls(row1, 'jx-who')[0];
    bo1.who({ accountId: 'bob', name: 'Bob' }, 'me');
    ok('...beside it, who has the report: someone else, marked', who1.textContent === 'assigned to Bob' && !who1.hasCls('mine') && /keeps Bob as its assignee/.test(who1.getAttribute('title')),
        who1.textContent + ' / ' + who1.getAttribute('title'));
    bo1.who({ accountId: 'me', name: 'Me' }, 'me');
    ok('...the user, muted', who1.textContent === 'assigned to you' && who1.hasCls('mine') && who1.getAttribute('title') === '');
    bo1.who(null, 'me');
    ok('...nobody, nothing', who1.textContent === '' && !who1.hasCls('mine'));
    click(row1, 'mouseenter');
    ok('...and the hover card, beside the window', tips === 1 && !!tipBox && tipBox === st.node.kids[0] && st.box === tipBox);
    ok('...whose overlay keeps the room for it', st.node.hasCls('jx-overlay'));
    click(boxes[1], 'change');   // checked is still false: unticked by hand, a no-op
    boxes[1].checked = true;
    click(byCls(byId['jx-targets'], 'jx-target')[1].kids[0].kids[0], 'change');
    ok('ticking a box adds what holds it, newest first among the exact', order() === 'EBR-2,EBR-3,EBR-1' && st.on[B.sig] === true, order());
    ok('...the rows already there are the same rows, their Attach as it was', res.kids.indexOf(row1) >= 0 && built.length === 4, built.length);
    const tb0 = find(byId['jx-targets'], (n) => n.tag === 'input')[0];
    tb0.checked = false;
    click(tb0, 'change');
    ok('unticking takes away what only it held', order() === 'EBR-2', order());
    const tb1 = find(byId['jx-targets'], (n) => n.tag === 'input')[0];
    tb1.checked = true; click(tb1, 'change');
    ok('...and ticking it again brings the same rows back', order() === 'EBR-2,EBR-3,EBR-1' && built.length === 4 && res.kids.indexOf(row1) >= 0, order() + ' ' + built.length);

    const wr = new Node('div'), ww = new Node('div');
    ww.className = 'jx-why'; wr.appendChild(ww);
    X._why(wr, [{ t: { sig: A.sig, msg: 'KeyError: 2', via: 'other.py:start > …' }, exact: true, where: 'log' }]);
    ok('a match names the stack it is, when its message is not enough', /same stackKeyError: 2 via other\.py:start/.test(wr.textContent), wr.textContent);
    X._why(wr, [{ t: { sig: A.sig, msg: 'KeyError: 2' }, exact: true, where: 'log' }]);
    ok('...and its stack on hover', byCls(wr, 'jx-msg')[0].getAttribute('title') === P._sigTip(A.sig, 'KeyError: 2'));
    const phs = (n) => byCls(n, 'jx-ph').map((x) => x.textContent + '=' + x.getAttribute('title')).join();
    ok('an exception is shown as it is looked for: as written, numbers and all', X._shown(tU) === UE, X._shown(tU));
    ok('...an edited one by its edit', X._shown(Object.assign({}, tU, { pat: 'IndustryError: * (#)' })) === 'IndustryError: * (#)');
    ok('...one without a message says so', X._shown({ sig: '|a.py:f>b.py:g', msg: '' }) === '(no message)');
    let mk = X._marked($('<span></span>'), 'a # b * c', false);
    ok('in an exception as it is, neither # nor * is marked', mk[0].textContent === 'a # b * c' && phs(mk[0]) === '', phs(mk[0]));
    mk = X._marked($('<span></span>'), '#* x', true);
    ok('...and in an edit, a * marked as any text', mk[0].textContent === '#* x' && phs(mk[0]) === '#=any number,*=any text', phs(mk[0]));
    X._why(wr, [{ t: tU, exact: true, where: 'log' }]);
    ok('a match line shows the exception as it was looked for, as written', /\(12, 1677\)/.test(wr.textContent) && phs(wr) === '', wr.textContent);
    X._why(wr, [{ t: Object.assign({}, tU, { pat: 'IndustryError: *' }), exact: false, where: 'description' }]);
    ok('...an edited one by its edit, and where it was found', /~ same crash siteIndustryError: \* \(in its description\)$/.test(wr.textContent) && phs(wr) === '*=any text', wr.textContent);
    st.targets = [{ sig: A.sig, msg: 'KeyError: 2', via: 'foo.py:onclick > …', desc: true }];
    X._paintTargets(st);
    ok('...and so does its box', / via foo\.py:onclick/.test(byId['jx-targets'].textContent), byId['jx-targets'].textContent);
    st.targets = [{ sig: fp('TypeError: bad operand for *: int', FU).sig, msg: 'TypeError: bad operand for *: int' }, Object.assign({}, tU, { pat: 'IndustryError: *' })];
    X._paintTargets(st);
    const trows = byCls(byId['jx-targets'], 'jx-target');
    ok('a * in an exception as it is shown plain, one in an edit marked', phs(trows[0]) === '' && phs(trows[1]) === '*=any text', phs(trows[0]) + ' / ' + phs(trows[1]));
    // A stacktrace says it is one, in its box and in what a report holds (stacktrace-check.js covers its matching).
    const stFp = JiTA.logsig._fingerprint(['STACKTRACE #1 logged at 04/12/2026 11:23:16 : Possible service deadlock detected!', 'Traced at:'].concat(frames(FA)).join('\n'));
    const stCut = JiTA.logsig._fingerprint('STACKTRACE #2 logged at 04/12/2026 11:23:17 : Cut short!\n---- dump ----');
    st.targets = [{ sig: stFp.sig, msg: stFp.msg }, { sig: stCut.sig, msg: stCut.msg }, { sig: A.sig, msg: 'KeyError: 2' }];
    X._paintTargets(st);
    const kinds = byCls(byId['jx-targets'], 'jx-target').map((n) => byCls(n, 'jx-kind').map((k) => k.textContent).join());
    ok('a stacktrace says so in its box, and one cut off before its stack that too; an exception says nothing', JSON.stringify(kinds) === JSON.stringify(['stacktrace', 'stacktrace, stack cut off', '']),
        JSON.stringify(kinds));
    X._why(wr, [{ t: { sig: stFp.sig, msg: stFp.msg }, exact: false, where: 'log' }, { t: { sig: stCut.sig, msg: stCut.msg }, exact: false, bare: true, where: 'log' }]);
    ok('...and a report holding one says how: at its trace site, or by its message with its stack cut off', /~ same trace sitePossible service deadlock detected!/.test(wr.textContent) &&
        /~ same message, stack cut offCut short!/.test(wr.textContent), wr.textContent);
    X._why(wr, [{ t: { sig: stFp.sig, msg: stFp.msg }, exact: true, where: 'log' }]);
    ok('...or the same stack, as an exception\'s does', /^same stackPossible service deadlock detected!$/.test(wr.textContent), wr.textContent);
    X._retarget(Object.assign(st, { tsig: null }));
    // the Attach control's options
    const opts = built.find((b) => b.key === 'EBR-1').opts;
    ok('Attach knows the window is on screen', opts.still() === true);
    opts.done('EBR-1');
    ok('a report attached from the window leaves it', order() === 'EBR-2,EBR-3' && st.reports.find((x) => x.key === 'EBR-1').gone === true, order());
    ok('...and the line counts it out', /2 hold a ticked exception/.test(byId['jx-status'].textContent), byId['jx-status'].textContent);

    // linked reports
    ajax = { 'EDR-77?fields=issuelinks': { ok: true, data: { fields: { issuelinks: [{ outwardIssue: { key: 'EBR-2' } }] } } } };
    const before = built.length;
    X._links(st);
    await flush();
    const row2 = res.kids.find((n) => n.getAttribute('data-key') === 'EBR-2');
    ok('a report linked to the defect already is shown as linked, with no Attach', row2 && /linked/.test(byCls(row2, 'jx-act')[0].textContent) && byCls(row2, 'jita-sd-link').length === 0 &&
        built.length === before, row2 && row2.textContent);

    // what the list and the line say
    tb0.checked = false;
    find(byId['jx-targets'], (n) => n.tag === 'input').forEach((n) => { n.checked = false; click(n, 'change'); });
    ok('nothing ticked: the list says so', /Tick an exception above/.test(res.textContent) && res.kids.length === 1, res.textContent);
    find(byId['jx-targets'], (n) => n.tag === 'input').forEach((n) => { n.checked = true; click(n, 'change'); });
    st.reports.forEach((x) => { x.gone = true; });
    X._paintResults(st);
    ok('nothing found while reading: "so far"', /None found so far/.test(res.textContent), res.textContent);
    st.done = true;
    X._paintResults(st);
    ok('...and when done, that none holds them', /No open bug report holds these exceptions/.test(res.textContent), res.textContent);
    st.read = 3; st.n = 3; st.cached = 1; st.failed = 0; st.done = false; st.listed = false; st.error = null;
    ok('the line while reading', X.line(st) === 'Reading the open bug reports: 3 of 3 listed so far · 1 from earlier searches · 0 hold a ticked exception', X.line(st));
    st.done = true; st.failed = 2;
    ok('...and when done', X.line(st) === 'All 3 open bug reports read · 1 from earlier searches · 2 could not be read, tried again next time · 0 hold a ticked exception', X.line(st));
    st.started = false;
    ok('...nothing before the search starts', X.line(st) === '');

    st.targets = []; st.desc = []; st.profileDone = true; st.tsig = 'x';
    X._paintTargets(st);
    const tt = () => byId['jx-targets'].textContent;
    ok('nothing to look for, once all is read: said plainly', /Nothing to look for: .*shared by two or more/.test(tt()), tt());
    st.one = { key: 'EBR-50', log: true, exc: [] };
    X._paintTargets(st);
    ok('...with one report attached, that its log holds none either', /neither does the log of EBR-50, the one report attached/.test(tt()), tt());
    st.one.log = false;
    X._paintTargets(st);
    ok('...or that it has no log', /EBR-50, the one report attached, has no log/.test(tt()), tt());
    st.one.log = null;
    X._paintTargets(st);
    ok('...or that its log could not be read', /the log of EBR-50, the one report attached, could not be read/.test(tt()), tt());
    st.targets = [tB]; st.profileDone = false;
    X._paintTargets(st);
    ok('while the one report\'s log is read, that is said', /Still reading the log of EBR-50/.test(tt()), tt());
    st.one = null;
    X._paintTargets(st);
    ok('...with several, that the shared ones are still counted', /Still counting the exceptions the attached reports share/.test(tt()), tt());
    st.profileDone = true; st.desc = null;
    X._paintTargets(st);
    ok('...and with only the description to come, that', /Still reading the description of EDR-77/.test(tt()), tt());
    st.desc = []; st.targets = [];

    // the window closed: nothing more is drawn
    ROOT.removeChild(st.node);
    ok('a closed window is no longer this search', X._alive(st) === false && opts.still() === false);
    X._paintResults(st);
    ok('...and is not drawn into', !document.getElementById('jx-results'));

    // ================= editing in the window =================
    const keyOn = (n, k) => (n.handlers.keydown || []).forEach((f) => f.call(n, { key: k, preventDefault() {}, stopPropagation() {} }));
    X._edits = {};
    X._load = () => {};
    st = X.openView();
    st.started = true; st.profileDone = true; st.desc = [{ sig: U.sig, msg: U.msg }, { sig: A.sig, msg: 'KeyError: 2' }];
    X._retarget(st);
    const tgt = () => byId['jx-targets'], rowsT = () => byCls(tgt(), 'jx-target'), editsOf = (r) => byCls(r, 'jx-tedit');
    const box = () => find(tgt(), (n) => n.hasCls('jx-pat'))[0];
    ok('each exception offers an edit, and to ignore it', rowsT().length === 2 && rowsT().every((r) => editsOf(r).map((n) => n.textContent).join() === 'edit,ignore'));
    ok('...and its row shows what it is looked for by, as the box will start: the message as written, nothing marked',
        byCls(rowsT()[0], 'jx-tmsg')[0].textContent === UE && UE === X._editText(st.targets[0]) && byCls(tgt(), 'jx-ph').length === 0, byCls(rowsT()[0], 'jx-tmsg')[0].textContent);
    click(editsOf(rowsT()[0])[0]);
    let inp = box();
    ok('edit opens a box with the text to start from, and the hint', !!inp && inp.value === X._editText(st.targets[0]) && st.editor === inp && st.editing === U.sig &&
        /Put # where any number will do/.test(tgt().textContent), inp && inp.value);
    ok('...the row marked as being edited, so the box takes the room the message had', rowsT()[0].hasCls('editing') && !rowsT()[1].hasCls('editing'));
    ok('...in place of the message, the box to tick still there, no edit link on it', byCls(rowsT()[0], 'jx-tmsg').length === 0 && editsOf(rowsT()[0]).length === 0 &&
        find(rowsT()[0], (n) => n.getAttribute('type') === 'checkbox').length === 1);
    st.profile = { withLog: 4, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 2 }] }] };
    X._retarget(st);
    ok('the list is not redrawn under the typing', box() === inp && inp.isConnected && st.targets.length === 3);
    inp.value = inp.value.replace('25', '#');
    keyOn(inp, 'Enter');
    const want = X._editText(st.targets[0]).replace('25', '#');
    ok('Enter keeps the edit, and the list is drawn again', st.edit[U.sig] === want && !st.editing && !inp.isConnected && rowsT().length === 3, JSON.stringify(st.edit));
    const msg0 = byCls(rowsT()[0], 'jx-tmsg')[0];
    ok('...the edited message shown and marked, with a reset', msg0.hasCls('edited') && msg0.textContent === want && editsOf(rowsT()[0]).map((n) => n.textContent).join() === 'edit,reset,ignore');
    ok('...its # marked', byCls(msg0, 'jx-ph').length === 1);
    ok('...and the target looked for by it', st.targets[0].pat === want && !!st.targets[0].re);
    X._add(st, item('EBR-41', null, [], '2026-10-07T00:00:00.000+0000'), { rec: { logs: true, exc: [{ sig: fp(UE.replace('25', '30'), FU).sig }] }, cached: false });
    const hasRow = (k) => byId['jx-results'].kids.find((n) => n.getAttribute('data-key') === k);
    ok('unticked, the edit finds nothing yet (control)', !hasRow('EBR-41'));
    const cb0 = find(rowsT()[0], (n) => n.getAttribute('type') === 'checkbox')[0];
    cb0.checked = true; click(cb0, 'change');
    ok('ticked, it finds the same error with another value', !!hasRow('EBR-41'));
    ok('...and the match says what it was looked for by', hasRow('EBR-41').textContent.indexOf(want) >= 0, hasRow('EBR-41').textContent);
    click(editsOf(rowsT()[0])[0]);
    ok('editing it again starts from the edit', box().value === want);
    keyOn(box(), 'Escape');
    click(editsOf(rowsT()[1])[0]);
    inp = box(); inp.value = 'KeyError: #';
    keyOn(inp, 'Escape');
    ok('Esc closes the box and keeps nothing', !st.editing && st.edit[A.sig] === undefined && !box() && editsOf(rowsT()[1]).map((n) => n.textContent).join() === 'edit,ignore');
    click(editsOf(rowsT()[1])[0]);
    keyOn(box(), 'Enter');
    ok('Enter on the text as it started keeps no edit', !st.editing && st.edit[A.sig] === undefined && editsOf(rowsT()[1]).map((n) => n.textContent).join() === 'edit,ignore');
    click(editsOf(rowsT()[1])[0]);
    inp = box(); inp.value = 'KeyError: *';
    (inp.handlers.blur || []).forEach((f) => f.call(inp));
    ok('leaving the box closes it a moment later, not at once', st.editing === A.sig && box() === inp);
    await settle();
    ok('...keeping what was typed', !st.editing && st.edit[A.sig] === 'KeyError: *', JSON.stringify(st.edit));
    click(editsOf(rowsT()[2])[0]);
    box().value = 'ValueError: *';
    click(editsOf(rowsT()[1])[0]);
    ok('opening another edit keeps what was typed in the one open', st.edit[B.sig] === 'ValueError: *' && st.editing === A.sig && box().value === 'KeyError: *');
    X._endEdit(st, B.sig, 'ValueError: bad');
    ok('...and the late close of that one changes nothing', st.edit[B.sig] === 'ValueError: *' && st.editing === A.sig);
    keyOn(box(), 'Escape');
    X._keepEdit(st, B.sig, '   ');
    ok('an empty text is no edit', st.edit[B.sig] === undefined);
    click(editsOf(rowsT()[0])[1]);
    ok('reset looks for the exception as it is again', st.edit[U.sig] === undefined && !byCls(rowsT()[0], 'jx-tmsg')[0].hasCls('edited') && st.targets[0].pat === null);
    const kept = st.edit;
    ROOT.removeChild(st.node);
    st = X.openView();
    ok('edits are remembered for the defect when the window opens again', st.edit === kept && st.edit[A.sig] === 'KeyError: *');
    ok('...and another defect has its own', X._state('EDR-78', overlay()).edit !== kept);

    // ================= exceptions of one's own =================
    ROOT.removeChild(st.node);
    X._edits = {}; X._added = {};
    st = X.openView();
    st.started = true; st.profileDone = true; st.desc = [{ sig: U.sig, msg: U.msg }];
    X._retarget(st);
    const scroll = byId['jx-targets'].parentNode, ain = find(scroll, (n) => n.hasCls('jx-addin'))[0], addMsg = () => st.addMsg.textContent;
    const removeOf = (sig) => editsOf(rowsT()[st.targets.findIndex((t) => t.sig === sig)]).filter((n) => n.textContent === 'remove')[0];
    ok('below the list, a box to add an exception of one\'s own, outside the list that is redrawn', !!ain && ain.parentNode.hasCls('jx-add') && !byCls(tgt(), 'jx-addin').length);
    keyOn(ain, 'Enter');
    ok('an empty box adds nothing, and says what to put in it', st.targets.length === 1 && /Type an exception/.test(addMsg()), addMsg());
    ain.value = '  *  ';
    keyOn(ain, 'Enter');
    ok('...nor a * on its own', st.targets.length === 1 && /on its own, \* finds every exception/.test(addMsg()) && ain.value === '  *  ', addMsg());
    ain.value = 'IndustryError:   Industry error, msg=IndustryValidationError*';
    keyOn(ain, 'Enter');
    const own = st.targets[1];
    ok('a typed message is added, last and ticked, the box emptied', st.targets.length === 2 && own.typed && own.pat === 'IndustryError: Industry error, msg=IndustryValidationError*' &&
        st.on[own.sig] === true && ain.value === '' && addMsg() === '', JSON.stringify(own));
    ok('...looked for at any stack', own.fr === null && own.re.test(um(UE, FA)));
    const ownRow = rowsT()[1];
    ok('...its row says so, with only a remove, its * marked as any text', /added by you, at any stack/.test(ownRow.textContent) && editsOf(ownRow).map((n) => n.textContent).join() === 'remove' &&
        phs(ownRow) === '*=any text' && ownRow.getAttribute('title') === 'Looked for by this message alone, at any stack', ownRow.textContent);
    ain.value = 'IndustryError: Industry error, msg=IndustryValidationError*';
    keyOn(ain, 'Enter');
    ok('the same message twice is added once', st.added.typed.length === 1 && st.targets.length === 2);
    X._add(st, item('EBR-60', null, [], '2026-10-08T00:00:00.000+0000'), { rec: { logs: true, exc: [{ sig: fp(UE.replace('25', '40'), FA).sig }] }, cached: false });
    ok('a report with that message at another stack is found, as the same message',
        !!hasRow('EBR-60') && /same messageIndustryError: Industry error, msg=IndustryValidationError\*/.test(hasRow('EBR-60').textContent), hasRow('EBR-60') && hasRow('EBR-60').textContent);
    ain.value = descBlock('ValueError: bad', FB);
    keyOn(ain, 'Enter');
    let pasted = st.targets.filter((t) => t.sig === B.sig)[0];
    ok('a whole exception pasted from a log is added at its stack, ticked', !!pasted && pasted.own && !pasted.typed && st.on[B.sig] === true && st.added.pasted.length === 1 && ain.value === '',
        JSON.stringify(st.added));
    ok('...editable like the others, and removable', editsOf(rowsT()[st.targets.indexOf(pasted)]).map((n) => n.textContent).join() === 'edit,ignore,remove' &&
        /added by you/.test(rowsT()[st.targets.indexOf(pasted)].textContent));
    ain.value = 'Formatted exception info: ValueError: worse Caught at: ' + frames(FB).join(' ');
    keyOn(ain, 'Enter');
    ok('...also without its EXCEPTION # line, from its message and stack', st.added.pasted.length === 2 && st.targets.some((t) => t.sig === fp('ValueError: worse', FB).sig));
    ain.value = descBlock('IndexError: one', FB) + ' ' + descBlock('IndexError: two', FA);
    keyOn(ain, 'Enter');
    ok('...and two pasted at once are both added', st.added.pasted.length === 4 &&
        [fp('IndexError: one', FB).sig, fp('IndexError: two', FA).sig].every((sg) => st.targets.some((t) => t.sig === sg) && st.on[sg] === true), JSON.stringify(st.added.pasted.map((e) => e.msg)));
    st.added.pasted.splice(2, 2);
    X._retarget(st);
    ain.value = descBlock(UE, FU);
    keyOn(ain, 'Enter');
    ok('pasting one already in the list only ticks it', st.added.pasted.length === 2 && st.on[U.sig] === true && st.targets.length === 4 &&
        editsOf(rowsT()[0]).map((n) => n.textContent).join() === 'edit,ignore');
    ain.value = frames(FA).join(' ');
    keyOn(ain, 'Enter');
    ok('a stack without its message is not added, and that is said', st.targets.length === 4 && /Paste the whole exception/.test(addMsg()) && ain.value !== '', addMsg());
    ain.value = 'KeyError: #';
    (ain.handlers.keydown || []).forEach((f) => f.call(ain, { key: 'Enter', shiftKey: true, preventDefault() {}, stopPropagation() {} }));
    ok('Shift+Enter is a new line, not an add', st.added.typed.length === 1 && ain.value === 'KeyError: #');
    keyOn(ain, 'Escape');
    ok('Esc empties the box, and the message with it', ain.value === '' && addMsg() === '');
    ain.value = 'KeyError: #';
    click(find(scroll, (n) => n.hasCls('jx-addbtn'))[0]);
    ok('the Add button adds as Enter does', st.added.typed.length === 2 && st.targets.length === 5);
    const typedSig = st.added.typed[0].id;
    click(removeOf(typedSig));
    ok('remove takes a typed one out of the list, unticked', st.added.typed.length === 1 && !st.targets.some((t) => t.sig === typedSig) && st.on[typedSig] === undefined);
    ok('...and what only it held leaves the results', !hasRow('EBR-60'));
    click(removeOf(B.sig));
    ok('a pasted one is removed the same way', st.added.pasted.length === 1 && !st.targets.some((t) => t.sig === B.sig) && st.on[B.sig] === undefined);
    const keptA = st.added;
    ROOT.removeChild(st.node);
    st = X.openView();
    ok('what was added is remembered for the defect when the window opens again', st.added === keptA && st.added.typed.length === 1 && st.added.pasted.length === 1);
    ok('...and another defect has its own', X._state('EDR-78', overlay()).added !== keptA);
    ROOT.removeChild(st.node);
    X._edits = {}; X._added = {};

    // ================= exceptions that don't count (JiTA.excnoise) =================
    const N = JiTA.excnoise;
    st = X.openView();
    const UZ = fp("UserError: User error, msg=ThrottleGeneric, dict={'remainingTime': 6093158L}", FB);
    st.started = true; st.profileDone = true; st.desc = [{ sig: A.sig, msg: 'KeyError: 2' }];
    st.profile = { withLog: 4, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 2 }] }], leftExc: [{ msg: UZ.msg, why: 'user', paths: [{ sig: UZ.sig, count: 4 }] }] };
    X._retarget(st);
    const ahead = () => byCls(tgt(), 'jx-aparthead')[0], apartBox = () => byCls(tgt(), 'jx-apart')[0], apartRows = () => byCls(apartBox(), 'jx-target');
    const drawn = () => st.targets.filter((t) => !t.left).concat(st.targets.filter((t) => !!t.left));   // the order rows are drawn in
    const rowOfSig = (sig) => rowsT()[drawn().findIndex((t) => t.sig === sig)], linksOf = (r) => editsOf(r).map((n) => n.textContent).join();
    ok('a shared one that does not count is offered below the rest, folded under a line of its own', st.targets.map((t) => t.left || '-').join() === '-,-,user' && !!ahead() &&
        ahead().textContent === '▸ Not counted (1): UserErrors, ones you ignore, and ones common in the open reports\' logs' && !apartBox().hasCls('open') &&
        apartRows().length === 1 && rowsT().length === 3, ahead() && ahead().textContent);
    ok('...saying why, with no link to count it, as a UserError never does', byCls(apartRows()[0], 'jx-left')[0].textContent === 'UserError: a message the game shows the player' &&
        linksOf(apartRows()[0]) === 'edit', linksOf(apartRows()[0]));
    ok('...while the rest have nothing said of them', byCls(rowOfSig(A.sig), 'jx-left').length === 0 && linksOf(rowOfSig(B.sig)) === 'edit,ignore');
    click(ahead());
    ok('...a click unfolds it', apartBox().hasCls('open') && /^▾ Not counted \(1\)/.test(ahead().textContent) && st.apartOpen === true, ahead().textContent);
    X._paintTargets(st);
    ok('...and it stays unfolded when the list is drawn again', apartBox().hasCls('open'));
    const ucb = find(apartRows()[0], (n) => n.getAttribute('type') === 'checkbox')[0];
    ucb.checked = true; click(ucb, 'change');
    X._add(st, item('EBR-70', null, [], '2026-10-09T00:00:00.000+0000'), { rec: { logs: true, exc: [{ sig: UZ.sig }] }, cached: false });
    ok('ticked, a folded one is looked for all the same', st.on[UZ.sig] === true && !!hasRow('EBR-70'));
    click(editsOf(rowOfSig(B.sig)).filter((n) => n.textContent === 'ignore')[0]);
    ok('ignore sets one apart at once', N.isIgnored(B.sig) && st.targets.filter((t) => t.sig === B.sig)[0].left === 'ignored' && apartRows().length === 2 &&
        /Not counted \(2\)/.test(ahead().textContent), ahead().textContent);
    ok('...saying so, with a link to count it again', byCls(rowOfSig(B.sig), 'jx-left')[0].textContent === 'ignored by you' && linksOf(rowOfSig(B.sig)) === 'edit,count again', linksOf(rowOfSig(B.sig)));
    click(editsOf(rowOfSig(B.sig)).filter((n) => n.textContent === 'count again')[0]);
    ok('...which puts it back with the rest', !N.isIgnored(B.sig) && !st.targets.filter((t) => t.sig === B.sig)[0].left && apartRows().length === 1);
    // The count of the common ones, read once the window is open (as _load does): what it sets apart is drawn so at once.
    meta[N.FREQ_KEY] = { at: Date.now(), n: 100, c: { [A.sig]: 30 } };
    N._freq = null; N._freqRead = 0;
    await N.load();
    X._retarget(st);
    ok('a count read later sets a common one apart, the list drawn again', st.targets.filter((t) => t.sig === A.sig)[0].left === 'common' && apartRows().length === 2 &&
        byCls(rowOfSig(A.sig), 'jx-left')[0].textContent === 'in 30% of the open reports\' logs', apartRows().length);
    ok('...with a link to count it anyway', linksOf(rowOfSig(A.sig)) === 'edit,count anyway', linksOf(rowOfSig(A.sig)));
    click(editsOf(rowOfSig(A.sig)).filter((n) => n.textContent === 'count anyway')[0]);
    ok('...which puts it back with the rest', N.countedAnyway() === 1 && !st.targets.filter((t) => t.sig === A.sig)[0].left && apartRows().length === 1);
    N.uncountAll();
    N._freq = null;
    N._changed();
    // The add box: a pasted one that does not count shows where it went; a typed one is never set apart.
    st.apartOpen = false;
    X._paintTargets(st);
    const ain2 = find(byId['jx-targets'].parentNode, (n) => n.hasCls('jx-addin'))[0];
    ain2.value = descBlock('UserError: User error, msg=PerformSessionChangeInProgress', FA);
    keyOn(ain2, 'Enter');
    const pz = fp('UserError: User error, msg=PerformSessionChangeInProgress', FA);
    ok('a UserError pasted into the box is drawn apart and ticked, the fold opened to show it', st.on[pz.sig] === true && st.apartOpen === true && apartBox().hasCls('open') &&
        apartRows().some((r) => r === rowOfSig(pz.sig)), JSON.stringify(st.added.pasted.map((e) => e.msg)));
    ain2.value = 'UserError: User error, msg=ThrottleGeneric*';
    keyOn(ain2, 'Enter');
    const tz = st.targets.filter((t) => t.typed)[0];
    ok('a typed message is never set apart, whatever it says', !!tz && !tz.left && apartRows().indexOf(rowOfSig(tz.sig)) < 0 && linksOf(rowOfSig(tz.sig)) === 'remove');
    ROOT.removeChild(st.node);
    X._edits = {}; X._added = {};
    X._load = realLoad;

    // ================= loading the defect =================
    let builds = [], buildD = null;
    P.build = (key, onState, still) => { builds.push({ key, onState, still }); buildD = deferred(); return buildD.promise; };
    dbRec = { key: 'EDR-77', description: descBlock('KeyError: 2', FA) };
    ajax = {};
    st = X._state('EDR-77', overlay()); X._st = st;
    X._sweep = () => { sweeps++; return Promise.resolve(); };
    sweeps = 0;
    X._load(st);
    await flush();
    ok('the defect\'s description is read from the local copy, and nothing searched before a box is ticked', st.desc && st.desc.length === 1 && st.desc[0].sig === A.sig && sweeps === 0,
        JSON.stringify(st.desc) + ' ' + sweeps);
    ok('...the profile of its attached reports is asked for', builds.length === 1 && builds[0].key === 'EDR-77');
    ok('...and goes on while the window is open', builds[0].still() === true);
    builds[0].onState({ summary: { withLog: 4, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 3 }] }] }, done: false });
    ok('a profile state adds its shared exceptions, unticked', st.targets.length === 2 && !st.on[B.sig] && st.profileDone === false && st.one === null);
    builds[0].onState({ summary: { withLog: 1, excGroups: [] }, views: [{ key: 'EBR-50', logRead: true, exc: [{ sig: A2.sig, msg: 'KeyError: 2' }] }], done: false });
    ok('one report attached: the exceptions in its log are offered, unticked', st.one && st.one.key === 'EBR-50' && st.targets.length === 2 && st.targets[1].one === 'EBR-50' &&
        !st.on[A2.sig] && sweeps === 0, st.targets.map((t) => t.msg + ' ' + t.one).join(' | '));
    builds[0].onState({ summary: { withLog: 2, excGroups: [] }, views: [{ key: 'EBR-50', logRead: true, exc: [{ sig: A2.sig }] }, { key: 'EBR-51', logRead: true, exc: [{ sig: B.sig }] }], done: false });
    ok('...two attached: neither log\'s own exceptions are', st.one === null && st.targets.length === 1);
    buildD.reject(new Error('search failed'));
    await flush();
    ok('a profile that fails still ends the waiting', st.profileDone === true);
    ROOT.removeChild(st.node);
    flags.defectProfile = true; JiTA.ui.currentKey = 'EDR-77';
    ok('closed, the profile goes on only while the panel shows it', builds[0].still() === true);
    JiTA.ui.currentKey = 'EDR-1';
    ok('...and stops otherwise', builds[0].still() === false);
    dbRec = null;
    ajax = { 'EDR-78?fields=description': { ok: true, data: { fields: { description: descBlock('ValueError: bad', FB) } } } };
    const t78 = await X._defectText('EDR-78');
    ok('a defect not in the local copy is read from Jira', X._fps(t78)[0].sig === B.sig, t78);
    ajax = {};
    ok('...and one Jira cannot give has no exceptions, without an error', (await X._defectText('EDR-79')) === '');
    // Which are common is read as the window opens, and may come after the description: what it sets apart is drawn so then.
    const freqD = deferred(), getMeta0 = JiTA.db.getMeta;
    JiTA.db.getMeta = (k) => (k === N.FREQ_KEY ? freqD.promise : getMeta0(k));
    N._freq = null; N._freqRead = 0;
    dbRec = { key: 'EDR-77', description: descBlock('KeyError: 2', FA) };
    st = X._state('EDR-77', overlay()); X._st = st;
    X._load(st);
    await flush();
    ok('(the description read first: its exception counts while the count is read)', st.targets.length === 1 && st.targets[0].sig === A.sig && !st.targets[0].left);
    freqD.resolve({ at: Date.now(), n: 100, c: { [A.sig]: 30 } });
    await flush();
    ok('the count of the common ones, read as the window opens, sets one apart when it comes, drawn so', st.targets[0].left === 'common' && /common$/.test(st.tsig.split('#')[0]),
        st.tsig);
    JiTA.db.getMeta = getMeta0;
    N._freq = null; N._freqRead = Date.now();
    ROOT.removeChild(st.node);
    dbRec = null;
    X._sweep = realSweep;

    // ================= the Attach control's options (the real one) =================
    eval('Object.assign(JiTA.ui, {' + line('    _assigneeCache: {},') + member('    _getAssignee: function (key) {') + member('    _attachReportButton: function (reportKey, opts) {') + '});');
    let attaches = [], assigned = [], dones = [], fades = 0, offList = [], live = {};
    Object.assign(JiTA.ui, { currentKey: null, _fadeOutAndReplace() { fades++; }, _takeOffList(keys, still) { offList.push(keys.join() + ':' + still()); return Promise.resolve(); },
        _liveStatus: (keys) => Promise.resolve(live), _isOpenStatus: (s) => !!s && !JiTA.util.isClosedStatus(s) });
    JiTA.link.currentUser = () => Promise.resolve('me');
    JiTA.link.attachDuplicate = (a, b, s, r, to) => { attaches.push(a + '->' + b); assigned.push(to); return Promise.resolve({ attached: true, linked: true }); };
    JiTA.db.deleteDefects = () => Promise.resolve();
    JiTA.sync._ebrRemoved = () => Promise.resolve();
    ajax = { 'EBR-9?fields=assignee': { ok: true, data: { fields: { assignee: null } } }, 'EBR-8?fields=assignee': { ok: true, data: { fields: { assignee: null } } } };
    let on = true;
    let b = JiTA.ui._attachReportButton('EBR-9', { defect: 'EDR-77', still: () => on, done: (k) => { dones.push(k); } });
    await flush();
    ok('with options, Attach is offered on an unassigned report (control)', b.text() === 'Attach', b.text());
    on = false; toasts = [];
    click(b[0]);
    await flush();
    ok('...refused once its list is off screen', attaches.length === 0 && toasts.some((t) => /This list was drawn for EDR-77/.test(t)), toasts.join());
    on = true;
    click(b[0]);
    await flush();
    ok('...attached to the defect it was given, not the issue the panel shows', attaches.join() === 'EBR-9->EDR-77', attaches.join());
    ok('...an unassigned report going to the user, as from the panel', assigned.join() === 'me', String(assigned));
    ok('...and the list\'s own step takes the row away, not the panel\'s slide-out', dones.join() === 'EBR-9' && fades === 0, dones.join() + ' ' + fades);
    live = { 'EBR-8': 'Attached' };
    b = JiTA.ui._attachReportButton('EBR-8', { defect: 'EDR-77', still: () => on, done: (k) => { dones.push(k); } });
    await flush();
    click(b[0]);
    await flush();
    ok('a report attached in Jira meanwhile leaves the list too', attaches.length === 1 && dones.join() === 'EBR-9,EBR-8' && offList.join() === 'EBR-8:true', dones.join() + ' / ' + offList.join());
    live = {};

    // a report someone else has
    ajax['EBR-7?fields=assignee'] = { ok: true, data: { fields: { assignee: { accountId: 'bob', displayName: 'Bob' } } } };
    let whos = [];
    const whoOpt = (a, me) => { whos.push((a ? a.name : '-') + '/' + me); };
    b = JiTA.ui._attachReportButton('EBR-7', { defect: 'EDR-77', still: () => on, done: (k) => { dones.push(k); }, who: whoOpt });
    await flush();
    ok('someone else\'s report is not offered without anyAssignee, and who is told whose it is', b.text() === 'assigned' && whos.join() === 'Bob/me', b.text() + ' ' + whos.join());
    whos = [];
    b = JiTA.ui._attachReportButton('EBR-7', { defect: 'EDR-77', still: () => on, done: (k) => { dones.push(k); }, who: whoOpt, anyAssignee: true });
    await flush();
    ok('with anyAssignee it is offered, saying whose it is', b.text() === 'Attach' && /Assigned to Bob, who stays its assignee/.test(b.attr('title')) && whos.join() === 'Bob/me', b.attr('title'));
    let asked = '';
    global.confirm = (q) => { asked = q; return true; };
    toasts = [];
    click(b[0]);
    await flush();
    ok('...the confirm names its assignee', /It is assigned to Bob, who stays its assignee/.test(asked), asked);
    ok('...it is attached without changing its assignee', attaches.pop() === 'EBR-7->EDR-77' && assigned.pop() === null, String(assigned));
    ok('...the toast says whose it still is', toasts.some((x) => /Attached EBR-7 to EDR-77, still assigned to Bob\./.test(x)), toasts.join());
    ok('...and who is told again from the fresh read', whos.join() === 'Bob/me,Bob/me', whos.join());
    ajax['EBR-6?fields=assignee'] = { ok: true, data: { fields: { assignee: null } } };
    b = JiTA.ui._attachReportButton('EBR-6', { defect: 'EDR-77', still: () => on, done: (k) => { dones.push(k); }, anyAssignee: true });
    await flush();
    ok('an unassigned report says nothing of an assignee (control)', b.text() === 'Attach' && !/Assigned to/.test(b.attr('title')), b.attr('title'));
    ajax['EBR-6?fields=assignee'] = { ok: true, data: { fields: { assignee: { accountId: 'bob', displayName: 'Bob' } } } };
    asked = ''; toasts = [];
    click(b[0]);
    await flush();
    ok('...taken meanwhile, it is still attached, keeping the new assignee', !/assigned to/.test(asked) && attaches.pop() === 'EBR-6->EDR-77' && assigned.pop() === null &&
        toasts.some((x) => /still assigned to Bob/.test(x)), toasts.join());
    global.confirm = () => true;

    JiTA.ui.currentKey = 'EDR-5';
    b = JiTA.ui._attachReportButton('EBR-9');
    await flush();
    click(b[0]);
    await flush();
    ok('without options it is the panel\'s, as before', attaches.pop() === 'EBR-9->EDR-5' && fades === 1, fades);

    // ================= the launcher =================
    let opened = 0, keydown = null, open = null;
    global.document = { addEventListener: (ev, fn) => { if (ev === 'keydown') { keydown = fn; } }, querySelector: (q) => (q === '#jita-menu.jita-excfind-view' ? open : null) };
    global.JiTA = { triage: { _open: false, open() {} }, excfind: { openView: () => { opened++; } }, trend: { openView() {} }, dupfind: { openView() {} }, menu: { isOpen: () => false }, ui: { toggleTrend: () => true } };
    let t = 9000000;
    const realNow = Date.now;
    Date.now = () => t;
    (0, eval)('(function () {\n' + cut('        var lastLt = 0, lastGt = 0, lastHash = 0, lastPlus = 0;', '\n    })();') + '\n})();');
    const key = (k, extra) => keydown(Object.assign({ key: k, target: { tagName: 'DIV' } }, extra || {}));
    key('+');
    ok('one + does nothing', opened === 0);
    t += 200; key('+');
    ok('a double + opens the exception search', opened === 1);
    t += 100; key('+');
    ok('...a third tap right after is a new first one', opened === 1);
    t += 1000; key('+'); t += 500; key('+');
    ok('two slow taps do not', opened === 1);
    t += 1000; key('+'); t += 100; key('+', { repeat: true });
    ok('...nor does holding it', opened === 1);
    t += 1000; key('+', { target: { tagName: 'INPUT' } }); t += 100; key('+', { target: { tagName: 'INPUT' } });
    ok('...nor typing it in a field', opened === 1);
    t += 1000; open = {}; key('+'); t += 100; key('+');
    ok('with the search already open, nothing', opened === 1);
    Date.now = realNow;

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'exception search checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
