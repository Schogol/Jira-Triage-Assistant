// mutate-triagemode.js - breaks each Triage mode fix (v3.38.27) and requires triagemode-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'triagemode-check.js';
const muts = [
    [H, 'a digit attaches from a list never shown', "        if (!res || T._shownKey !== item.key) { T._setMsg('Still ranking - try again in a moment.', true); return; }", "        if (!res) { T._setMsg('Still ranking - try again in a moment.', true); return; }"],
    [H, 'the shown list is never recorded', '            T._shownKey = key;   // the list below is what a digit now attaches from\n', ''],
    [H, 'a new report keeps the old shown key', '        if (!T._open) { return; }\n        T._shownKey = null;\n', '        if (!T._open) { return; }\n'],
    [H, 'a resume jumps away from what the user is doing', '        if (T._armed || T._gmPick || T._viewerNode || T._txShown) { T._resume = null; return false; }\n', ''],
    [H, 'the viewer does not hold a resume back', '        if (T._armed || T._gmPick || T._viewerNode || T._txShown) { T._resume = null; return false; }', '        if (T._armed || T._gmPick || T._txShown) { T._resume = null; return false; }'],
    [H, 'a pending resume is overwritten by the first report', '        if (!T._resume) { T._rememberPos(item); }', '        T._rememberPos(item);'],
    [H, 'a failed later page goes unsaid', "                    else { T._stoppedShort('a later page failed (' + String(e && e.message || e) + ')'); }\n", ''],
    [H, 'the cap goes unsaid', "                        if (data.nextPageToken) { T._stoppedShort('the queue is capped at ' + T.QUEUE_MAX + ' reports'); }\n", ''],
    [H, 'the counter hides a partial queue', "(!T._queueDone ? '…' : (T._queuePartial ? ' (partial)' : ''))", "(!T._queueDone ? '…' : '')"],
    [H, 'a reloaded queue stays partial', '        T._queueDone = false;\n        T._queuePartial = false;\n', '        T._queueDone = false;\n'],
    [H, 'the parked queue keeps an attached report', '        T._dropFromStash(key);\n', ''],
    [H, 'the parked position is not moved back', '                if (s.queue[i].key === key) { s.queue.splice(i, 1); if (s.idx > i) { s.idx--; } return; }', '                if (s.queue[i].key === key) { s.queue.splice(i, 1); return; }'],
    [H, 'a refused Won\'t Do says [object Object]', "                        .fail(function (xhr) { reject(new Error('could not close it - ' + JiTA.dv._errText(xhr))); });", '                        .fail(function (xhr) { reject(xhr); });'],
    [H, 'an old failure drops the newer ranking', '        p.catch(function () { if (cache[key] === p) { delete cache[key]; } });', '        p.catch(function () { delete T._cache[key]; });'],
    [H, 'a replaced viewer\'s timer parses on', '                    if (T._viewerNode !== v) { return; }   // switched to another attachment meanwhile: it would parse that one\'s text\n', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mute.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mute.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mute.js')) { fs.unlinkSync('mute.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
