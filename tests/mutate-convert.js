// mutate-convert.js - breaks each guard of Convert to Defect's once-per-report rule (v3.38.10) and requires
// convert-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'convert-check.js';
const muts = [
    [H, 'a busy report converts again', 'if (!ebrKey || jitaConvertBusy[ebrKey]) { return; }', 'if (!ebrKey) { return; }'],
    [H, 'the report is never marked busy', '    jitaConvertBusy[ebrKey] = true;\n', ''],
    [H, 'a failure keeps the report busy', '        delete jitaConvertBusy[ebrKey];\n        jitaConvertButtonState();   // whichever button', '        jitaConvertButtonState();   // whichever button'],
    [H, 'a failure leaves the button disabled', '        jitaConvertButtonState();   // whichever button is on the page now', '        void 0;   // whichever button is on the page now'],
    [H, 'the button ignores the conversion', "$('#convertToDefectButton').prop('disabled', !!(key && jitaConvertBusy[key]));", "$('#convertToDefectButton').prop('disabled', false);"],
    [H, 'a put-back button is never set', "addActionButton('convertToDefectButton', 'Convert to Defect');\n    jitaConvertButtonState();", "addActionButton('convertToDefectButton', 'Convert to Defect');"],
    // ---- v3.38.16 ----
    [H, 'a non-SUCCESS answer is taken as started', "if (!inv || inv.status !== 'SUCCESS') { fail({ status: 0, jitaError: 'The conversion automation did not start", "if (false) { fail({ status: 0, jitaError: 'The conversion automation did not start"],
    [H, 'the reason a conversion failed is dropped', 'jitaAjaxError(xhr, xhr && xhr.jitaError);', 'jitaAjaxError(xhr);'],
    [H, 'the defect poll follows the user to another issue', '        if (jitaCurrentKey() !== ebrKey) { return; }\n', ''],
    [H, 'the defect poll never gives up', '        if (tries >= 30) {\n            delete jitaConvertBusy[ebrKey];', '        if (false) {\n            delete jitaConvertBusy[ebrKey];'],
    // ---- v3.51.1: the new defect opened in-app, a poll that gives up shown without a reload ----
    [H, 'the new defect opened with a page load', '                    jitaOpenIssue(defect);\n', "                    window.location.href = '/browse/' + defect;\n"],
    [H, 'the new defect opens unannounced', "                    JiTA.ui.toast('Opening the new defect ' + defect + '…');   // the report stays on screen until it has loaded\n", ''],
    [H, 'a poll that gave up keeps the report busy', '            delete jitaConvertBusy[ebrKey];\n            jitaConvertButtonState();\n            jitaRefreshIssueView();', '            jitaConvertButtonState();\n            jitaRefreshIssueView();'],
    [H, 'a poll that gave up leaves its button disabled', '            jitaConvertButtonState();\n            jitaRefreshIssueView();', '            jitaRefreshIssueView();'],
    [H, 'a poll that gave up reloads the page', "            jitaRefreshIssueView();\n            JiTA.ui.toast('No new defect", "            window.location.reload(false);\n            JiTA.ui.toast('No new defect"],
    [H, 'a poll that gave up shows the report as it was', "            jitaRefreshIssueView();\n            JiTA.ui.toast('No new defect", "            JiTA.ui.toast('No new defect"],
    [H, 'a poll that gave up goes unsaid', "            JiTA.ui.toast('No new defect showed up among ' + ebrKey + '\\'s links within 30 seconds. Check its links before converting it again.');\n", ''],
    [H, 'Close does not wait for the menu', '        setTimeout(pick, 100);\n    })();', '    })();'],
    [H, 'Close gives up without a word', "        if (Date.now() - t0 >= 3000) { alert('The Closed option did not appear", "        if (Date.now() - t0 >= 3000) { void ('The Closed option did not appear"],
    [H, 'the cloud id is not checked', "    if (!cloudId) { return $.Deferred().reject({ status: 0, jitaError: 'Could not read the Jira cloud id from the page - reload it and try again.' }).promise(); }\n", ''],
    [H, 'the button is not wired', "$(\"#convertToDefectButton\").off('click.jita').on('click.jita', jitaConvertClick);", "$(\"#convertToDefectButton\").off('click.jita');"],
    // ---- v3.51.0: an unassigned report is taken first, so its defect starts out with the one converting it ----
    [H, 'an unassigned report is converted untaken', "if (!flagOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(); return; }", 'if (true) { then(); return; }'],
    [H, 'a report someone has is taken', "if (!flagOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(); return; }", "if (!flagOn('defectChecklist')) { then(); return; }"],
    [H, 'taken with the checklist switched off', "if (!flagOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(); return; }", 'if ((d && d.fields && d.fields.assignee)) { then(); return; }'],
    [H, 'the assignee never read', "'?fields=issuelinks,assignee'", "'?fields=issuelinks'"],
    [H, 'a refused take stops the conversion', '            .always(function () { then(); });', '            .done(function () { then(); });'],
    [H, 'converted before the take lands', '            .always(function () { then(); });', '            ;\n        then();'],
    [H, 'taken for nobody', 'data: JSON.stringify({ accountId: me }) })', 'data: JSON.stringify({}) })'],
    [H, 'the take without the token Jira wants', "headers: { 'X-Atlassian-Token': 'no-check' }, data: JSON.stringify({ accountId: me }) })", 'data: JSON.stringify({ accountId: me }) })'],
    [H, 'nothing converts without a user', 'if (!me) { then(); return; }', 'if (!me) { return; }'],
    [H, 'nothing converts when the user cannot be read', '    }, function () { then(); });\n}', '    });\n}']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutd.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutd.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutd.js')) { fs.unlinkSync('mutd.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
