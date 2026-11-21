// mutate-shared.js - breaks each part of "code the page and the worker both run is written once" (jitaShared) and requires
// shared-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'shared-check.js';
const muts = [
    [H, 'the worker is not handed the shared copy', "')(' + JSON.stringify(cfg) + ', (' + jitaShared.toString() + ')());';", "')(' + JSON.stringify(cfg) + ');';"],
    [H, 'the worker body takes no shared copy', 'function jitaWorkerBody(cfg, SH) {', 'function jitaWorkerBody(cfg) {'],
    [H, 'the worker splits with a copy of its own', 'var lgSplit = SH.splitBlocks, lgFp = SH.fingerprint,', "var lgSplit = function (text) { return [text || '']; }, lgFp = SH.fingerprint,"],
    [H, 'the worker tells stacktraces apart by a copy of its own', 'var lgIsTrace = SH.isTrace, lgIsCut', "var lgIsTrace = function (sig) { return String(sig).indexOf('[stacktrace] ') === 0; }, lgIsCut"],
    [H, 'the page fingerprints with a copy of its own', '    _fingerprint: JITA_SH.fingerprint,   // jitaShared', '    _fingerprint: function (text) { return JITA_SH.fingerprint(text); },'],
    [H, 'the page keeps a crash site of its own', '    _crashOf: JITA_SH.crashOf,   // jitaShared', '    _crashOf: function (sig) { return JITA_SH.crashOf(sig); },'],
    [H, 'the page keeps its own constants', 'MIN_FRAMES: JITA_SH.MIN_FRAMES, CRASH_FRAMES: JITA_SH.CRASH_FRAMES,', 'MIN_FRAMES: 2, CRASH_FRAMES: JITA_SH.CRASH_FRAMES,'],
    [H, 'the shared copy reads the page', '    function isTrace(sig) { return String(sig == null', "    function isTrace(sig) { if (typeof JiTA === 'undefined') { return false; } return String(sig == null"],
    [H, 'the shared copy is never run on the page', '\nvar JITA_SH = jitaShared();\n', '\nvar JITA_SH = null;\n'],
    [H, 'the shared copy leaves a piece out', 'splitBlocks: splitBlocks, fingerprint: fingerprint, logBlocks: logBlocks, crashOf: crashOf', 'splitBlocks: splitBlocks, fingerprint: fingerprint, logBlocks: logBlocks']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutsh.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutsh.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutsh.js')) { fs.unlinkSync('mutsh.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
