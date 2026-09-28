// Eval the real JiTA.leadduty.report publish path and drive it against a stubbed Confluence, to pin that the
// PAGE actually tracks the ledger. Schogol reviewed two pages on 2026-09-20, the overlay ticked them, and the
// published page still said "Outstanding" - which is only ever visible as a stale page, never as an error.
// Three ways that can happen, all pinned here.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const meta = {};
global.gmGet = (k, d) => (k === 'leadDutyMe' ? { accountId: 'a', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true } : d);
global.gmSet = () => {};
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5,
    credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 } },
    dlog: () => {}, link: {}, sync: {}, util: {},
    db: { getMeta: (k) => Promise.resolve(meta[k] == null ? null : meta[k]), setMeta: (k, v) => { meta[k] = v; return Promise.resolve(); } }
};
// The page's publisher gate compares build versions, so the harness needs the REAL comparator rather than a
// retyped one - slice JiTA.worker._verCmp out of the source. (JiTA.SCRIPT_VERSION is reassigned per check.)
const vs = src.indexOf('\n    _verCmp: function (a, b) {'), ve = src.indexOf('\n    },', vs) + 7;
if (vs < 0 || ve < 7) { throw new Error('could not slice JiTA.worker._verCmp'); }
global.JiTA.worker = eval('({' + src.slice(vs, ve) + '})');
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
const L = global.JiTA.leadduty, R = L.report, ym = L._ym();
global.JiTA.util.hash = (s) => { let h = 5381, i = s.length; while (i) { h = (h * 33) ^ s.charCodeAt(--i); } return (h >>> 0).toString(16); };

// ---- a Confluence stub: one page body, one ledger property, both versioned like the real thing ----
let page = { id: '2', title: 'ECAID Lead Ledger', status: 'current', version: 3, body: '' };
let writes = 0, hangNextWrite = false;
const props = {};
let poolPages = [{ id: '11', title: 'Sisi seedlist updates' }, { id: '12', title: 'Agents, Mission and Exploration Testing' }];
let poolExcluded = {};
L.pool.ensureFresh = () => Promise.resolve({ fetchedAt: Date.now(), rootId: '1', truncated: false,
    rawCount: 2, excludedCount: Object.keys(poolExcluded).length, excludedIds: poolExcluded,
    pages: poolPages.filter((p) => !poolExcluded[p.id]) });
JiTA.conf.getProperty = (p, key) => Promise.resolve(props[key] || null);
JiTA.conf.saveProperty = (p, key, value, prop) => {
    props[key] = { id: key, key: key, value: JSON.parse(JSON.stringify(value)), version: (prop ? prop.version : 0) + 1 };
    return Promise.resolve(props[key]);
};
JiTA.conf.getPage = () => Promise.resolve({ id: page.id, title: page.title, status: page.status, version: page.version, body: '' });
JiTA.conf.savePageBody = (pg, html) => {
    if (hangNextWrite) { hangNextWrite = false; return new Promise(() => {}); }   // a request that never settles
    writes++; page.version = pg.version + 1; page.body = html;
    return Promise.resolve({ id: page.id, title: pg.title, version: page.version });
};

// The scheduled publish is debounced by 20s; drive it directly and keep the timer out of the test.
R.schedule = () => { R._scheduled = (R._scheduled || 0) + 1; };

