// mutate-ldpill.js - breaks each guard of the v3.35.1 Lead-duties chip / mirror-sync change and requires the
// harness that owns it to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const NG = 'nag-check.js', SY = 'sync-check.js';
const muts = [
    // ---- syncMirrors ----
    [SY, 'a missing mirror is invented', "                if (!rec || !rec[field]) { return false; }\n", ''],
    [SY, 'other Leads\' pages leak in', "rec[field].forEach(function (id) {\n                    if (done[id] && !rec.done[id])", "Object.keys(done).forEach(function (id) {\n                    if (done[id] && !rec.done[id])"],
    [SY, 'a local mark is overwritten', "if (done[id] && !rec.done[id]) { rec.done[id] = done[id].at", "if (done[id]) { rec.done[id] = done[id].at"],
    [SY, 'the change is never saved', "return changed ? L.local.put(key, rec).then(function () { return true; }) : false;", "return changed;"],
    [SY, 'a change is never flagged', "rec.done[id] = done[id].at || new Date().toISOString(); changed = true; }", "rec.done[id] = done[id].at || new Date().toISOString(); }"],
    [SY, 'the QC half is skipped', "merge(L.qc.localKey(qym), r[1].value, qym, 'items')", "false"],
    [SY, 'an unreachable ledger throws', "function () { L._syncing = null; return false; });", "function (e) { L._syncing = null; throw e; });"],
    [SY, 'not single-flight', "        if (L._syncing) { return L._syncing; }\n        var wym", "        var wym"],
    [SY, 'stuck on the first result', ".then(function (c) { L._syncing = null; return !!(c[0] || c[1]); },", ".then(function (c) { return !!(c[0] || c[1]); },"],
    // ---- the dialog ----
    [NG, 'the dialog trusts the stale mirror', "L.syncMirrors().then(function () { return L.outstanding(); }).then(function (o) {", "L.outstanding().then(function (o) {"],
    [NG, 'the dialog fires on unknown counts', "if (!(o.pages > 0 || o.checks > 0)) { return; }", "if (o.known && o.pages === 0 && o.checks === 0) { return; }"],
    [NG, 'applications raise the dialog', "if (!(o.pages > 0 || o.checks > 0)) { return; }", "if (!(o.pages > 0 || o.checks > 0 || (o.apps && o.apps.total))) { return; }"],
    [NG, 'the ledger is read before the quiet stamp', "        if (Date.now() < (gmGet(L.NAG_KEY, 0) || 0)) { return; }\n        L.syncMirrors()", "        L.syncMirrors()"],
    // ---- the chip ----
    [NG, 'a finished month hides behind the bare name', "        if (o.pages === 0 && o.checks === 0) { return '📋 Lead duties: all done ✓'; }\n", ''],
    [NG, 'unknown counts read as all done', "if (o.pages === 0 && o.checks === 0) { return '📋 Lead duties: all done ✓'; }", "if (!o.pages && !o.checks) { return '📋 Lead duties: all done ✓'; }"],
    [NG, 'the vague wording is back', "        return bits.join(', ');\n    },", "        return bits.length ? bits.join(', ') : 'due this month';\n    },"],
    [NG, 'a finished month removes the chip', "            R._paint(R._label(o));", "            if (o.pages === 0 && o.checks === 0) { R.remove(); return; }\n            R._paint(R._label(o));"]
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
fs.unlinkSync('mutt.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
