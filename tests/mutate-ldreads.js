// mutate-ldreads.js - breaks each guard of the Lead duties reads (v3.38.11): the QC month survives a missing key, and a
// VMS page JiTA cannot read is not "nobody waiting". Requires hydrate-check or apps-check to go red. A crashed harness
// counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const Q = 'hydrate-check.js', V = 'apps-check.js';
const muts = [
    // ---- the QC month ----
    [Q, 'a missing key fails the month again', '                    if (!e || e.status !== 400) { throw e; }\n', '                    throw e;\n'],
    [Q, 'any failed search falls back', '                    if (!e || e.status !== 400) { throw e; }\n', '                    if (!e) { throw e; }\n'],
    [Q, 'a hidden issue fails the month', 'if (e2 && (e2.status === 404 || e2.status === 403)) { return []; }', 'if (e2 && e2.status === 404) { return []; }'],
    [Q, 'every failed read counts as not found', 'if (e2 && (e2.status === 404 || e2.status === 403)) { return []; }', 'return [];'],
    [Q, 'the search does not say its status', "err.status = xhr.status;   // for callers that treat one status differently (the QC month's 400)", 'void 0;'],
    [Q, 'the single read does not say its status', "var err = new Error('Jira GET ' + path + ' failed: HTTP ' + xhr.status); err.status = xhr.status; reject(err);",
        "reject(new Error('Jira GET ' + path + ' failed: HTTP ' + xhr.status));"],
    // ---- VMS ----
    [V, 'only a relative review link is a row', '(?:https?:\\/\\/[^"\'\\/]*)?\\/Admin\\/Application\\/([0-9a-f-]{36})(?:[?#][^"\']*)?["\']/i.exec(row);',
        '\\/Admin\\/Application\\/([0-9a-f-]{36})["\']/i.exec(row);'],
    [V, 'a page without the queue table reads as empty', "if (!items.length && (!/<table\\b/i.test(body) || /\\/Admin\\/Application\\/[0-9a-f-]{36}/i.test(body))) {",
        "if (!items.length && (/\\/Admin\\/Application\\/[0-9a-f-]{36}/i.test(body))) {"],
    [V, 'unread application links read as empty', "if (!items.length && (!/<table\\b/i.test(body) || /\\/Admin\\/Application\\/[0-9a-f-]{36}/i.test(body))) {",
        "if (!items.length && (!/<table\\b/i.test(body))) {"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutq.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutq.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutq.js')) { fs.unlinkSync('mutq.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
