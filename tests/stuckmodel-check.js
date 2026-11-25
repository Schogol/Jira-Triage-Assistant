// stuckmodel-check.js - a stuck embedding model (v3.58.2). After a standby the graphics card's model in the shared worker
// stopped answering. The open report's lookup had no guard, so every report but the one the worker had embedded just before
// ranked by keywords alone until the worker's tab was reloaded, and nothing said why. Evals the real code against stubs:
//  - the worker: a query the model gives no answer to within QUERY_MS, one it fails and one answered with no usable vector
//    each drop that pipeline and ask a fresh one; two failures in a row leave the graphics card alone, so the third try runs
//    on the processor; three failures fail the query with the last reason and keep nothing; the last answer is kept for the
//    same text (control); the tab hands QUERY_MS over
//  - dropPipe drops only the pipeline a failed call ran on, and the embed pass hands its batch's pipeline over
//  - the tab: each Keyword result says why (by hand, no worker, not answered yet, worker failed, nothing by meaning), a
//    failed worker is logged, the mode badge shows the reason in its hover, and a late fallback corrects a waiting badge
const S = require('./source');
const src = S.load();
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const realSetTimeout = setTimeout;
// A promise that has not settled after 300 ms of real time reads 'STUCK': a check that would hang fails instead.
const within = (p) => Promise.race([p.then((v) => ({ v: v }), (e) => ({ e: e })), new Promise((r) => realSetTimeout(() => r('STUCK'), 300))]);
const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };
const quiet = { log() {}, warn() {} };

