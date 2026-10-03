// mutate-composer.js - breaks each guard of the canned responses and the Zendesk composer (v3.39.3) and requires
// composer-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'composer-check.js', TMP = 'mutb.js', BUL = String.fromCharCode(0x2022);
const muts = [
    // ---- the compose editor ----
    [H, 'the search goes past the panel', '            if (node.contains(head)) { return null; }   // reached the panel without one: never look outside it\n', ''],
    [H, 'no panel header is needed', '        if (!add || !head) { return null; }', '        if (!add) { return null; }'],
    // ---- the placeholder ----
    [H, 'the placeholder is written on every pass', '        if (v && v.textContent !== text) { v.textContent = text; }', '        if (v) { v.textContent = text; }'],
    // ---- a pick ----
    [H, 'a pick does not wait for the tab', '            if (JiTA.responses._publicReplyActive() && JiTA.responses._composerEditor()) {', '            if (true) {'],
    [H, 'a pick does not wait for an editor', '            if (JiTA.responses._publicReplyActive() && JiTA.responses._composerEditor()) {', '            if (JiTA.responses._publicReplyActive()) {'],
    [H, 'a pick waits for ever', "            if (waited >= JiTA.responses.PICK_WAIT_MS) { failed('the reply box did not open'); return; }\n", ''],
    [H, 'a failed write is not said', "if (!JiTA.responses.apply(body)) { failed('the reply box could not be written to'); }", 'JiTA.responses.apply(body);'],
    [H, 'a missing tab is not said', "        if (!JiTA.responses._selectPublicReply()) { failed('the \"Add public reply\" tab was not found'); return; }", '        JiTA.responses._selectPublicReply();'],
    [H, 'a pick leaves the dropdown on its choice', "        sel.value = '';\n        JiTA.responses._setDisplay(list);\n        if (isNaN(i)", '        JiTA.responses._setDisplay(list);\n        if (isNaN(i)'],
    // ---- the stored overlay ----
    [H, 'an override whose default was removed is dropped', '            out.push({ title: ov.overrides[k].title, body: ov.overrides[k].body });\n', ''],
    [H, 'a legacy list is not migrated', '        if (Array.isArray(raw)) {', '        if (false) {'],
    // ---- the probe ----
    [H, 'the probe skips the bullet apply() types', "m ? ('" + BUL + " ' + lines[i].slice(m[0].length)) : lines[i]", 'lines[i]'],
    [H, 'the probe keeps the raw whitespace', "    _squash: function (s) { return String(s == null ? '' : s).replace(/\\s+/g, ' ').trim(); },", "    _squash: function (s) { return String(s == null ? '' : s); },"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync(TMP, src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: TMP }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync(TMP)) { fs.unlinkSync(TMP); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
