// mutate-responses.js - puts a placeholder or a broken entry into the shipped canned replies and requires
// responses-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'responses-check.js';
const muts = [
    [H, 'the old placeholder is back', 'as well as the Bug Hunter team are not directly involved', 'as well as the REPLACE WITH TEAM NAME are not directly involved'],
    [H, 'another reply ships a TODO', "{ title: 'Defect - Created', body: 'Thank you for your bug report.", "{ title: 'Defect - Created', body: 'TODO Thank you for your bug report."],
    [H, 'a reply ships a bracketed slot', "{ title: 'Defect - Created', body: 'Thank you for your bug report.", "{ title: 'Defect - Created', body: 'Thank you for your bug report, [PLAYER NAME]."],
    [H, 'two replies share a title', "{ title: 'Defect - Exists', body:", "{ title: 'Defect - Created', body:"],
    [H, 'a reply ships with no body', "{ title: 'Feature Request', body: 'It appears", "{ title: 'Feature Request', body: '', x: 'It appears"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mute.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mute.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mute.js')) { fs.unlinkSync('mute.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
