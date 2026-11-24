// mutate-leftout.js - breaks each guard of the Vanguard and Launcher bug reports left out of Matching bug reports and
// Similar open reports, and of the GM team's no longer left out (v3.52.0), in turn, and requires leftout-check.js to
// go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'leftout-check.js', TMP = 'mutlo.js';
// isLeftOut is written once (jitaShared): the tab asks it with JiTA.LEFT_OUT, the worker with the cfg.LEFT_OUT it is handed.
const SHL = '    function isLeftOut(rec, names) {\n        function has(list, wanted) {\n            for (var i = 0; i < (list || []).length; i++) {\n';
const SAME = "                for (var j = 0; j < wanted.length; j++) { if (String(list[i]).toLowerCase() === wanted[j].toLowerCase()) { return true; } }";
const RET = 'return !!rec && (has(rec.labels, names.labels) || has(rec.components, names.components));';
const muts = [
    // ---- what is left out ----
    [H, 'the labels are ignored', RET, 'return !!rec && has(rec.components, names.components);'],
    [H, 'the components are ignored', RET, 'return !!rec && has(rec.labels, names.labels);'],
    [H, 'the case is minded', SHL + SAME, SHL + SAME.replace(/\.toLowerCase\(\)/g, '')],
    [H, 'a label that only starts the same is taken', SHL + SAME, SHL + SAME.replace('String(list[i]).toLowerCase() === wanted[j].toLowerCase()', 'String(list[i]).toLowerCase().indexOf(wanted[j].toLowerCase()) === 0')],
    [H, 'no report is taken for one with nothing', 'return !!rec && (has(rec.labels, names.labels)', 'return (has(rec.labels, names.labels)'],
    [H, 'the tab asks with names of its own', '    isLeftOut: function (rec) { return JITA_SH.isLeftOut(rec, JiTA.LEFT_OUT); },', "    isLeftOut: function (rec) { return JITA_SH.isLeftOut(rec, { labels: ['Vanguard'], components: ['Launcher'] }); },"],
    [H, 'the worker asks with names of its own', '    function leftOut(rec) { return SH.isLeftOut(rec, cfg.LEFT_OUT); }', "    function leftOut(rec) { return SH.isLeftOut(rec, { labels: ['Launcher'], components: ['Launcher'] }); }"],
    [H, 'the worker leaves nothing out', '    function leftOut(rec) { return SH.isLeftOut(rec, cfg.LEFT_OUT); }', '    function leftOut(rec) { return false; }'],
    [H, 'Vanguard no longer named', "    LEFT_OUT: { labels: ['Vanguard', 'Launcher'], components: ['Launcher'] },", "    LEFT_OUT: { labels: ['Launcher'], components: ['Launcher'] },"],
    [H, 'the Launcher component no longer named', "    LEFT_OUT: { labels: ['Vanguard', 'Launcher'], components: ['Launcher'] },", "    LEFT_OUT: { labels: ['Vanguard', 'Launcher'], components: [] },"],
    [H, 'the worker is not handed the names', ' GM_TEAM_ID: JiTA.GM_TEAM_ID, LEFT_OUT: JiTA.LEFT_OUT,', ' GM_TEAM_ID: JiTA.GM_TEAM_ID,'],
    // ---- the sync ----
    [H, 'the sync asks for no labels', "'created', 'components', 'labels', 'updated', 'project'],", "'created', 'components', 'updated', 'project'],"],
    [H, 'the sync asks for the Team field again', "'created', 'components', 'labels', 'updated', 'project'],", "'created', 'components', 'labels', 'updated', 'project', 'customfield_10001'],"],
    [H, 'a report stored without its labels', '            labels: labels,                              // Vanguard and Launcher reports are left out (JiTA.util.isLeftOut)\n', ''],
    [H, 'a report stored with a team again', '            labels: labels,                              // Vanguard', '            labels: labels, team: \'\',                              // Vanguard'],
    // ---- where it applies ----
    [H, 'the tab\'s bug report index keeps them', ' && !JiTA.util.isClosedStatus(rec.status) && !JiTA.util.isLeftOut(rec); });', ' && !JiTA.util.isClosedStatus(rec.status); });'],
    [H, 'the tab\'s bug report index leaves out the GM team\'s again', ' && !JiTA.util.isLeftOut(rec); });', " && !JiTA.util.isLeftOut(rec) && !/-38$/.test(rec.team || ''); });"],
    [H, 'the gate leaves out the GM team\'s again', "        if (scope === 'ebr' && JiTA.util.isClosedStatus(d.status)) { continue; }", "        if (scope === 'ebr' && (JiTA.util.isClosedStatus(d.status) || /-38$/.test(d.team || ''))) { continue; }"],
    [H, 'the gate lets a closed report through', "        if (scope === 'ebr' && JiTA.util.isClosedStatus(d.status)) { continue; }", "        if (false) { continue; }"],
    [H, 'the translate pass translates them', 'if (JiTA.util.isClosedStatus(r.status) || JiTA.util.isLeftOut(r)) { continue; }  // not ranked -> skip', 'if (JiTA.util.isClosedStatus(r.status)) { continue; }  // not ranked -> skip'],
    [H, 'the worker\'s indexes keep them', "        function ranked(r) { return r.project !== 'EBR' || !(SH.isClosedStatus(r.status) || leftOut(r)); }", "        function ranked(r) { return r.project !== 'EBR' || !SH.isClosedStatus(r.status); }"],
    [H, 'the worker\'s indexes leave out a defect in the Launcher component', "        function ranked(r) { return r.project !== 'EBR' || !(SH.isClosedStatus(r.status) || leftOut(r)); }", "        function ranked(r) { return !leftOut(r) && (r.project !== 'EBR' || !SH.isClosedStatus(r.status)); }"],
    [H, 'the worker\'s keyword index of bug reports takes every one', "            ebr: SH.keywordIndex(recs, function (r) { return r.project === 'EBR' && ranked(r); })", "            ebr: SH.keywordIndex(recs, function (r) { return r.project === 'EBR'; })"],
    [H, 'the embed pass embeds them', "            if (r.project === 'EBR' && (SH.isClosedStatus(r.status) || leftOut(r))) { continue; }", "            if (r.project === 'EBR' && SH.isClosedStatus(r.status)) { continue; }"],
    // ---- the count on the status line (v3.52.1) ----
    [H, 'the worker\'s query tells no index size', '        return { indexed: idx.N, results: SH.bm25Score(', '        return { results: SH.bm25Score('],
    [H, 'the count is of every report stored', "            ? JiTA.worker.call('rankKeyword', { text: '', scope: 'ebr', topN: 1 }).then(function (r) {", "            ? JiTA.db.countEbr().then(function (n) { return { indexed: n }; }).then(function (r) {"],
    [H, 'a worker giving no size is believed', "                if (!r || typeof r.indexed !== 'number') { throw new Error('no index size'); }\n", ''],
    [H, 'a failing worker leaves no count', '            }).catch(local)\n            : local();', '            })\n            : local();'],
    [H, 'the worker asked when there is none', '        var p = (JiTA.worker && JiTA.worker.usable())\n', '        var p = (JiTA.worker)\n'],
    [H, 'no count when both fail', "        return p.catch(function () { return JiTA.db.countEbr(); });", '        return p;'],
    [H, '...when it finds none, too', "JiTA.ui.setStatus('No matching bug reports found (' + open + ' open).');", "JiTA.ui.setStatus('No matching bug reports found (' + n + ' open).');"],,
    [H, "the status line stays up with nothing to say", "#jita-sd-status:empty, #jita-side-group #jita-sd-status:empty { display: none; }\\\n", ""]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync(TMP, src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: TMP }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|^  FAIL  /m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE|CRASH/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync(TMP);
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
