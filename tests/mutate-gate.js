// mutate-gate.js - breaks each guard that carries the session filters into the worker's ranking (v3.38.13) and
// requires gate-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'gate-check.js';
const muts = [
    [H, 'Status is ignored in the worker', "            if (gate.status === 'open' && resolved) { return false; }\n", ''],
    [H, 'Status fixed keeps everything', "            if (gate.status === 'fixed' && !resolved) { return false; }\n", ''],
    [H, 'a resolution alone does not count as resolved', 'var resolved = !!doc.resolution || isClosedStatus(doc.status);', 'var resolved = isClosedStatus(doc.status);'],
    [H, 'Status applies to bug reports', "if (gate.status && gate.status !== 'all' && doc.project !== 'EBR') {", "if (gate.status && gate.status !== 'all') {"],
    [H, 'Created within is ignored in the worker', "            if (isNaN(t) || (gate.now - t) > gate.createdDays * 86400000) { return false; }\n", ''],
    [H, 'the semantic scorer skips the gate', '            if (!passesGate(e, gate)) { continue; }', ''],
    [H, 'the keyword scorer skips the gate', '            if (!passesGate(doc, gate)) { continue; }\n', ''],
    [H, 'rankSemantic drops the gate', 'payload.excludeKey, payload.filterTerms, payload.gate) };', 'payload.excludeKey, payload.filterTerms) };'],
    [H, 'rankKeyword drops the gate', "payload.topN || 200, payload.filterTerms, payload.gate) };", 'payload.topN || 200, payload.filterTerms) };'],
    [H, 'the tab never sends a gate', "        if (!f || ((!f.status || f.status === 'all') && !(f.createdDays > 0))) { return null; }", '        return null;'],
    [H, 'the keyword call leaves the gate behind', "            gate: JiTA.ui._gateSpec(),   // applied in the worker before its cut, not just after it here\n            topN: Math.max(", '            topN: Math.max('],
    [H, 'the semantic call leaves the gate behind', "        gate: JiTA.ui._gateSpec(),   // applied in the worker before its cut, not just after it here\n        topN: JiTA.rank.CAND * 4", '        topN: JiTA.rank.CAND * 4']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutx.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutx.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutx.js')) { fs.unlinkSync('mutx.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
