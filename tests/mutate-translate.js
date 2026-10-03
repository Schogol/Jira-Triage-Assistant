// mutate-translate.js - breaks each translate-pass fix (v3.38.26) and requires translate-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'translate-check.js';
const muts = [
    [H, 'a failed write ends the lane', "                            return JiTA.db.updateRecord(item.key, apply).then(null, function (e) {\n                                console.log('[JiTA] translate: could not store ' + item.key + ':', e && e.message || e);\n                            }).then(function () {",
        '                            return JiTA.db.updateRecord(item.key, apply).then(function () {'],
    [H, 'a refusing endpoint is retried forever', '                                if (backoff >= JiTA.translate.BACKOFF_MAX && ++capped >= JiTA.translate.MAX_CAPPED) {', '                                if (false) {'],
    [H, 'the lane gives up before the cap', '                                if (backoff >= JiTA.translate.BACKOFF_MAX && ++capped >= JiTA.translate.MAX_CAPPED) {', '                                if (++capped >= JiTA.translate.MAX_CAPPED) {'],
    [H, 'a success does not reset the count', '                            backoff = JiTA.translate.BACKOFF0; capped = 0;', '                            backoff = JiTA.translate.BACKOFF0;'],
    [H, 'the status line is kept', '                    if (JiTA.ui && JiTA.ui.scheduleRender) { JiTA.ui.scheduleRender(); }\n                });', '                    void 0;\n                });']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutd.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutd.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutd.js')) { fs.unlinkSync('mutd.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
