// credits-check.js - the ISD credits crawl and view (v3.38.25). Evals the real worker crawl functions (sliced from
// jitaWorkerBody) and JiTA.credits against stubs:
//  - every crawl request retries a 429, a 5xx and a dropped connection (search and count retried a 429 only, so one
//    502 threw a month's crawl away); a 4xx fails at once
//  - an old-domain handle two members share goes to the same member whatever order the lookups finish in, each member
//    stops at its first hit, and a quote in a handle is escaped in the JQL
//  - tied members share a rank; a scheduled run's "ready" stays quiet and a failed quiet run clears its pill
//  - the badge keeps "updating…" through its own refresh; the poll starts once; last month is recomputed once after it
//    ends
//  - v3.51.5: the badge and the leaderboard show the same for the viewer: the newer of their own count and the
//    leaderboard's takes their row in both, rank included, and an open leaderboard is drawn again when the badge reads
//    newer counts
// Month ends are in the browser's own time zone: held at UTC, where CI runs, and moved for the checks that need another.
process.env.TZ = 'UTC';
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to, at) => {
    const s = src.indexOf(from, at || 0), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || (at == null && src.indexOf(from, s + 1) >= 0)) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};
const fn = (name) => cut('\n    function ' + name + '(', '\n    }\n') + '\n    }\n';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 12; i++) { await new Promise((r) => setImmediate(r)); } };

