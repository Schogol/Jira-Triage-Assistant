// mutate-oldreadings.js - breaks each guard of the sweep of stored log readings of an older reader version (review
// 2026-11-20 profile-robust-6, boost-robust-7) and requires oldreadings-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'oldreadings-check.js';
const muts = [
    // the sweep
    [H, 'every row under the prefix goes', 'if (drop(c.value ? c.value.v : null)) { c.delete(); gone++; }', '{ c.delete(); gone++; }'],
    [H, 'the sweep reaches past its prefix', 'KR.bound(prefix, top)', "KR.bound('', top + 'z')"],
    [H, 'no part limit: one long transaction', 'if (++n < D.SWEEP_N) { c.continue(); }', 'n++; c.continue();'],
    [H, 'a full part ends the sweep', 'resolve(n < D.SWEEP_N ? null : last);', 'resolve(null);'],
    [H, 'the next part starts over from the first key', 'KR.bound(after, top, true, false)', 'KR.bound(prefix, top)'],
    [H, 'an aborted transaction hangs the sweep', "                    tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };\n", ''],
    [H, 'an erring transaction hangs the sweep', '                    tx.onerror = function () { reject(tx.error); };\n                    tx.onabort = function () { reject(tx.error ||', '                    tx.onabort = function () { reject(tx.error ||'],
    [H, 'the count of rows deleted is lost', '.then(function (next) { return next == null ? gone : part(next); });', '.then(function (next) { return next == null ? 0 : part(next); });'],
    // once per reader version
    [H, 'a newer build\'s readings go too', 'return !(r && r.v >= P.V);', 'return !(r && r.v === P.V);'],
    [H, 'an empty reading stays', 'return !(r && r.v >= P.V);', 'return !!r && r.v < P.V;'],
    [H, 'every page load sweeps', ' || gmGet(P.SWEPT_KEY, 0) === P.V) { return Promise.resolve(0); }', ') { return Promise.resolve(0); }'],
    [H, 'the sweep is never noted', '            gmSet(P.SWEPT_KEY, P.V);\n', ''],
    [H, 'a failed sweep is noted as done', '        }, function (e) {\n            P._sweeping = false;\n', '        }, function (e) {\n            P._sweeping = false;\n            gmSet(P.SWEPT_KEY, P.V);\n'],
    [H, 'two calls at once sweep twice', 'if (P._sweeping || gmGet(P.SWEPT_KEY, 0) === P.V)', 'if (gmGet(P.SWEPT_KEY, 0) === P.V)'],
    [H, 'a failed sweep blocks the next', '        }, function (e) {\n            P._sweeping = false;\n', '        }, function (e) {\n'],
    [H, 'a failed sweep says nothing', "            JiTA.log('[JiTA] profile: could not delete the old stored log readings (tried again on the next page load):', e);\n", ''],
    [H, 'a sweep says nothing of what went', "            if (n) { JiTA.log('[JiTA] profile: deleted ' + n + ' stored log reading(s) of an older reader version'); }\n", ''],
    // when it runs
    [H, 'a Jira tab never sweeps', "    setTimeout(function () { try { JiTA.profile.sweepOld(); } catch (e) { JiTA.caught('profile.sweepOld', e); } }, JiTA.profile.SWEEP_DELAY_MS);", '    void 0;'],
    [H, 'the sweep runs while the page draws', 'SWEEP_DELAY_MS: 60000,', 'SWEEP_DELAY_MS: 0,']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutor.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutor.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutor.js')) { fs.unlinkSync('mutor.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
