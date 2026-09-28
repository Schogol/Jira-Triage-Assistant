// mutate-dv-mark.js - breaks each guard of the sidebar highlight (JiTA.dv._markSidebar + filterId bookkeeping)
// in turn and requires dv-check.js to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['the link lit, not Jira\'s row', "keep.push((p && p.hasAttribute && p.hasAttribute('data-selected')) ? p : a);", "keep.push(a);"],
    ['stale highlights kept', "if (keep.indexOf(marked[i]) < 0) { marked[i].removeAttribute('data-jita-dv-current'); }", "/* mutated */"],
    ['lit while collapsed', "(D._mounted && !D._collapsed() && s.filterId)", "(D._mounted && s.filterId)"],
    ['lit with no list at all', "(D._mounted && !D._collapsed() && s.filterId)", "(!D._collapsed() && s.filterId)"],
    ['own UI marked', "if (a.closest('#jdv-bar, #jdv-col, #jdv-rail, .jdv-pop')) { continue; }\n                var link = D._filterLink(a.href);", "var link = D._filterLink(a.href);"],
    ['id never recorded', "s.filterId = (f.id != null) ? String(f.id) : '';", "/* mutated */"],
    ['typed query keeps the id', "s.filterName = ''; s.filterId = ''; D._save(); D._renderBar(); D._renderHead(); }", "s.filterName = ''; D._save(); D._renderBar(); D._renderHead(); }"],
    ['system filter loses its id', "name: sys[0], id: link.id }", "name: sys[0] }"],
    ['unmount leaves it lit', "D._markSidebar();   // the list is gone", "/* mutated */   // the list is gone"],
    ['old saved state unguarded', "if (typeof s.filterId !== 'string') { s.filterId = ''; }", "/* mutated */"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutm.js', src.replace(a, b));
    let out = '', crashed = false;
    try { out = execSync('node dv-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutm.js' }), encoding: 'utf8' }); }
    catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || /^RED/m.test(out) || /harness crashed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing)' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync('mutm.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
