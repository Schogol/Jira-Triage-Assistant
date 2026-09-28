// mutate-dv-scope.js - breaks each guard of the Basic-mode scope (v3.33.0: Basic narrows a filter's query
// instead of replacing it) in turn and requires dv-check.js to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['scope not bracketed', "return w ? '(' + sc + ') AND ' + w : sc;", "return w ? sc + ' AND ' + w : sc;"],
    ['scope ignored when narrowed', "return w ? '(' + sc + ') AND ' + w : sc;", "return w;"],
    ['search box drops the scope', "s.basic.text = t;\n        s.jql = D._join(D._scopedWhere(s)", "s.basic.text = t;\n        s.jql = D._join(D._buildWhere(s.basic)"],
    ['chips drop the scope', "var D = JiTA.dv, s = D._load();\n        s.jql = D._join(D._scopedWhere(s), D._splitOrder(s.jql).order || 'created DESC');\n        D._scopeOwner(s);\n        D._save();\n        D._renderBar();",
        "var D = JiTA.dv, s = D._load();\n        s.jql = D._join(D._buildWhere(s.basic), D._splitOrder(s.jql).order || 'created DESC');\n        D._scopeOwner(s);\n        D._save();\n        D._renderBar();"],
    ['narrowing unlights the filter', "s.filterName = s.scope ? s.scope.name : '';\n        s.filterId = s.scope ? s.scope.id : '';", "s.filterName = ''; s.filterId = '';"],
    ['no scope keeps a stale filter lit', "s.filterName = s.scope ? s.scope.name : '';\n        s.filterId = s.scope ? s.scope.id : '';", "if (s.scope) { s.filterName = s.scope.name; s.filterId = s.scope.id; }"],
    ['Basic always resets', "if (where !== D._scopedWhere(s)) {", "if (true) {"],
    ['stale filters kept on a new scope', "            if (where !== D._scopedWhere(s)) {\n                s.basic = D._emptyBasic();\n", "            if (where !== D._scopedWhere(s)) {\n"],
    ['empty query keeps a stale scope', "if (!where) { s.scope = null; }", "if (!where) { }"],
    ['typed-away narrowing not the filter again', "else if (s.scope && s.scope.where === where) { D._scopeOwner(s); }", "else if (false) { }"],
    ['new scope forgets the filter', "else { s.scope = { where: where, name: s.filterName || '', id: s.filterId || '' }; }", "else { s.scope = { where: where, name: '', id: '' }; }"],
    ['filter pick forces JQL', "if (!f || !f.jql) { return; }\n        s.jql = String(f.jql).trim();", "if (!f || !f.jql) { return; }\n        s.mode = 'jql';\n        s.jql = String(f.jql).trim();"],
    ['filter pick keeps the old search', "        s.basic = D._emptyBasic();\n        s.scope = where ? {", "        s.scope = where ? {"],
    ['filter pick sets no scope', "s.scope = where ? { where: where, name: s.filterName, id: s.filterId } : null;", "s.scope = null;"],
    ['x keeps the scope', "        D._load().scope = null;\n        D._applyBasic();", "        D._applyBasic();"],
    ['empty stored scope trusted', "typeof sc.where === 'string' && sc.where.trim()) ?", "typeof sc.where === 'string') ?"],
    ['pill never drawn', "if (s.scope) {   // what Basic is narrowing", "if (false) {   // what Basic is narrowing"],
    ['pill x does nothing', "scx.onclick = D._dropScope;", "scx.onclick = function () {};"],
    ['placeholder never says so', "inp.placeholder = s.scope ? 'Search this list' : 'Search work';", "inp.placeholder = 'Search work';"]
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
