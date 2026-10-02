// mutate-cutoff.js - breaks each guard of the incremental syncs' relative cutoff (v3.38.3) and requires
// cutoff-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'cutoff-check.js';
const muts = [
    [H, 'no slack past the mark', '/ 60000) + 5;', '/ 60000) + 0;'],
    [H, 'a part minute is rounded down', 'var mins = Math.ceil(', 'var mins = Math.floor('],
    [H, 'a mark ahead of the clock asks for nothing', "return '-' + Math.max(mins, 5) + 'm';", "return '-' + mins + 'm';"],
    [H, 'a mark that is not a date becomes a cutoff', 'if (isNaN(t)) { return null; }', ''],
    [H, 'the cutoff is written in the computer\'s timezone again', "return '-' + Math.max(mins, 5) + 'm';",
        "var d = new Date(t - 2 * 60000), p = function (n) { return (n < 10 ? '0' : '') + n; };\n        return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());"],
    [H, 'the defect sync ignores the time since the mark', 'if (!hw) { return JiTA.sync.fullSync(); }\n            var since = JiTA.util.jqlSince(hw);',
        'if (!hw) { return JiTA.sync.fullSync(); }\n            var since = JiTA.util.jqlSince(hw, 0);'],
    [H, 'a defect mark that is not a date runs a broken query', 'if (!since) { return JiTA.sync.fullSync(); }', ''],
    [H, 'a bug report mark that is not a date runs a broken query', 'if (!since) { return JiTA.sync.fullSyncEbr(); }', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutc.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutc.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutc.js')) { fs.unlinkSync('mutc.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
