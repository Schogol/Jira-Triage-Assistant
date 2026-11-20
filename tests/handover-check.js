// handover-check.js - the ranking worker changes hands after an update (v3.53.2). Several tabs, each the real election code
// of JiTA.worker in a context of its own (start, _announce, _applyReelect, _becomeLeader, _stepDown, _checkWorkerVersion,
// _onBc), share one lock queue (Web Locks), one channel (BroadcastChannel) and one clock. A tab can be busy (its worker
// answers no ping) or deaf (misses what is said on the channel):
//  - a tab says its version when it starts, and a leader running older code steps down for it at once, busy or not
//  - a leader at that version or a newer one carries on; an older tab starting changes nothing
//  - one that missed it hears it again within ANNOUNCE_MS; a tab that gave up leading, or a frame, says nothing
//  - old tabs waiting for the lock stand aside for the newer one
//  - the version check's ping still finds an older worker, and a ping that gets no answer is logged
const vm = require('vm');
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 20; i++) { await new Promise((r) => setImmediate(r)); } };

const WORKER = S.members(src, 'JiTA.worker', ['CHANNEL', 'LOCK', 'REELECT_DELAY_MS', 'ANNOUNCE_MS', 'MAX_STANDASIDE', '_bc', '_worker', '_isLeader', '_started',
    '_tabPending', '_releaseLock', '_respawns', '_gaveUp', '_otherLeader', '_maxSeenVersion', '_standAsides', 'start', '_requestLock', '_becomeLeader', '_stepDown',
    '_verCmp', '_checkWorkerVersion', '_announce', '_applyReelect', '_onBc']);
const W = eval(WORKER.replace('JiTA.SCRIPT_VERSION', "''"));   // for the constants

// ---- the browser the tabs share ----
const tabs = [];
const clock = {
    now: 0, timers: [], seq: 0,
    add(tab, fn, ms, repeat) { const t = { id: ++this.seq, tab: tab, fn: fn, at: this.now + (ms || 0), ms: ms || 0, repeat: repeat }; this.timers.push(t); return t.id; },
    async advance(ms) {
        const end = this.now + ms;
        for (;;) {
            await flush();
            this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
            const t = this.timers[0];
            if (!t || t.at > end) { break; }
            this.timers.shift();
            this.now = t.at;
            if (!t.tab.alive) { continue; }
            if (t.repeat) { t.at += t.ms; this.timers.push(t); }
            t.fn();
        }
        this.now = end;
        await flush();
    }
};
const bus = {
    chans: [], said: [],
    add(tab, ch) { this.chans.push({ tab: tab, ch: ch }); },
    send(from, data) {
        const d = JSON.parse(JSON.stringify(data));
        this.said.push({ from: from.name, data: d });
        this.chans.forEach(({ tab, ch }) => {
            if (tab === from) { return; }   // a tab never hears its own messages
            setImmediate(() => { if (tab.alive && !tab.deaf && ch.onmessage) { ch.onmessage({ data: d }); } });
        });
    }
};
const locks = {
    queue: [], held: null,
    request(tab, cb) { this.queue.push({ tab: tab, cb: cb }); this.pump(); return Promise.resolve(); },
    pump() {
        if (this.held) { return; }
        this.queue = this.queue.filter((q) => q.tab.alive);
        const q = this.queue.shift();
        if (!q) { return; }
        this.held = q;
        Promise.resolve().then(() => q.cb()).then(() => { if (this.held === q) { this.held = null; this.pump(); } });
    },
    drop(tab) {
        this.queue = this.queue.filter((q) => q.tab !== tab);
        if (this.held && this.held.tab === tab) { this.held = null; this.pump(); }   // a closed tab lets go of its lock
    }
};
function open(name, version, opts) {
    opts = opts || {};
    const tab = { name: name, version: version, alive: true, deaf: false, busy: false, spawns: 0, logs: [] };
    const ctx = {
        JITA_IS_SUBFRAME: !!opts.frame,
        navigator: { locks: { request: (n, cb) => locks.request(tab, cb) } },
        BroadcastChannel: function () { this.postMessage = (data) => bus.send(tab, data); bus.add(tab, this); },
        setTimeout: (fn, ms) => clock.add(tab, fn, ms, false),
        setInterval: (fn, ms) => clock.add(tab, fn, ms, true),
        clearTimeout: () => {},
        Promise: Promise
    };
    ctx.JiTA = {
        SCRIPT_VERSION: version, sched: { tabId: name },
        log: function () { tab.logs.push([].slice.call(arguments).join(' ')); },
        dlog: function () { tab.logs.push('(debug) ' + [].slice.call(arguments).join(' ')); }
    };
    vm.createContext(ctx);
    vm.runInContext('JiTA.worker = ' + WORKER + ';', ctx);
    const w = ctx.JiTA.worker;
    w._spawnWorker = () => { if (!w._isLeader || w._gaveUp) { return; } tab.spawns++; w._worker = { built: version }; };
    w._killWorker = () => { w._worker = null; };
    w._failTabPending = () => {};
    w._applyEvent = () => {};
    w.call = () => {   // a ping goes to whichever tab leads, and its worker answers with the version it was built from
        const L = tabs.find((t) => t.alive && t.w._isLeader && t.w._worker);
        if (!L) { return Promise.reject(new Error('no leader')); }
        return L.busy ? Promise.reject(new Error('timeout')) : Promise.resolve({ version: L.w._worker.built });
    };
    if (/^3\.5[01]\./.test(version)) { w._announce = function () {}; }   // a tab from before v3.53.2 does not say its version
    tab.w = w;
    tabs.push(tab);
    w.start();
    return tab;
}
const close = (tab) => { tab.alive = false; locks.drop(tab); };
const leaders = () => tabs.filter((t) => t.alive && t.w._isLeader).map((t) => t.name).join(',');
const reset = () => { tabs.slice().forEach(close); tabs.length = 0; bus.chans = []; bus.said = []; locks.queue = []; locks.held = null; clock.timers = []; };