(async () => {
    // ---- 1. Freezing a month must reach the page, not wait for the next six-hourly tick ----
    R._scheduled = 0;
    const res = await L.wiki.claimMonth(ym);
    ok('freezing a month assigns pages', !!(res.record && res.record.assign));
    ok('...and schedules a publish, so the fresh cut reaches the page now', R._scheduled === 1, String(R._scheduled));

    await R.publish(false);
    ok('the first publish writes the page', writes === 1, String(writes));
    ok('the page lists the month as outstanding', /Outstanding/.test(page.body));

    // ---- 2. An unchanged ledger must NOT write a new page version ----
    // The stamp line carries the time to the minute, so hashing the rendered page (rather than its content)
    // made every hash unique: "unchanged" was unreachable and the page grew a version on every tick.
    const before = page.version;
    const r2 = await R.publish(false);
    ok('a second publish with nothing changed is skipped', r2 && r2.skipped === 'unchanged', JSON.stringify(r2));
    ok('...so the page keeps its version', page.version === before, page.version + ' vs ' + before);

    // The skip above only proves anything because both publishes landed in the SAME minute - which is how
    // this hid. The stamp is minute-precision, so a minute later the hash differed and the page was
    // rewritten regardless of the ledger. Move the clock and compare what is actually hashed.
    if (typeof R._content !== 'function') {
        ok('the hashed content excludes the generated-at stamp', false,
            'no _content seam: the whole rendered page is hashed, so its hash changes every minute');
    } else {
        const cur = (await L.ledger.read(L.LEDGER_KEY)).value;
        const pool2 = await L.pool.ensureFresh(false);
        const c1 = R._content(cur, null, pool2), rendered = R.render(cur, null, pool2);
        const RealDate = Date;
        global.Date = class extends RealDate {                       // two minutes later, same ledger
            constructor(...a) { super(...(a.length ? a : [RealDate.now() + 120000])); }
            static now() { return RealDate.now() + 120000; }
        };
        const c2 = R._content(cur, null, pool2);
        global.Date = RealDate;
        ok('the hashed content excludes the generated-at stamp', c1 === c2);
        ok('...but the page itself still shows when it was generated',
            /Generated from the shared lead-duty ledger/.test(rendered) && !/Generated from the shared/.test(c1));
    }

    // ---- 3. A review must change what the page says ----
    R._scheduled = 0;
    await L.wiki.markReviewed('11', ym);
    ok('marking a page reviewed schedules a publish', R._scheduled === 1, String(R._scheduled));
    const r3 = await R.publish(false);
    ok('...and that publish actually writes', !!(r3 && r3.written), JSON.stringify(r3));
    ok('the page now says who reviewed it', /Reviewed by schogol/.test(page.body));
    ok('...and the page it does NOT say reviewed is still outstanding', /Outstanding/.test(page.body));

    // ---- 4. A hung write must not latch the publisher off forever ----
    // conf._ajax has no timeout, so a request that never settles leaves _busy true; every later publish then
    // returns "already publishing" in silence and the page is frozen with nothing to see.
    await L.wiki.markReviewed('12', ym);
    hangNextWrite = true;
    R.publish(false);                                  // never settles - deliberately not awaited
    await new Promise((r) => setTimeout(r, 10));
    const stuck = await R.publish(false);
    ok('a publish while one is genuinely in flight is skipped', stuck && stuck.skipped === 'already publishing');
    R._busyAt = Date.now() - (R.BUSY_MAX_MS + 1000);   // ...but the same latch, long expired, is not honoured
    const healed = await R.publish(false);
    ok('a publish hung past the cap no longer blocks the next one', !!(healed && healed.written), JSON.stringify(healed));
    ok('...and the page catches up with the ledger', /Reviewed by schogol/.test(page.body)
        && (page.body.match(/Reviewed by schogol/g) || []).length === 2,
        (page.body.match(/Reviewed by schogol/g) || []).length + ' reviewed rows');

    // ---- 5. A re-scanned pool alone must reach the page ----
    // Coverage and the Review log are rendered FROM the pool, not from the ledger, so a re-crawl changes what
    // the page should say while writing nothing to the ledger - and a ledger write is the only thing that
    // normally schedules a publish. Schogol saw the gap as a page reading "31 pages in rotation" against a
    // Settings line already saying 30. The hash must therefore cover pool-derived content.
    ok('the page states the rotation size', /Pages in rotation<\/td><td>2</.test(page.body), page.body.slice(page.body.indexOf('Pages in rotation'), page.body.indexOf('Pages in rotation') + 60));
    poolExcluded = { '12': true };                     // one page turns out to sit in an excluded subtree
    const r5 = await R.publish(false);                 // not forced: the ledger has not changed at all
    ok('a re-scanned pool alone is enough to republish', !!(r5 && r5.written), JSON.stringify(r5));
    ok('...and the page now states the new rotation size', /Pages in rotation<\/td><td>1</.test(page.body),
        page.body.slice(page.body.indexOf('Pages in rotation'), page.body.indexOf('Pages in rotation') + 60));

    // ---- 6. A mark landing mid-publish must not be dropped ----
    // Publishing is immediate now (DEBOUNCE_MS 0), so a Lead marking two pages a second apart genuinely races
    // the previous mark's publish. Coming second used to return "already publishing" and vanish, and that
    // review reached the page only on the next six-hourly tick. The request has to be remembered and re-run.
    ok('publishing is immediate, not debounced', R.DEBOUNCE_MS === 0, String(R.DEBOUNCE_MS));
    R._scheduled = 0;
    let release;
    const slow = new Promise((r) => { release = r; });
    const realSave = JiTA.conf.savePageBody;
    JiTA.conf.savePageBody = (pg, html) => slow.then(() => realSave(pg, html));
    const inFlight = R.publish(true);                  // deliberately not awaited: still writing
    await new Promise((r) => setTimeout(r, 10));
    const second = await R.publish(false);             // the next mark's publish, arriving mid-write
    ok('a publish arriving mid-write is still skipped', second && second.skipped === 'already publishing',
        JSON.stringify(second));
    ok('...and nothing is scheduled while it is still in flight', R._scheduled === 0, String(R._scheduled));
    release();
    await inFlight;
    ok('...but it is re-run once the in-flight publish lands', R._scheduled === 1, String(R._scheduled));
    JiTA.conf.savePageBody = realSave;
    // ...and it must not keep re-running itself: only a fresh request may re-arm it.
    R._scheduled = 0;
    await R.publish(true);
    ok('a publish nobody raced does not schedule another', R._scheduled === 0, String(R._scheduled));

    // ---- 7. A degraded pool must never be published as fact ------------------------------------------
    // Schogol, 2026-09-21: the ledger page said "31 pages in rotation" and listed "ECAID Newsletter -
    // February 2025" as never reviewed, while his own Settings line said 30. Exactly one page differed, and
    // it is the one whose ancestry runs through a FOLDER - so whatever published it held a pool whose parent
    // chains did not resolve. Such a pool reads as "excluded by nothing", which INVENTS rotation work, and
    // three browsers publishing to one page means a degraded tab also ping-pongs against the healthy ones.
    // Reading may degrade (see wikipool-check); publishing may not.
    const healthy = L.pool.ensureFresh;
    const NEWSLETTER = { id: '1153826971', title: 'ECAID Newsletter - February 2025' };
    L.pool.ensureFresh = () => Promise.resolve({
        fetchedAt: Date.now(), rootId: '1', truncated: false, verified: false, holes: 1,
        rawCount: 3, excludedCount: 0, excludedIds: {}, pages: poolPages.concat([NEWSLETTER])
    });
    writes = 0;
    const degraded = await R.publish(false);
    ok('an incomplete page tree is never published', writes === 0, writes + ' write(s)');
    ok('...and the refusal says how many chains broke',
        !!(degraded && degraded.skipped && /incomplete \(1 page/.test(degraded.skipped)), JSON.stringify(degraded));
    ok('...so the last good page survives untouched', !/February 2025/.test(page.body),
        'a page nobody should review was published as never reviewed');
    // force means "rewrite even though the hash says unchanged" - never "rewrite from a pool you do not trust".
    writes = 0;
    await R.publish(true);
    ok('...and not even Republish page overrides it', writes === 0, writes + ' write(s)');
    // The refusal is invisible otherwise: a tab that keeps declining looks exactly like one with nothing to do.
    ok('the refusal is readable afterwards', /incomplete/.test(R.lastLine()), R.lastLine());

    L.pool.ensureFresh = healthy;
    writes = 0;
    await R.publish(true);
    ok('a healthy pool publishes again immediately', writes === 1, writes + ' write(s)');

    // ---- 8. An OLDER build never overwrites a page a newer one published -----------------------------
    // Three Leads is three browsers on three machines, so there is no BroadcastChannel and no Web Lock
    // between them the way JiTA.worker has between tabs of one browser - the shared Confluence property is
    // the only channel all three touch, so the election runs there. Tampermonkey applies an update on the
    // next page load, so a tab left open across a release renders this page from last week's code for as
    // long as it stays open; where two builds disagree they take turns rewriting, and the page ends up
    // saying whatever the last tick happened to say.
    JiTA.SCRIPT_VERSION = '3.27.0';
    writes = 0;
    await R.publish(true);
    ok('a publish records the build that wrote the page', writes === 1, writes + ' write(s)');
    const pub = (props[L.LEDGER_KEY] || {}).value.reportPub;
    ok('...naming the version and whose tab it was',
        !!(pub && pub.v === '3.27.0' && pub.by === 'schogol'), JSON.stringify(pub));

    JiTA.SCRIPT_VERSION = '3.26.3';
    writes = 0;
    const stale = await R.publish(true);
    ok('an older build does not overwrite a newer build\'s page', writes === 0, writes + ' write(s)');
    ok('...and the refusal names both builds',
        !!(stale && stale.skipped && /v3\.26\.3/.test(stale.skipped) && /v3\.27\.0/.test(stale.skipped)),
        JSON.stringify(stale));
    // The gate sits AFTER the hash check on purpose: it may only ever bite a build that would CHANGE the
    // page. An old tab agreeing with what is already there is the common case and must stay silent, or every
    // idle tick on every un-reloaded tab would report a version refusal.
    const quiet = await R.publish(false);
    ok('...but an old tab that agrees with the page is quiet about it',
        !!(quiet && quiet.skipped === 'unchanged'), JSON.stringify(quiet));

    JiTA.SCRIPT_VERSION = '3.27.0';
    writes = 0;
    await R.publish(true);
    ok('the same build publishes as normal', writes === 1, writes + ' write(s)');
    JiTA.SCRIPT_VERSION = '3.28.0';
    writes = 0;
    await R.publish(true);
    ok('a newer build publishes over an older one', writes === 1, writes + ' write(s)');

    // A build that cannot name itself (no GM_info) must not be able to lock every other tab out of the page.
    (props[L.LEDGER_KEY] || {}).value.reportPub = { v: '3.99.0', by: 'someone' };
    JiTA.SCRIPT_VERSION = '';
    writes = 0;
    await R.publish(true);
    ok('an unknown version gates nothing', writes === 1, writes + ' write(s)');

    // ---- 9. Every attempt must leave a readable trace ----
    // A publish runs 20s after a ledger write with no UI attached, so a failure has nowhere to surface. Until
    // this, "the page is out of date" could only be discovered by reading the page and comparing it by eye -
    // which is how Schogol found it, three times.
    if (typeof R.lastLine !== 'function') {
        ok('a publish records what it did', false, 'no lastLine(): every outcome, failures included, is discarded');
    } else {
        ok('a successful publish is recorded', /published/.test(R.lastLine()), R.lastLine());
        await R.publish(false);
        ok('a skipped publish says so, and why', /wrote nothing: unchanged/.test(R.lastLine()), R.lastLine());
        // force, so it reaches the write rather than stopping at the unchanged-hash check above
        JiTA.conf.savePageBody = () => Promise.reject(new Error('HTTP 403'));
        await R.publish(true).catch(() => {});
        ok('a FAILED publish is recorded with its error', /FAILED/.test(R.lastLine()) && /403/.test(R.lastLine()), R.lastLine());
    }

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'publish checks passed.'));
    process.exit(fail ? 1 : 0);
})();
