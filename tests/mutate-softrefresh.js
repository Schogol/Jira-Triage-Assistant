// mutate-softrefresh.js - breaks each guard of the issue on screen shown without a reload (v3.51.1: Jira's issue view told
// to read the issue again, the write watched for with a fallback, the status lozenge read, an issue opened in-app) in turn
// and requires softrefresh-check to go red. A crashed harness counts as red. Every anchor is looked for in the helpers'
// own block (HELP), once: [harness, name, anchor, replacement].
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const SR = 'softrefresh-check.js';
const HELP = ['\nvar JITA_REFRESH_EVENT = ', '\n// After Convert-to-Defect'];
const muts = [
    // ---- telling Jira ----
    [SR, 'Jira told an event it does not hear', "var JITA_REFRESH_EVENT = 'legacy_refreshIssuePage';", "var JITA_REFRESH_EVENT = 'refreshIssuePage';"],
    [SR, 'Jira told with a detail the page cannot read in Firefox', 'document.dispatchEvent(new CustomEvent(JITA_REFRESH_EVENT));',
        "document.dispatchEvent(new CustomEvent(JITA_REFRESH_EVENT, { detail: ['EBR-1', { reason: 'SOFT_REFRESH' }] }));"],
    [SR, 'Jira told with an init object', 'document.dispatchEvent(new CustomEvent(JITA_REFRESH_EVENT));', 'document.dispatchEvent(new CustomEvent(JITA_REFRESH_EVENT, {}));'],
    [SR, 'a refused dispatch throws into the caller', "try { document.dispatchEvent(new CustomEvent(JITA_REFRESH_EVENT)); } catch (e) { /* the caller's fallback */ }",
        'document.dispatchEvent(new CustomEvent(JITA_REFRESH_EVENT));'],
    [SR, 'Jira given half a second to show a write', 'var JITA_REFRESH_MS = 8000;', 'var JITA_REFRESH_MS = 500;'],
    [SR, 'the page looked at once a second', 'var JITA_REFRESH_STEP_MS = 250;', 'var JITA_REFRESH_STEP_MS = 1000;'],
    [SR, 'the router given 15 seconds', 'var JITA_NAV_MS = 4000;', 'var JITA_NAV_MS = 15000;'],
    [SR, 'an issue still loading given 3 seconds', 'var JITA_NAV_GIVEUP_MS = 30000;', 'var JITA_NAV_GIVEUP_MS = 3000;'],
    // ---- watching for the write ----
    [SR, 'a write watched for but never told to Jira', '    jitaRefreshIssueView();\n    (function look() {', '    (function look() {'],
    [SR, 'a write Jira shows falls back all the same', 'if (jitaCurrentKey() !== key || shown()) { return; }', 'if (jitaCurrentKey() !== key) { return; }'],
    [SR, 'a write falls back on another issue', 'if (jitaCurrentKey() !== key || shown()) { return; }', 'if (shown()) { return; }'],
    [SR, 'a write falls back at once', 'if (Date.now() - t0 < JITA_REFRESH_MS) { setTimeout(look, JITA_REFRESH_STEP_MS); return; }', 'if (false) { setTimeout(look, JITA_REFRESH_STEP_MS); return; }'],
    [SR, 'the page looked at only at the end', 'setTimeout(look, JITA_REFRESH_STEP_MS)', 'setTimeout(look, JITA_REFRESH_MS)'],
    [SR, 'a write Jira never shows is left at that', '        missed();\n', ''],
    // ---- the status lozenge ----
    [SR, 'the status read untrimmed', "return $.trim($(SELECTORS.STATUS_FIELD_WRAP).find('button').first().text());", "return $(SELECTORS.STATUS_FIELD_WRAP).find('button').first().text();"],
    // ---- opening an issue in-app ----
    [SR, 'the URL never pushed', "        history.pushState(null, '', path);\n", ''],
    [SR, 'the router never told', "        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));\n", ''],
    [SR, 'the router told on the document', "        window.dispatchEvent(new PopStateEvent('popstate', { state: null }));", "        document.dispatchEvent(new PopStateEvent('popstate', { state: null }));"],
    [SR, 'a refused push opens nothing', '} catch (e) { window.location.href = path; return; }', '} catch (e) { return; }'],
    [SR, 'the key not encoded', "var path = '/browse/' + encodeURIComponent(key),", "var path = '/browse/' + key,"],
    [SR, 'the user taken back from where they went', '        if (window.location.pathname !== path) { return; }   // gone somewhere else meanwhile\n', ''],
    [SR, 'the router taking it is not seen', '        if (on && on !== from) { return; }                    // the router took it (a moved issue shows its new key)\n', ''],
    [SR, 'an issue still loading taken for an ignored switch', '        if (!on && Date.now() - t0 < JITA_NAV_GIVEUP_MS) { setTimeout(check, 1000); return; }\n', ''],
    [SR, 'an issue still loading waited for forever', 'if (!on && Date.now() - t0 < JITA_NAV_GIVEUP_MS) {', 'if (!on) {'],
    [SR, 'an ignored switch left at that', '        window.location.href = path;\n    }, JITA_NAV_MS);', '    }, JITA_NAV_MS);']
];
// Where an anchor is looked for: the helpers' block, between its first line and its end.
function within(fn) {
    const p = fn || HELP, s = src.indexOf(p[0]);
    if (s < 0 || src.indexOf(p[0], s + 1) >= 0) { return null; }
    const e = src.indexOf(p[1], s + p[0].length);
    return e < 0 ? null : [s, e];
}
// JITA_BREAK_SHARD=k/n makes only the breakages whose index % n === k; without it, every breakage.
const SHARD = /^(\d+)\/(\d+)$/.exec(process.env.JITA_BREAK_SHARD || '0/1'), K = SHARD ? +SHARD[1] : 0, N = SHARD ? +SHARD[2] : 0;
if (!SHARD || N < 1 || K >= N) { console.log('JITA_BREAK_SHARD must be k/n with 0 <= k < n, not ' + process.env.JITA_BREAK_SHARD); process.exit(2); }
if (process.env.JITA_BREAK_SHARD) { console.log('shard ' + K + '/' + N + ': ' + muts.filter((m, i) => i % N === K).length + ' of ' + muts.length + ' breakages'); }
let allRed = true;
muts.forEach(([h, name, a, b, fn], i) => {
    if (i % N !== K) { return; }
    const at = within(fn), part = at ? src.slice(at[0], at[1]) : '';
    if (!at || part.split(a).length !== 2) { console.log('ANCHOR ' + (at ? part.split(a).length - 1 : 'no part') + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutsr.js', src.slice(0, at[0]) + part.replace(a, () => b) + src.slice(at[1]));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutsr.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutsr.js')) { fs.unlinkSync('mutsr.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
