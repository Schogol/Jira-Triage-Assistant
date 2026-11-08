// Eval the real JiTA.ui filter-menu functions out of the file. The panel's funnel derives everything from the Jira
// page it is on: on a bug report it offers the report<->report view switches, the trending one and the Status
// segment; on a defect only Created within. Pinned here: those controls, what each click changes and re-renders,
// when the funnel lights up, and the filter box's words.
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

global.JiTA = { ui: {} };
eval('Object.assign(global.JiTA.ui, {' + [
    slice('_filterTerms: function () {'),
    slice('_filtersActive: function () {'),
    slice('_showFilterMenu: function (anchor) {'),
    slice('_closeFilterMenu: function () {')
].join('\n') + '\n});');
const U = global.JiTA.ui;
const symAt = src.indexOf('    SYM: {');   // the cards' symbols (the trending switch is labelled with ▲)
Object.assign(U, eval('({' + src.slice(symAt, src.indexOf('\n', symAt)) + '})'));
U._hideTip = () => {};
U._syncFilterBtn = () => { panelSynced++; };
U._rerenderCurrent = () => { panelRendered++; };
U.filters = { status: 'all', createdDays: 0 };
U.reporterMode = false; U.simReportsMode = false;

let panelSynced = 0, panelRendered = 0;
const anchor = makeEl();
function open() {
    body = [];
    U._showFilterMenu(anchor);
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

// ---- the panel: everything derived from the key it is rendering ----
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
ok('an active trending view lights the funnel', U._filtersActive() === true);
m = open();
m.views[2]._click();
ok('its own switch turns it off', U.trendMode === false);
ok('and the funnel goes dark again', U._filtersActive() === false);
U.reporterMode = false; U.simReportsMode = false; U.trendMode = false;

// ---- _filtersActive: Status counts only where it is offered (a bug report), Created everywhere ----
U.filters = { status: 'fixed', createdDays: 0 };
U.currentKey = 'EBR-1';
ok('Status lights the funnel on a bug report', U._filtersActive() === true);
U.currentKey = 'EDR-1';
ok('...and not on a defect, where it is not offered', U._filtersActive() === false);
U.filters = { status: 'all', createdDays: 30 };
ok('Created lights it on a defect too', U._filtersActive() === true);
U.currentKey = 'EBR-1';
ok('...and on a bug report', U._filtersActive() === true);
U.filters = { status: 'all', createdDays: 0 };
U.reporterMode = true;
U.currentKey = 'EDR-1';
ok('a view flag left on lights nothing on a defect, where there are no views', U._filtersActive() === false);
U.reporterMode = false;

// ---- _filterTerms reads the panel's box ----
const boxes = { '#jita-sd-filter': '  Panel   WORDS ' };
global.$ = (sel) => ({ length: boxes[sel] === undefined ? 0 : 1, val: () => boxes[sel] });
ok('the box\'s words, lowercased, one space apart', U._filterTerms().join('|') === 'panel|words', U._filterTerms().join('|'));
boxes['#jita-sd-filter'] = '   ';
ok('a blank box is no filter at all', U._filterTerms().length === 0);
delete boxes['#jita-sd-filter'];
ok('...nor is no box', U._filterTerms().length === 0);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'filter-menu checks passed.'));
process.exit(fail ? 1 : 0);
