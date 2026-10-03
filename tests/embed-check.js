// embed-check.js - the worker's embedding and storage (v3.38.23). Evals the real worker functions (sliced from
// jitaWorkerBody) and JiTA.db._bulkTx against stubs:
//  - loadModel is single-flight (two first callers built two pipelines), and a dropped pipe is disposed
//  - a vector computed from text that a sync has since replaced is not stored as current
//  - an embed pass asked for while one runs goes round again when it ends (it used to be dropped as "busy")
//  - a slice that always fails is skipped after its retries instead of stopping every pass at the same place, but
//    slice after slice failing still ends the pass
//  - openDb opens one connection for concurrent first calls; a transaction aborted at commit rejects
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };
const quiet = { log() {}, warn() {} };

(async () => {
    // ================= the model =================
    const loads = [];
    const M = new Function('loadModelOnce', 'console',
        'var pipe = null, backend = "webgpu/fp32", pipeP = null;\n' + cut('    function loadModel() {', '    async function loadModelOnce() {') +
        '\nreturn { loadModel: loadModel, dropPipe: dropPipe, set: function (p) { pipe = p; backend = "webgpu/fp32"; }, backend: function () { return backend; } };')(
        () => { const d = deferred(); loads.push(d); return d.promise; }, quiet);
    const a = M.loadModel(), b = M.loadModel();
    ok('two first callers share one model load', loads.length === 1, loads.length + ' loads');
    loads[0].reject(new Error('offline'));
    let failed = 0;
    await a.catch(() => { failed++; }); await b.catch(() => { failed++; });
    M.loadModel().catch(() => {});
    ok('...a failed load fails both and the next call tries again', failed === 2 && loads.length === 2, failed + ' / ' + loads.length);
    let disposed = 0;
    M.set({ dispose: () => { disposed++; return Promise.resolve(); } });
    M.dropPipe();
    ok('a dropped pipeline is disposed and the backend forgotten', disposed === 1 && M.backend() === 'none', disposed + ' / ' + M.backend());

    // ================= merging vectors back =================
    let rows = {}, puts = [];
    const fakeDb = {
        transaction: () => {
            const tx = { objectStore: () => ({
                get: (k) => { const g = {}; setImmediate(() => { g.result = rows[k] ? Object.assign({}, rows[k]) : undefined; g.onsuccess(); setImmediate(() => tx.oncomplete && tx.oncomplete()); }); return g; },
                put: (r) => { puts.push(r); }
            }) };
            return tx;
        }
    };
    const merge = new Function('openDb', 'cfg', cut('    function putEmbeddingsMerged(slice, vecs) {', '    // Embed every stored record') + '\nreturn putEmbeddingsMerged;')(
        () => Promise.resolve(fakeDb), { MODEL_VERSION: 'm2' });
    rows = { 'EDR-1': { key: 'EDR-1', textHash: 'new', enText: null }, 'EDR-2': { key: 'EDR-2', textHash: 'same', enText: null } };
    await merge([{ key: 'EDR-1', textHash: 'old', enText: null }, { key: 'EDR-2', textHash: 'same', enText: null }], [[1], [2]]);
    ok('a vector of text a sync has since replaced is not stored', !puts.some((p) => p.key === 'EDR-1'), puts.map((p) => p.key).join());
    ok('...one of the current text is (control)', puts.length === 1 && puts[0].key === 'EDR-2' && puts[0].embeddingModelVersion === 'm2');

    // ================= the embed pass =================
    let recsList = [], batches = [], stored = [], dropped = 0, pipeDrops = 0, failText = null, reads = 0, gate = null;
    const later = [];
    const mkPass = () => new Function('loadModel', 'allRecords', 'isClosedStatus', 'isGmTeam', 'cfg', 'effectiveText', 'embedBatch', 'putEmbeddingsMerged', 'dropIndexes', 'dropPipe', 'self', 'setTimeout', 'clearTimeout', 'console',
        'var embedding = false, embedAgain = false, BATCH = 1;\n' + cut('    async function embedPass() {', '\n    function openDb() {') +
        '\nreturn { embedPass: embedPass, again: function () { return embedAgain; } };')(
        () => Promise.resolve(), () => { reads++; return Promise.resolve(recsList.slice()); }, () => false, () => false, { MODEL_VERSION: 'm2' },
        (r) => r.text,
        (texts) => {
            batches.push(texts[0]);
            if (gate && texts[0] === gate.text) { return gate.d.promise.then(() => [new Float32Array([0.5])]); }
            return texts[0] === failText ? Promise.reject(new Error('device lost')) : Promise.resolve([new Float32Array([0.5])]);
        },
        (slice) => { stored.push(slice[0].key); return Promise.resolve(); },
        () => { dropped++; }, () => { pipeDrops++; }, { postMessage() {} },
        (fn, ms) => { if (ms !== 45000) { later.push(fn); setImmediate(() => { const f = later.shift(); if (f) { f(); } }); } return 1; }, () => {}, quiet);
    let E = mkPass();
    recsList = [{ key: 'EDR-1', text: 'one', project: 'EDR' }];
    gate = { text: 'one', d: deferred() };
    const first = E.embedPass();
    await flush();
    const busy = await E.embedPass();
    ok('a pass asked for while one runs is answered busy (control)', busy && busy.busy === true);
    recsList = [{ key: 'EDR-1', text: 'one', project: 'EDR', embedding: [1], embeddingModelVersion: 'm2' }, { key: 'EDR-9', text: 'nine', project: 'EDR' }];   // a sync stored EDR-9 meanwhile
    gate.d.resolve();
    const res = await first;
    ok('...and the running pass goes round again when it ends, embedding what arrived meanwhile', reads === 2 && stored.join() === 'EDR-1,EDR-9' && res.embedded === 2, reads + ' reads, ' + stored.join());
    ok('...dropping the indexes once, at the end', dropped === 1, String(dropped));

    E = mkPass(); gate = null; stored = []; batches = []; reads = 0; pipeDrops = 0;
    recsList = [{ key: 'EDR-1', text: 'one', project: 'EDR' }, { key: 'EDR-2', text: 'poison', project: 'EDR' }, { key: 'EDR-3', text: 'three', project: 'EDR' }];
    failText = 'poison';
    const r2 = await E.embedPass();
    ok('a slice that always fails is skipped after its retries, and the rest is embedded', stored.join() === 'EDR-1,EDR-3' && r2.embedded === 2 && batches.filter((b) => b === 'poison').length === 4,
        stored.join() + ' / ' + JSON.stringify(r2) + ' / ' + batches.join());
    ok('...each failure dropping the pipeline', pipeDrops === 4, String(pipeDrops));

    E = mkPass(); stored = [];
    recsList = [{ key: 'A', text: 'x', project: 'EDR' }, { key: 'B', text: 'x', project: 'EDR' }, { key: 'C', text: 'x', project: 'EDR' }, { key: 'D', text: 'ok', project: 'EDR' }];
    failText = 'x';
    let threw = null;
    try { await E.embedPass(); } catch (e) { threw = e; }
    ok('three slices in a row failing ends the pass: that is the device, not the text', !!threw && /device lost/.test(threw.message) && stored.length === 0, threw ? threw.message : stored.join());
    E = mkPass(); stored = [];
    recsList = [{ key: 'A', text: 'x', project: 'EDR' }, { key: 'B', text: 'ok', project: 'EDR' }, { key: 'C', text: 'x', project: 'EDR' }, { key: 'D', text: 'ok', project: 'EDR' }, { key: 'E', text: 'x', project: 'EDR' }];
    threw = null;
    let r3 = null;
    try { r3 = await E.embedPass(); } catch (e) { threw = e; }
    ok('...but three bad records apart from each other are three skips, not a dead device', !threw && stored.join() === 'B,D' && r3.embedded === 2, threw ? threw.message : stored.join());

    // ================= opening the DB =================
    const opens = [];
    const O = new Function('cfg', 'indexedDB', 'var db = null, dbP = null;\n' + cut('    function openDb() {', '    function allRecords() {') + '\nreturn openDb;')(
        { DB_NAME: 'x', DB_VERSION: 1 }, { open: () => { const req = {}; opens.push(req); return req; } });
    const p1 = O(), p2 = O();
    ok('concurrent first calls open one connection', opens.length === 1, opens.length + ' opens');
    opens[0].result = { onversionchange: null, close() {} };
    opens[0].onsuccess();
    const [d1, d2] = await Promise.all([p1, p2]);
    ok('...and share it', d1 === d2 && d1 === opens[0].result);

    // ================= a transaction aborted at commit =================
    let tx = null;
    global.JiTA = { db: { open: () => Promise.resolve({ transaction: () => { tx = { objectStore: () => ({ put() {} }) }; return tx; } }) } };
    Object.assign(JiTA.db, eval('({' + cut('    _bulkTx: function (items, apply) {', '\n    },\n') + '\n    }})'));
    let outcome = null;
    JiTA.db._bulkTx([{ key: 'EDR-1' }], (s, r) => s.put(r)).then(() => { outcome = 'ok'; }, (e) => { outcome = 'err:' + e.message; });
    await flush();
    tx.error = new Error('QuotaExceededError');
    if (tx.onabort) { tx.onabort(); }
    await flush();
    ok('a bulk write aborted at commit rejects instead of never settling', outcome === 'err:QuotaExceededError', String(outcome));

    // ================= the tab's side =================
    const prep = cut('    prepare: function (force) {', '        // Fallback (no worker at all)');
    ok('the tab no longer waits for an embedded count the acknowledgement never carries', prep.indexOf('r.embedded') === -1 && src.indexOf("JiTA.worker._workerCall('embedPass').then(function (r)") === -1);
    ok('the worker queues a pass asked for while busy', /if \(embedding\) \{ embedAgain = true; result = \{ started: false, busy: true, queued: true \}; \}/.test(src));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'embedding checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
