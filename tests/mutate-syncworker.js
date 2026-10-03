// mutate-syncworker.js - breaks each background-sync and worker fix (v3.38.19) and requires the harness that owns it
// (autosync-check or worker-check) to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const A = 'autosync-check.js', W = 'worker-check.js';
const muts = [
    // ---- the auto-sync lease and back-off ----
    [A, 'the lease is not heartbeated', 'var hb = setInterval(function () { gmSet(S.LEASE_KEY, { tabId: S.tabId, ts: Date.now() }); }, S.HEARTBEAT_MS);', 'var hb = null;'],
    [A, 'the lease is kept after the sync', '            clearInterval(hb);\n            S._releaseLease();\n', '            clearInterval(hb);\n'],
    [A, 'the heartbeat outlives the sync', '            clearInterval(hb);\n            S._releaseLease();\n', '            S._releaseLease();\n'],
    [A, 'a failed sync stamps no back-off', 'else if (done === false) { gmSet(S.FAIL_KEY, Date.now()); }', 'else if (done === false) { }'],
    [A, 'a completed sync keeps the back-off', 'if (done === true) { gmSet(S.FAIL_KEY, 0); }', 'if (done === true) { }'],
    [A, 'a sync that did not run counts as failed', 'else if (done === false) { gmSet(S.FAIL_KEY, Date.now()); }', 'else if (done !== true) { gmSet(S.FAIL_KEY, Date.now()); }'],
    [A, 'the back-off is ignored', 'if (failed && (Date.now() - failed) < S.FAIL_MS) { return; }', 'if (false) { return; }'],
    [A, 'a tick while this tab syncs takes the lease', "        if (JiTA.sync.running) { return; }               // a sync of this tab's own is going\n", ''],
    [A, 'closing the tab keeps the lease', "        try { window.addEventListener('pagehide', function () { JiTA.sched._releaseLease(); }); } catch (e) { /* ignore */ }\n", ''],
    [A, 'any tab\'s lease is freed', 'if (l && l.tabId === JiTA.sched.tabId) { gmSet(JiTA.sched.LEASE_KEY, null); }', 'if (l) { gmSet(JiTA.sched.LEASE_KEY, null); }'],
    [A, 'a completed auto-sync says nothing', '                return true;\n            });\n        }).catch(function (e) {', '            });\n        }).catch(function (e) {'],
    [A, 'a failed auto-sync says nothing', "            console.log('[JiTA] auto-sync error:', e && e.message || e);\n            return false;\n", "            console.log('[JiTA] auto-sync error:', e && e.message || e);\n"],
    [A, 'an auto-sync that did not run is not told apart', 'if (JiTA.sync.running) { return Promise.resolve(null); }', 'if (JiTA.sync.running) { return Promise.resolve(); }'],
    // ---- a removed report ----
    [A, 'the other tabs hear before the worker has dropped its indexes', "JiTA.sync._invalidateWorker().then(function () { gmSet('sdEbrRemoved', note); });", "JiTA.sync._invalidateWorker(); gmSet('sdEbrRemoved', note);"],
    [A, 'every other tab drops the indexes again', '        if (fromRemote) { return; }\n        var note', '        if (fromRemote) { JiTA.sync._invalidateWorker(); return; }\n        var note'],
    [A, 'a heard removal is echoed', '        if (fromRemote) { return; }\n        var note', '        var note'],
    [A, 'an unreachable worker keeps the news', "return JiTA.worker.call('invalidate').then(function () {}, function () { /* ignore */ });", "return JiTA.worker.call('invalidate').then(function () {});"],
    [A, 'no worker at all keeps the news', 'if (!(JiTA.worker && JiTA.worker.usable())) { return Promise.resolve(); }', 'if (!(JiTA.worker && JiTA.worker.usable())) { return new Promise(function () {}); }'],
    // ---- the upgrade check ----
    [A, 'the upgrade check runs into a sync', '        JiTA.migrate._done = true;\n        if (JiTA.sync.running) { JiTA.migrate._later(); return; }\n', '        JiTA.migrate._done = true;\n'],
    [A, 'a sync started mid-read is not noticed', '                        if (JiTA.sync.running) { JiTA.migrate._later(); return; }   // one started while we read\n', ''],
    [A, 'a deferred check stays done', '        JiTA.migrate._done = false;\n        setTimeout(', '        setTimeout('],
    // ---- the worker ----
    [W, 'a tab that gave up still waits for an ACK', "        if (!JiTA.worker.usable()) { return Promise.reject(new Error('the ranking worker is not available in this tab')); }\n", ''],
    [W, 'giving up does not make the worker unusable', 'return JiTA.worker._started && (!JiTA.worker._gaveUp || JiTA.worker._otherLeader);', 'return JiTA.worker._started;'],
    [W, 'a new leader is not noticed', '            JiTA.worker._otherLeader = true;   // somebody leads again, even if this tab gave up\n', ''],
    [W, 'a spawn does not record its backend', "            JiTA.worker._spawnedGpu = !!(gmGet('sdTryWebgpu', true) && !gmGet('sdForceCpu', false));   // what _src() builds it for\n", ''],
    [W, 'a backend switch never rebuilds the worker', "' in another tab - rebuilding the worker'); }\n        JiTA.worker._spawnWorker();", "' in another tab - rebuilding the worker'); }"],
    [W, 'a follower rebuilds a worker it does not have', 'if (!JiTA.worker._isLeader || !JiTA.worker._worker || JiTA.worker._spawnedGpu === gpu) { return; }', 'if (!JiTA.worker._worker || JiTA.worker._spawnedGpu === gpu) { return; }'],
    [W, 'the same backend rebuilds the worker', 'if (!JiTA.worker._isLeader || !JiTA.worker._worker || JiTA.worker._spawnedGpu === gpu) { return; }', 'if (!JiTA.worker._isLeader || !JiTA.worker._worker) { return; }'],
    [W, 'this tab\'s own switch rebuilds it too', 'if (remote) { JiTA.worker._backendChanged(); }', 'JiTA.worker._backendChanged();'],
    [W, 'only one backend setting is watched', "['sdTryWebgpu', 'sdForceCpu'].forEach(function (k) {", "['sdTryWebgpu'].forEach(function (k) {"],
    [W, 'a failed embed pass is dropped', "        if (d.event === 'embedPassError') {", "        if (d.event === 'embedPassError-x') {"],
    [W, 'a failed embed pass leaves its progress line', "            try { JiTA.ui.scheduleRender(); } catch (e) { /* ignore */ }   // the view's own status replaces the progress line\n", '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('muti.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'muti.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('muti.js')) { fs.unlinkSync('muti.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
