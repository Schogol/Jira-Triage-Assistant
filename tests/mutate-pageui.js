// mutate-pageui.js - breaks each small page fix (v3.38.20) and requires pageui-check to go red. A crashed harness counts
// as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'pageui-check.js';
const muts = [
    // ---- header dates ----
    [H, 'dates are never refetched', 'var due = (!c || now - c.at >= JITA_DATES_TTL_MS) &&', 'var due = (!c) &&'],
    [H, 'a failed fetch is retried at once', ' && !(jitaDatesFail[key] && now - jitaDatesFail[key] < JITA_DATES_TTL_MS);', ';'],
    [H, 'a refetch already on its way is started again', "    if (el && (!due || el.getAttribute('data-fetching'))) { return; }", '    if (el && !due) { return; }'],
    [H, 'a failed fetch leaves its element', "            if (!jitaDatesCache[key] && el.parentNode) { el.parentNode.removeChild(el); }   // gone, so a later pass tries again\n", ''],
    [H, 'a failure is not remembered', '            jitaDatesFail[key] = Date.now();\n', ''],
    [H, 'fetched dates carry no time', 'updated: f.updated || null, at: Date.now() };', 'updated: f.updated || null };'],
    [H, 'cached dates wait for the refetch', '    if (c) { paint(c.created, c.updated); }\n', ''],
    // ---- declutter ----
    [H, 'only what this pass found is reconciled', '            if (keep.indexOf(hidden[h]) !== -1) { continue; }', '            if (true) { continue; }'],
    [H, 'detection runs with nothing configured', '        if (cfg && (cfg.fields.length || cfg.sections.length)) {', '        if (cfg) {'],
    [H, 'the hidden count is never reset', '        D._lastHidden = keep.length;', '        D._lastHidden = D._lastHidden || keep.length;'],
    // ---- Extra Buttons listener ----
    [H, 'another tab\'s toggle leaves this tab\'s setting', '    savedVariables[FLAG.buttons][1] = !!newValue;\n', ''],
    [H, 'switching on skips the bug-report check', '        ensureButtonsPresent();   // a bug report only: addButtons() alone put them on a defect too', '        addButtons();'],
    [H, 'the buttons listener runs on the wiki', "    if (JITA_NO_JIRA_UI) { return; }\n    // Another tab's toggle", "    // Another tab's toggle"],
    // ---- Translate ----
    [H, 'a partial translation is not said', '                if (missed.length) {', '                if (false) {'],
    [H, 'the wrong parts are named', "var missed = ['title', 'description', 'steps to reproduce'].filter(function (n, i) { return tr[i] === null; });",
        "var missed = ['title', 'description', 'steps to reproduce'].filter(function (n, i) { return tr[i] !== null; });"],
    [H, 'a failing translation is not caught', "            .catch(function (e) { console.log('[JiTA] translate failed:', e); });", '            .catch(function () {});'],
    // ---- launcher, wiki pills, scrollbar ----
    [H, 'a held key is a double tap', ' || e.repeat || e.isComposing) { return; }', ') { return; }'],
    [H, 'an input method\'s keys are a double tap', ' || e.repeat || e.isComposing) { return; }', ' || e.repeat) { return; }'],
    [H, 'the wiki does not watch for menus', "        try { new MutationObserver(function () { try { jitaPillsYieldSoon(); } catch (e) { /* ignore */ } }).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }\n", ''],
    [H, 'the scrollbar gradient is invalid again', 'linear-gradient(to right, #96A6BF, #63738C)', 'linear-gradient(left, #96A6BF, #63738C)']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutj.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutj.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutj.js')) { fs.unlinkSync('mutj.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
