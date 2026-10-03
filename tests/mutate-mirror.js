// mutate-mirror.js - breaks each guard of the Lead duties mirror and marks (v3.38.14): both months' queues drain, only
// pending marks are carried into a refreshed mirror, and a mark made twice is written once. Requires mirror-check,
// wikiundo-check or qc-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const M = 'mirror-check.js', W = 'wikiundo-check.js', Q = 'qc-check.js';
const muts = [
    // ---- the queues ----
    [M, "last month's wiki queue is never read", '            { key: L.wiki.localKey(L._prevYm(wym)), ym: L._prevYm(wym), send: review },\n', ''],
    [M, "the sample month before's QC queue is never read", '            { key: L.qc.localKey(L._prevYm(qym)), ym: L._prevYm(qym), send: check }\n', ''],
    [M, "last month's wiki marks are sent for this month", '            { key: L.wiki.localKey(L._prevYm(wym)), ym: L._prevYm(wym), send: review },', '            { key: L.wiki.localKey(L._prevYm(wym)), ym: wym, send: review },'],
    [M, 'one mark that cannot be sent stops the rest', "},\n                            function () { /* still down; keep it queued */ });", '});'],
    // ---- the merge rule ----
    [M, 'every local mark is carried again', '((prev && prev.pending) || []).forEach(function (k) { if (!done[k] && prev.done && prev.done[k]) { done[k] = prev.done[k]; } });',
        'Object.keys((prev && prev.done) || {}).forEach(function (k) { if (!done[k]) { done[k] = prev.done[k]; } });'],
    [M, 'a carried mark overrides the ledger', 'if (!done[k] && prev.done && prev.done[k]) { done[k] = prev.done[k]; }', 'if (prev.done && prev.done[k]) { done[k] = prev.done[k]; }'],
    [M, 'one refresh keeps the old merge', '                    L.local.carry(prev, qdone);',
        '                    if (prev && prev.done) { Object.keys(prev.done).forEach(function (k) { if (!qdone[k]) { qdone[k] = prev.done[k]; } }); }'],
    // ---- a mark made twice ----
    [W, 'a review over my own review is written', '                if (mine && mine.by === handle) { return null; }\n', ''],
    [W, 'a Skip over my own mark is written', "                if (v.done[ym][pageId] && v.done[ym][pageId].by === handle) { return null; }   // already marked (see markReviewed)\n", ''],
    [Q, 'a second verdict overwrites the first', '                if (v.done[ym][key] && v.done[ym][key].by === handle) { return null; }\n', '']
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
