// leftout-check.js - Matching bug reports (on a defect) and Similar open reports (on a report) leave out the Vanguard and
// Launcher bug reports, as the bug hunters' backlog filter does, and no longer leave out the EO - GameMasters team's
// (v3.52.0). Evals the real JiTA.util.isLeftOut, the worker's leftOut, JiTA.sync._mapIssue, the tab's bug report index,
// JiTA.rank._gateScored, and the worker's index build and embed pass against stubs:
//  - labelled Vanguard or Launcher, or in the Launcher component, whatever the case, is left out; another label or
//    component, a label that only starts the same, and a report with neither are not; the tab and the worker agree
//  - the names are the backlog filter's own (JiTA.dv.DEFAULT_JQL), and the worker is handed them
//  - the sync keeps each report's labels and no longer asks for the Team field
//  - left out of the tab's index, the worker's keyword and vector indexes, the embed pass and the translate pass; a
//    report with the GM team is in all of them now
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to, at) => {
    const s = src.indexOf(from, at || 0), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || (at == null && src.indexOf(from, s + 1) >= 0)) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};
const member = (head, at) => cut(head, '\n    },', at) + '\n    }';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 20; i++) { await new Promise((r) => setImmediate(r)); } };
const keys = (list) => list.map((r) => r.key).join(',');

