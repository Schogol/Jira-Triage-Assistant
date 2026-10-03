// mutate-dv-seek.js - breaks each guard of the detail view's search for the open issue (v3.38.7): it pages on only
// once a page has landed, and only while the list is on screen. Requires dv-check.js to go red. A crashed harness
// counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['a failed page is asked for again at once', 'D._page(gen).then(function () { if (D._pages > pages) { more(); } });', 'D._page(gen).then(more);'],
    ['a landed page stops the search', 'if (D._pages > pages) { more(); }', 'if (D._pages > pages + 1) { more(); }'],
    ['the search pages on after the list is gone', "if (gen !== D._gen || D._activeKey !== key || !D._mounted) { return; }", "if (gen !== D._gen || D._activeKey !== key) { return; }"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('muts.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node dv-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'muts.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || /^RED/m.test(out) || /harness crashed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
if (fs.existsSync('muts.js')) { fs.unlinkSync('muts.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
