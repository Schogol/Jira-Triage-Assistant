// excfind-check.js - the hidden exception search (double-tap '+' on a defect): the open bug reports whose logs hold the
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
JiTA.util.isGmTeam = (v) => v === 'gm';
JiTA.util.delay = (ms) => new Promise((r) => setTimeout(r, ms));
let crashCalls = 0;
Object.assign(JiTA.logsig, eval('({' + line('    MIN_FRAMES: ') + line('    CRASH_FRAMES: ') + member('    _splitBlocks: function (text) {') + member('    _fingerprint: function (text) {') +
    member('    _crashOf: function (sig) {') + '})'));
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
    ok('...the description\'s start ticked, and those at least half the attached logs share', ts[0].def && ts[1].def && !ts[2].def, ts.map((t) => t.def).join());
    ok('...each carries its crash site', ts.every((t) => t.crash === realCrash(t.sig)));
    ts = X.targets([], { withLog: 2, excGroups: [{ msg: 'm', paths: [{ sig: A.sig, count: 1 }] }] });
    ok('one log is no share, however few were read', ts.length === 1 && !ts[0].def);
    ts = X.targets([], { withLog: 4, excGroups: [{ msg: 'm', paths: [{ sig: A.sig, count: 2 }] }] });
    ok('exactly half the logs is enough', ts[0].def === true);
    ts = X.targets([], { withLog: 0, excGroups: [{ msg: 'm', paths: [{ sig: A.sig, count: 2 }] }] });
    ok('...nor is a count over no logs', !ts[0].def);
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
    const r1 = X._entry(item('EBR-1'), { exc: [{ sig: A.sig, msg: 'x' }, { sig: B.sig, msg: 'y' }] }, pool);
    const r2 = X._entry(item('EBR-2'), { exc: [{ sig: A.sig, msg: 'x' }] }, pool);
    ok('an exception many reports hold is kept once, its crash site worked out once', r1.log[0] === r2.log[0] && crashCalls === 2 && r1.log[0].crash === realCrash(A.sig), crashCalls);
    ok('...a report keeps its summary, date and status', r1.summary === 'EBR-1 summary' && r1.status === 'Open' && /^2026-10-01/.test(r1.created));
    const tA = { sig: A.sig, crash: realCrash(A.sig), msg: 'KeyError: 2' }, tA2 = { sig: A2.sig, crash: realCrash(A2.sig), msg: 'KeyError: 2 (2)' }, tB = { sig: B.sig, crash: realCrash(B.sig), msg: 'ValueError' };
    let m = X.match(r1, [tA]);
    ok('the same stack is an exact match, in the log', m.length === 1 && m[0].exact === true && m[0].where === 'log' && m[0].t === tA);
    m = X.match(r2, [tA2]);
    ok('another stack to the same crash site is a loose one', m.length === 1 && m[0].exact === false);
    ok('another crash site is none', X.match(r2, [tB]).length === 0);
    const r3 = X._entry(item('EBR-3', null, [{ sig: A2.sig, msg: 'k' }]), { exc: [{ sig: A.sig, msg: 'x' }] }, pool);
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

    const reps = [r1, r2, r3, r4];
    reps.forEach((r) => { r.m = X.match(r, [tA2]); });
    let h = X.hits(reps);
    ok('hits: exact matches first, then newest first', h.map((r) => r.key).join() === 'EBR-3,EBR-2,EBR-1', h.map((r) => r.key).join());
    r2.gone = true;
    ok('...a report attached from the window is gone', X.hits(reps).map((r) => r.key).join() === 'EBR-3,EBR-1');
    r2.gone = false;

    // ================= reading a report: the cache, and when it is out of date =================
    let reads = [];
    P._readFiles = (it, rec, zip) => { reads.push({ key: it.key, rec: rec, zip: zip }); return Promise.resolve({ v: P.V, key: it.key, logs: true, hasLog: true, exc: [{ sig: A.sig, msg: 'x' }], logSig: P._logSig(it.fields.attachment) }); };
    const att = (name, size) => ({ filename: name, size: size || 100, content: 'https://jira/att/' + name });
    const it5 = { key: 'EBR-5', desc: [], fields: { attachment: [att('logs.txt', 500)] } };
    meta['rp:EBR-5'] = { v: P.V, key: 'EBR-5', logs: true, hasLog: true, exc: [{ sig: B.sig }], logSig: 'logs.txt:500', zip: true, wer: true };
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
        summary: 'S ' + k, created: '2026-10-' + String(10 + (+k.split('-')[1] % 20)) + 'T00:00:00.000+0000', status: { name: 'Open' },
        customfield_10001: k.indexOf(':gm') > 0 ? 'gm' : null, attachment: [att('logs.txt')], labels: [],
        description: k.indexOf(':desc') > 0 ? descBlock('ValueError: bad', FB) : 'plain'
    } })) }, extra || {}) });
    let pages = {}, bodies = [], inFlight = 0, maxIn = 0, readsStarted = [], held = null;
    JiTA.sync._apiPost = (path, body) => { bodies.push(body); const p = pages[body.nextPageToken || '']; return p instanceof Error ? Promise.reject(p) : Promise.resolve(p); };
    P._readFiles = (it) => {
        readsStarted.push(it.key);
        inFlight++; maxIn = Math.max(maxIn, inFlight);
        const go = () => { inFlight--; return { v: P.V, key: it.key, logs: it.key !== 'EBR-9', hasLog: true, exc: it.key === 'EBR-4' ? [{ sig: A2.sig, msg: 'k' }] : [], logSig: 'logs.txt:100' }; };
        if (held) { return held.promise.then(go); }
        return new Promise((res) => setImmediate(() => res(go())));
    };
    const overlay = () => { const n = new Node('div'); ROOT.appendChild(n); return n; };
    const fresh = () => { const st = X._state('EDR-77', overlay()); X._st = st; return st; };
    meta = { 'rp:EBR-3': { v: P.V, key: 'EBR-3', logs: true, hasLog: true, exc: [{ sig: A.sig, msg: 'x' }], logSig: 'logs.txt:100' } };
    pages = { '': page(['EBR-1', 'EBR-2:gm', 'EBR-3', 'EBR-4'], { nextPageToken: 't2' }), t2: page(['EBR-4', 'EBR-5:desc', 'EBR-9'], { isLast: true }) };
    let st = fresh();
    st.targets = [Object.assign({}, tA, { def: true })]; st.on[A.sig] = true;
    await X._sweep(st);
    ok('every open report is listed, newest first, a page at a time', bodies.length === 2 && bodies[0].jql === JiTA.EBR_SCOPE + ' ORDER BY created DESC' && !bodies[0].nextPageToken &&
        bodies[1].nextPageToken === 't2' && bodies[0].fields.indexOf('attachment') >= 0 && bodies[0].fields.indexOf('description') >= 0, JSON.stringify(bodies.map((b) => b.nextPageToken)));
    ok('...GM team reports left out, a report listed twice read once', st.n === 5 && readsStarted.join() === 'EBR-1,EBR-4,EBR-5,EBR-9', st.n + ' ' + readsStarted.join());
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
    ok('the description\'s exception starts it', sweeps === 1 && st.started && st.on[A.sig] === true);
    st.profile = { withLog: 10, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 3 }] }] };
    X._retarget(st);
    ok('...once only; a shared exception below half the logs is offered unticked', sweeps === 1 && st.on[B.sig] === false && st.targets.length === 2);
    st.profile = { withLog: 10, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 6 }] }] };
    X._retarget(st);
    ok('...ticked once more of the logs read share it', st.on[B.sig] === true);
    st.on[B.sig] = false; st.touched[B.sig] = true;
    X._retarget(st);
    ok('...but not once it was unticked by hand', st.on[B.sig] === false);
    st.reports = [X._entry(item('EBR-6'), { exc: [{ sig: B.sig }] }, st.pool)];
    st.on[B.sig] = true; st.tsig = null;
    X._retarget(st);
    ok('ticking matches what was read again', st.reports[0].m.length === 1 && st.reports[0].m[0].t.sig === B.sig);
    st.on[B.sig] = false; st.tsig = null;
    X._retarget(st);
    ok('...and so does unticking', st.reports[0].m.length === 0);
    st = fresh(); st.desc = [{ sig: A.sig, msg: 'KeyError: 2' }];
    ROOT.removeChild(st.node);
    X._retarget(st);
    ok('a closed window starts no search', sweeps === 1 && st.started === false);
    X._sweep = realSweep;

    // ================= the window =================
    let built = [], loads = 0, tips = 0;
    JiTA.ui.injectCss = () => {};
    JiTA.ui.toast = (t) => { toasts.push(t); };
    JiTA.ui._showTip = () => { tips++; };
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
    const boxes = find(tbox, (n) => n.tag === 'input');
    ok('each exception has a box, ticked as it starts, with where it comes from', boxes.length === 2 && boxes[0].checked === true && boxes[1].checked === false &&
        /KeyError: 2in the description/.test(tbox.textContent) && /ValueError: badin 1 of 4 attached logs/.test(tbox.textContent), tbox.textContent);
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
    add('EBR-0', [], '2026-09-01T00:00:00.000+0000', [{ sig: A.sig, msg: 'k' }]);
    const row0 = res.kids.find((n) => n.getAttribute('data-key') === 'EBR-0');
    ok('...or that it is in the report\'s description', !!row0 && /KeyError: 2 \(in its description\)/.test(row0.textContent), row0 && row0.textContent);
    X._gone(st, 'EBR-0');
    ok('...with an Attach control for this defect', built.length === 3 && built.every((b) => b.opts.defect === 'EDR-77') && byCls(row1, 'jita-sd-link').length === 1);
    click(row1, 'mouseenter');
    ok('...and the hover card', tips === 1);
    click(boxes[1], 'change');   // checked is still false: unticked by hand, a no-op
    boxes[1].checked = true;
    click(byCls(byId['jx-targets'], 'jx-target')[1].kids[0], 'change');
    ok('ticking a box adds what holds it, newest first among the exact', order() === 'EBR-2,EBR-3,EBR-1' && st.touched[B.sig] === true, order());
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
    X._why(wr, [{ t: { msg: 'KeyError: 2', via: 'other.py:start > …' }, exact: true, where: 'log' }]);
    ok('a match names the stack it is, when its message is not enough', /same stackKeyError: 2 via other\.py:start/.test(wr.textContent), wr.textContent);
    X._why(wr, [{ t: { sig: A.sig, msg: 'KeyError: 2' }, exact: true, where: 'log' }]);
    ok('...and its stack on hover', byCls(wr, 'jx-msg')[0].getAttribute('title') === P._sigTip(A.sig, 'KeyError: 2'));
    st.targets = [{ sig: A.sig, msg: 'KeyError: 2', via: 'foo.py:onclick > …', desc: true }];
    X._paintTargets(st);
    ok('...and so does its box', / via foo\.py:onclick/.test(byId['jx-targets'].textContent), byId['jx-targets'].textContent);
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
    ok('nothing to look for, once all is read: said plainly', /Nothing to look for/.test(byId['jx-targets'].textContent));

    // the window closed: nothing more is drawn
    ROOT.removeChild(st.node);
    ok('a closed window is no longer this search', X._alive(st) === false && opts.still() === false);
    X._paintResults(st);
    ok('...and is not drawn into', !document.getElementById('jx-results'));

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
    ok('the defect\'s description is read from the local copy', st.desc && st.desc.length === 1 && st.desc[0].sig === A.sig && sweeps === 1, JSON.stringify(st.desc));
    ok('...the profile of its attached reports is asked for', builds.length === 1 && builds[0].key === 'EDR-77');
    ok('...and goes on while the window is open', builds[0].still() === true);
    builds[0].onState({ summary: { withLog: 4, excGroups: [{ msg: 'ValueError: bad', paths: [{ sig: B.sig, count: 3 }] }] }, done: false });
    ok('a profile state adds its shared exceptions', st.targets.length === 2 && st.on[B.sig] === true && st.profileDone === false);
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
    X._sweep = realSweep;

    // ================= the Attach control's options (the real one) =================
    eval('Object.assign(JiTA.ui, {' + line('    _assigneeCache: {},') + member('    _getAssignee: function (key) {') + member('    _attachReportButton: function (reportKey, opts) {') + '});');
    let attaches = [], dones = [], fades = 0, offList = [], live = {};
    Object.assign(JiTA.ui, { currentKey: null, _fadeOutAndReplace() { fades++; }, _takeOffList(keys, still) { offList.push(keys.join() + ':' + still()); return Promise.resolve(); },
        _liveStatus: (keys) => Promise.resolve(live), _isOpenStatus: (s) => !!s && !JiTA.util.isClosedStatus(s) });
    JiTA.link.currentUser = () => Promise.resolve('me');
    JiTA.link.attachDuplicate = (a, b) => { attaches.push(a + '->' + b); return Promise.resolve({ attached: true, linked: true }); };
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
    ok('...and the list\'s own step takes the row away, not the panel\'s slide-out', dones.join() === 'EBR-9' && fades === 0, dones.join() + ' ' + fades);
    live = { 'EBR-8': 'Attached' };
    b = JiTA.ui._attachReportButton('EBR-8', { defect: 'EDR-77', still: () => on, done: (k) => { dones.push(k); } });
    await flush();
    click(b[0]);
    await flush();
    ok('a report attached in Jira meanwhile leaves the list too', attaches.length === 1 && dones.join() === 'EBR-9,EBR-8' && offList.join() === 'EBR-8:true', dones.join() + ' / ' + offList.join());
    live = {};
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
