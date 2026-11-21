// shared-check.js - code the page and the shared worker both run is written once (jitaShared, refactor of 2026-11-21).
// The worker runs from its own source text and sees nothing of the page, so such code was kept twice, marked KEEP IN
// SYNC, and pairs of it drifted apart (review 2026-11-20). Checked here: the shared copy is plain code (no JiTA, DOM,
// jQuery or GM storage, which the worker does not have), the worker is handed it and takes its pieces from it, no copy of
// them is left in the worker, and JiTA.logsig hands on the same pieces under its old names.
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const sharedSrc = S.fn(src, 'jitaShared');
const code = sharedSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
ok('the shared copy is plain code: nothing of the page, which the worker does not have', !/\bJiTA\b|\$\(|\bjQuery\b|\bgmGet\b|\bgmSet\b|\bGM_\w+|\bdocument\b|\bwindow\b/.test(code),
    (code.match(/.*(\bJiTA\b|\$\(|\bjQuery\b|\bgmGet\b|\bgmSet\b|\bGM_\w+|\bdocument\b|\bwindow\b).*/) || [''])[0].trim());
const SH = S.shared(src);
const PIECES = ['MIN_FRAMES', 'CRASH_FRAMES', 'TRACE', 'OPEN_CUT', 'isTrace', 'isCut', 'traceKey', 'isUserError', 'splitBlocks', 'fingerprint', 'logBlocks', 'crashOf'];
ok('...and it runs on its own, handing out every piece', PIECES.every((p) => p in SH) && typeof SH.fingerprint === 'function', PIECES.filter((p) => !(p in SH)).join());

// ---- the worker is handed it ----
const srcFn = S.member(src, 'JiTA.worker', '_src');
ok('the worker\'s source runs jitaShared and hands it to the worker body', /return '\(' \+ jitaWorkerBody\.toString\(\) \+ '\)\(' \+ JSON\.stringify\(cfg\) \+ ', \(' \+ jitaShared\.toString\(\) \+ '\)\(\)\);';/.test(srcFn), srcFn.slice(-200));
ok('...which takes it as SH', /^function jitaWorkerBody\(cfg, SH\) \{/m.test(src));
// The source as _src builds it (with a config of its own here) parses, the shared copy in it.
const built = '(' + S.fn(src, 'jitaWorkerBody') + ')(' + JSON.stringify({}) + ', (' + sharedSrc + ')());';
let parsed = true;
try { new Function(built); } catch (e) { parsed = String(e && e.message || e); }
ok('...and the worker\'s whole source, as built, parses', parsed === true, String(parsed));

// ---- the worker's pieces are the shared ones, with no copy of its own left ----
const body = S.fn(src, 'jitaWorkerBody');
ok('the worker takes its exception-matching pieces from it', /\n    var lgSplit = SH\.splitBlocks, lgFp = SH\.fingerprint, lgBlocks = SH\.logBlocks, lgCrashOf = SH\.crashOf;/.test(body) &&
    /\n    var lgIsTrace = SH\.isTrace, lgIsCut = SH\.isCut, lgTraceKey = SH\.traceKey, lgIsUserError = SH\.isUserError;/.test(body));
const copies = ['lgSplit', 'lgFp', 'lgBlocks', 'lgCrashOf', 'lgIsTrace', 'lgIsCut', 'lgTraceKey', 'lgIsUserError'].filter((n) => new RegExp('\\n\\s*function ' + n + '\\(').test(body));
ok('...and keeps no copy of its own of them', !copies.length, copies.join());
ok('...nor of the constants they read', !/\bvar LG_(MIN|CRASH|TRACE|OPEN)\b/.test(body));

// ---- the page hands on the same pieces ----
const ALIAS = { isTrace: 'isTrace', isCut: 'isCut', _traceKey: 'traceKey', isUserError: 'isUserError', _splitBlocks: 'splitBlocks', _fingerprint: 'fingerprint',
    _logBlocks: 'logBlocks', _crashOf: 'crashOf' };
const notShared = Object.keys(ALIAS).filter((m) => S.member(src, 'JiTA.logsig', m).replace(/\s*\/\/.*$/, '').trim() !== m + ': JITA_SH.' + ALIAS[m]);
ok('JiTA.logsig\'s pieces are the shared ones, under their old names', !notShared.length, notShared.join());
ok('...and so are its constants', /\n    MIN_FRAMES: JITA_SH\.MIN_FRAMES, CRASH_FRAMES: JITA_SH\.CRASH_FRAMES, TRACE: JITA_SH\.TRACE, OPEN_CUT: JITA_SH\.OPEN_CUT,/.test(S.top(src, 'JiTA.logsig')));
ok('...JITA_SH being jitaShared run once, before JiTA.logsig', /\nvar JITA_SH = jitaShared\(\);\n/.test(src) && src.indexOf('\nvar JITA_SH = jitaShared();') < src.indexOf('\nJiTA.logsig = {'));
ok('no KEEP IN SYNC note is left on a piece written once', !/KEEP IN SYNC with (lgSplit|lgFp|lgBlocks|lgCrashOf|lgIsTrace|lgIsUserError|LG_TRACE|LG_OPEN)\b/.test(src) &&
    !/KEEP IN SYNC with JiTA\.logsig\.(_splitBlocks|_fingerprint|_logBlocks|_crashOf|isUserError|isTrace)\b/.test(src));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'shared code checks passed.'));
process.exit(fail ? 1 : 0);
