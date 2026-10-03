// autosync-check.js - the background sync and its neighbours (v3.38.19). Evals the real JiTA.sched, JiTA.sync.autoSync,
// JiTA.sync._invalidateWorker / _ebrRemoved and JiTA.migrate against stubs:
//  - the auto-sync lease is heartbeated while a sync runs (a long first crawl used to lose it after five minutes and
//    let a second tab start a sync beside it), released when the sync ends and on pagehide, and only ever its own
//  - a failed auto-sync backs off for FAIL_MS, shared across tabs, instead of retrying on every 30 s poll
//  - an attached or closed report drops the shared worker's indexes once, from the acting tab, and the other tabs
//    hear of it only after that has landed
//  - the database upgrade check waits for a running sync instead of doing nothing for the session
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 50)); }
    return src.slice(s, e);
};
const member = (head) => cut(head, '\n    },') + '\n    }';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = () => new Promise((r) => setImmediate(r));
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

// ---- shared GM storage, a clock, timers ----
let store = {}, now = 1000000, intervals = [], timeouts = [], pagehide = [];
global.gmGet = (k, d) => (k in store ? store[k] : d);
global.gmSet = (k, v) => { store[k] = v; };
const realNow = Date.now;
Date.now = () => now;
global.setInterval = (fn, ms) => { const h = { fn: fn, ms: ms, on: true }; intervals.push(h); return h; };
global.clearInterval = (h) => { if (h) { h.on = false; } };
const realTimeout = setTimeout;
global.setTimeout = (fn, ms) => { timeouts.push({ fn: fn, ms: ms }); return timeouts.length; };
global.window = { addEventListener: (ev, fn) => { if (ev === 'pagehide') { pagehide.push(fn); } } };
global.flagOn = () => true;

let syncD = null, syncs = 0;
global.JiTA = {
    sync: { running: false, autoSync: () => { syncs++; syncD = deferred(); return syncD.promise; } },
    logsig: null
};
eval(cut('JiTA.sched = {', '\n};\n') + '\n};');
const S = JiTA.sched;
const lease = () => store[S.LEASE_KEY];
const live = () => intervals.filter((h) => h.on);

