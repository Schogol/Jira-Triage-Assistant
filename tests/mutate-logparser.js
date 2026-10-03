// mutate-logparser.js - breaks each log parser fix (v3.38.17) and requires logparser-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'logparser-check.js';
const muts = [
    // ---- the main log ----
    [H, 'excTime starts undefined', 'var excTime = "", sttTime = "";', 'var excTime, sttTime = "";'],
    [H, 'a logging error after an exception is one again', 'if (excTime && table[i][0] == excTime) {', 'if (table[i][0] == excTime) {'],
    [H, 'a short line is not padded', "        if (cols.length < 4) { cols = cols.length > 1 ? [cols[0], '', '', cols.slice(1).join(' ')] : ['', '', '', rows[i]]; }\n", ''],
    [H, 'a short line loses its time', "cols = cols.length > 1 ? [cols[0], '', '', cols.slice(1).join(' ')] : ['', '', '', rows[i]];", "cols = ['', '', '', rows[i]];"],
    [H, 'a message loses the tail after its own tab', "cols.slice(3).join('\\t')", 'cols[3]'],
    // ---- a parser that throws ----
    [H, 'a mounted parser runs unguarded', '    setTimeout(function () { jitaRunParse(parseFn); }, 250);', '    setTimeout(parseFn, 250);'],
    [H, 'the viewer parse runs unguarded', '        setTimeout(function () { jitaRunParse(ParseLogs); }, 250);', '        setTimeout(ParseLogs, 250);'],
    [H, 'a failed parse leaves the spinner going', "        if (l) { l.style.display = 'none'; }\n", ''],
    [H, 'a failed parse is not said', '            tc.tBodies[0].appendChild(tr);\n', ''],
    // ---- Method Calls ----
    [H, 'no GetTime call averages to NaN', "(count ? Math.round(averageDuration / count) + 'ms' : 'n/a')", "Math.round(averageDuration / count) + 'ms'"],
    [H, 'no GetTime call peaks at 0ms', "(count ? peak + 'ms' : 'n/a')", "peak + 'ms'"],
    [H, 'the peak keeps the line\'s carriage return', 'peak = Number(cols[2]);', 'peak = cols[2];'],
    [H, 'the peak click is not guarded', "var p = $('.peakMachoCell')[0]; if (p) { p.scrollIntoView(", "var p = $('.peakMachoCell')[0]; { p.scrollIntoView("],
    [H, 'Method Calls keeps blank lines', '        if (!rows[i].trim()) { continue; }   // a blank line is not a call\n', ''],
    [H, 'Method Calls drops its last row', '    logs.showRow(logs.tableInfo.length);   // every call read; rows.length - 2 dropped the last one', '    logs.showRow((rows.length - 2));'],
    // ---- Process Health ----
    [H, 'sessions compared as text', 'if (Number(table[i][16]) >= 2) {', 'if (table[i][16] >= "2") {'],
    [H, 'time dilation compared as text (0.2)', 'if (Number(table[i][17]) <= 0.2) {', 'if (table[i][17] <= "0.2") {'],
    [H, 'time dilation compared as text (0.8)', 'else if (Number(table[i][17]) <= 0.8) {', 'else if (table[i][17] <= "0.8") {'],
    [H, 'Process Health drops its last row', '    logs.showRow(logs.tableInfo.length);   // every sample read; rows.length - 2 dropped the last one', '    logs.showRow((rows.length - 2));'],
    // ---- PDM ----
    [H, 'a PDM value is cut at its second colon', '            var key = line.slice(0, at).trim();\n            var value = line.slice(at + 1).trim();',
        '            var key = line.split(":")[0].trim();\n            var value = line.split(":")[1].trim();'],
    [H, 'a stray closing brace loses the object', 'currentObject = stack.length ? stack[stack.length - 1] : result;', 'currentObject = stack[stack.length - 1];'],
    [H, 'the PDM read is outside the guard', 'try { renderRequirements(convertTextToObject(rows)); } catch', 'var pdmdata = convertTextToObject(rows); try { renderRequirements(pdmdata); } catch'],
    // ---- the panel and the filter ----
    [H, 'a type toggle hides by class page-wide', "            $(this).toggleClass('toggle');\n", "            $(this).toggleClass('toggle');\n            $('.' + id).css({ display: 'none' });\n"],
    [H, 'Only Exceptions hides every other row on the page', "            $('#gnav a#exception').removeClass('toggle');\n",
        "            $('#gnav a#exception').removeClass('toggle');\n            $('tr:not(.exception):not(#fixedHead)').css({ display: 'none' });\n"],
    [H, 'Show All forces every row on the page open', "            $('#gnav a#notice, #gnav a#warning, #gnav a#error, #gnav a#exception').removeClass('toggle');\n",
        "            $('#gnav a#notice, #gnav a#warning, #gnav a#error, #gnav a#exception').removeClass('toggle');\n            $('tr').css({ display: 'table-row' });\n"],
    [H, 'a click does not reapply the filter', '        jitaApplyLogFilter();\n    });', '    });'],
    [H, 'the filter reaches beyond the parsed table', "    $('#tableContent tbody tr').each(function () {", "    $('tr').each(function () {"],
    [H, 'the search box does not filter', '            jitaSearchTimer = setTimeout(jitaApplyLogFilter, 120);', '            jitaSearchTimer = 0;'],
    // ---- which editor, which file ----
    [H, 'the comment box is parsed', '.filter(function () { return !jitaInEditable(this); })', '.filter(function () { return true; })'],
    [H, 'an editor is judged by its own contenteditable', "    return !!(host && host.closest && host.closest('[contenteditable=\"true\"], .ProseMirror'));",
        "    return !!(el && el.closest && el.closest('.cm-content') && el.closest('.cm-content').getAttribute('contenteditable') === 'true');"],
    [H, 'the observer hides a draft in the comment box', '            if (jitaInEditable(el)) { continue; }', '            if (false) { continue; }'],
    [H, 'a viewer that hands over no text is emptied', "        if (!rows || rows.indexOf(LOG_HDR) === -1) {", '        if (false) {'],
    [H, 'an unread viewer leaves a parse pending', '            jitaParserPending = 0;\n            jitaRevealLogs();\n            return;', '            jitaRevealLogs();\n            return;'],
    [H, 'the asked-for file is not taken', '    jitaIgbrFile = null;\n', ''],
    [H, 'a click with the parser off still polls', "    if (!flagOn('parser')) { return; }   // a click while the parser is off must leave nothing pending for later\n", '']
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
