// Eval the real JiTA.triage literal out of the file and drive the queue list against a DOM stub. Two things
// are pinned here, because both are invariants rather than looks:
//   1. The list is built by _renderList / _appendRows ONLY. _render runs on every cursor move, so if it ever
//      rebuilds, a four-thousand-item queue means thousands of nodes per keystroke.
//   2. _rows stays index-parallel to _queue across a splice - that mapping is what a click on a card uses,
//      and an action splices the queue out from under it.
// Plus the key remap the whole change is about: up/down walk the list, left/right switch queue.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('JiTA.triage = {');
const e = src.indexOf('\n};', s) + 3;
if (s < 0 || e < 3) { throw new Error('could not slice JiTA.triage'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- DOM stub: only what the list code actually touches ----
let created = 0, scrolls = [];
function makeEl(tag) {
    const e = {
        tagName: tag, className: '', textContent: '', _html: '', children: [], parentNode: null,
        appendChild(c) {
            if (c && c._isFrag) { c.children.forEach(k => { k.parentNode = e; e.children.push(k); }); c.children = []; return c; }
            c.parentNode = e; e.children.push(c); return c;
        },
        removeChild(c) { const i = e.children.indexOf(c); if (i !== -1) { e.children.splice(i, 1); c.parentNode = null; } return c; },
        scrollIntoView(o) { scrolls.push({ el: e, opt: o }); },
        get childNodes() { return e.children; },
        get innerHTML() { return e._html; },
        set innerHTML(v) { e._html = v; e.children = []; }
    };
    return e;
}
const els = { 'jt-queue': makeEl('div'), 'jt-details': makeEl('div') };
global.document = {
    getElementById: (id) => els[id] || null,
    createElement: (t) => { created++; return makeEl(t); },
    createDocumentFragment: () => ({ _isFrag: true, children: [], appendChild(c) { this.children.push(c); return c; } })
};
global.window = {};
global.JITA_IS_FORGE_FRAME = false;
global.JITA_GM_CATEGORIES = ['Gameplay', 'Billing & Account', 'Technical', 'Other'];
const gm = {};
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.$ = () => ({ empty() { return this; }, text() { return this; }, appendTo() { return this; }, on() { return this; } });
global.JiTA = { util: { fmtDate: (iso) => (iso ? String(iso).slice(0, 10) : '') }, ui: { _hideTip() {} } };
eval('global.JiTA.triage = ' + src.slice(s, e - 1) + ';');
const T = global.JiTA.triage;
const realSwitchMode = T._switchMode;   // the key tests stub this out; kept so the real one can be tested below

const item = (k, n) => ({ key: k, summary: 'summary of ' + k, created: '2026-0' + n + '-01T00:00:00.000Z', status: 'Open', att: null, det: null });
function reset(n) {
    els['jt-queue'] = makeEl('div');
    T._queue = []; for (let i = 1; i <= n; i++) { T._queue.push(item('EBR-' + (100 + i), (i % 9) + 1)); }
    T._idx = 0; T._rows = []; T._actRow = null; T._open = true; T._busy = false;
    created = 0; scrolls = [];
}
const q = () => els['jt-queue'];

// ---- building ----
reset(0);
T._renderList();
ok('an empty queue shows a placeholder, not a blank column', /jt-qempty/.test(q().innerHTML) && T._rows.length === 0);

reset(3);
T._renderList();
ok('a card per queue item', T._rows.length === 3 && q().children.length === 3, T._rows.length + ' / ' + q().children.length);
ok('the placeholder is gone once real cards exist', q().innerHTML === '');
ok('the first card is the active one', T._rows[0].className === 'jt-qrow on' && T._rows[1].className === 'jt-qrow');
ok('a card carries its summary, key and status',
    T._rows[0].children[0].textContent === 'summary of EBR-101' &&
    T._rows[0].children[1].children[0].textContent === 'EBR-101' &&
    T._rows[0].children[1].children[1].textContent === 'Open');

// ---- streaming appends ----
const keep = T._rows.slice();
created = 0;
T._queue.push(item('EBR-104', 4), item('EBR-105', 5));
T._appendRows();
ok('a background page appends only its own cards', T._rows.length === 5 && q().children.length === 5);
ok('...and does not touch the cards already on screen', T._rows[0] === keep[0] && T._rows[1] === keep[1] && T._rows[2] === keep[2]);
ok('...building exactly the new ones', created === 2 * 6, created + ' elements for 2 cards');   // 6 nodes per card: row, summary, meta, key, status, date
created = 0;
T._appendRows();
ok('calling it again with nothing new is a no-op', created === 0 && T._rows.length === 5);

// ---- the highlight is O(1) and never rebuilds ----
created = 0; scrolls = [];
T._idx = 3; T._syncActiveRow();
ok('moving the cursor moves the highlight', T._rows[3].className === 'jt-qrow on' && T._rows[0].className === 'jt-qrow');
ok('...builds nothing', created === 0);
ok('...and scrolls the new row into view, nearest-only',
    scrolls.length === 1 && scrolls[0].el === T._rows[3] && scrolls[0].opt && scrolls[0].opt.block === 'nearest',
    JSON.stringify(scrolls.map(x => x.opt)));
scrolls = [];
T._syncActiveRow();
ok('re-syncing the same row does not re-scroll (auto-repeat safety)', scrolls.length === 0);

T._idx = T._queue.length; T._syncActiveRow();
ok('parked past the last item, no card stays highlighted',
    T._rows.filter(r => /\bon\b/.test(r.className)).length === 0, T._rows.map(r => r.className).join('|'));

// ---- splice: the click mapping must survive an action ----
reset(5);
T._renderList();
T._idx = 4;
const third = T._rows[2], fifth = T._rows[4];
T._queue.splice(1, 1); T._removeRow(1); T._idx--;
ok('a spliced item loses its card', T._rows.length === 4 && q().children.length === 4);
ok('rows stay index-parallel to the queue',
    T._rows.every((r, i) => r.children[1].children[0].textContent === T._queue[i].key),
    T._rows.map(r => r.children[1].children[0].textContent).join(',') + ' vs ' + T._queue.map(x => x.key).join(','));
ok('a card resolves to its NEW queue index, not the old one', T._rows.indexOf(third) === 1 && T._queue[1].key === 'EBR-103');
ok('the cursor followed its own item', T._rows[T._idx] === fifth && T._queue[T._idx].key === 'EBR-105');
T._syncActiveRow();
ok('and the highlight lands on it', fifth.className === 'jt-qrow on');

// Removing the ACTIVE row must not leave a dangling highlight reference.
T._queue.splice(T._idx, 1); T._removeRow(T._idx);
ok('removing the active card clears the highlight reference', T._actRow === null);

// ---- _renderList replaces wholesale (the mode-switch path) ----
reset(3);
T._renderList();
T._queue = [item('EO-9', 9)];
T._idx = 0;
T._renderList();
ok('a replaced queue replaces every card', T._rows.length === 1 && q().children.length === 1 &&
    T._rows[0].children[1].children[0].textContent === 'EO-9');

// ---- navigation bounds ----
reset(3);
T._renderList();
let renders = 0;
T._render = function () { renders++; T._syncActiveRow(); };
T._prefetch = function () {};
T._goTo(2); ok('_goTo moves the cursor', T._idx === 2 && renders === 1);
renders = 0; T._goTo(2); ok('_goTo to where you already are is a no-op', renders === 0);
T._goTo(-1); ok('_goTo cannot go below zero', T._idx === 2);
T._goTo(3); ok('_goTo may park on the end-of-queue state', T._idx === 3);
T._goTo(4); ok('_goTo cannot go past it', T._idx === 3);
created = 0;
T._go(-1); T._go(-1);
ok('walking the list never rebuilds it', created === 0 && T._idx === 1, 'created ' + created);

// ---- the key remap ----
function keys(mode) {
    const seen = [];
    reset(3);
    T._renderList();
    T._mode = mode; T._viewerNode = null; T._gmPick = false; T._armed = null;
    T._go = (d) => seen.push('go:' + d);
    T._goTo = (i) => seen.push('goTo:' + i);
    T._switchMode = (to) => seen.push('switch:' + to);
    T._setMsg = (m) => seen.push('msg:' + String(m).slice(0, 80));
    T._toggleTranslate = () => seen.push('translate');
    T._armAttach = (n) => seen.push('attach:' + n);
    T._gmKey = () => seen.push('gm');
    T._arm = (a) => seen.push('arm:' + a.type);
    const press = (k) => T._onKey({ key: k, target: {}, preventDefault() {}, stopImmediatePropagation() {} });
    return { seen, press };
}

let k = keys('ebr');
k.press('ArrowDown'); k.press('ArrowUp');
ok('down and up walk the queue', k.seen.join(' ') === 'go:1 go:-1', k.seen.join(' '));
k = keys('ebr');
k.press('j'); k.press('K');
ok('J and K still do the same', k.seen.join(' ') === 'go:1 go:-1', k.seen.join(' '));
k = keys('ebr');
k.press('ArrowRight'); k.press('ArrowLeft');
ok('right and left switch queue, directionally', k.seen.join(' ') === 'switch:defect switch:ebr', k.seen.join(' '));
k = keys('ebr');
k.press('Home'); k.press('End'); k.press('PageDown'); k.press('PageUp');
ok('Home / End / PageUp / PageDown jump', k.seen.join(' ') === 'goTo:0 goTo:2 goTo:2 goTo:0', k.seen.join(' '));
k = keys('ebr');
k.press('t'); k.press('g'); k.press('e'); k.press('3');
ok('the action keys are untouched', k.seen.join(' ') === 'arm:trash gm translate attach:3', k.seen.join(' '));
k = keys('defect');
k.press('e');
ok('E still refuses on a defect, naming the LEFT arrow now', /msg:T \/ G \/ E act on/.test(k.seen.join(' ')), k.seen.join(' '));

// Navigation must work while parked past the end, so the guard order matters.
k = keys('ebr');
T._idx = T._queue.length;
k.press('ArrowUp'); k.press('ArrowLeft');
ok('navigation and queue switching still work at the end of the queue',
    k.seen.join(' ') === 'go:-1 switch:ebr', k.seen.join(' '));

// The attachment viewer keeps left/right for cycling attachments.
k = keys('ebr');
T._viewerNode = { fake: true };
T._viewerNav = (d) => k.seen.push('viewerNav:' + d);
T._closeViewer = () => k.seen.push('viewerClose');
k.press('ArrowRight'); k.press('ArrowLeft'); k.press('ArrowDown'); k.press('Escape');
ok('with an attachment open, left/right cycle attachments and never switch queue',
    k.seen.join(' ') === 'viewerNav:1 viewerNav:-1 viewerClose', k.seen.join(' '));

// ---- _switchMode is directional: pressing the arrow for the queue you are already in must be inert ----
T._switchMode = realSwitchMode;
T._mode = 'ebr'; T._busy = false;
let acted = false;
T._disarm = () => { acted = true; };   // the first thing the real _switchMode does once it commits
T._switchMode('ebr');
ok('← while already on the bug reports does nothing', !acted && T._mode === 'ebr');
T._busy = true;
T._switchMode('defect');
ok('and neither arrow interrupts an action in flight', !acted && T._mode === 'ebr');

// ---- the resume point is debounced, so a held arrow key is not a GM write per row ----
delete gm.jitaTriageLast;
T._mode = 'ebr'; T._posTimer = null; T._posPending = null;
for (let i = 0; i < 50; i++) { T._rememberPos(item('EBR-' + i, 1)); }
ok('fifty rows scrolled past write nothing yet', gm.jitaTriageLast === undefined);
T._flushPos();
ok('...and the flush writes only the last one', gm.jitaTriageLast && gm.jitaTriageLast.key === 'EBR-49', JSON.stringify(gm.jitaTriageLast));

// ---- each queue owns its JQL: narrowing the defect queue must not touch the bug-report one ----
delete gm.jitaTriageJql; delete gm.jitaTriageDefJql;
T._mode = 'ebr';
ok('an unedited bug-report queue is on its default', T._queueJql() === T.DEFAULT_JQL);
T._mode = 'defect';
ok('an unedited defect queue is on ITS default', T._queueJql() === T.DEFAULT_DEF_JQL, T._queueJql());
ok('the two defaults are different queries', T.DEFAULT_JQL !== T.DEFAULT_DEF_JQL);

// Save while on the defect queue, through the real _saveJql (its reload chain is stubbed out).
T._closeJqlEditor = () => {}; T._setMsg = () => {}; T._renderShell = () => {};
T._fetchQueue = () => Promise.resolve(); T._render = () => {}; T._prefetch = () => {};
T._saveJql('project = EDR AND statusCategory != Done ORDER BY created DESC');
ok('the edit lands under the defect key', gm.jitaTriageDefJql === 'project = EDR AND statusCategory != Done',
    String(gm.jitaTriageDefJql));
ok('a user-typed ORDER BY is stripped (ours is appended)', !/order by/i.test(gm.jitaTriageDefJql || ''));
ok('the bug-report queue is untouched', gm.jitaTriageJql === undefined, String(gm.jitaTriageJql));
T._mode = 'ebr';
ok('and still reads its own default', T._queueJql() === T.DEFAULT_JQL);
T._mode = 'defect';
ok('while the defect queue reads the edit', T._queueJql() === 'project = EDR AND statusCategory != Done');

// Reset stores '' rather than the literal default, so a future default change still reaches this user.
T._saveJql(T.DEFAULT_DEF_JQL);
ok('resetting to the default stores nothing', gm.jitaTriageDefJql === '', String(gm.jitaTriageDefJql));
ok('and the queue falls back to the default', T._queueJql() === T.DEFAULT_DEF_JQL);

// ---- the two report<->report views the funnel offers on the bug-report queue ----
// They are JiTA.ui's own session flags, shared with the panel, so the rules that matter are: they only
// apply where the issue on screen is a REPORT, the column renames itself, and the attach digits go inert
// (a report can only ever be attached to a defect).
global.JiTA.ui.reporterMode = false; global.JiTA.ui.simReportsMode = false;
T._mode = 'ebr';
ok('no view by default', T._view() === null && T._matTitle() === 'Defect matches', T._matTitle());
global.JiTA.ui.simReportsMode = true;
ok('the similar-reports view renames the column', T._view() === 'simreports' && T._matTitle() === 'Similar open reports', T._matTitle());
global.JiTA.ui.simReportsMode = false; global.JiTA.ui.reporterMode = true;
ok('...and so does the reporter view', T._view() === 'reporter' && T._matTitle() === 'Reports by this reporter', T._matTitle());
T._mode = 'defect';
ok('neither applies on the defect queue', T._view() === null && T._matTitle() === 'Matching open bug reports', T._matTitle());

// A digit must not try to attach a report to a report - and must say why rather than doing nothing.
T._mode = 'ebr'; global.JiTA.ui.reporterMode = true;
k = keys('ebr');
k.press('3');
ok('digits are inert while a report view is on', !/attach:/.test(k.seen.join(' ')), k.seen.join(' '));
ok('...and say why', /msg:.*only be attached to a defect/.test(k.seen.join(' ')), k.seen.join(' '));
global.JiTA.ui.reporterMode = false;
k = keys('ebr');
k.press('3');
ok('and work again on the defect matches', k.seen.join(' ') === 'attach:3', k.seen.join(' '));

// The trending view is the exception that proves it: its rows are DEFECTS, so the digits attach there.
global.JiTA.ui.reporterMode = false; global.JiTA.ui.simReportsMode = false; global.JiTA.ui.trendMode = true;
T._mode = 'ebr';
ok('the trending view renames the column', T._view() === 'trending' && T._matTitle() === 'Trending defects', T._matTitle());
k = keys('ebr');
k.press('3');
ok('digits attach in the trending view', k.seen.join(' ') === 'attach:3', k.seen.join(' '));
T._mode = 'defect';
ok('...which does not apply on the defect queue either', T._view() === null && T._matTitle() === 'Matching open bug reports', T._matTitle());
global.JiTA.ui.trendMode = false;

// Double-tap '#' is the same switch on a key: arms on the first tap, flips on the second, re-ranks, and clears the
// report views. The defect queue declines it, naming the key that gets you to the queue that has it.
const realOnFilterChange = T._onFilterChange;
k = keys('ebr');
T._onFilterChange = () => k.seen.push('refilter');
T._lastHash = 0;
global.JiTA.ui.reporterMode = true;
k.press('#');
ok('one # does nothing yet', global.JiTA.ui.trendMode === false && k.seen.length === 0, k.seen.join(' '));
k.press('#');
ok('a double # turns trending on and re-ranks', global.JiTA.ui.trendMode === true && k.seen.join(' ') === 'refilter', k.seen.join(' '));
ok('...turning the report view off', global.JiTA.ui.reporterMode === false);
k.press('#'); k.press('#');
ok('a second double # turns it off again', global.JiTA.ui.trendMode === false && k.seen.join(' ') === 'refilter refilter', k.seen.join(' '));
k.press('#'); T._lastHash = Date.now() - 500; k.press('#');
ok('two slow taps do nothing', global.JiTA.ui.trendMode === false && k.seen.length === 2, k.seen.join(' '));
T._lastHash = 0;
k.press('ArrowDown');
ok('# never eats the next key', /go:1/.test(k.seen.join(' ')), k.seen.join(' '));
k = keys('defect');
T._onFilterChange = () => k.seen.push('refilter');
T._lastHash = 0;
k.press('#'); k.press('#');
ok('the defect queue declines #, naming the left arrow',
    global.JiTA.ui.trendMode === false && /^msg:Trending defects go with the bug-report queue - press ←/.test(k.seen.join(' ')), k.seen.join(' '));
T._onFilterChange = realOnFilterChange;
T._lastHash = 0;

// Switching to the defect queue must drop the view: there is no report on screen to base it on.
T._switchMode = realSwitchMode;
T._mode = 'ebr'; T._busy = false;
global.JiTA.ui.simReportsMode = true;
T._disarm = () => {};
T._closeJqlEditor = () => {}; T._syncModeUi = () => {}; T._renderLegend = () => {};
T._flushPos = () => {}; T._renderShell = () => {}; T._setMsg = () => {};
T._fetchQueue = () => Promise.resolve(); T._trySeekResume = () => true;
global.JiTA.ui.trendMode = true;
T._switchMode('defect');
ok('the defect queue clears the report view', !global.JiTA.ui.simReportsMode && T._view() === null);
ok('and the trending view', global.JiTA.ui.trendMode === false);

// ---- the matches filters: a change must invalidate every ranked list, not just the one on screen ----
// _cache holds one promise per issue, each computed under the OLD filter terms, and _prefetch has already
// filled it for the neighbours. Leaving it would show stale matches for every issue but the current one.
const active = [];
global.JiTA.ui._filtersActive = (ctx) => { active.push(ctx); return false; };
global.$ = () => ({ toggleClass: () => {}, text: () => {}, empty: () => {} });
T._open = true; T._mode = 'ebr';
T._cache = { 'EBR-1': 'stale', 'EBR-2': 'stale', 'EBR-3': 'stale' };
let rendered = 0, prefetched = 0;
T._render = () => { rendered++; };
T._prefetch = () => { prefetched++; };
T._onFilterChange();
ok('a filter change drops every prefetched ranking', Object.keys(T._cache).length === 0, JSON.stringify(T._cache));
ok('and repaints the issue on screen', rendered === 1);
ok('and re-prefetches the neighbours under the new filter', prefetched === 1);

T._open = false; T._cache = { 'EBR-1': 'stale' };
T._onFilterChange();
ok('a change after the overlay closed touches nothing', T._cache['EBR-1'] === 'stale' && rendered === 1);
T._open = true;

// The funnel's Status segment only means something where the candidates are DEFECTS. On the defect queue the
// candidates are open bug reports, which are open by definition - offering Status there would be a lie.
T._mode = 'ebr'; T._syncFilterBtn();
ok('Status counts on the bug-report queue', active[active.length - 1].status === true);
T._mode = 'defect'; T._syncFilterBtn();
ok('...and not on the defect queue', active[active.length - 1].status === false);

// ---- the trending view is not a ranking ----
// _resolve hands back the cached trending rows, narrowed by the filter box, and never asks the ranker: the list is
// the same for every report, so ranking it against one would only reorder what the counts already ordered.
(async () => {
    global.JiTA.ui.reporterMode = false; global.JiTA.ui.simReportsMode = false; global.JiTA.ui.trendMode = true;
    T._mode = 'ebr'; T._cache = {};
    let ranked = 0, termsSeen = null;
    global.JiTA.db = { getDefect: () => Promise.resolve({ summary: 's', description: 'd' }) };
    global.JiTA.util.effectiveText = (r) => r.summary;
    global.JiTA.rank = {
        suggestBest: () => { ranked++; return Promise.resolve({ results: [] }); },
        suggestEbrBest: () => { ranked++; return Promise.resolve({ results: [] }); }
    };
    global.JiTA.trend = {
        rows: () => Promise.resolve({ rows: [{ key: 'EDR-1', summary: 'undock crash', count: 7 }, { key: 'EDR-2', summary: 'warp', count: 5 }], at: 1 }),
        matches: (r, terms) => { termsSeen = terms; return terms.every((t) => (r.key + ' ' + r.summary).toLowerCase().indexOf(t) !== -1); }
    };
    global.JiTA.ui._filterTerms = () => ['undock'];
    const res = await T._resolve(item('EBR-500', 1));
    ok('the trending view never runs the ranker', ranked === 0, String(ranked));
    ok('it hands back the trending rows, narrowed by the filter box',
        res.view === 'trending' && res.results.map((r) => r.key).join(',') === 'EDR-1', JSON.stringify(res.results));
    ok('...using the triage box', termsSeen && termsSeen.join(' ') === 'undock');
    ok('and the report on screen still gets its own text', res.rec && res.rec.description === 'd');
    global.JiTA.ui.trendMode = false;
})().then(() => {
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'triage detail-view checks passed.'));
    process.exit(fail ? 1 : 0);
}, (x) => { console.log('CRASH', x && x.stack || x); process.exit(2); });