(async () => {
    // ================= the lease =================
    let p = S.tick();
    ok('a tick takes the lease and starts a sync', syncs === 1 && lease() && lease().tabId === S.tabId, JSON.stringify(lease()));
    ok('...and keeps the lease fresh while the sync runs', live().length === 1 && live()[0].ms <= S.LEASE_TTL_MS / 2, String(live().length && live()[0].ms));
    now += S.LEASE_TTL_MS + 60000;   // a first full crawl, longer than the lease
    live()[0].fn();
    const mine = S.tabId;
    S.tabId = 'tab-other';
    ok('another tab cannot take a lease that is being kept fresh, however long the sync runs', S._acquireLease() === false);
    S.tabId = mine;
    syncD.resolve(true);
    await p;
    ok('a finished sync stops the heartbeat and frees the lease', live().length === 0 && lease() == null, JSON.stringify(lease()));
    ok('...and clears any failure back-off', store[S.FAIL_KEY] === 0, String(store[S.FAIL_KEY]));

    // ================= a failed sync backs off =================
    store[S.LAST_SYNC_KEY] = 0;
    p = S.tick();
    syncD.resolve(false);
    await p;
    ok('a failed sync frees the lease and stamps the back-off', lease() == null && store[S.FAIL_KEY] === now, String(store[S.FAIL_KEY]));
    const before = syncs;
    now += 30000;
    S.tick();
    ok('the next poll does not try again', syncs === before, (syncs - before) + ' tries');
    now += S.FAIL_MS;
    p = S.tick();
    ok('...once the back-off is over it does', syncs === before + 1, (syncs - before) + ' tries');
    syncD.resolve(null);   // another sync of this tab's was already running
    await p;
    ok('a sync that did not run frees the lease and stamps nothing', lease() == null && store[S.FAIL_KEY] === now - 30000 - S.FAIL_MS, String(store[S.FAIL_KEY]));

    // ================= whose lease =================
    store[S.LEASE_KEY] = { tabId: 'tab-other', ts: now };
    const n0 = syncs;
    S.tick();
    ok('a fresh lease of another tab is left alone', syncs === n0 && lease().tabId === 'tab-other');
    S._releaseLease();
    ok('...and never freed by this one', lease() && lease().tabId === 'tab-other');
    store[S.LEASE_KEY] = null;
    JiTA.sync.running = true;
    S.tick();
    ok('a tick while this tab is syncing takes no lease', syncs === n0 && lease() == null, JSON.stringify(lease()));
    JiTA.sync.running = false;

    S.start();
    store[S.LEASE_KEY] = { tabId: S.tabId, ts: now };
    pagehide.forEach((fn) => fn());
    ok('closing the tab frees its lease at once', pagehide.length === 1 && lease() == null, pagehide.length + ' / ' + JSON.stringify(lease()));

    // ================= autoSync says how it ended =================
    let failAt = null;
    const db = {
        countDefectsOnly: () => Promise.resolve(5), countEbr: () => Promise.resolve(3),
        setMeta: () => Promise.resolve()
    };
    const A = {
        sync: {
            running: false, _afterSync() {},
            incrementalSync: () => (failAt === 'defects' ? Promise.reject(new Error('HTTP 401')) : Promise.resolve({ stored: 0 })),
            incrementalSyncEbr: () => Promise.resolve({ stored: 0 }),
            fullSync: () => Promise.resolve({ stored: 0 }), fullSyncEbr: () => Promise.resolve({ stored: 0 })
        },
        db: db, sched: { markSynced() {} }, embed: { prepare() {} }, translate: { prepare() {} }, ui: { currentKey: null }
    };
    const auto = new Function('JiTA', 'console', 'return ({' + cut('    autoSync: function () {', '\n    }\n};') + '\n    }}).autoSync;')(A, { log() {} });
    ok('a completed auto-sync resolves true', (await auto()) === true);
    failAt = 'defects';
    ok('a failed one resolves false', (await auto()) === false && A.sync.running === false);
    A.sync.running = true;
    ok('one that did not run, because a sync was going, resolves null', (await auto()) === null);

    // ================= a removed report =================
    let calls = [], callD = null, usable = true;
    const B = {
        rank: {}, sched: { tabId: 'tab-a' },
        worker: { usable: () => usable, call: (t) => { calls.push(t); callD = deferred(); return callD.promise; } }
    };
    store = {};
    Object.assign(B, { sync: new Function('JiTA', 'return ({' + member('    _invalidateWorker: function () {') + ',\n' + member('    _ebrRemoved: function (keys, fromRemote) {') + '});')(B) });
    B.sync._ebrRemoved(['EBR-1']);
    await flush();
    ok('the acting tab drops the shared worker\'s indexes', calls.join() === 'invalidate' && B.rank._dirtyEbr === true, calls.join());
    ok('...and tells the other tabs only once that has landed', store.sdEbrRemoved === undefined);
    callD.resolve({});
    await flush();
    ok('...then it does', !!store.sdEbrRemoved && store.sdEbrRemoved.keys.join() === 'EBR-1' && store.sdEbrRemoved.tabId === 'tab-a', JSON.stringify(store.sdEbrRemoved));
    store = {}; calls = [];
    B.sync._ebrRemoved(['EBR-2']);
    callD.reject(new Error('no leader ready'));
    await flush();
    ok('a worker that cannot be reached does not keep the news from the other tabs', !!store.sdEbrRemoved && store.sdEbrRemoved.keys.join() === 'EBR-2');
    store = {}; calls = []; B.rank = {};
    B.sync._ebrRemoved(['EBR-3'], true);
    await flush();
    ok('a tab hearing of another\'s removal marks its own indexes only: no worker call, no echo', calls.length === 0 && store.sdEbrRemoved === undefined && B.rank._dirtyEbr === true,
        calls.join() + ' / ' + JSON.stringify(store.sdEbrRemoved));
    usable = false; store = {};
    B.sync._ebrRemoved(['EBR-4']);
    await flush();
    ok('with no worker at all the other tabs are told straight away', calls.length === 0 && !!store.sdEbrRemoved);

    // ================= the upgrade check =================
    const reads = [];
    let refetched = [];
    const M = {
        DATA_VERSION: 5,
        sync: { running: true, refetchDefects: () => { refetched.push('defects'); return Promise.resolve(); }, refetchEbr: () => { refetched.push('ebr'); return Promise.resolve(); } },
        db: {
            countDefectsOnly: () => { const d = deferred(); reads.push(d); return d.promise; },
            getMeta: () => Promise.resolve(4), countEbr: () => Promise.resolve(0)
        }
    };
    timeouts = [];
    const mig = new Function('JiTA', 'flagOn', 'console', cut('JiTA.migrate = {', '\n};\n') + '\n};\nreturn JiTA.migrate;')(M, () => true, { log() {} });
    mig.run();
    ok('the upgrade check waits for a running sync and looks again later', reads.length === 0 && mig._done === false && timeouts.length === 1, reads.length + ' reads, ' + timeouts.length + ' timers');
    M.sync.running = false;
    timeouts.shift().fn();
    reads.shift().resolve(100);
    await flush(); await flush(); await flush();
    ok('...and then upgrades the stale database', refetched.join() === 'defects' && mig._done === true, refetched.join());
    mig._done = false; refetched = [];
    mig.run();
    M.sync.running = true;   // a sync starts while it reads
    reads.shift().resolve(100);
    await flush(); await flush(); await flush();
    ok('a sync that starts while it reads sends it round again rather than to a refetch that would do nothing', refetched.length === 0 && mig._done === false && timeouts.length === 1,
        refetched.join() + ' / ' + timeouts.length);

    Date.now = realNow;
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'auto-sync checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
