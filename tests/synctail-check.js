// synctail-check.js - the sync engine's tail end (v3.39.2). Evals the real JiTA.db.syncPut and JiTA.sync members
// against stubs:
//  - a sync page is merged in one transaction: derived work (embedding, translation) survives an unchanged text, a
//    record that matches its row is not written, a pruned closed report is deleted, and `changed` counts only new,
//    different or pruned records (an incremental run re-fetches the last few minutes every time)
//  - a run drops the worker's indexes only when it changed something, saves a full crawl's position with its query
//    and schema, leaves the panel's status line alone in a background catch-up, and says what a failed run wrote
//  - an interrupted full crawl is carried on (by the next full crawl, the incremental syncs and the upgrade refetch)
//    and started over when Jira refuses the token
//  - every sync ends in one tail: embed and translate only on a change, redraw the view the change feeds, and
//    always redraw after a sync someone asked for; rebuilding the bug reports translates them again
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};
const member = (head) => (head === '    autoSync: function () {' ? cut(head, '\n    }\n};') : cut(head, '\n    },')) + '\n    }';   // autoSync closes the object
const obj = (heads) => '({' + heads.map(member).join(',\n') + '})';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = () => new Promise((r) => setImmediate(r));
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---- an IndexedDB store kept in a Map, with requests answered on a later tick ----
function fakeDb(rows) {
    const store = new Map(Object.keys(rows).map((k) => [k, rows[k]]));
    const log = { tx: 0, puts: [], deletes: [] };
    const db = {
        transaction() {
            log.tx++;
            let pending = 0, done = false;
            const tx = {};
            const finish = () => { if (!pending && !done) { done = true; setImmediate(() => { if (tx.oncomplete) { tx.oncomplete(); } }); } };
            const os = {
                get(key) {
                    const req = {};
                    pending++;
                    setImmediate(() => { req.result = store.has(key) ? clone(store.get(key)) : undefined; if (req.onsuccess) { req.onsuccess(); } pending--; finish(); });
                    return req;
                },
                put(rec) { log.puts.push(rec.key); store.set(rec.key, clone(rec)); },
                delete(key) { log.deletes.push(key); store.delete(key); }
            };
            tx.objectStore = () => os;
            return tx;
        }
    };
    return { db: db, store: store, log: log };
}

const rec = (key, over) => Object.assign({
    key: key, project: key.split('-')[0], summary: 's ' + key, description: 'd', status: 'Open', resolution: null,
    resolutiondate: null, created: '2026-09-01', components: [], updated: '2026-10-01T10:00', team: '',
    embedding: null, embeddingModelVersion: null, lang: null, enText: null, textHash: 'h-' + key
}, over || {});

