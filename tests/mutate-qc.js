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
    [H, 'the reason cell is dropped', "R._when(d && d.at), R._txt(R._reason(d, flags[key], pym))]);", "R._when(d && d.at)]);"],
    [H, 'the reason is not escaped', "R._when(d && d.at), R._txt(R._reason(d, flags[key], pym))]);", "R._when(d && d.at), R._reason(d, flags[key], pym)]);"],
    [H, 'older flags lose their reason', "return d.note || (flag && flag.ym === ym && flag.note) || '(no reason given)';", "return d.note || '(no reason given)';"],
    [H, "another month's reason is borrowed", "return d.note || (flag && flag.ym === ym && flag.note) || '(no reason given)';", "return d.note || (flag && flag.note) || '(no reason given)';"],
    [H, 'a Checked item shows a reason', "            if (!d || d.verdict !== 'flag') { return ''; }\n            return d.note", "            if (!d) { return ''; }\n            return d.note"],
    [H, 'the outcome replaces the reason', "return { reason: (f && f.note) || '(no reason given)',", "return { reason: (f && (f.outcome || f.note)) || '(no reason given)',"],
    [H, 'the outcome is dropped', "outcome: (f && f.outcome) || '' };", "outcome: '' };"],
    // ---- Undo ----
    [H, "another Lead's verdict can be undone", "v.done[ym][key];\n                if (!d || d.by !== handle) { return null; }\n", "v.done[ym][key];\n                if (!d) { return null; }\n"],
    [H, 'a resolved flag can be undone', "                if (f && f.ym === ym && f.resolvedAt) { return null; }\n", ''],
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
