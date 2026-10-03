// mutate-embed.js - breaks each worker embedding / storage fix (v3.38.23) and requires embed-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'embed-check.js';
const muts = [
    [H, 'every caller loads its own model', '        if (!pipeP) {\n            pipeP = loadModelOnce().then(function (p) { pipeP = null; return p; }, function (e) { pipeP = null; throw e; });\n        }\n        return pipeP;', '        return loadModelOnce();'],
    [H, 'a failed load is kept', 'function (e) { pipeP = null; throw e; });', 'function (e) { throw e; });'],
    [H, 'a dropped pipeline is not disposed', "            try { var d = p.dispose(); if (d && typeof d.then === 'function') { d.then(null, function () { /* ignore */ }); } } catch (e) { /* ignore */ }\n", ''],
    [H, 'a dropped pipeline keeps its backend', "        pipe = null; backend = 'none';", '        pipe = null;'],
    [H, 'a vector of replaced text is stored', '                        if ((cur.textHash || null) !== (rec.textHash || null)) { return; }\n', ''],
    [H, 'a pass asked for while busy is dropped', '        if (embedding) { embedAgain = true; return { embedded: 0, busy: true }; }', '        if (embedding) { return { embedded: 0, busy: true }; }'],
    [H, 'the pass never goes round again', '            } while (embedAgain);', '            } while (false);'],
    [H, 'a bad slice stops the pass', '                    if (++skipRun > 2) { throw e; }', '                    throw e;'],
    [H, 'a dead device never stops the pass', '                    if (++skipRun > 2) { throw e; }', '                    ++skipRun;'],
    [H, 'a good slice does not reset the run of skips', '                idx += slice.length; retries = 0; skipRun = 0;', '                idx += slice.length; retries = 0;'],
    [H, 'a failed batch keeps its pipeline undisposed', '                dropPipe();                                   // drop the (possibly dead) pipeline and rebuild', '                pipe = null;'],
    [H, 'each first call opens a connection', '        if (dbP) { return dbP; }   // concurrent first calls used to open (and leak) a connection each\n', ''],
    [H, 'an aborted bulk write never settles', "                tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };\n", ''],
    [H, 'the worker drops a pass asked for while busy', 'if (embedding) { embedAgain = true; result = { started: false, busy: true, queued: true }; }', 'if (embedding) { result = { started: false, busy: true }; }'],
    [H, 'the tab waits for an embedded count again', "JiTA.worker._workerCall('embedPass').then(null, function () { /* ignore: the pass reports its end itself (embedPassDone) */ });",
        "JiTA.worker._workerCall('embedPass').then(function (r) { if (r && r.embedded > 0) { JiTA.ui.scheduleRender(); } }, function () {});"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutz.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutz.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutz.js')) { fs.unlinkSync('mutz.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
