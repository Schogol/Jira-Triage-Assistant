// mutate-logtables.js - changes what each log parser draws, one way at a time, and requires logtables-check to go red:
// a drawing that no longer matches the saved one, or a named rule. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'logtables-check.js', TMP = 'mutlt.js';
const muts = [
    // ---- every parser ----
    [H, 'text is no longer escaped', '.replace(/[\\<]/g, function (c) { return "&lt;"; })', ''],
    [H, 'empty lines are kept', '.replace(/([\\r\\n]){2,}/g, "\\r\\n")', ''],
    [H, 'the spinner never ends', '        document.getElementById(\'loader\').style.display = \'none\';\n', ''],
    // ---- the game log ----
    [H, 'a warning row is not marked as one', 'var cls = (type === \'notice\' || type === \'warning\' || type === \'error\') ? type : \'info\';', 'var cls = (type === \'notice\' || type === \'error\') ? type : \'info\';'],
    [H, 'an exception has no border above', 'if (msg.indexOf(\'EXCEPTION #\') >= 0) { st.exc = time; cls += \' bordertop\'; }', 'if (msg.indexOf(\'EXCEPTION #\') >= 0) { st.exc = time; }'],
    [H, 'an exception\'s rows are not marked', 'if (st.exc && time === st.exc) { cls += \' exception\'; }', 'if (st.exc && time === st.exc) { }'],
    [H, 'a stacktrace has no border below', 'if (msg.indexOf(\'STACKTRACE END\') >= 0) { cls += \' borderbot\'; st.stt = \'\'; }', 'if (msg.indexOf(\'STACKTRACE END\') >= 0) { st.stt = \'\'; }'],
    [H, 'a short line loses its time', "cols = cols.length > 1 ? [cols[0], '', '', cols.slice(1).join(' ')]", "cols = cols.length > 1 ? ['', '', '', cols.slice(1).join(' ')]"],
    [H, 'a message loses a tab of its own', 'msg = cols.slice(3).join(\'\\t\');', 'msg = cols[3];'],
    [H, 'repeats are not grouped', '                jitaBuildLogGroups();\n                jitaRegroupLog();\n', '                jitaBuildLogGroups();\n'],
    [H, 'a block keeps no blank line after it', "            while (i < rows.length && cellText(rows[i], 3).trim() === '') { i++; }\n", ''],
    [H, 'a repeat badge says no times', "badge.title = runCount + ' identical in a row' + (span ? ' · ' + span : '');", "badge.title = runCount + ' identical in a row';"],
    // ---- Method Calls ----
    [H, 'a call of 500 ms is not yellow', '} else if (cols[2] >= 500) { cls = \'yellow\'; }', '} else if (cols[2] > 500) { cls = \'yellow\'; }'],
    [H, 'a call of 1500 ms is not red', 'if (cols[2] >= 1500) { cls = \'red\'; }', 'if (cols[2] > 1500) { cls = \'red\'; }'],
    [H, 'the average GetTime is not rounded', "(count ? Math.round(averageDuration / count) + 'ms' : 'n/a')", "(count ? (averageDuration / count) + 'ms' : 'n/a')"],
    [H, 'the first of the peak calls is marked', 'cols[2] >= Number(st.peak)) {', 'cols[2] >= Number(st.peak) && !$(\'.peakMachoCell\').length) {'],
    // ---- Outstanding Calls / Last Crashes ----
    [H, 'a call is split at a bare dash', '                var cols = line.split(\' - \');', '                var cols = line.split(\'-\');'],
    [H, 'the first line is left out', '        oc: {\n            from: 0,', '        oc: {\n            from: 1,'],
    // ---- Process Health ----
    [H, 'the CPU is not rounded', 'Math.round(num(2)), Math.round(num(3))', 'num(2), Math.round(num(3))'],
    [H, 'the frame time is shown as written', '{ html: Math.round(1 / num(9) * 10000) / 10000, cls: spf }', '{ html: c[9], cls: spf }'],
    [H, '15 frames a second is not red', 'if (num(9) >= 0.0666666666666667) { spf = \'red\'; }', 'if (num(9) > 0.0666666666666667) { spf = \'red\'; }'],
    [H, 'one session is red', 'if (num(16) >= 2) { sessions = \'red\'; }', 'if (num(16) >= 1) { sessions = \'red\'; }'],
    [H, 'time dilation over 1.05 is fine', ' else if (num(17) >= 1.05) { tidi = \'red\'; }', ''],
    [H, 'the FPS header does not toggle', "    $('#tableContent > thead > tr > th:nth-child(10)').on('click', clickHandler());", ''],
    [H, 'the toggle leaves the header as it was', "            $('#tableContent > thead > tr > th:nth-child(10)').html($(this).html() == FPS ? spf : FPS);\n", ''],
    // ---- one builder for every file (refactor 2) ----
    [H, 'Last Crashes is mounted as a type of its own', "        mountParser(lcHtml, 'oc');", "        mountParser(lcHtml, 'lc');"],
    [H, 'the game log in the viewer is drawn some other way', "jitaRunParse(function () { JiTA.logparser.draw('log', rows); });", "jitaRunParse(function () { JiTA.logparser.draw('log', String(rows).trim()); });"]
];
let allRed = true;
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
