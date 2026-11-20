// mutate-ledgercap.js - breaks each guard that keeps the Lead duties ledgers under Confluence's property cap (v3.53.5)
// in a copy of the script (mutlc.js) and requires leadduty-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'leadduty-check.js';
const muts = [
    [H, 'the QC ledger keeps six months again', 'next = L._prune(next, key === L.QC_LEDGER_KEY ? L.QC_KEEP_MONTHS : L.KEEP_MONTHS);', 'next = L._prune(next, L.KEEP_MONTHS);'],
    [H, '_prune ignores the retention it is given', '        keep = keep || L.KEEP_MONTHS;\n', '        keep = L.KEEP_MONTHS;\n'],
    [H, 'resolved follow-ups age out on the old clock', 'var cutoff = new Date(Date.now() - keep * 31', 'var cutoff = new Date(Date.now() - L.KEEP_MONTHS * 31'],
    [H, 'a write over the cap is refused at once', '                while (size > L.MAX_PROP_BYTES && L._dropOldest(next)) { size = JSON.stringify(next).length; }\n', ''],
    [H, 'a write over the cap drops every month', 'if (keys.length <= L.MIN_MONTHS) { return false; }', 'if (!keys.length) { return false; }'],
    [H, 'a write over the cap drops the newest month', "['months', 'done'].forEach(function (f) { if (val[f]) { delete val[f][keys[0]]; } });",
        "['months', 'done'].forEach(function (f) { if (val[f]) { delete val[f][keys[keys.length - 1]]; } });"],
    [H, 'a write over the cap drops the month from one map only', "['months', 'done'].forEach(function (f) { if (val[f]) { delete val[f][keys[0]]; } });",
        'if (val.months) { delete val.months[keys[0]]; }'],
    [H, 'a ledger too big to save is written anyway', '                if (size > L.MAX_PROP_BYTES) {\n                    throw', '                if (false) {\n                    throw']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutlc.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutlc.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutlc.js')) { fs.unlinkSync('mutlc.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