(async () => {
    // ================= what is left out =================
    const lo = /\n    LEFT_OUT: (\{[^\n]*\}),\n/.exec(src);
    const LEFT_OUT = eval('(' + lo[1] + ')');
    global.JiTA = { LEFT_OUT: LEFT_OUT, util: {}, rank: {}, sync: {}, hidden: { isHidden: () => false }, ui: { passesFilter: () => true } };
    Object.assign(JiTA.util, eval('({' + member('    isLeftOut: function (rec) {') + ',\n' + member('    isClosedStatus: function (status) {') + '})'));
    const workerLeftOut = new Function('cfg', cut('    function leftOut(rec) {', '\n    }\n') + '\n    }\nreturn leftOut;')({ LEFT_OUT: LEFT_OUT });
    const cases = [
        ['labelled Vanguard', { labels: ['Russian', 'Vanguard'], components: [] }, true],
        ['labelled Launcher', { labels: ['Launcher'] }, true],
        ['...whatever the case', { labels: ['vanguard'] }, true],
        ['in the Launcher component', { labels: [], components: ['Launcher'] }, true],
        ['...whatever the case', { components: ['LAUNCHER'] }, true],
        ['...also from before labels were kept', { components: ['Launcher'] }, true],
        ['another label or component', { labels: ['Russian'], components: ['Client'] }, false],
        ['a label that only starts the same', { labels: ['VanguardTest', 'Launcher-Issue'] }, false],
        ['a report with neither', {}, false],
        ['nothing at all', null, false]
    ];
    cases.forEach(([name, rec, want]) => {
        const tab = JiTA.util.isLeftOut(rec), wk = workerLeftOut(rec);
        ok((want ? 'left out: ' : 'kept: ') + name + ', in the tab and in the worker alike', tab === want && wk === want, 'tab ' + tab + ', worker ' + wk);
    });

    const dq = /DEFAULT_JQL: '([^']*)'/.exec(src)[1];
    const names = (re) => ((re.exec(dq) || [])[1] || '').split(',').map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase()).filter(Boolean).sort().join();
    ok('the labels are the backlog filter\'s own', names(/labels not in \(([^)]*)\)/) === LEFT_OUT.labels.map((s) => s.toLowerCase()).sort().join(), names(/labels not in \(([^)]*)\)/));
    ok('...and so is the component', names(/component not in \(([^)]*)\)/) === LEFT_OUT.components.map((s) => s.toLowerCase()).sort().join(), names(/component not in \(([^)]*)\)/));
    ok('the worker is handed the names', /LEFT_OUT: JiTA\.LEFT_OUT[,\s]/.test(cut('    _src: function () {', '\n    },')));

    // ================= the sync keeps labels =================
    const top = src.indexOf('\n    LEFT_OUT: ');
    const fields = eval(/FIELDS: (\[[^\]]*\])/.exec(src.slice(top))[1]);
    ok('the sync asks for the labels', fields.indexOf('labels') >= 0, fields.join());
    ok('...and no longer for the Team field', fields.indexOf('customfield_10001') < 0, fields.join());
    JiTA.util.toPlainText = (d) => d || '';
    JiTA.util.hash = () => 'h';
    const map = eval('({' + member('    _mapIssue: function (issue) {') + '})')._mapIssue;
    const r1 = map({ key: 'EBR-1', fields: { summary: 's', project: { key: 'EBR' }, labels: ['Vanguard', 'Russian'], components: [{ name: 'Client' }], customfield_10001: 'x-38' } });
    ok('a report is stored with its labels', JSON.stringify(r1.labels) === '["Vanguard","Russian"]', JSON.stringify(r1.labels));
    ok('...and without a team', !('team' in r1), JSON.stringify(r1));
    const r2 = map({ key: 'EBR-2', fields: { summary: 's', project: { key: 'EBR' } } });
    ok('...and one with none, with no labels', Array.isArray(r2.labels) && r2.labels.length === 0, JSON.stringify(r2.labels));

    // The open reports every check below draws from.
    const RECS = [
        { key: 'EBR-1', project: 'EBR', status: 'Open', summary: 'warp bug', labels: [], components: [] },
        { key: 'EBR-2', project: 'EBR', status: 'Open', summary: 'warp bug vanguard', labels: ['Vanguard'], components: [], embedding: [0.1], embeddingModelVersion: 'm1' },
        { key: 'EBR-3', project: 'EBR', status: 'Open', summary: 'warp bug launcher', labels: [], components: ['Launcher'] },
        { key: 'EBR-4', project: 'EBR', status: 'Open', summary: 'warp bug gm', labels: [], components: [], team: 'ef4edd53-c099-4431-82af-9b4bd717cb88-38', embedding: [0.2], embeddingModelVersion: 'm1' },
        { key: 'EBR-5', project: 'EBR', status: 'Closed', summary: 'warp bug closed', labels: [], components: [] },
        { key: 'EDR-6', project: 'EDR', status: 'Open', summary: 'warp defect', labels: ['Launcher'], components: ['Launcher'], embedding: [0.3], embeddingModelVersion: 'm1' }
    ];

    // ================= the tab =================
    JiTA.rank._ensureCached = (a, b, c, build) => Promise.resolve(build(RECS));
    JiTA.rank._buildKeywordIndex = (recs, pred) => recs.filter(pred);
    const tabIdx = await eval('({' + member('    _ensureEbrIndex: function () {') + '})')._ensureEbrIndex();
    ok('the tab\'s bug report index leaves out the Vanguard and Launcher reports, keeps the GM team\'s', keys(tabIdx) === 'EBR-1,EBR-4', keys(tabIdx));
    const gate = eval('(function () {' + cut('JiTA.rank._gateScored = function (cands, scope) {', '\n};\n') + '\n};\nreturn JiTA.rank._gateScored; })()');
    const gated = gate([{ key: 'EBR-4', status: 'Open', team: 'ef4edd53-c099-4431-82af-9b4bd717cb88-38' }, { key: 'EBR-5', status: 'Closed' }, { key: 'EBR-1', status: 'Open' }], 'ebr');
    ok('the gate on the worker\'s answers lets a GM team report through, not a closed one', keys(gated) === 'EBR-4,EBR-1', keys(gated));
    const tr = src.slice(src.indexOf('\nJiTA.translate = {'));
    ok('the translate pass skips the reports left out, as it skips closed ones', /if \(JiTA\.util\.isClosedStatus\(r\.status\) \|\| JiTA\.util\.isLeftOut\(r\)\) \{ continue; \}/.test(tr.slice(0, tr.indexOf('\n};\n'))));

    // ================= the worker =================
    const idx = new Function('allRecords', 'isClosedStatus', 'leftOut', 'tokenize', 'effectiveText', 'lgSplit', 'lgFp', 'cfg',
        'var vecCache = null, kwCache = null, logsigCache = null;\n' +
        cut('    var idxGen = 0, idxP = null;', '    // Cosine == dot product') +
        '\nreturn { ensureIndexes: ensureIndexes, kw: function () { return kwCache; }, vec: function () { return vecCache; } };')(
        () => Promise.resolve(RECS.slice()), JiTA.util.isClosedStatus, workerLeftOut,
        (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
        (r) => (r.summary || '') + ' ' + (r.description || ''),
        () => [], () => ({}), { MODEL_VERSION: 'm1' });
    await idx.ensureIndexes();
    ok('the worker\'s keyword index of bug reports leaves them out, keeps the GM team\'s', keys(idx.kw().ebr.docs) === 'EBR-1,EBR-4', keys(idx.kw().ebr.docs));
    ok('...and so does its vector index, though the Vanguard one was embedded before', keys(idx.vec().ebr) === 'EBR-4', keys(idx.vec().ebr));
    ok('...while a defect in the Launcher component stays among the defects', keys(idx.kw().defects.docs) === 'EDR-6' && keys(idx.vec().defects) === 'EDR-6');

    const embedded = [];
    const ep = new Function('loadModel', 'allRecords', 'isClosedStatus', 'leftOut', 'cfg', 'effectiveText', 'embedBatch', 'putEmbeddingsMerged', 'dropIndexes', 'dropPipe', 'self', 'setTimeout', 'clearTimeout', 'console',
        'var embedding = false, embedAgain = false, BATCH = 8;\n' + cut('    async function embedPass() {', '\n    function openDb() {') + '\nreturn embedPass;')(
        () => Promise.resolve(), () => Promise.resolve(RECS.map((r) => Object.assign({}, r, { embedding: null }))), JiTA.util.isClosedStatus, workerLeftOut,
        { MODEL_VERSION: 'm1' }, (r) => r.summary, (texts) => Promise.resolve(texts.map(() => new Float32Array([0.5]))),
        (slice) => { slice.forEach((r) => embedded.push(r.key)); return Promise.resolve(); }, () => {}, () => {}, { postMessage() {} },
        () => 1, () => {}, { warn() {} });
    await ep();
    await flush();
    ok('the embed pass leaves them out too, and embeds the GM team\'s', embedded.join() === 'EBR-1,EBR-4,EDR-6', embedded.join());

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'left-out checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
