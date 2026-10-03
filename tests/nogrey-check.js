// nogrey-check.js - a long-fixed defect ranks lower but is not greyed (v3.39.5). Evals the real code against stubs:
//  - suggestBest still demotes a defect fixed long before the report and notes the gap, in Keyword and in Hybrid,
//    but no longer flags it for greying
//  - the panel row greys only a closed report from the reporter's list, never a demoted defect
//  - both reporter lists (panel and Triage mode) flag their closed reports, and both stylesheets dim that flag
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};
const member = (head) => cut(head, '\n    },') + '\n    },';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a jQuery stand-in: $('<tag>') is an element that records its classes, text and children ----
function El(html) {
    const e = { html: html, classes: {}, txt: '', attrs: {}, kids: [] };
    const j = {
        el: e,
        attr: (k, v) => { e.attrs[k] = v; return j; },
        addClass: (c) => { c.split(' ').forEach((x) => { e.classes[x] = true; }); return j; },
        on: () => j,
        text: (v) => { if (v === undefined) { return e.txt; } e.txt = v; return j; },
        appendTo: (p) => { p.el.kids.push(j); return j; }
    };
    return j;
}
global.$ = (x) => El(x);

global.JiTA = {
    TOP_N: 8,
    worker: { _started: true, usable: () => true },
    embed: { WARM_WAIT_MS: 1500 },
    rank: { CAND: 50 },
    trend: { badge: () => null },
    ui: { _showTip: () => {}, _hideTip: () => {} },
    util: {}
};
Object.assign(JiTA.util, eval('({' + member('    isResolved: function (status, resolution) {') + member('    staleFactor: function (brCreatedIso, resolutionDateIso) {') +
    member('    humanizeAge: function (days) {') + cut('    fmtDate: function (iso) {', '\n    }\n};') + '\n    }' + '})'));   // the last member: no comma after it
(0, eval)(cut('JiTA.rank._pickMode = function (', '\n};\n') + '\n};');
(0, eval)(cut('JiTA.rank.suggestBest = function (', '\n};\n') + '\n};');
Object.assign(JiTA.ui, eval('({' + member('    _row: function (r, target, action, opts) {') + member('    _reporterRow: function (r) {') + '})'));

const REPORT = '2026-09-01T00:00:00.000Z';
const fixedLongAgo = () => ({ key: 'EDR-1', status: 'Closed', resolution: 'Fixed', resolutiondate: '2024-09-01T00:00:00.000Z', summary: 'old fix' });
const open = () => ({ key: 'EDR-2', status: 'Open', resolution: null, summary: 'still open' });
const flagged = (r) => ['stale', 'closed'].filter((k) => k in r);

(async () => {
    // ================= Keyword =================
    JiTA.rank.suggest = () => Promise.resolve([Object.assign(fixedLongAgo(), { score: 10 }), Object.assign(open(), { score: 8 })]);
    let out = await JiTA.rank.suggestBest('text', 'EBR-9', REPORT, 'Keyword', []);
    let old = out.results.filter((r) => r.key === 'EDR-1')[0], cur = out.results.filter((r) => r.key === 'EDR-2')[0];
    ok('Keyword: a defect fixed two years before the report still ranks lower', out.results[0].key === 'EDR-2' && old.pct < cur.pct, out.results.map((r) => r.key + ' ' + r.pct).join(', '));
    ok('...and still says how long before the report it was fixed', /^fixed 2y before report$/.test(old.staleNote || ''), old.staleNote);
    ok('...but is not flagged to be greyed', flagged(old).length === 0, flagged(old).join());
    ok('an open defect is left alone (control)', !cur.staleNote && flagged(cur).length === 0 && cur.pct === 100);

    // ================= Hybrid =================
    JiTA.rank._hybridResults = (text, key, terms, scope, bmFn, keywordOnly, demote) => {
        const a = Object.assign(fixedLongAgo(), { rrf: 0.03, pct: 86 }), b = Object.assign(open(), { rrf: 0.02, pct: 80 });
        demote(a); demote(b);
        return Promise.resolve({ mode: 'Hybrid', results: [a, b] });
    };
    out = await JiTA.rank.suggestBest('text', 'EBR-9', REPORT, 'Hybrid', []);
    old = out.results[0]; cur = out.results[1];
    ok('Hybrid: the long-fixed defect is scaled down', out.mode === 'Hybrid' && old.pct === 43 && old.rrf < 0.03, old.pct + ' / ' + old.rrf);
    ok('...noted, and not flagged to be greyed', /before report$/.test(old.staleNote || '') && flagged(old).length === 0, flagged(old).join());
    ok('...and the open one is untouched (control)', cur.pct === 80 && !cur.staleNote);

    // ================= the panel row =================
    const li = (row) => row.el;
    const meta = (row) => (row.el.kids.filter((k) => /jita-sd-meta/.test(k.el.html))[0] || { el: { txt: '' } }).el.txt;
    let row = JiTA.ui._row(old, '_self', () => El('<span>'));
    ok('a demoted defect\'s row is not greyed', Object.keys(li(row).classes).length === 0, Object.keys(li(row).classes).join());
    ok('...and its meta line still carries the note', /fixed 2y before report/.test(meta(row)), meta(row));
    row = JiTA.ui._reporterRow({ key: 'EBR-5', status: 'Closed', closed: true, summary: 'their older report' });
    ok('a closed report in the reporter\'s list is still greyed', li(row).classes['jita-sd-closed'] === true, Object.keys(li(row).classes).join());
    row = JiTA.ui._reporterRow({ key: 'EBR-6', status: 'Open', closed: false, summary: 'their open report' });
    ok('...an open one is not (control)', Object.keys(li(row).classes).length === 0);

    // ================= the reporter lists and the stylesheets =================
    ok('the panel\'s reporter list flags its closed reports',
        src.indexOf('                        closed: JiTA.util.isClosedStatus(status)   // grey out closed reports so the open ones stand out') >= 0);
    ok('Triage mode\'s reporter list flags its closed reports',
        src.indexOf('                        closed: JiTA.util.isClosedStatus(status)   // grey the closed ones so the open ones stand out') >= 0);
    ok('Triage mode greys a row on that flag alone', src.indexOf("                    if (r.closed) { $li.addClass('jt-closed'); }") >= 0);
    ok('both stylesheets dim the closed flag', src.indexOf('#jita-sd-list li.jita-sd-closed { opacity: .6; }') >= 0 && src.indexOf("'.jita-triage-view .jt-list li.jt-closed { opacity: .55; }'") >= 0);
    ok('no stale-grey class is left anywhere', !/jita-sd-stale|jt-stale/.test(src));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'no-grey checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
