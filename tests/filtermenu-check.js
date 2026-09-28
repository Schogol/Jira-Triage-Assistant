// Eval the real JiTA.ui filter-menu functions out of the file. _showFilterMenu is now shared by TWO funnels -
// the sidebar panel's and the triage overlay's - so what is pinned here is that the panel's behaviour is
// unchanged when no options are passed (it still derives everything from the Jira page it is on), and that
// the triage funnel's options actually reach the controls: no report<->report view switches, a Status segment
// that follows the triage queue rather than the page, and ITS callbacks rather than the panel's.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');

function slice(sig) {
    const s = src.indexOf('    ' + sig);
    const e = src.indexOf('\n    },', s) + '\n    },'.length;
    if (s < 0 || e < 6) { throw new Error('could not slice ' + sig); }
    return src.slice(s, e);
}

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a DOM stub just deep enough for the builder: it makes nodes, reads their text, and fires their clicks ----
let body = [];
function makeEl() {
    const el = {
        _kids: [], _cls: '', _text: '', _click: null, style: {}, id: '', type: '',
        get className() { return el._cls; }, set className(v) { el._cls = v; },
        get textContent() { return el._text; }, set textContent(v) { el._text = v; },
        classList: { add(c) { el._cls += ' ' + c; }, remove() {} },
        appendChild(c) { el._kids.push(c); return c; },
        addEventListener(ev, fn) { if (ev === 'click') { el._click = fn; } },
        removeChild(c) { el._kids = el._kids.filter((k) => k !== c); },
        querySelectorAll: () => [],
        contains: () => false,
        getBoundingClientRect: () => ({ left: 100, right: 120, top: 40, bottom: 60 }),
        offsetWidth: 190, offsetHeight: 200
    };
    return el;
}
global.document = {
    createElement: makeEl,
    getElementById: (id) => (body.filter((n) => n.id === id)[0] || null),
    body: { appendChild(n) { body.push(n); n.parentNode = global.document.body; }, removeChild(n) { body = body.filter((x) => x !== n); } },
    addEventListener() {}, removeEventListener() {}
};
global.window = { innerWidth: 1512, innerHeight: 900 };
global.setTimeout = (fn) => fn;   // the dismiss handlers are registered next tick; we never need them
global.$ = () => ({ length: 0, val: () => '', text: () => '', toggleClass: () => {} });

global.JiTA = { ui: {}, triage: { _open: false } };
eval('Object.assign(global.JiTA.ui, {' + [
    slice('_filterTerms: function () {'),
    slice('_filtersActive: function (ctx) {'),
    slice('_showFilterMenu: function (anchor, opts) {'),
    slice('_closeFilterMenu: function () {')
].join('\n') + '\n});');
const U = global.JiTA.ui;
U._hideTip = () => {};
U._syncFilterBtn = () => { panelSynced++; };
U._rerenderCurrent = () => { panelRendered++; };
U.filters = { status: 'all', createdDays: 0 };
U.reporterMode = false; U.simReportsMode = false;

let panelSynced = 0, panelRendered = 0;
const anchor = makeEl();
function open(opts) {
    body = [];
    U._showFilterMenu(anchor, opts);
    const menu = body[0];
    const flat = [];
    (function walk(n) { flat.push(n); n._kids.forEach(walk); })(menu);
    return {
        menu: menu,
        labels: flat.filter((n) => n._cls === 'jita-fm-label').map((n) => n._text),
        views: flat.filter((n) => /jita-fm-view/.test(n._cls)),
        segs: flat.filter((n) => /jita-fm-segbtn/.test(n._cls)),
        reset: flat.filter((n) => /jita-fm-reset/.test(n._cls))[0]
    };
}

// ---- the PANEL, unchanged: no options, everything derived from the key it is rendering ----
U.currentKey = 'EBR-1234';
let m = open();
ok('on a bug report the panel offers both report views and the trending one', m.views.length === 3, String(m.views.length));
ok('and the Status segment', m.labels.indexOf('Status') !== -1, m.labels.join(','));
ok('and Created within', m.labels.indexOf('Created within') !== -1);

U.currentKey = 'EDR-99';
m = open();
ok('on a defect the panel offers no report views', m.views.length === 0);
ok('and no Status (the candidates are open reports)', m.labels.indexOf('Status') === -1, m.labels.join(','));
ok('but still Created within', m.labels.indexOf('Created within') !== -1);

U.currentKey = 'EBR-1234';
panelSynced = 0; panelRendered = 0;
m = open();
m.segs[1]._click();                      // "Closed"
ok('a panel Status click sets the filter', U.filters.status === 'fixed', U.filters.status);
ok('and re-renders the panel', panelRendered === 1 && panelSynced === 1);
m.reset._click();
ok('Reset clears the filters', U.filters.status === 'all' && U.filters.createdDays === 0);

