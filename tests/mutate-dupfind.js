// mutate-dupfind.js - breaks each guard of the duplicate finder's list (review 2026-11-20 trend-logic-1..4) and requires
// dupfind-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'dupfind-check.js';
const muts = [
    // ---- links read again, a failure not kept ----
    [H, 'Recompute keeps the links read before', "        D._renderGen++;   // a render still checking links would paint the old scan over \"Scanning\"\n        D._fresh();\n", "        D._renderGen++;   // a render still checking links would paint the old scan over \"Scanning\"\n"],
    [H, 'opening the view keeps the links read before', '        D._injectCss();\n        D._fresh();\n', '        D._injectCss();\n'],
    [H, 'a fresh start keeps the links', "    _fresh: function () { JiTA.dupfind._links = {}; JiTA.dupfind._missing = {}; },", "    _fresh: function () { JiTA.dupfind._missing = {}; },"],
    [H, 'a failed read is kept as no links', ".fail(function (xhr) { if (xhr && xhr.status === 404) { D._missing[key] = true; } resolve(); });", ".fail(function (xhr) { D._links[key] = {}; resolve(); });"],
    [H, 'a defect Jira no longer has is suggested', "                    if (D._missing[p.a] || D._missing[p.b]) { missing++; continue; }   // deleted in Jira, or out of sight\n", ''],
    [H, 'any failure counts as a defect Jira no longer has', "if (xhr && xhr.status === 404) { D._missing[key] = true; }", "D._missing[key] = true;"],
    [H, 'a pair whose links could not be read is not said so', "                    if (!D._links[p.a] || !D._links[p.b]) { unread++; }   // shown, but its links could not be read\n", ''],
    // ---- the newest render paints ----
    [H, 'an older render paints last', "var cur = function () { return gen === D._renderGen && D._last === last && !!document.getElementById('jd-body'); };", "var cur = function () { return !!document.getElementById('jd-body'); };"],
    [H, 'a render is never numbered', '        var gen = ++D._renderGen, last = D._last;', '        var gen = D._renderGen, last = D._last;'],
    [H, 'a scan started does not stop the render in flight', "        D._renderGen++;   // a render still checking links would paint the old scan over \"Scanning\"\n", ''],
    [H, 'the links step paints whatever render it is', "                if (!cur()) { return; }   // closed, or a newer render or scan since\n                var fresh = [],", "                if (!document.getElementById('jd-body')) { return; }\n                var fresh = [],"],
    // ---- the hover card ----
    [H, 'a hover card comes after the mouse left', "                                if (D._hovered !== self) { return; }   // the mouse left before the read came back: the card would stay\n", ''],
    [H, 'leaving a row is never noted', "if (D._hovered === this) { D._hovered = null; } JiTA.ui._hideTip();", 'JiTA.ui._hideTip();'],
    // ---- the scan time ----
    [H, 'the scan time is UTC again', '        var when = D._scannedAt(D._last.computedAt);', "        var when = String(D._last.computedAt || '').replace('T', ' ').slice(0, 16);"],
    [H, 'the scan time in UTC hours', "p2(t.getHours()) + ':' + p2(t.getMinutes());", "p2(t.getUTCHours()) + ':' + p2(t.getMinutes());"],
    [H, 'a missing scan time is a broken date', "        if (isNaN(t.getTime())) { return ''; }\n", '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutdf.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutdf.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutdf.js')) { fs.unlinkSync('mutdf.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
