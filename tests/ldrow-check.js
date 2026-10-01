// ldrow-check.js - a Lead-duties row action redraws its own row and nothing else (v3.38.1). Checked, Flag, Undo,
// Mark reviewed and Skip used to empty the whole list and reload it, so every row jumped. Now the clicked row is
// swapped for a freshly drawn one in place, the rows around it stay the very same elements, the list is never
// emptied, and the status line says what happened. Resolving a follow-up redraws the tab from the value it just
// wrote, at the same scroll position, with no loading state. Evals the real JiTA.conf, JiTA.leadduty and
// JiTA.leadduty.ui against a stubbed Confluence property store and a fake jQuery just big enough for the rows.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
const us = src.indexOf('JiTA.leadduty.ui = {'), ue = src.indexOf('\n};', src.indexOf('_injectCss: function ()', us)) + 3;
if (cs < 0 || ce < 0 || ls < 0 || le < 0 || us < 0 || ue < 3) { throw new Error('could not slice JiTA.conf / JiTA.leadduty / JiTA.leadduty.ui'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a fake jQuery: elements are plain objects; '#ld-body' is the list, any other selector a do-nothing ----
const cls = (n) => ((/class="([^"]*)"/.exec(n.html) || [])[1] || '').split(/\s+/);
const has = (n, c) => cls(n).indexOf(c) >= 0;
function W(list) {
    return {
        length: list.length,
        filter(fn) { return W(list.filter((el) => fn.call(el))); },
        first() { return W(list.slice(0, 1)); },
        replaceWith(f) { list.forEach((el) => { const p = el.parent, i = p.kids.indexOf(el); p.kids[i] = f; f.parent = p; el.parent = null; }); return this; }
    };
}
function N(html) {
    const n = { html: html || '', attrs: {}, kids: [], handlers: {}, props: {}, _text: '', parent: null, _scroll: 0, emptied: 0 };
    n.attr = (k, v) => { if (v === undefined) { return n.attrs[k]; } n.attrs[k] = v; return n; };
    n.getAttribute = (k) => (n.attrs[k] == null ? null : String(n.attrs[k]));
    n.text = (t) => { if (t === undefined) { return n._text; } n._text = String(t); return n; };
    n.append = (c) => { c.parent = n; n.kids.push(c); return n; };
    n.appendTo = (p) => { p.append(n); return n; };
    n.on = (ev, fn) => { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return n; };
    n.prop = (k, v) => { if (v === undefined) { return n.props[k]; } n.props[k] = v; return n; };
    n.empty = () => { n.kids = []; n.emptied++; n._scroll = 0; return n; };   // emptying the content clamps the scroll
    n.children = (sel) => W(n.kids.filter((k) => sel.charAt(0) === '.' && has(k, sel.slice(1))));
    n.scrollTop = (v) => { if (v === undefined) { return n._scroll; } n._scroll = v; return n; };
    n.val = () => n; n.hide = () => n; n.show = () => n; n.toggle = () => n; n.css = () => n;
    n.is = () => false; n.trigger = () => n; n.addClass = () => n; n.removeClass = () => n;
    return n;
}
const body = N('<div id="ld-body" class="ld-scroll"></div>');
global.$ = (x) => {
    if (typeof x !== 'string') { return x; }
    if (x.charAt(0) === '<') { return N(x); }
    return x === '#ld-body' ? body : N('');
};
const status = { textContent: '' };
global.document = {
    querySelector: (s) => (s === '#jita-menu.jita-leadduty-view' ? {} : null),
    getElementById: (id) => (id === 'ld-status' ? status : null)
};
let answer = '';
global.prompt = () => answer;
global.confirm = () => true;
global.GM_addStyle = () => {};
global.window = { console: { log() {} } };   // a dry run logs what it would have written

// ---- GM storage, the meta store and the Confluence property store ----
const gm = { leadDutyMe: { accountId: 'a', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true } };
global.gmGet = (k, d) => (k in gm ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
const meta = {};
let hides = 0;
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5,
    credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 } },
    dlog: () => {}, link: {}, sync: {}, util: {}, worker: {},
    ui: { _hideTip: (now) => { if (now === true) { hides++; } }, _showTip: () => {} },
    db: {
        getMeta: (k) => Promise.resolve(k in meta ? JSON.parse(JSON.stringify(meta[k])) : null),
        setMeta: (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
        getDefect: () => Promise.resolve(null)
    }
};
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
eval(src.slice(us, ue));
const L = JiTA.leadduty, U = L.ui;

const props = {};
let failNext = false;
JiTA.conf.getProperty = (p, key) => Promise.resolve(props[key] ? JSON.parse(JSON.stringify(props[key])) : null);
JiTA.conf.saveProperty = (p, key, value, prop) => {
    if (failNext) { failNext = false; return Promise.reject(new Error('HTTP 500')); }
    props[key] = { id: key, key: key, value: JSON.parse(JSON.stringify(value)), version: (prop ? prop.version : 0) + 1 };
    return Promise.resolve(props[key]);
};
L.report.schedule = () => {};
L.reminder = { mount: () => {} };   // defined after JiTA.leadduty, so not in the slice
// Any of these would mean the old reload path: count them, and empty the list as the real ones do.
const loads = { qc: 0, wiki: 0, flags: 0 };
U._loadQc = () => { loads.qc++; body.empty(); };
U._loadWiki = () => { loads.wiki++; body.empty(); };
U._loadFlags = () => { loads.flags++; body.empty(); };

// ---- helpers ----
const clone = (v) => JSON.parse(JSON.stringify(v));
const settle = () => new Promise((r) => setTimeout(r, 0));
const rows = () => body.kids.filter((k) => has(k, 'ld-row'));
const rowOf = (key) => rows().find((r) => r.attrs['data-key'] === key);
function find(n, pred) { if (pred(n)) { return n; } for (const k of n.kids) { const f = find(k, pred); if (f) { return f; } } return null; }
const button = (row, label) => find(row, (n) => n.html.indexOf('>' + label + '</button>') >= 0);
const tick = (row) => { const t = find(row, (n) => has(n, 'ld-tick')); return t ? t._text : null; };
const metaText = (row) => { const t = find(row, (n) => has(n, 'ld-meta')); return t ? t._text : null; };
const isDone = (row) => has(row, 'done');
async function click(row, label) {
    const b = button(row, label);
    if (!b) { throw new Error('no ' + label + ' button on ' + row.attrs['data-key']); }
    b.handlers.click.forEach((f) => f.call(b));
    await settle();
}
const keys = () => rows().map((r) => r.attrs['data-key']).join(',');

(async () => {
    // ================= Quality control =================
    const qym = L._prevYm(), QK = L.QC_LEDGER_KEY;
    props[QK] = { id: QK, key: QK, version: 1, value: { v: 1, months: {}, done: {}, flags: {} } };
    U._qc = {
        ym: qym, shared: true, done: {},
        record: { quota: 10, poolSize: 40, roster: L.ROSTER(), minDefects: 0, poolDefects: 5 },
        items: [
            { key: 'EBR-1', kind: 'report', summary: 'one', status: 'Closed', actor: 'Alice' },
            { key: 'EDR-2', kind: 'defect', summary: 'two', status: 'Open', actor: 'Bob' },
            { key: 'EBR-3', kind: 'report', summary: 'three', status: 'Attached', actor: 'Cara' }
        ],
        ledgerValue: clone(props[QK].value)
    };
    U._qcLocalDone = {};
    U._tab = 'qc';
    U._renderQc();
    const base = body.emptied;
    let [r1, r2, r3] = rows();
    ok('the QC list draws one row per item, keyed', keys() === 'EBR-1,EDR-2,EBR-3', keys());
    ok('...none of them done, each with Checked and Flag', rows().every((r) => !isDone(r) && button(r, 'Checked') && button(r, 'Flag')));

    await click(r2, 'Checked');
    ok('Checked: the list is never emptied or reloaded', body.emptied === base && loads.qc === 0, body.emptied - base + ' empties, ' + loads.qc + ' loads');
    ok('...the rows around it are the very same elements, in the same order', rows()[0] === r1 && rows()[2] === r3 && keys() === 'EBR-1,EDR-2,EBR-3', keys());
    let n2 = rowOf('EDR-2');
    ok('...the clicked row alone is redrawn', n2 !== r2);
    ok('...as checked, with Undo in place of Checked and Flag', isDone(n2) && tick(n2) === '✓' && !!button(n2, 'Undo') && !button(n2, 'Checked') && !button(n2, 'Flag'));
    ok('...the verdict reached the ledger', props[QK].value.done[qym]['EDR-2'].verdict === 'ok' && props[QK].value.done[qym]['EDR-2'].by === 'schogol');
    ok('...the status line counts it', status.textContent.indexOf('1 of 3 checked') === 0, status.textContent);
    ok('...and the hover card of the replaced row is closed', hides >= 1, String(hides));

    answer = 'wrong component';
    await click(r1, 'Flag');
    let n1 = rowOf('EBR-1');
    ok('Flag: the row shows the flag', isDone(n1) && has(n1, 'flagged') && tick(n1) === '!' && !!button(n1, 'Undo'));
    ok('...taken from the ledger the write left behind, reason and all', U._qc.done['EBR-1'] && U._qc.done['EBR-1'].verdict === 'flag' &&
        props[QK].value.flags['EBR-1'].note === 'wrong component');
    ok('...still no reload, and the third row untouched', body.emptied === base && loads.qc === 0 && rows()[2] === r3);
    ok('...status counts both', status.textContent.indexOf('2 of 3 checked') === 0, status.textContent);

    await click(n2, 'Undo');
    const u2 = rowOf('EDR-2');
    ok('Undo: the row is back to undone, with Checked and Flag', !isDone(u2) && tick(u2) === '' && !!button(u2, 'Checked') && !!button(u2, 'Flag'));
    ok('...the verdict left the ledger and this tab\'s local copy', !props[QK].value.done[qym]['EDR-2'] && !U._qcLocalDone['EDR-2'] && !U._qc.done['EDR-2']);
    ok('...the status line says so first', status.textContent.indexOf('EDR-2 is back on your list · 1 of 3 checked') === 0, status.textContent);
    ok('...and the other rows stay put', rows()[0] === n1 && rows()[2] === r3 && body.emptied === base);

    // Another Lead resolves the flag meanwhile, so this tab still offers Undo - and the ledger refuses it.
    await L.qc.resolveFlag('EBR-1', 'talked');
    await click(n1, 'Undo');
    n1 = rowOf('EBR-1');
    ok('a refused Undo shows the row as the ledger has it: still flagged, no Undo any more', isDone(n1) && tick(n1) === '!' && !button(n1, 'Undo'));
    ok('...and says why', status.textContent.indexOf('Could not undo - the ledger changed') === 0, status.textContent);

    failNext = true;
    await click(r3, 'Checked');
    let n3 = rowOf('EBR-3');
    ok('a write that fails: the row still shows the mark, from the local mirror', isDone(n3) && tick(n3) === '✓' && !!button(n3, 'Undo'));
    ok('...the status line says it was saved locally only (it used to be wiped by the reload)', status.textContent.indexOf('Saved locally only - HTTP 500') === 0, status.textContent);
    ok('...nothing reached the ledger, and the mirror holds it for the retry',
        !props[QK].value.done[qym]['EBR-3'] && (meta[L.qc.localKey(qym)].pending || []).indexOf('EBR-3') >= 0);
    await click(n3, 'Undo');
    n3 = rowOf('EBR-3');
    ok('...and Undo takes a local-only mark straight back', !isDone(n3) && !!button(n3, 'Checked') && status.textContent.indexOf('EBR-3 is back on your list') === 0, status.textContent);

    gm.leadDutyDryRun = true;
    await click(n3, 'Checked');
    n3 = rowOf('EBR-3');
    ok('a dry run: the row shows the mark from the local mirror', isDone(n3));
    ok('...the value nobody wrote is not taken as the ledger', !U._qc.done['EBR-3'] && !props[QK].value.done[qym]['EBR-3']);
    ok('...and the status line says it was a dry run', status.textContent.indexOf('DRY RUN - not written to Confluence') === 0, status.textContent);
    delete gm.leadDutyDryRun;

    // A mark that lands after the Lead switched tabs must not draw into the other tab, but must still count.
    const before = rows().slice();
    const ckd = button(rowOf('EDR-2'), 'Checked');
    ckd.handlers.click.forEach((f) => f.call(ckd));
    U._tab = 'flags';
    await settle();
    ok('a mark landing on another tab redraws nothing', rows().every((r, i) => r === before[i]));
    ok('...but is folded into the QC state, so the tab shows it when it comes back', U._qc.done['EDR-2'] && U._qcLocalDone['EDR-2']);
    U._tab = 'qc';
    U._renderQc();
    ok('...which it does', isDone(rowOf('EDR-2')));

    // ================= Wiki review =================
    const ym = L._ym(), WK = L.LEDGER_KEY, today = new Date().toISOString().slice(0, 10);
    props[WK] = { id: WK, key: WK, version: 1, value: {
        v: 1, months: {}, done: {}, lastReviewed: { p3: '2025-06-01' }, prevReviewed: {}, reviewedBy: { p3: 'solnichka' } } };
    U._wiki = {
        record: { assign: { schogol: ['p1', 'p2', 'p3'] }, roster: L.ROSTER(), perLead: 3 },
        pool: { pages: [{ id: 'p1', title: 'Alpha' }, { id: 'p2', title: 'Beta' }, { id: 'p3', title: 'Gamma' }], excludedIds: {} },
        ledgerValue: clone(props[WK].value)
    };
    U._wikiLocalDone = {};
    U._tab = 'wiki';
    U._renderWiki();
    const wbase = body.emptied;
    const [w1, w2, w3] = rows();
    ok('the wiki list draws one row per page, keyed', keys() === 'p1,p2,p3', keys());

    await click(w2, 'Mark reviewed');
    let m2 = rowOf('p2');
    ok('Mark reviewed: the list is never emptied or reloaded', body.emptied === wbase && loads.wiki === 0);
    ok('...the rows around it stay the same elements', rows()[0] === w1 && rows()[2] === w3 && m2 !== w2);
    ok('...the row shows the review, with Undo', isDone(m2) && tick(m2) === '✓' && !!button(m2, 'Undo') && !button(m2, 'Mark reviewed'));
    ok('...and its new stamp, read from the ledger the write left behind', metaText(m2).indexOf('last reviewed ' + today + ' by schogol') === 0, metaText(m2));
    ok('...status counts it', status.textContent.indexOf('1 of 3 done') === 0, status.textContent);

    await click(w3, 'Skip');
    const m3 = rowOf('p3');
    ok('Skip: the row shows the skip, and its history is untouched', tick(m3) === '–' && metaText(m3).indexOf('last reviewed 2025-06-01 by solnichka') === 0, metaText(m3));
    ok('...the first row still untouched', rows()[0] === w1);

    await click(m2, 'Undo');
    m2 = rowOf('p2');
    ok('Undo: the page is back on the list, history restored', !isDone(m2) && !!button(m2, 'Mark reviewed') && metaText(m2) === 'never reviewed', metaText(m2));
    ok('...the status line says so first', status.textContent.indexOf('"Beta" is back on your list · 1 of 3 done') === 0, status.textContent);
    ok('...and nothing was reloaded', body.emptied === wbase && loads.wiki === 0 && rows()[0] === w1);

    // ================= Follow-ups =================
    await L.qc.markChecked('EDR-2', 'flag', qym, 'bad repro', { kind: 'defect', summary: 'two', actor: 'Bob' });
    U._tab = 'flags';
    U._renderFlags(clone(props[QK].value));
    body._scroll = 120;
    const fbase = body.emptied;
    answer = 'talked it through';
    const res = find(body, (n) => n.html.indexOf('>Resolve</button>') >= 0);
    res.handlers.click.forEach((f) => f.call(res));
    await settle();
    ok('Resolve: the tab is not reloaded through a ledger read', loads.flags === 0);
    ok('...it is redrawn once, from the value just written', body.emptied === fbase + 1 && !find(body, (n) => n.html.indexOf('>Resolve</button>') >= 0));
    ok('...at the same scroll position', body._scroll === 120, String(body._scroll));
    ok('...and the QC tab learns the flag is resolved, so it stops offering Undo on it', !!(U._qc.ledgerValue.flags['EDR-2'] && U._qc.ledgerValue.flags['EDR-2'].resolvedAt));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'row checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
