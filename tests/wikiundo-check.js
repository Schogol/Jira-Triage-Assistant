// wikiundo-check.js - Undo for a wiki review or skip (v3.37.0). A review re-stamps three shared maps (last review,
// previous review, who reviewed), which the four-eyes rule and next month's assignment read, so Undo must put all
// three back EXACTLY - absent values back to absent - from the snapshot the review now records. Only your own
// mark, and only while it is still the page's latest review; a legacy mark without a snapshot is never guessed at.
// Evals the real JiTA.conf + JiTA.leadduty against a stubbed Confluence property store and meta store.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
if (cs < 0 || ce < 0 || ls < 0 || le < 0) { throw new Error('could not slice JiTA.conf / JiTA.leadduty'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

global.gmGet = (k, d) => (k === 'leadDutyMe' ? { accountId: 'a', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true } : d);
global.gmSet = () => {};
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5,
    credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 } },
    dlog: () => {}, link: {}, sync: {}, util: {}, worker: {},
    db: { getMeta: () => Promise.resolve(null), setMeta: () => Promise.resolve() }
};
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
const L = global.JiTA.leadduty, W = L.wiki;

const props = {};
let writes = 0, taps = 0;
JiTA.conf.getProperty = (p, key) => Promise.resolve(props[key] ? JSON.parse(JSON.stringify(props[key])) : null);
JiTA.conf.saveProperty = (p, key, value, prop) => {
    writes++;
    props[key] = { id: key, key: key, value: JSON.parse(JSON.stringify(value)), version: (prop ? prop.version : 0) + 1 };
    return Promise.resolve(props[key]);
};
L.report.schedule = () => { taps++; };

const ym = L._ym(), KEY = L.LEDGER_KEY;
// p1: never reviewed. p2: last read by another Lead, with an earlier reading before that. p3: last read by me.
const HISTORY = {
    lastReviewed: { p2: '2025-06-01', p3: '2025-08-08' },
    prevReviewed: { p2: '2024-11-11', p3: '2024-02-02' },
    reviewedBy: { p2: 'solnichka', p3: 'schogol' }
};
function seed() {
    props[KEY] = { id: KEY, key: KEY, version: 1, value: Object.assign({ v: 1, months: {}, done: {} }, JSON.parse(JSON.stringify(HISTORY))) };
}
const value = () => props[KEY].value;
// The page's history as three maps, for a before/after comparison.
const hist = (id) => JSON.stringify([value().lastReviewed[id], value().prevReviewed[id], value().reviewedBy[id],
    id in value().lastReviewed, id in value().prevReviewed, id in value().reviewedBy]);

