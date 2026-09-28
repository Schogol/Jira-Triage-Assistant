// mutate-dv-links.js - breaks each guard of the sidebar-filter hookup (JiTA.dv._filterLink / _onLinkClick /
// _openLink) in turn and requires dv-check.js to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['other sites taken', "if (u.origin !== location.origin || ", "if ("],
    ['raw jql loses to the saved id', "if (jql) { return { jql: jql }; }", "/* mutated */"],
    ['modified clicks taken', "e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) { return; }", "e.defaultPrevented || e.button !== 0) { return; }"],
    ['already-handled clicks taken', "|| e.defaultPrevented || e.button !== 0 || e.ctrlKey", "|| e.button !== 0 || e.ctrlKey"],
    ['taken with no detail view', "if ((!D._mounted && !D._takeAll()) || e.defaultPrevented", "if (e.defaultPrevented"],
    ['own links re-handled', "if (a.closest('#jdv-bar, #jdv-col, #jdv-rail, .jdv-pop')) { return; }", "/* mutated */"],
    ['unknown system filters taken', "if (!link || (link.id && link.id.charAt(0) === '-' && !D.SYSTEM_FILTERS[link.id])) { return; }", "if (!link) { return; }"],
    ['Jira still sees the click', "e.stopPropagation();\n        D._openLink(", "D._openLink("],
    ['stale filter read wins', "if (seq === D._linkSeq) { D._take({ jql: f.jql", "if (true) { D._take({ jql: f.jql"],
    ['unreadable filter swallowed', "if (seq === D._linkSeq) { location.assign(href); }", "/* mutated */"],
    ['collapsed list stays shut', "if (D._collapsed()) { D._toggleCollapse(); }   // a filter was asked for", "/* mutated */   // a filter was asked for"],
    ['All work items taken', "        '-5': ['Open work items',", "        '-4': ['All work items', 'ORDER BY created DESC'],\n        '-5': ['Open work items',"],
    ['hook on the bubble phase', "window.addEventListener('click', D._onLinkClick, true);", "window.addEventListener('click', D._onLinkClick, false);"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutl.js', src.replace(a, b));
    let out = '', crashed = false;
    try { out = execSync('node dv-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutl.js' }), encoding: 'utf8' }); }
    catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || /^RED/m.test(out) || /harness crashed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing)' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync('mutl.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
