// mutate-panelattach.js - breaks each panel / Attach fix (v3.38.28) and requires panelattach-check to go red. A
// crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'panelattach-check.js';
const muts = [
    [H, 'a refused transition drops Jira\'s reason', "        return new Error(what + ' failed (HTTP ' + st + ')' + (m.length ? ': ' + m.join(' ') : (st === 403 ? ' - no permission?' : '')));",
        "        return new Error(what + ' failed (HTTP ' + st + ')');"],
    [H, 'field errors are left out', "        if (j && j.errors) { for (var k in j.errors) { if (Object.prototype.hasOwnProperty.call(j.errors, k)) { m.push(j.errors[k]); } } }\n", ''],
    [H, 'a guessed link type is stored for good', "                    if (info) { gmSet('sdDupLink_v2', info); }\n                    else { info = { name: 'Duplicate', ebrSide: 'outward' }; }   // sensible default, for this session",
        "                    if (!info) { info = { name: 'Duplicate', ebrSide: 'outward' }; }\n                    gmSet('sdDupLink_v2', info);"],
    [H, 'a failed read of the link types is a guess', "                .fail(function (xhr) { reject(JiTA.link._why('reading the issue link types', xhr)); });", "                .fail(function () { resolve({ name: 'Duplicate', ebrSide: 'outward' }); });"],
    [H, 'the assignee is not asked again', '                delete JiTA.ui._assigneeCache[reportKey];\n', ''],
    [H, 'a report taken meanwhile is attached anyway', '                    if (taken && !opts.anyAssignee) {', '                    if (false) {'],
    [H, 'a local cleanup failure is an attach failure', "                            JiTA.db.deleteDefects([reportKey]).then(function () {\n                                JiTA.sync._ebrRemoved([reportKey]);   // rebuild indexes + drop the worker's stale EBR vectors + tell other tabs\n                            }, function (e) { JiTA.log('[JiTA] could not drop ' + reportKey + ' from the local DB:', e && e.message || e); })\n                                .then(function () { if (opts.done) { opts.done(reportKey); } else { JiTA.ui._fadeOutAndReplace($b.closest('li'), defectKey); } });",
        "                            return JiTA.db.deleteDefects([reportKey]).then(function () {\n                                JiTA.sync._ebrRemoved([reportKey]);\n                                JiTA.ui._fadeOutAndReplace($b.closest('li'), defectKey);\n                            });"],
    [H, 'the report-side cleanup failure is unhandled', "                }, function (e) { JiTA.log('[JiTA] could not drop ' + ebr + ' from the local DB:', e && e.message || e); });", '                });'],
    // ---- Jira shows an attach without a reload (v3.51.1) ----
    [H, 'the report-side Attach patches the status instead of asking Jira', "                jitaShowWritten(ebr, function () { return jitaStatusText() !== was; }, function () { JiTA.ui.softRefreshStatus('Attached'); });",
        "                JiTA.ui.softRefreshStatus('Attached');"],
    [H, 'a report Jira never shows Attached is left unpatched', "                jitaShowWritten(ebr, function () { return jitaStatusText() !== was; }, function () { JiTA.ui.softRefreshStatus('Attached'); });",
        '                jitaShowWritten(ebr, function () { return jitaStatusText() !== was; }, function () {});'],
    [H, 'the report\'s status counted as shown at once', "                jitaShowWritten(ebr, function () { return jitaStatusText() !== was; }, function () { JiTA.ui.softRefreshStatus('Attached'); });",
        "                jitaShowWritten(ebr, function () { return true; }, function () { JiTA.ui.softRefreshStatus('Attached'); });"],
    [H, 'the report\'s status compared with nothing', '                var was = jitaStatusText();\n                jitaShowWritten(ebr,', "                var was = '';\n                jitaShowWritten(ebr,"],
    [H, 'a link alone is not shown', '                jitaRefreshIssueView();   // the link alone\n', ''],
    [H, 'the defect side does not show its new link', "                        if (res.linked && jitaCurrentKey() === defectKey) { jitaRefreshIssueView(); }   // the defect's own Linked work items\n", ''],
    [H, 'a failed translation is cached', "                        if (out && out.en) { JiTA.ui._qtx = { key: key, text: out.en }; return out.en; }\n                        return t;",
        "                        var en = (out && out.en) ? out.en : t;\n                        JiTA.ui._qtx = { key: key, text: en };\n                        return en;"],
    [H, 'an attachment fetch reads an error page as a log', "onload: function (r) { resolve((r.status >= 200 && r.status < 300) ? (r.responseText || '') : null); },",
        "onload: function (r) { resolve(r.responseText || ''); },"],
    [H, 'a failed attachment fetch passes for an empty log', "onload: function (r) { resolve((r.status >= 200 && r.status < 300) ? (r.responseText || '') : null); },",
        "onload: function (r) { resolve((r.status >= 200 && r.status < 300) ? (r.responseText || '') : ''); },"],
    [H, 'an attachment fetch never gives up', "                    method: 'GET', url: url, timeout: 60000,\n", "                    method: 'GET', url: url,\n"],
    [H, 'a timed-out attachment fetch hangs the scan', "                    ontimeout: function () { resolve(null); }\n", "                    ontimeout: function () { }\n"],
    [H, 'a failed attachment fetch hangs the scan', "                    onerror: function () { resolve(null); },\n", "                    onerror: function () { },\n"],
    // ---- a log that did not download leaves the scan incomplete (review 2026-11-20 boost-logic-4) ----
    [H, 'a log not read counts as read', '                            if (txt === null) { failed++; mergeFound({}); return; }   // not read: the scan is not complete\n', ''],
    [H, 'an incomplete scan is kept as complete', "if (failed) { Object.defineProperty(merged, '_partial', { value: true }); } else { JiTA.ui._logExc[key] = exc; }", 'JiTA.ui._logExc[key] = exc;'],
    [H, 'an incomplete scan is kept for the session', 'p.then(function (m) { if (m && m._partial) { drop(); } }, drop);', 'p.then(null, drop);'],
    [H, 'two renders scan the logs twice', '        if (cache[key]) { return cache[key]; }\n', ''],
    [H, 'a failed scan is kept', 'p.then(function (m) { if (m && m._partial) { drop(); } }, drop);', 'p.then(function (m) { if (m && m._partial) { drop(); } });'],
    [H, "the report-side Attach links a closed report", "if (Object.prototype.hasOwnProperty.call(st, ebr) && !JiTA.ui._isOpenStatus(st[ebr])) {", "if (false) {"],
    [H, "the report-side Attach skips the status read", "            JiTA.ui._statusNow(ebr).then(function (st) {", "            Promise.resolve({}).then(function (st) {"],
    [H, "a refused report-side Attach keeps its button", "if ($btn.hasClass('jita-sd-linked') || $btn.hasClass('jita-sd-linking') || $btn.hasClass('jita-sd-noattach')) { return; }", "if ($btn.hasClass('jita-sd-linked') || $btn.hasClass('jita-sd-linking')) { return; }"],
    [H, "the other rows keep offering a linked report", "                $('#jita-sd-list .jita-sd-link, #jita-sd-loglink .jita-sd-link').not('.jita-sd-linked').addClass('jita-sd-noattach')", "                $('#jita-sd-list .jita-sd-link, #jita-sd-loglink .jita-sd-link').not('.jita-sd-linked')"],
    [H, "the linking row marks itself too", "$('#jita-sd-list .jita-sd-link, #jita-sd-loglink .jita-sd-link').not('.jita-sd-linked')", "$('#jita-sd-list .jita-sd-link, #jita-sd-loglink .jita-sd-link')"],
    [H, "an assignee answer is kept for the tab's life", "Object.prototype.hasOwnProperty.call(U._assigneeCache, key) && Date.now() - (U._assigneeAt[key] || 0) < U.ASSIGNEE_MS", "Object.prototype.hasOwnProperty.call(U._assigneeCache, key)"],
    [H, "an assignee answer is never kept", "Object.prototype.hasOwnProperty.call(U._assigneeCache, key) && Date.now() - (U._assigneeAt[key] || 0) < U.ASSIGNEE_MS", "false"],
    [H, "an assignee answer is not timed", "                        U._assigneeAt[key] = Date.now();\n", ""],
    [H, 'an unreadable reporter ID is "none"', "                            reject(new Error('could not read the Original Reporter ID (HTTP ' + xhr.status + ')'));", "                            resolve('');"],
    [H, 'the closed-report rule misses the list again', '#jita-sd-list li.jita-sd-closed { opacity: .6; }', '.jita-sd-list li.jita-sd-closed { opacity: .6; }']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutf.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutf.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutf.js')) { fs.unlinkSync('mutf.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