(async () => {
    // ---- a review records what it replaced ----
    seed();
    const before = { p1: hist('p1'), p2: hist('p2'), p3: hist('p3') };
    const eyesBefore = { p2: W.eyesIn(value(), 'p2'), p3: W.eyesIn(value(), 'p3') };
    await W.markReviewed('p1', ym);
    await W.markReviewed('p2', ym);
    await W.markReviewed('p3', ym);
    const d = value().done[ym];
    ok('a review records what it replaced', d.p2.was && d.p2.was.last === '2025-06-01' && d.p2.was.prev === '2024-11-11' && d.p2.was.by === 'solnichka', JSON.stringify(d.p2));
    ok('...empty for a page never reviewed', d.p1.was && d.p1.was.last === '' && d.p1.was.prev === '' && d.p1.was.by === '', JSON.stringify(d.p1));
    ok('the day stamped is the day of the mark', value().lastReviewed.p1 === d.p1.at.slice(0, 10), value().lastReviewed.p1 + ' vs ' + d.p1.at);
    ok('the four-eyes shift still happens', value().prevReviewed.p2 === '2025-06-01' && value().reviewedBy.p2 === 'schogol');

    // ---- Undo puts it back exactly ----
    taps = 0;
    let r = await W.unreview('p1', ym);
    ok('Undo takes a review back', r.written && !value().done[ym].p1, JSON.stringify(value().done[ym]));
    ok('...a page never reviewed is never-reviewed again', hist('p1') === before.p1, hist('p1'));
    ok('...and the page republishes', taps === 1, String(taps));
    await W.unreview('p2', ym);
    ok("another Lead's reading is theirs again", hist('p2') === before.p2, hist('p2') + ' vs ' + before.p2);
    ok('...so the page counts the same eyes as before', W.eyesIn(value(), 'p2') === eyesBefore.p2);
    await W.unreview('p3', ym);
    ok('my own earlier reading comes back', hist('p3') === before.p3, hist('p3') + ' vs ' + before.p3);
    ok('...with the eyes it had', W.eyesIn(value(), 'p3') === eyesBefore.p3);
    await W.markReviewed('p2', ym);
    ok('an undone page can be reviewed again', value().reviewedBy.p2 === 'schogol' && value().done[ym].p2 && value().done[ym].p2.was.by === 'solnichka');

    // ---- a mark made twice (a stale second tab, a replay of a write that did land) ----
    // It used to be written again, rebuilding the snapshot from the Lead's own stamp, so Undo then left the page
    // counted as read (v3.38.14).
    seed();
    await W.markReviewed('p2', ym);
    let w2 = writes;
    r = await W.markReviewed('p2', ym);
    ok('marking a page again this month writes nothing', !r.written && writes === w2, String(writes - w2));
    await W.unreview('p2', ym);
    ok('...so Undo still restores the history from before the first mark', hist('p2') === before.p2, hist('p2') + ' vs ' + before.p2);
    seed();
    await W.markReviewed('p2', ym);
    w2 = writes;
    r = await W.skip('p2', ym);
    ok('a Skip over my own review this month writes nothing either', !r.written && writes === w2 && !value().done[ym].p2.skipped);
    seed();
    await W.skip('p2', ym);
    w2 = writes;
    r = await W.markReviewed('p2', ym);
    ok('...nor a review over my own Skip: Undo first', !r.written && writes === w2 && value().done[ym].p2.skipped === true);

    // ---- skips ----
    seed();
    await W.skip('p2', ym);
    r = await W.unreview('p2', ym);
    ok('Undo takes a skip back', r.written && !value().done[ym].p2);
    ok("...and never touches the page's history", hist('p2') === before.p2, hist('p2'));

    // ---- what is left alone ----
    seed();
    value().done[ym] = { p2: { by: 'solnichka', at: new Date().toISOString(), was: { last: '', prev: '', by: '' } } };
    let w0 = writes; taps = 0;
    r = await W.unreview('p2', ym);
    ok("another Lead's review is never undone", !r.written && writes === w0 && taps === 0 && hist('p2') === before.p2);
    // A skip never passes the history check, so the ownership check alone has to stop this one.
    value().done[ym].p3 = { by: 'solnichka', at: new Date().toISOString(), skipped: true };
    r = await W.unreview('p3', ym);
    ok("...nor another Lead's skip", !r.written && !!value().done[ym].p3 && writes === w0);

    // A review marked before snapshots existed cannot be put back exactly, so it is not put back at all.
    seed();
    await W.markReviewed('p2', ym);
    delete value().done[ym].p2.was;
    const legacy = hist('p2');
    w0 = writes;
    r = await W.unreview('p2', ym);
    ok('a review without a snapshot is not guessed at', !r.written && writes === w0 && hist('p2') === legacy && !!value().done[ym].p2);

    // Someone else has read the page since: its history no longer ends with my review.
    seed();
    await W.markReviewed('p2', ym);
    value().reviewedBy.p2 = 'lookuptable';
    const moved = hist('p2');
    w0 = writes;
    r = await W.unreview('p2', ym);
    ok('a review another reading has built on stays', !r.written && writes === w0 && hist('p2') === moved);

    seed();
    await W.markReviewed('p2', ym);
    value().lastReviewed.p2 = '2020-01-01';   // a different day than the one this mark stamped
    r = await W.unreview('p2', ym);
    ok('...and so does one whose stamp is no longer the latest', !r.written);

    w0 = writes; taps = 0;
    r = await W.unreview('nope', ym);
    ok('nothing to take back writes nothing', !r.written && writes === w0 && taps === 0);

    // ---- which rows offer Undo ----
    seed();
    await W.markReviewed('p2', ym);
    const mine = value().done[ym].p2;
    ok('your own current review can be undone', W.undoable(mine, value(), 'p2') === true);
    ok('your own skip can be undone', W.undoable({ by: 'schogol', at: 'x', skipped: true }, value(), 'p2') === true);
    ok('a mark still waiting to reach Confluence can be undone', W.undoable({ by: 'schogol', at: 'x', local: true }, value(), 'p9') === true);
    ok("another Lead's review cannot", W.undoable(Object.assign({}, mine, { by: 'solnichka' }), value(), 'p2') === false);
    const noSnap = Object.assign({}, mine); delete noSnap.was;
    ok('a review without a snapshot cannot', W.undoable(noSnap, value(), 'p2') === false);
    const later = JSON.parse(JSON.stringify(value())); later.reviewedBy.p2 = 'lookuptable';
    ok('a review built on since cannot', W.undoable(mine, later, 'p2') === false);
    ok('nothing marked, nothing to undo', W.undoable(null, value(), 'p2') === false);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'wiki undo checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
