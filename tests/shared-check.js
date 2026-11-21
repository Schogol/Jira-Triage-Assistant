// shared-check.js - code the page and the shared worker both run is written once (jitaShared, refactor of 2026-11-21).
// The worker runs from its own source text and sees nothing of the page, so such code was kept twice, marked KEEP IN
// SYNC, and pairs of it drifted apart (review 2026-11-20). Checked here: the shared copy is plain code (no JiTA, DOM,
// jQuery or GM storage, which the worker does not have), the worker is handed it and takes its pieces from it (its
// exception index built with buildIndex, every logsig request answered from it), no copy of them is left in the worker,
// and JiTA.logsig hands on the same pieces under its old names, its index and lookups being the shared ones.
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const sharedSrc = S.fn(src, 'jitaShared');
const code = sharedSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
ok('the shared copy is plain code: nothing of the page, which the worker does not have', !/\bJiTA\b|\$\(|\bjQuery\b|\bgmGet\b|\bgmSet\b|\bGM_\w+|\bdocument\b|\bwindow\b/.test(code),
    (code.match(/.*(\bJiTA\b|\$\(|\bjQuery\b|\bgmGet\b|\bgmSet\b|\bGM_\w+|\bdocument\b|\bwindow\b).*/) || [''])[0].trim());
const SH = S.shared(src);
const PIECES = ['MIN_FRAMES', 'CRASH_FRAMES', 'TRACE', 'OPEN_CUT', 'isTrace', 'isCut', 'traceKey', 'isUserError', 'splitBlocks', 'fingerprint', 'logBlocks', 'crashOf',
    'buildIndex', 'traceMates', 'pointAt', 'matchText', 'defects', 'holding', 'sigsOf', 'siblings', 'related', 'clusters'];
ok('...and it runs on its own, handing out every piece', PIECES.every((p) => p in SH) && typeof SH.fingerprint === 'function', PIECES.filter((p) => !(p in SH)).join());
// A worker asked before its index is built has none: every lookup answers nothing rather than throwing.
let none = null;
try {
    none = [SH.traceMates(null, '[stacktrace] x|'), SH.pointAt(null, 'x|a:b>c:d'), SH.matchText(null, 'EXCEPTION #1'), SH.defects(null, ['x']), SH.holding(null, ['x']),
        SH.sigsOf(null, 'EDR-1'), SH.siblings(null, 'EDR-1'), SH.related(null, 'EDR-1'), SH.clusters(null)];
} catch (e) { none = String(e && e.message || e); }
ok('...its lookups on no index yet answer nothing, never throw', JSON.stringify(none) === JSON.stringify([[], null, {}, {}, {}, { sigs: [], crashes: [], cuts: [] }, [], [], []]), JSON.stringify(none));
const empty = SH.buildIndex([]);
ok('...and an empty index has every map a lookup reads', ['sigMap', 'keyToSigs', 'crashMap', 'keyToCrash', 'traceMsg', 'traceCut', 'keyToCut'].every((k) => empty[k] && typeof empty[k] === 'object'),
    JSON.stringify(empty));

// ---- the worker is handed it ----
const srcFn = S.member(src, 'JiTA.worker', '_src');
ok('the worker\'s source runs jitaShared and hands it to the worker body', /return '\(' \+ jitaWorkerBody\.toString\(\) \+ '\)\(' \+ JSON\.stringify\(cfg\) \+ ', \(' \+ jitaShared\.toString\(\) \+ '\)\(\)\);';/.test(srcFn), srcFn.slice(-200));
ok('...which takes it as SH', /^function jitaWorkerBody\(cfg, SH\) \{/m.test(src));
// The source as _src builds it (with a config of its own here) parses, the shared copy in it.
const built = '(' + S.fn(src, 'jitaWorkerBody') + ')(' + JSON.stringify({}) + ', (' + sharedSrc + ')());';
let parsed = true;
try { new Function(built); } catch (e) { parsed = String(e && e.message || e); }
ok('...and the worker\'s whole source, as built, parses', parsed === true, String(parsed));

// ---- the worker's index and lookups are the shared ones, with no copy of its own left ----
const body = S.fn(src, 'jitaWorkerBody');
ok('the worker builds its exception index with the shared buildIndex', /\n        logsigCache = SH\.buildIndex\(recs\);/.test(S.fn(src, 'buildIndexes', body)));
const op = S.fn(src, 'logsigOp', body);
const OPS = { siblings: 'siblings(idx, payload.key)', related: 'related(idx, payload.key)', clusters: 'clusters(idx)', match: 'matchText(idx, payload.text)',
    defects: 'defects(idx, payload.sigs)', holding: 'holding(idx, payload.sigs)', sigsOf: 'sigsOf(idx, payload.key)' };
const offOps = Object.keys(OPS).filter((k) => op.indexOf("if (op === '" + k + "') { return SH." + OPS[k] + '; }') < 0);
ok('...answers every logsig request from the shared lookups, on the index it holds', !offOps.length && /var op = payload && payload\.op, idx = logsigCache;/.test(op), offOps.join());
ok('...an unknown one being an error', /throw new Error\('unknown logsig op: ' \+ op\);/.test(op));
ok('...and the logsig request goes there once the index is built', /else if \(type === 'logsig'\) \{\n\s+await ensureIndexes\(\);\n\s+result = logsigOp\(payload\);\n\s+\}/.test(body));
const copies = (body.match(/\n\s*function lg[A-Z]\w*\(/g) || []).map((s) => s.trim());
ok('...and keeps no copy of its own of them', !copies.length && !/\bvar lg[A-Z]\w* = SH\./.test(body), copies.join());
ok('...nor of the constants they read', !/\bvar LG_(MIN|CRASH|TRACE|OPEN)\b/.test(body));

// ---- the page hands on the same pieces ----
const ALIAS = { isTrace: 'isTrace', isCut: 'isCut', _traceKey: 'traceKey', isUserError: 'isUserError', _splitBlocks: 'splitBlocks', _fingerprint: 'fingerprint',
    _logBlocks: 'logBlocks', _crashOf: 'crashOf', _traceMates: 'traceMates', _pointAt: 'pointAt' };
const notShared = Object.keys(ALIAS).filter((m) => S.member(src, 'JiTA.logsig', m).replace(/\s*\/\/.*$/, '').trim() !== m + ': JITA_SH.' + ALIAS[m]);
ok('JiTA.logsig\'s pieces are the shared ones, under their old names', !notShared.length, notShared.join());
ok('...and so are its constants', /\n    MIN_FRAMES: JITA_SH\.MIN_FRAMES, CRASH_FRAMES: JITA_SH\.CRASH_FRAMES, TRACE: JITA_SH\.TRACE, OPEN_CUT: JITA_SH\.OPEN_CUT,/.test(S.top(src, 'JiTA.logsig')));
ok('...JITA_SH being jitaShared run once, before JiTA.logsig', /\nvar JITA_SH = jitaShared\(\);\n/.test(src) && src.indexOf('\nvar JITA_SH = jitaShared();') < src.indexOf('\nJiTA.logsig = {'));
ok('its index is built with the shared buildIndex', /var idx = JITA_SH\.buildIndex\(recs\)/.test(S.member(src, 'JiTA.logsig', 'ensure')));
// Where there is no worker (or it cannot answer), the page looks up its own index with the same functions.
const LOCAL = { _siblingsLocal: 'siblings(idx, key)', _relatedLocal: 'related(idx, key)', _clustersLocal: 'clusters(idx)', _matchTextLocal: 'matchText(idx, text)',
    _defectsLocal: 'defects(idx, sigs)', _holdingLocal: 'holding(idx, sigs)', _sigsOfLocal: 'sigsOf(idx, key)' };
const offLocal = Object.keys(LOCAL).filter((m) => S.member(src, 'JiTA.logsig', m).indexOf('return JiTA.logsig.ensure().then(function (idx) { return JITA_SH.' + LOCAL[m] + '; });') < 0);
ok('...its own lookups, where the worker cannot answer, are the shared ones on it', !offLocal.length, offLocal.join());
const att = S.member(src, 'JiTA.logsig', 'applyToTable');
ok('...and so is a parsed log\'s "+N related" list: the siblings, then the related tagged', /return JITA_SH\.siblings\(idx, defect\)\.concat\(rel\);/.test(att) &&
    /var rel = JITA_SH\.related\(idx, defect\)\.map\(/.test(att) && /o\.related = true;/.test(att) && !/function (siblings|crashPeers)\(defect\)/.test(att));
ok('no KEEP IN SYNC note is left on a piece written once', !/KEEP IN SYNC with (lg[A-Z]\w*|LG_TRACE|LG_OPEN)\b/.test(src) &&
    !/KEEP IN SYNC with JiTA\.logsig\.(_splitBlocks|_fingerprint|_logBlocks|_crashOf|isUserError|isTrace|_matchTextLocal|_defectsLocal|_holdingLocal|_sigsOfLocal|_traceMates|_pointAt)\b/.test(src));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'shared code checks passed.'));
process.exit(fail ? 1 : 0);
