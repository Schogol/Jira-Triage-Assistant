// mutate-attach.js - breaks each guard of the attach targets (v3.38.4) and requires attach-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'attach-check.js';
const CATCH = "}).catch(function (e) { if (stale()) { return; } JiTA.ui.setStatusAction('Error: ' + (e && e.message || e), 'Retry', function () { JiTA.ui._rerenderCurrent(); }); });\n    },\n\n";
const CATCH0 = "}).catch(function (e) { JiTA.ui.setStatusAction('Error: ' + (e && e.message || e), 'Retry', function () { JiTA.ui._rerenderCurrent(); }); });\n    },\n\n";
const muts = [
    // ---- the backstop ----
    [H, 'any pair can be attached', "if (!/^EBR-\\d+$/.test(String(ebrKey || '')) || !/^(EDR|EO|PLAT)-\\d+$/.test(String(otherKey || ''))) {", 'if (false) {'],
    [H, 'the transitioned issue is not checked', "!/^EBR-\\d+$/.test(String(ebrKey || '')) || ", ''],
    [H, 'the target is not checked', " || !/^(EDR|EO|PLAT)-\\d+$/.test(String(otherKey || ''))", ''],
    // ---- render(): each step's check ----
    [H, 'render never goes stale', 'var stale = function () { return JiTA.ui.currentKey !== key || JiTA.ui.reporterMode || JiTA.ui.simReportsMode || JiTA.ui.trendMode; };',
        'var stale = function () { return false; };'],
    [H, 'render ignores a switch of the funnel view', 'var stale = function () { return JiTA.ui.currentKey !== key || JiTA.ui.reporterMode || JiTA.ui.simReportsMode || JiTA.ui.trendMode; };',
        'var stale = function () { return JiTA.ui.currentKey !== key; };'],
    [H, 'render counts the DB for an issue left behind', '        JiTA.ui.getIssueText(key).then(function (text) {\n            if (stale()) { return; }\n            return JiTA.db.countDefectsOnly()',
        '        JiTA.ui.getIssueText(key).then(function (text) {\n            return JiTA.db.countDefectsOnly()'],
    [H, 'render ranks for an issue left behind', 'return JiTA.db.countDefectsOnly().then(function (n) {\n                if (stale()) { return; }', 'return JiTA.db.countDefectsOnly().then(function (n) {'],
    [H, 'render paints the mode and count for an issue left behind', 'JiTA.ui.modeOverride, terms, undefined, got[1]).then(function (out) {\n                    if (stale()) { return; }\n                    var results = out.results || [];\n                    $(\'#jita-sd-mode\').text(out.mode);   // \'Hybrid\' or \'Keyword\'\n                    if (!results.length) { $(\'#jita-sd-list\').empty(); JiTA.ui.setStatus(\'No similar defects',
        'JiTA.ui.modeOverride, terms, undefined, got[1]).then(function (out) {\n                    var results = out.results || [];\n                    $(\'#jita-sd-mode\').text(out.mode);   // \'Hybrid\' or \'Keyword\'\n                    if (!results.length) { $(\'#jita-sd-list\').empty(); JiTA.ui.setStatus(\'No similar defects'],
    [H, 'render paints rows for an issue left behind', "                        if (stale()) { return; }\n                        var $list = $('#jita-sd-list');\n                        $list.empty();   // clear atomically right before filling: a concurrent re-render",
        "                        var $list = $('#jita-sd-list');\n                        $list.empty();   // clear atomically right before filling: a concurrent re-render"],
    [H, 'render shows an error for an issue left behind', CATCH + '    // EDR (defect) view', CATCH0 + '    // EDR (defect) view'],
    // ---- renderReports(): each step's check ----
    [H, 'renderReports never goes stale', 'var stale = function () { return JiTA.ui.currentKey !== key; };', 'var stale = function () { return false; };'],
    [H, "renderReports counts for an issue left behind", "var stale = function () { return JiTA.ui.currentKey !== key; };\n        JiTA.ui.getIssueText(key).then(function (text) {\n            if (stale()) { return; }\n            return JiTA.db.countEbr().then(function (n) {", "var stale = function () { return JiTA.ui.currentKey !== key; };\n        JiTA.ui.getIssueText(key).then(function (text) {\n            return JiTA.db.countEbr().then(function (n) {"],
    [H, "renderReports ranks for an issue left behind", "                if (stale()) { return; }\n                if (!n) {\n                    JiTA.ui.setStatusAction('No bug reports synced yet.', 'Sync bug reports now', function () { JiTA.sync.syncAllNow(); });\n                    return;\n                }\n                if (!text) { JiTA.ui.setStatus('Could not read this defect’s text.'); return; }", "                if (!n) {\n                    JiTA.ui.setStatusAction('No bug reports synced yet.', 'Sync bug reports now', function () { JiTA.sync.syncAllNow(); });\n                    return;\n                }\n                if (!text) { JiTA.ui.setStatus('Could not read this defect’s text.'); return; }"],
    [H, 'renderReports reads rows for an issue left behind', "JiTA.rank.ebrPool()]).then(function (got) {\n                    var out = got[0], open = got[1];\n                    if (stale()) { return; }",
        "JiTA.rank.ebrPool()]).then(function (got) {\n                    var out = got[0], open = got[1];"],
    [H, 'renderReports draws rows for an issue left behind', "                        if (stale()) { return; }\n                        var $list = $('#jita-sd-list');\n                        $list.empty();   // clear atomically right before filling (see render() - avoids doubled rows from a concurrent re-render)\n                        for (var i = 0; i < results.length; i++) { $list.append(JiTA.ui._reportItem(",
        "                        var $list = $('#jita-sd-list');\n                        $list.empty();   // clear atomically right before filling (see render() - avoids doubled rows from a concurrent re-render)\n                        for (var i = 0; i < results.length; i++) { $list.append(JiTA.ui._reportItem("],
    [H, 'renderReports shows an error for an issue left behind', CATCH + '    // EBR view, "reporter', CATCH0 + '    // EBR view, "reporter'],
    // ---- the reporter's reports and the similar open reports: nothing late for the issue left behind ----
    [H, "the reporter view ignores a switch of the funnel view", "var stale = function () { return JiTA.ui.currentKey !== key || !JiTA.ui.reporterMode; };", "var stale = function () { return JiTA.ui.currentKey !== key; };"],
    [H, "the reporter view shows a late error", "        }).catch(function (e) {\n            if (stale()) { return; }\n            JiTA.ui.setStatusAction('Error: ' + (e && e.message || e), 'Retry', function () { JiTA.ui._rerenderCurrent(); });\n        });\n    },\n\n    // EBR view, \"similar open reports\"", "        }).catch(function (e) {\n            JiTA.ui.setStatusAction('Error: ' + (e && e.message || e), 'Retry', function () { JiTA.ui._rerenderCurrent(); });\n        });\n    },\n\n    // EBR view, \"similar open reports\""],
    [H, "the similar reports ignore a switch of the funnel view", "var stale = function () { return JiTA.ui.currentKey !== key || !JiTA.ui.simReportsMode; };", "var stale = function () { return JiTA.ui.currentKey !== key; };"],
    [H, "the similar reports show a late error", "        }).catch(function (e) {\n            if (stale()) { return; }\n            JiTA.ui.setStatusAction('Error: ' + (e && e.message || e), 'Retry', function () { JiTA.ui._rerenderCurrent(); });\n        });\n    },\n\n    // EBR view, \"trending defects\"", "        }).catch(function (e) {\n            JiTA.ui.setStatusAction('Error: ' + (e && e.message || e), 'Retry', function () { JiTA.ui._rerenderCurrent(); });\n        });\n    },\n\n    // EBR view, \"trending defects\""],
    [H, "the similar reports paint a late empty state", "                if (stale()) { return; }\n                if (!n) {\n                    JiTA.ui.setStatusAction('No bug reports synced yet.', 'Sync bug reports now', function () { JiTA.sync.syncAllNow(); });\n                    return;\n                }\n                if (!text) { JiTA.ui.setStatus('Could not read this report’s text.'); return; }", "                if (!n) {\n                    JiTA.ui.setStatusAction('No bug reports synced yet.', 'Sync bug reports now', function () { JiTA.sync.syncAllNow(); });\n                    return;\n                }\n                if (!text) { JiTA.ui.setStatus('Could not read this report’s text.'); return; }"],
    // ---- the two Attach buttons ----
    [H, 'a defect row attaches whatever report is on screen', '            var ebr = forKey;', '            var ebr = JiTA.ui.currentKey;'],
    [H, 'a defect row drawn for another report still attaches', 'if (JiTA.ui.currentKey !== ebr) { JiTA.ui.toast(', 'if (false) { JiTA.ui.toast('],
    [H, 'a report row drawn for another defect still attaches', 'if (!still()) { JiTA.ui.toast(', 'if (false) { JiTA.ui.toast('],
    [H, "a redraw from elsewhere draws an issue no longer on screen", "            if (!k || jitaCurrentKey() !== k) { return; }", "            if (!k) { return; }"],
    [H, "a count line comes back above the similar defects", "' indexed).'); return; }   // clear a stale list if a refresh now finds nothing\n                    JiTA.ui.setStatus('');", "' indexed).'); return; }   // clear a stale list if a refresh now finds nothing\n                    JiTA.ui.setStatus(results.length + ' suggestions · ' + out.mode);"],
    [H, "a count line comes back above the matching reports", "' open).'); return; }   // clear a stale list if a refresh now finds nothing\n                    JiTA.ui.setStatus('');", "' open).'); return; }   // clear a stale list if a refresh now finds nothing\n                    JiTA.ui.setStatus(results.length + ' matches · ' + out.mode);"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('muta.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'muta.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('muta.js')) { fs.unlinkSync('muta.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
