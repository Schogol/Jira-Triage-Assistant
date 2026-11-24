// toastwork-check.js - the toast at the bottom right (JiTA.ui.toast / work / workDone, v3.58.0): a short notice that
// goes after TOAST_MS, and the background work of the tab (a sync, the translation pass, embedding), each job a line of
// its own under "Triage Assistant" for as long as it runs:
//  - a job shows only once it has run WORK_SHOW_MS (one over at once never flashes up), and an update keeps its start
//  - jobs in the order they started; the toast stays up until the last one ends, a notice showing below them meanwhile
//  - a job not heard from for WORK_STALE_MS is dropped (a pass whose end never came)
//  - a job's end can say something, as a notice; the work of a frame inside the page is not drawn
//  - the ISD credits progress box shares the corner: the toast goes above it
// Evals the real members against a small jQuery stand-in, on clock.js.
require('./clock').install();
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const at = (ms) => new Promise((r) => setTimeout(r, ms));   // the clock moves on by ms, running what falls due

// ---- a jQuery stand-in for what the toast uses ----
const page = {};   // id -> element appended to the body
const mk = (html) => {
    const m = /^<div(?: id="([^"]+)")?(?: class="([^"]+)")?><\/div>$/.exec(html);
    if (!m) { throw new Error('unexpected markup ' + html); }
    return { id: m[1] || '', cls: m[2] || '', kids: [], txt: '', shown: false, css: {} };
};
global.$ = (sel) => {
    const nodes = sel[0] === '<' ? [mk(sel)] : (page[sel.slice(1)] ? [page[sel.slice(1)]] : []);
    const w = {
        length: nodes.length,
        appendTo(p) { nodes.forEach((n) => { if (p === document.body) { page[n.id] = n; } else { p.nodes[0].kids.push(n); } }); return w; },
        text(t) { nodes.forEach((n) => { n.txt = t; }); return w; },
        empty() { nodes.forEach((n) => { n.kids = []; }); return w; },
        stop() { return w; },
        fadeOut() { nodes.forEach((n) => { n.shown = false; }); return w; },
        show() { nodes.forEach((n) => { n.shown = true; }); return w; },
        css(k, v) { nodes.forEach((n) => { n.css[k] = v; }); return w; },
        nodes: nodes
    };
    return w;
};
let credits = null;
global.document = { body: {}, getElementById: (id) => (id === 'jita-credits-progress' ? credits : null) };
global.JITA_IS_SUBFRAME = false;
global.JiTA = { ui: {} };
Object.assign(JiTA.ui, eval(S.members(src, 'JiTA.ui', ['_toastTimer', 'TOAST_MS', 'WORK_SHOW_MS', 'WORK_STALE_MS', '_work', '_toastMsg', '_workTimer',
    'toast', 'work', 'workDone', '_drawToast'])));
JiTA.ui.injectCss = () => {};
const U = JiTA.ui;

// What the toast shows: '' when it is not up, else its lines (the title in [ ], a notice after a |).
const seen = () => {
    const t = page['jita-sd-toast'];
    if (!t || !t.shown) { return ''; }
    return t.kids.map((k) => (k.cls === 'jita-toast-h' ? '[' + k.txt + ']' : k.cls === 'jita-toast-msg' ? '| ' + k.txt : k.txt)).join(' / ');
};

(async () => {
    // ================= a notice =================
    U.toast('Defect sync complete - 5 defects in local DB.');
    ok('a notice shows at once, on its own', seen() === '| Defect sync complete - 5 defects in local DB.', seen());
    await at(U.TOAST_MS - 10);
    ok('...for TOAST_MS', seen() !== '', seen());
    await at(20);
    ok('...then the toast goes', seen() === '', seen());

    // ================= a job =================
    U.work('sync', 'Syncing defects… 100 fetched');
    ok('a job is not shown at once', seen() === '', seen());
    await at(U.WORK_SHOW_MS / 2);
    U.work('sync', 'Syncing defects… 200 fetched');
    await at(U.WORK_SHOW_MS / 2 + 5);
    ok('...but once it has run WORK_SHOW_MS, counted from its start, not from its last word: under the title, as it says now',
        seen() === '[Triage Assistant] / Syncing defects… 200 fetched', seen());
    U.work('translate', 'Translating foreign reports… 1 / 433');
    await at(U.WORK_SHOW_MS + 5);
    ok('two jobs, each a line of its own, in the order they started', seen() === '[Triage Assistant] / Syncing defects… 200 fetched / Translating foreign reports… 1 / 433', seen());
    U.toast('Starting bug report sync…');
    ok('a notice shows below the jobs', seen() === '[Triage Assistant] / Syncing defects… 200 fetched / Translating foreign reports… 1 / 433 / | Starting bug report sync…', seen());
    await at(U.TOAST_MS + 5);
    U.work('sync', 'Syncing defects… 300 fetched');
    U.work('translate', 'Translating foreign reports… 2 / 433');
    ok('...and goes after TOAST_MS, the jobs staying', seen() === '[Triage Assistant] / Syncing defects… 300 fetched / Translating foreign reports… 2 / 433', seen());
    U.workDone('sync');
    ok('a job that ends goes, the other staying', seen() === '[Triage Assistant] / Translating foreign reports… 2 / 433', seen());
    U.workDone('translate', 'Translated 81 foreign reports.');
    ok('the last one ending with something to say: that, as a notice, and no title', seen() === '| Translated 81 foreign reports.', seen());
    await at(U.TOAST_MS + 5);
    ok('...which goes after TOAST_MS', seen() === '', seen());

    // ================= quick, quiet, stale =================
    U.work('translate', 'Checking reports for translation… 3 / 3');
    await at(U.WORK_SHOW_MS - 100);
    U.workDone('translate');
    await at(200);
    ok('a job over within WORK_SHOW_MS never shows', seen() === '' && !Object.keys(U._work).length, seen());
    U.workDone('nothing');
    ok('the end of a job that never started changes nothing', seen() === '', seen());
    U.work('embed', 'Embedding 50 / 400 (13%)…');
    await at(U.WORK_SHOW_MS + 5);
    ok('a job that goes quiet shows (control)', seen() === '[Triage Assistant] / Embedding 50 / 400 (13%)…', seen());
    await at(U.WORK_STALE_MS + U.WORK_STALE_MS / 6);
    ok('...and is dropped once WORK_STALE_MS have passed without a word, the toast going with it', seen() === '' && !U._work.embed, seen() + ' ' + JSON.stringify(U._work));

    // ================= the corner it shares, and frames =================
    credits = { offsetHeight: 60 };
    U.toast('x');
    ok('with the ISD credits progress box there, the toast goes above it', page['jita-sd-toast'].css.bottom === '88px', JSON.stringify(page['jita-sd-toast'].css));
    credits = null;
    U.toast('y');
    ok('...and back down without it', page['jita-sd-toast'].css.bottom === '', JSON.stringify(page['jita-sd-toast'].css));
    await at(U.TOAST_MS + 5);
    global.JITA_IS_SUBFRAME = true;
    U.work('sync', 'Syncing defects… 1 fetched');
    await at(U.WORK_SHOW_MS + 5);
    ok('the work of a frame inside the page is not drawn: the toast belongs to the page', seen() === '' && !U._work.sync, seen());
    global.JITA_IS_SUBFRAME = false;

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'toast checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
