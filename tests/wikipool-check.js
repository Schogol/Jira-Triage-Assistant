// Eval the real JiTA.conf.descendants + JiTA.leadduty.pool and drive them over a page tree shaped like the
// live one. The bug this pins, reported 2026-09-20: a Lead was assigned "ECAID Newsletter - February 2025",
// which sits at
//     ECAID - Lead Section  >  ECAID Monthly Newsletters  >  [FOLDER] ECAID Newsletters - 2025  >  the page
// and the Lead Section is an EXCLUDED subtree. The ancestry walk was built from the crawl's PAGES only, and a
// Confluence FOLDER is not a page, so the chain snapped at the folder and the page read as excluded by nothing.
const fs = require('fs');
// JITA_SRC lets this be pointed at an older copy of the file, to confirm it goes red on the version that shipped the bug.
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
if (cs < 0 || ls < 0 || le < 0) { throw new Error('could not slice JiTA.conf / JiTA.leadduty'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const ME = { accountId: 'acc:schogol', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true };
const meta = {};
global.gmGet = (k, d) => (k === 'leadDutyMe' ? ME : d);
global.gmSet = () => {};
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5,
    credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 } },
    dlog: () => {}, link: {}, sync: {}, util: {},
    db: {
        getMeta: (k) => Promise.resolve(Object.prototype.hasOwnProperty.call(meta, k) ? meta[k] : null),
        setMeta: (k, v) => { meta[k] = v; return Promise.resolve(); }
    }
};
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
const L = global.JiTA.leadduty;

// The three ids the script excludes, and the documentation root, read from the source rather than retyped -
// a harness that hardcodes them would keep passing after someone edits EXCLUDE_PAGES.
const LEAD_SECTION = '199762273', TRAINING = '199756496', ROOT = L.ROOT_PAGE;
ok('the Lead Section is one of the excluded subtrees', !!L.EXCLUDE_PAGES[LEAD_SECTION]);

// depth is informational here; what matters is type + parentId. The FOLDER nodes are the point of the test.
const TREE = [
    // --- the excluded Lead Section, exactly as the screenshot shows it ---
    { id: LEAD_SECTION, type: 'page',   title: 'ECAID - Lead Section',            parentId: ROOT,          depth: 1 },
    { id: '310',        type: 'page',   title: 'ECAID Quality Control primer',    parentId: LEAD_SECTION,  depth: 2 },
    { id: '300',        type: 'page',   title: 'ECAID Monthly Newsletters',       parentId: LEAD_SECTION,  depth: 2 },
    { id: '410',        type: 'page',   title: 'ECAID Newsletters - 2024',        parentId: '300',         depth: 3 },
    { id: '400',        type: 'folder', title: 'ECAID Newsletters - 2025',        parentId: '300',         depth: 3 },
    { id: '1153826971', type: 'page',   title: 'ECAID Newsletter - February 2025', parentId: '400',        depth: 4 },
    // --- a NON-excluded section that also uses a folder: none of this may be lost ---
    { id: '500',        type: 'page',   title: 'Bug Hunting Guides',              parentId: ROOT,          depth: 1 },
    { id: '600',        type: 'folder', title: 'Guides - 2025',                   parentId: '500',         depth: 2 },
    { id: '700',        type: 'page',   title: 'How to triage a crash',           parentId: '600',         depth: 3 },
    // --- another excluded root, and a plain page at the top level ---
    { id: TRAINING,     type: 'page',   title: 'Training Session Reports',        parentId: ROOT,          depth: 1 },
    { id: '800',        type: 'page',   title: 'Glossary',                        parentId: ROOT,          depth: 1 },
    // --- noise the pool must never carry: a whiteboard, and an archived page ---
    { id: '900',        type: 'whiteboard', title: 'Scratch board',               parentId: ROOT,          depth: 1 },
    { id: '910',        type: 'page',   title: 'Old retired guide', status: 'archived', parentId: ROOT,    depth: 1 }
];

