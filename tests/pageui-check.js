// pageui-check.js - small page fixes (v3.38.20). Evals the real code against stubs:
//  - the header's Created / Updated dates are refetched once they are a minute old (they were fetched once per tab),
//    and a failed fetch is retried a minute later instead of never
//  - declutter un-hides whatever its pass does not keep (a container hidden while a section title stood alone stayed
//    hidden until reload), and does no detection with nothing configured or off an issue
//  - the Extra Buttons setting changed in another tab updates this tab's copy, and switching on goes through the
//    bug-report check; neither listener runs on the wiki
//  - Translate says which part could not be translated, and a failure is caught
//  - a held launcher key is not a double tap; the wiki watches for menus over its corner pills; the scrollbar CSS
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};
const fnSrc = (name) => cut('\nfunction ' + name + '(', '\n}\n') + '\n}\n';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = () => new Promise((r) => setImmediate(r));

// ================= the header dates =================
function Node(tag) {
    const n = { tagName: tag, attrs: {}, kids: [], style: {}, parentNode: null, text: '' };
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
    n.removeAttribute = (k) => { delete n.attrs[k]; };
    n.appendChild = (c) => { n.kids.push(c); c.parentNode = n; return c; };
    n.insertBefore = (c) => n.appendChild(c);
    n.removeChild = (c) => { n.kids = n.kids.filter((k) => k !== c); c.parentNode = null; return c; };
    Object.defineProperty(n, 'isConnected', { get: () => { let x = n; while (x.parentNode) { x = x.parentNode; } return x === row0; } });
    Object.defineProperty(n, 'textContent', { get: () => n.text + n.kids.map((k) => k.textContent).join(''), set: (v) => { n.text = String(v); n.kids = []; } });
    Object.defineProperty(n, 'id', { get: () => n.attrs.id || '', set: (v) => { n.attrs.id = v; } });
    return n;
}
const row0 = Node('header');
let issueKey = 'EBR-1', now = 1000000, ajax = [];
const realNow = Date.now;
Date.now = () => now;
global.issueItem = '#crumb';
global.document = {
    querySelector: (s) => (s === issueItem && issueKey ? { textContent: issueKey } : null),
    getElementById: (id) => { const walk = (n) => { for (const k of n.kids) { if (k.id === id) { return k; } const f = walk(k); if (f) { return f; } } return null; }; return walk(row0); },
    createElement: (t) => Node(t.toUpperCase())
};
global.jitaDatesTarget = () => ({ row: row0, before: null });
global.jitaFmtDateShort = (iso) => iso.slice(0, 10);
global.$ = { ajax: (o) => { const r = { url: o.url, done(fn) { r.d = fn; return r; }, fail(fn) { r.f = fn; return r; } }; ajax.push(r); return r; } };
(0, eval)(src.split('\n').filter((l) => /^var (jitaDatesCache|jitaDatesFail|JITA_DATES_TTL_MS) = /.test(l)).map((l) => l.replace(/^var /, 'global.')).join('\n'));
(0, eval)(fnSrc('jitaShowIssueDates'));
if (src.indexOf('\nfunction jitaNewDatesEl(') >= 0) { (0, eval)(fnSrc('jitaNewDatesEl')); }
const shown = () => { const el = document.getElementById('jita-issue-dates'); return el ? el.textContent : null; };
const answer = (r, created, updated) => r.d({ fields: { created: created, updated: updated } });

jitaShowIssueDates();
ok('an issue\'s dates are fetched once', ajax.length === 1 && shown() === '…', ajax.length + ' / ' + shown());
answer(ajax[0], '2026-09-01T10:00', '2026-10-01T10:00');
ok('...and shown', shown() === 'Created2026-09-01Updated2026-10-01', shown());
now += 30000;
jitaShowIssueDates();
ok('within a minute they are not fetched again', ajax.length === 1, String(ajax.length));
now += 31000;
jitaShowIssueDates();
const el1 = document.getElementById('jita-issue-dates');
ok('a minute on they are fetched again, keeping the old ones on screen meanwhile', ajax.length === 2 && shown() === 'Created2026-09-01Updated2026-10-01', ajax.length + ' / ' + shown());
jitaShowIssueDates();
ok('...once', ajax.length === 2, String(ajax.length));
answer(ajax[1], '2026-09-01T10:00', '2026-10-03T09:00');
ok('...and the new Updated replaces the old in the same place', shown() === 'Created2026-09-01Updated2026-10-03' && document.getElementById('jita-issue-dates') === el1, shown());

