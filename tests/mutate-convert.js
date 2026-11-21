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
    [H, 'the button ignores the conversion', 'var key = jitaCurrentKey(), state = key ? jitaConvertBusy[key] : null;', 'var key = jitaCurrentKey(), state = null;'],
    [H, 'a put-back button is never set', "addActionButton('convertToDefectButton', 'Convert to Defect');\n    jitaConvertButtonState();", "addActionButton('convertToDefectButton', 'Convert to Defect');"],
    // ---- v3.38.16 ----
    [H, 'a non-SUCCESS answer is taken as started', "if (!inv || inv.status !== 'SUCCESS') { notConverted({ status: 0, jitaError: 'The conversion automation did not start", "if (false) { notConverted({ status: 0, jitaError: 'The conversion automation did not start"],
    [H, 'the reason a conversion failed is dropped', 'jitaAjaxError(xhr, xhr && xhr.jitaError);', 'jitaAjaxError(xhr);'],
    [H, "the defect poll follows the user to another issue", "                    if (jitaConvertBusy[ebrKey] === 'left' || jitaCurrentKey() !== ebrKey) { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); return; }\n", ""],
    [H, "a user who left during the links read is taken to the defect", "                    if (jitaConvertBusy[ebrKey] === 'left' || jitaCurrentKey() !== ebrKey) { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); return; }\n", "                    if (jitaConvertBusy[ebrKey] === 'left') { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); return; }\n"],
    [H, "a user back on the report after leaving is taken to the defect", "                    if (jitaConvertBusy[ebrKey] === 'left' || jitaCurrentKey() !== ebrKey) { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); return; }\n", "                    if (jitaCurrentKey() !== ebrKey) { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); return; }\n"],
    [H, "the poll stops once the user has left", "        if (jitaCurrentKey() !== ebrKey && jitaConvertBusy[ebrKey] === true) { jitaConvertBusy[ebrKey] = 'left'; }\n", "        if (jitaCurrentKey() !== ebrKey && jitaConvertBusy[ebrKey] === true) { jitaConvertBusy[ebrKey] = 'left'; return; }\n"],
    [H, "a defect made while away is not noted", "                    if (jitaConvertBusy[ebrKey] === 'left' || jitaCurrentKey() !== ebrKey) { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); return; }\n", "                    if (jitaConvertBusy[ebrKey] === 'left' || jitaCurrentKey() !== ebrKey) { return; }\n"],
    [H, 'the defect poll never gives up', '        if (tries >= 30) {\n            delete jitaConvertBusy[ebrKey];', '        if (false) {\n            delete jitaConvertBusy[ebrKey];'],
    // ---- v3.51.1: the new defect opened in-app, a poll that gives up shown without a reload ----
    [H, 'the new defect opened with a page load', "                    jitaOpenIssue(defect, function () { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); });\n", "                    window.location.href = '/browse/' + defect;\n"],
    // ---- the spinner, and a converted report (v3.51.1) ----
    [H, 'the report never counts as converted', 'jitaOpenIssue(defect, function () { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); });', 'jitaOpenIssue(defect, function () {});'],
    [H, 'a converted report\'s button not brought up to date', 'jitaOpenIssue(defect, function () { jitaConvertBusy[ebrKey] = defect; jitaConvertButtonState(); });', 'jitaOpenIssue(defect, function () { jitaConvertBusy[ebrKey] = defect; });'],
    [H, "a report left before its defect turned up spins on", "        if (jitaCurrentKey() !== ebrKey && jitaConvertBusy[ebrKey] === true) { jitaConvertBusy[ebrKey] = 'left'; }\n", ""],
    [H, 'no spinner', ".toggleClass('jita-converting', state === true)", ".toggleClass('jita-converting', false)"],
    [H, 'a converted report spins forever', ".toggleClass('jita-converting', state === true)", ".toggleClass('jita-converting', !!state)"],
    [H, 'a converted report\'s button works again', ".prop('disabled', !!state)", ".prop('disabled', state === true)"],
    [H, 'the button says nothing of the conversion', "        .attr('title', state === true ? 'Converting to a defect…'", "        .attr('title', null && state === true ? 'Converting to a defect…'"],
    [H, 'the spinner\'s style added on every call', '    if (jitaConvertCss.done) { return; }\n', ''],
    [H, 'the spinner never turns', 'animation: jita-convert-spin .8s linear infinite;', 'animation: none;'],
    [H, "a poll that gave up keeps the report busy", "            delete jitaConvertBusy[ebrKey];\n            jitaConvertButtonState();\n            if (jitaCurrentKey() === ebrKey) { jitaRefreshIssueView(); }   // not another issue the user has moved on to\n", "            jitaConvertButtonState();\n            if (jitaCurrentKey() === ebrKey) { jitaRefreshIssueView(); }   // not another issue the user has moved on to\n"],
    [H, "a poll that gave up leaves its button disabled", "            delete jitaConvertBusy[ebrKey];\n            jitaConvertButtonState();\n            if (jitaCurrentKey() === ebrKey) { jitaRefreshIssueView(); }   // not another issue the user has moved on to\n", "            delete jitaConvertBusy[ebrKey];\n            if (jitaCurrentKey() === ebrKey) { jitaRefreshIssueView(); }   // not another issue the user has moved on to\n"],
    [H, "a poll that gave up reloads the page", "            delete jitaConvertBusy[ebrKey];\n            jitaConvertButtonState();\n            if (jitaCurrentKey() === ebrKey) { jitaRefreshIssueView(); }   // not another issue the user has moved on to\n            JiTA.ui.toast('No new defect", "            delete jitaConvertBusy[ebrKey];\n            jitaConvertButtonState();\n            if (jitaCurrentKey() === ebrKey) { window.location.reload(false); }   // not another issue the user has moved on to\n            JiTA.ui.toast('No new defect"],
    [H, "a poll that gave up shows the report as it was", "            delete jitaConvertBusy[ebrKey];\n            jitaConvertButtonState();\n            if (jitaCurrentKey() === ebrKey) { jitaRefreshIssueView(); }   // not another issue the user has moved on to\n            JiTA.ui.toast('No new defect", "            delete jitaConvertBusy[ebrKey];\n            jitaConvertButtonState();\n            JiTA.ui.toast('No new defect"],
    [H, "a poll that gave up refreshes the issue the user moved on to", "            if (jitaCurrentKey() === ebrKey) { jitaRefreshIssueView(); }", "            jitaRefreshIssueView();"],
    [H, 'a poll that gave up goes unsaid', "            JiTA.ui.toast('No new defect showed up among ' + ebrKey + '\\'s links within 30 seconds. Check its links before converting it again.');\n", ''],
    [H, 'Close does not wait for the menu', '        setTimeout(pick, 100);\n    })();', '    })();'],
    [H, 'Close gives up without a word', "        if (Date.now() - t0 >= 3000) { alert('The Closed option did not appear", "        if (Date.now() - t0 >= 3000) { void ('The Closed option did not appear"],
    [H, 'the cloud id is not checked', "    if (!cloudId) { return $.Deferred().reject({ status: 0, jitaError: 'Could not read the Jira cloud id from the page - reload it and try again.' }).promise(); }\n", ''],
    [H, 'the button is not wired', "$(\"#convertToDefectButton\").off('click.jita').on('click.jita', jitaConvertClick);", "$(\"#convertToDefectButton\").off('click.jita');"],
    // ---- v3.51.0: an unassigned report is taken first, so its defect starts out with the one converting it ----
    [H, 'an unassigned report is converted untaken', "if (!flagStillOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(false); return; }", 'if (true) { then(false); return; }'],
    [H, 'a report someone has is taken', "if (!flagStillOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(false); return; }", "if (!flagStillOn('defectChecklist')) { then(false); return; }"],
    [H, 'taken with the checklist switched off', "if (!flagStillOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(false); return; }", 'if ((d && d.fields && d.fields.assignee)) { then(false); return; }'],
    [H, 'the assignee never read', "'?fields=issuelinks,assignee'", "'?fields=issuelinks'"],
    [H, 'a refused take stops the conversion', '            .done(function () { then(true); }).fail(function () { then(false); });', '            .done(function () { then(true); });'],
    [H, 'converted before the take lands', '            .done(function () { then(true); }).fail(function () { then(false); });', '            ;\n        then(true);'],
    [H, 'taken for nobody', 'data: JSON.stringify({ accountId: me }) })', 'data: JSON.stringify({}) })'],
    [H, 'the take without the token Jira wants', "headers: { 'X-Atlassian-Token': 'no-check' }, data: JSON.stringify({ accountId: me }) })", 'data: JSON.stringify({ accountId: me }) })'],
    [H, 'nothing converts without a user', 'if (!me) { then(false); return; }', 'if (!me) { return; }'],
    [H, 'nothing converts when the user cannot be read', '    }, function () { then(false); });\n}', '    });\n}'],
    // ---- a conversion that does not start gives a report it took back (review 2026-11-20 checklist-logic-5) ----
    [H, 'a failed conversion keeps the report it took', '                    if (!taken) { fail(xhr); return; }', '                    if (true) { fail(xhr); return; }'],
    [H, 'a report the take did not get is given back', '                    if (!taken) { fail(xhr); return; }', '                    if (false) { fail(xhr); return; }'],
    [H, 'a take Jira refused counts as taken', '.fail(function () { then(false); });', '.fail(function () { then(true); });'],
    [H, 'a failed automation call keeps the take', '                    .fail(notConverted);', '                    .fail(fail);'],
    [H, 'the failure is said before the report is given back', '                    jitaGiveBack(ebrKey).always(function () { fail(xhr); });', '                    jitaGiveBack(ebrKey); fail(xhr);'],
    [H, 'a give-back Jira refuses says nothing', '                    jitaGiveBack(ebrKey).always(function () { fail(xhr); });', '                    jitaGiveBack(ebrKey).done(function () { fail(xhr); });'],
    [H, 'given back to someone', "data: JSON.stringify({ accountId: null }) });\n}", "data: JSON.stringify({}) });\n}"],
    [H, 'the give-back without the token Jira wants', "headers: { 'X-Atlassian-Token': 'no-check' }, data: JSON.stringify({ accountId: null }) });", 'data: JSON.stringify({ accountId: null }) });'],
    [H, 'the give-back is a read', "    return $.ajax({ url: 'https://fenriscreations.atlassian.net/rest/api/3/issue/' + key + '/assignee', type: 'PUT',", "    return $.ajax({ url: 'https://fenriscreations.atlassian.net/rest/api/3/issue/' + key + '/assignee', type: 'GET',"],
    [H, "a report is taken though the checklist was turned off in another tab", "if (!flagStillOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(false); return; }", "if (!flagOn('defectChecklist') || (d && d.fields && d.fields.assignee)) { then(false); return; }"]
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
