// mutate-dv-edit.js - breaks each guard of "a query the user changed is not paged through for the issue already
// open" (v3.33.0) in turn and requires dv-check.js to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['edited run still seeks', "D._seekTag = (edited && D._activeKey) ? gen + ':' + D._activeKey : null;", "D._seekTag = null;"],
    ['every run skips the seek', "D._seekTag = (edited && D._activeKey) ? gen + ':' + D._activeKey : null;", "D._seekTag = D._activeKey ? gen + ':' + D._activeKey : null;"],
    ['sort seeks', "D._renderHead();\n        D._run(false, true);", "D._renderHead();\n        D._run(false);"],
    ['search box seeks', "D._run(false, true);   // the bar is NOT re-rendered", "D._run(false);   // the bar is NOT re-rendered"],
    ['chips seek', "D._runTimer = null; D._run(false, true); }", "D._runTimer = null; D._run(false); }"],
    ['JQL edit seeks', "D._run(false, edited);", "D._run(false);"],
    ['refresh never seeks', "D._run(false, edited);", "D._run(false, true);"],
    ['filter pick seeks', "var p = D._run(false, true);", "var p = D._run(false);"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node dv-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || /^RED/m.test(out) || /harness crashed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync('mutt.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
