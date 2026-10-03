// mutate-overlay.js - breaks each guard against stray input closing an overlay (v3.38.8) and requires overlay-check
// to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'overlay-check.js';
const muts = [
    [H, 'any click on the backdrop closes', 'if (e.target === this && downOnBackdrop) { JiTA.menu.close(); }', 'if (e.target === this) { JiTA.menu.close(); }'],
    [H, 'every mousedown counts as on the backdrop', 'downOnBackdrop = (e.target === this);', 'downOnBackdrop = true;'],
    [H, 'an Esc already handled still closes', "if (e.key !== 'Escape' || e.defaultPrevented) { return; }", "if (e.key !== 'Escape') { return; }"],
    [H, 'Esc in a field closes', 'if (JiTA.menu._isTextField(e.target)) { try { e.target.blur(); } catch (x) { /* ignore */ } return; }', ''],
    [H, 'every input counts as a text field', "return el.tagName === 'INPUT' && /^(text|search|email|url|tel|password|number)?$/i.test(el.type || '');", "return el.tagName === 'INPUT';"],
    [H, 'a text area is not a field', "if (el.tagName === 'TEXTAREA' || el.isContentEditable) { return true; }", 'if (el.isContentEditable) { return true; }'],
    [H, 'a popover lets its Esc through', "if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }", "if (e.key === 'Escape') { close(); }"],
    [H, 'a popover closes on any key', "if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }", 'e.preventDefault(); e.stopPropagation(); close();'],
    [H, 'a click on the toggle closes the popover', '|| (anchor && anchor.contains && anchor.contains(e.target))) { return; }', ') { return; }'],
    [H, 'the filter menu keeps its own handler', 'JiTA.ui._filterMenuDismiss = function (e) { JiTA.ui._popDismiss(e, menu, anchor, JiTA.ui._closeFilterMenu); };',
        "JiTA.ui._filterMenuDismiss = function (e) { if (e.type === 'keydown') { if (e.key === 'Escape') { JiTA.ui._closeFilterMenu(); } return; } JiTA.ui._closeFilterMenu(); };"],
    [H, 'the hide menu keeps its own handler', 'JiTA.ui._hideMenuDismiss = function (e) { JiTA.ui._popDismiss(e, menu, null, JiTA.ui._closeHideMenu); };',
        "JiTA.ui._hideMenuDismiss = function (e) { if (e.type === 'keydown') { if (e.key === 'Escape') { JiTA.ui._closeHideMenu(); } return; } JiTA.ui._closeHideMenu(); };"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('muto.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'muto.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('muto.js')) { fs.unlinkSync('muto.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
