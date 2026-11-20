// mutate-wikipool.js - breaks each guard of the page-tree cache that the meta store did not keep (v3.53.6, review
// 2026-11-20 leadduty-robust-3): the crawl is read back, kept in the tab when it did not land, served only while young,
// for the same root and when newer than a fresh cache, never for a forced crawl, and forgotten by Clear ledger.
// Without them a tab whose IndexedDB is closed or full crawled the page tree and republished the ledger page in an
// endless loop. Requires wikipool-check or settings-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const W = 'wikipool-check.js', S = 'settings-check.js';
const muts = [
    // ---- saving the crawl ----
    [W, 'a crawl the store refused is not kept', '}, function () { P._own = rec; });', '}, function () {});'],
    [W, 'a write that reports success is trusted', 'P._own = (back && back.fetchedAt === rec.fetchedAt) ? null : rec;', 'P._own = null;'],
    [W, 'the cache is not read back', '.then(function () { return JiTA.db.getMeta(P.CACHE_KEY); }).then(function (back) {', '.then(function () { return rec; }).then(function (back) {'],
    [W, 'a crawl the store kept is kept in the tab as well', 'P._own = (back && back.fetchedAt === rec.fetchedAt) ? null : rec;', 'P._own = rec;'],
    [W, 'a crawl no longer asks for a publish', 'return L.pool._saveCrawl(rec).then(function () { return L.pool._crawled(out); });', 'return L.pool._saveCrawl(rec).then(function () { return out; });'],
    // ---- serving the tab's copy ----
    [W, 'the copy is never served', '                if (!force && mine) { return L.pool._applyExclusions(own); }\n', ''],
    [W, 'the copy is served however old', '(Date.now() - own.fetchedAt) < L.POOL_TTL_MS &&', 'true &&'],
    [W, 'the copy is served for another root', 'var own = L.pool._own, mine = own && own.rootId === root &&', 'var own = L.pool._own, mine = own &&'],
    [W, 'the copy wins over a newer fresh cache', '!(fresh && (cached.fetchedAt || 0) >= own.fetchedAt);', 'true;'],
    [W, 'the copy loses to any fresh cache', '!(fresh && (cached.fetchedAt || 0) >= own.fetchedAt);', '!fresh;'],
    [W, 'a forced crawl serves the copy', 'if (!force && mine) { return L.pool._applyExclusions(own); }', 'if (mine) { return L.pool._applyExclusions(own); }'],
    // ---- Clear ledger ----
    [S, 'Clear ledger keeps the copy', '                        L.pool._own = null;   // this tab\'s own copy of the page tree too, or the re-freeze would not crawl afresh\n', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutwp.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutwp.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutwp.js')) { fs.unlinkSync('mutwp.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
