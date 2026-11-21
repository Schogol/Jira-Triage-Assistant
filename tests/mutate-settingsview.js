// mutate-settingsview.js - breaks each guard of the settings.yaml window (JiTA.settingsview, v3.54.0) and requires
// settingsview-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'settingsview-check.js', TMP = 'mutsv.js';
const muts = [
    // ---- the YAML reader ----
    [H, 'a list item holding a map is taken for a key', '            if (isSeqItem()) { return blockSeq(col(p)); }   // first: "- key: value" is a list item holding a map, not a key\n', ''],
    [H, 'a tagged key gives its tag to the map', '            if (isComplexKey() || isKeyLine()) { return blockMap(col(p)); }\n            var pr = props(), v;\n', '            var pr = props(), v;\n'],
    [H, 'a list at its key\'s own indent is lost', '                else if (p < n && col(p) === ind && isSeqItem()) { v = blockSeq(ind); }\n', ''],
    [H, 'a complex key is read as a plain node', '                    k = valueAfterColon(ind);   // the key: on the line, deeper below, or a list at the map\'s own indent',
        '                    spaces();\n                    k = blockNode(ind);'],
    [H, 'a folded line break stays a line break', "return out + (breaks > 1 ? new Array(breaks).join('\\n') : ' ');", "return out + '\\n';"],
    [H, 'an escaped line break does not join', "                if (c === '\\n') { p += 2; while (p < n && /[ \\t]/.test(s.charAt(p))) { p++; } continue; }   // an escaped line break joins\n", ''],
    [H, 'a long integer is rounded into a number', "return t.replace(/^-/, '').length <= 15 ? Number(t) : t;", 'return Number(t);'],
    [H, 'a set stays a map', "            else if (tag === '!!set' && v && typeof v === 'object' && !Array.isArray(v)) { v = Object.keys(v); }\n", ''],
    [H, 'an alias reads as nothing', 'return m[1] in anchors ? anchors[m[1]] : null;', 'return null;'],
    [H, 'a key named __proto__ reaches the prototype', '            var obj = Object.create(null), k, v;', '            var obj = {}, k, v;'],
    [H, 'Windows line ends are left in', ".replace(/\\r\\n?/g, '\\n'), p = 0", ', p = 0'],
    [H, 'a doubled quote stays doubled', 'if (s.charAt(p + 1) === "\'") { out += "\'"; p += 2; continue; }', 'if (s.charAt(p + 1) === "\'") { out += "\'\'"; p += 2; continue; }'],
    [H, 'text it cannot read does not name its line', "throw new Error(msg + ' (line ' + s.slice(0, p).split('\\n').length + ')');", 'throw new Error(msg);'],
    // ---- what a control shows ----
    [H, 'the stored time is taken for the value', '        return stamp ? e[1] : e;', '        return e;'],
    [H, 'the window size is the fixed window\'s whatever the mode', '            var dict = SV.raw(doc, c.s, c.mk[mode]);', '            var dict = SV.raw(doc, c.s, c.mk[2]);'],
    [H, 'the display mode is always fullscreen', '        return m === 1 || m === 2 ? m : 0;', '        return 0;'],
    [H, 'UI scale ignores its automatic switch', "return { v: (auto || scale === undefined || scale === null) ? 'auto' : scale, set: true, d: d };",
        "return { v: (scale === undefined || scale === null) ? 'auto' : scale, set: true, d: d };"],
    [H, 'a checkbox ignores the key it starts from', '        if (v === undefined && c.fb) { v = SV.raw(doc, c.fb[0], c.fb[1]); }   // the control starts from another key while its own is unset\n', ''],
    [H, 'a default that follows another setting is fixed', "            d = Object.prototype.hasOwnProperty.call(c.dk.map, String(dv)) ? c.dk.map[String(dv)] : c.dk['else'];", "            d = c.dk['else'];"],
    [H, 'a card-dependent default is the high-end one only', '        if (c.dc) { ds = Object.keys(c.dc).map(function (k) { return c.dc[k]; }).concat([c.d]); }', '        if (false) { ds = []; }'],
    [H, 'True and 1 differ', "        if (typeof a === 'boolean') { a = a ? 1 : 0; }\n        if (typeof b === 'boolean') { b = b ? 1 : 0; }\n", ''],
    [H, 'a float\'s rounding tail counts as different', "if (typeof a === 'number' && typeof b === 'number') { return Math.abs(a - b) < 1e-9; }", "if (typeof a === 'number' && typeof b === 'number') { return a === b; }"],
    [H, 'an "eq" rule never holds', "        if (w.op === 'eq') { return SV.same(v, w.v); }", "        if (w.op === 'eq') { return false; }"],
    [H, 'an "in" rule never holds', "        if (w.op === 'in') { return w.v.some(function (x) { return SV.same(v, x); }); }", "        if (w.op === 'in') { return false; }"],
    [H, 'a "falsy" rule never holds', "        if (w.op === 'falsy') { return !SV.truthy(v); }", "        if (w.op === 'falsy') { return false; }"],
    [H, 'a "le" rule never holds', "        if (w.op === 'le') { return Number(typeof v === 'boolean' ? +v : v) <= w.v; }", "        if (w.op === 'le') { return false; }"],
    [H, 'a rule ignores the default of a setting the file lacks', "        if (v === undefined) { v = SV.defaultOf(w.s, w.key); }\n        if (w.op === 'eq')", "        if (w.op === 'eq')"],
    [H, 'a control the game hides is drawn', "            if (c.when && c.when.then === 'hide' && SV.cond(doc, c.when)) { return; }\n", ''],
    [H, 'a greyed-out combo shows its value, not what the game shows', '        shown = off && c.when.text ? c.when.text : SV.show(c, r.v);', '        shown = SV.show(c, r.v);'],
    [H, 'the SpaceMouse section is always drawn', "        if (sec.onlyIfSet && !any) { return { html: '', changed: 0 }; }\n", ''],
    [H, 'a value no option holds shows its number', '            if (c.ns) { return c.ns; }\n', ''],
    // ---- Shortcuts, Reset Settings, Everything else ----
    [H, 'a default given to another command is kept', "            else { r.keys = r.dkeys && !taken[r.dkeys.join('-')] ? r.dkeys : null; }", '            else { r.keys = r.dkeys; }'],
    [H, 'None does not clear a default', '            if (Object.prototype.hasOwnProperty.call(own, r.name)) { r.keys = SV.keysOf(own[r.name]); r.own = true; }',
        '            if (own[r.name]) { r.keys = SV.keysOf(own[r.name]); r.own = true; }'],
    [H, 'an old (ctrl, alt, shift, "KEY") binding is not read', "        if (v.length === 4 && typeof v[3] === 'string') {", '        if (false) {'],
    [H, 'commands are not sorted by name', '}).sort(function (a, b) { return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : a.label.toLowerCase() > b.label.toLowerCase() ? 1 : 0; });', '});'],
    [H, 'a switched-off warning is named by its key', '            return { key: key, title: titles[msg] || msg, answer: answer || SV.valueText(v) };', '            return { key: key, title: msg, answer: answer || SV.valueText(v) };'],
    [H, 'a choice dialog\'s answer loses its choice', "            if (answer && Array.isArray(v) && typeof v[1] === 'string') { answer += ' (' + v[1].replace(/^radiobox/, '').replace(/Selected$/, '').replace(/^Option(\\d+)$/, 'option $1') + ')'; }\n", ''],
    [H, 'Everything else shows the notepad', "    PRIVATE: { 'char.notepad': 1, ", '    PRIVATE: { '],
    [H, 'Everything else shows edit-box history', ", 'user.ui|editHistory': 1 }", ' }'],
    [H, 'Everything else shows the calculator', "'public.ui|CalculatorHistory': 1, ", ''],
    [H, 'Everything else shows what the window shows', "                    if (SV._cover[id + '|' + k] || SV.PRIVATE[id + '|' + k]) { return; }", "                    if (SV.PRIVATE[id + '|' + k]) { return; }"],
    [H, 'the per-mode keys count as unshown', "                        (c.mk || []).concat(c.ak || []).forEach(function (k) { SV._cover[c.s + '|' + k] = 1; });\n", ''],
    // ---- the HTML ----
    [H, 'a value from the file is not escaped', "    esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); },",
        "    esc: function (s) { return String(s == null ? '' : s); },"],
    [H, 'the raw file is in the page from the start', "'\\n<pre class=\"jsv-raw\" style=\"display:none\"></pre>\\n</div>'", "'\\n<pre class=\"jsv-raw\" style=\"display:none\">' + H(text) + '</pre>\\n</div>'"],
    [H, 'with no layout it draws anyway', "        if (!T) { err = 'The settings window did not come with the script. Reinstall JiTA to get it.'; }\n", ''],
    // ---- the script around it ----
    [H, 'the log parser no longer knows settings.yaml', ", 'settings.yaml': 'set' }", ' }'],
    [H, 'swap() opens nothing for settings.yaml', "        else if (igbr === 'set' && flagOn('parser')) { JiTA.settingsview.mount(); }\n", ''],
    [H, 'a drawing that fails empties the viewer', "        try { html = SV.view(text); } catch (e) { JiTA.log('[JiTA] settings view failed:', e); return; }", '        html = SV.view(text);'],
    [H, 'the @resource asks for an older copy', 'settings-window.json?v=', 'settings-window.json?v=0.0.0-']
];
let allRed = true;
// The harness has to pass on the script as it is first: one that cannot even start (a file it reads missing from the
// breakage runner's copy) would count every breakage below as red, caught by nothing.
try {
    execSync('node ' + H, { env: Object.assign({}, process.env, { JITA_SRC: process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js') }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
} catch (e) {
    console.log('BASELINE ' + H + ' does not pass on the unbroken script, so no breakage below can count: ' + String((e.stdout || '').split('\n').filter((l) => /FAIL|Error/.test(l))[0] || e.message).slice(0, 160));
    allRed = false;
}
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync(TMP, src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: TMP }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|^  FAIL  /m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync(TMP)) { fs.unlinkSync(TMP); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