(async () => {
    // ================= the worker's lookup =================
    // Each call of a pipeline takes the next answer from `plan`: 'ok', 'hang' (never answers), 'throw', or 'nan'.
    let plan = [], loads = [], calls = 0, disposed = 0, waits = [];
    const mkPipe = (device) => {
        const p = (text) => {
            calls++;
            const how = plan.shift() || 'ok';
            if (how === 'hang') { return new Promise(() => {}); }
            if (how === 'throw') { return Promise.reject(new Error('device lost')); }
            return Promise.resolve({ data: new Float32Array(how === 'nan' ? [NaN, NaN] : [0.6, 0.8]) });
        };
        p.device = device;
        p.dispose = () => { disposed++; return Promise.resolve(); };
        return p;
    };
    const lib = { env: { backends: { onnx: { wasm: {} } } }, pipeline: (task, model, opt) => { loads.push(opt.device); return Promise.resolve(mkPipe(opt.device)); } };
    const body = cut('    function loadModel() {', '    // ---- embed pass');
    const libbed = body.replace('await import(cfg.LIB)', 'await importLib(cfg.LIB)');
    if (libbed === body) { throw new Error('loadModelOnce no longer imports cfg.LIB'); }
    // The watchdog fires once whatever is pending has had its turn: an answer that comes wins, one that never comes loses.
    const mkWorker = () => {
        let tid = 0;
        const off = new Set();
        const st = (fn, ms) => { const id = ++tid; waits.push(ms); setImmediate(() => { if (!off.has(id)) { fn(); } }); return id; };
        return new Function('cfg', 'importLib', 'setTimeout', 'clearTimeout', 'console',
            'var pipe = null, backend = "none", pipeP = null, gpuOff = false, BATCH = 8;\n' + libbed +
            '\nreturn { qEmbed: qEmbed, dropPipe: dropPipe, loadModel: loadModel, state: function () { return { pipe: pipe, backend: backend, gpuOff: gpuOff }; } };')(
            { QUERY_MS: 7000, tryGpu: true, LIB: 'lib', MODEL: 'm' }, () => Promise.resolve(lib), st, (id) => { off.add(id); }, quiet);
    };
    const fresh = () => { plan = []; loads = []; calls = 0; disposed = 0; waits = []; return mkWorker(); };
    const vec = (r) => (r && r.v ? Array.from(r.v).map((x) => Math.round(x * 10) / 10).join() : (r && r.e ? 'error: ' + r.e.message : String(r)));

    let W = fresh();
    plan = ['ok'];
    let r = await within(W.qEmbed('text a'));
    ok('a model that answers gives the vector, on the graphics card (control)', vec(r) === '0.6,0.8' && loads.join() === 'webgpu' && waits[0] === 7000, vec(r) + ' / ' + loads.join() + ' / ' + waits.join());
    r = await within(W.qEmbed('text a'));
    ok('...and the same text again is answered from the last vector, without the model (control)', vec(r) === '0.6,0.8' && calls === 1, calls + ' calls');

    W = fresh();
    plan = ['hang', 'ok'];
    r = await within(W.qEmbed('text b'));
    ok('a model that gives no answer within QUERY_MS is dropped, and a fresh one asked', vec(r) === '0.6,0.8' && loads.join() === 'webgpu,webgpu' && disposed === 1, vec(r) + ' / ' + loads.join() + ' / ' + disposed + ' disposed');
    ok('...one failure leaves the graphics card on', W.state().gpuOff === false);

    W = fresh();
    plan = ['throw', 'ok'];
    r = await within(W.qEmbed('text c'));
    ok('a model that fails is dropped, and a fresh one asked', vec(r) === '0.6,0.8' && loads.length === 2 && disposed === 1, vec(r) + ' / ' + loads.join() + ' / ' + disposed);

    W = fresh();
    plan = ['nan', 'ok'];
    r = await within(W.qEmbed('text d'));
    ok('a model that answers with no usable vector counts as failed', vec(r) === '0.6,0.8' && loads.length === 2 && disposed === 1, vec(r) + ' / ' + loads.join());

    W = fresh();
    plan = ['hang', 'throw', 'ok'];
    r = await within(W.qEmbed('text e'));
    ok('two failures in a row leave the graphics card alone: the third try runs on the processor', vec(r) === '0.6,0.8' && loads.join() === 'webgpu,webgpu,wasm' && W.state().gpuOff === true,
        vec(r) + ' / ' + loads.join() + ' / gpuOff ' + W.state().gpuOff);

    W = fresh();
    plan = ['ok'];
    await within(W.qEmbed('text f'));
    plan = ['throw', 'throw', 'hang'];
    r = await within(W.qEmbed('text g'));
    ok('three failures fail the query, with the last reason', !!(r && r.e) && /no answer in 7 s/.test(r.e.message), vec(r));
    calls = 0; plan = ['ok'];
    r = await within(W.qEmbed('text g'));
    ok('...and keep nothing: the same text asks the model again', vec(r) === '0.6,0.8' && calls === 1, vec(r) + ' / ' + calls + ' calls');

    // ---- dropPipe ----
    W = fresh();
    plan = ['ok'];
    await within(W.qEmbed('text h'));
    const cur = W.state().pipe;
    W.dropPipe(mkPipe('webgpu'));
    ok('a failure on a pipeline that has been replaced leaves the fresh one', W.state().pipe === cur && disposed === 0, disposed + ' disposed');
    W.dropPipe(cur);
    ok('...a failure on the one in use drops it (control)', W.state().pipe === null && disposed === 1 && W.state().backend === 'none');
    await within(W.loadModel());
    W.dropPipe();
    ok('...and a drop naming none drops the one in use, as before (control)', W.state().pipe === null && disposed === 2, disposed + ' disposed');

    // ---- the embed pass hands its batch's pipeline over ----
    const P7 = { id: 'P7' }, gotPipes = [], dropArgs = [];
    let tries = 0, storedKeys = [];
    const pass = new Function('loadModel', 'allRecords', 'SH', 'leftOut', 'cfg', 'embedBatch', 'putEmbeddingsMerged', 'dropIndexes', 'dropPipe', 'self', 'setTimeout', 'clearTimeout', 'console',
        'var embedding = false, embedAgain = false, BATCH = 1;\n' + cut('    async function embedPass() {', '\n    function openDb() {') + '\nreturn embedPass;')(
        () => Promise.resolve(P7), () => Promise.resolve([{ key: 'EDR-1', text: 'one', project: 'EDR' }]),
        { isClosedStatus: () => false, effectiveText: (x) => x.text }, () => false, { MODEL_VERSION: 'm2' },
        (texts, p) => { gotPipes.push(p); return ++tries === 1 ? Promise.reject(new Error('device lost')) : Promise.resolve([new Float32Array([0.5])]); },
        (slice) => { storedKeys.push(slice[0].key); return Promise.resolve(); }, () => {}, (p) => { dropArgs.push(p); }, { postMessage() {} },
        (fn, ms) => { if (ms !== 45000) { setImmediate(fn); } return 1; }, () => {}, quiet);
    await within(pass());
    ok('the embed pass runs each batch on the pipeline it loaded', gotPipes.length === 2 && gotPipes.every((p) => p === P7) && storedKeys.join() === 'EDR-1', gotPipes.map((p) => p && p.id).join());
    ok('...and a failed batch drops that pipeline, not whichever is current by then', dropArgs.length === 1 && dropArgs[0] === P7, dropArgs.map((p) => p && p.id).join());

    // ---- the tab hands the limit over ----
    ok('the worker is built with QUERY_MS', /QUERY_MS: JiTA\.embed\.QUERY_MS, /.test(S.member(src, 'JiTA.worker', '_src')) && /QUERY_MS: 10000,/.test(S.top(src, 'JiTA.embed')));

    // ================= the tab: why a list is Keyword =================
    let logs = [], late = [], renders = 0, timers = [];
    global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
    global.clearTimeout = () => {};
    let usable = true;
    global.JiTA = {
        log: (...a) => { logs.push(a.join(' ')); },
        worker: { usable: () => usable }, embed: { WARM_WAIT_MS: 4200 },
        ui: { scheduleRender: () => { renders++; }, _lateWhy: (w) => { late.push(w); } },
        rank: { CAND: 50, _gateScored: (c) => c, _boostMap: () => Promise.resolve(null), _withBoost: () => null, _fuse: (sem) => sem }
    };
    (0, eval)(S.top(src, 'JiTA.rank._pickMode'));
    (0, eval)(S.top(src, 'JiTA.rank._hybridResults'));
    const kwOnly = () => Promise.resolve({ mode: 'Keyword', results: [] });
    const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

    r = await JiTA.rank._pickMode('Keyword', kwOnly, () => Promise.resolve({ mode: 'Hybrid', results: [] }));
    ok('Keyword chosen by hand says so', r.mode === 'Keyword' && /by hand/.test(r.why || ''), r.why);
    usable = false;
    r = await JiTA.rank._pickMode(null, kwOnly, () => Promise.resolve({ mode: 'Hybrid', results: [] }));
    ok('Keyword with no worker in the tab says so', r.mode === 'Keyword' && /cannot run in this tab/.test(r.why || ''), r.why);
    usable = true;
    r = await JiTA.rank._pickMode(null, kwOnly, () => Promise.resolve({ mode: 'Hybrid', results: ['h'] }));
    ok('a worker that answers in time gives Hybrid, with no reason (control)', r.mode === 'Hybrid' && !r.why, JSON.stringify(r));

    const slow = async (res) => {
        timers = []; late = []; renders = 0;
        const h = deferred();
        const p = JiTA.rank._pickMode(null, kwOnly, () => h.promise);
        timers.forEach((f) => f());   // the warm window closes first
        const first = await p;
        h.resolve(res);
        await flush();
        return first;
    };
    r = await slow({ mode: 'Keyword', results: [], why: 'the ranking worker failed: the model gave no answer in 10 s' });
    ok('a list drawn while the worker has not answered says it waits for it', r.mode === 'Keyword' && /had not answered after 4\.2 s/.test(r.why || '') && r.wait === true, JSON.stringify(r));
    ok('...a late fallback corrects the badge with its reason, and redraws nothing', late.length === 1 && /no answer in 10 s/.test(late[0]) && renders === 0, late.join() + ' / ' + renders);
    await slow({ mode: 'Keyword', results: [] });
    ok('...a late fallback with no reason leaves the badge alone', late.length === 0, late.join());
    await slow({ mode: 'Hybrid', results: [] });
    ok('...and a late Hybrid redraws the list, as before (control)', renders === 1 && late.length === 0, renders + ' / ' + late.join());

    let semantic = () => Promise.reject(new Error('the model gave no answer in 10 s'));
    JiTA.rank._workerSemantic = () => semantic();
    const bm = () => Promise.resolve([]);
    logs = [];
    r = await JiTA.rank._hybridResults('text', 'EBR-1', null, 'defects', bm, kwOnly, null, null);
    ok('a failed worker falls back to Keyword and says why', r.mode === 'Keyword' && r.why === 'the ranking worker failed: the model gave no answer in 10 s', JSON.stringify(r));
    ok('...and logs it, for Copy diagnostics', logs.length === 1 && /EBR-1/.test(logs[0]) && /keywords only/.test(logs[0]) && /no answer in 10 s/.test(logs[0]), logs.join(' | '));
    semantic = () => Promise.resolve([]);
    logs = [];
    r = await JiTA.rank._hybridResults('text', 'EBR-1', null, 'defects', bm, kwOnly, null, null);
    ok('nothing found by meaning falls back to Keyword and says so, without a log line', r.mode === 'Keyword' && /nothing was found by meaning: no defect /.test(r.why || '') && logs.length === 0, (r.why || '') + ' / ' + logs.join());
    r = await JiTA.rank._hybridResults('text', 'EDR-1', null, 'ebr', bm, kwOnly, null, null);
    ok('...naming open reports on a defect', /no open report /.test(r.why || ''), r.why);
    semantic = () => Promise.resolve([{ key: 'EDR-9', score: 0.9 }]);
    r = await JiTA.rank._hybridResults('text', 'EBR-1', null, 'defects', bm, kwOnly, null, null);
    ok('a worker that answers gives Hybrid (control)', r.mode === 'Hybrid' && !r.why, JSON.stringify(r));
    global.setTimeout = realSetTimeout;

    // ================= the mode badge =================
    const badge = { length: 1, _text: '', attrs: {} };
    badge.text = (v) => { badge._text = v; return badge; };
    badge.attr = (k, v) => { if (v === undefined) { return badge.attrs[k]; } if (v === null) { delete badge.attrs[k]; } else { badge.attrs[k] = String(v); } return badge; };
    badge.removeAttr = (k) => { delete badge.attrs[k]; return badge; };
    const none = { length: 0, text() { return none; }, attr() { return none; }, removeAttr() { return none; } };
    global.$ = (sel) => (sel === '#jita-sd-mode' ? badge : sel === '#jita-sd-mode[data-wait]' ? (badge.attrs['data-wait'] ? badge : none) : none);
    const U = JiTA.ui = eval(S.members(src, 'JiTA.ui', ['MODE_TIP', '_showMode', '_lateWhy']));
    const TIP = U.MODE_TIP;
    U._showMode({ mode: 'Keyword', why: 'the ranking worker failed: device lost' });
    ok('a Keyword badge says why in its hover, above the click hint', badge._text === 'Keyword' && badge.attrs.title === 'Keyword: the ranking worker failed: device lost.\n' + TIP && !('data-wait' in badge.attrs), JSON.stringify(badge.attrs));
    U._showMode({ mode: 'Hybrid', results: [], why: 'leftover' });
    ok('a Hybrid badge has only the click hint (control)', badge._text === 'Hybrid' && badge.attrs.title === TIP, JSON.stringify(badge.attrs));
    U._showMode({ mode: 'Keyword', why: 'the ranking worker had not answered after 4.2 s', wait: true });
    ok('a badge drawn waiting for the worker is marked so', badge.attrs['data-wait'] === '1', JSON.stringify(badge.attrs));
    U._lateWhy('the ranking worker failed: device lost');
    ok('...and a late fallback puts its reason in the hover, once', badge.attrs.title === 'Keyword: the ranking worker failed: device lost.\n' + TIP && !('data-wait' in badge.attrs), JSON.stringify(badge.attrs));
    U._showMode({ mode: 'Hybrid', results: [] });
    U._lateWhy('the ranking worker failed: late');
    ok('a late fallback leaves a badge that is not waiting alone', badge.attrs.title === TIP && badge._text === 'Hybrid', JSON.stringify(badge.attrs));
    const paints = src.split('JiTA.ui._showMode(out);').length - 1;
    ok('every list paints its mode through the badge helper', paints === 4 && src.indexOf("$('#jita-sd-mode').text(out.mode);") === -1, paints + ' paints');

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'stuck model checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
