// mutate-shared.js - breaks each part of "code the page and the worker both run is written once" (jitaShared) and requires
// shared-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'shared-check.js';
const muts = [
    [H, 'the worker is not handed the shared copy', "')(' + JSON.stringify(cfg) + ', (' + jitaShared.toString() + ')());';", "')(' + JSON.stringify(cfg) + ');';"],
    [H, 'the worker body takes no shared copy', 'function jitaWorkerBody(cfg, SH) {', 'function jitaWorkerBody(cfg) {'],
    [H, 'the worker builds its exception index another way', '        logsigCache = SH.buildIndex(recs);', '        logsigCache = (function (r) { return SH.buildIndex(r.filter(function (x) { return x.project !== \'EDR\'; })); })(recs);'],
    [H, 'the worker matches a log with a copy of its own', "        if (op === 'match') { return SH.matchText(idx, payload.text); }", "        if (op === 'match') { return lgMatch(payload.text); }\n        function lgMatch(text) { return SH.matchText(idx, text); }"],
    [H, 'the page fingerprints with a copy of its own', '    _fingerprint: JITA_SH.fingerprint,   // jitaShared', '    _fingerprint: function (text) { return JITA_SH.fingerprint(text); },'],
    [H, 'the page keeps a crash site of its own', '    _crashOf: JITA_SH.crashOf,   // jitaShared', '    _crashOf: function (sig) { return JITA_SH.crashOf(sig); },'],
    [H, 'the page keeps its own constants', 'MIN_FRAMES: JITA_SH.MIN_FRAMES, CRASH_FRAMES: JITA_SH.CRASH_FRAMES,', 'MIN_FRAMES: 2, CRASH_FRAMES: JITA_SH.CRASH_FRAMES,'],
    [H, 'the shared copy reads the page', '    function isTrace(sig) { return String(sig == null', "    function isTrace(sig) { if (typeof JiTA === 'undefined') { return false; } return String(sig == null"],
    [H, 'the shared copy is never run on the page', '\nvar JITA_SH = jitaShared();\n', '\nvar JITA_SH = null;\n'],
    [H, 'the shared copy leaves a piece out', 'splitBlocks: splitBlocks, fingerprint: fingerprint, logBlocks: logBlocks, crashOf: crashOf', 'splitBlocks: splitBlocks, fingerprint: fingerprint, logBlocks: logBlocks'],
    // ---- the index and its lookups (refactor 1 PR 2) ----
    [H, 'the shared copy leaves a lookup out', 'sigsOf: sigsOf, siblings: siblings, related: related, clusters: clusters', 'sigsOf: sigsOf, siblings: siblings, related: related'],
    [H, 'a lookup on no index yet throws', '        if (!idx || !isTrace(sig)) { return []; }', '        if (!isTrace(sig)) { return []; }'],
    [H, 'the worker answers an unknown request', "        throw new Error('unknown logsig op: ' + op);", '        return null;'],
    [H, 'the worker answers before its index is built', '                await ensureIndexes();\n                result = logsigOp(payload);', '                result = logsigOp(payload);'],
    [H, 'the page builds its index another way', 'var idx = JITA_SH.buildIndex(recs), sigs', 'var idx = JITA_SH.buildIndex(recs.slice(1)), sigs'],
    [H, 'the page keeps a lookup of its own', '    _siblingsLocal: function (key) { return JiTA.logsig.ensure().then(function (idx) { return JITA_SH.siblings(idx, key); }); },',
        '    _siblingsLocal: function (key) { return JiTA.logsig.ensure().then(function (idx) { return (idx.keyToSigs[key] || []).length ? JITA_SH.siblings(idx, key) : []; }); },'],
    [H, 'a parsed log\'s related ones not tagged', '                    o.related = true;\n', ''],
    [H, 'a parsed log lists the related ones alone', 'return JITA_SH.siblings(idx, defect).concat(rel);', 'return rel;'],
    // ---- the text the ranking compares, and the keyword ranking (refactor 1 PR 3) ----
    [H, 'the shared copy leaves the keyword ranking out', 'keywordIndex: keywordIndex, passesGate: passesGate, bm25Score: bm25Score', 'keywordIndex: keywordIndex, passesGate: passesGate'],
    [H, 'the worker keeps a tokenizer of its own', '    // test (SH.matchTerms) and the session filters (SH.passesGate) are written once in jitaShared, as the tab runs them.\n',
        '    // test (SH.matchTerms) and the session filters (SH.passesGate) are written once in jitaShared, as the tab runs them.\n    function tokenize(text) { return SH.tokenize(text); }\n'],
    [H, 'the worker narrows by the filter box with a copy', '            if (hasTerms && !SH.matchTerms(e.hay, filterTerms)) { continue; }',
        '            if (hasTerms && !matchTerms(e.hay, filterTerms)) { continue; }\n            function matchTerms(h, t) { return SH.matchTerms(h, t); }'],
    [H, 'the worker leaves out by names of its own', '    function leftOut(rec) { return SH.isLeftOut(rec, cfg.LEFT_OUT); }', '    function leftOut(rec) { return SH.isLeftOut(rec, { labels: cfg.LEFT_OUT.labels, components: [] }); }'],
    [H, 'the worker builds its bug report keyword index another way', "            ebr: SH.keywordIndex(recs, function (r) { return r.project === 'EBR' && ranked(r); })",
        "            ebr: SH.keywordIndex(recs, function (r) { return r.project === 'EBR' && ranked(r) && !r.resolution; })"],
    [H, 'the tab\'s keyword fallback shows what the user hid', '        return !JiTA.hidden.isHidden(doc.key) && JITA_SH.passesGate(doc, gate);', '        return JITA_SH.passesGate(doc, gate);'],
    [H, 'the tab\'s keyword fallback ignores the session filters', '        return !JiTA.hidden.isHidden(doc.key) && JITA_SH.passesGate(doc, gate);', '        return !JiTA.hidden.isHidden(doc.key);'],
    [H, 'the tab keeps a tokenizer of its own', '    _tokenize: JITA_SH.tokenize,   // jitaShared', '    _tokenize: function (text) { return JITA_SH.tokenize(text); },'],
    [H, 'the tab keeps a text helper of its own', '    cleanForCompare: JITA_SH.cleanForCompare,   // jitaShared', '    cleanForCompare: function (s, d) { return JITA_SH.cleanForCompare(s, d); },'],
    [H, 'a stale note is left on a piece written once', '    // A bug report the matching lists leave out (cfg.LEFT_OUT = JiTA.LEFT_OUT), so it is neither indexed nor embedded.',
        '    // Mirror of JiTA.util.isLeftOut: a bug report the matching lists leave out (cfg.LEFT_OUT = JiTA.LEFT_OUT).']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutsh.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutsh.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutsh.js')) { fs.unlinkSync('mutsh.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
