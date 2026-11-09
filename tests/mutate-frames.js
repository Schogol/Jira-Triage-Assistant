// mutate-frames.js - breaks each part of "a frame inside another page boots nothing and shows nothing" (v3.48.0: the
// Lead duties pill showed a second time inside a database cell of an article being edited) in turn, and requires
// frames-check, nag-check or changelog-check to go red. A crashed harness counts as red. A breakage may name the part of
// the file it is made in: [harness, name, anchor, replacement, [its first line, its end]], the anchor then once there.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const FR = 'frames-check.js', NG = 'nag-check.js', CL = 'changelog-check.js';
const FLAG = ['var JITA_IS_SUBFRAME = ', '})();'];
const muts = [
    // ---- the flag ----
    [FR, 'the page itself counts as a frame', 'try { return window.self !== window.top; }', 'try { return true; }', FLAG],
    [FR, 'a frame counts as the page', 'try { return window.self !== window.top; }', 'try { return false; }', FLAG],
    [FR, 'the Zendesk panel is a frame only when it looks like one', 'var JITA_IS_SUBFRAME = JITA_IS_FORGE_FRAME || (function () {', 'var JITA_IS_SUBFRAME = (function () {'],
    [FR, 'a frame that cannot look at itself counts as the page', '} catch (e) { return true; }', '} catch (e) { return false; }', FLAG],
    // ---- the boots ----
    [FR, 'the Confluence boot runs in a frame an article embeds', 'if (JITA_IS_WIKI && !JITA_IS_SUBFRAME) {', 'if (JITA_IS_WIKI) {'],
    [FR, 'the Jira boot runs in a frame', 'if (JITA_NO_JIRA_UI || JITA_IS_SUBFRAME) { return; }', 'if (JITA_NO_JIRA_UI) { return; }'],
    [FR, 'the canned-response dropdown stops looking in frames', '(function () {\n    if (JITA_IS_WIKI) { return; }', '(function () {\n    if (JITA_IS_WIKI || JITA_IS_SUBFRAME) { return; }'],
    // ---- what floats over a page ----
    [FR, 'the ISD credits pill mounts in a frame', "if (!flagOn('credits') || JITA_NO_JIRA_UI || JITA_IS_SUBFRAME) { return; }", "if (!flagOn('credits') || JITA_NO_JIRA_UI) { return; }"],
    [FR, 'the Lead duties window opens in a frame', 'if (JITA_IS_SUBFRAME || !L.isLead()) { return; }', 'if (!L.isLead()) { return; }'],
    [NG, 'the Lead duties pill shows in a frame', 'if (JITA_IS_SUBFRAME || !L.isLead()) { return false; }', 'if (!L.isLead()) { return false; }'],
    [NG, 'the daily reminder opens in a frame', 'if (R._nagged || JITA_IS_SUBFRAME || !L.isLead()) { return; }', 'if (R._nagged || !L.isLead()) { return; }'],
    [CL, 'the What\'s new pill shows in a frame', 'return !JITA_IS_SUBFRAME && JiTA.changelog.unseenFeatures().length > 0;', 'return JiTA.changelog.unseenFeatures().length > 0;'],
    [FR, 'the duplicate finder opens in a frame', 'var D = JiTA.dupfind;\n        if (JITA_IS_SUBFRAME) { return; }', 'var D = JiTA.dupfind;'],
    [FR, 'the shared worker starts in a frame', 'if (JiTA.worker._started || JITA_IS_SUBFRAME) { return; }', 'if (JiTA.worker._started) { return; }']
];
function within(fn) {
    if (!fn) { return [0, src.length]; }
    const s = src.indexOf(fn[0]);
    if (s < 0 || src.indexOf(fn[0], s + 1) >= 0) { return null; }
    const e = src.indexOf(fn[1], s + fn[0].length);
    return e < 0 ? null : [s, e + fn[1].length];
}
let allRed = true;
muts.forEach(([h, name, a, b, fn]) => {
    const at = within(fn), part = at ? src.slice(at[0], at[1]) : '';
    if (!at || part.split(a).length !== 2) { console.log('ANCHOR ' + (at ? part.split(a).length - 1 : 'no part') + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutfr.js', src.slice(0, at[0]) + part.replace(a, () => b) + src.slice(at[1]));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutfr.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutfr.js')) { fs.unlinkSync('mutfr.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
