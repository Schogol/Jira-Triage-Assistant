// dv-check.js - pins JiTA.dv (the detail view) by slicing the REAL literal out of the userscript and running
// it against stubs. Covers the query text (ORDER BY split, sort, basic filters -> JQL), the persisted state,
// mode switching, the arrow-key guard, stepping + navigation throttle, the router fallback, the page chain
// (stale responses, pagination, quiet refresh), the seek for the open issue, the cache and the host finder.
// Point JITA_SRC at another build to run it against that file.
'use strict';
const fs = require('fs');
const SRC = process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js');
const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name); } }
function eq(a, b, name) { const good = JSON.stringify(a) === JSON.stringify(b); ok(good, name + (good ? '' : '   got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))); }
function section(t) { console.log('\n' + t); }

// ---- stubs ------------------------------------------------------------------------------------------------------
let store = {};
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? JSON.parse(JSON.stringify(store[k])) : d);
global.gmSet = (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
global.flagOn = () => true;
global.JITA_NO_JIRA_UI = false;
global.issueItem = 'CRUMB';
global.SELECTORS = { VC_DETAILS_GROUP: 'DETAILS_GROUP' };
global.GM_addStyle = () => {};

let pushed = [], pops = [], assigned = [];
global.location = { pathname: '/browse/EBR-1', assign: (p) => { assigned.push(p); } };
global.history = { pushState: (s, t, p) => { pushed.push(p); location.pathname = p; } };
global.PopStateEvent = function (type, init) { this.type = type; this.state = init ? init.state : undefined; };
let confirmAnswer = false, confirmAsked = 0;
global.window = {
    dispatchEvent: (ev) => { pops.push(ev.type); return true; },
    innerWidth: 1600, innerHeight: 900,
    confirm: () => { confirmAsked++; return confirmAnswer; },
    getComputedStyle: () => ({ paddingLeft: '0px', paddingTop: '0px' })
};
global.sessionStorage = {
    _m: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; }
};
let domSel = {};   // selector -> element returned by document.querySelector
let qsaSel = {};   // selector -> function returning the array document.querySelectorAll gives
const BODY = { tag: 'BODY' }, HTML = { tag: 'HTML' };
global.document = {
    body: BODY, documentElement: HTML,
    querySelector: (sel) => (Object.prototype.hasOwnProperty.call(domSel, sel) ? domSel[sel] : null),
    querySelectorAll: (sel) => (Object.prototype.hasOwnProperty.call(qsaSel, sel) ? qsaSel[sel]() : []),
    getElementById: () => null
};
let menuOpen = false, viewerOpen = false;
global.JiTA = {
    HOST: 'https://example.invalid',
    triage: { DEFAULT_JQL: 'project = EBR AND status = Open' },
    menu: { isOpen: () => menuOpen },
    ui: { _attachmentViewerOpen: () => viewerOpen }
};

// fake clock: setTimeout / clearTimeout / Date.now under test control
let now = 5000000, tid = 0, timers = [];
const realSetImmediate = setImmediate;
global.setTimeout = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; };
global.clearTimeout = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) { timers.splice(i, 1); } };
Date.now = () => now;
function advance(ms) {
    const end = now + ms;
    for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) { break; }
        timers.shift(); now = t.at; t.fn();
    }
    now = end;
}
const flush = () => new Promise((r) => realSetImmediate(r));
async function settle() { for (let i = 0; i < 8; i++) { await flush(); } }

// ---- slice the real literal -------------------------------------------------------------------------------------
const s0 = src.indexOf('\nJiTA.dv = {');
if (s0 < 0) { console.log('FAIL  JiTA.dv not found in ' + SRC); process.exit(1); }
const e0 = src.indexOf('\n};\n', s0) + 3;
(0, eval)(src.slice(s0 + 1, e0));
const D = JiTA.dv;
const PRISTINE = Object.assign({}, D);

// DOM-facing pieces are exercised in the browser; here they are counted, not run.
let renders = { bar: 0, head: 0, list: 0, foot: 0, rows: 0, crumb: 0, active: 0 };
function quietDom() {
    D._renderBar = () => { renders.bar++; };
    D._renderHead = () => { renders.head++; };
    D._renderList = () => { renders.list++; };
    D._renderFoot = () => { renders.foot++; };
    D._appendRows = () => { renders.rows++; };
    D._renderCrumbNav = () => { renders.crumb++; };
    D._syncActive = () => { renders.active++; };
    D._closePop = () => {};
}
function reset() {
    Object.keys(PRISTINE).forEach((k) => { D[k] = PRISTINE[k]; });
    D._issues = []; D._index = {}; D._optCache = {}; D._state = null;
    quietDom();
    store = {}; pushed = []; pops = []; assigned = []; timers = []; domSel = {}; qsaSel = {};
    sessionStorage._m = {}; confirmAnswer = false; confirmAsked = 0; menuOpen = false; viewerOpen = false;
    location.pathname = '/browse/EBR-1';
    renders = { bar: 0, head: 0, list: 0, foot: 0, rows: 0, crumb: 0, active: 0 };
    now += 100000;
}
function list(keys) { D._issues = keys.map((k) => ({ key: k, summary: k })); D._reindex(); }

// Scriptable _post: every call is recorded and answered later by the test.
let posts = [];
function scriptPost() {
    posts = [];
    D._post = (path, body) => new Promise((resolve, reject) => { posts.push({ path, body, resolve, reject }); });
}
const jqlPosts = () => posts.filter((p) => p.path === '/rest/api/3/search/jql');
const countPosts = () => posts.filter((p) => p.path === '/rest/api/3/search/approximate-count');
const issues = (keys) => keys.map((k) => ({ key: k, fields: { summary: 'S ' + k } }));