(async () => {
    // ================= an old leader, busy, and an updated tab =================
    let O = open('old', '3.51.4');
    await clock.advance(100);
    ok('one tab: it leads and builds the worker', leaders() === 'old' && O.spawns === 1);
    O.busy = true;   // its worker is embedding: no ping gets an answer
    bus.said = [];
    let N = open('new', '3.53.2');
    ok('a tab says its version as it starts, as the request every older version acts on', bus.said.length === 1 && bus.said[0].from === 'new' &&
        JSON.stringify(bus.said[0].data) === JSON.stringify({ kind: 'reelect', want: '3.53.2' }), JSON.stringify(bus.said));
    await clock.advance(10);
    ok('the old leader steps down at once, though its worker answers nothing, and the updated tab leads', leaders() === 'new' && O.w._worker === null && N.spawns === 1 &&
        O.logs.some((l) => /stale leader \(v3\.51\.4 < v3\.53\.2\); stepping down/.test(l)), leaders() + ' / ' + O.logs.join(' | '));
    await clock.advance(30000);
    ok('...and keeps the lead: the old tab only waits for it again', leaders() === 'new' && O.spawns === 1 && N.spawns === 1, leaders());
    ok('the updated tab\'s own version check then finds its worker current', N.logs.some((l) => /worker version OK \(v3\.53\.2\)/.test(l)), N.logs.join(' | '));

    // ================= the same version, and an older tab =================
    const same = open('same', '3.53.2');
    await clock.advance(31000);
    ok('a tab at the leader\'s version changes nothing: no step down, no new worker', leaders() === 'new' && N.spawns === 1 && same.spawns === 0);
    bus.said = [];
    const older = open('older', '3.53.1');   // says its version too, an older one
    await clock.advance(31000);
    ok('neither does an older tab saying its version', bus.said.some((s) => s.from === 'older') && leaders() === 'new' && N.spawns === 1 && older.spawns === 0);

    // ================= one that missed it =================
    reset();
    O = open('old', '3.51.4');
    await clock.advance(100);
    O.deaf = true; O.busy = true;
    N = open('new', '3.53.2');
    await clock.advance(60000);
    O.deaf = false;
    ok('an old leader that missed it (and whose worker the version check cannot reach) leads on for now', leaders() === 'old' &&
        N.logs.some((l) => /version check: the worker did not answer \(timeout\)/.test(l)), leaders() + ' / ' + N.logs.join(' | '));
    ok('...the ping that got no answer is in the log', N.logs.filter((l) => /did not answer/.test(l)).length === 2, N.logs.join(' | '));
    await clock.advance(W.ANNOUNCE_MS - 60000);
    ok('...and steps down when it hears it again, within ANNOUNCE_MS', leaders() === 'new' && N.spawns === 1, leaders());
    ok('ANNOUNCE_MS is minutes, not seconds', W.ANNOUNCE_MS >= 60000 && W.ANNOUNCE_MS <= 15 * 60000, String(W.ANNOUNCE_MS));

    // ================= the version check's own path =================
    reset();
    O = open('old', '3.51.4');
    await clock.advance(100);
    O.deaf = true;   // misses the announcement, but its worker answers pings
    N = open('new', '3.53.2');
    await clock.advance(11000);
    O.deaf = false;
    await clock.advance(2000);
    ok('a ping that finds an older worker asks for a re-election too, and says so', leaders() === 'new' &&
        N.logs.some((l) => /running worker is v3\.51\.4 but this tab is v3\.53\.2 -> requesting re-election/.test(l)), leaders() + ' / ' + N.logs.join(' | '));

    // ================= old tabs waiting ahead of it =================
    reset();
    O = open('old1', '3.51.4');
    await clock.advance(100);
    const O2 = open('old2', '3.51.4'), O3 = open('old3', '3.51.5');
    await clock.advance(100);
    N = open('new', '3.53.2');
    await clock.advance(20000);
    ok('old tabs waiting for the lock ahead of it give way, and it leads, with every old worker stopped', leaders() === 'new' && N.spawns === 1 && [O, O2, O3].every((t) => t.w._worker === null),
        leaders() + ' / ' + [O, O2, O3, N].map((t) => t.name + ':' + t.spawns + (t.w._worker ? '+' : '')).join(','));
    close(N);
    await clock.advance(20000);
    ok('...and when it closes, one of them leads again rather than none', /^old/.test(leaders()) && leaders().split(',').length === 1, leaders());

    // An old tab that knows of a newer one gets the lock first: it stands aside instead of building a worker of old code.
    reset();
    N = open('new', '3.53.2');
    await clock.advance(100);
    O = open('old', '3.51.4');
    await clock.advance(100);
    const N2 = open('new2', '3.53.2');   // heard by the old tab, which waits for the lock ahead of it
    await clock.advance(100);
    close(N);
    await clock.advance(1000);
    ok('an old tab handed the lock while it knows of a newer one stands aside for it, without building a worker', leaders() === 'new2' && O.spawns === 0 && N2.spawns === 1,
        leaders() + ' / ' + O.spawns);

    // ================= who says nothing =================
    reset();
    N = open('new', '3.53.2');
    await clock.advance(100);
    N.w._gaveUp = true;   // its worker could not run here
    bus.said = [];
    await clock.advance(W.ANNOUNCE_MS * 2);
    ok('a tab that gave up leading says nothing more', !bus.said.some((s) => s.from === 'new'), JSON.stringify(bus.said));
    bus.said = [];
    const F = open('frame', '3.53.2', { frame: true });
    await clock.advance(W.ANNOUNCE_MS + 1000);
    ok('nor does a frame, which never starts the worker', !bus.said.some((s) => s.from === 'frame') && F.w._started === false);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'handover checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\n1 FAILURE(S)'); process.exit(1); });
