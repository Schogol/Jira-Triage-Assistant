// mutate-qcl.js - breaks each guard of the QC ledger kept in parts (v3.53.5, JiTA.leadduty.qcl): the key, the one value
// the parts make, the write order, a part changed meanwhile, a month no longer kept, dry runs, moving what an older
// build wrote into the parts, the key listing, and the callers (the tabs, the mirror sync, Clear ledger). Requires
// qcl-check, ldrow-check, qc-check, sync-check or settings-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const P = 'qcl-check.js', R = 'ldrow-check.js', C = 'qc-check.js', Y = 'sync-check.js', S = 'settings-check.js';
const muts = [
    // ---- the parts and the one value they make ----
    [P, 'a month key keeps its dash', "+ String(ym).replace('-', '_'); },", '+ String(ym); },'],
    [P, 'nothing written reads as an empty ledger', '            if (!any) { return null; }\n', ''],
    [P, 'the verdicts are stored as `done`', 'value: { v: 1, ym: ym, verdicts: v } });', 'value: { v: 1, ym: ym, done: v } });'],
    [P, 'the verdicts are written before the follow-ups', 'if (!same(v, (part.value && part.value.verdicts) || {})) { writes.push(', 'if (!same(v, (part.value && part.value.verdicts) || {})) { writes.unshift('],
    [P, 'verdicts of a month not read are changed blind', "                    if (!parts.months[ym]) { throw new Error('QC ledger: the verdicts of ' + ym + ' were changed without being read'); }\n", ''],
    [P, 'a frozen month is never written', '                if (!same(next.months || {}, stored.months || {})) {\n', '                if (false) {\n'],
    [P, 'the months are written when they did not change', '                if (!same(next.months || {}, stored.months || {})) {\n', '                if (true) {\n'],
    [P, 'the follow-ups are written when they did not change', 'if (!same(flags, (parts.flags.value && parts.flags.value.flags) || {})) {', 'if (true) {'],
    [P, 'the verdicts are written when they did not change', 'if (!same(v, (part.value && part.value.verdicts) || {})) { writes.push(', 'if (true) { writes.push('],
    [P, 'the new versions are not reported', '}, 1).then(function (r) { Q._bump(vers, w.key, r.prop); });', '}, 1).then(function () {});'],
    // ---- another Lead's write meanwhile ----
    [P, 'a part changed meanwhile is overwritten', "if (!same(fresh, w.part.value)) { var e = new Error('QC ledger: ' + w.key + ' changed meanwhile'); e.status = 409; throw e; }", ''],
    [P, 'a part changed meanwhile is not a conflict', 'e.status = 409; throw e; }', 'throw e; }'],
    [P, 'a conflict is never retried', '.then(function () { return Q.mutate(yms, fn, tries - 1); });', '.then(function () { throw e; });'],
    [P, 'any failure is retried', '                if (tries > 1 && JiTA.conf.isConflict(e)) {\n                    return new Promise(function (res) { setTimeout(res, 200',
        '                if (tries > 1) {\n                    return new Promise(function (res) { setTimeout(res, 200'],
    // ---- a month no longer kept ----
    [P, 'a month no longer kept keeps its verdicts property', 'return Promise.all((dry ? [] : gone).map(function (ym) {', 'return Promise.all([].map(function (ym) {'],
    [P, 'a dry run deletes', 'return Promise.all((dry ? [] : gone).map(function (ym) {', 'return Promise.all(gone.map(function (ym) {'],
    [P, 'a refused delete fails the write', ".catch(function (e) { JiTA.log('[JiTA] could not delete the QC verdicts of ' + ym + ', a month no longer kept:', e && e.message || e); })", ''],
    [P, 'a dry run says written', 'return dry ? { value: next, parts: vers, written: false, dry: true } : { value: next, parts: vers, written: true };', 'return { value: next, parts: vers, written: true };'],
    // ---- what an older build wrote into the old property ----
    [P, 'the old ledger is never moved', 'if (!settled && !L._dry() && Q._stray(legacy.value)) {', 'if (false) {'],
    [P, 'a dry run moves the old ledger', 'if (!settled && !L._dry() && Q._stray(legacy.value)) {', 'if (!settled && Q._stray(legacy.value)) {'],
    [P, 'a move that fails fails the read', 'return Q._drain(legacy.value).then(again, function (e) {', 'return Q._drain(legacy.value).then(again, function (e) { throw e;'],
    [P, 'a move that fails is not logged', "JiTA.log('[JiTA] could not move the QC verdicts an older build wrote into their own properties (the next read tries again):', e && e.message || e);", ''],
    [P, 'follow-ups alone are not moved', '            if (lv.flags && Object.keys(lv.flags).length) { return true; }\n', ''],
    [P, 'verdicts alone are not moved', 'return Object.keys(lv.done || {}).some(function (ym) { return Object.keys(lv.done[ym] || {}).length > 0; });', 'return false;'],
    [P, 'a moved verdict stays in the old property', 'Object.keys(done[ym]).forEach(function (k) { if (v.done && v.done[ym] && same(v.done[ym][k], done[ym][k])) { delete v.done[ym][k]; n++; } });', ''],
    [P, 'a follow-up an older build changed meanwhile is taken out unmoved', 'if (v.flags && same(v.flags[k], flags[k])) { delete v.flags[k]; n++; }', 'if (v.flags && v.flags[k]) { delete v.flags[k]; n++; }'],
    [P, 'an older copy wins', 'if (!into[k] || at(more[k]) > at(into[k])) { into[k] = more[k]; }', 'into[k] = more[k];'],
    [P, 'a newer copy is not taken', 'if (!into[k] || at(more[k]) > at(into[k])) { into[k] = more[k]; }', 'if (!into[k]) { into[k] = more[k]; }'],
    [P, "'all' leaves out a month with only verdicts", "['months', 'done'].forEach(function (f) { Object.keys((lv && lv[f]) || {})", "['months'].forEach(function (f) { Object.keys((lv && lv[f]) || {})"],
    // ---- the key listing ----
    [P, 'keys() reads one page of the listing', "                    return next ? step(JiTA.conf._relPath(next)) : null;\n                });\n            }\n            return step('/wiki/api/v2/pages/' + encodeURIComponent(page) + '/properties?limit='",
        "                    return null;\n                });\n            }\n            return step('/wiki/api/v2/pages/' + encodeURIComponent(page) + '/properties?limit='"],
    [P, 'keys() lists other properties', "(typeof k === 'string' && k.indexOf(L.QC_MONTH_PREFIX) === 0)", "(typeof k === 'string' && k.indexOf('jita_leadduty_qc') === 0)"],
    // ---- the tabs ----
    [R, 'a dry run is adopted as written', 'if (!r || !r.value || r.dry || !r.parts) { return null; }', 'if (!r || !r.value || !r.parts) { return null; }'],
    [R, 'an older answer overwrites a newer one', 'var fresh = function (known, ver) { return !(known && ver && ver < known); };', 'var fresh = function () { return true; };'],
    [R, 'a QC row action keeps the copy the tab read at load', 'v = U._qcAdopt(res, r), it = null;', 'v = null, it = null;'],
    [C, 'a verdict goes to the old single property', '            return L.qcl.mutate([ym], function (v) {\n                v = v || { v: 1, months: {}, done: {}, flags: {} };\n                v.done = v.done || {};\n',
        '            return L.ledger.mutate(L.QC_LEDGER_KEY, function (v) {\n                v = v || { v: 1, months: {}, done: {}, flags: {} };\n                v.done = v.done || {};\n'],
    [C, 'an Undo reads the old single property', '            return L.qcl.mutate([ym], function (v) {\n                var d = v && v.done && v.done[ym] && v.done[ym][key];',
        '            return L.ledger.mutate(L.QC_LEDGER_KEY, function (v) {\n                var d = v && v.done && v.done[ym] && v.done[ym][key];'],
    [C, 'a follow-up is resolved in the old single property', '            return L.qcl.mutate([], function (v) {\n                var n = 0;', '            return L.ledger.mutate(L.QC_LEDGER_KEY, function (v) {\n                var n = 0;'],
    // ---- the mirror sync and Clear ledger ----
    [Y, 'the mirror sync reads the old single property', 'L.qcl.read([qym])]).then(function (r) {', 'L.ledger.read(L.QC_LEDGER_KEY)]).then(function (r) {'],
    [S, 'a failed listing fails Clear ledger', 'return L.qcl.keys().catch(function () { return [L.QC_FLAGS_KEY]; }).then(', 'return L.qcl.keys().then('],
    [S, 'Clear ledger leaves the parts', 'return all.reduce(function (p, k) { return p.then(function () { return drop(k); }); }, Promise.resolve());', 'return drop(L.QC_LEDGER_KEY);']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutql.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutql.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutql.js')) { fs.unlinkSync('mutql.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
