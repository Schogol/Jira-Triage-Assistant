// mutate-dv-nav.js - breaks each guard of the detail view's router fallback (v3.44.0: an issue still loading is waited
// for, not counted as an ignored switch, and the page-load mode wears off) in turn and requires dv-check.js to go red.
// A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['a loading issue counted as ignored', "            if (!c && Date.now() - t0 < D.NAV_GIVEUP_MS) { D._navTimer = setTimeout(check, 1000); return; }\n", ''],
    ['a loading issue waited for forever', "if (!c && Date.now() - t0 < D.NAV_GIVEUP_MS) {", "if (!c) {"],
    ['a loading issue checked once only', "D._navTimer = setTimeout(check, 1000); return; }", "return; }"],
    ['only the new key counts as done', "if (c && c !== from) { D._setSpaFails(0); return; }", "if (c === key) { D._setSpaFails(0); return; }"],
    ['the old issue counts as done', "if (c && c !== from) { D._setSpaFails(0); return; }", "if (c) { D._setSpaFails(0); return; }"],
    ['a switch that works keeps the count', "if (c && c !== from) { D._setSpaFails(0); return; }", "if (c && c !== from) { return; }"],
    ['a fallback not counted', "            D._setSpaFails(fails + 1);\n", ''],
    ['the page-load mode never wears off', "!(Date.now() - (v.at || 0) < D.SPA_FAIL_TTL_MS)", "false"],
    ['the count kept without its time', "JSON.stringify({ n: n, at: Date.now() })", "JSON.stringify({ n: n })"],
    ['the count never cleared', "            else { sessionStorage.removeItem(D.SPA_FAIL_KEY); }\n", ''],
    ['page-load mode never entered', "if (fails >= D.SPA_FAIL_MAX) { location.assign(path); return; }", "if (false) { location.assign(path); return; }"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node dv-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || /^RED/m.test(out) || /harness crashed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync('mutt.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
