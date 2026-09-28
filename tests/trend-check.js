// Eval the real JiTA.trend (v3.34.0) out of the file and drive it against stubs. What is pinned here is what makes
// the count honest rather than what it looks like:
//   - a report counts by when it was CREATED, once per defect, through its duplicate link when it has one;
//   - the window / baseline boundaries, the trend words and the MIN threshold;
//   - "filed after the fix" only for a defect that IS resolved;
//   - the cache: fresh counts are never refetched, another tab's newer count is adopted, one count at a time,
//     a tab that finds another counting serves what it has, and a failed count neither blanks the list nor
//     retries on every render.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('JiTA.trend = {');
const em = '\n    _noop: null\n};';
const e = src.indexOf(em, s);
if (s < 0 || e < 0) { throw new Error('could not slice JiTA.trend'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const eq = (a, b, n) => ok(n, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' != ' + JSON.stringify(b));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-27T12:00:00.000Z');
let now = NOW;
const realNow = Date.now;
Date.now = () => now;

const gm = {}, meta = {}, defects = {};
let posts = [], pages = [], dupName = 'Duplicate', metaReads = 0;
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.GM_addStyle = () => {};
global.JITA_NO_JIRA_UI = false;
global.document = { querySelector: () => null, getElementById: () => null };
global.$ = (html) => {
    const o = { _html: html, _text: '', _attr: {} };
    o.text = (t) => { o._text = t; return o; };
    o.attr = (k, v) => { o._attr[k] = v; return o; };
    return o;
};
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0,
    sched: { tabId: 'tab-me' },
    util: {
        delay: () => Promise.resolve(),
        isResolved: (status, resolution) => !!resolution || /closed|done|resolved/i.test(status || '')
    },
    rank: { _matchTerms: (hay, terms) => terms.every((t) => hay.indexOf(t) !== -1) },
    link: { dupInfo: () => Promise.resolve(dupName ? { name: dupName, ebrSide: 'outward' } : null) },
    db: {
        getMeta: (k) => { metaReads++; return Promise.resolve(Object.prototype.hasOwnProperty.call(meta, k) ? meta[k] : null); },
        setMeta: (k, v) => { meta[k] = v; return Promise.resolve(); },
        getDefect: (k) => Promise.resolve(defects[k] || null)
    },
    sync: {
        _apiPost: (path, body) => {
            posts.push({ path: path, body: body, lease: gm.trendLease });
            const next = pages.shift();
            if (!next) { return Promise.resolve({ data: { issues: [], isLast: true } }); }
            if (next.fail) { return Promise.reject(new Error(next.fail)); }
            return Promise.resolve({ data: next });
        }
    },
    ui: { _showTip() {}, _hideTip() {} }
};
eval(src.slice(s, e + em.length));
const T = global.JiTA.trend;

// ---- builders ----
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const lnk = (type, key, fields, inward) => {
    const o = { key: key, fields: fields || { summary: 'summary of ' + key, status: { name: 'Open' } } };
    return inward ? { type: { name: type }, inwardIssue: o } : { type: { name: type }, outwardIssue: o };
};
const rep = (created, links) => ({ key: 'EBR-' + Math.floor(Math.random() * 1e6), fields: { created: created, issuelinks: links } });

(async () => {
    // ---- counting ----
    let a = T._aggregate([
        rep(ago(1), [lnk('Duplicate', 'EDR-1')]),
        rep(ago(20), [lnk('Duplicate', 'EDR-1')]),
        rep(ago(45), [lnk('Duplicate', 'EDR-1')])
    ], 'Duplicate', NOW);
    ok('a report filed yesterday counts as recent', a.defects['EDR-1'] && a.defects['EDR-1'].recent.length === 1, JSON.stringify(a.defects));
    ok('one filed 20 days ago counts toward the baseline', a.defects['EDR-1'].base === 1);
    ok('one filed 45 days ago counts nowhere', a.reports === 2, String(a.reports));
    ok('the record carries its shape version and time', a.v === T.V && a.at === NOW);

    a = T._aggregate([
        rep(new Date(NOW - 14 * DAY + 1000).toISOString(), [lnk('Duplicate', 'EDR-2')]),
        rep(new Date(NOW - 14 * DAY).toISOString(), [lnk('Duplicate', 'EDR-2')]),
        rep(new Date(NOW - 42 * DAY + 1000).toISOString(), [lnk('Duplicate', 'EDR-2')]),
        rep(new Date(NOW - 42 * DAY).toISOString(), [lnk('Duplicate', 'EDR-2')])
    ], 'Duplicate', NOW);
    eq([a.defects['EDR-2'].recent.length, a.defects['EDR-2'].base], [1, 2], 'the window and the baseline end exactly on their day boundaries');

    a = T._aggregate([rep(ago(2), [lnk('Relates', 'EDR-5'), lnk('Duplicate', 'EDR-6')])], 'Duplicate', NOW);
    ok('the duplicate link wins over a "relates to"', !a.defects['EDR-5'] && a.defects['EDR-6'], Object.keys(a.defects).join(','));
    a = T._aggregate([rep(ago(2), [lnk('Relates', 'EO-7')])], 'Duplicate', NOW);
    ok('a report with no duplicate link still counts through the link it has', !!a.defects['EO-7']);
    a = T._aggregate([rep(ago(2), [lnk('Relates', 'EO-7'), lnk('Relates', 'PLAT-8')])], null, NOW);
    ok('with the link type unknown, every defect link counts', !!a.defects['EO-7'] && !!a.defects['PLAT-8']);
    a = T._aggregate([rep(ago(2), [lnk('Duplicate', 'EBR-9'), lnk('Cloners', 'EDRX-1'), lnk('Duplicate', 'EDR-10a')])], 'Duplicate', NOW);
    ok('links to reports or to look-alike keys never count', Object.keys(a.defects).length === 0 && a.reports === 0, JSON.stringify(a));
    a = T._aggregate([rep(ago(2), [lnk('Duplicate', 'EDR-11'), lnk('Duplicate', 'EDR-11', null, true)])], 'Duplicate', NOW);
    ok('a report linked to one defect twice counts once', a.defects['EDR-11'].recent.length === 1);
    a = T._aggregate([rep('not a date', [lnk('Duplicate', 'EDR-12')]), { fields: null }, null], 'Duplicate', NOW);
    ok('an unreadable report is skipped, not counted and not fatal', Object.keys(a.defects).length === 0);
    a = T._aggregate([rep(ago(30), [lnk('Duplicate', 'EDR-13')])], 'Duplicate', NOW);
    ok('a defect with nothing recent is not kept', !a.defects['EDR-13']);
    a = T._aggregate([rep(ago(1), [lnk('Duplicate', 'EDR-14', { summary: 'Crash on undock', status: { name: 'In Progress' } })])], 'Duplicate', NOW);
    eq([a.defects['EDR-14'].summary, a.defects['EDR-14'].status], ['Crash on undock', 'In Progress'], 'summary and status come with the link, no extra request');

    // ---- trend words ----
    eq([T.trendOf(5, 0), T.trendOf(10, 10), T.trendOf(9, 10), T.trendOf(5, 20), T.trendOf(6, 20)],
        ['new', 'up', 'steady', 'down', 'steady'], 'new / rising / steady / falling against the scaled baseline');
    ok('"usually" is the baseline scaled to the window', T.usual(7) === 4 && T.usual(28) === 14, T.usual(7) + ' ' + T.usual(28));

    // ---- the list ----
    const mk = (key, n, base, lastDaysAgo) => {
        const recent = [];
        for (let i = 0; i < n; i++) { recent.push(ago(lastDaysAgo + i * 0.5)); }
        return { key: key, summary: key, status: 'Open', recent: recent, base: base };
    };
    const data = { v: T.V, at: NOW, reports: 40, defects: {
        'EDR-20': mk('EDR-20', 4, 0, 1), 'EDR-21': mk('EDR-21', 5, 0, 3), 'EDR-22': mk('EDR-22', 9, 4, 1),
        'EDR-23': mk('EDR-23', 5, 0, 1), 'EDR-24': mk('EDR-24', 5, 0, 1)
    } };
    const hot = T.hot(data);
    eq(hot.map((r) => r.key), ['EDR-22', 'EDR-23', 'EDR-24', 'EDR-21'], 'MIN or more only, most first, then the latest report, then the key');
    eq([hot[0].count, hot[0].trend, hot[0].project], [9, 'up', 'EDR'], 'a row carries its count, its trend and its project');

    // ---- per-day buckets ----
    const days = T.days([new Date(NOW - 3600e3).toISOString(), ago(13.5), ago(14), ago(2.2), ago(2.9)], NOW);
    eq([days.length, days[13], days[0], days[11]], [14, 1, 1, 2], 'one bucket per day, oldest first, the window edge excluded');

    // ---- filed after the fix ----
    const times = [ago(1), ago(2), ago(3), ago(8), ago(9)];
    ok('reports filed after a fix are counted', T.afterFix({ status: 'Closed', resolution: 'Fixed', resolutiondate: ago(5), times: times }) === 3);
    ok('...but not for a reopened defect', T.afterFix({ status: 'Open', resolution: null, resolutiondate: ago(5), times: times }) === 0);
    ok('...nor without a resolution date', T.afterFix({ status: 'Closed', resolution: 'Fixed', resolutiondate: null, times: times }) === 0);
    ok('the note names a new defect', T.note({ trend: 'new', base: 0, afterFix: 0 }) === 'new: none in the 28 days before', T.note({ trend: 'new', base: 0, afterFix: 0 }));
    const n2 = T.note({ trend: 'up', base: 6, afterFix: 2 });
    ok('the note says which way it is going, and warns at two after the fix', n2 === 'rising · ⚠ 2 filed after the fix', n2);
    ok('a steady defect reads as just that', T.note({ trend: 'steady', base: 6, afterFix: 0 }) === 'steady', T.note({ trend: 'steady', base: 6, afterFix: 0 }));
    ok('...and a falling one', T.note({ trend: 'down', base: 60, afterFix: 0 }) === 'falling', T.note({ trend: 'down', base: 60, afterFix: 0 }));
    ok('...but not at one', !/after the fix/.test(T.note({ trend: 'steady', base: 6, afterFix: 1 })));

    // ---- the badge ----
    T._data = data;
    ok('a trending defect gets its count', T.countFor('EDR-22') === 9);
    ok('an unknown key gets none', T.countFor('EBR-1') === 0);
    ok('a badge reads "🔥 9"', T.badge('EDR-22') && T.badge('EDR-22')._text === '🔥 9');
    ok('no badge below MIN', T.badge('EDR-20') === null);
    now = NOW + T.STALE_MS + 1;
    ok('no badge from a count more than a day old', T.countFor('EDR-22') === 0);
    now = NOW;
    T._data = Object.assign({}, data, { v: T.V + 1 });
    ok('no badge from a record of another shape', T.countFor('EDR-22') === 0);
    ok('the filter box narrows by key and summary', T.matches({ key: 'EDR-1', summary: 'Crash on undock' }, ['undock']) &&
        !T.matches({ key: 'EDR-1', summary: 'Crash on undock' }, ['warp']) && T.matches({ key: 'EDR-1', summary: '' }, []));

    // ---- fetching ----
    const reset = () => {
        T._data = null; T._busy = null; T._error = null; T._failAt = 0;
        Object.keys(meta).forEach((k) => delete meta[k]);
        delete gm.trendLease;
        posts = []; pages = []; metaReads = 0; now = NOW; dupName = 'Duplicate';
    };
    reset();
    pages = [
        { issues: [rep(ago(1), [lnk('Relates', 'EDR-30'), lnk('Duplicate', 'EDR-31')])], nextPageToken: 'P2' },
        { issues: [rep(ago(2), [lnk('Duplicate', 'EDR-31')])], isLast: true }
    ];
    let d = await T.ensure(false);
    eq(posts.length, 2, 'pages until Jira says there are no more');
    ok('the search is the attached reports of the last 42 days',
        /project = EBR AND status = Attached AND created >= -42d/.test(posts[0].body.jql), posts[0].body.jql);
    eq(posts[0].body.fields, ['created', 'issuelinks'], 'and asks for nothing but the date and the links');
    eq(posts[1].body.nextPageToken, 'P2', 'the second page follows the token');
    ok('the duplicate link type is the one Jira names', !d.defects['EDR-30'] && d.defects['EDR-31'].recent.length === 2);
    ok('the lease is held while counting', posts[0].lease && posts[0].lease.tabId === 'tab-me');
    ok('and released after', gm.trendLease === null);
    ok('the count lands in the meta store for the other tabs', meta.trending && meta.trending.at === NOW);

    posts = [];
    await T.ensure(false);
    ok('a fresh count is never refetched', posts.length === 0);
    await T.ensure(true);
    ok('...unless forced', posts.length === 1);

    reset();
    pages = [{ issues: [], nextPageToken: 'P2' }, { issues: [], nextPageToken: 'P3' }, { issues: [], isLast: true }];
    const origMax = T.MAX_REPORTS;
    T.MAX_REPORTS = 0;
    await T.ensure(false);
    ok('a runaway search stops at MAX_REPORTS', posts.length === 1, String(posts.length));
    T.MAX_REPORTS = origMax;

    reset();
    meta.trending = { v: T.V, at: NOW - 60000, reports: 1, defects: {} };
    d = await T.ensure(false);
    ok("another tab's fresh count is adopted without a search", posts.length === 0 && d.at === NOW - 60000);
    reset();
    meta.trending = { v: T.V + 1, at: NOW, reports: 1, defects: {} };
    await T.ensure(false);
    ok('a record of another shape is counted again rather than misread', posts.length === 1);
    reset();
    meta.trending = { v: T.V + 1, at: NOW, reports: 1, defects: { 'EDR-60': { key: 'EDR-60', recent: [1, 2, 3, 4, 5], base: 0 } } };
    pages = [{ fail: 'HTTP 502' }];
    let foreign = false;
    await T.ensure(false).then(() => { foreign = true; }, () => {});
    ok('...and never served, even when the new count fails', !foreign && T._data === null);

    reset();
    const p1 = T.ensure(false), p2 = T.ensure(false);
    await Promise.all([p1, p2]);
    ok('two callers at once share one count', posts.length === 1 && p1 === p2, String(posts.length));

    reset();
    T._data = { v: T.V, at: NOW - T.TTL_MS - 1, reports: 0, defects: {} };
    gm.trendLease = { tabId: 'tab-other', ts: NOW - 1000 };
    d = await T.ensure(false);
    ok('a stale count is served while another tab is counting', posts.length === 0 && d.at === NOW - T.TTL_MS - 1);
    gm.trendLease = { tabId: 'tab-other', ts: NOW - T.LEASE_MS - 1 };
    await T.ensure(false);
    ok('an abandoned lease does not block', posts.length === 1);
    reset();
    gm.trendLease = { tabId: 'tab-other', ts: NOW - 1000 };
    await T.ensure(false);
    ok('with nothing to serve, it counts anyway', posts.length === 1);

    // ---- failure ----
    reset();
    T._data = { v: T.V, at: NOW - T.TTL_MS - 1, reports: 0, defects: { 'EDR-40': { key: 'EDR-40', recent: [ago(1)], base: 0 } } };
    pages = [{ fail: 'Jira API failed: HTTP 503' }];
    d = await T.ensure(false);
    ok('a failed count keeps serving the last one', d.defects['EDR-40'] && /503/.test(T._error), T._error);
    ok('and releases the lease', gm.trendLease === null);
    posts = [];
    await T.ensure(false);
    ok('it does not retry on every render', posts.length === 0);
    now = NOW + T.FAIL_MS + 1;
    await T.ensure(false);
    ok('but does once the back-off is over', posts.length === 1);
    ok('and a success clears the error', T._error === null && T._failAt === 0);

    reset();
    pages = [{ fail: 'HTTP 401' }];
    let rejected = false;
    await T.ensure(false).catch(() => { rejected = true; });
    ok('with nothing to fall back on, a failure is an error', rejected);
    rejected = false; posts = [];
    await T.ensure(false).catch(() => { rejected = true; });
    ok('...and stays one, without a new search, during the back-off', rejected && posts.length === 0);
    await T.ensure(true);
    ok('Retry (forced) counts again at once', posts.length === 1);

    // ---- warm: one repaint when a count arrives, never a loop ----
    reset();
    let repaints = 0;
    await T.warm(() => { repaints++; });
    await T.warm(() => { repaints++; });
    ok('a new count repaints once, and a repeat does not', repaints === 1, String(repaints));
    reset();
    pages = [{ fail: 'HTTP 500' }];
    await T.warm(() => { repaints++; });
    ok('a failed count repaints nothing and throws nothing', repaints === 1);

    // ---- rows: enriched from the local database ----
    reset();
    T._data = { v: T.V, at: NOW, reports: 6, defects: { 'EDR-50': { key: 'EDR-50', summary: 's', status: 'Open',
        recent: [ago(1), ago(2), ago(3), ago(6), ago(7)], base: 0 } } };
    defects['EDR-50'] = { summary: 's', status: 'Closed', resolution: 'Fixed', resolutiondate: ago(4), description: 'the text', created: ago(100) };
    const res = await T.rows(false);
    const r0 = res.rows[0];
    eq([r0.status, r0.resolution, r0.description, r0.afterFix], ['Closed', 'Fixed', 'the text', 3], 'a row is filled in from the local database');
    ok('and carries its note', /new: none/.test(r0.note) && /3 filed after the fix/.test(r0.note), r0.note);
    eq([res.at, res.reports], [NOW, 6], 'with the time and total of the count behind it');

    Date.now = realNow;
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'trending checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((x) => { console.log('CRASH', x && x.stack || x); process.exit(2); });
