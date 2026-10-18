// mutate-notedlg.js - breaks each guard of the note dialog of a Flag or a Resolve (v3.43.0) and requires
// notedlg-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'notedlg-check.js';
const muts = [
    // ---- keys ----
    [H, 'Esc reaches the window behind', "if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(false); return; }", "if (e.key === 'Escape') { close(false); return; }"],
    [H, 'Esc saves', "e.stopImmediatePropagation(); close(false); return; }", "e.stopImmediatePropagation(); close(true); return; }"],
    [H, 'Ctrl+Enter does not save', "            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }\n", ''],
    [H, 'plain Enter saves', "if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopImmediatePropagation(); close(true);",
        "if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); close(true);"],
    [H, 'Cmd+Enter does not save', "if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopImmediatePropagation(); close(true);",
        "if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); close(true);"],
    [H, 'keys leak to the page', 'e.stopPropagation();   // typing stays typing, and nothing else on the page hears it', ''],
    [H, 'the keys are heard after the page', "window.addEventListener('keydown', st.keys, true);", "window.addEventListener('keydown', st.keys, false);"],
    [H, 'the key listener stays after it closes', "window.removeEventListener('keydown', st.keys, true);", ''],
    // ---- buttons ----
    [H, 'Cancel saves anyway', "cancel.addEventListener('click', function () { close(false); });", "cancel.addEventListener('click', function () { close(true); });"],
    [H, 'Save does not save', "save.addEventListener('click', function () { close(true); });", "save.addEventListener('click', function () { close(false); });"],
    [H, 'Save is a form submit', "save.type = 'button';", ''],
    [H, 'Save ignores the label asked for', "el('button', 'ldn-btn ldn-save', o.save || 'Save')", "el('button', 'ldn-btn ldn-save', 'Save')"],
    // ---- drafts ----
    [H, 'the draft is not offered', "ta.value = U._drafts[o.draft] || '';", "ta.value = '';"],
    [H, 'what was typed is not kept', "if (/\\S/.test(ta.value)) { U._drafts[o.draft] = ta.value; } else { delete U._drafts[o.draft]; }", ''],
    [H, 'a blank note is kept as a draft', "if (/\\S/.test(ta.value)) { U._drafts[o.draft] = ta.value; } else { delete U._drafts[o.draft]; }", 'U._drafts[o.draft] = ta.value;'],
    [H, 'a dialog without a draft key keeps one anyway', '            if (o.draft) {\n                if (/', '            if (true) {\n                if (/'],
    // ---- the rest ----
    [H, 'a stray click beside it takes the focus', 'if (e.target === layer) { e.preventDefault(); }', ''],
    [H, 'no length cap', 'ta.maxLength = L.NOTE_MAX;', ''],
    [H, 'the counter does not follow the typing', "ta.addEventListener('input', counted);", ''],
    [H, 'two dialogs at once', '        U._closeNote();\n        try { JiTA.ui._hideTip(true); } catch (e) { /* ignore */ }\n        U._injectCss();\n        function el(',
        '        try { JiTA.ui._hideTip(true); } catch (e) { /* ignore */ }\n        U._injectCss();\n        function el('],
    [H, 'the hover card stays up', '        U._closeNote();\n        try { JiTA.ui._hideTip(true); } catch (e) { /* ignore */ }\n        U._injectCss();\n        function el(',
        '        U._closeNote();\n        U._injectCss();\n        function el('],
    [H, 'a replaced dialog still saves', 'if (U._noteDlg !== st) { return; }', ''],
    [H, 'the text area is not focused', 'try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* ignore */ }', ''],
    [H, 'the caret is not put at the end', 'ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);', 'ta.focus();'],
    [H, 'a focus trap of Jira\'s takes the text area', "layer.setAttribute('data-no-focus-lock', 'true');", ''],
    [H, 'it is not a modal dialog', "box.setAttribute('aria-modal', 'true');", ''],
    [H, 'the hint is dropped', "if (o.hint) { box.appendChild(el('div', 'ldn-hint', o.hint)); }", ''],
    [H, 'the dialog has no styles', '        U._injectCss();\n        function el(', '        function el(']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutn.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutn.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutn.js')) { fs.unlinkSync('mutn.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
