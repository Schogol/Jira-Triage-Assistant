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
    d.always = (f) => { d._done.push(f); d._fail.push(f); return d; };
    d.resolve = (v) => { d._done.forEach((f) => f(v)); };
    d.reject = (x) => { d._fail.forEach((f) => f(x)); };
    return d;
}
function Button() {
    const b = { disabled: false, cls: {}, attrs: {} };
    b.prop = (k, v) => { if (v === undefined) { return b.disabled; } b.disabled = !!v; return b; };
    b.toggleClass = (c, on) => { if (on) { b.cls[c] = true; } else { delete b.cls[c]; } return b; };
    b.attr = (k, v) => { if (v === undefined) { return b.attrs[k]; } if (v === null) { delete b.attrs[k]; } else { b.attrs[k] = v; } return b; };
    return b;
}
const spinning = (b) => !!b.cls['jita-converting'];
let button = Button(), current = 'EBR-1', gets = [], rules = [], goes = [], errors = 0, lastErr = null, styles = [];
global.GM_addStyle = (css) => { styles.push(css); };
global.$ = (sel) => (sel === '#convertToDefectButton' ? button : { prop() { return this; } });
$.ajax = (o) => { const d = Deferred(); gets.push({ url: o.url, type: o.type, data: o.data, headers: o.headers, d }); return d; };
// The Defect checklist's switch, and who is converting (an unassigned report is taken first while the checklist is on).
let checklistOn = false, meAnswer = 'acc-me';
global.flagOn = (name) => (name === 'defectChecklist' ? checklistOn : true);
global.JiTA = { link: { currentUser: () => (meAnswer instanceof Error ? Promise.reject(meAnswer) : Promise.resolve(meAnswer)) } };
global.jitaCurrentKey = () => current;
global.jitaLinkedKeys = (links) => (links || []).map((l) => l.key);
global.jitaInvokeAutomationRule = (id, rule) => { const d = Deferred(); rules.push({ id, rule, d }); return d; };
global.jitaGoToNewDefect = (key, before) => { goes.push(key + ' ' + before.join(',')); };
global.jitaAjaxError = (xhr, msg) => { errors++; lastErr = msg; };
global.JITA_CONVERT_DEFECT_RULE = 'rule-9';
(0, eval)('var jitaConvertBusy = {};\n' + src.slice(s, e) + '\nglobal.jitaConvertClick = jitaConvertClick; global.jitaConvertButtonState = jitaConvertButtonState; global.jitaConvertBusy = jitaConvertBusy;');

