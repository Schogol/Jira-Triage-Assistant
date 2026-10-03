// credits-check.js - the ISD credits crawl and view (v3.38.25). Evals the real worker crawl functions (sliced from
// jitaWorkerBody) and JiTA.credits against stubs:
//  - every crawl request retries a 429, a 5xx and a dropped connection (search and count retried a 429 only, so one
//    502 threw a month's crawl away); a 4xx fails at once
//  - an old-domain handle two members share goes to the same member whatever order the lookups finish in, each member
//    stops at its first hit, and a quote in a handle is escaped in the JQL
//  - tied members share a rank; a scheduled run's "ready" stays quiet and a failed quiet run clears its pill
//  - the badge keeps "updating…" through its own refresh; the poll starts once; last month is recomputed once after it
//    ends
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

    // ================= old-domain accounts =================
    const exists = { 'john@old': 'A-JOHN', 'jsmith@old': null, 'johnsmith@old': null, 'jdoe@old': null, 'johndoe@old': null };
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
                    (function hop() { if (n++ < hops) { setImmediate(hop); return; } exists[h] ? res({ issues: [{ fields: { reporter: { accountId: exists[h] } } }] }) : (h in exists ? rej(new Error('400')) : res({ issues: [] })); })();
                });
            }, () => {});
        const out = await R(members || [{ displayName: 'John Smith', emailAddress: 'jsmith@new' }, { displayName: 'John Doe', emailAddress: 'jdoe@new' }]);
        return { out: out, queries: queries, jqls: jqls };
    };
    const a = await resolve({ 'johndoe@old': 5 });
    const b = await resolve({ 'johnsmith@old': 5 });
    ok('a handle two members share goes to one of them, the first in name order', Object.keys(a.out.oldIds).join() === 'A-JOHN' && a.out.oldNames['A-JOHN'] === 'John Doe', JSON.stringify(a.out.oldNames));
    ok('...the same one, whichever lookups finish first', b.out.oldNames['A-JOHN'] === a.out.oldNames['A-JOHN'], a.out.oldNames['A-JOHN'] + ' vs ' + b.out.oldNames['A-JOHN']);
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
    C._updating = true;
    C.badge.refresh();
    await flush();
    ok('the badge keeps saying it is updating through its own refresh', badge.textContent === '📊 12 credits this month · #3/40 · updating…', badge.textContent);
    C._updating = false;
    C.badge.refresh();
    await flush();
    ok('...and stops once the run is over (control)', badge.textContent === '📊 12 credits this month · #3/40', badge.textContent);

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
    store = {}; store[C.sched.LAST_FULL_KEY] = Date.now(); store[C.sched.LAST_SELF_KEY] = Date.now(); refreshed = [];
    C.getCached = () => Promise.resolve({ computedAt: '2026-10-01T03:00:00.000Z' });
    C.sched.tick();
    await flush();
    ok('a month already computed after its end is left alone', refreshed.length === 0 && store[C.sched.PREV_DONE_KEY] === '2026-09', refreshed.join());

    const view = cut('    openView: function (ym) {', '\n    // ---- always-on corner badge', cStart);
    ok('Refresh checks for a running crawl before it touches the quiet flag', /if \(C\.running\) \{ JiTA\.ui\.toast\([^)]*\); return; \}\s*\n\s*\$refresh\.prop\('disabled', true\)/.test(view) && view.indexOf('C._quiet = false;') > view.indexOf('if (C.running)'));
    ok('a manual Refresh of this month stamps the scheduler and refreshes the badge\'s own total', /gmSet\(C\.sched\.LAST_FULL_KEY, Date\.now\(\)\)/.test(view) && /C\.refreshSelf\(yy, mm\)/.test(view));
    ok('a failed leaderboard read says so', /Could not read the leaderboard/.test(view));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'credits checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
