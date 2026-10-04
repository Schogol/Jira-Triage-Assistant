// mutate-livestatus.js - breaks the live status check on the open-report lists (v3.40.2) and requires livestatus-check to
// go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'livestatus-check.js';
const muts = [
    [H, 'a report missing from the answer stays listed', "            keys.forEach(function (k) { out[k] = ''; });\n", ''],
    [H, 'a failed search takes every row off', "if (!e || e.status !== 400) { return out; }", "if (!e || e.status !== 400) { keys.forEach(function (k) { out[k] = ''; }); return out; }"],
    [H, 'a report that could not be read counts as gone', ".fail(function (xhr) { if (xhr && xhr.status === 404) { out[k] = ''; } resolve(); });", ".fail(function (xhr) { out[k] = ''; resolve(); });"],
    [H, 'a moved report counts as open', "(d && d.key === k && d.fields && d.fields.status", "(d && d.fields && d.fields.status"],
    [H, 'rows seen open are asked about on every redraw', "!(now - (U._openSeen[k] || 0) < U.OPEN_OK_MS)", 'true'],
    [H, 'defect rows are asked about too', String.raw`if (k && /^EBR-\d+$/.test(k) && keys.indexOf(k) < 0`, 'if (k && keys.indexOf(k) < 0'],
    [H, 'a row that could not be checked is taken off', "                if (!Object.prototype.hasOwnProperty.call(st, k)) { return; }   // not checked: left as it is\n", ''],
    [H, 'the list is drawn again before the worker dropped the report', '            return JiTA.sync._ebrRemoved(fresh);', '            JiTA.sync._ebrRemoved(fresh);'],
    [H, 'a report that came back is deleted and redrawn again', 'var U = JiTA.ui, fresh = keys.filter(function (k) { return !U._liveGone[k]; });', 'var U = JiTA.ui, fresh = keys.slice();'],
    [H, 'rows are taken off a list the user left', "        if (still()) {\n            $('#jita-sd-list').children('li').each(function () {", "        if (true) {\n            $('#jita-sd-list').children('li').each(function () {"],
    [H, 'a closed report stays in the local copy when the list was left', '        if (!fresh.length) { return Promise.resolve(); }\n        return JiTA.db.deleteDefects(fresh)', '        if (!fresh.length || !still()) { return Promise.resolve(); }\n        return JiTA.db.deleteDefects(fresh)'],
    [H, 'the list is redrawn even when the user left it', '            if (still()) { U.scheduleRender(); }', '            U.scheduleRender();'],
    [H, 'Attach links a report already attached in Jira', "if (Object.prototype.hasOwnProperty.call(st, reportKey) && !JiTA.ui._isOpenStatus(st[reportKey])) {", 'if (false) {'],
    [H, 'a collapsed row never hands on', "            if (done) { done(); }\n        }, 320);", '        }, 320);'],
    [H, '_ebrRemoved resolves before the worker dropped its indexes', "        return JiTA.sync._invalidateWorker().then(function () { gmSet('sdEbrRemoved', note); });", "        JiTA.sync._invalidateWorker().then(function () { gmSet('sdEbrRemoved', note); }); return Promise.resolve();"],
    [H, 'the re-verify no longer says closed', "return { ok: false, closed: true, reason: 'already '", "return { ok: false, reason: 'already '"],
    [H, 'triage leaves a closed match in the local copy', '                if (v.closed) { T._dropClosed(ebrKey, key, v.reason); }\n', ''],
    [H, 'triage keeps the stale rankings', "            T._cache = {};   // any defect's cached ranking may list it\n", ''],
    [H, 'triage redraws under another defect', "if (!T._open || T._busy || !T._queue[T._idx] || T._queue[T._idx].key !== key) { return; }", 'if (!T._open || T._busy) { return; }'],
    [H, 'a defect\'s Matching bug reports are never checked', '                        JiTA.ui._checkReportRows(function () { return !stale(); });   // one attached or closed in Jira itself leaves now, not at the next sync\n', ''],
    [H, 'a report\'s Similar open reports are never checked', '                        JiTA.ui._checkReportRows(function () { return JiTA.ui.currentKey === key && JiTA.ui.simReportsMode; });\n', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutls.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutls.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutls.js')) { fs.unlinkSync('mutls.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
