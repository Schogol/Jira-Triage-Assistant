// mutate-trend.js - breaks each guard of the trending defects (v3.34.0) in turn and requires the harness that owns
// it to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const TR = 'trend-check.js', FM = 'filtermenu-check.js', TG = 'triage-check.js', TK = 'trendkey-check.js';
const muts = [
    // ---- counting ----
    [TR, 'window edge inclusive', 'if (age < win) { d.recent.push(f.created); }', 'if (age <= win) { d.recent.push(f.created); }'],
    [TR, 'baseline edge inclusive', 'if (age >= span) { continue; }', 'if (age > span) { continue; }'],
    [TR, 'duplicate link not preferred', 'var use = dup.length ? dup : any, seen = {};', 'var use = any, seen = {};'],
    [TR, 'no fallback without a duplicate link', 'var use = dup.length ? dup : any, seen = {};', 'var use = dup, seen = {};'],
    [TR, 'a report counted twice for one defect', '                if (seen[key]) { continue; }\n', ''],
    [TR, 'loose defect key match', 'DEFECT_RE: /^(EDR|EO|PLAT)-\\d+$/,', 'DEFECT_RE: /(EDR|EO|PLAT)-\\d+/,'],
    [TR, 'baseline-only defects kept', "Object.keys(defects).forEach(function (key) { if (!defects[key].recent.length) { delete defects[key]; } });", ''],
    [TR, 'report total counts unlinked reports', 'if (use.length) { reports++; }', 'reports++;'],
    // ---- trend + list ----
    [TR, 'no "new"', "if (!base) { return 'new'; }", ''],
    [TR, 'rising needs more than double', "if (n >= 2 * usual) { return 'up'; }", "if (n > 2 * usual) { return 'up'; }"],
    [TR, 'falling needs less than half', "if (n <= usual / 2) { return 'down'; }", "if (n < usual / 2) { return 'down'; }"],
    [TR, 'MIN off by one', '            if (n < T.MIN) { return; }\n            var last', '            if (n < T.MIN - 1) { return; }\n            var last'],
    [TR, 'no recency tie-break', "            if (a.last !== b.last) { return a.last < b.last ? 1 : -1; }\n", ''],
    [TR, 'day buckets reversed', 'if (ago < T.WINDOW_DAYS) { out[T.WINDOW_DAYS - 1 - ago]++; }', 'if (ago < T.WINDOW_DAYS) { out[ago]++; }'],
    [TR, 'after-fix for a reopened defect', 'if (!r.resolutiondate || !JiTA.util.isResolved(r.status, r.resolution)) { return 0; }', 'if (!r.resolutiondate) { return 0; }'],
    [TR, 'after-fix warns at one', "if (r.afterFix >= T.AFTER_FIX_MIN) { bits.push(", "if (r.afterFix >= 1) { bits.push("],
    [TR, 'rows keep the stale link status', '                        if (rec.status) { r.status = rec.status; }\n', ''],
    // ---- badge ----
    [TR, 'badge from a day-old count', "if (!d || d.v !== T.V || (Date.now() - d.at) > T.STALE_MS) { return 0; }", "if (!d || d.v !== T.V) { return 0; }"],
    [TR, 'badge from another shape', "if (!d || d.v !== T.V || (Date.now() - d.at) > T.STALE_MS) { return 0; }", "if (!d || (Date.now() - d.at) > T.STALE_MS) { return 0; }"],
    [TR, 'badge below MIN', "        if (n < T.MIN) { return null; }", "        if (!n) { return null; }"],
    // ---- the cache ----
    [TR, "another tab's count ignored", 'if (cached && cached.v === T.V && (!T._data || cached.at > T._data.at)) { T._data = cached; }', ''],
    [TR, 'a cached record of another shape adopted', 'if (cached && cached.v === T.V && (!T._data || cached.at > T._data.at))', 'if (cached && (!T._data || cached.at > T._data.at))'],
    [TR, 'an adopted fresh count refetched', "            if (!force && T._fresh(T._data)) { return T._data; }\n            if (!force && T._failAt", "            if (!force && T._failAt"],
    [TR, 'not single-flight', "        if (T._busy) { return T._busy; }\n        var p = JiTA.db.getMeta(T.CACHE_KEY)", "        var p = JiTA.db.getMeta(T.CACHE_KEY)"],
    [TR, 'no failure back-off', 'if (!force && T._failAt && (Date.now() - T._failAt) < T.FAIL_MS) {', 'if (false) {'],
    [TR, 'force blocked by the back-off', 'if (!force && T._failAt && (Date.now() - T._failAt) < T.FAIL_MS) {', 'if (T._failAt && (Date.now() - T._failAt) < T.FAIL_MS) {'],
    [TR, 'lease ignored', "            if (!force && T._data && !T._leaseFree()) { return T._data; }   // another tab is counting right now\n", ''],
    [TR, 'an abandoned lease blocks forever', "return !l || !l.ts || (Date.now() - l.ts) > JiTA.trend.LEASE_MS || l.tabId === JiTA.sched.tabId;", "return !l || !l.ts || l.tabId === JiTA.sched.tabId;"],
    [TR, 'a failure blanks the list', "                if (T._data) { return T._data; }\n                throw e;", "                throw e;"],
    [TR, 'lease kept after a failure', "            }, function (e) {\n                T._release();\n", "            }, function (e) {\n"],
    [TR, 'lease kept after a success', "                T._data = d; T._error = null; T._failAt = 0;\n                T._release();\n", "                T._data = d; T._error = null; T._failAt = 0;\n"],
    [TR, 'success leaves the error', "T._data = d; T._error = null; T._failAt = 0;", "T._data = d;"],
    [TR, 'repaint loop', "if (d && d.at !== before && onNew) {", "if (d && onNew) {"],
    [TR, 'no page token', "fields: ['created', 'issuelinks'], maxResults: JiTA.PAGE_SIZE };\n                if (token) { body.nextPageToken = token; }", "fields: ['created', 'issuelinks'], maxResults: JiTA.PAGE_SIZE };"],
    [TR, 'no search cap', "if (!d.nextPageToken || d.isLast || issues.length >= T.MAX_REPORTS) { return null; }", "if (!d.nextPageToken || d.isLast) { return null; }"],
    // ---- the funnel ----
    [FM, 'reporter view leaves trending on', "if (JiTA.ui.reporterMode) { JiTA.ui.simReportsMode = false; JiTA.ui.trendMode = false; }", "if (JiTA.ui.reporterMode) { JiTA.ui.simReportsMode = false; }"],
    [FM, 'similar-reports view leaves trending on', "if (JiTA.ui.simReportsMode) { JiTA.ui.reporterMode = false; JiTA.ui.trendMode = false; }", "if (JiTA.ui.simReportsMode) { JiTA.ui.reporterMode = false; }"],
    [FM, 'trending leaves the report views on', "if (JiTA.ui.trendMode) { JiTA.ui.reporterMode = false; JiTA.ui.simReportsMode = false; }", ''],
    [FM, 'ranking filters shown under trending', "if (!(views && (JiTA.ui.reporterMode || JiTA.ui.simReportsMode || JiTA.ui.trendMode))) {", "if (!(views && (JiTA.ui.reporterMode || JiTA.ui.simReportsMode))) {"],
    [FM, 'funnel dark under trending', "(JiTA.ui.reporterMode || JiTA.ui.simReportsMode || JiTA.ui.trendMode)) { return true; }", "(JiTA.ui.reporterMode || JiTA.ui.simReportsMode)) { return true; }"],
    [FM, 'no trending switch', "            menu.appendChild(tb);\n", ''],
    // ---- triage ----
    [TG, 'triage never sees the trending view', "        if (JiTA.ui.trendMode) { return 'trending'; }\n", ''],
    [TG, 'digits inert under trending', "if (tv === 'reporter' || tv === 'simreports') {", "if (tv) {"],
    [TG, 'defect queue keeps trending', "            JiTA.ui.reporterMode = false; JiTA.ui.simReportsMode = false; JiTA.ui.trendMode = false;\n        }", "            JiTA.ui.reporterMode = false; JiTA.ui.simReportsMode = false;\n        }"],
    [TG, 'trending view ranked instead', "            if (view === 'trending') {\n                var tterms", "            if (false) {\n                var tterms"],
    [TG, 'filter box ignored under trending', "results: tr.rows.filter(function (r) { return JiTA.trend.matches(r, tterms); }) };", "results: tr.rows };"],
    // ---- the note names its unit ----
    [TR, 'note mislabels a steady defect', "{ up: 'rising', steady: 'steady', down: 'falling' }[r.trend]); }", "{ up: 'rising', steady: 'rising', down: 'falling' }[r.trend]); }"],
    [TR, 'note brings the baseline back', "{ up: 'rising', steady: 'steady', down: 'falling' }[r.trend]); }", "{ up: 'rising', steady: 'steady', down: 'falling' }[r.trend] + ', usually about ' + T.usual(r.base)); }"],
    // ---- double-tap '#' on the page ----
    [TK, 'panel switch off a bug report', "!/^EBR-/.test(U.currentKey || '') || !U._chromePresent()", "!U.currentKey || !U._chromePresent()"],
    [TK, 'panel switch with the feature off', "if (!flagOn('similarDefects') || !/^EBR-/", "if (!/^EBR-/"],
    [TK, 'panel switch with no panel', "!/^EBR-/.test(U.currentKey || '') || !U._chromePresent()) { return false; }", "!/^EBR-/.test(U.currentKey || '')) { return false; }"],
    [TK, 'panel switch leaves the report views on', "        if (U.trendMode) { U.reporterMode = false; U.simReportsMode = false; }   // mutually exclusive with the report views\n        U._closeFilterMenu();", "        U._closeFilterMenu();"],
    [TK, 'panel switch never re-renders', "        U._syncFilterBtn();\n        U._rerenderCurrent();\n        return true;", "        U._syncFilterBtn();\n        return true;"],
    [TK, 'a collapsed sidebar stays collapsed', "                side.classList.remove('collapsed');\n", ''],
    [TK, 'the expansion is forgotten', "                gmSet(JiTA.ui.SIDE_COLLAPSE_KEY, false);\n", ''],
    [TK, 'the panel is not brought into view', "            try { side.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }\n", ''],
    [TK, 'a collapsed floating panel stays collapsed', "            p.classList.remove('collapsed');\n", ''],
    [TK, 'launcher acts on one tap', "                if (now - lastHash >= 400) { lastHash = now; return; }\n", ''],
    [TK, 'launcher switches the panel under an overlay', "if (JiTA.menu.isOpen() || !JiTA.ui.toggleTrend()) {", "if (!JiTA.ui.toggleTrend()) {"],
    [TK, 'launcher never falls back to the list', "if (JiTA.menu.isOpen() || !JiTA.ui.toggleTrend()) { JiTA.trend.openView(); }", "if (!JiTA.menu.isOpen()) { JiTA.ui.toggleTrend(); }"],
    [TK, 'launcher still always opens the list', "if (JiTA.menu.isOpen() || !JiTA.ui.toggleTrend()) { JiTA.trend.openView(); }", "JiTA.trend.openView();"],
    // ---- double-tap '#' in triage ----
    [TG, 'triage # not wired', "        if (k === '#') { T._hashKey(); return; }", ''],
    [TG, 'triage # acts on one tap', "        if (now - T._lastHash >= 400) { T._lastHash = now; return; }   // the first tap only arms it, as on the page\n", ''],
    [TG, 'triage # on the defect queue', "        if (T._mode === 'defect') { T._setMsg('Trending defects go with the bug-report queue", "        if (false) { T._setMsg('Trending defects go with the bug-report queue"],
    [TG, 'triage # leaves the report views on', "        if (U.trendMode) { U.reporterMode = false; U.simReportsMode = false; }   // mutually exclusive with the report views\n        try {", "        try {"],
    [TG, 'triage # never re-ranks', "        try { U._closeFilterMenu(); } catch (e) { /* ignore */ }\n        T._onFilterChange();", "        try { U._closeFilterMenu(); } catch (e) { /* ignore */ }"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
fs.unlinkSync('mutt.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