// ---- the trending view: a third switch, exclusive with the two report views ----
U.currentKey = 'EBR-1234';
U.reporterMode = false; U.simReportsMode = false; U.trendMode = false;
m = open();
ok('the third switch is the trending one', !!m.views[2] && /Trending defects/.test(m.views[2]._text), m.views[2] && m.views[2]._text);
U.reporterMode = true;
m = open();
panelRendered = 0; panelSynced = 0;
m.views[2]._click();
ok('turning trending on turns both report views off', U.trendMode === true && !U.reporterMode && !U.simReportsMode);
ok('and re-renders the panel', panelRendered === 1 && panelSynced === 1);
m = open();
ok('the ranking filters hide while it is on (they do not apply to it)', m.labels.indexOf('Created within') === -1, m.labels.join(','));
ok('its switch now leads back', /Back to similar defects/.test(m.views[2]._text), m.views[2]._text);
ok('and the report switches still offer themselves', !/Back/.test(m.views[0]._text) && !/Back/.test(m.views[1]._text));
m.views[1]._click();
ok('a report view turns trending off', U.simReportsMode === true && U.trendMode === false);
m = open();
m.views[2]._click();
ok('...and trending turns that one off again', U.trendMode === true && U.simReportsMode === false);
m = open();
m.views[0]._click();
ok('the reporter view turns trending off too', U.reporterMode === true && U.trendMode === false);
m = open();
m.views[2]._click();
ok('...and trending turns the reporter view off', U.trendMode === true && U.reporterMode === false);
U.filters = { status: 'all', createdDays: 0 };
ok('with no context, an active trending view lights the funnel', U._filtersActive() === true);
m = open();
m.views[2]._click();
ok('its own switch turns it off', U.trendMode === false);
ok('and the funnel goes dark again', U._filtersActive() === false);
U.reporterMode = false; U.simReportsMode = false; U.trendMode = false;

// ---- the TRIAGE funnel: its options decide, not the page underneath ----
// Both report<->report views apply on the bug-report queue (the issue on screen IS a report) and neither on
// the defect queue - the same condition as the Status segment, so triage passes one answer for both.
global.JiTA.triage._open = true;
let tSynced = 0, tRendered = 0;
const tOpts = (onReports) => ({ views: onReports, status: onReports, rerender: () => { tRendered++; }, syncBtn: () => { tSynced++; } });

U.currentKey = 'EDR-99';   // the page behind the overlay must not leak into the menu
m = open(tOpts(true));
ok('the bug-report queue offers both report views and the trending one', m.views.length === 3, String(m.views.length));
ok('and a Status segment', m.labels.indexOf('Status') !== -1, m.labels.join(','));

// Toggling a view re-ranks TRIAGE, and the ranking filters hide while it is on (they do not apply to a
// report<->report list) - exactly as they do in the panel.
panelRendered = 0;
m.views[1]._click();                     // "Similar open reports"
ok('a triage view toggle re-ranks triage', tRendered === 1 && tSynced === 1);
ok('and leaves the panel alone', panelRendered === 0);
ok('the view is on', U.simReportsMode === true);
m = open(tOpts(true));
ok('the ranking filters hide while a view is on', m.labels.indexOf('Created within') === -1, m.labels.join(','));
ok('but the view switches stay, to turn it back off', m.views.length === 3);
m.views[1]._click();                     // back to the defect matches
ok('toggling it off restores them', U.simReportsMode === false);
m = open(tOpts(true));
ok('...literally', m.labels.indexOf('Created within') !== -1, m.labels.join(','));
tRendered = 0; tSynced = 0;

panelSynced = 0; panelRendered = 0;
m.segs[0]._click();                      // "Open"
ok('a triage Status click re-ranks TRIAGE', tRendered === 1 && tSynced === 1);
ok('and leaves the panel alone', panelRendered === 0 && panelSynced === 0);
m.reset._click();
ok('Reset from triage re-ranks triage too', tRendered === 2 && panelRendered === 0);

m = open(tOpts(false));
ok('the defect queue offers no report views', m.views.length === 0, String(m.views.length));
ok('and no Status segment', m.labels.indexOf('Status') === -1, m.labels.join(','));
ok('but keeps Created within', m.labels.indexOf('Created within') !== -1);

// A view flag left on from the panel must not blank the DEFECT queue's menu: the flag applies to the
// bug-report queue only, and triage clears it when switching queues anyway.
U.reporterMode = true;
m = open(tOpts(false));
ok('a stale view flag does not empty the defect queue menu', m.labels.indexOf('Created within') !== -1, m.labels.join(','));
U.reporterMode = false;

// ---- _filtersActive: the caller states whether Status applies; without a context it guesses from the page ----
U.filters = { status: 'fixed', createdDays: 0 };
ok('Status counts where it is offered', U._filtersActive({ status: true }) === true);
ok('and not where it is not', U._filtersActive({ status: false }) === false);
U.filters = { status: 'all', createdDays: 30 };
ok('Created counts either way', U._filtersActive({ status: false }) === true);
U.filters = { status: 'fixed', createdDays: 0 };
U.currentKey = 'EBR-1';
ok('with no context the panel still reads its own page', U._filtersActive() === true);
U.currentKey = 'EDR-1';
ok('...on both kinds of page', U._filtersActive() === false);

// ---- _filterTerms reads whichever box is actually in front of the user ----
const boxes = { '#jita-sd-filter': 'panel words', '#jt-filter': 'TRIAGE Words' };
global.$ = (sel) => ({ length: 1, val: () => boxes[sel] });
global.JiTA.triage._open = false;
ok('the panel reads its own box', U._filterTerms().join(' ') === 'panel words', U._filterTerms().join(' '));
global.JiTA.triage._open = true;
ok('the open triage overlay reads ITS box', U._filterTerms().join(' ') === 'triage words', U._filterTerms().join(' '));
boxes['#jt-filter'] = '   ';
ok('a blank box is no filter at all', U._filterTerms().length === 0);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'filter-menu checks passed.'));
process.exit(fail ? 1 : 0);