(async () => {
    // ================= requests =================
    let script = [], calls = [], waits = [];
    const resp = (status, body, headers) => ({ status: status, ok: status >= 200 && status < 300, headers: { get: (k) => (headers || {})[k] || null }, json: () => Promise.resolve(body) });
    const fetchStub = (url, init) => { calls.push(url); const s = script.shift(); return s instanceof Error ? Promise.reject(s) : Promise.resolve(s); };
    const timer = (f, ms) => { waits.push(ms); setImmediate(f); return 1; };
    const hasHelper = src.indexOf('    function crFetchJson(') >= 0;
    const W = new Function('cfg', 'crc', 'fetch', 'setTimeout',
        'var crRateBuckets = {};\n' + fn('crRateKey') + cut('    function crGate(key) {', '    function crAccList(') +
        (hasHelper ? '' : '') + fn('crCount') +
        '\nreturn { get: crGet, search: crSearch, count: crCount };')(
        { HOST: 'https://jira', MAX_RETRIES: 3 }, { PAGE_SIZE: 100, RATE_LIMITS: { default: 1e6 }, RATE_SAFETY: 1 }, fetchStub, timer);
    const run = async (p) => { let r = null; await p.then((v) => { r = { ok: v }; }, (e) => { r = { err: e.message }; }); return r; };
    script = [resp(502), resp(200, { issues: [1] })];
    let r = await run(W.search('project = EDR', ['key']));
    ok('a search that gets a 502 is retried, and succeeds', r.ok && r.ok.issues[0] === 1 && calls.length === 2, JSON.stringify(r) + ' / ' + calls.length);
    calls = []; script = [new Error('Failed to fetch'), resp(200, { count: 7 })];
    r = await run(W.count('project = EDR'));
    ok('a count whose connection drops is retried', r.ok === 7 && calls.length === 2, JSON.stringify(r));
    calls = []; waits = []; script = [resp(429, {}, { 'Retry-After': '2' }), resp(200, { values: [] })];
    r = await run(W.get('/rest/api/3/group/member'));
    ok('a 429 waits as long as Retry-After says (control)', !!r.ok && waits[0] === 2000, waits.join());
    calls = []; script = [resp(400, {})];
    r = await run(W.search('bad jql', ['key']));
    ok('a 400 fails at once, without retries', /HTTP 400/.test(r.err || '') && calls.length === 1, JSON.stringify(r) + ' / ' + calls.length);
    calls = []; script = [resp(503), resp(503), resp(503), resp(503)];
    r = await run(W.search('x', ['key']));
    ok('...and an outage fails once the retries are spent', /HTTP 503/.test(r.err || '') && calls.length === 4, calls.length + ' calls');
    calls = []; script = [resp(400, {})];
    const st400 = await W.search('bad jql', ['key']).then(() => null, (e) => e.status);
    ok('...each failure carrying its HTTP status', st400 === 400, String(st400));

    // ================= old-domain accounts =================
    const exists = { 'john@old': 'A-JOHN', 'jsmith@old': null, 'johnsmith@old': null, 'jdoe@old': null, 'johndoe@old': null };
    let failing = {};   // handle -> the HTTP status its lookup fails with, past the retries
    const resolve = async (delays, members) => {
        let queries = [], jqls = [];
        const R = new Function('crc', 'crSearch', 'crTick',
            fn('crHandles') + fn('crReporterAccount') + fn('crSerial') + fn('crParallel') + fn('crResolveOldReporters') + '\nreturn crResolveOldReporters;')(
            { OLD_DOMAIN: 'old', CONCURRENCY: 4 },
            (jql) => {
                jqls.push(jql);
                const h = (/reporter = "(.*)"$/.exec(jql) || [])[1].replace(/\\(.)/g, '$1');
                queries.push(h);
                const hops = delays[h] || 0;
                return new Promise((res, rej) => {
                    let n = 0;
                    (function hop() { if (n++ < hops) { setImmediate(hop); return; } failing[h] ? rej(Object.assign(new Error('HTTP ' + failing[h]), { status: failing[h] })) :
                        exists[h] ? res({ issues: [{ fields: { reporter: { accountId: exists[h] } } }] }) : (h in exists ? rej(Object.assign(new Error('HTTP 400'), { status: 400 })) : res({ issues: [] })); })();
                });
            }, () => {});
        const out = await R(members || [{ displayName: 'John Smith', emailAddress: 'jsmith@new' }, { displayName: 'John Doe', emailAddress: 'jdoe@new' }]);
        return { out: out, queries: queries, jqls: jqls };
    };
    const a = await resolve({ 'johndoe@old': 5 });
    const b = await resolve({ 'johnsmith@old': 5 });
    ok('a handle two members share goes to one of them, the first in name order', Object.keys(a.out.oldIds).join() === 'A-JOHN' && a.out.oldNames['A-JOHN'] === 'John Doe', JSON.stringify(a.out.oldNames));
    ok('...the same one, whichever lookups finish first', b.out.oldNames['A-JOHN'] === a.out.oldNames['A-JOHN'], a.out.oldNames['A-JOHN'] + ' vs ' + b.out.oldNames['A-JOHN']);
    // A lookup that fails for a while (429s past the retries, a 5xx): no answer about the account, so the count fails.
    failing = { 'jsmith@old': 503 };
    const failed = await resolve({}).then((x) => ({ out: x.out }), (e) => ({ err: e }));
    ok('a handle whose lookup fails, not with "no such user", fails the count instead of moving on to the next handle', !!failed.err && failed.err.status === 503,
        failed.err ? failed.err.message : JSON.stringify(failed.out && failed.out.oldNames));
    failing = {};
    ok('...and it is asked about once', a.queries.filter((q) => q === 'john@old').length === 1, a.queries.join());
    exists['johnxavier@old'] = 'A-JX'; exists['jw@old'] = null; exists['johnw@old'] = null;
    const w = await resolve({ 'jw@old': 4, 'johnw@old': 4 }, [{ displayName: 'John Xavier', emailAddress: 'john@new' }, { displayName: 'John W', emailAddress: 'jw@new' }]);
    ok('a member whose first account went to someone earlier in name order walks on to its next one',
        w.out.oldNames['A-JOHN'] === 'John W' && w.out.oldNames['A-JX'] === 'John Xavier', JSON.stringify(w.out.oldNames));
    exists['o"brien@old'] = 'A-OB';
    const c = await (async () => {
        let jqls = [];
        const R = new Function('crc', 'crSearch', 'crTick', fn('crHandles') + fn('crReporterAccount') + fn('crSerial') + fn('crParallel') + fn('crResolveOldReporters') + '\nreturn crResolveOldReporters;')(
            { OLD_DOMAIN: 'old', CONCURRENCY: 4 }, (jql) => { jqls.push(jql); return Promise.resolve({ issues: [{ fields: { reporter: { accountId: 'A-OB' } } }] }); }, () => {});
        const out = await R([{ displayName: 'Pat', emailAddress: 'o"brien@new' }]);
        return { out: out, jqls: jqls };
    })();
    ok('a member stops at the first handle that exists', c.jqls.length === 1, c.jqls.length + ' queries');
    ok('...and a quote in a handle is escaped in the JQL', c.jqls[0] === 'reporter = "o\\"brien@old"', c.jqls[0]);

    // ================= the tab: ranks, refresh, badge, scheduler =================
    let store = {}, flashes = [], clears = 0, timeouts = [];
    global.gmGet = (k, d) => (k in store ? store[k] : d);
    global.gmSet = (k, v) => { store[k] = v; };
    global.setTimeout = (f, ms) => { timeouts.push({ f: f, ms: ms }); return timeouts.length; };
    global.setInterval = () => 1; global.clearInterval = () => {};
    global.flagOn = () => true;
    global.JiTA = { sched: { tabId: 'tab-a' }, ui: { toast() {} } };
    const cStart = src.indexOf('\nJiTA.credits = {');
    eval(cut('JiTA.credits = {', '\n};\n') + '\n};');
    const C = JiTA.credits;
    const tbl = [['Ann', 0, 0, 0, 0, 0, 0, 0, 9], ['Bob', 0, 0, 0, 0, 0, 0, 0, 5], ['Cid', 0, 0, 0, 0, 0, 0, 0, 5], ['Dee', 0, 0, 0, 0, 0, 0, 0, 2], ['Eve', 0, 0, 0, 0, 0, 0, 0, 0], ['Total']];
    const d = C._derive({ table: tbl, nameToAcc: { Cid: 'acc-c' } }, 'acc-c');
    ok('tied members share a rank, and the next one skips', JSON.stringify(d.ranks) === '[1,2,2,4,5]' && d.myRank === 2, JSON.stringify(d.ranks) + ' / ' + d.myRank);
    ok('...and the footer can say how many have credits', d.total === 5 && d.withCredits === 4, d.total + ' / ' + d.withCredits);

    C._flash = (m) => { flashes.push(m); };
    C._clearProgress = () => { clears++; };
    C.putCached = () => Promise.resolve();
    let outcome = 'ok';
    C.computeMonth = () => (outcome === 'ok' ? Promise.resolve({ ym: '2026-10' }) : Promise.reject(new Error('worker down')));
    C._quiet = true;
    await C.refresh(2026, 10);
    ok('a scheduled run does not flash "ready"', flashes.length === 0, flashes.join());
    C._quiet = false;
    await C.refresh(2026, 10);
    ok('...a manual one does (control)', flashes.length === 1 && /ready/.test(flashes[0]), flashes.join());
    C._quiet = true; outcome = 'fail'; flashes = [];
    await C.refresh(2026, 10).catch(() => {});
    ok('a failed scheduled run clears any progress pill instead of flashing', flashes.length === 0 && clears === 1, flashes.length + ' flashes, ' + clears + ' clears');

    // The pill is spans now (icon, the VMS warning, the text): a small element that joins its children's text.
    const mkEl = () => ({
        kids: [], attrs: {}, style: {}, title: '', _t: '',
        setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {},
        appendChild(c) { this.kids.push(c); return c; },
        querySelector(sel) { const k = /data-cb="(\w+)"/.exec(sel)[1]; return this.kids.filter((c) => c.attrs['data-cb'] === k)[0] || null; },
        get textContent() { return this.kids.length ? this.kids.map((c) => c.textContent).join('') : this._t; },
        set textContent(v) { this.kids = []; this._t = v; }
    });
    const badge = mkEl();
    global.document = { getElementById: (id) => (id === 'jita-credits-badge' ? badge : null), createElement: mkEl };
    C.getSelf = () => Promise.resolve({ credits: 12, rank: 3, total: 40 });
    C.getCached = () => Promise.resolve(null);
    JiTA.link = { currentUser: () => Promise.resolve('a-me') };
    C._updating = true;
    C.badge.refresh();
    await flush();
    ok('the badge keeps saying it is updating through its own refresh', badge.textContent === '📊 12 credits this month · #3/40 · updating…', badge.textContent);
    C._updating = false;
    C.badge.refresh();
    await flush();
    ok('...and stops once the run is over (control)', badge.textContent === '📊 12 credits this month · #3/40', badge.textContent);

    // ---- the badge and the leaderboard show the same (v3.51.5) ----
    const full = { ym: '2026-11', computedAt: '2026-11-15T16:18:00.000Z', nameToAcc: { Ann: 'a-ann', Bob: 'a-bob', Me: 'a-me' },
        header: ['Name', 'Defects Created', 'Defects Resolved', 'Reports Attached', 'Reports Trashed', 'Reports Reassigned', 'Total Actioned', 'Extra Credits', 'Credits Earned'],
        table: [['Ann', 2, 3, 38, 60, 30, 130, 0, 37.4], ['Bob', 1, 1, 104, 48, 0, 153, 0, 37.2], ['Me', 9, 1, 45, 36, 5, 95, 2, 34.8], ['Total', 12, 5, 187, 144, 35, 378, 2, 109.4]] };
    const mine = { ym: '2026-11', computedAt: '2026-11-15T16:31:00.000Z', me: 'a-me', myName: 'Me', created: 9, resolved: 1, attached: 47, trashed: 36,
        reassigned: 5, actioned: 97, extra: 2, credits: 35.4, rank: 3, total: 3 };
    const fullWas = JSON.stringify(full);
    const sw = C._withSelf(full, mine, 'a-me'), swd = C._derive(sw, 'a-me');
    ok('your own newer count takes your row on the leaderboard', swd.myRow.join() === 'Me,9,1,47,36,5,97,2,35.4' && sw.selfAt === mine.computedAt, swd.myRow.join());
    ok('...the other rows and the cached leaderboard stay as they were', sw.table[0] === full.table[0] && sw.table[1] === full.table[1] && sw.table[3] === full.table[3] && JSON.stringify(full) === fullWas);
    const passed = C._derive(C._withSelf(full, Object.assign({}, mine, { credits: 37.3 }), 'a-me'), 'a-me');
    ok('...and your rank follows it', passed.myRank === 2 && passed.total === 3, passed.myRank + '/' + passed.total);
    ok('an older count of your own leaves the leaderboard as it is', C._withSelf(full, Object.assign({}, mine, { computedAt: '2026-11-15T16:10:00.000Z' }), 'a-me') === full);
    ok('...as does one of another month, or another account\'s', C._withSelf(full, Object.assign({}, mine, { ym: '2026-10' }), 'a-me') === full &&
        C._withSelf(full, Object.assign({}, mine, { me: 'a-old' }), 'a-me') === full);
    ok('...or one of someone not on it', C._withSelf(full, Object.assign({}, mine, { me: 'a-new' }), 'a-new') === full);
    // your resolved defects are the full count's while it is fresh (review 2026-11-20 worker-logic-2): your own count sees
    // only your defects, so your clone of another member's defect, which the full count credits once, counted for you too
    const cloned = Object.assign({}, mine, { resolved: 2, credits: 36.4 });
    let row = C._derive(C._withSelf(full, cloned, 'a-me'), 'a-me').myRow;
    ok('your own count\'s other numbers take your row, its resolved defects the full count\'s while that is fresh, your credits with them', row.join() === 'Me,9,1,47,36,5,97,2,35.4', row.join());
    const stale = Object.assign({}, cloned, { computedAt: new Date(Date.parse(full.computedAt) + C.RESOLVED_FRESH_MS + 60000).toISOString() });
    row = C._derive(C._withSelf(full, stale, 'a-me'), 'a-me').myRow;
    ok('...a full count older than RESOLVED_FRESH_MS leaves your own count of them, as it may not have one resolved since', row.join() === 'Me,9,2,47,36,5,97,2,36.4', row.join());
    const atEdge = Object.assign({}, cloned, { computedAt: new Date(Date.parse(full.computedAt) + C.RESOLVED_FRESH_MS).toISOString() });
    ok('...one just that old still counts as fresh', C._derive(C._withSelf(full, atEdge, 'a-me'), 'a-me').myRow[2] === 1);
    ok('...two full counts\' time apart, as a full count is redone every FULL_MS', C.RESOLVED_FRESH_MS === 2 * C.sched.FULL_MS, String(C.RESOLVED_FRESH_MS));
    const fewer = Object.assign({}, mine, { resolved: 0, credits: 34.4 });
    ok('...and the other way round too: one the full count credits you that your own count does not', C._derive(C._withSelf(full, fewer, 'a-me'), 'a-me').myRow.join() === 'Me,9,1,47,36,5,97,2,35.4');
    const tenths = Object.assign({}, mine, { resolved: 3, credits: 0.3 });
    ok('...with no float dust in the credits', C._derive(C._withSelf(full, tenths, 'a-me'), 'a-me').myRow[8] === -1.7, String(C._derive(C._withSelf(full, tenths, 'a-me'), 'a-me').myRow[8]));
    const formula = new Function(fn('crCreditFormula') + '\nreturn crCreditFormula;')();
    const r0 = { attached: 47, trashed: 36, reassigned: 5, created: 9, resolved: 1 };
    ok('a resolved defect is one credit in the credit formula, which the swap counts on', formula(Object.assign({}, r0, { resolved: 2 })) - formula(r0) === 1 && formula(r0) === 35.4, formula(r0) + ' ' + formula(Object.assign({}, r0, { resolved: 2 })));

    C._updating = false;
    C.getCached = (ym) => Promise.resolve(ym === '2026-11' ? full : null);
    let selfRec = Object.assign({}, mine, { credits: 37.3 }), synced = [];
    C.getSelf = () => Promise.resolve(selfRec);
    C._ymNow = () => ({ y: 2026, m: 11, ym: '2026-11' });
    C._viewSync = (s) => { synced.push(s); };
    C.badge.refresh();
    await flush();
    ok('the badge shows your newer count with the rank the leaderboard gives it, not the one it was counted with', badge.textContent === '📊 37.3 credits this month · #2/3', badge.textContent);
    ok('...and tells an open leaderboard which counts it read', synced.length === 1 && synced[0] === C._stamp(full, selfRec), synced.join());
    selfRec = Object.assign({}, mine, { computedAt: '2026-11-15T16:10:00.000Z', credits: 99, rank: 1 });
    C.badge.refresh();
    await flush();
    ok('a leaderboard newer than your own count gives the badge its number', badge.textContent === '📊 34.8 credits this month · #3/3', badge.textContent);
    selfRec = { ym: '2026-11', computedAt: '2026-11-15T16:31:00.000Z', me: 'a-new', credits: 4, rank: null, total: null };
    JiTA.link = { currentUser: () => Promise.resolve('a-new') };
    C.badge.refresh();
    await flush();
    ok('someone not on the leaderboard yet still sees their own count', badge.textContent === '📊 4 credits this month', badge.textContent);
    JiTA.link = { currentUser: () => Promise.resolve('a-me') };

    // The leaderboard itself, on a jQuery that records what is drawn.
    let texts = [], reads = 0, attached = true, made = [], tops = [];
    const node = {};
    const jq = new Proxy(function () {}, {
        get(t, k) {
            if (k === '0') { return node; }
            if (k === 'then') { return undefined; }
            if (k === 'scrollTop') { return (v) => { if (v === undefined) { return 120; } tops.push(v); return jq; }; }
            if (k === 'text') { return (v) => { texts.push(String(v)); return jq; }; }
            return () => jq;
        },
        apply() { return jq; }
    });
    global.$ = (h) => { made.push(String(h)); return jq; };
    JiTA.menu = { _openOverlay: () => ({ $menu: jq }) };
    C._cssInjected = true;
    document.documentElement = { contains: (n) => attached && n === node };
    const realGetCached = C.getCached;
    C.getCached = (ym) => { reads++; return realGetCached(ym); };
    selfRec = Object.assign({}, mine);
    C._viewSync = null;
    C.openView();
    await flush();
    ok('the leaderboard draws your row from your newer count and says when it was counted', reads === 1 && texts.some((x) => /computed 2026-11-15 16:18 UTC, your row 16:31 UTC - 3 members/.test(x)) &&
        texts.indexOf('35.4') >= 0 && texts.indexOf('34.8') < 0 && made.some((h) => /Loading/.test(h)), reads + ' / ' + texts.filter((x) => /computed/.test(x)).join());
    C._viewSync(C._stamp(full, selfRec));
    await flush();
    ok('the badge reading the same counts draws nothing again', reads === 1, reads);
    selfRec = Object.assign({}, mine, { computedAt: '2026-11-15T16:33:00.000Z', attached: 48, actioned: 98, credits: 35.7 });
    texts = []; made = []; tops = [];
    C.badge.refresh();
    await flush();
    ok('newer counts the badge reads are drawn in the open leaderboard too', reads === 3 && texts.indexOf('35.7') >= 0 && badge.textContent === '📊 35.7 credits this month · #3/3', reads + ' / ' + badge.textContent);
    ok('...without a "Loading…" in between, and scrolled where it was', made.length > 0 && !made.some((h) => /Loading/.test(h)) && tops.join() === '120', made.filter((h) => /Loading/.test(h)).length + ' / ' + tops.join());
    const opened = C._viewSync;
    attached = false;
    C._viewSync('other');
    await flush();
    ok('a closed leaderboard draws nothing and lets go', reads === 3 && C._viewSync === null);
    attached = true;
    C.openView('2026-10');
    await flush();
    reads = 0;
    C._viewSync('other');
    await flush();
    ok('a past month shown is not drawn again', reads === 0 && opened !== C._viewSync);
    C._viewSync = null;

    global.window = { addEventListener() {} };
    timeouts = [];
    C.sched._timer = null;
    C.sched.start(); C.sched.start();
    ok('starting the scheduler twice inside its startup delay starts one poll', timeouts.length === 1, timeouts.length + ' timers');

    // last month, once more after it ends
    let refreshed = [];
    C.running = false; C._ymNow = () => ({ y: 2026, m: 10, ym: '2026-10' });
    store = {}; store[C.sched.LAST_FULL_KEY] = Date.now(); store[C.sched.LAST_SELF_KEY] = Date.now();   // nothing else due
    C.badge.refresh = () => {};
    C.refresh = (y, m) => { refreshed.push(y + '-' + m); return Promise.resolve({}); };
    C.getCached = (ym) => Promise.resolve(ym === '2026-09' ? { computedAt: '2026-09-29T12:00:00.000Z' } : null);
    C.sched.tick();
    await flush();
    ok('last month, last computed before it ended, is computed once more', refreshed.join() === '2026-9' && store[C.sched.PREV_DONE_KEY] === '2026-09', refreshed.join() + ' / ' + store[C.sched.PREV_DONE_KEY]);
    C.sched.tick();
    await flush();
    ok('...and only once', refreshed.length === 1, refreshed.join());
    // Another count began while the cache was read (the Members tab's Count, a Refresh): refresh() answers null, counting nothing.
    store = {}; store[C.sched.LAST_FULL_KEY] = Date.now(); store[C.sched.LAST_SELF_KEY] = Date.now(); refreshed = [];
    let readD = null;
    C.getCached = (ym) => (ym === '2026-09' ? new Promise((res) => { readD = res; }) : Promise.resolve(null));
    C.sched.tick();
    await flush();
    C.running = true;   // started meanwhile
    readD({ computedAt: '2026-09-29T12:00:00.000Z' });
    await flush();
    ok('a recount another count got ahead of is not marked done', refreshed.length === 0 && store[C.sched.PREV_DONE_KEY] === undefined, refreshed.join() + ' / ' + store[C.sched.PREV_DONE_KEY]);
    C.running = false;
    const refresh0 = C.refresh;
    C.refresh = (y, m) => { refreshed.push(y + '-' + m); return Promise.resolve(null); };   // refused: one was already running
    C.getCached = (ym) => Promise.resolve(ym === '2026-09' ? { computedAt: '2026-09-29T12:00:00.000Z' } : null);
    store[C.sched.FULL_LEASE_KEY] = null;
    C.sched.tick();
    await flush();
    ok('...nor one refresh() refused', refreshed.join() === '2026-9' && store[C.sched.PREV_DONE_KEY] === undefined, refreshed.join() + ' / ' + store[C.sched.PREV_DONE_KEY]);
    C.refresh = refresh0;
    store = {}; store[C.sched.LAST_FULL_KEY] = Date.now(); store[C.sched.LAST_SELF_KEY] = Date.now(); refreshed = [];
    C.getCached = () => Promise.resolve({ computedAt: '2026-10-01T03:00:00.000Z' });
    C.sched.tick();
    await flush();
    ok('a month already computed after its end is left alone', refreshed.length === 0 && store[C.sched.PREV_DONE_KEY] === '2026-09', refreshed.join());
    // west of UTC a count made in the last evening hours of the month (already the 1st in UTC) counted none of those hours
    // (review 2026-11-20 worker-logic-1)
    process.env.TZ = 'America/New_York';
    store = {}; store[C.sched.LAST_FULL_KEY] = Date.now(); store[C.sched.LAST_SELF_KEY] = Date.now(); refreshed = [];
    C.getCached = () => Promise.resolve({ computedAt: '2026-10-01T03:00:00.000Z' });   // 30 September, 23:00 in New York
    C.sched.tick();
    await flush();
    ok('west of UTC, last month counted in its last evening hours there is computed once more', refreshed.join() === '2026-9' && store[C.sched.PREV_DONE_KEY] === '2026-09', refreshed.join());
    store = {}; store[C.sched.LAST_FULL_KEY] = Date.now(); store[C.sched.LAST_SELF_KEY] = Date.now(); refreshed = [];
    C.getCached = () => Promise.resolve({ computedAt: '2026-10-01T04:10:00.000Z' });   // 1 October, 00:10 there
    C.sched.tick();
    await flush();
    ok('...one counted after midnight there is left alone', refreshed.length === 0 && store[C.sched.PREV_DONE_KEY] === '2026-09', refreshed.join());
    ok('...and a count with no time is no final one', !C.countsAll({}, 2026, 9) && !C.countsAll(null, 2026, 9) && !C.countsAll({ computedAt: 'soon' }, 2026, 9));
    process.env.TZ = 'Europe/Berlin';
    ok('east of UTC one counted after midnight there is final, though it was still the last day in UTC', C.countsAll({ computedAt: '2026-09-30T22:30:00.000Z' }, 2026, 9) &&
        !C.countsAll({ computedAt: '2026-09-30T21:30:00.000Z' }, 2026, 9));
    ok('...December ends at the new year', C.countsAll({ computedAt: '2026-12-31T23:30:00.000Z' }, 2026, 12) && !C.countsAll({ computedAt: '2026-12-31T22:30:00.000Z' }, 2026, 12));
    process.env.TZ = 'UTC';

    const view = cut('    openView: function (ym) {', '\n    // ---- always-on corner badge', cStart);
    ok('Refresh checks for a running crawl before it touches the quiet flag', /if \(C\.running\) \{ JiTA\.ui\.toast\([^)]*\); return; \}\s*\n\s*\$refresh\.prop\('disabled', true\)/.test(view) && view.indexOf('C._quiet = false;') > view.indexOf('if (C.running)'));
    ok('a manual Refresh of this month stamps the scheduler and refreshes the badge\'s own total', /gmSet\(C\.sched\.LAST_FULL_KEY, Date\.now\(\)\)/.test(view) && /C\.refreshSelf\(yy, mm\)/.test(view));
    ok('a failed leaderboard read says so', /Could not read the leaderboard/.test(view));

    // ================= for the Lead duties Members tab (v3.48.0) =================
    const LEASE = C.sched.FULL_LEASE_KEY;
    store = {}; C.running = false;
    ok('no count running anywhere: not busy', C.busy() === false);
    C.running = true;
    ok('a count running in this tab: busy', C.busy() === true);
    C.running = false;
    store[LEASE] = { tabId: 'tab-b', ts: Date.now() - 5000 };
    ok('...or in another tab holding the full-crawl lease', C.busy() === true);
    store[LEASE] = { tabId: 'tab-b', ts: Date.now() - C.sched.FULL_TTL_MS - 1000 };
    ok('...but not by a lease gone stale, nor by this tab\'s own', C.busy() === false && ((store[LEASE] = { tabId: 'tab-a', ts: Date.now() }), C.busy() === false));
    store = {};
    let leased = [], quietAt = null;
    C.refresh = (y, m) => { leased.push(y + '-' + m + ':' + (store[LEASE] && store[LEASE].tabId)); quietAt = C._quiet; return Promise.resolve({ ym: '2026-07' }); };
    C._quiet = false;
    let lr = await C.refreshLeased(2026, 7);
    ok('a leased count runs under this tab\'s full-crawl lease, quietly, and gives the lease back', lr.ym === '2026-07' && leased.join() === '2026-7:tab-a' && quietAt === true && !store[LEASE], leased.join());
    store[LEASE] = { tabId: 'tab-b', ts: Date.now() };
    leased = [];
    let lerr = null;
    await C.refreshLeased(2026, 7).catch((e) => { lerr = e; });
    ok('...refused, as busy, while another tab holds the lease', lerr && lerr.busy === true && leased.length === 0 && store[LEASE].tabId === 'tab-b');
    store = {};
    C.refresh = () => Promise.resolve(null);
    lerr = null;
    await C.refreshLeased(2026, 7).catch((e) => { lerr = e; });
    ok('...busy too when refresh found one running after all, the lease given back', lerr && lerr.busy === true && !store[LEASE]);
    C.refresh = () => Promise.reject(new Error('crawl failed'));
    lerr = null;
    await C.refreshLeased(2026, 7).catch((e) => { lerr = e; });
    ok('...and a failed count gives the lease back and says why', lerr && /crawl failed/.test(lerr.message) && !lerr.busy && !store[LEASE]);
    let heard = [];
    C.onProgress = (m) => { heard.push(m); };
    C._quiet = true;
    C._pill('2026-07: reports attached…');
    C.onProgress = null;
    ok('every progress line reaches the progress hook, a quiet run\'s too', heard.join() === '2026-07: reports attached…');
    let wcalls = [];
    JiTA.worker = { usable: () => false };
    lerr = null;
    await C.computeGmOld(2026, 7, '2026-08-01').catch((e) => { lerr = e; });
    ok('the old-way GM count needs the worker', lerr && /worker unavailable/.test(lerr.message));
    JiTA.worker = { usable: () => true, call: (t, p, o) => { wcalls.push([t, p, C._workerTag]); return Promise.resolve({ byAcc: { a: 1 } }); } };
    lr = await C.computeGmOld(2026, 7, '2026-08-01');
    ok('...which it is asked for with the month, the cut and this tab\'s progress tag', wcalls.length === 1 && wcalls[0][0] === 'creditsGmOld' && wcalls[0][1].y === 2026 && wcalls[0][1].m === 7 &&
        wcalls[0][1].cut === '2026-08-01' && wcalls[0][2] === wcalls[0][1].tag && C._workerTag === null && lr.byAcc.a === 1, JSON.stringify(wcalls));

    // the worker's count of GM handoffs made the old way
    const oneLine = (head) => { const s = src.indexOf(head); return src.slice(s, src.indexOf('\n', s) + 1); };
    let jqls = [];
    const hist = {
        'EBR-1': [{ created: '2026-07-10T10:00:00.000+0000', author: { accountId: 'a' }, items: [{ field: 'Team', to: '38', toString: 'EO - GameMasters' }, { field: 'assignee', to: null }] }],
        'EBR-2': [{ created: '2026-07-11T10:00:00.000+0000', author: { accountId: 'b' }, items: [{ field: 'Team', fieldId: 'customfield_10001', to: 'ef4edd53-c099-4431-82af-9b4bd717cb88-38' }] }],
        'EBR-3': [{ created: '2026-08-01T09:00:00.000+0000', author: { accountId: 'b' }, items: [{ field: 'Team', to: '38' }] }],
        'EBR-4': [{ created: '2026-07-12T10:00:00.000+0000', author: { accountId: 'a' }, items: [{ field: 'Team', to: '77', toString: 'EO - Developers' }] }],
        'EBR-5': [{ created: '2026-07-13T10:00:00.000+0000', author: { accountId: 'b' }, items: [{ field: 'Team', to: 'x-uuid', toString: 'EO - GameMasters' }] }]
    };
    const keysBy = { a: ['EBR-1', 'EBR-2', 'EBR-4'], b: ['EBR-2', 'EBR-3', 'EBR-5'] };
    const G = new Function('cfg', 'crc', 'crGroupMembers', 'crAllKeys', 'crAllHistories', 'crProgress', 'crTick',
        oneLine('    function teamId(v) {') + oneLine('    function isGmTeam(v) {') + fn('crMonthBounds') + fn('crParallel') + fn('crGmOld') + fn('crSetGm') +
        '\nreturn { gmOld: crGmOld, setGm: crSetGm };')(
        { GM_TEAM_ID: 'ef4edd53-c099-4431-82af-9b4bd717cb88-38' }, { EBR: 'EBR', CONCURRENCY: 4 },
        () => Promise.resolve([{ accountId: 'b', active: true }, { accountId: 'a', active: true }, { accountId: 'x', active: false }]),
        (jql) => { jqls.push(jql); const acc = /BY "([^"]+)"/.exec(jql)[1]; const o = {}; (keysBy[acc] || []).forEach((k) => { o[k] = true; }); return Promise.resolve(o); },
        (k) => Promise.resolve(hist[k] || []), () => {}, () => {});
    let gres = await G.gmOld({ y: 2026, m: 7, cut: '2026-08-01' });
    ok('a report counts for the member who set its Team field to the GM team in the window, once', JSON.stringify(gres.byAcc) === JSON.stringify({ a: 1, b: 2 }) && gres.ym === '2026-07' && gres.cut === '2026-08-01',
        JSON.stringify(gres));
    ok('...each active member asked once, by the assignee changes they made in the window', JSON.stringify(jqls) === JSON.stringify(['project = EBR AND assignee CHANGED BY "a" DURING ("2026-07-01", "2026-08-01")',
        'project = EBR AND assignee CHANGED BY "b" DURING ("2026-07-01", "2026-08-01")']), JSON.stringify(jqls));
    jqls = [];
    gres = await G.gmOld({ y: 2026, m: 7, cut: '2026-07-11' });
    ok('...cut where asked: a change on the cut day is outside it', JSON.stringify(gres.byAcc) === JSON.stringify({ a: 1 }) && /DURING \("2026-07-01", "2026-07-11"\)/.test(jqls[0]), JSON.stringify(gres));
    jqls = [];
    gres = await G.gmOld({ y: 2026, m: 9, cut: '2026-08-21' });
    ok('...and a month entirely after the switch asks nothing', JSON.stringify(gres.byAcc) === '{}' && jqls.length === 0);
    gres = await G.gmOld({ y: 2026, m: 8, cut: '2026-09-15' });
    ok('...nor reads past its month\'s end', gres.cut === '2026-09-01');
    ok('another team, or another member\'s change, is no handoff of theirs', !G.setGm(hist['EBR-4'], 'a', '2026-07-01', '2026-08-01') && !G.setGm(hist['EBR-1'], 'b', '2026-07-01', '2026-08-01') &&
        G.setGm(hist['EBR-5'], 'b', '2026-07-01', '2026-08-01'));
    // queued like a count
    const Q = new Function('crGmOld', 'var crLast = null, crActiveTags = [];\n' + fn('runGmOld') + '\nreturn { run: runGmOld, tags: function () { return crActiveTags; } };');
    let order = [], rel = {};
    const q = Q((p) => { order.push(p.m + ':' + p.cut); return new Promise((res) => { rel[p.m] = res; }); });
    const g1 = q.run({ y: 2026, m: 7, cut: '2026-08-01', tag: 't1' }), g2 = q.run({ y: 2026, m: 7, cut: '2026-08-01', tag: 't2' }), g3 = q.run({ y: 2026, m: 6, cut: '2026-07-01', tag: 't3' });
    await flush();
    ok('the same window asked twice shares one count; another waits its turn', g1 === g2 && g1 !== g3 && order.join() === '7:2026-08-01' && q.tags().join() === 't1,t2', order.join() + ' / ' + q.tags().join());
    rel[7]({}); await flush();
    ok('...and starts once that one is done', order.join() === '7:2026-08-01,6:2026-07-01' && q.tags().join() === 't3');
    rel[6]({}); await flush();
    ok('the worker answers it', /else if \(type === 'creditsGmOld'\) \{ result = await runGmOld\(payload\); \}/.test(src));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'credits checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