// Two pages per response, so the pagination path is exercised rather than assumed.
let crawls = 0;
JiTA.conf._ajax = function (method, path) {
    void method;
    const m = /[?&]start=(\d+)/.exec(path);
    const start = m ? parseInt(m[1], 10) : 0;
    if (start === 0) { crawls++; }
    const slice = TREE.slice(start, start + 2);
    const next = (start + 2 < TREE.length) ? ('/wiki/api/v2/pages/x/descendants?start=' + (start + 2)) : null;
    return Promise.resolve({
        data: { results: slice, _links: next ? { next: next } : {} },
        xhr: { getResponseHeader: () => null }
    });
};

// The ledger PAGE renders its Coverage table and Review log FROM the pool, but a crawl writes nothing to the
// LEDGER - so report.tap never fires and the published page keeps the previous crawl's numbers. Schogol,
// 2026-09-21: a page reading "31 pages in rotation" against a Settings line already saying 30. Count the
// republish requests rather than letting one run - what is pinned here is that a crawl asks for one at all.
let published = 0;
L.report.schedule = () => { published++; };

(async () => {
    const pool = await L.pool.ensureFresh(true);
    ok('a new crawl asks for the ledger page to be republished', published === 1, published + ' requested');
    const ids = {};
    pool.pages.forEach((p) => { ids[p.id] = p.title; });

    // ---- the reported bug ----
    ok('a page under a FOLDER inside an excluded subtree is excluded',
        !ids['1153826971'], 'still in the pool: ' + ids['1153826971']);
    ok('...and is named in excludedIds', !!pool.excludedIds['1153826971']);

    // The rest of the Lead Section, which the pages-only walk already handled - it must stay handled.
    ok('the excluded root itself is excluded', !ids[LEAD_SECTION]);
    ok('a direct child of it is excluded', !ids['310']);
    ok('a grandchild reached through pages only is excluded', !ids['410']);
    ok('a second excluded root is excluded too', !ids[TRAINING]);

    // ---- no over-exclusion: a folder outside the excluded subtrees changes nothing ----
    ok('a page under a NON-excluded folder is kept', !!ids['700'], Object.keys(ids).join(','));
    ok('its parent section is kept', !!ids['500']);
    ok('a plain top-level page is kept', !!ids['800']);
    ok('only the three real pages survive', pool.pages.length === 3, pool.pages.map((p) => p.title).join(' | '));

    // ---- the pool itself still holds PAGES only ----
    ok('a folder is never a reviewable page', !ids['400'] && !ids['600']);
    ok('a whiteboard is never a reviewable page', !ids['900']);
    ok('an archived page is never a reviewable page', !ids['910']);
    // rawCount is the crawl's PAGES (the folders, the whiteboard and the archived page never reach it):
    // 9 pages, of which the two excluded subtrees account for 6.
    ok('the counts describe the crawl', pool.rawCount === 9 && pool.excludedCount === 6,
        'raw ' + pool.rawCount + ', excluded ' + pool.excludedCount);

    // ---- the cache carries the ancestry, and one written without it is not trusted ----
    ok('the cached record keeps the full parent map', !!(meta['leadduty:pool'] || {}).parents);
    ok('a folder is a link in that map', meta['leadduty:pool'].parents['400'] === '300');

    crawls = 0;
    published = 0;
    await L.pool.ensureFresh(false);
    ok('a fresh cache is served without re-crawling', crawls === 0);
    // The other half of the rule: the page only describes the POOL, so serving the same pool again changes
    // nothing on it. Republishing here would put a Confluence round trip behind every overlay open.
    ok('...and asks for no republish, having changed nothing', published === 0, published + ' requested');

    // The shape a version before this fix wrote: pages, no parents. Serving it would keep an excluded
    // subtree in rotation for another day, so it has to be re-crawled however young it is.
    const old = JSON.parse(JSON.stringify(meta['leadduty:pool']));
    delete old.parents;
    old.fetchedAt = Date.now();
    meta['leadduty:pool'] = old;
    crawls = 0;
    const healed = await L.pool.ensureFresh(false);
    ok('a cache with no ancestry is re-crawled even when young', crawls === 1, crawls + ' crawls');
    ok('...and the page is excluded after that', !healed.excludedIds || !!healed.excludedIds['1153826971']);

    // ---- a frozen month drops a page the exclusions now catch ----
    // The live month was cut BEFORE the fix, so the newsletter is in someone's slice. It cannot be re-cut,
    // but it must not keep asking for a review that should never have been assigned.
    const record = { assign: { schogol: ['700', '1153826971', '800'], solnichka: ['500'] } };
    const mine = L.wiki.assignedIds(record, healed);
    ok('a frozen assignment drops a now-excluded page', mine.indexOf('1153826971') === -1, mine.join(','));
    ok('and keeps everything else, in order', mine.join(',') === '700,800', mine.join(','));
    ok('a pool with no exclusion data leaves the slice alone',
        L.wiki.assignedIds(record, null).join(',') === '700,1153826971,800');

    // ---- an INCOMPLETE crawl must be caught, not consumed --------------------------------------------
    // Schogol, 2026-09-20: a Clear ledger sometimes re-assigned the newsletter anyway, cut by the current
    // build, on a tab whose cached pool excluded it correctly - and the cache was written TEN SECONDS AFTER
    // the cut. Several callers raced to crawl an empty cache and the freeze took one that came back short.
    // A short crawl is indistinguishable from a complete one: the chain just stops, which reads as "excluded
    // by nothing". So the walk now has to END somewhere it recognises.
    ok('a complete crawl is verified', healed.verified === true && healed.holes === 0,
        JSON.stringify({ verified: healed.verified, holes: healed.holes }));

    const ensureFreshReal = L.pool.ensureFresh;
    const FULL = TREE.slice();
    const good = JSON.parse(JSON.stringify(meta['leadduty:pool']));
    TREE.splice(TREE.findIndex((n) => n.id === '400'), 1);   // lose the FOLDER: one absent node is all it takes

    meta['leadduty:pool'] = null;
    published = 0;
    const holey = await L.pool.ensureFresh(true);
    ok('an incomplete crawl is flagged rather than trusted', holey.verified === false && holey.holes > 0,
        JSON.stringify({ verified: holey.verified, holes: holey.holes }));
    ok('...and the newsletter is exactly what it stops excluding',
        holey.pages.some((p) => p.id === '1153826971'));
    ok('...and it is never written to the cache', !meta['leadduty:pool'],
        'a holey crawl would then look FRESH for 24h');
    // A crawl that was thrown away changed nothing the page describes, so it must not drag the page after
    // it either - the republish rides on the caching path, not on the attempt.
    ok('...and a discarded crawl republishes nothing', published === 0, published + ' requested');

    meta['leadduty:pool'] = good;
    const kept = await L.pool.ensureFresh(true);
    ok('an incomplete crawl falls back to the last good pool',
        kept.verified === true && !!kept.excludedIds['1153826971']);
    ok('...and leaves that good cache in place', !!(meta['leadduty:pool'] || {}).parents);

    // The invariant that actually stops the bug: reading may degrade, cutting may not. A frozen month is
    // never re-cut, so a page assigned off a holey pool would sit in someone's queue for the whole month.
    L.pool.ensureFresh = () => Promise.resolve(holey);
    JiTA.conf.getProperty = () => Promise.resolve(null);
    let cut = false;
    JiTA.conf.saveProperty = () => { cut = true; return Promise.resolve({ id: 'p', key: 'k', value: {}, version: 1 }); };
    let cutErr = null;
    await L.wiki.claimMonth('2026-09').then(() => {}, (e) => { cutErr = e; });
    ok('an incomplete pool cannot freeze a month', !cut, 'the month was written anyway');
    ok('...and it says why, so the failure is not silent',
        !!cutErr && /could not be traced to the root/.test(cutErr.message),
        String((cutErr && cutErr.message) || 'no error raised'));

    // ---- and the race itself: one crawl, however many callers ----
    L.pool.ensureFresh = ensureFreshReal;
    TREE.length = 0; FULL.forEach((n) => TREE.push(n));
    meta['leadduty:pool'] = null;
    crawls = 0;
    const many = await Promise.all([L.pool.ensureFresh(true), L.pool.ensureFresh(true), L.pool.ensureFresh(true)]);
    ok('simultaneous callers share ONE crawl', crawls === 1, crawls + ' crawls');
    ok('...and every one of them gets a verified pool', many.every((p) => p.verified === true));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'wiki-pool exclusion checks passed.'));
    process.exit(fail ? 1 : 0);
})();
