// worker-check.js - the shared ranking worker stays current (v3.38.6). Four guards. A sync run that stored anything
// tells the worker to drop its in-memory indexes when it ends (they used to outlive every sync that gave embedPass
// nothing to embed, so closed reports and old statuses kept ranking). embedPass drops them however it ends. Index
// builds are single-flight, and one whose DB read began before a drop is redone instead of putting the dropped
// records back. And a new leader fails the calls only the old leader could have answered: an ACKed call used to
// wait out its op timer, 15 minutes for a credits crawl. Evals the real JiTA.sync._run, the worker body's
// ensureIndexes / embedPass and JiTA.worker against stubs.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 50)); }
    return src.slice(s, e);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

// ---- the worker's index builds ----
const reads = [];
const idx = new Function('allRecords', 'isClosedStatus', 'isGmTeam', 'tokenize', 'effectiveText', 'lgSplit', 'lgFp', 'cfg',
    'var vecCache = null, kwCache = null, logsigCache = null;\n' +
    cut('    var idxGen = 0, idxP = null;', '    // Cosine == dot product') +
    '\nreturn { ensureIndexes: ensureIndexes, dropIndexes: dropIndexes, kw: function () { return kwCache; } };')(
    () => { const d = deferred(); reads.push(d); return d.promise; },
    (s) => /closed|attached/i.test(s || ''), () => false,
    (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    (r) => (r.summary || '') + ' ' + (r.description || ''),
    () => [], () => ({}), { MODEL_VERSION: 'm1' });
const ebrKeys = () => (idx.kw() ? idx.kw().ebr.docs.map((d) => d.key).join(',') : 'none');
const OPEN = [{ key: 'EBR-1', project: 'EBR', status: 'Open', summary: 'crash on undock' }, { key: 'EBR-2', project: 'EBR', status: 'Open', summary: 'warp bug' }];
const ONE_ATTACHED = [{ key: 'EBR-1', project: 'EBR', status: 'Attached', summary: 'crash on undock' }, { key: 'EBR-2', project: 'EBR', status: 'Open', summary: 'warp bug' }];

// ---- the worker's embedPass ----
let dropped = 0, loadFails = false;
const ep = new Function('loadModel', 'allRecords', 'isClosedStatus', 'isGmTeam', 'cfg', 'effectiveText', 'embedBatch', 'putEmbeddingsMerged', 'dropIndexes', 'self',
    'var embedding = false, pipe = null, BATCH = 8;\n' + cut('    async function embedPass() {', '\n    function openDb() {') + '\nreturn embedPass;')(
    () => (loadFails ? Promise.reject(new Error('no model')) : Promise.resolve()),
    () => Promise.resolve([{ key: 'EDR-1', project: 'EDR', status: 'Open', embedding: [1], embeddingModelVersion: 'm1' }]),
    () => false, () => false, { MODEL_VERSION: 'm1' }, () => '', () => Promise.resolve([]), () => Promise.resolve(),
    () => { dropped++; }, { postMessage() {} });

// ---- JiTA: the tab's sync run and the worker election ----
global.window = {};
global.navigator = {};
global.gmGet = (k, d) => d;
global.gmSet = () => {};
global.JITA_IS_FORGE_FRAME = false;
let invalidates = 0, pages = [];
global.JiTA = {
    SCRIPT_VERSION: '3.38.6', FIELDS: [], PAGE_SIZE: 100, PAGE_DELAY_MS: 0, NEAR_LIMIT_DELAY_MS: 0,
    dlog() {}, sched: { tabId: 'tabF' },
    rank: {}, logsig: {}, ui: { setStatus() {} },
    util: { isClosedStatus: (s) => /closed/i.test(s || ''), delay: () => Promise.resolve() },
    db: { syncPut: (recs) => Promise.resolve({ changed: recs.length }), setMeta: () => Promise.resolve() },
    sync: {}
};
JiTA.sync._run = eval('({' + cut("    _run: function (jql, opts) {\n        opts = opts || {};\n        var token = opts.startToken || null;", '\n    },') + '\n    }})')._run;
JiTA.sync._mapIssue = (i) => ({ key: i.key, updated: i.updated, status: i.status || 'Open', textHash: 'h' });
JiTA.sync._invalidateWorker = () => { invalidates++; };
JiTA.sync._apiPost = () => {
    const p = pages.shift();
    if (p instanceof Error) { return Promise.reject(p); }
    return Promise.resolve({ data: p, xhr: { getResponseHeader: () => null } });
};
eval(cut('JiTA.worker = {', '\n};\n') + '\n};');
const W = JiTA.worker;
const realSpawn = W._spawnWorker;

(async () => {
    // ================= index builds =================
    const a = idx.ensureIndexes(), b = idx.ensureIndexes();
    ok('two queries arriving together share one read', reads.length === 1, String(reads.length));
    reads[0].resolve(OPEN);
    await Promise.all([a, b]);
    ok('...and one build, with both open reports in it', ebrKeys() === 'EBR-1,EBR-2', ebrKeys());
    await idx.ensureIndexes();
    ok('a built index is used as it is', reads.length === 1, String(reads.length));

    idx.dropIndexes();
    const c = idx.ensureIndexes();
    ok('a drop makes the next query read again', reads.length === 2, String(reads.length));
    idx.dropIndexes();   // the report is attached while that read is still running
    reads[1].resolve(OPEN);
    await flush();
    ok('a build whose read began before a drop is redone', reads.length === 3, String(reads.length));
    reads[2].resolve(ONE_ATTACHED);
    await c;
    ok('...so the attached report is not put back', ebrKeys() === 'EBR-2', ebrKeys());

    idx.dropIndexes();
    const d = idx.ensureIndexes();
    reads[3].reject(new Error('IDB gone'));
    let threw = false;
    try { await d; } catch (e) { threw = true; }
    idx.ensureIndexes();
    ok('a failed read fails its query, and the next one reads again', threw && reads.length === 5, String(reads.length));
    reads[4].resolve(OPEN);
    await flush();
    // The generation guard holds only if nothing empties the indexes behind its back: the worker's 'invalidate' op and
    // embedPass must go through dropIndexes, which is the one place the caches are cleared.
    ok('every drop of the worker indexes goes through dropIndexes', src.split('vecCache = null;').length - 1 === 1 &&
        /type === 'invalidate'\) \{ dropIndexes\(\);/.test(src), String(src.split('vecCache = null;').length - 1));

    // ================= embedPass =================
    const r1 = await ep();
    ok('embedPass with nothing to embed still drops the indexes', r1.embedded === 0 && dropped === 1, JSON.stringify(r1) + ' ' + dropped);
    loadFails = true;
    try { await ep(); } catch (e) { /* expected */ }
    ok('...and so does one that fails', dropped === 2, String(dropped));
    loadFails = false;

    // ================= a sync run =================
    pages = [{ issues: [{ key: 'EDR-1', updated: '2026-10-03T10:00:00.000+0000' }], nextPageToken: 'p2' },
        { issues: [{ key: 'EDR-2', updated: '2026-10-03T10:05:00.000+0000' }], isLast: true }];
    invalidates = 0;
    const res = await JiTA.sync._run('project = EDR', {});
    ok('a run that stored two pages drops the worker indexes once, at the end', res.stored === 2 && invalidates === 1, res.stored + ' stored, ' + invalidates + ' invalidates');
    pages = [{ issues: [], isLast: true }];
    invalidates = 0;
    await JiTA.sync._run('project = EDR', {});
    ok('a run that stored nothing leaves them alone', invalidates === 0, String(invalidates));
    pages = [{ issues: [{ key: 'EDR-3', updated: '2026-10-03T11:00:00.000+0000' }], nextPageToken: 'p2' }, new Error('HTTP 502')];
    invalidates = 0;
    let runErr = null;
    try { await JiTA.sync._run('project = EDR', {}); } catch (e) { runErr = e; }
    ok('a run that fails part way still drops them, and still fails', !!runErr && /502/.test(runErr.message) && invalidates === 1, String(invalidates));

    // ================= the leader changes =================
    W._started = true;
    const posts = [];
    W._bc = { postMessage: (m) => { posts.push(m); } };
    W._isLeader = false; W._worker = null;
    let outcome = null;
    W.call('creditsMonth', { y: 2026, m: 9 }, { timeoutMs: 900000 }).then((v) => { outcome = 'ok:' + v; }, (e) => { outcome = 'err:' + e.message; });
    const req = posts.find((m) => m.kind === 'req');
    W._onBc({ data: { kind: 'ack', id: req.id } });   // the old leader takes it, and then its tab is reloaded
    W._onBc({ data: { kind: 'leader', version: '3.38.6' } });
    await flush();
    ok('a call the old leader took fails as soon as a new leader announces itself', /^err:.*leader changed/.test(outcome || ''), String(outcome));
    ok('...and is gone from the pending list', Object.keys(W._tabPending).length === 0, Object.keys(W._tabPending).join());

    outcome = null;
    W.call('rankKeyword', {}, {}).then((v) => { outcome = 'ok:' + v; }, (e) => { outcome = 'err:' + e.message; });
    const req2 = posts.filter((m) => m.kind === 'req').pop();
    W._onBc({ data: { kind: 'leader', version: '3.38.6' } });   // announced before anyone took the call
    await flush();
    ok('a call no leader has taken yet is left to the new one', outcome === null && !!W._tabPending[req2.id], String(outcome));
    W._onBc({ data: { kind: 'ack', id: req2.id } });
    W._onBc({ data: { kind: 'res', id: req2.id, ok: true, result: 'ranked' } });
    await flush();
    ok('...which answers it', outcome === 'ok:ranked', String(outcome));

    outcome = null;
    W.call('creditsSelf', {}, { timeoutMs: 900000 }).then((v) => { outcome = 'ok:' + v; }, (e) => { outcome = 'err:' + e.message; });
    const order = [];
    W._spawnWorker = () => { order.push('spawn'); };
    W._bc = { postMessage: (m) => { posts.push(m); order.push(m.kind); } };
    W._releaseLock = null;
    W._becomeLeader();
    await flush();
    ok('a tab that becomes leader fails its own channel calls: nobody else will answer them now', /^err:.*moved to this tab/.test(outcome || ''), String(outcome));
    ok('...and announces itself before it can take any call', order.join(',') === 'leader,spawn', order.join(','));

    // ================= a tab that gave up leading (v3.38.19) =================
    posts.length = 0;
    W._isLeader = false; W._worker = null; W._gaveUp = true; W._otherLeader = false;
    W._bc = { postMessage: (m) => { posts.push(m); } };
    outcome = null;
    W.call('rankKeyword', {}, {}).then((v) => { outcome = 'ok:' + v; }, (e) => { outcome = 'err:' + e.message; });
    await flush();
    ok('a tab that gave up leading fails its calls at once, without waiting for an ACK', /^err:.*not available/.test(outcome || '') && posts.length === 0 && W.usable() === false,
        String(outcome) + ' / ' + posts.length + ' posted');
    W._onBc({ data: { kind: 'leader', version: '3.38.19' } });
    outcome = null;
    W.call('rankKeyword', {}, {}).then((v) => { outcome = 'ok:' + v; }, (e) => { outcome = 'err:' + e.message; });
    const req3 = posts.filter((m) => m.kind === 'req').pop();
    ok('...until another tab announces itself leader: its calls then go there', W.usable() === true && !!req3, String(W.usable()));
    W._onBc({ data: { kind: 'ack', id: req3.id } });
    W._onBc({ data: { kind: 'res', id: req3.id, ok: true, result: 'ranked' } });
    await flush();
    ok('...and are answered', outcome === 'ok:ranked', String(outcome));
    W._gaveUp = false; W._otherLeader = false;

    // ================= the embedding backend switched in another tab =================
    let gpuFlag = true, spawns = 0;
    global.gmGet = (k, d) => (k === 'sdTryWebgpu' ? gpuFlag : k === 'sdForceCpu' ? false : d);
    global.URL = { createObjectURL: () => 'blob:w', revokeObjectURL() {} };
    global.Blob = function () {};
    global.Worker = function () { this.postMessage = () => {}; };
    W._src = () => '';
    W._isLeader = true; W._gaveUp = false;
    realSpawn();
    ok('a spawned worker records the backend it was built for', W._spawnedGpu === true, String(W._spawnedGpu));
    W._spawnWorker = () => { spawns++; };
    gpuFlag = false;
    W._backendChanged();
    ok('a leader embedding on the GPU rebuilds its worker when another tab switches to CPU', spawns === 1, String(spawns));
    W._spawnedGpu = false;
    W._backendChanged();
    ok('...not when the switch matches what it already runs', spawns === 1, String(spawns));
    W._isLeader = false; W._spawnedGpu = true;
    W._backendChanged();
    ok('...and a follower never rebuilds one', spawns === 1, String(spawns));
    const listeners = {};
    global.GM_addValueChangeListener = (k, fn) => { listeners[k] = fn; };
    global.BroadcastChannel = function () {};
    let changed = 0;
    W._backendChanged = () => { changed++; };
    W._becomeLeader = () => {};
    W._started = false;
    W.start();
    listeners.sdTryWebgpu && listeners.sdTryWebgpu('sdTryWebgpu', true, false, true);
    listeners.sdForceCpu && listeners.sdForceCpu('sdForceCpu', false, true, true);
    listeners.sdTryWebgpu && listeners.sdTryWebgpu('sdTryWebgpu', false, true, false);
    ok('the worker listens to both backend settings, from other tabs only', changed === 2, changed + ' of 2');

    // ================= a failed embed pass =================
    const logs = [];
    let renders = 0;
    const log0 = console.log;
    window.console = console;
    console.log = (...a) => { logs.push(a.join(' ')); };
    JiTA.ui.scheduleRender = () => { renders++; };
    W._applyEvent({ event: 'embedPassError', error: 'GPU device lost' });
    console.log = log0;
    delete window.console;
    ok('a failed embed pass is logged and the view redrawn over its progress line', logs.some((l) => /embed pass failed/.test(l) && /GPU device lost/.test(l)) && renders === 1,
        logs.join(' | ') + ' / ' + renders);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'worker checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
