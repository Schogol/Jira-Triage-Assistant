// mutate-toastwork.js - breaks each guard of the toast's notice and work lines (JiTA.ui.toast / work / workDone, v3.58.0) and
// requires toastwork-check to go red. A crashed harness counts as red. The hooks that feed it are broken in mutate-synctail.js,
// mutate-translate.js and mutate-worker.js.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'toastwork-check.js';
const muts = [
    [H, "a job shows at once", "            if (due > 0) { next = next ? Math.min(next, due) : due; return; }\n", ""],
    [H, "an update starts a job's wait again", "since: w ? w.since : now", "since: now"],
    [H, "a job gone quiet stays", "            if (now - w.at >= U.WORK_STALE_MS) { delete U._work[id]; return; }\n", ""],
    [H, "nothing looks again for a job due to show", "        if (Object.keys(U._work).length) { U._workTimer = setTimeout(U._drawToast, next || U.WORK_STALE_MS / 6); }\n", ""],
    [H, "the jobs have no title", "            $('<div class=\"jita-toast-h\"></div>').text('Triage Assistant').appendTo($t);\n", ""],
    [H, "jobs drop the notice", "        if (U._toastMsg) { $('<div class=\"jita-toast-msg\"></div>').text(U._toastMsg).appendTo($t); }\n", ""],
    [H, "a notice never goes", "U._toastTimer = null; U._toastMsg = ''; U._drawToast();", "U._toastTimer = null; U._drawToast();"],
    [H, "an ended job stays on screen", "        if (msg) { U.toast(msg); } else if (had) { U._drawToast(); }", "        if (msg) { U.toast(msg); }"],
    [H, "what an ended job says is lost", "        if (msg) { U.toast(msg); } else if (had) { U._drawToast(); }", "        if (had) { U._drawToast(); }"],
    [H, "the work of a frame inside the page is drawn", "        if (JITA_IS_SUBFRAME) { return; }\n        U._work[id] = {", "        U._work[id] = {"],
    [H, "the toast sits on the credits box", "        $t.css('bottom', cp ? (18 + cp.offsetHeight + 10) + 'px' : '');", "        $t.css('bottom', '');"],
    [H, "the toast stays up with nothing in it", "        if (!jobs.length && !U._toastMsg) { if ($t.length) { $t.stop(true).fadeOut(400); } return; }", "        if (!jobs.length && !U._toastMsg) { return; }"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutto.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutto.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutto.js')) { fs.unlinkSync('mutto.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
