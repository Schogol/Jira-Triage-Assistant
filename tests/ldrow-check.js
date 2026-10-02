// ldrow-check.js - a Lead-duties row action redraws its own row and nothing else (v3.38.1). Checked, Flag, Undo,
// Mark reviewed and Skip used to empty the whole list and reload it, so every row jumped. Now the clicked row is
// swapped for a freshly drawn one in place, the rows around it stay the very same elements, the list is never
// emptied, and the status line says what happened. Resolving a follow-up redraws the tab from the value it just
// wrote, at the same scroll position, with no loading state. Around that: an Undo the ledger refuses or cannot be
// reached for keeps the local mirror (the chip counts from it); a Flag or Skip whose save fails is not queued for a
// replay that would turn it into a plain Checked or review; a dry run never touches the mirror; an older write
// answer landing last does not overwrite a newer ledger; a late load paints only into its own tab. Evals the real
// JiTA.conf, JiTA.leadduty and JiTA.leadduty.ui against a stubbed Confluence property store and a fake jQuery just
// big enough for the rows.
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
const isBtn = (n) => /^<button\b/.test(n.html);
function descendants(n) { const out = []; n.kids.forEach((k) => { out.push(k); descendants(k).forEach((d) => out.push(d)); }); return out; }
function pick(list, sel) { return list.filter((k) => (sel === 'button' ? isBtn(k) : (sel.charAt(0) === '.' && has(k, sel.slice(1))))); }
function W(list) {
    return {
        length: list.length,
        filter(fn) { return W(list.filter((el) => fn.call(el))); },
        first() { return W(list.slice(0, 1)); },
        find(sel) { let out = []; list.forEach((el) => { out = out.concat(pick(descendants(el), sel)); }); return W(out); },
        prop(k, v) { if (v === undefined) { return list[0] ? list[0].props[k] : undefined; } list.forEach((el) => { el.props[k] = v; }); return this; },
        replaceWith(f) { list.forEach((el) => { const p = el.parent, i = p.kids.indexOf(el); p.kids[i] = f; f.parent = p; el.parent = null; }); return this; }
    };
}
function N(html) {
    const n = { html: html || '', attrs: {}, kids: [], handlers: {}, props: {}, _text: '', parent: null, _scroll: 0, emptied: 0, length: 1, isFake: true };
    n.attr = (k, v) => { if (v === undefined) { return n.attrs[k]; } n.attrs[k] = v; return n; };
    n.getAttribute = (k) => (n.attrs[k] == null ? null : String(n.attrs[k]));
    n.text = (t) => { if (t === undefined) { return n._text; } n._text = String(t); return n; };
    n.append = (c) => { c.parent = n; n.kids.push(c); return n; };
    n.appendTo = (p) => { p.append(n); return n; };
    n.on = (ev, fn) => { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return n; };
    n.prop = (k, v) => { if (v === undefined) { return n.props[k]; } n.props[k] = v; return n; };
    n.empty = () => { n.kids = []; n.emptied++; n._scroll = 0; return n; };   // emptying the content clamps the scroll
    n.children = (sel) => W(pick(n.kids, sel));
    n.find = (sel) => W(pick(descendants(n), sel));
    n.closest = (sel) => { for (let p = n; p; p = p.parent) { if (has(p, sel.slice(1))) { return W([p]); } } return W([]); };
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
let answer = '', promptDefault = null;
global.prompt = (q, def) => { promptDefault = def; return answer; };
global.confirm = () => true;
global.GM_addStyle = () => {};
global.window = {};   // no window.console: ledger.mutate's dry-run dump of the would-be value stays out of this output

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
    ui: { _tipKey: null, _hideTip: (now) => { if (now === true) { hides++; } }, _showTip: () => {} },
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

// failNext: the next PUT fails (HTTP 500). failGetNext: the next read fails (HTTP 503), so the whole write does.
// parkNext: the next PUT lands in the store at once, but its answer is held until release() - the shape of two
// writes whose answers come back in the other order.
const props = {};
let failNext = false, failGetNext = false, parkNext = false, release = null;
JiTA.conf.getProperty = (p, key) => {
    if (failGetNext) { failGetNext = false; return Promise.reject(new Error('HTTP 503')); }
    return Promise.resolve(props[key] ? JSON.parse(JSON.stringify(props[key])) : null);
};
JiTA.conf.saveProperty = (p, key, value, prop) => {
    if (failNext) { failNext = false; return Promise.reject(new Error('HTTP 500')); }
    props[key] = { id: key, key: key, value: JSON.parse(JSON.stringify(value)), version: (prop ? prop.version : 0) + 1 };
    const answerOf = JSON.parse(JSON.stringify(props[key]));
    if (parkNext) { parkNext = false; return new Promise((res) => { release = () => res(answerOf); }); }
    return Promise.resolve(answerOf);
};
L.report.schedule = () => {};
let mounts = 0;
L.reminder = { mount: () => { mounts++; } };   // defined after JiTA.leadduty, so not in the slice; counts chip repaints
// Any of these would mean the old reload path: count them, and empty the list as the real ones do. The real ones
// are kept for the late-load tests at the end.
const real = { qc: U._loadQc, wiki: U._loadWiki, flags: U._loadFlags, warm: U._warmQc };
const loads = { qc: 0, wiki: 0, flags: 0 };
U._loadQc = () => { loads.qc++; body.empty(); };
U._loadWiki = () => { loads.wiki++; body.empty(); };
U._loadFlags = () => { loads.flags++; body.empty(); };
const counts = [];   // every Follow-ups count painted, newest last
const tabCount = U._tabCount;
U._tabCount = function (v) { counts.push(L.qc.openFlags(v).length); return tabCount.call(U, v); };

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
let cellDisabled = null;   // were ALL the buttons in the clicked button's cell disabled straight after the click?
function press(row, label) {
    const b = button(row, label);
    if (!b) { throw new Error('no ' + label + ' button on ' + row.attrs['data-key']); }
    b.handlers.click.forEach((f) => f.call(b));
    cellDisabled = (b.parent ? b.parent.kids.filter(isBtn) : [b]).every((x) => x.props.disabled === true);
    return b;
}
async function click(row, label) { press(row, label); await settle(); }
const keys = () => rows().map((r) => r.attrs['data-key']).join(',');
const mirror = (key) => meta[key] || { done: {}, pending: [] };

(async () => {
    // ================= Quality control =================
    const qym = L._prevYm(), QK = L.QC_LEDGER_KEY, QL = L.qc.localKey(qym);
    props[QK] = { id: QK, key: QK, version: 1, value: { v: 1, months: {}, done: {}, flags: {} } };
    U._qc = {
        ym: qym, shared: true, done: {},
        record: { quota: 10, poolSize: 40, roster: L.ROSTER(), minDefects: 0, poolDefects: 5 },
        items: [
            { key: 'EBR-1', kind: 'report', summary: 'one', status: 'Closed', actor: 'Alice' },
            { key: 'EDR-2', kind: 'defect', summary: 'two', status: 'Open', actor: 'Bob' },
            { key: 'EBR-3', kind: 'report', summary: 'three', status: 'Attached', actor: 'Cara' },
            { key: 'EBR-4', kind: 'report', summary: 'four', status: 'Closed', actor: 'Dan' }
        ],
        ledgerValue: clone(props[QK].value)
    };
    U._qcLocalDone = {};
    U._tab = 'qc';
    U._renderQc();
    const base = body.emptied;
    const [r1, r2, r3, r4] = rows();
    const tail = ' · 1 defect, 3 reports · pool 40 items';
    ok('the QC list draws one row per item, keyed', keys() === 'EBR-1,EDR-2,EBR-3,EBR-4', keys());
    ok('...none of them done, each with Checked and Flag', rows().every((r) => !isDone(r) && button(r, 'Checked') && button(r, 'Flag')));

    JiTA.ui._tipKey = 'EDR-2';   // the pointer is over the row being clicked: its card is open
    await click(r2, 'Checked');
    ok('Checked: both answers in the row are disabled while the write runs', cellDisabled === true);
    ok('...the list is never emptied or reloaded', body.emptied === base && loads.qc === 0, body.emptied - base + ' empties, ' + loads.qc + ' loads');
    ok('...the rows around it are the very same elements, in the same order', rows()[0] === r1 && rows()[2] === r3 && rows()[3] === r4 && keys() === 'EBR-1,EDR-2,EBR-3,EBR-4', keys());
    let n2 = rowOf('EDR-2');
    ok('...the clicked row alone is redrawn', n2 !== r2);
    ok('...as checked, with Undo in place of Checked and Flag', isDone(n2) && tick(n2) === '✓' && !!button(n2, 'Undo') && !button(n2, 'Checked') && !button(n2, 'Flag'));
    ok('...the verdict reached the ledger and the mirror', props[QK].value.done[qym]['EDR-2'].verdict === 'ok' && props[QK].value.done[qym]['EDR-2'].by === 'schogol' && !!mirror(QL).done['EDR-2']);
    ok('...the status line counts it', status.textContent === '1 of 4 checked' + tail, status.textContent);
    ok('...the hover card of the replaced row is closed', hides === 1, String(hides));
    ok('...and the chip is repainted from the mirror just updated', mounts === 1, String(mounts));

    JiTA.ui._tipKey = 'EBR-4';   // the pointer has moved on: the card is over another row
    answer = 'wrong component';
    await click(r1, 'Flag');
    let n1 = rowOf('EBR-1');
    ok('Flag: the row shows the flag', isDone(n1) && has(n1, 'flagged') && tick(n1) === '!' && !!button(n1, 'Undo'));
    ok('...taken from the ledger the write left behind, reason and all', U._qc.done['EBR-1'] && U._qc.done['EBR-1'].verdict === 'flag' &&
        props[QK].value.flags['EBR-1'].note === 'wrong component');
    ok('...the card open over another row stays up', hides === 1, String(hides));
    ok('...the Follow-ups count follows the flag', counts[counts.length - 1] === 1, String(counts));
    ok('...still no reload, and the other rows untouched', body.emptied === base && loads.qc === 0 && rows()[2] === r3 && rows()[3] === r4);
    ok('...status counts both', status.textContent === '2 of 4 checked' + tail, status.textContent);

    await click(n2, 'Undo');
    const u2 = rowOf('EDR-2');
    ok('Undo: the row is back to undone, with Checked and Flag', !isDone(u2) && tick(u2) === '' && !!button(u2, 'Checked') && !!button(u2, 'Flag'));
    ok('...the verdict left the ledger, the mirror and this tab\'s copy', !props[QK].value.done[qym]['EDR-2'] && !mirror(QL).done['EDR-2'] && !U._qcLocalDone['EDR-2'] && !U._qc.done['EDR-2']);
    ok('...the status line says so first', status.textContent === 'EDR-2 is back on your list · 1 of 4 checked' + tail, status.textContent);
    ok('...the chip is repainted after the Undo too', mounts === 3, String(mounts));
    ok('...and the other rows stay put', rows()[0] === n1 && rows()[2] === r3 && body.emptied === base);

    // Another Lead resolves the flag meanwhile, so this tab still offers Undo - and the ledger refuses it.
    await L.qc.resolveFlag('EBR-1', 'talked');
    await click(n1, 'Undo');
    n1 = rowOf('EBR-1');
    ok('a refused Undo shows the row as the ledger has it: still flagged, no Undo any more', isDone(n1) && tick(n1) === '!' && !button(n1, 'Undo'));
    ok('...and says why', status.textContent.indexOf('Could not undo - the ledger changed') === 0, status.textContent);
    ok('...while the mirror and this tab keep the mark, so the chip still counts it as done', !!mirror(QL).done['EBR-1'] && !!U._qcLocalDone['EBR-1']);

    await click(rowOf('EDR-2'), 'Checked');
    failGetNext = true;
    await click(rowOf('EDR-2'), 'Undo');
    n2 = rowOf('EDR-2');
    ok('an Undo that cannot reach Confluence leaves the row checked, and says so', isDone(n2) && !!button(n2, 'Undo') && status.textContent.indexOf('Could not undo on Confluence - HTTP 503') === 0, status.textContent);
    ok('...keeping the mark in the mirror and in this tab', !!mirror(QL).done['EDR-2'] && !!U._qcLocalDone['EDR-2'] && !!props[QK].value.done[qym]['EDR-2']);

    failNext = true;
    await click(r3, 'Checked');
    let n3 = rowOf('EBR-3');
    ok('a write that fails: the row still shows the mark, from the local mirror', isDone(n3) && tick(n3) === '✓' && !!button(n3, 'Undo'));
    ok('...the status line says it was saved locally, and counts it', status.textContent === 'Saved locally only - HTTP 500 It will be retried automatically. · 3 of 4 checked' + tail, status.textContent);
    ok('...nothing reached the ledger, and the mirror holds it for the retry', !props[QK].value.done[qym]['EBR-3'] && mirror(QL).pending.indexOf('EBR-3') >= 0);
    failGetNext = true;
    await click(n3, 'Undo');
    n3 = rowOf('EBR-3');
    ok('...an Undo of that local-only mark works even while Confluence is still down', !isDone(n3) && !!button(n3, 'Checked'));
    ok('...and says so, not that it failed', status.textContent === 'EBR-3 is back on your list · 2 of 4 checked' + tail, status.textContent);
    ok('...the mark left the mirror, pending and done', !mirror(QL).done['EBR-3'] && mirror(QL).pending.indexOf('EBR-3') < 0 && !U._qcLocalDone['EBR-3']);

    failNext = true;
    answer = 'bad title';
    await click(r4, 'Flag');
    let n4 = rowOf('EBR-4');
    ok('a Flag that cannot be saved is not queued: the row stays open with both answers live again', !isDone(n4) && !!button(n4, 'Checked') && !!button(n4, 'Flag') && !button(n4, 'Checked').props.disabled);
    ok('...the status line says it was not saved', status.textContent === 'Not saved - HTTP 500 Try again once Confluence answers. · 2 of 4 checked' + tail, status.textContent);
    ok('...nothing is in the mirror for a replay to turn into a plain Checked', !mirror(QL).done['EBR-4'] && mirror(QL).pending.indexOf('EBR-4') < 0 && !U._qcLocalDone['EBR-4']);
    answer = 'bad title, as said';
    await click(n4, 'Flag');
    n4 = rowOf('EBR-4');
    ok('...the next Flag offers the reason typed before', promptDefault === 'bad title', String(promptDefault));
    ok('...and once it is saved the draft is gone', isDone(n4) && tick(n4) === '!' && !U._drafts['EBR-4'] && props[QK].value.flags['EBR-4'].note === 'bad title, as said');

    gm.leadDutyDryRun = true;
    await click(n3, 'Checked');
    n3 = rowOf('EBR-3');
    ok('a dry run: the row shows the mark for this session only', isDone(n3));
    ok('...the mirror is not touched, so nothing is replayed for real later', !mirror(QL).done['EBR-3'] && mirror(QL).pending.indexOf('EBR-3') < 0);
    ok('...the value nobody wrote is not taken as the ledger', !U._qc.done['EBR-3'] && !props[QK].value.done[qym]['EBR-3']);
    ok('...and the status line says DRY RUN once', status.textContent.split('DRY RUN').length === 2, status.textContent);
    await click(n3, 'Undo');
    ok('...an Undo of the dry mark takes it back', !isDone(rowOf('EBR-3')));
    await click(rowOf('EDR-2'), 'Undo');
    n2 = rowOf('EDR-2');
    ok('...a dry-run Undo of a mark the ledger holds leaves it standing, and says DRY RUN once', isDone(n2) && !!mirror(QL).done['EDR-2'] &&
        !!U._qcLocalDone['EDR-2'] && !!props[QK].value.done[qym]['EDR-2'] && status.textContent.split('DRY RUN').length === 2, status.textContent);
    delete gm.leadDutyDryRun;

    // Two writes whose answers come back in the other order: the second must not be overwritten by the first.
    await click(rowOf('EDR-2'), 'Undo');
    parkNext = true;
    press(rowOf('EBR-3'), 'Checked');              // its PUT lands, its answer is held
    await settle();
    answer = 'two of them';
    await click(rowOf('EDR-2'), 'Flag');           // reads EBR-3's write, saves on top, answers first
    const newer = U._qc.ledgerVersion;
    release();
    await settle();
    ok('an older answer landing last is not taken over the newer ledger', U._qc.ledgerVersion === newer && !!U._qc.ledgerValue.flags['EDR-2'], U._qc.ledgerVersion + ' vs ' + newer);
    ok('...the late row is still drawn from the ledger, which carries it', !!U._qc.done['EBR-3'] && U._qc.done['EBR-3'].verdict === 'ok' && isDone(rowOf('EBR-3')));
    ok('...and the Follow-ups count is right', counts[counts.length - 1] === 2, String(counts));

    // A mark that lands after the Lead switched tabs must not draw into the other tab, but must still count.
    await click(rowOf('EBR-4'), 'Undo');
    const before = rows().slice();
    answer = 'switched';
    press(rowOf('EBR-4'), 'Flag');
    U._tab = 'flags';
    await settle();
    ok('a mark landing on another tab redraws nothing', rows().every((r, i) => r === before[i]));
    ok('...but is folded into the QC state, and the Follow-ups count follows it', !!U._qc.done['EBR-4'] && !!U._qcLocalDone['EBR-4'] && counts[counts.length - 1] === 2, String(counts));
    U._tab = 'qc';
    U._renderQc();
    ok('...which the tab shows when it comes back', isDone(rowOf('EBR-4')));

    // A Refresh empties the list while an Undo is in flight: the settle must not paint over the rebuild.
    parkNext = true;
    press(rowOf('EBR-3'), 'Undo');
    await settle();
    body.empty();
    status.textContent = 'Sampling ' + qym + '…';
    release();
    await settle();
    ok('a settle with no row to swap paints nothing over the rebuild', rows().length === 0 && status.textContent === 'Sampling ' + qym + '…', status.textContent);
    ok('...but still folds the Undo into the state', !U._qc.done['EBR-3']);
    U._renderQc();

    // ================= Wiki review =================
    const ym = L._ym(), WK = L.LEDGER_KEY, WL = L.wiki.localKey(ym), today = new Date().toISOString().slice(0, 10);
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
    ok('Mark reviewed: both answers in the row are disabled while the write runs', cellDisabled === true);
    ok('...the list is never emptied or reloaded', body.emptied === wbase && loads.wiki === 0);
    ok('...the rows around it stay the same elements', rows()[0] === w1 && rows()[2] === w3 && m2 !== w2);
    ok('...the row shows the review, with Undo', isDone(m2) && tick(m2) === '✓' && !!button(m2, 'Undo') && !button(m2, 'Mark reviewed'));
    ok('...and its new stamp, read from the ledger the write left behind', metaText(m2).indexOf('last reviewed ' + today + ' by schogol') === 0, metaText(m2));
    ok('...status counts it', status.textContent === '1 of 3 done', status.textContent);

    await click(w3, 'Skip');
    const m3 = rowOf('p3');
    ok('Skip: the row shows the skip, and its history is untouched', tick(m3) === '–' && metaText(m3).indexOf('last reviewed 2025-06-01 by solnichka') === 0, metaText(m3));
    ok('...the first row still untouched', rows()[0] === w1);

    await click(m2, 'Undo');
    m2 = rowOf('p2');
    ok('Undo: the page is back on the list, history restored', !isDone(m2) && !!button(m2, 'Mark reviewed') && metaText(m2) === 'never reviewed', metaText(m2));
    ok('...the status line says so first', status.textContent === '"Beta" is back on your list · 1 of 3 done', status.textContent);
    ok('...and nothing was reloaded', body.emptied === wbase && loads.wiki === 0 && rows()[0] === w1);

    failNext = true;
    await click(w1, 'Mark reviewed');
    let m1 = rowOf('p1');
    ok('a wiki write that fails: the row shows the review from the local mirror, with Undo', isDone(m1) && tick(m1) === '✓' && !!button(m1, 'Undo'));
    ok('...the status line says so, and counts it', status.textContent === 'Saved locally only - HTTP 500 It will be retried automatically. · 2 of 3 done', status.textContent);
    ok('...nothing reached the ledger, the mirror holds it for the retry', !props[WK].value.done[ym] || !props[WK].value.done[ym].p1);
    ok('...pending in the mirror', mirror(WL).pending.indexOf('p1') >= 0);
    await click(m1, 'Undo');
    m1 = rowOf('p1');
    ok('...and Undo takes the local-only mark back', !isDone(m1) && mirror(WL).pending.indexOf('p1') < 0 && status.textContent === '"Alpha" is back on your list · 1 of 3 done', status.textContent);

    failNext = true;
    await click(m1, 'Skip');
    m1 = rowOf('p1');
    ok('a Skip that cannot be saved is not queued as a review: the row stays open, both answers live', !isDone(m1) && !!button(m1, 'Mark reviewed') && !!button(m1, 'Skip') && !button(m1, 'Skip').props.disabled);
    ok('...the mirror has nothing to replay', !mirror(WL).done.p1 && mirror(WL).pending.indexOf('p1') < 0);
    ok('...and the status line says it was not saved', status.textContent === 'Not saved - HTTP 500 Try again once Confluence answers. · 1 of 3 done', status.textContent);

    gm.leadDutyDryRun = true;
    await click(m1, 'Mark reviewed');
    ok('a wiki dry run leaves the mirror alone and says DRY RUN once', !mirror(WL).done.p1 && mirror(WL).pending.indexOf('p1') < 0 && status.textContent.split('DRY RUN').length === 2, status.textContent);
    await click(rowOf('p1'), 'Undo');
    delete gm.leadDutyDryRun;

    await click(rowOf('p2'), 'Mark reviewed');
    failGetNext = true;
    await click(rowOf('p2'), 'Undo');
    m2 = rowOf('p2');
    ok('a wiki Undo that cannot reach Confluence leaves the row reviewed, and says so', isDone(m2) && !!button(m2, 'Undo') &&
        status.textContent.indexOf('Could not undo on Confluence - HTTP 503') === 0, status.textContent);
    ok('...keeping the mark in the mirror and in this tab', !!mirror(WL).done.p2 && !!U._wikiLocalDone.p2);
    await click(m2, 'Undo');
    ok('...and the next Undo goes through', !isDone(rowOf('p2')) && !mirror(WL).done.p2 && !U._wikiLocalDone.p2);

    // A review landing after the Lead switched tabs: nothing is drawn, but the wiki state takes it.
    const wbefore = rows().slice();
    press(rowOf('p1'), 'Mark reviewed');
    U._tab = 'qc';
    await settle();
    ok('a review landing on another tab redraws nothing', rows().every((r, i) => r === wbefore[i]));
    ok('...but is folded into the wiki state', !!(U._wiki.ledgerValue.done[ym] && U._wiki.ledgerValue.done[ym].p1) && !!U._wikiLocalDone.p1);
    U._tab = 'wiki';
    U._renderWiki();

    parkNext = true;
    press(rowOf('p1'), 'Undo');
    await settle();
    body.empty();
    status.textContent = 'Loading the wiki queue…';
    release();
    await settle();
    ok('a wiki settle with no row to swap paints nothing over the rebuild', rows().length === 0 && status.textContent === 'Loading the wiki queue…', status.textContent);
    U._renderWiki();

    // ================= Follow-ups =================
    U._tab = 'flags';
    U._renderFlags(clone(props[QK].value));
    body._scroll = 120;
    const resolveButtons = () => descendants(body).filter((n) => n.html.indexOf('>Resolve</button>') >= 0);
    let fbase = body.emptied;
    answer = 'talked it through';
    failNext = true;
    let rb = resolveButtons()[0];
    rb.handlers.click.forEach((f) => f.call(rb));
    await settle();
    ok('a Resolve that fails: its button comes back and the tab is left as it was', rb.props.disabled === false && body.emptied === fbase && loads.flags === 0);
    ok('...the status line says why', status.textContent.indexOf('Could not resolve: HTTP 500') === 0, status.textContent);

    const openBefore = L.qc.openFlags(props[QK].value).length;
    rb = resolveButtons()[0];
    rb.handlers.click.forEach((f) => f.call(rb));
    await settle();
    ok('Resolve: the tab is not reloaded through a ledger read', loads.flags === 0);
    ok('...it is redrawn once, from the value just written', body.emptied === fbase + 1 && resolveButtons().length === openBefore - 1);
    ok('...at the same scroll position', body._scroll === 120, String(body._scroll));
    ok('...the count follows it', counts[counts.length - 1] === openBefore - 1, String(counts));
    const resolvedKey = Object.keys(props[QK].value.flags).filter((k) => props[QK].value.flags[k].resolvedAt && props[QK].value.flags[k].outcome === 'talked it through')[0];
    ok('...and the QC tab learns the flag is resolved, so it stops offering Undo on it', !!(U._qc.ledgerValue.flags[resolvedKey] && U._qc.ledgerValue.flags[resolvedKey].resolvedAt));

    fbase = body.emptied;
    rb = resolveButtons()[0];
    rb.handlers.click.forEach((f) => f.call(rb));
    U._tab = 'qc';                                 // the Lead moved on before the write landed
    await settle();
    ok('a Resolve landing on another tab leaves that tab alone', body.emptied === fbase && loads.flags === 0);
    ok('...but the count and the QC state follow it', counts[counts.length - 1] === L.qc.openFlags(props[QK].value).length && L.qc.openFlags(U._qc.ledgerValue).length === L.qc.openFlags(props[QK].value).length, String(counts));

    await L.qc.markChecked('EBR-3', 'flag', qym, 'late', { kind: 'report', summary: 'three', actor: 'Cara' });
    gm.leadDutyDryRun = true;
    U._tab = 'flags';
    U._renderFlags(clone(props[QK].value));
    rb = resolveButtons()[0];
    rb.handlers.click.forEach((f) => f.call(rb));
    U._tab = 'qc';
    await settle();
    ok('a dry-run Resolve landing on another tab does not reload Follow-ups into it', loads.flags === 0);
    U._tab = 'flags';
    U._renderFlags(clone(props[QK].value));
    rb = resolveButtons()[0];
    rb.handlers.click.forEach((f) => f.call(rb));
    await settle();
    ok('...on the Follow-ups tab it reads the ledger as it is, since nothing was written', loads.flags === 1);
    delete gm.leadDutyDryRun;

    // ================= Late loads paint only into their own tab =================
    const errorShown = (msg) => !!find(body, (n) => n._text === msg);
    status.textContent = '';
    body.empty();
    U._tab = 'flags';
    counts.push('stale');                          // so the check below sees this load's count, not an earlier one
    real.flags.call(U, false);
    U._tab = 'wiki';                               // clicked away before the ledger read came back
    await settle();
    ok('a Follow-ups load landing on another tab leaves its body alone', !find(body, (n) => n._text === 'Open follow-ups, by the person who handled them'));
    ok('...but still updates the count', counts[counts.length - 1] === L.qc.openFlags(props[QK].value).length, String(counts.slice(-2)));
    failGetNext = true;
    U._tab = 'flags';
    real.flags.call(U, false);
    await settle();
    ok('a Follow-ups load that fails on its own tab says why', errorShown('HTTP 503'));
    failGetNext = true;
    real.flags.call(U, false);
    U._tab = 'wiki';
    await settle();
    ok('...and says nothing over another tab', !errorShown('HTTP 503'));

    const wikiState = U._wiki, claim = L.wiki.claimMonth;
    L.wiki.claimMonth = () => Promise.resolve(wikiState);
    U._tab = 'wiki';
    real.wiki.call(U, false);
    await settle(); await settle();
    ok('a wiki load on its own tab draws its rows', keys() === 'p1,p2,p3', keys());
    real.wiki.call(U, false);
    U._tab = 'qc';
    await settle(); await settle();
    ok('a wiki load landing on another tab paints no wiki rows into it', rows().length === 0 && U._wiki === wikiState);
    L.wiki.claimMonth = () => Promise.reject(new Error('HTTP 502'));
    U._tab = 'wiki';
    real.wiki.call(U, false);
    await settle();
    ok('a wiki load that fails on its own tab says why', errorShown('HTTP 502'));
    real.wiki.call(U, false);
    U._tab = 'qc';
    await settle();
    ok('...and says nothing over another tab', !errorShown('HTTP 502'));
    L.wiki.claimMonth = claim;

    const qcState = U._qc;
    U._warmQc = () => Promise.resolve(qcState);
    U._tab = 'qc';
    real.qc.call(U, false);
    await settle(); await settle();
    ok('a QC load on its own tab draws its rows', keys() === 'EBR-1,EDR-2,EBR-3,EBR-4', keys());
    real.qc.call(U, false);
    U._tab = 'wiki';
    await settle(); await settle();
    ok('a QC load landing on another tab paints no QC rows into it', rows().length === 0 && U._qc === qcState);
    U._warmQc = () => Promise.reject(new Error('HTTP 504'));
    U._tab = 'qc';
    real.qc.call(U, false);
    await settle();
    ok('a QC load that fails on its own tab says why', errorShown('HTTP 504'));
    real.qc.call(U, false);
    U._tab = 'wiki';
    await settle();
    ok('...and says nothing over another tab', !errorShown('HTTP 504'));
    U._warmQc = real.warm;

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'row checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
