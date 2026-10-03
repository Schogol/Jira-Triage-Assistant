// convert-check.js - Convert to Defect runs once per bug report (v3.38.10). The busy guard used to be the button's
// own disabled flag, and Jira's re-render replaces the button with a fresh, enabled one about two seconds after a
// click, while the conversion goes on for up to 30 seconds: a second click on that one created a second defect.
// The guard now follows the bug report. Evals the real jitaConvertBusy / jitaConvertButtonState / jitaConvertClick
// against jQuery-style stubs.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
// The busy map is declared near the top of the file (boot-check.js says why); the functions further down.
const d = src.indexOf('\nvar jitaConvertBusy = {};\n');
const s = src.indexOf('// The Convert to Defect button reflects'), e = src.indexOf('// Adds the different buttons to the "command-bar"', s);
if (d < 0 || s < 0 || e < 0) { throw new Error('could not slice the Convert to Defect guard'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- jQuery-style deferreds, a button that Jira can swap, and the calls the click makes ----
function Deferred() {
    const d = { _done: [], _fail: [] };
    d.done = (f) => { d._done.push(f); return d; };
    d.fail = (f) => { d._fail.push(f); return d; };
    d.resolve = (v) => { d._done.forEach((f) => f(v)); };
    d.reject = (x) => { d._fail.forEach((f) => f(x)); };
    return d;
}
function Button() { const b = { disabled: false }; b.prop = (k, v) => { if (v === undefined) { return b.disabled; } b.disabled = !!v; return b; }; return b; }
let button = Button(), current = 'EBR-1', gets = [], rules = [], goes = [], errors = 0, lastErr = null;
global.$ = (sel) => (sel === '#convertToDefectButton' ? button : { prop() { return this; } });
$.ajax = (o) => { const d = Deferred(); gets.push({ url: o.url, d }); return d; };
global.jitaCurrentKey = () => current;
global.jitaLinkedKeys = (links) => (links || []).map((l) => l.key);
global.jitaInvokeAutomationRule = (id, rule) => { const d = Deferred(); rules.push({ id, rule, d }); return d; };
global.jitaGoToNewDefect = (key, before) => { goes.push(key + ' ' + before.join(',')); };
global.jitaAjaxError = (msg) => () => { errors++; lastErr = msg; };
global.JITA_CONVERT_DEFECT_RULE = 'rule-9';
(0, eval)('var jitaConvertBusy = {};\n' + src.slice(s, e) + '\nglobal.jitaConvertClick = jitaConvertClick; global.jitaConvertButtonState = jitaConvertButtonState; global.jitaConvertBusy = jitaConvertBusy;');

// ---- one conversion, with Jira swapping the button mid-way ----
jitaConvertClick();
ok('a click starts the conversion: the report and its links are read', gets.length === 1 && /issue\/EBR-1\?fields=issuelinks$/.test(gets[0].url), gets.map((g) => g.url).join());
ok('...and the button is disabled', button.disabled === true);
button = Button();             // Jira's re-render puts a fresh, enabled button back
jitaConvertButtonState();      // as addButtons does for every button it puts back
ok('a button put back while the report converts comes back disabled', button.disabled === true);
jitaConvertClick();            // and a click on it anyway (it went through before the state was applied, say)
ok('a second click while the report converts starts nothing', gets.length === 1, String(gets.length));
gets[0].d.resolve({ id: '10001', fields: { issuelinks: [{ key: 'EDR-5' }] } });
ok('the conversion automation runs once, for that report', rules.length === 1 && rules[0].id === '10001' && rules[0].rule === 'rule-9', JSON.stringify(rules.map((r) => r.id)));
rules[0].d.resolve({ invocations: [{ status: 'SUCCESS' }] });
ok('...and then the new defect is looked for, knowing which links were there before', goes.join('|') === 'EBR-1 EDR-5', goes.join('|'));

// ---- another report converts on its own ----
current = 'EBR-3';
button = Button();
jitaConvertButtonState();
ok('another report\'s button is not held by the first conversion', button.disabled === false);
jitaConvertClick();
ok('...and converts on its own', gets.length === 2 && /issue\/EBR-3\?/.test(gets[1].url), gets.map((g) => g.url).join());

// ---- a failure frees the report again ----
gets[1].d.reject({ status: 502 });
ok('a failed read frees the report and says so', !jitaConvertBusy['EBR-3'] && errors === 1, JSON.stringify(jitaConvertBusy) + ' ' + errors);
ok('...and the button on the page now is enabled again', button.disabled === false);
jitaConvertClick();
gets[2].d.resolve({ id: '10003', fields: { issuelinks: [] } });
rules[1].d.reject({ status: 500 });
ok('a failed automation frees it too', !jitaConvertBusy['EBR-3'] && errors === 2 && button.disabled === false, JSON.stringify(jitaConvertBusy));
jitaConvertClick();
ok('...so it can be tried again', gets.length === 4, String(gets.length));

ok('addButtons applies the state to every Convert to Defect button it puts back',
    src.indexOf("addActionButton('convertToDefectButton', 'Convert to Defect');\n    jitaConvertButtonState();") >= 0 &&
    src.indexOf("$(\"#convertToDefectButton\").off('click.jita').on('click.jita', jitaConvertClick);") >= 0);

// ---- the automation has to say it started (v3.38.16) ----
current = 'EBR-4'; button = Button(); jitaConvertButtonState();
jitaConvertClick();
gets[gets.length - 1].d.resolve({ id: '10004', fields: { issuelinks: [] } });
rules[rules.length - 1].d.resolve({ invocations: [{ status: 'FAILURE' }] });
ok('an automation that does not answer SUCCESS frees the report and says the conversion did not start',
    !jitaConvertBusy['EBR-4'] && /did not start \(FAILURE\)/.test(lastErr || '') && goes.length === 1 && button.disabled === false, String(lastErr));

// ---- after it started: open the new defect, but never on an issue the user has moved on to ----
const fnSrc = (name) => { const i = src.indexOf('\nfunction ' + name + '('); if (i < 0) { throw new Error('no ' + name); } return src.slice(i + 1, src.indexOf('\n}\n', i) + 2); };
let timers = [], reloads = 0;
global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
global.window = { location: { href: '/browse/EBR-1', reload: () => { reloads++; } } };
const go = (0, eval)('(' + fnSrc('jitaGoToNewDefect') + ')');
current = 'EBR-1'; gets = [];
go('EBR-1', ['EDR-5']);
gets[0].d.resolve({ fields: { issuelinks: [{ key: 'EDR-5' }] } });
ok('no new link yet: it looks again a second later', timers.length === 1 && window.location.href === '/browse/EBR-1');
timers.shift()();
gets[1].d.resolve({ fields: { issuelinks: [{ key: 'EDR-5' }, { key: 'EDR-77' }] } });
ok('...and opens the new defect once it is linked', window.location.href === '/browse/EDR-77', window.location.href);
window.location.href = '/browse/EBR-2'; current = 'EBR-2'; gets = []; timers = []; reloads = 0;
go('EBR-2', []);
current = 'EBR-9';   // the user moves on to another issue while it converts
gets[0].d.resolve({ fields: { issuelinks: [] } });
timers.shift()();
ok('once the user is on another issue it stops: no request, no navigation, no reload', gets.length === 1 && reloads === 0 && timers.length === 0 && window.location.href === '/browse/EBR-2',
    gets.length + ' requests, ' + reloads + ' reloads');
current = 'EBR-3'; gets = []; timers = []; reloads = 0;
go('EBR-3', []);
for (let i = 0; i < 31; i++) { gets[gets.length - 1].d.reject({ status: 502 }); if (timers.length) { timers.shift()(); } }
ok('on the report itself it gives up after 30 tries and reloads it', reloads === 1 && gets.length === 31, reloads + ' reloads, ' + gets.length + ' requests');

// ---- Close waits for the status menu ----
function LateDeferred() {
    const d = { state: null, val: null, s: [], f: [] };
    d.done = (fn) => { if (d.state === 'ok') { fn(d.val); } else { d.s.push(fn); } return d; };
    d.fail = (fn) => { if (d.state === 'err') { fn(d.val); } else { d.f.push(fn); } return d; };
    d.reject = (v) => { d.state = 'err'; d.val = v; d.f.forEach((fn) => fn(v)); return d; };
    d.promise = () => d;
    return d;
}
let now = 0, optAt = 450, statusClicks = 0, picked = 0, alerts = [], cloud = null, invoked = 0;
Date.now = () => now;
global.alert = (m) => { alerts.push(m); };
global.SELECTORS = { STATUS_FIELD_WRAP: '#status' };
global.$ = (sel) => {
    if (sel === '#status') { return { find: () => ({ click: () => { statusClicks++; } }) }; }
    if (/status-lozenge\.3/.test(sel)) { return { children: () => ({ find: () => (now >= optAt ? { length: 1, click: () => { picked++; } } : { length: 0 }) }) }; }
    if (/ajs-cloud-id/.test(sel)) { return { attr: () => cloud }; }
    return { prop() { return this; } };
};
$.Deferred = LateDeferred;
$.ajax = () => { invoked++; return LateDeferred(); };
const closeClick = (0, eval)('(' + fnSrc('jitaCloseClick') + ')');
timers = [];
closeClick();
while (timers.length) { now += 100; timers.shift()(); }
ok('Close opens the status menu and picks Closed once Jira has drawn it', statusClicks === 1 && picked === 1 && alerts.length === 0, statusClicks + ' ' + picked);
optAt = Infinity; picked = 0; now = 0; timers = [];
closeClick();
while (timers.length) { now += 100; timers.shift()(); }
ok('...and says so when it never appears, after three seconds', picked === 0 && alerts.length === 1 && now >= 3000, now + ' ms, ' + alerts.length + ' alerts');

// ---- the automation call needs the page's cloud id ----
const invokeRule = (0, eval)('(' + fnSrc('jitaInvokeAutomationRule') + ')');
let ruleErr = null;
invokeRule('10001', 'rule-9').fail((x) => { ruleErr = x; });
ok('with no cloud id on the page nothing is sent, and the reason is given', invoked === 0 && !!ruleErr && /cloud id/.test(ruleErr.jitaError || ''), JSON.stringify(ruleErr));
cloud = 'c-1';
invokeRule('10001', 'rule-9');
ok('...with one, the automation is called', invoked === 1);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Convert to Defect checks passed.'));
process.exit(fail ? 1 : 0);
