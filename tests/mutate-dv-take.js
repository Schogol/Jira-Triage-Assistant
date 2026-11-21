// mutate-dv-take.js - breaks each guard of "Open filters in the detail view" (JiTA.dv._takeAll / _take and the
// hook bound at page load) in turn and requires dv-check.js to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['option never takes a click', "if ((!D._mounted && !D._takeAll()) || e.defaultPrevented", "if (!D._mounted || e.defaultPrevented"],
    ['option off by default', "!!gmGet(JiTA.dv.TAKE_KEY, true)", "!!gmGet(JiTA.dv.TAKE_KEY, false)"],
    ['option ignores its setting', "flagOn('detailView') && JiTA.dv._takeOn(); }", "flagOn('detailView'); }"],
    ['option outlives the detail view', "!JITA_NO_JIRA_UI && flagOn('detailView') && JiTA.dv._takeOn()", "!JITA_NO_JIRA_UI && JiTA.dv._takeOn()"],
    ["on-page path runs the off-page one", "        if (D._mounted) { D._useFilter(f, at.key); return; }\n", ""],
    ["the filter is loaded for the issue open when its answer came", "if (D._mounted) { D._useFilter(f, at.key); return; }", "if (D._mounted) { D._useFilter(f); return; }"],
    // 'old issue sought in the new list' (dropping D._activeKey = null in _take) is an equivalent mutant since v3.33.0:
    // a filter pick runs as an edit, which never seeks the issue already open. mutate-dv-edit.js 'filter pick seeks' pins it.
    ['nothing opened', "            D._nav(first.key);\n", ""],
    ['opened without its highlight', "            D._activeKey = first.key;   // _nav records", "            //"],
    ['empty filter swallowed', "if (!first) { location.assign(href); return; }", "if (!first) { return; }"],
    ["older click still opens", "if (seq !== D._linkSeq || D._mounted || D._here() !== at.where) { return; }", "if (D._mounted || D._here() !== at.where) { return; }"],
    ["user yanked off their issue", "if (seq !== D._linkSeq || D._mounted || D._here() !== at.where) { return; }", "if (seq !== D._linkSeq || D._mounted) { return; }"],
    ["only a move to an issue counts as moving on", "if (seq !== D._linkSeq || D._mounted || D._here() !== at.where) { return; }", "if (seq !== D._linkSeq || D._mounted || D._locKey() !== at.key) { return; }"],
    ["a click from an issue page the view never mounted on is taken as a move of their own", "if (seq !== D._linkSeq || D._mounted || D._here() !== at.where) { return; }", "if (seq !== D._linkSeq || D._mounted || D._locKey()) { return; }"],
    ["the page the click came from is read when the filter answers", "var D = JiTA.dv, seq = ++D._linkSeq, at = { key: D._locKey(), where: D._here() };", "var D = JiTA.dv, seq = ++D._linkSeq, at = null;"],
    ["a saved filter is taken without where the click was", "if (seq === D._linkSeq) { D._take({ jql: f.jql, name: f.name || name, id: (f.id != null) ? f.id : link.id }, href, seq, at); }", "if (seq === D._linkSeq) { D._take({ jql: f.jql, name: f.name || name, id: (f.id != null) ? f.id : link.id }, href, seq); }"],
    ["the page is named by its path alone", "_here: function () { return String(location.pathname || '') + String(location.search || ''); },", "_here: function () { return String(location.pathname || '').split('/').slice(0, 2).join('/'); },"],
    ['toast after a fast load', "            clearTimeout(slow);\n", ""],
    ['toast never shown', "}, D.TAKE_TOAST_MS);", "}, 1e9);"],
    ['hook only bound on mount', "    try { JiTA.dv._bindGlobal(); } catch (eDv) { JiTA.caught('dv._bindGlobal', eDv); }", "    /* mutated */"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, b));
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