issueKey = 'EBR-2';
jitaShowIssueDates();
ajax[2].f();
ok('a failed fetch leaves no element behind', document.getElementById('jita-issue-dates') === null, shown());
jitaShowIssueDates();
ok('...and is not retried at once', ajax.length === 3 && shown() === null, ajax.length + ' / ' + shown());
now += 61000;
jitaShowIssueDates();
ok('...but a minute later it is', ajax.length === 4 && shown() === '…', ajax.length + ' / ' + shown());
answer(ajax[3], '2026-08-01T10:00', '2026-08-02T10:00');
ok('...and shown when it succeeds', shown() === 'Created2026-08-01Updated2026-08-02', shown());
now += 61000;
jitaShowIssueDates();
ajax[4].f();
ok('a failed refresh keeps the dates it had', shown() === 'Created2026-08-01Updated2026-08-02' && ajax.length === 5, shown());
jitaShowIssueDates();
ok('...and waits a minute before the next try', ajax.length === 5, String(ajax.length));
issueKey = 'EBR-1';   // back to the first issue, whose dates are long stale by now
jitaShowIssueDates();
ok('going back to an issue shows its last dates at once while they are fetched again', shown() === 'Created2026-09-01Updated2026-10-03' && ajax.length === 6, shown() + ' / ' + ajax.length);
Date.now = realNow;

// ================= declutter =================
function El(name, parent) {
    const e = { name: name, attrs: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } }, parent: parent || null };
    e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
    e.removeAttribute = (k) => { delete e.attrs[k]; };
    return e;
}
const page = El('page'), big = El('big container', page), card = El('Development card', big), field = El('Labels row', page), other = El('Automation card', big);
const all = [page, big, card, field, other];
let detections = 0, type = 'ebr', cfg = { fields: [], sections: ['Development'] }, sections = [{ name: 'Development', el: big }];
global.document = { querySelectorAll: (s) => (s === '[data-jita-declutter="1"]' ? all.filter((e) => e.attrs['data-jita-declutter'] === '1') : []) };
const D = new Function('jitaCurrentKey', 'gmGet', 'gmSet', 'SELECTORS', 'return ({' + cut('    _norm: function (s) {', '\n    },\n\n    // Cheap synchronous guard') + '\n    }});')(
    () => 'EBR-1', () => null, () => {}, {});
global.JiTA = { declutter: D };
Object.assign(D, { _type: () => type, _cfg: () => cfg, _fieldRows: () => { detections++; return [{ label: 'Labels', el: field }]; }, _sections: () => { detections++; return sections; } });
const hid = (e) => e.attrs['data-jita-declutter'] === '1' && e.style.props.display === 'none';
D.apply();
ok('a section whose title stood alone hides the container its card was climbed to (as before)', hid(big) && D._lastHidden === 1);
sections = [{ name: 'Development', el: card }, { name: 'Automation', el: other }];   // the rest of the page has mounted
D.apply();
ok('once the page is complete only the section\'s own card stays hidden', hid(card) && !hid(big) && big.style.props.display === undefined, JSON.stringify(big.attrs));
ok('...so the panels mounted in that container show again', !hid(other) && D._lastHidden === 1, String(D._lastHidden));
cfg = { fields: [], sections: [] };
detections = 0;
D.apply();
ok('with nothing chosen nothing stays hidden, and nothing is searched for', !hid(card) && detections === 0 && D._lastHidden === 0, detections + ' / ' + D._lastHidden);
cfg = { fields: ['Labels'], sections: [] };
D.apply();
ok('a hidden field row (control)', hid(field) && D._lastHidden === 1);
type = '';
detections = 0;
D.apply();
ok('off an issue whatever was hidden is shown again and the count reset', !hid(field) && detections === 0 && D._lastHidden === 0, detections + ' / ' + D._lastHidden);

// ================= the Extra Buttons listener =================
const listeners = {};
let ensured = 0, added = 0, removed = [];
global.GM_addValueChangeListener = (k, fn) => { listeners[k] = fn; };
global.savedVariables = [['key', ''], ['parser', true], ['scrollbar', true], ['credits', true], ['buttons', true]];
global.FLAG = { buttons: 4 };
global.ensureButtonsPresent = () => { ensured++; };
global.addButtons = () => { added++; };
global.$ = (s) => ({ remove: () => { removed.push(s); } });
global.GM_addStyle = () => {};
global.JITA_NO_JIRA_UI = false;
(0, eval)(cut('GM_addValueChangeListener("buttons", function', '\n});\n') + '\n});');
listeners.buttons('buttons', true, false, true);
ok('Extra Buttons switched off in another tab updates this tab\'s setting and removes them', savedVariables[4][1] === false && removed.length === 4, String(savedVariables[4][1]) + ' / ' + removed.join());
listeners.buttons('buttons', false, true, true);
ok('...switched on, they go through the bug-report check rather than straight on', savedVariables[4][1] === true && ensured === 1 && added === 0, ensured + ' ensured, ' + added + ' added');
global.JITA_NO_JIRA_UI = true;
removed = [];
listeners.buttons('buttons', true, false, true);
(0, eval)(cut('GM_addValueChangeListener("scrollbar", function', '\n});\n') + '\n});');
listeners.scrollbar('scrollbar', true, false, true);
ok('on the wiki neither listener does anything', removed.length === 0 && savedVariables[4][1] === true, removed.join());
global.JITA_NO_JIRA_UI = false;

