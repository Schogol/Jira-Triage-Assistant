// shared-check.js - code the page and the shared worker both run is written once (jitaShared, refactor of 2026-11-21).
// The worker runs from its own source text and sees nothing of the page, so such code was kept twice, marked KEEP IN
// SYNC, and pairs of it drifted apart (review 2026-11-20). Checked here: the shared copy is plain code (no JiTA, DOM,
// jQuery or GM storage, which the worker does not have), the worker is handed it and takes its pieces from it (its
// exception index built with buildIndex, every logsig request answered from it; its keyword indexes, keyword ranking and
// session filters from keywordIndex, bm25Score and passesGate), no copy of them is left in the worker, JiTA.logsig hands
// on the same pieces under its old names, its index and lookups being the shared ones, and JiTA.util / JiTA.rank /
// JiTA.ui's text helpers, local keyword ranking and session filter are the shared ones too, ranking as the worker does.
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
    'buildIndex', 'traceMates', 'pointAt', 'matchText', 'defects', 'holding', 'sigsOf', 'siblings', 'related', 'clusters',
    'isClosedStatus', 'isLeftOut', 'cleanForCompare', 'effectiveText', 'K1', 'B', 'STOP', 'tokenize', 'matchTerms', 'keywordIndex', 'passesGate', 'bm25Score'];
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
ok('no KEEP IN SYNC note is left on a piece written once', !/KEEP IN SYNC with (lg[A-Z]\w*|LG_TRACE|LG_OPEN|leftOut)\b/.test(src) &&
    !/KEEP IN SYNC with JiTA\.logsig\.(_splitBlocks|_fingerprint|_logBlocks|_crashOf|isUserError|isTrace|_matchTextLocal|_defectsLocal|_holdingLocal|_sigsOfLocal|_traceMates|_pointAt)\b/.test(src) &&
    !/Ported verbatim from JiTA\.util|Mirror of JiTA\.util\.(effectiveText|isLeftOut)/.test(src));

