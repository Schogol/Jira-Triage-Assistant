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
    [P, 'a failed QC read looks like an empty one', 'L.qcl.read([L._prevYm()]).catch(function () { return QC_UNREAD; }),', 'L.qcl.read([L._prevYm()]).catch(function () { return { value: null }; }),'],
    [P, 'an unreadable page tree is published', "                if (!pool) { return { skipped: 'the page tree could not be read, so the page was left as it was' }; }\n", ''],
    // ---- the scan time ----
    [P, 'the scan time is hashed again', TARGET,
        "                [R._txt('Target'), R._txt('every page read by ' + st.eyes + ' different Leads every ' + st.coverage + ' months')],\n" +
        "                [R._txt('Page tree last scanned'), R._when(pool.fetchedAt ? new Date(pool.fetchedAt).toISOString() : null)]\n            ]);"],
    [P, 'the stamp leaves the scan time out', "' UTC' + scanned + '. Anything typed on this page by '", "' UTC. Anything typed on this page by '"],
    [P, 'the published stamp is not given the tree', "return R._write(R._stamp(pool) + '\\n' + body)", "return R._write(R._stamp() + '\\n' + body)"],
    // ---- two Leads publishing at once (review 2026-11-20 leadduty-logic-3) ----
    [P, "the hash alone says unchanged", "return R._unchanged(wiki[R.PUB_KEY]).then(function (same) { return same ? { skipped: 'unchanged' } : R._publish(wiki, body, hash, pool, qc); });", "return { skipped: 'unchanged' };"],
    [P, "the page version written is not noted", "at: new Date().toISOString(), page: res.version };", "at: new Date().toISOString() };"],
    [P, "the page version is not compared", "return page.version === pub.page; }, function () { return true; });", "return true; }, function () { return true; });"],
    [P, "a pub with no page version rewrites every time", "            if (!pub || !pub.page) { return Promise.resolve(true); }\n", "            if (!pub || !pub.page) { return Promise.resolve(false); }\n"],
    [P, "a ledger moved on meanwhile asks for nothing", "                    if (JiTA.util.hash(R._content(v, qc, pool)) !== hash) { R._again = true; }\n", ""],
    [P, "every publish asks for another", "                    if (JiTA.util.hash(R._content(v, qc, pool)) !== hash) { R._again = true; }\n", "                    R._again = true;\n"],
    [P, "the page's month table shows the issue's first follow-up", "R._lines(R._reason(d, JiTA.leadduty.qc.flagFor(flags, key, pym), pym))", "R._lines(R._reason(d, flags[key], pym))"],
    // ---- the QC back-off ----
    [S, 'a failing QC sample reruns the refresh every poll', '            if (!ready && !S._elapsed(S.QC_FAIL_KEY, S.FAIL_MS)) { return; }\n', ''],
    [S, 'a QC failure is not remembered', '                gmSet(S.QC_FAIL_KEY, Date.now());\n', ''],
    [S, 'a drawn sample keeps the failure', '                gmSet(S.QC_FAIL_KEY, 0);\n', ''],
    // ---- the Members page, after the ledger page ----
    [S, 'the Members page is never brought in step', '            return Promise.resolve().then(function () { return L.members.tick(); }).catch(function () { /* cosmetic - never fails the tick */ });\n', ''],
    [S, 'a failing Members tick fails the whole tick', 'return L.members.tick(); }).catch(function () { /* cosmetic - never fails the tick */ });', 'return L.members.tick(); });'],
    [S, 'a Members tick that throws fails the whole tick', 'return Promise.resolve().then(function () { return L.members.tick(); }).catch(', 'return L.members.tick().catch('],
    [S, 'the tick is done before the Members page is', '            return Promise.resolve().then(function () { return L.members.tick(); })', '            Promise.resolve().then(function () { return L.members.tick(); })']
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
