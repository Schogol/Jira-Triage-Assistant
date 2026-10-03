// mutate-dxdiag.js - breaks each dxdiag / PDM Quick Info fix (v3.38.18) and requires dxdiag-check to go red. A
// crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'dxdiag-check.js';
const muts = [
    // ---- WER ----
    [H, 'anything for exefile.exe is a client crash', "    return null;\n}\n\n// The exception code of an app crash", "    return eve ? 'eve' : 'app';\n}\n\n// The exception code of an app crash"],
    [H, 'a client hang is a crash', "if (/^AppHang/i.test(name)) { return eve ? 'evehang' : null; }", "if (/^AppHang/i.test(name)) { return eve ? 'eve' : null; }"],
    [H, 'another program hanging is an app crash', "if (/^AppHang/i.test(name)) { return eve ? 'evehang' : null; }", "if (/^AppHang/i.test(name)) { return eve ? 'evehang' : 'app'; }"],
    [H, 'a blue screen is not a system crash', "    if (/bluescreen|livekernel/i.test(name)) { return 'kernel'; }\n", ''],
    [H, 'BEX reads its offset', "    return /^(BEX|BEX64|MoBEX)$/i.test(e.name || '') ? e.p.P8 : e.p.P7;", '    return e.p.P7;'],
    [H, 'the hang line is never drawn', '    if (hangs.length) {', '    if (false) {'],
    [H, 'a missing WER section is an empty history', '    if (idx < 0) { return null; }', '    if (idx < 0) { return out; }'],
    [H, 'an unknown history is an all-clear', '    if (!wer) {\n', '    if (false) {\n'],
    [H, 'nothing recognised still draws the WER line alone', "    if (!wer && !gpus.length && !sys) { html = 'Could not read dxdiag: no crash history, display devices or system details found.'; }\n", ''],
    // ---- dates ----
    [H, 'dotted dates are not read', "    else if ((m = s.match(/(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})/))) { dd = +m[1]; mm = +m[2]; yy = +m[3]; }   // dotted dates are D.M.Y\n", ''],
    [H, 'dotted dates are month.day', "    else if ((m = s.match(/(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})/))) { dd = +m[1]; mm = +m[2]; yy = +m[3]; }",
        "    else if ((m = s.match(/(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})/))) { mm = +m[1]; dd = +m[2]; yy = +m[3]; }"],
    [H, 'ISO dates are not read', "    if ((m = s.match(/(\\d{4})-(\\d{1,2})-(\\d{1,2})/))) { yy = +m[1]; mm = +m[2]; dd = +m[3]; }\n    else if", '    if'],
    [H, 'dashed dates are not read', "    else if ((m = s.match(/(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})/))) {", "    else if ((m = s.match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/))) {"],
    [H, 'the file\'s order is ignored', "        if ((order === 'dm' && dd <= 12) || (mm > 12 && dd <= 12)) {", '        if (mm > 12 && dd <= 12) {'],
    [H, 'a date that does not exist rolls over', ' || d.getMonth() !== mm - 1 || d.getDate() !== dd) ? null : d;', ') ? null : d;'],
    [H, 'a day/month file is never recognised', "        if (+m[1] > 12) { return 'dm'; }\n", ''],
    [H, 'the GPU list ignores the file\'s order', '    var gpus = dxGpus(text, order);', '    var gpus = dxGpus(text);'],
    // ---- PDM ----
    [H, 'no OS block fails the minimum', "rows.push({ label: 'OS', tier: 'na', detail: 'OS not found in PDM data' });", "rows.push({ label: 'OS', tier: 'fail', detail: 'OS not found in PDM data' });"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('muth.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'muth.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('muth.js')) { fs.unlinkSync('muth.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
