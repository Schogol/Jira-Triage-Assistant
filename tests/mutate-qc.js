// mutate-qc.js - breaks each guard of the quality-control reason column and Undo (v3.36.0) and requires
// qc-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'qc-check.js';
const muts = [
    // ---- the reason ----
    [H, 'the reason is not kept with the verdict', "                if (verdict === 'flag' && txt) { v.done[ym][key].note = txt; }\n", ''],
    [H, 'no Reason column', "R._table(['Issue', 'Assigned to', 'Handled by', 'Verdict', 'When', 'Reason'], rows)", "R._table(['Issue', 'Assigned to', 'Handled by', 'Verdict', 'When'], rows)"],
    [H, 'the reason cell is dropped', "R._when(d && d.at), R._lines(R._reason(d, flags[key], pym))]);", "R._when(d && d.at)]);"],
    [H, 'the reason is not escaped', "R._when(d && d.at), R._lines(R._reason(d, flags[key], pym))]);", "R._when(d && d.at), R._reason(d, flags[key], pym)]);"],
    // ---- notes over several lines (v3.43.0) ----
    [H, 'the Reason column runs the lines together', "R._when(d && d.at), R._lines(R._reason(d, flags[key], pym))]);", "R._when(d && d.at), R._txt(R._reason(d, flags[key], pym))]);"],
    [H, 'Open follow-ups on the page runs the lines together', "R._txt(o.flag.ym || ''), R._lines(o.flag.note || '')];", "R._txt(o.flag.ym || ''), R._txt(o.flag.note || '')];"],
    [H, 'a note with line breaks is not escaped', "_lines: function (s) { return JiTA.conf.esc(s).replace(", "_lines: function (s) { return String(s).replace("],
    [H, 'a note is flattened to one line', "return lines.join('\\n').replace(", "return lines.join(' ').replace("],
    [H, 'blank lines in a note are not squeezed', "return lines.join('\\n').replace(/\\n{3,}/g, '\\n\\n')", "return lines.join('\\n')"],
    [H, 'blank lines at the ends of a note stay', ".replace(/^\\n+|\\n+$/g, '')", ''],
    [H, 'the spaces in a line are not squeezed', "            return l.replace(/\\s+/g, ' ').replace(/^ | $/g, '');\n        });\n        return lines.join('\\n')",
        "            return l;\n        });\n        return lines.join('\\n')"],
    [H, 'a note is not capped', '.slice(0, JiTA.leadduty.NOTE_MAX)', ''],
    [H, 'a capped note leaves a space dangling', ".slice(0, JiTA.leadduty.NOTE_MAX).replace(/\\s+$/, '');", '.slice(0, JiTA.leadduty.NOTE_MAX);'],
    [H, 'a flag reason is not tidied', 'var txt = L._note(note);\n            var actor', 'var txt = String(note == null ? \'\' : note);\n            var actor'],
    [H, 'a resolution note is not tidied', 'var txt = L._note(note);\n            return L.ledger.mutate', 'var txt = String(note == null ? \'\' : note);\n            return L.ledger.mutate'],
    [H, 'the follow-up message indents only the first line', ".split('\\n').map(function (l) { return l ? '  ' + l : ''; }).join('\\n'));", ").replace(/^/, '  '));"],
    [H, 'the follow-up message indents blank lines', "return l ? '  ' + l : '';", "return '  ' + l;"],
    [H, 'older flags lose their reason', "return d.note || (flag && flag.ym === ym && flag.note) || '(no reason given)';", "return d.note || '(no reason given)';"],
    [H, "another month's reason is borrowed", "return d.note || (flag && flag.ym === ym && flag.note) || '(no reason given)';", "return d.note || (flag && flag.note) || '(no reason given)';"],
    [H, 'a Checked item shows a reason', "            if (!d || d.verdict !== 'flag') { return ''; }\n            return d.note", "            if (!d) { return ''; }\n            return d.note"],
    [H, 'the outcome replaces the reason', "return { reason: (f && f.note) || '(no reason given)',", "return { reason: (f && (f.outcome || f.note)) || '(no reason given)',"],
    [H, 'the outcome is dropped', "outcome: (f && f.outcome) || '' };", "outcome: '' };"],
    // ---- Undo ----
    [H, "another Lead's verdict can be undone", "v.done[ym][key];\n                if (!d || d.by !== handle) { return null; }\n", "v.done[ym][key];\n                if (!d) { return null; }\n"],
    [H, 'a resolved flag can be undone', "                if (f && f.ym === ym && f.resolvedAt) { return null; }\n", ''],
    // ---- Resolve all (v3.43.0) ----
    [H, "a resolve overwrites another Lead's resolution", '                    if (!f || f.resolvedAt) { return; }', '                    if (!f) { return; }'],
    [H, 'a resolve with nothing left open still writes', '                return n ? v : null;', '                return v;'],
    [H, 'a resolve closes out only the first follow-up', '                (keys || []).forEach(function (key) {\n                    var f = v && v.flags', '                (keys || []).slice(0, 1).forEach(function (key) {\n                    var f = v && v.flags'],
    [H, 'the open follow-up survives an Undo', "                if (f && f.ym === ym) { delete v.flags[key]; }\n", ''],
    [H, "another month's follow-up is withdrawn", "                if (f && f.ym === ym) { delete v.flags[key]; }\n", "                if (f) { delete v.flags[key]; }\n"],
    [H, 'an Undo never reaches the page', "                if (f && f.ym === ym) { delete v.flags[key]; }\n                return v;\n            }).then(L.report.tap);", "                if (f && f.ym === ym) { delete v.flags[key]; }\n                return v;\n            });"],
    [H, 'the button is offered on anyone\'s verdict', "undoable: function (done, flag, ym) {\n            var me = (JiTA.leadduty.me() && JiTA.leadduty.me().handle) || null;\n            if (!done || !me || done.by !== me) { return false; }", "undoable: function (done, flag, ym) {\n            var me = (JiTA.leadduty.me() && JiTA.leadduty.me().handle) || null;\n            if (!done || !me) { return false; }"],
    [H, 'the button is offered on a resolved flag', "            return !(flag && flag.ym === ym && flag.resolvedAt);", "            return true;"],
    [H, 'the mirror keeps the mark', "                if (rec.done) { delete rec.done[id]; }\n", ''],
    [H, 'the queued replay survives', "                if (at >= 0) { rec.pending.splice(at, 1); }\n                return JiTA.leadduty.local.put(key, rec).then(function () { return rec; });\n            });\n        }\n    },", "                return JiTA.leadduty.local.put(key, rec).then(function () { return rec; });\n            });\n        }\n    },"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutt.js')) { fs.unlinkSync('mutt.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
