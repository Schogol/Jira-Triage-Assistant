// convert-check.js - Convert to Defect runs once per bug report (v3.38.10). The busy guard used to be the button's
// own disabled flag, and Jira's re-render replaces the button with a fresh, enabled one about two seconds after a
// click, while the conversion goes on for up to 30 seconds: a second click on that one created a second defect.
// The guard now follows the bug report. Evals the real jitaConvertBusy / jitaConvertButtonState / jitaConvertClick
// against jQuery-style stubs.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('var jitaConvertBusy = {};'), e = src.indexOf('// Adds the different buttons to the "command-bar"', s);
if (s < 0 || e < 0) { throw new Error('could not slice the Convert to Defect guard'); }

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
let button = Button(), current = 'EBR-1', gets = [], rules = [], goes = [], errors = 0;
global.$ = (sel) => (sel === '#convertToDefectButton' ? button : { prop() { return this; } });
$.ajax = (o) => { const d = Deferred(); gets.push({ url: o.url, d }); return d; };
global.jitaCurrentKey = () => current;
global.jitaLinkedKeys = (links) => (links || []).map((l) => l.key);
global.jitaInvokeAutomationRule = (id, rule) => { const d = Deferred(); rules.push({ id, rule, d }); return d; };
global.jitaGoToNewDefect = (key, before) => { goes.push(key + ' ' + before.join(',')); };
global.jitaAjaxError = () => () => { errors++; };
global.JITA_CONVERT_DEFECT_RULE = 'rule-9';
(0, eval)(src.slice(s, e) + '\nglobal.jitaConvertClick = jitaConvertClick; global.jitaConvertButtonState = jitaConvertButtonState; global.jitaConvertBusy = jitaConvertBusy;');

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
rules[0].d.resolve();
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

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Convert to Defect checks passed.'));
process.exit(fail ? 1 : 0);
