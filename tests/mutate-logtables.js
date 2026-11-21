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
    [H, 'the spinner never ends', '    document.getElementById("loader").style.display = "none";\n', ''],
    // ---- the game log ----
    [H, 'a warning row is not marked as one', "                case 'warning':\n                    row.className = 'warning';\n", "                case 'warning':\n                    row.className = 'info';\n"],
    [H, 'an exception has no border above', "                excTime = table[i][0];\n                row.className += ' bordertop';", '                excTime = table[i][0];'],
    [H, 'an exception\'s rows are not marked', "                row.className += ' exception';", ''],
    [H, 'a stacktrace has no border below', "            if (table[i][3].indexOf(\"STACKTRACE END\") >= 0) {\n                row.className += ' borderbot';", "            if (table[i][3].indexOf(\"STACKTRACE END\") >= 0) {"],
    [H, 'a short line loses its time', "cols = cols.length > 1 ? [cols[0], '', '', cols.slice(1).join(' ')]", "cols = cols.length > 1 ? ['', '', '', cols.slice(1).join(' ')]"],
    [H, 'a message loses a tab of its own', "logs.tableInfo.push([cols[0], cols[1], cols[2], cols.slice(3).join('\\t')]);", 'logs.tableInfo.push([cols[0], cols[1], cols[2], cols[3]]);'],
    [H, 'repeats are not grouped', '    jitaBuildLogGroups();\n    jitaRegroupLog();\n', '    jitaBuildLogGroups();\n'],
    [H, 'a block keeps no blank line after it', "            while (i < rows.length && cellText(rows[i], 3).trim() === '') { i++; }\n", ''],
    [H, 'a repeat badge says no times', "badge.title = runCount + ' identical in a row' + (span ? ' · ' + span : '');", "badge.title = runCount + ' identical in a row';"],
    // ---- Method Calls ----
    [H, 'a call of 500 ms is not yellow', '            else if (table[i][2] >= 500) {', '            else if (table[i][2] > 500) {'],
    [H, 'a call of 1500 ms is not red', '            if (table[i][2] >= 1500) {', '            if (table[i][2] > 1500) {'],
    [H, 'the average GetTime is not rounded', "(count ? Math.round(averageDuration / count) + 'ms' : 'n/a')", "(count ? (averageDuration / count) + 'ms' : 'n/a')"],
    [H, 'the first of the peak calls is marked', '            if (macho & table[i][2] >= Number(peak)) {', '            if (macho & table[i][2] >= Number(peak) && !$(\'.peakMachoCell\').length) {'],
    // ---- Outstanding Calls / Last Crashes ----
    [H, 'a call is split at a bare dash', '        var cols = rows[i].split(" - ");', '        var cols = rows[i].split("-");'],
    [H, 'the first line is left out', '    for (var i = 0; i < rows.length; ++i) {\n        var cols = rows[i].split(" - ");', '    for (var i = 1; i < rows.length; ++i) {\n        var cols = rows[i].split(" - ");'],
    // ---- Process Health ----
    [H, 'the CPU is not rounded', '            procCpu.innerHTML = Math.round(Number(table[i][2]));', '            procCpu.innerHTML = Number(table[i][2]);'],
    [H, 'the frame time is shown as written', '            spf.innerHTML = Math.round(1 / Number(table[i][9]) *10000) /10000;', '            spf.innerHTML = table[i][9];'],
    [H, '15 frames a second is not red', '            if (Number(table[i][9]) >= "0.0666666666666667") {', '            if (Number(table[i][9]) > "0.0666666666666667") {'],
    [H, 'one session is red', '            if (Number(table[i][16]) >= 2) {', '            if (Number(table[i][16]) >= 1) {'],
    [H, 'time dilation over 1.05 is fine', "            else if (Number(table[i][17]) >= 1.05) {\n                tidiFactor.className += 'red';\n            }", ''],
    [H, 'the FPS header does not toggle', "    $('#tableContent > thead > tr > th:nth-child(10)').on('click', clickHandler());", ''],
    [H, 'the toggle leaves the header as it was', "            $('#tableContent > thead > tr > th:nth-child(10)').html($(this).html() == FPS ? spf : FPS);\n", '']
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