// ================= Translate =================
let results = [], alerts = [], logs = [], handler = null;
const texts = {};
function Q(sel, el) {
    const q = { 0: el, length: el ? 1 : 0 };
    ['off', 'after', 'remove', 'nextAll', 'first', 'eq', 'children', 'find', 'click'].forEach((m) => { q[m] = () => q; });
    q.on = (ev, fn) => { if (sel === '#translateButton') { handler = fn; } return q; };
    q.attr = () => '';
    q.text = (v) => { if (v === undefined) { return el ? el.innerText : ''; } texts[sel] = v; return q; };
    return q;
}
global.SELECTORS = { QUICK_ADD_TRIGGER: '#trigger', SUMMARY_HEADING: '#summary', DESC_CONTAINER: '#desc', STATUS_FIELD_WRAP: '#status' };
global.$ = (s) => Q(s, s === '#summary' || s === '#desc' ? { innerText: 'texto ' + s } : null);
global.jitaTranslateFree = () => { const r = results.shift(); return r instanceof Error ? Promise.reject(r) : Promise.resolve(r); };
global.alert = (m) => { alerts.push(m); };
global.jitaConvertButtonState = () => {};
global.jitaConvertClick = () => {};
global.jitaCloseClick = () => {};   // the Close button's handler once v3.38.16 is in
global.flagOn = () => false;
(0, eval)(cut('\nfunction addButtons(', '\n};\n') + '\n};');
addButtons();
const log0 = console.log;
const translate = async (r) => { results = r.slice(); alerts = []; logs = []; console.log = (...a) => { logs.push(a.join(' ')); }; handler(); await flush(); await flush(); console.log = log0; };
(async () => {
    await translate(['title', 'desc', 'steps']);
    ok('a full translation says nothing more (control)', alerts.length === 0 && texts['#summary'] === 'title', alerts.join());
    await translate(['title', null, 'steps']);
    ok('a partial one says which part is still in the original', alerts.length === 1 && /description/.test(alerts[0]) && !/title/.test(alerts[0]) && texts['#summary'] === 'title', alerts.join(' | '));
    await translate([null, null, 'steps']);
    ok('...naming each part that failed', alerts.length === 1 && /title and the description/.test(alerts[0]) && / are still/.test(alerts[0]), alerts.join(' | '));
    await translate([null, null, null]);
    ok('nothing at all keeps its one rate-limit message (control)', alerts.length === 1 && /rate-limiting/.test(alerts[0]), alerts.join(' | '));
    await translate(['title', new Error('boom'), 'steps']);
    ok('a translation that throws is caught and logged', logs.some((l) => /translate failed/.test(l)), logs.join(' | '));

    // ================= the launcher =================
    let opened = 0, keydown = null;
    global.document = { addEventListener: (ev, fn) => { if (ev === 'keydown') { keydown = fn; } }, querySelector: () => null };
    global.JiTA = { triage: { _open: false, open: () => { opened++; } } };
    let t = 5000000;
    Date.now = () => t;
    (0, eval)('(function () {\n' + cut('            var lastLt = 0, lastGt = 0, lastHash = 0;', '\n        })();') + '\n})();');
    const key = (k, extra) => keydown(Object.assign({ key: k, target: { tagName: 'DIV' } }, extra || {}));
    key('<'); t += 150; key('<');
    ok('two taps of < open Triage mode (control)', opened === 1, String(opened));
    t += 1000; opened = 0;
    key('<'); t += 30; key('<', { repeat: true }); t += 30; key('<', { repeat: true });
    ok('holding < does not', opened === 0, String(opened));
    t += 1000;
    key('<', { isComposing: true }); t += 100; key('<', { isComposing: true });
    ok('...nor does typing it through an input method', opened === 0, String(opened));
    Date.now = realNow;

    // ================= the wiki pills, the scrollbar =================
    let observed = null, yields = 0, cb = null;
    global.window = { indexedDB: {} };
    global.setTimeout = () => {};
    global.JiTA = { changelog: { start() {} } };
    global.jitaArmLeadDuties = () => {};
    global.jitaPillsYieldSoon = () => { yields++; };
    global.MutationObserver = function (fn) { cb = fn; this.observe = (target, opts) => { observed = { target: target, opts: opts }; }; };
    global.document = { body: { tag: 'body' } };
    global.JITA_IS_WIKI = true;
    (0, eval)(cut('if (JITA_IS_WIKI) {\n    (function () {\n        if (!window.indexedDB) { return; }', '\n}\n') + '\n}');
    if (cb) { cb([]); }
    ok('the wiki watches the page for menus and steps its corner pills aside', !!observed && observed.target === document.body && observed.opts.subtree === true && yields === 1,
        JSON.stringify(observed && observed.opts) + ' / ' + yields);
    const css = (src.match(/var SCROLLBAR_CSS =[\s\S]*?;\n/) || [''])[0];
    ok('the scrollbar thumb gradient is valid CSS', /linear-gradient\(to right, /.test(css) && !/linear-gradient\(left,/.test(css));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'page UI checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log = log0; console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
