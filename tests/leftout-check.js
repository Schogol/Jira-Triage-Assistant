// leftout-check.js - Matching bug reports (on a defect) and Similar open reports (on a report) leave out the Vanguard and
// Launcher bug reports, as the bug hunters' backlog filter does, and no longer leave out the EO - GameMasters team's
// (v3.52.0). Evals the real JiTA.util.isLeftOut and the worker's leftOut (both jitaShared's isLeftOut), JiTA.sync._mapIssue, the tab's bug report index,
// JiTA.rank._gateScored, and the worker's index build and embed pass against stubs:
//  - labelled Vanguard or Launcher, or in the Launcher component, whatever the case, is left out; another label or
//    component, a label that only starts the same, and a report with neither are not; the tab and the worker agree
//  - the names are the backlog filter's own (JiTA.dv.DEFAULT_JQL), and the worker is handed them
//  - the sync keeps each report's labels and no longer asks for the Team field
//  - left out of the tab's index, the worker's keyword and vector indexes, the embed pass and the translate pass; a
//    report with the GM team is in all of them now
//  - v3.52.1: the "N open reports" on the status line counts the reports ranked (the index's size: JiTA.rank.ebrPool),
//    not every bug report stored, which still holds the left-out ones
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
    const S = require('./source'), SH = S.shared(src), BODY = S.fn(src, 'jitaWorkerBody');
    global.JITA_SH = SH;   // jitaShared, the page's run of it, which JiTA.util's isLeftOut and isClosedStatus are
    Object.assign(JiTA.util, eval(S.members(src, 'JiTA.util', ['isLeftOut', 'isClosedStatus'])));
    const workerLeftOut = new Function('cfg', 'SH', S.fn(src, 'leftOut', BODY) + '\nreturn leftOut;')({ LEFT_OUT: LEFT_OUT }, S.shared(src));
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
    const idx = new Function('allRecords', 'leftOut', 'SH', 'cfg',
        'var vecCache = null, kwCache = null, logsigCache = null;\n' +
        cut('    var idxGen = 0, idxP = null;', '    // Cosine == dot product') +
        cut('    async function rankKeyword(payload) {', '\n    }\n') + '\n    }\n' +
        '\nreturn { ensureIndexes: ensureIndexes, rankKeyword: rankKeyword, kw: function () { return kwCache; }, vec: function () { return vecCache; } };')(
        () => Promise.resolve(RECS.slice()), workerLeftOut, S.shared(src), { MODEL_VERSION: 'm1' });
    await idx.ensureIndexes();
    ok('the worker\'s keyword index of bug reports leaves them out, keeps the GM team\'s', keys(idx.kw().ebr.docs) === 'EBR-1,EBR-4', keys(idx.kw().ebr.docs));
    ok('...and so does its vector index, though the Vanguard one was embedded before', keys(idx.vec().ebr) === 'EBR-4', keys(idx.vec().ebr));
    ok('...while a defect in the Launcher component stays among the defects', keys(idx.kw().defects.docs) === 'EDR-6' && keys(idx.vec().defects) === 'EDR-6');
    const sized = await idx.rankKeyword({ text: '', scope: 'ebr', topN: 1 });
    ok('an empty query tells the size of the bug report index: the reports ranked, not the five stored', sized.indexed === 2 && sized.results.length === 0, JSON.stringify(sized));

    // ================= the count on the status line (v3.52.1) =================
    let asked = [], answer = null, usable = true, localN = 2, localFails = false;
    JiTA.worker = { usable: () => usable, call: (op, payload) => { asked.push(op + ':' + JSON.stringify(payload)); return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer); } };
    JiTA.rank._ensureEbrIndex = () => (localFails ? Promise.reject(new Error('no db')) : Promise.resolve({ N: localN }));
    JiTA.db = { countEbr: () => Promise.resolve(5) };
    const pool = eval('({' + cut('    ebrPool: function () {', '\n    }\n') + '\n    }})').ebrPool;   // the last member: no comma after it
    answer = await idx.rankKeyword({ text: '', scope: 'ebr', topN: 1 });
    ok('the status line counts the reports the worker ranks', (await pool()) === 2 && asked.length === 1 && asked[0] === 'rankKeyword:{"text":"","scope":"ebr","topN":1}', asked.join());
    answer = { results: [] }; localN = 3;
    ok('...the tab\'s own index when the worker gives no size', (await pool()) === 3);
    answer = new Error('worker gone');
    ok('...or fails', (await pool()) === 3);
    usable = false; asked = [];
    ok('...and without the worker, asks it nothing', (await pool()) === 3 && asked.length === 0);
    localFails = true;
    ok('...failing both, every report stored', (await pool()) === 5);
    const ui = src.slice(src.indexOf('\nJiTA.ui = {'));
    const fromPool = (ui.match(/\(' \+ open \+ ' open\)\.'\)/g) || []).length;
    ok('both lists say that count when they find none', fromPool === 2 && (ui.match(/JiTA\.rank\.ebrPool\(\)/g) || []).length === 2 && !/' \+ n \+ ' open\)/.test(ui), String(fromPool));
    ok('...and no list has a count line above its rows (v3.58.0), the line after Attach slides the next report in included',
        !/' open reports'\)|' matches · '|' similar · '|' suggestions · '|function refreshCount\(\)/.test(ui));
    ok('...the status line hiding while it has nothing to say', /#jita-sd-status:empty, #jita-side-group #jita-sd-status:empty \{ display: none; \}/.test(ui));

    const embedded = [];
    const ep = new Function('loadModel', 'allRecords', 'SH', 'leftOut', 'cfg', 'embedBatch', 'putEmbeddingsMerged', 'dropIndexes', 'dropPipe', 'self', 'setTimeout', 'clearTimeout', 'console',
        'var embedding = false, embedAgain = false, BATCH = 8;\n' + cut('    async function embedPass() {', '\n    function openDb() {') + '\nreturn embedPass;')(
        () => Promise.resolve(), () => Promise.resolve(RECS.map((r) => Object.assign({}, r, { embedding: null }))), S.shared(src), workerLeftOut,
        { MODEL_VERSION: 'm1' }, (texts) => Promise.resolve(texts.map(() => new Float32Array([0.5]))),
        (slice) => { slice.forEach((r) => embedded.push(r.key)); return Promise.resolve(); }, () => {}, () => {}, { postMessage() {} },
        () => 1, () => {}, { warn() {} });
    await ep();
    await flush();
    ok('the embed pass leaves them out too, and embeds the GM team\'s', embedded.join() === 'EBR-1,EBR-4,EDR-6', embedded.join());

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'left-out checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