// ---- one conversion, with Jira swapping the button mid-way ----
jitaConvertClick();
ok('a click starts the conversion: the report, its links and its assignee are read', gets.length === 1 && /issue\/EBR-1\?fields=issuelinks,assignee$/.test(gets[0].url), gets.map((g) => g.url).join());
ok('...and the button is disabled, a spinner in it', button.disabled === true && spinning(button) && button.attrs.title === 'Converting to a defect…', JSON.stringify(button));
button = Button();             // Jira's re-render puts a fresh, enabled button back
jitaConvertButtonState();      // as addButtons does for every button it puts back
ok('a button put back while the report converts comes back disabled, spinning', button.disabled === true && spinning(button));
ok('...the spinner\'s style added to the page once, turning before the label', styles.length === 1 &&
    /#convertToDefectButton\.jita-converting > span:last-child::before \{[^}]*animation: jita-convert-spin/.test(styles[0]) && /@keyframes jita-convert-spin \{ to \{ transform: rotate\(360deg\); \} \}/.test(styles[0]), String(styles.length));
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
ok('another report\'s button is not held by the first conversion, nor spinning', button.disabled === false && !spinning(button) && button.attrs.title === undefined);
jitaConvertClick();
ok('...and converts on its own', gets.length === 2 && /issue\/EBR-3\?/.test(gets[1].url), gets.map((g) => g.url).join());

// ---- a failure frees the report again ----
gets[1].d.reject({ status: 502 });
ok('a failed read frees the report and says so', !jitaConvertBusy['EBR-3'] && errors === 1, JSON.stringify(jitaConvertBusy) + ' ' + errors);
ok('...and the button on the page now is enabled again, its spinner gone', button.disabled === false && !spinning(button));
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

// ---- after it started: open the new defect in-app, but never on an issue the user has moved on to (v3.51.1) ----
const fnSrc = (name) => { const i = src.indexOf('\nfunction ' + name + '('); if (i < 0) { throw new Error('no ' + name); } return src.slice(i + 1, src.indexOf('\n}\n', i) + 2); };
let timers = [], reloads = 0, opened = [], viewRefreshes = 0, toasts = [];
global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
global.window = { location: { href: '/browse/EBR-1', reload: () => { reloads++; } } };
// softrefresh-check.js covers the real ones
let openDone = null;
global.jitaOpenIssue = (k, done) => { opened.push(k); openDone = done; };
global.jitaRefreshIssueView = () => { viewRefreshes++; };
JiTA.ui = { toast: (m) => { toasts.push(m); } };
const go = (0, eval)('(' + fnSrc('jitaGoToNewDefect') + ')');
current = 'EBR-1'; gets = []; button = Button(); jitaConvertBusy['EBR-1'] = true; jitaConvertButtonState();
go('EBR-1', ['EDR-5']);
gets[0].d.resolve({ fields: { issuelinks: [{ key: 'EDR-5' }] } });
ok('no new link yet: it looks again a second later', timers.length === 1 && !opened.length);
timers.shift()();
gets[1].d.resolve({ fields: { issuelinks: [{ key: 'EDR-5' }, { key: 'EDR-77' }] } });
ok('...and opens the new defect in-app once it is linked, with no page load', opened.join() === 'EDR-77' && window.location.href === '/browse/EBR-1' && reloads === 0, opened.join() + ' ' + window.location.href);
ok('...the button spinning on, and no toast, while the report stays on screen until the defect has loaded', spinning(button) && button.disabled && !toasts.length && jitaConvertBusy['EBR-1'] === true, toasts.join('|'));
openDone('shown');
ok('...the defect on screen, the report counts as converted: its button off, no longer spinning, saying to which defect', jitaConvertBusy['EBR-1'] === 'EDR-77' &&
    button.disabled === true && !spinning(button) && button.attrs.title === 'Converted to EDR-77.', JSON.stringify(button));
jitaConvertClick();
ok('...so a click on it, back on that report, converts nothing again', gets.length === 2, String(gets.length));
current = 'EBR-2'; gets = []; timers = []; reloads = 0; opened = []; jitaConvertBusy['EBR-2'] = true;
go('EBR-2', []);
current = 'EBR-9';   // the user moves on to another issue while it converts
gets[0].d.resolve({ fields: { issuelinks: [] } });
timers.shift()();
ok('once the user is on another issue it stops: no request, no navigation, no refresh', gets.length === 1 && reloads === 0 && timers.length === 0 && !opened.length && viewRefreshes === 0,
    gets.length + ' requests, ' + reloads + ' reloads');
current = 'EBR-2'; button = Button(); jitaConvertButtonState();
ok('...back on the report, its button is off but no longer spinning: the conversion may yet be done', jitaConvertBusy['EBR-2'] === 'left' && button.disabled && !spinning(button) &&
    button.attrs.title === 'Being converted: its links show the new defect once it is made.', JSON.stringify(button));
current = 'EBR-3'; gets = []; timers = []; reloads = 0; button = Button(); jitaConvertBusy['EBR-3'] = true; jitaConvertButtonState();
go('EBR-3', []);
for (let i = 0; i < 31; i++) { gets[gets.length - 1].d.reject({ status: 502 }); if (timers.length) { timers.shift()(); } }
ok('on the report itself it gives up after 30 tries, showing the report as Jira has it now, with no reload', viewRefreshes === 1 && reloads === 0 && gets.length === 31 && !opened.length,
    viewRefreshes + ' refreshes, ' + reloads + ' reloads, ' + gets.length + ' requests');
ok('...lets the report go, so its button works again', !jitaConvertBusy['EBR-3'] && button.disabled === false, JSON.stringify(jitaConvertBusy));
ok('...and says to look at its links before converting again', toasts.some((t) => t === 'No new defect showed up among EBR-3\'s links within 30 seconds. Check its links before converting it again.'), toasts.join('|'));

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

// ---- an unassigned report is taken first, so its defect starts out with the one converting it (v3.51.0) ----
// The conversion gives the defect the report's assignee, and a defect nobody has is where FC picks defects up, though its
// Defect checklist has not been worked through.
(async () => {
    const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };
    global.$ = (sel) => (sel === '#convertToDefectButton' ? button : { prop() { return this; } });
    $.ajax = (o) => { const d = Deferred(); gets.push({ url: o.url, type: o.type, data: o.data, headers: o.headers, d }); return d; };
    const convertOf = async (key, assignee) => {
        current = key; button = Button(); gets = []; rules = [];
        jitaConvertClick();
        gets[0].d.resolve({ id: key.replace('EBR-', '9'), fields: { issuelinks: [], assignee: assignee } });
        await flush();
    };
    checklistOn = true; meAnswer = 'acc-me';
    await convertOf('EBR-20', null);
    const put = gets[1];
    ok('an unassigned report is taken by the one converting it before it converts', !!put && put.type === 'PUT' && /\/rest\/api\/3\/issue\/EBR-20\/assignee$/.test(put.url) &&
        put.data === JSON.stringify({ accountId: 'acc-me' }) && !!put.headers && put.headers['X-Atlassian-Token'] === 'no-check' && rules.length === 0, put && JSON.stringify({ url: put.url, data: put.data }));
    put.d.resolve();
    ok('...and converts once it is taken', rules.length === 1 && rules[0].id === '920');
    await convertOf('EBR-21', null);
    gets[1].d.reject({ status: 403 });
    ok('...a take Jira refuses converts all the same', rules.length === 1 && rules[0].id === '921');
    await convertOf('EBR-22', { accountId: 'acc-x' });
    ok('a report someone has is converted as it is', gets.length === 1 && rules.length === 1);
    checklistOn = false;
    await convertOf('EBR-23', null);
    ok('with the checklist switched off, an unassigned report is converted as it is', gets.length === 1 && rules.length === 1);
    checklistOn = true; meAnswer = null;
    await convertOf('EBR-24', null);
    ok('...and when who is converting cannot be told', gets.length === 1 && rules.length === 1);
    meAnswer = new Error('no session');
    await convertOf('EBR-25', null);
    ok('...or cannot be read', gets.length === 1 && rules.length === 1);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Convert to Defect checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
