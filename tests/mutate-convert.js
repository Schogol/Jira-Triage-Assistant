// mutate-convert.js - breaks each guard of Convert to Defect's once-per-report rule (v3.38.10) and requires
// convert-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'convert-check.js';
const muts = [
    [H, 'a busy report converts again', 'if (!ebrKey || jitaConvertBusy[ebrKey]) { return; }', 'if (!ebrKey) { return; }'],
    [H, 'the report is never marked busy', '    jitaConvertBusy[ebrKey] = true;\n', ''],
    [H, 'a failure keeps the report busy', '        delete jitaConvertBusy[ebrKey];\n', ''],
    [H, 'a failure leaves the button disabled', '        jitaConvertButtonState();   // whichever button is on the page now', '        void 0;   // whichever button is on the page now'],
    [H, 'the button ignores the conversion', "$('#convertToDefectButton').prop('disabled', !!(key && jitaConvertBusy[key]));", "$('#convertToDefectButton').prop('disabled', false);"],
    [H, 'a put-back button is never set', "addActionButton('convertToDefectButton', 'Convert to Defect');\n    jitaConvertButtonState();", "addActionButton('convertToDefectButton', 'Convert to Defect');"],
    [H, 'the button is not wired', "$(\"#convertToDefectButton\").off('click.jita').on('click.jita', jitaConvertClick);", "$(\"#convertToDefectButton\").off('click.jita');"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutd.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutd.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutd.js')) { fs.unlinkSync('mutd.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
