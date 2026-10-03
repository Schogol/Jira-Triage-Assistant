// mutate-synctail.js - breaks each guard of the sync tail (v3.39.2) and requires synctail-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'synctail-check.js', TMP = 'mutx.js';
const muts = [
    // ---- one transaction per page ----
    [H, 'an unchanged record is written and counted', '                        if (old && JiTA.sync._sameSynced(old, rec)) { return; }\n', ''],
    [H, 'an unchanged text loses its translation', '                            if (old.lang) { rec.lang = old.lang; rec.enText = old.enText; }   // keep the stored translation\n', ''],
    [H, 'a closed report never stored counts as pruned', 'if (old) { store.delete(rec.key); changed++; }', 'store.delete(rec.key); changed++;'],
    [H, 'the derived fields count as synced ones', "            if (k === 'embedding' || k === 'embeddingModelVersion' || k === 'lang' || k === 'enText') { continue; }\n", ''],
    // ---- a run ----
    [H, 'an incremental run saves a resume token', '                    var saved = opts.resume\n', '                    var saved = true\n'],
    [H, 'a bare token is saved', '{ jql: jql, token: nextToken, v: JiTA.DATA_VERSION }', 'nextToken'],
    [H, 'a background catch-up writes the status line', 'if (opts.resume || !JiTA.sync._quiet) {', 'if (true) {'],
    [H, 'a background full build hides its progress', 'if (opts.resume || !JiTA.sync._quiet) {', 'if (!JiTA.sync._quiet) {'],
    [H, 'a run that only re-fetched tells the worker', 'function settled() { if (changed > 0) {', 'function settled() { if (stored > 0) {'],
    [H, 'a failed run hides what it wrote', "            if (e && typeof e === 'object') { e.syncChanged = changed; }   // what the failed run wrote (see _fullRun)\n", ''],
    // ---- resuming ----
    [H, 'a token from another schema is resumed', ' && rt.v === JiTA.DATA_VERSION', ''],
    [H, 'a token from another query is resumed', ' && rt.jql === jql', ''],
    [H, 'a refused token is never started over', '                    if (!e || e.status !== 400) { throw e; }   // anything else is a real failure\n', '                    throw e;\n'],
    [H, 'any failure starts the crawl over', '                    if (!e || e.status !== 400) { throw e; }   // anything else is a real failure\n', '                    if (!e) { throw e; }\n'],
    [H, 'the refused attempt\'s changes are forgotten', 'res.changed += before; ', ''],
    [H, 'the incremental sync ignores an interrupted build', '            if (JiTA.sync._resumable(rt, JiTA.sync.FULL_JQL)) { return JiTA.sync.fullSync(); }\n', ''],
    [H, 'the bug report sync ignores one', '            if (JiTA.sync._resumable(rt, JiTA.sync.FULL_JQL_EBR)) { return JiTA.sync.fullSyncEbr(); }   // finish an interrupted build first\n', ''],
    [H, 'the upgrade refetch resets an interrupted build', '                if (JiTA.sync._resumable(rt, JiTA.sync.FULL_JQL)) { return null; }\n', ''],
    [H, 'the bug report refetch resets one', '                if (JiTA.sync._resumable(rt, JiTA.sync.FULL_JQL_EBR)) { return null; }\n', ''],
    // ---- the tail ----
    [H, 'a defect change translates', '        if (ebr) { JiTA.translate.prepare(); }', '        if (defects || ebr) { JiTA.translate.prepare(); }'],
    [H, 'every sync embeds', '        if (defects || ebr) { JiTA.embed.prepare(true); }', '        JiTA.embed.prepare(true);'],
    [H, 'a sync someone asked for redraws only on a change', 'if (shown || (defects && /^EBR-/.test(k))', 'if ((defects && /^EBR-/.test(k))'],
    [H, 'a defect change redraws a defect page', 'if (shown || (defects && /^EBR-/.test(k))', 'if (shown || (defects)'],
    [H, 'the clock does not move', '        JiTA.sched.markSynced();   // any sync also resets the auto-sync 30-min clock\n', ''],
    [H, 'rebuilding the bug reports does not translate them', 'JiTA.sync._afterSync(false, true, true);   // re-embed and re-translate', 'JiTA.sync._afterSync(true, false, true);   // re-embed and re-translate'],
    [H, 'a manual sync that changed nothing does not redraw', "                JiTA.sync._afterSync(!!(res && res.changed), false, true);\n                return res;", "                JiTA.sync._afterSync(!!(res && res.changed), false, false);\n                return res;"],
    [H, 'the background sync is not quiet', '        JiTA.sync.running = true;\n        JiTA.sync._quiet = true;\n', '        JiTA.sync.running = true;\n'],
    [H, 'a failed background sync stays quiet', "            JiTA.sync._quiet = false;\n            console.log('[JiTA] auto-sync error:'", "            console.log('[JiTA] auto-sync error:'"],
    [H, 'a write-only meta key comes back', "            console.log('[JiTA] auto-sync error:', e && e.message || e);", "            JiTA.db.setMeta('lastError', String(e)); console.log('[JiTA] auto-sync error:', e && e.message || e);"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync(TMP, src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: TMP }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync(TMP)) { fs.unlinkSync(TMP); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