(async () => {
    // ================= one transaction per page =================
    const S = new Function('JiTA', 'return ' + obj(['    _sameSynced: function (old, rec) {', '    _resumable: function (rt, jql) {']) + ';')(null);
    let F = null;
    const J = {
        DATA_VERSION: 3,
        util: { isClosedStatus: (s) => /closed|attached/i.test(s || '') },
        sync: S,
        db: { open: () => Promise.resolve(F.db) }
    };
    S._sameSynced = S._sameSynced.bind(S);
    J.db.syncPut = new Function('JiTA', 'return ' + obj(['    syncPut: function (recs, prune) {']) + '.syncPut;')(J);

    F = fakeDb({
        'EDR-1': rec('EDR-1', { embedding: [1, 2], embeddingModelVersion: 'm', lang: 'de', enText: 'english' }),
        'EDR-2': rec('EDR-2', { embedding: [3], embeddingModelVersion: 'm', lang: 'fr', enText: 'english too' }),
        'EBR-9': rec('EBR-9', { status: 'Open' })
    });
    let r = await J.db.syncPut([rec('EDR-1'), rec('EDR-2', { status: 'In Progress', updated: '2026-10-02T09:00' }), rec('EDR-3')], false);
    ok('a page is merged in one transaction', F.log.tx === 1, String(F.log.tx));
    ok('changed counts the new and the different records, not the identical one', r.changed === 2, String(r.changed));
    ok('...and only those are written', F.log.puts.join() === 'EDR-2,EDR-3', F.log.puts.join());
    ok('an unchanged text keeps its embedding and its translation', F.store.get('EDR-1').embedding.join() === '1,2' && F.store.get('EDR-1').enText === 'english');
    ok('a status change keeps the embedding and the translation of the same text', F.store.get('EDR-2').status === 'In Progress' &&
        F.store.get('EDR-2').embedding.join() === '3' && F.store.get('EDR-2').enText === 'english too', JSON.stringify(F.store.get('EDR-2')));
    F.log.puts = [];
    r = await J.db.syncPut([rec('EDR-1', { textHash: 'new', summary: 'reworded' })], false);
    ok('a changed text drops the derived work', r.changed === 1 && F.store.get('EDR-1').embedding === null && F.store.get('EDR-1').enText === null, JSON.stringify(F.store.get('EDR-1')));
    F.log.puts = [];
    const legacy = rec('EDR-2', { status: 'In Progress', updated: '2026-10-02T09:00', embedding: [3], embeddingModelVersion: 'm' });
    delete legacy.team;
    F.store.set('EDR-2', legacy);
    r = await J.db.syncPut([rec('EDR-2', { status: 'In Progress', updated: '2026-10-02T09:00' })], false);
    ok('a row from an older build that lacks a field is rewritten (a refetch backfills it)', r.changed === 1 && F.store.get('EDR-2').team === '', String(r.changed));
    r = await J.db.syncPut([rec('EBR-9', { status: 'Attached' }), rec('EBR-10', { status: 'Closed' }), rec('EBR-11')], true);
    ok('pruning deletes a stored report that has closed', F.log.deletes.join() === 'EBR-9' && !F.store.has('EBR-9'), F.log.deletes.join());
    ok('...a closed report never stored is no change, and an open new one is', r.changed === 2 && !F.store.has('EBR-10') && F.store.has('EBR-11'), String(r.changed));
    r = await J.db.syncPut([], false);
    ok('an empty page opens no transaction', r.changed === 0 && F.log.tx === 4, String(F.log.tx));

    ok('_sameSynced ignores the derived fields', S._sameSynced(rec('X-1', { embedding: [1], lang: 'de', enText: 'e', embeddingModelVersion: 'm' }), rec('X-1')));
    ok('...and sees any synced one', !S._sameSynced(rec('X-1'), rec('X-1', { resolution: 'Fixed' })));

    // ================= a run =================
    const full = 'project in (EDR, EO, PLAT) ORDER BY updated ASC';
    let pages = [], meta = {}, status = [], invalidates = 0, putChanged = [];
    const R = {
        FIELDS: [], PAGE_SIZE: 100, PAGE_DELAY_MS: 0, NEAR_LIMIT_DELAY_MS: 0, DATA_VERSION: 3,
        rank: {}, logsig: {},
        ui: { setStatus: (s) => { status.push(s); } },
        util: { delay: () => Promise.resolve() },
        db: {
            syncPut: (recs) => Promise.resolve({ changed: putChanged.length ? putChanged.shift() : recs.length }),
            setMeta: (k, v) => { meta[k] = v; return Promise.resolve(); },
            getMeta: (k) => Promise.resolve(k in meta ? meta[k] : null)
        },
        sync: { _quiet: false }
    };
    Object.assign(R.sync, new Function('JiTA', 'return ' + obj(['    _resumable: function (rt, jql) {', '    _run: function (jql, opts) {', '    _fullRun: function (prefix, jql) {',
        '    fullSync: function () {', '    incrementalSync: function () {', '    fullSyncEbr: function () {', '    incrementalSyncEbr: function () {']) + ';')(R));
    R.sync.FULL_JQL = full;
    R.sync.FULL_JQL_EBR = 'project = EBR AND statusCategory != Done ORDER BY updated ASC';
    R.SCOPE = 'project in (EDR, EO, PLAT)';
    R.util.jqlSince = () => '-15m';
    R.sync._mapIssue = (i) => ({ key: i.key, updated: i.updated || '2026-10-03T10:00' });
    R.sync._invalidateWorker = () => { invalidates++; };
    const calls = [];
    R.sync._apiPost = (path, body) => {
        calls.push(body);
        const p = pages.shift();
        if (p instanceof Error) { return Promise.reject(p); }
        return Promise.resolve({ data: p, xhr: { getResponseHeader: () => null } });
    };
    const page = (keys, next) => ({ issues: keys.map((k) => ({ key: k })), nextPageToken: next || null, isLast: !next });

    pages = [page(['EDR-1', 'EDR-2'], 't2'), page(['EDR-3'])];
    putChanged = [0, 0];
    let res = await R.sync._run('project in (EDR) AND updated >= "-15m"', {});
    ok('a run that only re-fetched what it had changed nothing', res.stored === 3 && res.changed === 0, JSON.stringify(res));
    ok('...so it leaves the worker indexes and the dirty flags alone', invalidates === 0 && !R.rank._dirty, invalidates + ' ' + R.rank._dirty);
    ok('...and an incremental run saves no resume token', !('resumeToken' in meta), JSON.stringify(meta));
    pages = [page(['EDR-1'], 't2'), page(['EDR-2'])];
    putChanged = [0, 1];
    res = await R.sync._run('x', {});
    ok('one changed record is a change: the worker is told once and the index marked', res.changed === 1 && invalidates === 1 && R.rank._dirty === true, JSON.stringify(res) + ' ' + invalidates);

    meta = {}; status = [];
    pages = [page(['EDR-1'], 't2'), page(['EDR-2'], 't3'), page(['EDR-3'])];
    const seenTokens = [];
    const realSet = R.db.setMeta;
    R.db.setMeta = (k, v) => { if (k === 'resumeToken') { seenTokens.push(v); } return realSet(k, v); };
    await R.sync._run(full, { resume: true });
    ok('a full crawl saves each next page with its query and schema', JSON.stringify(seenTokens[0]) === JSON.stringify({ jql: full, token: 't2', v: 3 }), JSON.stringify(seenTokens[0]));
    ok('...and clears it at the end', seenTokens.length === 3 && seenTokens[2] === null, JSON.stringify(seenTokens));
    R.db.setMeta = realSet;
    ok('a full crawl shows its progress', status.length === 3, String(status.length));

    status = [];
    R.sync._quiet = true;
    pages = [page(['EDR-1'])];
    await R.sync._run('x', {});
    ok('a background catch-up leaves the status line alone', status.length === 0, String(status.length));
    pages = [page(['EDR-1'])];
    await R.sync._run(full, { resume: true });
    ok('...a background full build still shows it', status.length === 1, String(status.length));
    R.sync._quiet = false;

    pages = [page(['EDR-1'], 't2'), new Error('HTTP 502')];
    putChanged = [2];
    let err = null;
    try { await R.sync._run('x', {}); } catch (e) { err = e; }
    ok('a failed run says what it already wrote', err && err.syncChanged === 2, err && String(err.syncChanged));

    // ================= resuming =================
    ok('a token is resumed only by its own query and schema', R.sync._resumable({ jql: full, token: 't', v: 3 }, full) &&
        !R.sync._resumable({ jql: 'other', token: 't', v: 3 }, full) && !R.sync._resumable({ jql: full, token: 't', v: 2 }, full) &&
        !R.sync._resumable('t-bare', full) && !R.sync._resumable(null, full));
    meta = { resumeToken: { jql: full, token: 'tok7', v: 3 }, lastSyncHighWater: '2026-10-01' };
    calls.length = 0;
    pages = [page(['EDR-5'])];
    res = await R.sync.fullSync();
    ok('a full sync carries on from the saved page', calls[0].nextPageToken === 'tok7', JSON.stringify(calls[0]));
    ok('...and stamps the dataset when it is done', meta.dataVersionDefects === 3 && meta.resumeToken === null, JSON.stringify(meta));
    meta = { resumeToken: { jql: full, token: 'stale', v: 3 } };
    calls.length = 0;
    const refused = new Error('HTTP 400'); refused.status = 400;
    pages = [refused, page(['EDR-1'], 't2'), page(['EDR-2'])];
    putChanged = [1, 1];
    res = await R.sync.fullSync();
    ok('a token Jira refuses starts the crawl over', calls.length === 3 && calls[0].nextPageToken === 'stale' && !calls[1].nextPageToken, calls.map((c) => c.nextPageToken).join());
    // A token that goes stale part way through: the pages written before it count, though the restart finds them unchanged.
    meta = { resumeToken: { jql: full, token: 'ok', v: 3 } };
    calls.length = 0;
    const refused2 = new Error('HTTP 400'); refused2.status = 400;
    pages = [page(['EDR-1'], 't2'), refused2, page(['EDR-1'], 't3'), page(['EDR-2'])];
    putChanged = [1, 0, 1];
    res = await R.sync.fullSync();
    ok('...counting what the refused attempt wrote as well', calls.length === 4 && res.changed === 2, calls.length + ' ' + JSON.stringify(res));
    meta = { resumeToken: { jql: full, token: 'tok', v: 3 } };
    pages = [new Error('HTTP 503')];
    err = null;
    try { await R.sync.fullSync(); } catch (e) { err = e; }
    ok('any other failure is not retried from scratch', err && /503/.test(err.message) && pages.length === 0);

    meta = { resumeToken: { jql: full, token: 'tok9', v: 3 }, lastSyncHighWater: '2026-10-01' };
    calls.length = 0;
    pages = [page(['EDR-5'])];
    await R.sync.incrementalSync();
    ok('the incremental sync finishes an interrupted full build first', calls.length === 1 && calls[0].nextPageToken === 'tok9' && calls[0].jql === full, JSON.stringify(calls[0]));
    meta = { lastSyncHighWater: '2026-10-01' };
    calls.length = 0;
    pages = [page(['EDR-5'])];
    await R.sync.incrementalSync();
    ok('...and catches up as before when none is pending', calls[0].jql === 'project in (EDR, EO, PLAT) AND updated >= "-15m" ORDER BY updated ASC', calls[0].jql);
    meta = { resumeTokenEbr: { jql: R.sync.FULL_JQL_EBR, token: 'e4', v: 3 }, lastSyncHighWaterEbr: '2026-10-01' };
    calls.length = 0;
    pages = [page(['EBR-5'])];
    await R.sync.incrementalSyncEbr();
    ok('...the bug report sync does the same', calls[0].nextPageToken === 'e4' && meta.dataVersionEbr === 3, JSON.stringify(calls[0]));

    // ================= the upgrade refetch =================
    const tails = [];
    const M = {
        DATA_VERSION: 3, rank: {},
        ui: { toast() {} },
        db: R.db,
        sync: { running: false, FULL_JQL: full, FULL_JQL_EBR: R.sync.FULL_JQL_EBR, _resumable: R.sync._resumable,
            fullSync: () => Promise.resolve({ changed: 4 }), fullSyncEbr: () => Promise.resolve({ changed: 0 }),
            _afterSync: (d, e, s) => { tails.push([d, e, s]); } }
    };
    M.db.countDefectsOnly = () => Promise.resolve(10);
    M.db.countEbr = () => Promise.resolve(10);
    Object.assign(M.sync, new Function('JiTA', 'console', 'return ' + obj(['    refetchDefects: function () {', '    refetchEbr: function () {']) + ';')(M, { log() {} }));
    meta = { resumeToken: { jql: full, token: 'tk', v: 3 }, lastSyncHighWater: '2026-10-01' };
    await M.sync.refetchDefects();
    ok('the upgrade refetch carries an interrupted build on instead of resetting it', meta.resumeToken && meta.resumeToken.token === 'tk' && meta.lastSyncHighWater === '2026-10-01', JSON.stringify(meta));
    ok('...and ends in the shared tail with what changed', JSON.stringify(tails[0]) === '[true,false,true]', JSON.stringify(tails));
    meta = { resumeToken: 'bare-old', lastSyncHighWater: '2026-10-01' };
    await M.sync.refetchDefects();
    ok('with nothing to carry on it resets the cursors', meta.resumeToken === null && meta.lastSyncHighWater === '', JSON.stringify(meta));
    meta = { resumeTokenEbr: { jql: R.sync.FULL_JQL_EBR, token: 'te', v: 3 } };
    await M.sync.refetchEbr();
    ok('the bug report refetch carries one on too', meta.resumeTokenEbr && meta.resumeTokenEbr.token === 'te' && JSON.stringify(tails[2]) === '[false,false,true]', JSON.stringify(tails));

    // ================= the tail =================
    let marks = 0, embeds = 0, translates = 0, renders = 0;
    const T = {
        sched: { markSynced: () => { marks++; } }, embed: { prepare: () => { embeds++; } }, translate: { prepare: () => { translates++; } },
        ui: { currentKey: 'EBR-1', scheduleRender: () => { renders++; }, _isReportsKey: (k) => /^(EDR|EO|PLAT)-/.test(k) }
    };
    const tail = new Function('JiTA', 'return ' + obj(['    _afterSync: function (defects, ebr, shown) {']) + '._afterSync;')(T);
    const run = (d, e, s, key) => { marks = embeds = translates = renders = 0; T.ui.currentKey = key; tail(d, e, s); return [marks, embeds, translates, renders].join(''); };
    ok('nothing changed in the background: only the clock moves', run(false, false, false, 'EBR-1') === '1000', run(false, false, false, 'EBR-1'));
    ok('a defect change embeds and redraws a bug report', run(true, false, false, 'EBR-1') === '1101');
    ok('...but not a defect page, which lists bug reports', run(true, false, false, 'EDR-1') === '1100');
    ok('a bug report change embeds, translates and redraws a defect page', run(false, true, false, 'EDR-1') === '1111');
    ok('a sync someone asked for redraws whatever it found', run(false, false, true, 'EBR-1') === '1001');
    ok('...but nothing with no issue open', run(true, true, true, null) === '1110');

    // ================= the paths into it =================
    const P = {
        rank: {}, ui: { toast() {}, setStatus() {}, currentKey: null },
        db: { clearEbr: () => Promise.resolve(), clearDefects: () => Promise.resolve(), setMeta: () => Promise.resolve(), countEbr: () => Promise.resolve(3), countDefectsOnly: () => Promise.resolve(5) },
        sync: { running: false, fullSyncEbr: () => Promise.resolve({ changed: 0 }), fullSync: () => Promise.resolve({ changed: 0 }),
            incrementalSync: () => Promise.resolve({ changed: 0 }), incrementalSyncEbr: () => Promise.resolve({ changed: 5 }) }
    };
    const ptails = [];
    P.sync._afterSync = (d, e, s) => { ptails.push([d, e, s].join()); };
    global.confirm = () => true;
    Object.assign(P.sync, new Function('JiTA', 'console', 'alert', 'return ' + obj(['    rebuildEbr: function () {', '    rebuild: function () {', '    syncNow: function () {', '    syncEbrNow: function () {', '    autoSync: function () {']) + ';')(P, { log() {} }, () => {}));
    await P.sync.rebuildEbr();
    ok('rebuilding the bug reports ends as a bug report change (it translates them again)', ptails[0] === 'false,true,true', ptails[0]);
    await P.sync.rebuild();
    ok('rebuilding the defects ends as a defect change', ptails[1] === 'true,false,true', ptails[1]);
    await P.sync.syncNow();
    ok('a manual defect sync that changed nothing still redraws', ptails[2] === 'false,false,true', ptails[2]);
    await P.sync.syncEbrNow();
    ok('a manual bug report sync passes on what changed', ptails[3] === 'false,true,true', ptails[3]);
    let quietDuring = null;
    P.sync.incrementalSync = () => { quietDuring = P.sync._quiet; return Promise.resolve({ changed: 0 }); };
    P.sync.incrementalSyncEbr = () => Promise.resolve({ changed: 0 });
    const done = await P.sync.autoSync();
    ok('the background sync is quiet while it runs, and not after', done === true && quietDuring === true && P.sync._quiet === false);
    ok('...and an unchanged catch-up ends with nothing to do', ptails[4] === 'false,false,false', ptails[4]);
    P.sync.incrementalSync = () => { quietDuring = P.sync._quiet; return Promise.reject(new Error('HTTP 401')); };
    const failed = await P.sync.autoSync();
    ok('a failed one is not left quiet either', failed === false && P.sync._quiet === false && P.sync.running === false);

    // ================= nothing writes what nobody reads =================
    ok('the write-only meta keys are gone', ['lastFullSyncAt', 'modelVersion', 'lastError', 'lastAutoSyncAt'].every((k) => src.indexOf("setMeta('" + k + "'") === -1));

    await flush();
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'sync tail checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
