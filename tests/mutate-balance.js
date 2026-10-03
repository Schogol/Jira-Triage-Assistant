// mutate-balance.js - breaks the credit balance on the pill (v3.40.0) and requires balance-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'balance-check.js';
const muts = [
    [H, 'an empty balance reads as a number', String.raw`if (!/^-?\d+(\.\d+)?$/.test(n)) {`, String.raw`if (!/^-?\d*(\.\d+)?$/.test(n)) {`],
    [H, 'any <dt> is read as the balance', String.raw`var m = /<dt\b[^>]*>\s*Credits\s*<\/dt>`, String.raw`var m = /<dt\b[^>]*>[^<]*<\/dt>`],
    [H, 'a login page is "unreadable"', "reason: /login\\.eveonline\\.com|\\/account\\/(login|signin)/i.test(body) ? 'login' : 'unreadable' };", "reason: 'unreadable' };"],
    [H, 'a failed read drops the last balance', '                    if (!res.ok && good) { res.last = { credits: good.credits, updated: good.updated, at: good.at }; }\n', ''],
    [H, 'a second failure loses the balance', '                    var good = cached ? (cached.ok ? cached : cached.last) : null;', '                    var good = (cached && cached.ok) ? cached : null;'],
    [H, 'a failed read is retried on every poll', 'if (!force && cached && age < (cached.ok ? B.TTL_MS : B.FAIL_MS)) { return cached; }', 'if (!force && cached && age < (cached.ok ? B.TTL_MS : 0)) { return cached; }'],
    [H, 'a good read is fetched on every poll', 'if (!force && cached && age < (cached.ok ? B.TTL_MS : B.FAIL_MS)) { return cached; }', 'if (!force && cached && !cached.ok && age < B.FAIL_MS) { return cached; }'],
    [H, 'two refreshes read twice', '            if (B._busy) { return B._busy; }\n            var p = B.readSafe()', '            var p = B.readSafe()'],
    [H, 'a balance never read shows as 0', '            var have = bal ? (bal.ok ? bal : bal.last) : null;', '            var have = bal ? (bal.ok ? bal : (bal.last || { credits: 0 })) : null;'],
    [H, 'a failed read hides its warning', '            var warn = !!(bal && !bal.ok);', '            var warn = false;'],
    [H, 'the warning also opens the leaderboard', 'warn.addEventListener(\'click\', function (e) { e.stopPropagation(); JiTA.credits.balance.openVms(); });', 'warn.addEventListener(\'click\', function (e) { JiTA.credits.balance.openVms(); });'],
    [H, 'focus ignores that the warning sent you to VMS', '(B._opened ? B.OPENED_MS : B.FOCUS_MS)', 'B.FOCUS_MS'],
    [H, 'a good read leaves the focus re-read on', '                    if (res.ok) { B._opened = false; }\n', ''],
    [H, 'focus re-reads a good balance', '                if (!c || c.ok) { return; }\n', '                if (!c) { return; }\n'],
    [H, 'the credits poll forgets the balance', "            try { JiTA.credits.balance.refresh(false).then(function () { JiTA.credits.badge.refresh(); }, function () { /* the ⚠ says so */ }); } catch (e) { /* ignore */ }\n", '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutb.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutb.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutb.js')) { fs.unlinkSync('mutb.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
