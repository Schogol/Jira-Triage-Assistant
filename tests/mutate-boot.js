// mutate-boot.js - breaks the start-up on a bug report opened from a link (v3.40.1) and requires boot-check to go red.
// A mutation is a list of [find, replace] pairs, applied in order. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'boot-check.js';
const TRY = "try { cancelFound = actionFunction(jThis); }\n                catch (e) { try { console.error('[JiTA] could not handle ' + selectorTxt + ':', e); } catch (e2) { /* ignore */ } }";
const muts = [
    [H, 'the busy map is declared below the first issue check again', [
        ['var jitaConvertBusy = {};\n\n// waitForKeyElements waits', '\n// waitForKeyElements waits'],
        ['// The Convert to Defect button reflects whether', 'var jitaConvertBusy = {};\n// The Convert to Defect button reflects whether']]],
    [H, 'a callback that throws escapes waitForKeyElements', [[TRY, 'cancelFound = actionFunction(jThis);']]],
    [H, 'a failed callback is retried every poll', [["catch (e) { try { console.error('[JiTA] could not handle '", "catch (e) { cancelFound = true; try { console.error('[JiTA] could not handle '"]]],
    [H, 'a failed callback is swallowed in silence', [["catch (e) { try { console.error('[JiTA] could not handle ' + selectorTxt + ':', e); } catch (e2) { /* ignore */ } }", 'catch (e) { /* ignore */ }']]],
    [H, 'the start-up stops on a throwing callback after all', [[TRY, TRY.replace('catch (e) {', 'catch (e) { if (selectorTxt.indexOf("current-issue") >= 0) { throw e; }')], ['var jitaConvertBusy = {};\n\n// waitForKeyElements waits', 'var jitaConvertBusy;\n\n// waitForKeyElements waits']]]
];
let allRed = true;
muts.forEach(([h, name, pairs]) => {
    let out = src, anchored = true;
    pairs.forEach(([a, b]) => {
        if (!anchored) { return; }
        if (out.split(a).length !== 2) { console.log('ANCHOR ' + (out.split(a).length - 1) + 'x: ' + name); anchored = false; return; }
        out = out.replace(a, () => b);
    });
    if (!anchored) { allRed = false; return; }
    fs.writeFileSync('mutr.js', out);
    let res = '', crashed = false;
    try { res = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutr.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { res = e.stdout || ''; crashed = !/FAILURE|passed/.test(res); }
    const fails = res.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(res);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutr.js')) { fs.unlinkSync('mutr.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
