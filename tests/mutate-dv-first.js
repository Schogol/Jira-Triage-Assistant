// mutate-dv-first.js - breaks each guard of "a picked filter opens its first issue" (JiTA.dv._openFirst and
// its hooks) in turn and requires dv-check.js to go red. A crashed harness counts as red.
// A mutation is one [from, to] pair, or a list of pairs applied together.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const NL = String.fromCharCode(10);
const muts = [
    ['page one never opens it', [["            if (first) { D._openFirst(gen); }" + NL, ""]]],
    ['pick never recorded', [["        D._firstFor = { gen: D._gen, from: D._locKey() };", "        /* mutated */"]]],
    ['any later run opens it', [["if (!want || want.gen !== gen) { return; }", "if (!want) { return; }"]]],
    // the null-out and the page-one gate each stop a second firing alone; only losing both is observable
    ['every page reopens it', [
        ["        D._firstFor = null;" + NL + "        if (!D._mounted", "        if (!D._mounted"],
        ["            if (first) { D._openFirst(gen); }", "            D._openFirst(gen);"]
    ]],
    ['fires with no detail view', [["if (!D._mounted || !D._issues.length || ", "if (!D._issues.length || "]]],
    ['empty list unguarded', [["!D._issues.length || D._locKey() !== want.from", "D._locKey() !== want.from"]]],
    ['moved-on user pulled back', [[" || D._locKey() !== want.from) { return; }", ") { return; }"]]],
    ['opens the last, not the first', [["D._select(D._issues[0].key, 'click');", "D._select(D._issues[D._issues.length - 1].key, 'click');"]]]
];
let allRed = true;
muts.forEach(([name, pairs]) => {
    let m = src, miss = false;
    pairs.forEach(([a, b]) => { if (m.split(a).length !== 2) { miss = true; } else { m = m.replace(a, b); } });
    if (miss) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutf.js', m);
    let out = '', crashed = false;
    try { out = execSync('node dv-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutf.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || /^RED/m.test(out) || /harness crashed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync('mutf.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