(async function main() {
    // ---- 1. query text ------------------------------------------------------------------------------------------
    section('1. query text');
    reset();
    eq(D._q('a"b\\c'), '"a\\"b\\\\c"', 'a JQL literal escapes quotes and backslashes');
    eq(D._splitOrder('project = EBR ORDER BY created DESC'), { where: 'project = EBR', order: 'created DESC' }, 'ORDER BY splits off');
    eq(D._splitOrder('project = EBR order  by key'), { where: 'project = EBR', order: 'key' }, 'lower case and double space still split');
    eq(D._splitOrder('summary ~ "order by x" ORDER BY key'), { where: 'summary ~ "order by x"', order: 'key' }, 'an ORDER BY inside quotes is not the order clause');
    eq(D._splitOrder('summary ~ "sort order by date" ORDER BY key'), { where: 'summary ~ "sort order by date"', order: 'key' }, '...even mid-string, after a space');
    eq(D._splitOrder("summary ~ 'a \\' order by' ORDER BY rank"), { where: "summary ~ 'a \\' order by'", order: 'rank' }, 'an escaped quote does not end the string');
    eq(D._splitOrder('labels = recorder BY x'), { where: 'labels = recorder BY x', order: '' }, '"recorder" is not "order"');
    eq(D._splitOrder('(a = 1)ORDER BY x'), { where: '(a = 1)', order: 'x' }, 'ORDER BY straight after a parenthesis splits');
    eq(D._splitOrder('ORDER BY created DESC'), { where: '', order: 'created DESC' }, 'an order-only query has an empty where');
    eq(D._splitOrder('project = EBR'), { where: 'project = EBR', order: '' }, 'no ORDER BY, no order');
    eq(D._join('a = 1', 'key'), 'a = 1 ORDER BY key', 'join where + order');
    eq(D._join('', 'key'), 'ORDER BY key', 'join with no where');
    eq(D._join('a = 1', ''), 'a = 1', 'join with no order');
    eq(D._withSort('a = 1 ORDER BY created DESC, key', 'updated', 'ASC'), 'a = 1 ORDER BY updated ASC', 'a new sort replaces the whole order clause');
    eq(D._withSort('a = 1', 'key', 'DESC'), 'a = 1 ORDER BY key DESC', 'a sort is added to a query without one');

    section('2. sort label');
    eq(D._sortOf('a ORDER BY created DESC'), { field: 'created', dir: 'DESC', label: 'Created' }, 'known field, explicit direction');
    eq(D._sortOf('a ORDER BY Priority'), { field: 'priority', dir: 'ASC', label: 'Priority' }, 'field is case-insensitive, direction defaults to ASC');
    eq(D._sortOf('a ORDER BY "Story Points" desc, key'), { field: '"Story Points"', dir: 'DESC', label: 'Story Points' }, 'a quoted custom field shows unquoted, first term only');
    eq(D._sortOf('a ORDER BY cf[10001] ASC'), { field: 'cf[10001]', dir: 'ASC', label: 'cf[10001]' }, 'an unknown field shows as written');
    eq(D._sortOf('a = 1'), null, 'no order, no sort');

    section('3. basic filters -> JQL');
    eq(D._buildWhere(D._emptyBasic()), '', 'no filters, no where');
    eq(D._buildWhere({ project: [{ v: 'EBR', l: 'EVE Bug Reports' }], status: [{ v: 'Open', l: 'Open' }, { v: 'In "QA"', l: 'x' }] }),
        'project in ("EBR") AND status in ("Open", "In \\"QA\\"")', 'values are quoted, a quote inside one is escaped');
    eq(D._buildWhere({ assignee: [{ v: 'currentUser()', l: 'Current user' }, { v: 'EMPTY', l: 'Unassigned' }, { v: '5b10:abc', l: 'Kim' }] }),
        'assignee in (currentUser(), EMPTY, "5b10:abc")', 'currentUser() and EMPTY stay bare, an account id is quoted');
    eq(D._buildWhere({ type: [{ v: 'EVE Bug Report', l: 'EVE Bug Report' }], text: '  crash on "undock" ' }),
        'issuetype in ("EVE Bug Report") AND text ~ "crash on \\"undock\\""', 'type and text search, text trimmed and escaped');
    ok(D._basicEmpty(D._emptyBasic()) && D._basicEmpty({ text: '   ' }) && !D._basicEmpty({ status: [{ v: 'Open' }] }), 'basicEmpty tells empty from set');

    // ---- 4. persisted state --------------------------------------------------------------------------------------
    section('4. persisted state');
    reset();
    let st = D._load();
    eq([st.mode, st.jql], ['jql', 'project = EBR AND status = Open ORDER BY created DESC'], 'first run starts on the Triage backlog query, newest first');
    eq(st.basic, D._emptyBasic(), 'first run has empty basic filters');
    reset();
    store[D.STATE_KEY] = { mode: 'weird', jql: 'a = 1', basic: { text: 5, project: 'x' } };
    st = D._load();
    eq([st.mode, st.basic.text, st.basic.project, st.basic.status], ['jql', '', [], []], 'a damaged stored state is repaired, not trusted');
    reset();
    store[D.STATE_KEY] = { jql: 42 };
    eq(D._load().jql, 'project = EBR AND status = Open ORDER BY created DESC', 'a state without a string query falls back to the default');

    // ---- 5. mode switching ----------------------------------------------------------------------------------------
    section('5. Basic / JQL switching');
    let runs = 0;
    reset(); D._run = () => { runs++; }; runs = 0;
    store[D.STATE_KEY] = { mode: 'basic', jql: 'status in ("Open") ORDER BY key', basic: { text: '', project: [], assignee: [], type: [], status: [{ v: 'Open', l: 'Open' }] } };
    D._setMode('jql');
    eq([D._load().mode, D._load().jql], ['jql', 'status in ("Open") ORDER BY key'], 'to JQL: the box shows the query the basic filters built');
    D._setMode('basic');
    eq([D._load().mode, confirmAsked, runs], ['basic', 0, 0], 'back to Basic on an untouched query: no question, no re-run');
    reset(); D._run = () => { runs++; }; runs = 0;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR AND labels not in (x) ORDER BY key DESC', basic: { text: '', project: [], assignee: [], type: [], status: [{ v: 'Open', l: 'Open' }] } };
    D._setMode('basic');
    eq([D._load().mode, D._load().jql, confirmAsked, runs], ['basic', 'project = EBR AND labels not in (x) ORDER BY key DESC', 0, 0], 'free JQL -> Basic: no question, the query is untouched, nothing re-runs');
    eq([D._load().scope && D._load().scope.where, D._load().basic], ['project = EBR AND labels not in (x)', D._emptyBasic()], '...it becomes the scope, and the stale basic filters go');
    reset(); D._run = () => { runs++; }; runs = 0;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'ORDER BY key', basic: { text: 'x', project: [{ v: 'EBR', l: 'EBR' }], assignee: [], type: [], status: [] }, scope: { where: 'x = 1', name: 'Old', id: '4' } };
    D._setMode('basic');
    eq([D._load().mode, confirmAsked, D._load().basic, D._load().scope], ['basic', 0, D._emptyBasic(), null], 'an empty JQL goes to Basic with no question, no stale filters and no stale scope');

    section('6. edits');
    reset(); D._run = () => { runs++; }; runs = 0;
    store[D.STATE_KEY] = { mode: 'basic', jql: 'status in ("Open") ORDER BY key DESC', basic: { text: '', project: [], assignee: [], type: [], status: [{ v: 'Open', l: 'Open' }] }, filterName: 'Mine' };
    D._toggleBasic('project', { v: 'EBR', l: 'EVE Bug Reports' }, true);
    eq(D._load().jql, 'project in ("EBR") AND status in ("Open") ORDER BY key DESC', 'ticking a project rebuilds the query and keeps the order');
    eq(D._load().filterName, '', 'editing drops the starred-filter name');
    ok(runs === 0, 'the query waits for the debounce...');
    D._toggleBasic('status', { v: 'Open', l: 'Open' }, false);
    advance(D.RUN_DEBOUNCE_MS);
    eq(runs, 1, '...and two quick ticks run it once');
    eq(D._load().jql, 'project in ("EBR") ORDER BY key DESC', 'unticking removes the value');
    const barsBefore = renders.bar;
    D._setText('  undock  ', false);
    eq([D._load().basic.text, runs, renders.bar - barsBefore], ['undock', 2, 0], 'text search runs WITHOUT re-rendering the bar under the typing');
    D._setText('undock', true);
    eq(runs, 3, 'Enter on unchanged text refreshes');
    D._setSort('updated', 'DESC');
    eq(D._load().jql, 'project in ("EBR") AND text ~ "undock" ORDER BY updated DESC', 'the sort menu rewrites only the order');
    D._setJql('  key = EBR-9  ');
    eq([D._load().jql, runs], ['key = EBR-9', 5], 'JQL is trimmed and run');
    D._useFilter({ id: '1', name: 'Backlog', jql: 'project = EDR ' });
    eq([D._load().mode, D._load().jql, D._load().filterName, D._load().scope.where], ['basic', 'project = EDR', 'Backlog', 'project = EDR'], 'a starred filter keeps the mode, remembers its name, and in Basic becomes the scope');
    ok(store[D.STATE_KEY] && store[D.STATE_KEY].jql === 'project = EDR', 'every edit is persisted');

    // ---- 7. arrow-key guard --------------------------------------------------------------------------------------
    section('7. arrow keys only when nothing else owns them');
    reset();
    const el = (tag, roles, ce) => ({ nodeType: 1, tagName: tag, isContentEditable: !!ce,
        closest: (sel) => ((roles || []).some((r) => sel.indexOf('[role="' + r + '"]') !== -1) ? {} : null) });
    ok(D._keysFree(el('DIV')), 'a plain element: free');
    ok(D._keysFree(el('BODY')), 'the page body: free');
    ok(D._keysFree(el('A', [])), 'one of our own cards: free');
    ok(!D._keysFree(el('INPUT')), 'an input: not ours');
    ok(!D._keysFree(el('TEXTAREA')), 'a textarea: not ours');
    ok(!D._keysFree(el('SELECT')), 'a select: not ours');
    ok(!D._keysFree(el('DIV', [], true)), 'the comment editor (contenteditable): not ours');
    ok(!D._keysFree(el('DIV', ['menu'])), 'inside a menu: not ours');
    ok(!D._keysFree(el('DIV', ['listbox'])), 'inside a list box: not ours');
    ok(!D._keysFree(el('DIV', ['grid'])), 'inside a grid: not ours');
    ok(!D._keysFree(el('DIV', ['tablist'])), 'inside a tab list: not ours');
    domSel['[role="dialog"][aria-modal="true"]'] = {};
    ok(!D._keysFree(el('DIV')), 'a Jira modal is open: not ours');
    delete domSel['[role="dialog"][aria-modal="true"]'];
    menuOpen = true; ok(!D._keysFree(el('DIV')), 'a JiTA overlay is open: not ours'); menuOpen = false;
    viewerOpen = true; ok(!D._keysFree(el('DIV')), 'the attachment viewer is open: not ours'); viewerOpen = false;
    let stepped = [];
    D._step = (d) => { stepped.push(d); };
    D._mounted = true;
    const key = (k, extra) => Object.assign({ key: k, target: el('DIV'), defaultPrevented: false, prevented: 0, preventDefault() { this.prevented++; } }, extra || {});
    let ev = key('ArrowDown'); D._onKey(ev);
    eq([stepped, ev.prevented], [[1], 1], 'Down steps forward and stops the page scrolling');
    ev = key('ArrowUp'); D._onKey(ev);
    eq(stepped, [1, -1], 'Up steps back');
    [key('ArrowDown', { shiftKey: true }), key('ArrowDown', { ctrlKey: true }), key('ArrowDown', { altKey: true }), key('ArrowDown', { defaultPrevented: true }),
        key('ArrowLeft'), key('j')].forEach((e) => D._onKey(e));
    eq(stepped, [1, -1], 'modifiers, a key Jira already handled, and other keys are left alone');
    D._pop = {}; D._onKey(key('ArrowDown')); D._pop = null;
    store[D.STATE_KEY] = null; D._state = null; D._load().collapsed = true; D._onKey(key('ArrowDown')); D._load().collapsed = false;
    D._mounted = false; D._onKey(key('ArrowDown')); D._mounted = true;
    eq(stepped, [1, -1], 'not while a popover is open, the list is hidden, or the view is not mounted');

    // ---- 8. stepping and navigation --------------------------------------------------------------------------------
    section('8. stepping and the navigation throttle');
    reset();
    list(['EBR-1', 'EBR-2', 'EBR-3', 'EBR-4', 'EBR-5']);
    D._activeKey = 'EBR-1'; D._lastLoc = 'EBR-1';
    D._step(1);
    eq([D._activeKey, pushed, pops], ['EBR-2', ['/browse/EBR-2'], ['popstate']], 'one Down: highlight, push the URL, tell the router');
    advance(D.STEP_MS + 1);
    eq(pushed.length, 1, 'a single press navigates exactly once');
    advance(D.STEP_MS * 3);
    pushed = []; pops = [];
    D._step(1); advance(40); D._step(1); advance(40); D._step(1); advance(40); D._step(1);
    eq(D._activeKey, 'EBR-5', 'held key: the highlight moves on every repeat');
    eq(pushed, ['/browse/EBR-3'], 'held key: only the first repeat navigates at once');
    advance(D.STEP_MS);
    eq(pushed, ['/browse/EBR-3', '/browse/EBR-5'], 'held key: one trailing navigation to where the highlight ended');
    reset();
    list(['EBR-1', 'EBR-2']);
    D._activeKey = 'EBR-1';
    D._step(-1);
    eq([D._activeKey, pushed], ['EBR-1', []], 'Up on the first issue does nothing');
    D._activeKey = 'EDR-9';
    D._step(-1);
    eq([D._activeKey, pushed], ['EBR-1', []], 'the open issue is not in the list: a key starts at the top (already there, no load)');
    advance(D.STEP_MS + 1);
    location.pathname = '/browse/EDR-9'; D._lastNav = 0;
    D._activeKey = 'EDR-9';
    D._step(1);
    eq([D._activeKey, pushed], ['EBR-1', ['/browse/EBR-1']], 'not in the list, Down: the first issue');
    reset();
    list(['EBR-1', 'EBR-2']);
    D._activeKey = 'EBR-2'; D._more = false;
    D._step(1);
    eq(pushed, [], 'Down on the last issue of a finished list does nothing');
    D._more = true;
    D._page = () => { list(['EBR-1', 'EBR-2', 'EBR-3']); D._more = false; return Promise.resolve(); };
    D._step(1);
    await settle();
    eq([D._activeKey, pushed], ['EBR-3', ['/browse/EBR-3']], 'Down past the loaded end loads the next page, then moves');
    reset();
    list(['EBR-1', 'EBR-2']);
    D._activeKey = 'EBR-1'; D._stepTimer = 7;
    D._select('EBR-2', 'click');
    eq([D._stepTimer, pushed], [null, ['/browse/EBR-2']], 'a click navigates at once and cancels a pending key step');

    section('9. the router fallback');
    reset();
    domSel.CRUMB = { textContent: 'EBR-1' };
    D._nav('EBR-2');
    eq([pushed, assigned], [['/browse/EBR-2'], []], 'a switch pushes and waits');
    domSel.CRUMB.textContent = 'EBR-2';
    advance(D.NAV_FALLBACK_MS);
    eq([assigned, sessionStorage.getItem(D.SPA_FAIL_KEY)], [[], null], 'the breadcrumb reached the new key: no reload, nothing counted');
    reset();
    domSel.CRUMB = { textContent: 'EBR-1' };
    D._nav('EBR-2');
    advance(D.NAV_FALLBACK_MS);
    eq([assigned, sessionStorage.getItem(D.SPA_FAIL_KEY)], [['/browse/EBR-2'], '1'], 'the router ignored it: an ordinary page load, counted');
    reset();
    domSel.CRUMB = { textContent: 'EBR-1' };
    D._nav('EBR-2');
    location.pathname = '/browse/EBR-7';
    advance(D.NAV_FALLBACK_MS);
    eq(assigned, [], 'the user moved on before the deadline: nothing to rescue');
    reset();
    sessionStorage.setItem(D.SPA_FAIL_KEY, String(D.SPA_FAIL_MAX));
    D._nav('EBR-2');
    eq([pushed, assigned], [[], ['/browse/EBR-2']], 'after SPA_FAIL_MAX fallbacks in a row the tab goes straight to page loads');
    reset();
    sessionStorage.setItem(D.SPA_FAIL_KEY, '1');
    domSel.CRUMB = { textContent: 'EBR-1' };
    D._nav('EBR-2');
    domSel.CRUMB.textContent = 'EBR-2';
    advance(D.NAV_FALLBACK_MS);
    eq(sessionStorage.getItem(D.SPA_FAIL_KEY), null, 'a switch that works clears the count');
    reset();
    D._nav('EBR-1');
    eq([pushed, pops], [[], []], 'navigating to the issue already open does nothing');

    section('10. following the URL');
    reset();
    let seeks = 0;
    D._seek = () => { seeks++; };
    location.pathname = '/browse/EBR-4';
    D._syncFromLocation();
    eq([D._activeKey, seeks], ['EBR-4', 1], 'a URL change from outside (Back, a linked issue) moves the highlight and looks for it');
    D._syncFromLocation();
    eq(seeks, 1, 'the same URL twice is one reaction');
    D._activeKey = 'EBR-6'; D._stepTimer = 3;
    location.pathname = '/browse/EBR-5';
    D._syncFromLocation();
    eq(D._activeKey, 'EBR-6', 'while an arrow key is held the highlight leads the URL and is not pulled back');
    reset();
    D._seek = () => { seeks++; }; seeks = 0;
    D._nav('EBR-3');
    D._syncFromLocation();
    eq(seeks, 0, 'our own navigation is not mistaken for an outside one');
    ok(D._locKey() === 'EBR-3', 'the key is read from /browse/<KEY>');
    location.pathname = '/browse/ebr-12/';
    ok(D._locKey() === 'EBR-12', 'lower case and a trailing slash still read as the key');
    location.pathname = '/jira/your-work';
    ok(D._locKey() === null, 'off /browse/ there is no key (and ensure() unmounts)');

    // ---- 11. the page chain ----------------------------------------------------------------------------------------
    section('11. the page chain');
    reset(); scriptPost();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR ORDER BY created DESC' };
    D._run(false);
    eq([jqlPosts().length, countPosts().length], [1, 1], 'a run asks for page one and the count');
    eq(jqlPosts()[0].body, { jql: 'project = EBR ORDER BY created DESC', fields: D.FIELDS, maxResults: D.PAGE_SIZE }, 'page one carries the query, no token');
    eq(countPosts()[0].body, { jql: 'project = EBR' }, 'the count is asked without the order');
    D._page(D._gen);
    eq(jqlPosts().length, 1, 'asking again while a page is in flight does not send a second request');
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']), nextPageToken: 'T2' });
    countPosts()[0].resolve({ count: 4 });
    await settle();
    eq([D._issues.map((i) => i.key), D._more, D._total], [['EBR-1', 'EBR-2'], true, 4], 'page one lands, more to come, total known');
    ok(store[D.CACHE_KEY] && store[D.CACHE_KEY].jql === 'project = EBR ORDER BY created DESC' && store[D.CACHE_KEY].issues.length === 2, 'the first pages are cached for the next page load');
    D._page(D._gen);
    eq(jqlPosts()[1].body.nextPageToken, 'T2', 'the next page sends the token');
    jqlPosts()[1].resolve({ issues: issues(['EBR-2', 'EBR-3']) });
    await settle();
    eq([D._issues.map((i) => i.key), D._more], [['EBR-1', 'EBR-2', 'EBR-3'], false], 'a duplicate across pages is dropped; no token = the end');
    D._page(D._gen);
    eq(jqlPosts().length, 2, 'past the end nothing more is asked');

    reset(); scriptPost();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR' };
    D._run(false);
    const firstGen = jqlPosts()[0];
    D._load().jql = 'project = EDR';
    D._run(false);
    firstGen.resolve({ issues: issues(['EBR-1']) });
    await settle();
    eq(D._issues.length, 0, 'a late answer to a replaced query is thrown away');
    jqlPosts()[1].resolve({ issues: issues(['EDR-1']) });
    await settle();
    eq(D._issues.map((i) => i.key), ['EDR-1'], 'the current query lands');

    reset(); scriptPost();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR' };
    list(['OLD-1', 'OLD-2']);
    D._run(true);
    eq(D._issues.map((i) => i.key), ['OLD-1', 'OLD-2'], 'a quiet refresh keeps the rows on screen while it loads');
    jqlPosts()[0].resolve({ issues: issues(['EBR-9']) });
    await settle();
    eq(D._issues.map((i) => i.key), ['EBR-9'], '...and replaces them when page one arrives');

    reset(); scriptPost();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR' };
    D._run(false);
    jqlPosts()[0].reject(new Error('Field "projct" does not exist.'));
    countPosts()[0].reject(new Error('x'));
    await settle();
    eq([D._issues.length, D._error], [0, 'Field "projct" does not exist.'], 'a bad query shows Jira\'s own message');

    reset(); scriptPost();
    store[D.STATE_KEY] = { mode: 'basic', jql: 'ORDER BY created DESC' };
    D._run(false);
    ok(posts.length === 0 && /Pick a filter/.test(D._error), 'no filters: no request (Jira refuses unbounded queries), a hint instead');

    section('12. finding the open issue deeper in the list');
    reset(); scriptPost(); D._mounted = true;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR ORDER BY key' };
    D._activeKey = 'EBR-77';
    D._run(false);
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']), nextPageToken: 'T2' });
    await settle();
    eq(countPosts().map((p) => p.body.jql), ['project = EBR', '(project = EBR) AND key = "EBR-77"'], 'not loaded yet: Jira is asked once whether the query holds it');
    countPosts()[1].resolve({ count: 0 });
    await settle();
    eq(jqlPosts().length, 1, 'the query does not hold it: no paging');
    D._seek();
    eq(countPosts().length, 2, 'and it is not asked again for this query');

    reset(); scriptPost(); D._mounted = true;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR ORDER BY key' };
    D._activeKey = 'EBR-5';
    D._run(false);
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']), nextPageToken: 'T2' });
    await settle();
    countPosts()[1].resolve({ count: 1 });
    await settle();
    eq(jqlPosts().length, 2, 'the query holds it: the next page is loaded');
    jqlPosts()[1].resolve({ issues: issues(['EBR-3', 'EBR-4']), nextPageToken: 'T3' });
    await settle();
    eq(jqlPosts().length, 3, '...and the next, until it turns up');
    jqlPosts()[2].resolve({ issues: issues(['EBR-5', 'EBR-6']), nextPageToken: 'T4' });
    await settle();
    eq([jqlPosts().length, D._index['EBR-5']], [3, 4], 'found: paging stops there, even with more pages left');

    reset(); scriptPost(); D._mounted = true;
    D.FIND_MAX = 4;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR ORDER BY key' };
    D._activeKey = 'EBR-99';
    D._run(false);
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']), nextPageToken: 'T2' });
    await settle();
    countPosts()[1].resolve({ count: 1 });
    await settle();
    jqlPosts()[1].resolve({ issues: issues(['EBR-3', 'EBR-4']), nextPageToken: 'T3' });
    await settle();
    eq(jqlPosts().length, 2, 'the search stops at FIND_MAX loaded issues');

    reset(); scriptPost(); D._mounted = true;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR ORDER BY key' };
    D._activeKey = 'EBR-5';
    D._run(false);
    jqlPosts()[0].resolve({ issues: issues(['EBR-1']), nextPageToken: 'T2' });
    await settle();
    D._activeKey = 'EBR-1';   // the user moved on before the answer came back
    countPosts()[1].resolve({ count: 1 });
    await settle();
    eq(jqlPosts().length, 1, 'the user moved to another issue meanwhile: the search is dropped');

    // A page that fails mid-search (Jira down, the session expired) used to be asked for again at once, and again,
    // for as long as it kept failing (v3.38.7).
    reset(); scriptPost(); D._mounted = true;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR ORDER BY key' };
    D._activeKey = 'EBR-9';
    D._run(false);
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']), nextPageToken: 'T2' });
    await settle();
    countPosts()[1].resolve({ count: 1 });
    await settle();
    jqlPosts()[1].reject(new Error('HTTP 401'));
    await settle();
    eq(jqlPosts().length, 2, 'a page that fails mid-search is not asked for again in a loop');

    reset(); scriptPost(); D._mounted = true;
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EBR ORDER BY key' };
    D._activeKey = 'EBR-9';
    D._run(false);
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']), nextPageToken: 'T2' });
    await settle();
    countPosts()[1].resolve({ count: 1 });
    await settle();
    D._mounted = false;   // the user left the issue view while page two was on its way
    jqlPosts()[1].resolve({ issues: issues(['EBR-3', 'EBR-4']), nextPageToken: 'T3' });
    await settle();
    eq(jqlPosts().length, 2, 'once the list is gone, the search pages no further');

    // ---- 13. cache, mapping, errors --------------------------------------------------------------------------------
    section('13. cache, mapping and errors');
    reset();
    const c = { jql: 'a', at: now, total: 3, issues: [{ key: 'EBR-1' }] };
    ok(D._cacheOk(c, 'a'), 'a fresh cache of the same query is used');
    ok(!D._cacheOk(c, 'b'), 'another query\'s cache is not');
    ok(!D._cacheOk(Object.assign({}, c, { at: now - D.CACHE_MAX_MS - 1 }), 'a'), 'a stale cache is not');
    ok(!D._cacheOk(Object.assign({}, c, { issues: [] }), 'a') && !D._cacheOk(null, 'a'), 'an empty or missing cache is not');
    eq(D._map({ key: 'EBR-1', fields: { summary: 'S', issuetype: { name: 'EVE Bug Report', iconUrl: 'i' }, assignee: { displayName: 'Kim', avatarUrls: { '24x24': 'a24', '32x32': 'a32' } } } }),
        { key: 'EBR-1', summary: 'S', type: 'EVE Bug Report', icon: 'i', who: 'Kim', avatar: 'a24' }, 'an issue maps to a card');
    eq(D._map({ key: 'EBR-2', fields: {} }), { key: 'EBR-2', summary: '', type: '', icon: '', who: '', avatar: '' }, 'an unassigned, bare issue maps without errors');
    eq(D._errText({ status: 400, responseJSON: { errorMessages: ['Bad JQL.'], errors: { jql: 'Near "x".' } } }), 'Bad JQL. Near "x".', 'Jira\'s own error messages are shown');
    ok(/logged in/.test(D._errText({ status: 401 })), 'a 401 says to check the login');
    eq(D._errText({ status: 502 }), 'Jira did not answer (HTTP 502).', 'anything else names the status');
    eq(D._uniq([{ name: 'Open' }, { name: 'open' }, { name: 'Closed', icon: 'x' }, {}]).map((o) => o.v), ['Closed', 'Open'], 'types / statuses are deduplicated by name and sorted');

    // ---- 14. the host --------------------------------------------------------------------------------------------
    section('14. the element that gets padded');
    reset();
    function node(name, rect, parent) {
        const n = { name, rect, parentElement: parent || null, kids: [], isConnected: true, attrs: {},
            getBoundingClientRect() { return this.rect; },
            contains(o) { for (let x = o; x; x = x.parentElement) { if (x === this) { return true; } } return false; },
            removeAttribute(k) { delete this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; },
            style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } } };
        return n;
    }
    const R = (l, t, w) => ({ left: l, top: t, width: w, right: l + w, bottom: t + 800, height: 800 });
    const page = node('page', R(0, 0, 1600), BODY);
    const main = node('main', R(240, 48, 1360), page);
    const wrap = node('wrap', R(240, 48, 1360), main);
    const layout = node('layout', R(240, 48, 1360), wrap);
    const left = node('left', R(240, 48, 900), layout);
    const crumb = node('crumb', R(260, 60, 80), left);
    const right = node('right', R(1140, 48, 460), layout);
    const slot = node('slot', R(1150, 60, 440), right);
    domSel.CRUMB = crumb;
    domSel['[data-vc="issue-view-context-items-details-panel-slot"]'] = slot;
    let host = D._findHost();
    eq(host && host.name, 'main', 'the lowest box holding breadcrumb and Details, widened to its same-box wrappers - not the page');
    D._host = host;
    layout.rect = R(540, 96, 1060); wrap.rect = R(540, 96, 1060);   // what our own padding does to the inner boxes
    eq(D._findHost().name, 'main', 'once chosen it is kept, so our own padding cannot make it move');
    host.isConnected = false;
    host.attrs['data-jita-dv-host'] = '1';
    const main2 = node('main2', R(240, 48, 1360), page);
    layout.parentElement = main2; layout.rect = R(240, 48, 1360);
    eq([D._findHost().name, host.attrs['data-jita-dv-host']], ['main2', undefined], 'Jira replaced it: the new one is found and the old one released');
    reset();
    domSel.CRUMB = crumb;
    eq(D._findHost(), null, 'no Details panel yet: nothing to pad (the next tick retries)');


    // ---- 15. a first-time issue loading (Jira swaps the layout for a skeleton) ----------------------------
    section('15. placement while a first-time issue loads');
    reset();
    const styleStub = () => ({ props: {}, cssText: '', setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } });
    HTML.style = styleStub(); HTML.clientHeight = 900;
    const els = { 'jdv-bar': { style: styleStub(), hidden: false }, 'jdv-col': { style: styleStub(), hidden: false }, 'jdv-rail': { style: styleStub(), hidden: true } };
    const realGetById = document.getElementById;
    document.getElementById = (id) => els[id] || null;
    const box = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });
    const hostEl = { isConnected: true, rect: box(240, 48, 1360, 800), getBoundingClientRect() { return this.rect; } };
    D._mounted = true; D._host = hostEl;
    D._place();
    eq([els['jdv-bar'].style.cssText, D._geo], ['left:240px;top:48px;width:1360px;height:48px;', { left: 240, top: 48, width: 1360 }], 'a usable host box places the bar and records the geometry');
    const placedBar = els['jdv-bar'].style.cssText, placedCol = els['jdv-col'].style.cssText;
    hostEl.isConnected = false; hostEl.rect = box(0, 0, 0, 0); D._placed = '';
    D._place();
    eq([els['jdv-bar'].style.cssText, els['jdv-col'].style.cssText, D._geo.left], [placedBar, placedCol, 240], 'a host Jira swapped out (empty box) moves nothing - the list stays where it was');
    hostEl.isConnected = true; hostEl.rect = box(240, 48, 0, 800); D._placed = '';
    D._place();
    eq(els['jdv-bar'].style.cssText, placedBar, 'a connected host with no width (hidden mid-render) moves nothing either');

    reset();
    let probe = null;
    const mk = (rect, parent, ours) => ({ rect, parentElement: parent || null, getBoundingClientRect() { return this.rect; }, closest: (sel) => (ours && /#jdv-/.test(sel) ? {} : null) });
    const skel = mk(box(240, 48, 1360, 800), BODY);
    const inner = mk(box(600, 140, 400, 20), mk(box(512, 100, 900, 600), skel));
    document.elementFromPoint = (x, y) => { probe = [x, y]; return inner; };
    D._geo = { left: 240, top: 48, width: 1360 };
    ok(D._standIn() === skel, 'the element now filling the old box (the skeleton container) stands in for the host');
    eq(probe, [240 + D._colW() + (1360 - D._colW()) / 2, 48 + D.BAR_H + 40], 'the probe point is inside the host area, clear of our own bar and list');
    skel.rect = box(300, 48, 1300, 800);
    ok(D._standIn() === null, 'nothing with the same box: no stand-in, the list just stays put');
    skel.rect = box(240, 48, 1360, 800);
    document.elementFromPoint = () => mk(box(0, 0, 10, 10), skel, true);
    ok(D._standIn() === null, 'a probe that lands on our own chrome is not mistaken for Jira\'s layout');
    D._geo = null;
    ok(D._standIn() === null, 'with no earlier good geometry there is nothing to match against');
    delete document.elementFromPoint;

    reset();
    let adopted = null, standCalls = 0, mounts = 0;
    D._findHost = () => null;
    D._standIn = () => { standCalls++; return skel; };
    D._adopt = (h) => { adopted = h; };
    D._place = () => {}; D._syncFromLocation = () => {};
    D._mount = () => { mounts++; D._mounted = true; };
    D._mounted = true;
    D.ensure();
    ok(adopted === skel, 'mounted and the breadcrumb is gone (loading): ensure() pads the stand-in');
    D._mounted = false; adopted = null; standCalls = 0;
    D.ensure();
    eq([adopted, standCalls, mounts], [null, 0, 0], 'not mounted yet: no stand-in - the first mount waits for the real issue view');
    document.getElementById = realGetById;

    // ---- 16. stacking level --------------------------------------------------------------------------------
    section('16. the list stacks at the host\'s level, not above Jira\'s menus');
    reset();
    const csOf = new Map();
    const realCs = window.getComputedStyle;
    window.getComputedStyle = (n) => Object.assign({ zIndex: 'auto', position: 'static', display: 'block', paddingLeft: '0px', paddingTop: '0px' }, csOf.get(n) || {});
    const zn = (parent, cs) => { const n = { parentElement: parent }; if (cs) { csOf.set(n, cs); } return n; };
    let root = zn(BODY, { position: 'relative', zIndex: '1' });
    let mainEl = zn(root, { position: 'relative' });
    let hostZ = zn(mainEl);
    eq(D._rootZ(hostZ), 1, 'the outermost ancestor with an explicit z-index sets the level');
    eq(D._rootZ(zn(zn(BODY))), 0, 'no explicit z-index anywhere: level 0');
    const outer = zn(BODY, { position: 'relative', zIndex: '2' });
    eq(D._rootZ(zn(zn(outer, { position: 'absolute', zIndex: '50' }))), 2, 'a high z-index nested inside a lower context does not lift the level');
    const flexParent = zn(BODY, { display: 'flex' });
    eq(D._rootZ(zn(zn(flexParent, { zIndex: '5' }))), 5, 'a z-index on a static flex item counts (it forms a stacking context)');
    eq(D._rootZ(zn(zn(zn(BODY), { zIndex: '7' }))), 0, 'a z-index on a static block element does nothing and is ignored');
    eq(D._rootZ(zn(zn(BODY, { position: 'relative', zIndex: '-1' }))), 0, 'a negative level is floored at 0');
    HTML.style = styleStub();
    const adoptHost = { parentElement: root, style: styleStub(), setAttribute() {} };
    D._adopt(adoptHost);
    eq(HTML.style.props['--jdv-z'], '1', 'adopting a host publishes its level as --jdv-z');
    window.getComputedStyle = realCs;


    // ---- 17. where previous / next go ---------------------------------------------------------------------
    section('17. prev / next sit in the breadcrumb row, not under the key');
    {
    reset();
    const cn = (left, parent) => ({ parentElement: parent || null, getBoundingClientRect() { return { left: left, top: 0, width: 10, height: 10 }; } });
    const pg = cn(0, BODY);
    const crumbRow = cn(600, pg);                // "Spaces / EVE Bug Reports / Add parent / [icon] EBR-69744"
    const keyWrap = cn(1105, crumbRow);            // the key's own wrapper: icon + key, stacked vertically in Jira
    const keyLink = cn(1128, keyWrap);             // the current-issue anchor
    let slot = D._crumbSlot(keyLink);
    ok(slot && slot.row === crumbRow, 'the row is the first container reaching well left of the key');
    ok(slot && slot.after === keyWrap, '...and the buttons go after the key\'s whole item, not inside it');
    ok(!(slot && slot.row === keyWrap), 'the key\'s own wrapper (only its icon to the left) is never taken for the row');
    eq(D._crumbSlot(cn(1128, cn(1105, cn(1100, BODY)))), null, 'no container reaches left of the key: no buttons rather than buttons somewhere odd');
    }

    // ---- 18. Jira's own filter links load into the list ---------------------------------------------------
    section('18. a filter clicked in Jira\'s sidebar loads into the list');
    {
    location.origin = 'https://example.invalid';
    location.href = 'https://example.invalid/browse/EBR-1';
    const FL = (h) => D._filterLink(h);
    eq(FL('/issues/?filter=10404'), { id: '10404' }, 'a saved filter link gives its id');
    eq(FL('/issues/?filter=-1'), { id: '-1' }, 'a system (default) filter keeps its negative id');
    eq(FL('/issues/?jql=project%20%3D%20EBR'), { jql: 'project = EBR' }, 'a raw query link gives its JQL, decoded');
    eq(FL('/issues/?filter=10404&jql=status%3DOpen'), { jql: 'status=Open' }, 'an edited filter (id + jql) runs what the link shows, not the saved query');
    eq(FL('https://elsewhere.invalid/issues/?filter=1'), null, 'another site\'s link is never taken');
    eq(FL('/browse/EBR-9?filter=1'), null, 'an issue link is never taken, whatever its query says');
    eq(FL('/jira/filters'), null, '"View all filters" (no query) keeps going to Jira');
    eq(FL('/issues/'), null, '"Search work items" (no query) keeps going to Jira');
    eq(FL('/issues/?filter=abc'), null, 'a non-numeric filter id is not a filter');
    eq(FL('/issues/?jql=%20%20'), null, 'an empty jql is not a query');

    // clicks
    const anchor = (href, text, extra) => Object.assign({
        nodeType: 1, href: 'https://example.invalid' + href, target: '', textContent: text || '', ours: false,
        closest(sel) { return sel === 'a[href]' ? this : (this.ours ? this : null); }
    }, extra || {});
    const click = (target, extra) => {
        const ev = Object.assign({ target, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
            defaultPrevented: false, prevented: 0, stopped: 0,
            preventDefault() { this.prevented++; this.defaultPrevented = true; }, stopPropagation() { this.stopped++; } }, extra || {});
        D._onLinkClick(ev);
        return ev;
    };
    let opened = [];
    const spyOpen = () => { opened = []; D._openLink = (link, name, href) => { opened.push({ link, name, href }); return Promise.resolve(); }; };

    reset(); spyOpen(); D._mounted = false; store[D.TAKE_KEY] = false;
    let ev = click(anchor('/issues/?filter=10404', 'BH - Schogol - Worklist'));
    ok(!ev.prevented && !opened.length, 'no detail view on screen and the option off: Jira\'s link works as ever');

    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=10404', '  BH -  Schogol\n - Worklist '));
    ok(ev.prevented === 1 && ev.stopped === 1, 'with the detail view up, a sidebar filter click is taken before Jira sees it');
    eq(opened.length && opened[0].link, { id: '10404' }, '...and handed on as that filter');
    eq(opened.length && opened[0].name, 'BH - Schogol - Worklist', '...named by its visible text, whitespace tidied');
    eq(opened.length && opened[0].href, 'https://example.invalid/issues/?filter=10404', '...with its href kept for the fallback');

    [['ctrlKey', 'Ctrl'], ['metaKey', 'Cmd'], ['shiftKey', 'Shift'], ['altKey', 'Alt']].forEach(([k, label]) => {
        reset(); spyOpen(); D._mounted = true;
        const e2 = click(anchor('/issues/?filter=10404', 'x'), { [k]: true });
        ok(!e2.prevented && !opened.length, label + '-click keeps its browser meaning (new tab / window)');
    });
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=10404', 'x'), { button: 1 });
    ok(!ev.prevented && !opened.length, 'a non-left button is left alone');
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=10404', 'x'), { defaultPrevented: true });
    ok(!ev.prevented && !opened.length, 'a click something else already handled is left alone');
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=10404', 'x', { target: '_blank' }));
    ok(!ev.prevented && !opened.length, 'a link that opens its own tab is left alone');
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=10404', 'x', { ours: true }));
    ok(!ev.prevented && !opened.length, 'a link inside our own bar / list / popovers is not re-handled here');
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/browse/EBR-5', 'EBR-5'));
    ok(!ev.prevented && !opened.length, 'an ordinary issue link is not taken');
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=-4', 'All work items'));
    ok(!ev.prevented && !opened.length, '"All work items" (unbounded, which the search API refuses) still goes to Jira\'s navigator');
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=-99', 'Mystery'));
    ok(!ev.prevented && !opened.length, 'a system filter we have no JQL for is left to Jira');
    reset(); spyOpen(); D._mounted = true;
    ev = click(anchor('/issues/?filter=-1', 'My open work items'));
    ok(ev.prevented === 1 && opened.length === 1, 'a known default filter is taken');
    reset(); spyOpen(); D._mounted = true;
    const a1 = anchor('/issues/?filter=10404', 'Nested');
    const span = { nodeType: 1, closest: (sel) => (sel === 'a[href]' ? a1 : null) };
    ev = click(span);
    ok(ev.prevented === 1 && opened.length === 1, 'a click on the label inside the link counts');
    reset(); spyOpen(); D._mounted = true;
    ev = click({ nodeType: 3, parentElement: span });
    ok(ev.prevented === 1 && opened.length === 1, '...and so does one reported on a text node');

    // resolving what was clicked
    let used = [];
    const spyUse = () => { used = []; D._useFilter = (f) => { used.push(f); }; };
    const scriptGet = () => { const gets = []; D._get = (path) => new Promise((resolve, reject) => { gets.push({ path, resolve, reject }); }); return gets; };

    reset(); spyUse();
    await D._openLink({ id: '-1' }, 'whatever the link said', 'https://example.invalid/issues/?filter=-1');
    eq(used, [{ jql: D.SYSTEM_FILTERS['-1'][1], name: 'My open work items', id: '-1' }], 'a default filter runs Jira\'s own JQL under its own name, with no request');
    ok(/currentUser\(\)/.test(D.SYSTEM_FILTERS['-1'][1]) && /resolution = Unresolved/.test(D.SYSTEM_FILTERS['-1'][1]), '"My open work items" is mine and unresolved');
    ok(!Object.prototype.hasOwnProperty.call(D.SYSTEM_FILTERS, '-4'), 'there is deliberately no JQL for "All work items"');
    ok(Object.keys(D.SYSTEM_FILTERS).every((k) => D._splitOrder(D.SYSTEM_FILTERS[k][1]).where), 'every default filter we do take is a bounded query');

    reset(); spyUse();
    await D._openLink({ jql: 'project = EDR' }, 'ignored', 'h');
    eq(used, [{ jql: 'project = EDR', name: '' }], 'a raw query link runs as written, unnamed');

    reset(); spyUse();
    let gets = scriptGet();
    let p = D._openLink({ id: '10404' }, 'Link text', 'https://example.invalid/issues/?filter=10404');
    eq(gets.map((g) => g.path), ['/rest/api/3/filter/10404'], 'a saved filter is read from Jira (the sidebar only knows its id)');
    gets[0].resolve({ id: '10404', name: 'BH - All open Defects', jql: 'project = EDR AND statusCategory != Done' });
    await p;
    eq(used, [{ jql: 'project = EDR AND statusCategory != Done', name: 'BH - All open Defects', id: '10404' }], '...and runs under the name Jira has for it');
    eq(assigned, [], '...without any page load');

    reset(); spyUse(); gets = scriptGet();
    p = D._openLink({ id: '555' }, 'Gone', 'https://example.invalid/issues/?filter=555');
    gets[0].reject(new Error('HTTP 404'));
    await p;
    eq(used, [], 'an unreadable filter changes nothing in the list');
    eq(assigned, ['https://example.invalid/issues/?filter=555'], '...and the click still goes where it was going: Jira\'s navigator');

    reset(); spyUse(); gets = scriptGet();
    p = D._openLink({ id: '556' }, 'Blank', 'https://example.invalid/issues/?filter=556');
    gets[0].resolve({ id: '556', name: 'No query' });
    await p;
    ok(!used.length && assigned.length === 1, 'a filter that comes back without JQL falls back the same way');

    reset(); spyUse(); gets = scriptGet();
    p = D._openLink({ id: '10404' }, 'Slow', 'https://example.invalid/issues/?filter=10404');
    await D._openLink({ id: '-2' }, '', 'h2');
    gets[0].resolve({ name: 'Slow', jql: 'project = SLOW' });
    await p;
    eq(used.map((u) => u.name), ['Reported by me'], 'a slow read never overwrites the filter clicked after it');
    reset(); spyUse(); gets = scriptGet();
    p = D._openLink({ id: '10404' }, 'Slow', 'https://example.invalid/issues/?filter=10404');
    await D._openLink({ jql: 'key = EBR-1' }, '', 'h2');
    gets[0].reject(new Error('HTTP 500'));
    await p;
    eq(assigned, [], '...and a stale failed read does not navigate away from the newer one');

    reset(); spyUse();
    store[D.STATE_KEY] = { mode: 'basic', jql: 'project = EBR ORDER BY created DESC', basic: null, filterName: '', collapsed: true };
    D._state = null;
    await D._openLink({ id: '-6' }, '', 'h');
    ok(D._load().collapsed === false, 'a collapsed list opens up when a filter is picked for it');

    // end to end through the real _useFilter
    reset(); scriptPost(); gets = scriptGet();
    p = D._openLink({ id: '10404' }, '', 'h');
    gets[0].resolve({ name: 'BH - Schogol - Worklist', jql: 'assignee = currentUser() ORDER BY updated DESC' });
    await p;
    const st = D._load();
    ok(st.mode === 'jql' && st.jql === 'assignee = currentUser() ORDER BY updated DESC', 'the list switches to that filter\'s JQL');
    eq(st.filterName, 'BH - Schogol - Worklist', '...the Saved filters button names it');
    eq(store[D.STATE_KEY] && store[D.STATE_KEY].jql, 'assignee = currentUser() ORDER BY updated DESC', '...it is remembered for the next /browse/ page');
    ok(jqlPosts().length === 1 && jqlPosts()[0].body.jql === 'assignee = currentUser() ORDER BY updated DESC', '...and the list is fetched for it');
    ok(/window\.addEventListener\('click', D\._onLinkClick, true\)/.test(src), 'the click hook sits on the window, in the capture phase (ahead of Jira\'s router)');
    }


    // ---- 19. the sidebar entry the list came from is highlighted -------------------------------------------
    section('19. the sidebar entry the list came from gets Jira\'s highlight');
    {
    location.origin = 'https://example.invalid';
    location.href = 'https://example.invalid/browse/EBR-1';
    const attrs = () => ({
        _a: {},
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._a, k); },
        setAttribute(k, v) { this._a[k] = String(v); },
        removeAttribute(k) { delete this._a[k]; }
    });
    const row = () => { const r = attrs(); r._a['data-selected'] = 'false'; return r; };   // Jira's menu-item container
    const link = (href, parent, ours) => Object.assign(attrs(), {
        href: 'https://example.invalid' + href, parentElement: parent || null,
        closest() { return ours ? this : null; }
    });
    let all = [];
    const sidebar = () => {
        const rStar = row(), rDef = row(), rOther = row(), bare = attrs();
        const links = [
            link('/issues/?filter=10404', rStar),              // Starred: BH - Schogol - Worklist
            link('/issues/?filter=-1', rDef),                  // Default filters: My open work items
            link('/issues/?filter=20000', rOther),             // some other filter
            link('/issues/?filter=10404&jql=status%3DOpen', row()),   // an edited query is not "that filter"
            link('/issues/?filter=10404', row(), true)         // a link inside our own UI
        ];
        const plain = link('/issues/?filter=10404', bare);     // an anchor with no Jira row around it
        links.push(plain);
        all = links.concat(links.map((a) => a.parentElement)).concat([bare]);
        qsaSel['a[href*="filter="]'] = () => links;
        qsaSel['[data-jita-dv-current]'] = () => all.filter((e) => e && e.hasAttribute && e.hasAttribute('data-jita-dv-current'));
        return { rStar, rDef, rOther, links, plain, bare };
    };
    const lit = () => all.filter((e) => e && e.hasAttribute && e.hasAttribute('data-jita-dv-current'));

    reset(); scriptPost();
    let sb = sidebar();
    D._mounted = true;
    D._useFilter({ id: 10404, name: 'BH - Schogol - Worklist', jql: 'assignee = currentUser()' });
    eq(D._load().filterId, '10404', 'picking a filter remembers which one it is (a numeric id from the starred list too)');
    ok(sb.rStar.hasAttribute('data-jita-dv-current'), 'its sidebar row is highlighted - the row Jira\'s own selection styles, not just the link');
    ok(!sb.links[0].hasAttribute('data-jita-dv-current'), '...the anchor inside it is left alone');
    ok(sb.bare.hasAttribute('data-jita-dv-current') === false && sb.plain.hasAttribute('data-jita-dv-current'), 'an anchor with no Jira row around it is highlighted itself');
    ok(!sb.rDef.hasAttribute('data-jita-dv-current') && !sb.rOther.hasAttribute('data-jita-dv-current'), 'no other filter lights up');
    ok(!sb.links[3].parentElement.hasAttribute('data-jita-dv-current'), 'a link carrying an edited query does not count as that filter');
    ok(!sb.links[4].parentElement.hasAttribute('data-jita-dv-current'), 'a link inside our own UI is never marked');

    D._useFilter({ id: '-1', name: 'My open work items', jql: 'assignee = currentUser() AND resolution = Unresolved' });
    ok(sb.rDef.hasAttribute('data-jita-dv-current') && !sb.rStar.hasAttribute('data-jita-dv-current'), 'switching filters moves the highlight');
    D._markSidebar(); D._markSidebar();
    eq(lit().length, 1, 'marking again changes nothing (one row lit, however often the observer ticks)');

    D._setSort('updated', 'DESC');
    D._markSidebar();
    ok(sb.rDef.hasAttribute('data-jita-dv-current'), 'sorting a filter\'s list keeps it that filter');

    D._setJql('project = EBR ORDER BY created DESC');
    eq(D._load().filterId, '', 'typing a query by hand drops the filter id');
    D._markSidebar();
    eq(lit().length, 0, '...and with it the highlight');

    reset(); scriptPost(); sb = sidebar(); D._mounted = true;
    D._useFilter({ id: '10404', name: 'W', jql: 'x = 1' });
    D._setMode('basic');
    D._toggleBasic('project', { v: 'EBR', l: 'EBR' }, true);
    D._markSidebar();
    ok(D._load().filterId === '10404' && sb.rStar.hasAttribute('data-jita-dv-current'), 'a basic filter narrowing the filter keeps it lit - the list is still inside it');
    reset(); scriptPost(); sb = sidebar(); D._mounted = true;
    D._useFilter({ id: '10404', name: 'W', jql: 'x = 1' });
    D._setMode('basic');
    D._setText('crash', true);
    eq(D._load().filterId, '10404', 'so does searching within it');
    D._dropScope();
    D._markSidebar();
    ok(D._load().filterId === '' && lit().length === 0, 'dropping the scope drops it: the search now runs over all work');
    reset(); scriptPost(); sb = sidebar(); D._mounted = true;
    D._useFilter({ jql: 'project = EDR', name: '' });
    eq(lit().length, 0, 'a raw query link (no id) highlights nothing');

    reset(); scriptPost(); sb = sidebar(); D._mounted = true;
    D._useFilter({ id: '10404', name: 'W', jql: 'x = 1' });
    const st2 = D._load(); st2.collapsed = true;
    D._markSidebar();
    eq(lit().length, 0, 'a collapsed list lights nothing (no list on screen to belong to)');
    st2.collapsed = false;
    D._markSidebar();
    ok(sb.rStar.hasAttribute('data-jita-dv-current'), '...and relights when it opens again');

    reset(); scriptPost(); sb = sidebar(); D._mounted = true;
    D._useFilter({ id: '10404', name: 'W', jql: 'x = 1' });
    if (!HTML.style) { HTML.style = { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } }; }
    D.unmount();
    eq(lit().length, 0, 'leaving /browse/ (unmount) clears the highlight');

    reset();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'x = 1', basic: null, filterName: 'Old pick', collapsed: false };
    D._state = null;
    eq(D._load().filterId, '', 'a state saved before this version loads with no id (nothing lit until a filter is picked again)');
    }

    // ---- 20. picking a filter opens the first issue of its list ---------------------------------------------------
    section('20. picking a filter opens the first issue of its list');
    {
    const pick = (jql, id) => D._useFilter({ jql: jql || 'project = EDR ORDER BY created DESC', name: 'F', id: id || '1' });

    reset(); scriptPost(); D._mounted = true;
    pick();
    eq(pushed, [], 'nothing moves before the list is there');
    jqlPosts()[0].resolve({ issues: issues(['EDR-5', 'EDR-6']) });
    await settle();
    eq([pushed, D._activeKey], [['/browse/EDR-5'], 'EDR-5'], 'page one lands: its first issue opens and is highlighted');

    reset(); scriptPost(); D._mounted = true;
    pick('project = EBR');
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']) });
    await settle();
    eq([pushed, D._activeKey], [[], 'EBR-1'], 'the first issue is the one already open: highlighted, no reload');

    reset(); scriptPost(); D._mounted = true;
    pick();
    jqlPosts()[0].resolve({ issues: [] });
    await settle();
    eq(pushed, [], 'an empty filter leaves the open issue where it is');

    reset(); scriptPost(); D._mounted = true;
    pick();
    location.pathname = '/browse/EBR-7';   // the user followed a link before the list came back
    jqlPosts()[0].resolve({ issues: issues(['EDR-5']) });
    await settle();
    eq(pushed, [], 'someone who moved on before page one landed is not pulled back');

    reset(); scriptPost(); D._mounted = true;
    pick();
    D._mounted = false;
    jqlPosts()[0].resolve({ issues: issues(['EDR-5']) });
    await settle();
    eq(pushed, [], 'nothing opens once the detail view is gone');

    reset(); scriptPost(); D._mounted = true;
    pick();
    D._setJql('project = EBR ORDER BY key');   // typed over the pick before its answer came
    jqlPosts()[0].resolve({ issues: issues(['EDR-5']) });
    jqlPosts()[1].resolve({ issues: issues(['EBR-3']) });
    await settle();
    eq(pushed, [], 'a query typed before page one lands is the user\'s own: no jump for it');

    reset(); scriptPost(); D._mounted = true;
    D._load().jql = 'project = EBR ORDER BY key';
    D._setJql('project = EDR ORDER BY key');
    jqlPosts()[0].resolve({ issues: issues(['EDR-5']) });
    await settle();
    eq(pushed, [], 'running hand-typed JQL keeps the open issue');
    D._setSort('created', 'DESC');
    jqlPosts()[1].resolve({ issues: issues(['EDR-9']) });
    await settle();
    eq(pushed, [], 'so does re-sorting');
    D._run(true);
    jqlPosts()[2].resolve({ issues: issues(['EDR-8']) });
    await settle();
    eq(pushed, [], 'and so does Refresh');

    reset(); scriptPost(); D._mounted = true;
    pick('project = EBR');
    jqlPosts()[0].resolve({ issues: issues(['EBR-1', 'EBR-2']), nextPageToken: 'T2' });
    await settle();
    D._select('EBR-2', 'key');   // walking down while the list is still paging in
    D._page(D._gen);
    jqlPosts()[1].resolve({ issues: issues(['EBR-3']) });
    await settle();
    eq(D._activeKey, 'EBR-2', 'later pages never snap the highlight back to the top');

    reset(); scriptPost(); D._mounted = true;
    await D._openLink({ id: '-1' }, '', 'h');
    jqlPosts()[0].resolve({ issues: issues(['EBR-40']) });
    await settle();
    eq(pushed, ['/browse/EBR-40'], 'a filter clicked in Jira\'s sidebar opens its first issue too');
    }

    // ---- 21. "Open filters in the detail view": filter clicks taken on every Jira page ------------------------------
    section('21. with the option on, a filter click on any Jira page opens its first issue in the detail view');
    {
    location.origin = 'https://example.invalid';
    location.href = 'https://example.invalid/issues/?filter=10323';
    const anchor = (href, text) => ({
        nodeType: 1, href: 'https://example.invalid' + href, target: '', textContent: text || '',
        closest(sel) { return sel === 'a[href]' ? this : null; }
    });
    const click = (target, extra) => {
        const ev = Object.assign({ target, button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
            defaultPrevented: false, prevented: 0, stopped: 0,
            preventDefault() { this.prevented++; this.defaultPrevented = true; }, stopPropagation() { this.stopped++; } }, extra || {});
        D._onLinkClick(ev);
        return ev;
    };
    let toasts = [];
    JiTA.ui.toast = (m) => { toasts.push(m); };
    const offPage = (v) => { reset(); scriptPost(); location.pathname = '/issues/'; toasts = []; if (v !== undefined) { store[D.TAKE_KEY] = v; } };
    const HREF = 'https://example.invalid/issues/?filter=-1';

    offPage();
    ok(D._takeAll(), 'the option is on by default');
    ok(D._takeOn(), '...and the switch in Settings reads it the same way');

    offPage(false);
    ok(!D._takeAll(), 'switched off, it reads as off');
    let ev = click(anchor('/issues/?filter=-1', 'My open work items'));
    ok(!ev.prevented && !jqlPosts().length, 'off: a filter click away from an issue page stays with Jira');

    offPage(true);
    ok(D._takeAll(), 'switched on, it reads as on');
    D._activeKey = 'EBR-1';   // left over from the last issue page this tab showed
    ev = click(anchor('/issues/?filter=-1', 'My open work items'));
    ok(ev.prevented === 1 && ev.stopped === 1, 'on: the click is taken before Jira sees it, with no detail view on screen');
    eq(D._load().jql, D.SYSTEM_FILTERS['-1'][1], '...the filter becomes the list query');
    eq(pushed, [], '...but nothing opens before page one is in');
    jqlPosts()[0].resolve({ issues: issues(['EBR-50', 'EBR-51']), nextPageToken: 'T2' });
    await settle();
    eq([pushed, D._activeKey], [['/browse/EBR-50'], 'EBR-50'], 'page one lands: its first issue opens and is highlighted');
    eq(assigned, [], '...without a page load');
    ok(D._runJql === D._load().jql && D._issues.length === 2, '...the list is in memory for the detail view to mount with');
    ok(store[D.CACHE_KEY] && store[D.CACHE_KEY].issues.length === 2, '...and cached, should the router fall back to a page load');
    eq(countPosts().length, 1, 'the issue open before is not searched for in the new list');

    ['ctrlKey', 'shiftKey', 'metaKey'].forEach((k) => {
        offPage(true);
        const e2 = click(anchor('/issues/?filter=-1', 'x'), { [k]: true });
        ok(!e2.prevented, k + ' keeps its browser meaning with the option on too');
    });
    offPage(true);
    global.flagOn = () => false;
    ev = click(anchor('/issues/?filter=-1', 'x'));
    global.flagOn = () => true;
    ok(!ev.prevented, 'with the detail view itself switched off, the option does nothing');
    offPage(true);
    ev = click(anchor('/issues/?filter=-4', 'All work items'));
    ok(!ev.prevented, '"All work items" still goes to the Jira search page');
    offPage(true);
    ev = click(anchor('/jira/filters', 'View all filters'));
    ok(!ev.prevented, 'a link with no query is left alone');

    offPage(true);
    D._openLink({ id: '-1' }, '', HREF);
    jqlPosts()[0].resolve({ issues: [] });
    await settle();
    eq([pushed, assigned], [[], [HREF]], 'an empty filter has no issue to open: it goes to the Jira search page');

    offPage(true);
    D._openLink({ id: '-1' }, '', HREF);
    jqlPosts()[0].reject(new Error('HTTP 500'));
    await settle();
    eq([pushed, assigned], [[], [HREF]], 'so does one whose list fails to load');

    offPage(true);
    const gets = [];
    D._get = (path) => new Promise((resolve, reject) => { gets.push({ path, resolve, reject }); });
    D._openLink({ id: '10323' }, 'BH Filter List', 'https://example.invalid/issues/?filter=10323');
    gets[0].resolve({ id: '10323', name: 'BH Filter List', jql: 'project = EBR ORDER BY created DESC' });
    await settle();
    jqlPosts()[0].resolve({ issues: issues(['EBR-69750']) });
    await settle();
    eq(pushed, ['/browse/EBR-69750'], 'a saved filter is read, then its first issue opens');
    eq([D._load().filterName, D._load().filterId], ['BH Filter List', '10323'], '...under its own name, and lit in the sidebar once mounted');

    offPage(true);
    D._openLink({ id: '-1' }, '', HREF);
    D._openLink({ id: '-2' }, '', 'https://example.invalid/issues/?filter=-2');
    jqlPosts()[0].resolve({ issues: issues(['EBR-1']) });
    await settle();
    eq([pushed, assigned], [[], []], 'two clicks in a row: the earlier one, answered first, neither opens nor falls back');
    jqlPosts()[1].resolve({ issues: issues(['EBR-2']) });
    await settle();
    eq(pushed, ['/browse/EBR-2'], '...only the later one opens');

    offPage(true);
    D._openLink({ id: '-1' }, '', HREF);
    location.pathname = '/browse/EBR-9';   // the user opened an issue themselves meanwhile
    jqlPosts()[0].resolve({ issues: issues(['EBR-1']) });
    await settle();
    eq([pushed, assigned], [[], []], 'someone who reached an issue on their own is left there');

    offPage(true);
    D._openLink({ id: '-1' }, '', HREF);
    advance(D.TAKE_TOAST_MS);
    eq(toasts.length, 1, 'a slow page one says what is happening');
    ok(toasts.length === 1 && toasts[0].indexOf('My open work items') >= 0, '...naming the filter');
    jqlPosts()[0].resolve({ issues: issues(['EBR-1']) });
    await settle();
    offPage(true);
    D._openLink({ id: '-1' }, '', HREF);
    jqlPosts()[0].resolve({ issues: issues(['EBR-1']) });
    await settle();
    advance(D.TAKE_TOAST_MS + 100);
    eq(toasts, [], 'a fast one shows nothing');

    reset(); scriptPost(); D._mounted = true; store[D.TAKE_KEY] = true;
    D._activeKey = 'EBR-1';
    D._openLink({ id: '-1' }, '', HREF);
    eq(D._activeKey, 'EBR-1', 'with the list on screen, the open issue stays highlighted while the filter loads');
    jqlPosts()[0].resolve({ issues: issues(['EBR-60']) });
    await settle();
    eq(pushed, ['/browse/EBR-60'], '...and its first issue opens exactly once');

    ok(src.indexOf('try { JiTA.dv._bindGlobal(); }') >= 0, 'the click hook is bound when the page loads, not only when the list mounts');
    }

    // ---- 22. Basic narrows a filter's query instead of replacing it ----------------------------------------------
    section('22. Basic mode searches within a filter, however complex its JQL');
    {
    const DEFECTS = 'project IN (EDR, EO, PLAT) AND issuetype = Defect';
    const ORDER = ' ORDER BY created DESC, key ASC';
    const pick = () => D._useFilter({ id: '10500', name: 'BH - All Defects', jql: DEFECTS + ORDER });
    const fresh = () => { reset(); D._run = () => { runs++; }; runs = 0; };

    fresh(); pick();
    eq([D._load().mode, runs], ['jql', 1], 'a filter picked in JQL mode loads in JQL mode');
    D._setMode('basic');
    let st = D._load();
    eq([st.mode, st.jql, runs, confirmAsked], ['basic', DEFECTS + ORDER, 1, 0], 'to Basic: no question, the query untouched, nothing re-runs');
    eq(st.scope, { where: DEFECTS, name: 'BH - All Defects', id: '10500' }, '...the filter query becomes the scope, under the filter name');
    eq([st.filterName, st.filterId, st.basic], ['BH - All Defects', '10500', D._emptyBasic()], '...still that filter, every basic filter off');
    D._setText('frigate', true);
    eq(D._load().jql, '(' + DEFECTS + ') AND text ~ "frigate"' + ORDER, 'the search box narrows the filter and keeps its order');
    eq([runs, D._load().filterName, D._load().filterId], [2, 'BH - All Defects', '10500'], '...runs, and the list is still that filter');
    D._toggleBasic('status', { v: 'Open', l: 'Open' }, true);
    eq(D._load().jql, '(' + DEFECTS + ') AND status in ("Open") AND text ~ "frigate"' + ORDER, 'a chip narrows it too, the scope bracketed once');
    const narrowed = D._load().jql;
    D._setMode('jql');
    D._setMode('basic');
    st = D._load();
    eq([st.jql, st.basic.text, st.basic.status.length, st.scope.where], [narrowed, 'frigate', 1, DEFECTS], 'to JQL and back changes nothing: the box showed exactly what Basic built');
    D._setText('', true);
    D._toggleBasic('status', { v: 'Open', l: 'Open' }, false);
    eq(D._load().jql, DEFECTS + ORDER, 'every basic filter off: the filter query exactly, again');

    fresh();
    D._useFilter({ id: '7', name: 'Either', jql: 'project = EDR OR labels = hot' });
    D._setMode('basic');
    D._setText('crash', true);
    eq(D._load().jql, '(project = EDR OR labels = hot) AND text ~ "crash" ORDER BY created DESC', 'an OR inside the scope is bracketed, so the search narrows all of it');

    fresh();
    const HARD = 'NOT (status in (Closed, Done) OR resolution is not EMPTY) AND assignee in membersOf("isd-bh") AND summary ~ "order by"';
    D._useFilter({ id: '8', name: 'Complex', jql: HARD + ' ORDER BY priority DESC' });
    D._setMode('basic');
    eq(D._load().scope.where, HARD, 'NOT, functions, nested brackets and a quoted ORDER BY all survive whole as the scope');
    D._setText('ship', true);
    eq(D._load().jql, '(' + HARD + ') AND text ~ "ship" ORDER BY priority DESC', '...and the search narrows it with the order kept');

    fresh();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'assignee = currentUser() ORDER BY key', basic: { text: 'old', project: [{ v: 'EBR', l: 'EBR' }], assignee: [], type: [], status: [] } };
    D._setMode('basic');
    st = D._load();
    eq([st.scope, st.basic, st.jql, runs], [{ where: 'assignee = currentUser()', name: '', id: '' }, D._emptyBasic(), 'assignee = currentUser() ORDER BY key', 0], 'JQL typed by hand becomes an unnamed scope; the stale basic filters go, the query stays');

    fresh(); pick(); D._setMode('basic'); D._setText('frigate', true);
    D._setMode('jql');
    D._setJql(DEFECTS + ORDER);
    eq(D._load().filterId, '', 'editing the JQL by hand drops the filter id, as before');
    D._setMode('basic');
    st = D._load();
    eq([st.scope.name, st.filterName, st.filterId, st.basic.text], ['BH - All Defects', 'BH - All Defects', '10500', ''], 'the narrowing typed away in JQL: back in Basic it is the filter list again, lit');
    D._setMode('jql');
    D._setJql('project = EDR ORDER BY key');
    D._setMode('basic');
    eq([D._load().scope, D._load().filterId], [{ where: 'project = EDR', name: '', id: '' }, ''], 'a different query typed in JQL is a new, unnamed scope');

    fresh(); pick(); D._setMode('basic'); D._setText('frigate', true);
    D._dropScope();
    st = D._load();
    eq([st.scope, st.jql, st.filterName, st.filterId], [null, 'text ~ "frigate"' + ORDER, '', ''], 'the x on the pill drops the scope: the search runs over all work, no filter lit');

    fresh();
    store[D.STATE_KEY] = { mode: 'basic', jql: 'text ~ "x" ORDER BY key', basic: { text: 'x', project: [], assignee: [], type: [], status: [] } };
    pick();
    st = D._load();
    eq([st.mode, st.scope && st.scope.where, st.basic, st.jql], ['basic', DEFECTS, D._emptyBasic(), DEFECTS + ORDER], 'a filter picked in Basic stays in Basic, as the scope, with the old search cleared');

    fresh();
    store[D.STATE_KEY] = { mode: 'basic', jql: 'ORDER BY key', basic: D._emptyBasic(), filterName: 'X', filterId: '9' };
    D._setText('y', true);
    eq([D._load().filterName, D._load().filterId], ['', ''], 'with no scope the basic filters build the whole query: no filter is lit');

    fresh();
    store[D.STATE_KEY] = { mode: 'jql', jql: DEFECTS + ORDER, basic: null, filterName: 'BH - All Defects', filterId: '10500' };
    D._setMode('basic');
    eq([D._load().scope, D._load().filterId], [{ where: DEFECTS, name: 'BH - All Defects', id: '10500' }, '10500'], 'a filter picked before this version (no scope saved) still becomes a named scope, and stays lit');

    fresh(); store[D.STATE_KEY] = { mode: 'basic', jql: 'a = 1', basic: null, scope: 'junk' };
    eq(D._load().scope, null, 'a damaged scope loads as none');
    fresh(); store[D.STATE_KEY] = { mode: 'basic', jql: 'a = 1', basic: null, scope: { where: '   ' } };
    eq(D._load().scope, null, '...so does an empty one');
    fresh(); store[D.STATE_KEY] = { mode: 'basic', jql: 'a = 1', basic: null, scope: { where: ' a = 1 ', name: 5, id: '3' } };
    eq(D._load().scope, { where: 'a = 1', name: '', id: '3' }, 'a stored scope is trimmed and its fields typed');
    fresh(); store[D.STATE_KEY] = { mode: 'basic', jql: 'a = 1', basic: null };
    eq(D._load().scope, null, 'a state saved before scopes existed loads with none');

    // The bar itself, rendered for real against a few stub nodes.
    const mk = (tag) => ({ tagName: String(tag).toUpperCase(), className: '', textContent: '', title: '', hidden: false, children: [], attrs: {},
        appendChild(c) { this.children.push(c); return c; }, insertAdjacentHTML() {}, addEventListener() {},
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] || null; }, querySelector() { return null; },
        set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; } });
    const barEl = mk('div');
    const walk = (n, out) => { (n.children || []).forEach((c) => { out.push(c); walk(c, out); }); return out; };
    const byId = document.getElementById;
    document.createElement = mk;
    document.getElementById = (id) => (id === 'jdv-bar' ? barEl : null);
    fresh(); D._renderBar = PRISTINE._renderBar;
    pick(); D._setMode('basic');
    let nodes = walk(barEl, []);
    const pill = nodes.filter((n) => n.className === 'jdv-scope')[0];
    ok(!!pill, 'in Basic, the scope shows as a pill in the bar');
    const lbl = pill ? walk(pill, []).filter((n) => n.className === 'jdv-lbl')[0] : null;
    eq(lbl && lbl.textContent, 'BH - All Defects', '...named after its filter');
    ok(!!pill && pill.children[0].title.indexOf(DEFECTS) >= 0, '...with its query on hover');
    eq((nodes.filter((n) => n.tagName === 'INPUT')[0] || {}).placeholder, 'Search this list', 'the search box says it searches this list');
    if (pill) { pill.children[1].onclick(); }
    nodes = walk(barEl, []);
    ok(!nodes.some((n) => n.className === 'jdv-scope'), 'the x removes the pill');
    eq((nodes.filter((n) => n.tagName === 'INPUT')[0] || {}).placeholder, 'Search work', '...and the search box searches all work again');
    pick();
    D._setMode('jql');
    ok(!walk(barEl, []).some((n) => n.className === 'jdv-scope'), 'JQL mode shows no pill: the query is in the box');
    document.getElementById = byId; delete document.createElement;
    }

    // ---- 23. a query the user changes is not paged through for the issue already open -----------------------
    section('23. re-sorting or re-filtering never pages through the new list for the open issue');
    {
    const seekPosts = () => countPosts().filter((p) => / AND key = /.test(p.body.jql));
    reset(); scriptPost();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EDR ORDER BY created DESC' };
    D._activeKey = 'EDR-7730';
    D._setSort('created', 'ASC');
    jqlPosts()[0].resolve({ issues: issues(['EDR-1', 'EDR-2']), nextPageToken: 'T2' });
    await settle();
    eq([seekPosts().length, jqlPosts().length], [0, 1], 'reversing the sort loads page one only: the open issue, now at the far end, is not searched for');
    eq(D._activeKey, 'EDR-7730', '...and it stays open');
    D._activeKey = 'EDR-500';   // Back, or a linked issue, after the sort
    D._seek();
    eq(seekPosts().map((p) => p.body.jql), ['(project = EDR) AND key = "EDR-500"'], 'an issue opened after the sort is looked for as usual');

    const noSeek = async (label, act) => {
        reset(); scriptPost();
        store[D.STATE_KEY] = { mode: 'basic', jql: 'project = EDR ORDER BY created DESC', basic: null, scope: { where: 'project = EDR', name: '', id: '' } };
        D._activeKey = 'EDR-7730';
        act();
        advance(D.RUN_DEBOUNCE_MS);
        jqlPosts()[0].resolve({ issues: issues(['EDR-1']), nextPageToken: 'T2' });
        await settle();
        eq(seekPosts().length, 0, label);
    };
    await noSeek('a search typed in the box does not search for it either', () => D._setText('frigate', true));
    await noSeek('nor a basic filter', () => D._toggleBasic('status', { v: 'Open', l: 'Open' }, true));
    await noSeek('nor new JQL', () => D._setJql('project = EO ORDER BY key'));
    await noSeek('nor a filter pick', () => D._useFilter({ id: '5', name: 'F', jql: 'project = EO' }));

    reset(); scriptPost();
    store[D.STATE_KEY] = { mode: 'jql', jql: 'project = EDR ORDER BY created DESC' };
    D._activeKey = 'EDR-7730';
    D._setJql('project = EDR ORDER BY created DESC');
    jqlPosts()[0].resolve({ issues: issues(['EDR-1']), nextPageToken: 'T2' });
    await settle();
    eq(seekPosts().length, 1, 'Enter on an unchanged query is a refresh: the open issue is looked for as before');
    }

    console.log('\n' + (fail ? 'RED' : 'GREEN') + '  dv-check  ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL  harness crashed: ' + (e && e.stack || e)); process.exit(1); });
