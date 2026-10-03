// mutate-publish.js - breaks each guard of the Lead duties page and scheduler fixes (v3.38.15): a failed read is never
// published, the page tree's scan time stays out of the hash, and a QC sample that keeps failing is retried on the
// back-off. Requires publish-check or sched-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const P = 'publish-check.js', S = 'sched-check.js';
const TARGET = "                [R._txt('Target'), R._txt('every page read by ' + st.eyes + ' different Leads every ' + st.coverage + ' months')]\n            ]);";
const muts = [
    // ---- a failed read ----
    [P, 'an unreadable QC ledger is published', "                if (r[1] === QC_UNREAD) { return { skipped: 'the quality control ledger could not be read, so the page was left as it was' }; }\n", ''],
    [P, 'a failed QC read looks like an empty one', 'L.ledger.read(L.QC_LEDGER_KEY).catch(function () { return QC_UNREAD; }),', 'L.ledger.read(L.QC_LEDGER_KEY).catch(function () { return { value: null }; }),'],
    [P, 'an unreadable page tree is published', "                if (!pool) { return { skipped: 'the page tree could not be read, so the page was left as it was' }; }\n", ''],
    // ---- the scan time ----
    [P, 'the scan time is hashed again', TARGET,
        "                [R._txt('Target'), R._txt('every page read by ' + st.eyes + ' different Leads every ' + st.coverage + ' months')],\n" +
        "                [R._txt('Page tree last scanned'), R._when(pool.fetchedAt ? new Date(pool.fetchedAt).toISOString() : null)]\n            ]);"],
    [P, 'the stamp leaves the scan time out', "' UTC' + scanned + '. Anything typed on this page by '", "' UTC. Anything typed on this page by '"],
    [P, 'the published stamp is not given the tree', "return R._write(R._stamp(pool) + '\\n' + body)", "return R._write(R._stamp() + '\\n' + body)"],
    // ---- the QC back-off ----
    [S, 'a failing QC sample reruns the refresh every poll', '            if (!ready && !S._elapsed(S.QC_FAIL_KEY, S.FAIL_MS)) { return; }\n', ''],
    [S, 'a QC failure is not remembered', '                gmSet(S.QC_FAIL_KEY, Date.now());\n', ''],
    [S, 'a drawn sample keeps the failure', '                gmSet(S.QC_FAIL_KEY, 0);\n', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutu.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutu.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutu.js')) { fs.unlinkSync('mutu.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
