// mutate-logparser.js - breaks each log parser fix (v3.38.17; JiTA.logparser since refactor 2) and requires
// logparser-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'logparser-check.js';
const muts = [
    // ---- the main log ----
    [H, 'excTime starts undefined', '            start: function () { return { exc: \'\', stt: \'\' }; },', '            start: function () { return { stt: \'\' }; },'],
    [H, 'a logging error after an exception is one again', 'if (st.exc && time === st.exc) {', 'if (time === st.exc) {'],
    [H, 'a short line is not padded', '                if (cols.length < 4) { cols = cols.length > 1 ? [cols[0], \'\', \'\', cols.slice(1).join(\' \')] : [\'\', \'\', \'\', line]; }\n', ''],
    [H, 'a short line loses its time', 'cols = cols.length > 1 ? [cols[0], \'\', \'\', cols.slice(1).join(\' \')] : [\'\', \'\', \'\', line];', 'cols = [\'\', \'\', \'\', line];'],
    [H, 'a message loses the tail after its own tab', "cols.slice(3).join('\\t')", 'cols[3]'],
    // ---- a parser that throws ----
    [H, 'a mounted parser runs unguarded', '        setTimeout(function () { P.run(function () { P.draw(type, P.text); }); }, 250);', '        setTimeout(function () { P.draw(type, P.text); }, 250);'],
    [H, 'the viewer parse runs unguarded', "            setTimeout(function () { P.run(function () { P.draw('log', P.text); }); }, 250);", "            setTimeout(function () { P.draw('log', P.text); }, 250);"],
    [H, 'a failed parse leaves the spinner going', "            if (l) { l.style.display = 'none'; }\n", ''],
    [H, 'a failed parse is not said', '                tc.tBodies[0].appendChild(tr);\n', ''],
    // ---- Method Calls ----
    [H, 'no GetTime call averages to NaN', "(count ? Math.round(averageDuration / count) + 'ms' : 'n/a')", "Math.round(averageDuration / count) + 'ms'"],
    [H, 'no GetTime call peaks at 0ms', "(count ? peak + 'ms' : 'n/a')", "peak + 'ms'"],
    [H, 'the peak keeps the line\'s carriage return', 'peak = Number(cols[2]);', 'peak = cols[2];'],
    [H, 'the peak click is not guarded', "var p = $('.peakMachoCell')[0]; if (p) { p.scrollIntoView(", "var p = $('.peakMachoCell')[0]; { p.scrollIntoView("],
    [H, 'Method Calls keeps blank lines', '                if (!line.trim()) { return null; }   // a blank line is not a call\n', ''],
    [H, 'Method Calls drops its last row', '        for (var i = T.from; i < lines.length; i++) {', '        for (var i = T.from; i < lines.length - (type === \'mc\' ? 1 : 0); i++) {'],
    // ---- Process Health ----
    [H, 'sessions compared as text', 'if (num(16) >= 2) { sessions = \'red\'; }', 'if (c[16] >= "2") { sessions = \'red\'; }'],
    [H, 'time dilation compared as text (0.2)', 'if (num(17) <= 0.2) { tidi = \'red\'; }', 'if (c[17] <= "0.2") { tidi = \'red\'; }'],
    [H, 'time dilation compared as text (0.8)', 'else if (num(17) <= 0.8) { tidi = \'yellow\'; }', 'else if (c[17] <= "0.8") { tidi = \'yellow\'; }'],
    [H, 'Process Health drops its last row', '        for (var i = T.from; i < lines.length; i++) {', '        for (var i = T.from; i < lines.length - (type === \'ph\' ? 1 : 0); i++) {'],
    [H, 'Process Health is found by another header', "watchdog time\\tspf\\t", "watchdog_time\\tspf\\t"],
    // ---- PDM ----
    [H, 'a PDM value is cut at its second colon', '            var key = line.slice(0, at).trim();\n            var value = line.slice(at + 1).trim();',
        '            var key = line.split(":")[0].trim();\n            var value = line.split(":")[1].trim();'],
    [H, 'a stray closing brace loses the object', 'currentObject = stack.length ? stack[stack.length - 1] : result;', 'currentObject = stack[stack.length - 1];'],
    [H, 'the PDM read is outside the guard', 'try { renderRequirements(convertTextToObject(P.text)); } catch', 'var pdmdata = convertTextToObject(P.text); try { renderRequirements(pdmdata); } catch'],
    // ---- the views ----
    [H, 'the game log\'s view loses its own CSS', 'return JiTA.logparser.shell(T.title, T.columns, { extraCss: T.css, header: T.header });', "return JiTA.logparser.shell(T.title, T.columns, { extraCss: '', header: T.header });"],
    [H, 'a view loses its panel', 'return JiTA.logparser.shell(T.title, T.columns, { extraCss: T.css, header: T.header });', 'return JiTA.logparser.shell(T.title, T.columns, { extraCss: T.css });'],
    [H, 'the Quick Info boxes lose the CSS', "return '\\n<style>\\n' + JiTA.logparser.CSS + '\\n</style>", "return '\\n<style>\\n' + '\\n</style>"],
    // ---- the panel and the filter ----
    [H, 'a type toggle hides by class page-wide', "                $(this).toggleClass('toggle');\n", "                $(this).toggleClass('toggle');\n                $('.' + id).css({ display: 'none' });\n"],
    [H, 'Only Exceptions hides every other row on the page', "                $('#gnav a#exception').removeClass('toggle');\n",
        "                $('#gnav a#exception').removeClass('toggle');\n                $('tr:not(.exception):not(#fixedHead)').css({ display: 'none' });\n"],
    [H, 'Show All forces every row on the page open', "                $('#gnav a#notice, #gnav a#warning, #gnav a#error, #gnav a#exception').removeClass('toggle');\n",
        "                $('#gnav a#notice, #gnav a#warning, #gnav a#error, #gnav a#exception').removeClass('toggle');\n                $('tr').css({ display: 'table-row' });\n"],
    [H, 'a click does not reapply the filter', '            JiTA.logparser.filter();\n        });', '        });'],
    [H, 'the filter reaches beyond the parsed table', "        $('#tableContent tbody tr').each(function () {", "        $('tr').each(function () {"],
    [H, 'the search box does not filter', '                jitaSearchTimer = setTimeout(JiTA.logparser.filter, 120);', '                jitaSearchTimer = 0;'],
    // ---- which editor, which file ----
    [H, 'the comment box is parsed', '.filter(function () { return !P.inEditable(this); })', '.filter(function () { return true; })'],
    [H, 'an editor is judged by its own contenteditable', "        return !!(host && host.closest && host.closest('[contenteditable=\"true\"], .ProseMirror'));",
        "        return !!(el && el.closest && el.closest('.cm-content') && el.closest('.cm-content').getAttribute('contenteditable') === 'true');"],
    [H, 'the observer hides a draft in the comment box', '            if (P.inEditable(el)) { continue; }', '            if (false) { continue; }'],
    [H, 'a viewer that hands over no text is emptied', '            if (!P.text || P.text.indexOf(P.HDR) === -1) {', '            if (false) {'],
    [H, 'an unread viewer leaves a parse pending', '                P.pending = 0;\n                P.reveal();\n                return;', '                P.reveal();\n                return;'],
    [H, 'the viewer\'s text is not kept', '            P.text = P.cmText();', '            P.cmText();'],
    [H, 'the code-block\'s text is not kept', '        JiTA.logparser.text = $(SELECTORS.CODE_BLOCK).text();', '        $(SELECTORS.CODE_BLOCK).text();'],
    [H, 'the asked-for file is not taken', '        P.igbr = null;\n', ''],
    [H, 'a click with the parser off still polls', "        if (!flagOn('parser')) { return; }   // a click while the parser is off must leave nothing pending for later\n", ''],
    [H, 'a cancelled poll still opens its file', '            if (myGen !== P.gen) { return; }', '            if (false) { return; }'],
    [H, 'the poll takes a file with a header row', '                && !P.headed(now);', '                && true;'],
    [H, 'a file is taken for a headed one by any part of a header', "t.indexOf('Time\\tMethod\\tDuration') >= 0", "t.indexOf('Time\\t') >= 0"],
    [H, 'Last Crashes opens in the Outstanding Calls view', "(igbr === 'oc' || igbr === 'lc') && flagOn('parser')) { P.mount(igbr); }", "(igbr === 'oc' || igbr === 'lc') && flagOn('parser')) { P.mount('oc'); }"],
    // ---- the watches start() sets up ----
    [H, 'the CodeMirror viewer is not watched', ", SELECTORS.CM_LINE + ':contains(' + P.HDR + ')']", ']'],
    [H, 'a Last Crashes button opens Outstanding Calls', "'lastcrashes.txt': 'lc'", "'lastcrashes.txt': 'oc'"],
    [H, 'any button clicked cancels a poll', "if (btn && btn.querySelector('[data-item-title]')) { P.gen++; }", 'if (btn) { P.gen++; }'],
    [H, 'a file entry clicked cancels nothing', "if (btn && btn.querySelector('[data-item-title]')) { P.gen++; }", "if (btn && btn.querySelector('[data-item-title]')) { }"],
    [H, 'the observer looks on every keystroke', '                        if (!added) { return; }\n', ''],
    [H, 'the observer is set up off Jira', '        if (!JITA_NO_JIRA_UI && window.MutationObserver) {', '        if (window.MutationObserver) {'],
    [H, 'the watches start before the module', '\nJiTA.logparser = {\n', '\nJiTA.logparser.start();\nJiTA.logparser = {\n'],
    [H, 'the watches never start', '\nJiTA.logparser.start();\n', '\n']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutk.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutk.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutk.js')) { fs.unlinkSync('mutk.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
