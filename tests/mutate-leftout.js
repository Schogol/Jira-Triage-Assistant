// mutate-leftout.js - breaks each guard of the Vanguard and Launcher bug reports left out of Matching bug reports and
// Similar open reports, and of the GM team's no longer left out (v3.52.0), in turn, and requires leftout-check.js to
// go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'leftout-check.js', TMP = 'mutlo.js';
const TAB = '    isLeftOut: function (rec) {\n        function has(list, names) {\n            for (var i = 0; i < (list || []).length; i++) {\n';
const WK = '    function leftOut(rec) {\n        function has(list, names) {\n            for (var i = 0; i < (list || []).length; i++) {\n';
const SAME = "                for (var j = 0; j < names.length; j++) { if (String(list[i]).toLowerCase() === names[j].toLowerCase()) { return true; } }";
const muts = [
    // ---- what is left out ----
    [H, 'the tab ignores the labels', 'return !!rec && (has(rec.labels, JiTA.LEFT_OUT.labels) || has(rec.components, JiTA.LEFT_OUT.components));', 'return !!rec && has(rec.components, JiTA.LEFT_OUT.components);'],
    [H, 'the tab ignores the components', 'return !!rec && (has(rec.labels, JiTA.LEFT_OUT.labels) || has(rec.components, JiTA.LEFT_OUT.components));', 'return !!rec && has(rec.labels, JiTA.LEFT_OUT.labels);'],
    [H, 'the tab minds the case', TAB + SAME, TAB + SAME.replace(/\.toLowerCase\(\)/g, '')],
    [H, 'the tab takes a label that only starts the same', TAB + SAME, TAB + SAME.replace('String(list[i]).toLowerCase() === names[j].toLowerCase()', 'String(list[i]).toLowerCase().indexOf(names[j].toLowerCase()) === 0')],
    [H, 'the tab takes no report for one with nothing', 'return !!rec && (has(rec.labels, JiTA.LEFT_OUT.labels)', 'return (has(rec.labels, JiTA.LEFT_OUT.labels)'],
    [H, 'the worker ignores the labels', 'return !!rec && (has(rec.labels, cfg.LEFT_OUT.labels) || has(rec.components, cfg.LEFT_OUT.components));', 'return !!rec && has(rec.components, cfg.LEFT_OUT.components);'],
    [H, 'the worker ignores the components', 'return !!rec && (has(rec.labels, cfg.LEFT_OUT.labels) || has(rec.components, cfg.LEFT_OUT.components));', 'return !!rec && has(rec.labels, cfg.LEFT_OUT.labels);'],
    [H, 'the worker minds the case', WK + SAME, WK + SAME.replace(/\.toLowerCase\(\)/g, '')],
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
    [H, 'the worker\'s indexes keep them', '            if (isEbr && (isClosedStatus(r.status) || leftOut(r))) { continue; }', '            if (isEbr && isClosedStatus(r.status)) { continue; }'],
    [H, 'the worker\'s indexes leave out a defect in the Launcher component', '            if (isEbr && (isClosedStatus(r.status) || leftOut(r))) { continue; }', '            if ((isEbr && isClosedStatus(r.status)) || leftOut(r)) { continue; }'],
    [H, 'the embed pass embeds them', "            if (r.project === 'EBR' && (isClosedStatus(r.status) || leftOut(r))) { continue; }", "            if (r.project === 'EBR' && isClosedStatus(r.status)) { continue; }"]
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
