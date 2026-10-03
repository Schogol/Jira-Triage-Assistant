// mutate-worker.js - breaks each guard that keeps the shared ranking worker current (v3.38.6) and requires
// worker-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'worker-check.js';
const muts = [
    // ---- index builds ----
    [H, 'concurrent queries build twice', '        if (idxP) { return idxP; }\n', ''],
    [H, 'a build that began before a drop is kept', '            if (gen !== idxGen) { return ensureIndexes(); }\n', ''],
    [H, 'a drop does not start a new generation', 'function dropIndexes() { idxGen++; vecCache = null;', 'function dropIndexes() { vecCache = null;'],
    [H, 'a failed read sticks', '}, function (e) { idxP = null; throw e; });', '}, function (e) { throw e; });'],
    [H, 'the invalidate op clears behind the guard', "else if (type === 'invalidate') { dropIndexes(); result = { ok: true }; }",
        "else if (type === 'invalidate') { vecCache = null; kwCache = null; logsigCache = null; result = { ok: true }; }"],
    // ---- embedPass ----
    [H, 'embedPass keeps the indexes', '            dropIndexes();\n        }\n    }', '        }\n    }'],
    // ---- a sync run ----
    [H, 'a run never tells the worker', 'function settled() { if (changed > 0) { JiTA.sync._invalidateWorker(); } }', 'function settled() {}'],
    [H, 'a run that stored nothing tells it anyway', 'function settled() { if (changed > 0) {', 'function settled() { if (true) {'],
    [H, 'a failed run does not tell it', 'function (e) {\n            settled();\n', 'function (e) {\n'],
    // ---- the leader changes ----
    [H, 'a call no leader took is failed too', '            if (ackedOnly && p.ackTimer) { return; }\n', ''],
    [H, 'followers ignore a new leader', "            JiTA.worker._failTabPending('the ranking leader changed - try again', true);", '            void 0;'],
    [H, 'a new leader keeps its own channel calls waiting', "        JiTA.worker._failTabPending('the ranking leader moved to this tab');\n", ''],
    [H, 'a new leader announces itself only after taking calls',
        "        try { if (JiTA.worker._bc) { JiTA.worker._bc.postMessage({ kind: 'leader', version: JiTA.SCRIPT_VERSION }); } } catch (e) { /* ignore */ }\n        JiTA.worker._spawnWorker();",
        "        JiTA.worker._spawnWorker();\n        try { if (JiTA.worker._bc) { JiTA.worker._bc.postMessage({ kind: 'leader', version: JiTA.SCRIPT_VERSION }); } } catch (e) { /* ignore */ }"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutw.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutw.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutw.js')) { fs.unlinkSync('mutw.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
