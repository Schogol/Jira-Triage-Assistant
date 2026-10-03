// mutate-ocrrace.js - breaks each screenshot-translation race fix (v3.38.22) and requires ocrrace-check to go red. A
// crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'ocrrace-check.js';
const muts = [
    [H, 'every box downloads the image', '        if (O._pixP && O._pixP.src === src) { return O._pixP.p; }   // being fetched for an earlier box: one download per image\n', ''],
    [H, 'a failed download is kept', '        p.then(done, done);   // a failed fetch is not kept: the next box tries again', '        p.then(done);'],
    [H, 'an earlier box\'s pixels drive the newer card', '            if (O._tgt !== tgt || O._card !== card) { return; }', '            if (O._tgt !== tgt || !O._card) { return; }'],
    [H, 'an earlier box\'s error lands on the newer card', "            if (O._card !== card) { return; }\n            O._status('Could not read the image", "            O._status('Could not read the image"],
    [H, 'a slow label lookup overrides the pick', '            if (!O._lang) { O._lang = L; }   // picked from the dropdown meanwhile: that wins', '            O._lang = L;'],
    [H, 'translations land out of order', ' || seq !== O._txSeq) { return; }', ') { return; }'],
    [H, 'a stalled engine is waited for forever', '                if (Date.now() - O._engineBeat < O.ENGINE_STALL_MS) { return; }', '                return;'],
    [H, 'progress does not count', '                if (Date.now() - O._engineBeat < O.ENGINE_STALL_MS) { return; }', '                if (false) { return; }'],
    [H, 'a started engine is still watched', 'O._engine(code).then(function (w) { clearInterval(iv); resolve(w); }', 'O._engine(code).then(function (w) { resolve(w); }'],
    [H, 'a read starts its engine unwatched', '            return O._engineTimed(code).then(function (w) {', '            return O._engine(code).then(function (w) {'],
    [H, 'a failed warm-up keeps its engine', "function (e) { O._resetEngine(); throw e; });\n            }).then(null, function () { /* surfaced on the real run */ });",
        "function (e) { throw e; });\n            }).then(null, function () { /* surfaced on the real run */ });"],
    [H, 'a refused copy counts as copied', "if (ok) { resolve(); } else { reject(new Error('copy refused')); }", 'resolve();'],
    [H, 'the card says Copied whatever happened', "                    flash('Copy failed');", "                    flash('Copied');"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('muty.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'muty.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('muty.js')) { fs.unlinkSync('muty.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
