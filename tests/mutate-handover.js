// mutate-handover.js - breaks each guard of the worker's hand-over after an update (v3.53.2) in a copy of the script
// (mutho.js) and requires handover-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'handover-check.js';
const muts = [
    [H, 'a tab does not say its version as it starts', '        JiTA.worker._announce();\n        setInterval(JiTA.worker._announce, JiTA.worker.ANNOUNCE_MS);\n', '        setInterval(JiTA.worker._announce, JiTA.worker.ANNOUNCE_MS);\n'],
    [H, 'a tab says it only once', '        setInterval(JiTA.worker._announce, JiTA.worker.ANNOUNCE_MS);\n', ''],
    [H, 'it says it as a message older versions do not know', "try { w._bc.postMessage({ kind: 'reelect', want: JiTA.SCRIPT_VERSION }); } catch (e) { /* ignore */ }",
        "try { w._bc.postMessage({ kind: 'version', want: JiTA.SCRIPT_VERSION }); } catch (e) { /* ignore */ }"],
    [H, 'a tab that gave up still says it', "if (!w._bc || !JiTA.SCRIPT_VERSION || w._gaveUp) { return; }", 'if (!w._bc || !JiTA.SCRIPT_VERSION) { return; }'],
    [H, 'a leader steps down for its own version', 'if (JiTA.worker._isLeader && want && JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, want) < 0) {', 'if (JiTA.worker._isLeader && want && JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, want) <= 0) {'],
    [H, 'a leader steps down for an older version', 'if (JiTA.worker._isLeader && want && JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, want) < 0) {', 'if (JiTA.worker._isLeader && want) {'],
    [H, 'an old leader never steps down', '            JiTA.worker._stepDown(true);\n        }\n    },', '        }\n    },'],
    [H, 'a ping that gets no answer says nothing', "            JiTA.log('[JiTA worker] version check: the worker did not answer (' + ((e && e.message) || e) + ')');\n", ''],
    [H, 'an older worker found by the ping asks for nothing', "                try { if (JiTA.worker._bc) { JiTA.worker._bc.postMessage({ kind: 'reelect', want: JiTA.SCRIPT_VERSION }); } } catch (e) { /* ignore */ }\n", ''],
    [H, 'the tabs waiting never stand aside', '            && JiTA.worker._standAsides < JiTA.worker.MAX_STANDASIDE) {', '            && false) {'],
    [H, 'a tab stands aside for ever', '            && JiTA.worker._standAsides < JiTA.worker.MAX_STANDASIDE) {', '            ) {'],
    [H, 'it says it every few seconds', '    ANNOUNCE_MS: 5 * 60 * 1000,', '    ANNOUNCE_MS: 5 * 1000,'],
    [H, 'an older tab taking the lead is not asked to hand over', '            JiTA.worker._olderLeader(m.version);\n', ''],
    [H, 'a newer tab taking the lead is asked, an older one not', 'w._verCmp(version, JiTA.SCRIPT_VERSION) >= 0) { return; }', 'w._verCmp(version, JiTA.SCRIPT_VERSION) < 0) { return; }'],
    [H, 'a tab at the same version taking the lead is asked to hand over', 'w._verCmp(version, JiTA.SCRIPT_VERSION) >= 0) { return; }', 'w._verCmp(version, JiTA.SCRIPT_VERSION) > 0) { return; }'],
    [H, 'a leader that does not say its version is taken for an older one', 'if (w._isLeader || w._gaveUp || !version || ', 'if (w._isLeader || w._gaveUp || '],
    [H, 'a tab that leads asks another leader to hand over', 'if (w._isLeader || w._gaveUp || !version || ', 'if (w._gaveUp || !version || '],
    [H, 'a tab that gave up asks an older leader to hand over', 'if (w._isLeader || w._gaveUp || !version || ', 'if (w._isLeader || !version || '],
    [H, 'a newer tab speaking gives no stand-asides back', '        if (want && JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, want) < 0) { JiTA.worker._standAsides = 0; }\n', ''],
    [H, 'any tab speaking gives the stand-asides back', 'if (want && JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, want) < 0) { JiTA.worker._standAsides = 0; }',
        'if (want) { JiTA.worker._standAsides = 0; }']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutho.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutho.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutho.js')) { fs.unlinkSync('mutho.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