// ---- the text the ranking compares, and the keyword ranking (refactor 1 PR 3) ----
const TEXT = ['tokenize', 'bm25Score', 'matchTerms', 'passesGate', 'cleanForCompare', 'effectiveText', 'isClosedStatus'];
const wCopies = TEXT.filter((n) => new RegExp('\\n\\s*function ' + n + '\\(').test(body)).concat(/\n\s*var K1 = |\bSTOP\[/.test(body) ? ['K1/STOP'] : []);
ok('the worker keeps no copy of its own of the text helpers, the tokenizer or the BM25 scoring', !wCopies.length, wCopies.join());
const bare = TEXT.filter((n) => new RegExp('(^|[^.\\w])' + n + '\\(').test(body.replace(/\n\s*\/\/.*$/gm, '')));
ok('...and calls none of them but through SH', !bare.length, bare.join());
ok('...its leftOut being the shared one with the names it is handed', /\n    function leftOut\(rec\) \{ return SH\.isLeftOut\(rec, cfg\.LEFT_OUT\); \}/.test(body));
// The worker's keyword indexes and the tab's own (its fallback) are built alike, from one set of records.
const LEFT_OUT = eval('(' + /\n    LEFT_OUT: (\{[^\n]*\}),\n/.exec(src)[1] + ')');
const RECS = [
    { key: 'EDR-1', project: 'EDR', status: 'Open', summary: 'Warp drive stops', description: 'Reproduction Steps: warp to a gate. Computer Info: Windows 11, RTX 4070', created: '2026-10-01' },
    { key: 'EDR-2', project: 'EO', status: 'Closed', resolution: 'Fixed', summary: 'Fitting window empty', description: '<url=showinfo:587//1>Rifter</url> modules gone', created: '2026-01-01' },
    { key: 'EDR-3', project: 'PLAT', status: 'Open', resolution: 'Fixed', summary: 'Login loop', description: 'None', created: '2026-11-01', enText: 'login loop. login loop. launcher hangs' },
    { key: 'EBR-1', project: 'EBR', status: 'Open', summary: 'warp stops at gate', description: 'Session Info: char x Reproduction Steps: warp', created: '2026-11-10', labels: [], components: [] },
    { key: 'EBR-2', project: 'EBR', status: 'Attached', summary: 'warp stops', description: '', created: '2026-11-11' },
    { key: 'EBR-3', project: 'EBR', status: 'Open', summary: 'warp launcher', description: '', created: '2026-11-12', labels: ['vanguard'] },
    { key: 'EBR-4', project: 'EBR', status: 'Open', summary: 'fitting modules gone', description: 'rifter', created: '2026-11-13', components: ['Launcher'] },
    { key: 'EBR-5', project: 'EBR', status: 'Reopened', resolution: 'Fixed', summary: 'warp drive stops again', description: 'gate', created: '2026-11-14' }
];
const WB = new Function('SH', 'cfg', 'var vecCache = null, kwCache = null, logsigCache = null;\n' + S.fn(src, 'leftOut', body) + '\n' + S.fn(src, 'buildIndexes', body) +
    '\nvar RK = (' + S.block(body, body.indexOf('\n    async function rankKeyword(') + 1).trim().replace(/^async function rankKeyword/, 'async function') + ');\n' +
    'function ensureIndexes() { return Promise.resolve(); }\n' +
    'return { build: function (r) { buildIndexes(r); return kwCache; }, rank: RK };')(S.shared(src), { MODEL_VERSION: 'm', LEFT_OUT: LEFT_OUT });
const wKw = WB.build(RECS.slice());
global.JITA_SH = SH;
let hidden = {}, gateNow = null;
global.JiTA = { LEFT_OUT: LEFT_OUT, TOP_N: 8, util: {}, rank: {}, ui: { _gateSpec: () => gateNow }, hidden: { isHidden: (k) => !!hidden[k] } };
Object.assign(JiTA.util, eval(S.members(src, 'JiTA.util', ['cleanForCompare', 'effectiveText', 'isClosedStatus', 'isLeftOut'])));
Object.assign(JiTA.rank, eval(S.members(src, 'JiTA.rank', ['_tokenize', '_matchTerms', '_ensureIndex', '_ensureEbrIndex'])));
eval(S.top(src, 'JiTA.rank._buildKeywordIndex'));
eval(S.top(src, 'JiTA.rank._bm25Score'));
let pKw = {};
JiTA.rank._ensureCached = (a, b, c, build) => Promise.resolve(build(RECS.slice()));
const J = (x) => JSON.stringify(x);
(async () => {
    pKw = { defects: await JiTA.rank._ensureIndex(), ebr: await JiTA.rank._ensureEbrIndex() };
    ok('the worker builds its keyword indexes with the shared keywordIndex, as the tab builds its own', J(wKw) === J(pKw) && wKw.defects.N === 3 && wKw.ebr.N === 2,
        J(wKw).slice(0, 200) + ' / ' + J(pKw).slice(0, 200));
    ok('...the bug reports ranked being the open ones not left out, a reopened one too', pKw.ebr.docs.map((d) => d.key).join() === 'EBR-1,EBR-5', pKw.ebr.docs.map((d) => d.key).join());
    // The tab's local keyword ranking answers as the worker's, less what the user hid, under every session filter.
    const GATES = [null, { status: 'open', createdDays: 0 }, { status: 'fixed', createdDays: 0 }, { status: 'all', createdDays: 30 }];
    const offRank = [];
    for (const g of GATES) {
        const gate = g && Object.assign({ now: Date.parse('2026-11-21T12:00:00Z'), cats: { closed: 'done', open: 'todo' } }, g);
        for (const scope of ['defects', 'ebr']) {
            for (const [text, terms] of [['warp drive stops at the gate', null], ['fitting modules rifter', null], ['warp', ['gate']], ['nothing like it', ['loop']]]) {
                gateNow = gate; hidden = {};
                const w = (await WB.rank({ text: text, scope: scope, topN: 8, filterTerms: terms, gate: gate })).results;
                const t = JiTA.rank._bm25Score(pKw[scope], text, null, 8, terms);
                if (J(w) !== J(t)) { offRank.push(scope + ' ' + text + ' ' + J(g) + ': ' + J(w) + ' vs ' + J(t)); }
                if (w.length) {
                    hidden[w[0].key] = true;
                    const t2 = JiTA.rank._bm25Score(pKw[scope], text, null, 8, terms);
                    if (J(t2) !== J(w.slice(1))) { offRank.push('hidden ' + scope + ' ' + text + ': ' + J(t2)); }
                }
            }
        }
    }
    ok('the tab\'s local keyword ranking answers as the worker\'s, less the suggestions hidden, under every session filter', !offRank.length, offRank.slice(0, 2).join(' | '));
    const UTIL = { cleanForCompare: 'JITA_SH.cleanForCompare', effectiveText: 'JITA_SH.effectiveText', isClosedStatus: 'JITA_SH.isClosedStatus' };
    const offUtil = Object.keys(UTIL).filter((m) => S.member(src, 'JiTA.util', m).replace(/\s*\/\/.*$/, '').trim() !== m + ': ' + UTIL[m]);
    ok('JiTA.util\'s text helpers are the shared ones', !offUtil.length && /isLeftOut: function \(rec\) \{ return JITA_SH\.isLeftOut\(rec, JiTA\.LEFT_OUT\); \}/.test(S.member(src, 'JiTA.util', 'isLeftOut')), offUtil.join());
    ok('...and so are JiTA.rank\'s tokenizer, filter-box test and keyword index', /^    _tokenize: JITA_SH\.tokenize\s*(\/\/.*)?$/.test(S.member(src, 'JiTA.rank', '_tokenize')) &&
        /^    _matchTerms: JITA_SH\.matchTerms\s*(\/\/.*)?$/.test(S.member(src, 'JiTA.rank', '_matchTerms')) && /^JiTA\.rank\._buildKeywordIndex = JITA_SH\.keywordIndex;/m.test(src));
    ok('...and the session filter, judged by the shared gate', /passesFilter: function \(doc\) \{ return JITA_SH\.passesGate\(doc, JiTA\.ui\._gateSpec\(\)\); \}/.test(S.member(src, 'JiTA.ui', 'passesFilter')));
    ok('...nor does the tab keep a tokenizer\'s word list or BM25 constants of its own', !/\n    (STOP|K1|B): /.test(S.top(src, 'JiTA.rank')));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'shared code checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
