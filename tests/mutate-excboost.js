// mutate-excboost.js - breaks each guard of the exception boost (v3.45.0: an exception both sides hold raises a match
// the text found, on a bug report from its log, on a defect from its candidate reports' read-ahead logs) in turn and
// requires the harness that owns it to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const X = 'excboost-check.js', S = 'synctail-check.js';
const muts = [
    // ---- the boost on a row, and how the rankers use it ----
    [X, 'the same stack raises nothing', 'FACTOR: { exact: 1.3, site: 1.15 },', 'FACTOR: { exact: 1, site: 1.15 },'],
    [X, 'the crash site raises as much as the stack', 'FACTOR: { exact: 1.3, site: 1.15 },', 'FACTOR: { exact: 1.3, site: 1.3 },'],
    [X, 'the % may reach 100', '    PCT_MAX: 99,\n', '    PCT_MAX: 100,\n'],
    [X, 'the % uncapped', 'r.pct = Math.min(JiTA.repexc.PCT_MAX, Math.round(r.pct * f));', 'r.pct = Math.round(r.pct * f);'],
    [X, 'the row not told why', '    r.excHit = kind;\n', '\n'],
    [X, 'the RRF not raised (the hybrid cut unchanged)', "    if (typeof r.rrf === 'number') { r.rrf *= f; }\n    if (typeof r.pct === 'number') { r.pct = Math.min(", "    if (typeof r.pct === 'number') { r.pct = Math.min("],
    [X, 'the boost skips the demotion', '        if (demote) { demote(r); }\n        if (map[r.key]) { JiTA.rank._boostRow(r, map[r.key]); }', '        if (map[r.key]) { JiTA.rank._boostRow(r, map[r.key]); }'],
    [X, 'an empty map still wraps the demotion', '    if (!map || !Object.keys(map).length) { return demote; }', '    if (!map) { return demote; }'],
    [X, 'a failing boost fails the ranking', '.then(function (m) { return m || {}; }, function () { return {}; });\n};', '.then(function (m) { return m || {}; });\n};'],
    [X, 'a candidate asked about twice', "    (rows || []).forEach(function (r) { if (r && r.key && !seen[r.key]) {", "    (rows || []).forEach(function (r) { if (r && r.key) {"],
    [X, 'Hybrid fuses without the boost', 'JiTA.rank._fuse(sem, bm, JiTA.rank._withBoost(demote, map))', 'JiTA.rank._fuse(sem, bm, demote)'],
    [X, 'Hybrid asks only about the semantic candidates', 'JiTA.rank._boostMap(boost, sem.slice(0, JiTA.rank.CAND).concat(bm))', 'JiTA.rank._boostMap(boost, sem.slice(0, JiTA.rank.CAND))'],
    [X, 'Similar defects in Keyword ignore the boost', '                var adj = JiTA.rank._withBoost(demote, map);', '                var adj = demote;'],
    [X, 'Similar defects in Hybrid get no boost', "'defects', JiTA.rank.suggest, keywordOnly, demote, boost);", "'defects', JiTA.rank.suggest, keywordOnly, demote);"],
    [X, 'Matching bug reports pull only the cut in Keyword', 'return JiTA.rank.suggestEbr(text, key, JiTA.rank.CAND, filterTerms).then(function (list) {\n            return JiTA.rank._boostMap(boost, list)',
        'return JiTA.rank.suggestEbr(text, key, JiTA.TOP_N, filterTerms).then(function (list) {\n            return JiTA.rank._boostMap(boost, list)'],
    [X, 'Matching bug reports not re-sorted after the boost', '                if (adj) { for (var d = 0; d < list.length; d++) { adj(list[d]); } }\n                list.sort(function (a, c) { return c.score - a.score; });\n',
        '                if (adj) { for (var d = 0; d < list.length; d++) { adj(list[d]); } }\n'],
    [X, 'Matching bug reports in Hybrid get no boost', "'ebr', JiTA.rank.suggestEbr, keywordOnly, null, boost);", "'ebr', JiTA.rank.suggestEbr, keywordOnly);"],

    // ---- which defects hold an exception: the tab and the worker ----
    [X, 'only the newest defect of a stack counts', "            if (!idx) { return out; }\n            (sigs || []).forEach(function (sig) {\n                var c = idx.sigMap[sig];\n                if (c) { c.members.forEach(function (m) { out[m.key] = 'exact'; }); }",
        "            if (!idx) { return out; }\n            (sigs || []).forEach(function (sig) {\n                var c = idx.sigMap[sig];\n                if (c) { out[c.members[0].key] = 'exact'; }"],
    [X, 'the crash site overrides the stack', "var cs = JiTA.logsig._crashOf(sig), cc = cs && idx.crashMap[cs];\n                if (cc) { cc.members.forEach(function (m) { if (!out[m.key]) { out[m.key] = 'site'; } }); }",
        "var cs = JiTA.logsig._crashOf(sig), cc = cs && idx.crashMap[cs];\n                if (cc) { cc.members.forEach(function (m) { out[m.key] = 'site'; }); }"],
    [X, 'the crash site never counts (tab)', "var cs = JiTA.logsig._crashOf(sig), cc = cs && idx.crashMap[cs];\n                if (cc) { cc.members.forEach(function (m) { if (!out[m.key]) { out[m.key] = 'site'; } }); }",
        "var cs = JiTA.logsig._crashOf(sig), cc = cs && idx.crashMap[cs];\n                if (false) { cc.members.forEach(function (m) { if (!out[m.key]) { out[m.key] = 'site'; } }); }"],
    [X, 'the worker counts only the newest defect', "        (sigs || []).forEach(function (sig) {\n            var c = idx.sigMap[sig];\n            if (c) { c.members.forEach(function (m) { out[m.key] = 'exact'; }); }",
        "        (sigs || []).forEach(function (sig) {\n            var c = idx.sigMap[sig];\n            if (c) { out[c.members[0].key] = 'exact'; }"],
    [X, 'the worker lets the crash site override the stack', "var cs = lgCrashOf(sig), cc = cs && idx.crashMap[cs];\n            if (cc) { cc.members.forEach(function (m) { if (!out[m.key]) { out[m.key] = 'site'; } }); }",
        "var cs = lgCrashOf(sig), cc = cs && idx.crashMap[cs];\n            if (cc) { cc.members.forEach(function (m) { out[m.key] = 'site'; }); }"],
    [X, 'the worker\'s sigsOf without crash sites', "        return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: (idx && idx.keyToCrash[key]) || [] };\n    }\n\n    // One load",
        "        return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: [] };\n    }\n\n    // One load"],
    [X, 'the worker does not answer holding', "                else if (op === 'holding') { result = lgHolding(payload.sigs); }\n", ''],
    [X, 'the worker does not answer sigsOf', "                else if (op === 'sigsOf') { result = lgSigsOf(payload.key); }\n", ''],
    [X, 'holding never asks the worker', "if (JiTA.worker && JiTA.worker.usable()) { return JiTA.worker.call('logsig', { op: 'holding', sigs: sigs })", "if (false) { return JiTA.worker.call('logsig', { op: 'holding', sigs: sigs })"],
    [X, 'the tab\'s sigsOf without crash sites', "            return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: (idx && idx.keyToCrash[key]) || [] };\n        });",
        "            return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: [] };\n        });"],

    // ---- a report's own exceptions ----
    [X, 'a reading made without its logs counts', 'return (rec && rec.logs) ? (rec.exc || []).map(function (e) { return e.sig; }) : null;', 'return rec ? (rec.exc || []).map(function (e) { return e.sig; }) : null;'],
    [X, 'readings looked up every time', '        if (!R._reads[key]) {\n            R._reads[key] = ', '        if (true) {\n            R._reads[key] = '],
    [X, 'a new reading does not replace the cached one', '    forget: function (key) { delete JiTA.repexc._reads[key]; delete JiTA.repexc._report[key]; },', '    forget: function (key) { delete JiTA.repexc._report[key]; },'],
    [X, 'a report read ahead is scanned anyway', '            if (sigs) { return sigs; }\n            return JiTA.ui.scanIssueLog(key)', '            return JiTA.ui.scanIssueLog(key)'],
    [X, 'a report\'s boost worked out every time', '        if (!R._report[key]) {\n            var p = R._report[key] = ', '        if (true) {\n            var p = R._report[key] = '],
    [X, 'a failed lookup kept for the session', '                if (R._report[key] === p) { delete R._report[key]; }\n', ''],
    [X, 'a log with no exceptions still asks', 'return sigs.length ? JiTA.logsig.holding(sigs) : {};', 'return JiTA.logsig.holding(sigs);'],
    [X, 'a defect sync keeps the old boosts', '    reset: function () { JiTA.repexc._report = {}; },', '    reset: function () {},'],
    [X, 'a late boost never ranks again', '                    if (any && onLate) { try { onLate(); }', '                    if (false && onLate) { try { onLate(); }'],
    [X, 'a late empty boost ranks again', '                    if (any && onLate) { try { onLate(); }', '                    if (onLate) { try { onLate(); }'],
    [X, 'an empty boost passed on as one', 'resolve(any ? function () { return map; } : null);', 'resolve(function () { return map; });'],

    // ---- a defect's exceptions ----
    [X, 'an exception in one report counts as shared', 'if (p.count >= 2 && out.indexOf(p.sig) < 0) { out.push(p.sig); }', 'if (out.indexOf(p.sig) < 0) { out.push(p.sig); }'],
    [X, 'the profile used while switched off', "var s = flagOn('defectProfile') ? JiTA.profile._last[key] : null, out = [];", 'var s = JiTA.profile._last[key], out = [];'],
    [X, 'the profile exceptions used are not remembered', "        R._usedProf[key] = prof.join('\\n');\n", ''],
    [X, 'the description ignored', '            ((d && d.sigs) || []).forEach(add);\n', ''],
    [X, 'the crash site never counts (a defect\'s reports)', '            if (!site) { var c = JiTA.logsig._crashOf(sigs[i]); if (c && ds.crashes[c]) { site = true; } }\n', ''],
    [X, 'the same stack only counts as a crash site', "            if (ds.sigs[sigs[i]]) { return 'exact'; }", '            if (ds.sigs[sigs[i]]) { site = true; }'],
    [X, 'a defect with no exceptions reads every reading', '                if (!ds.n) { return {}; }\n', ''],
    [X, 'a finished profile always ranks again', "        if (R._usedProf[key] == null || R._usedProf[key] === R._profileSigs(key).join('\\n')) { return; }", '        if (R._usedProf[key] == null) { return; }'],
    [X, 'a finished profile ranks before any ranking', "        if (R._usedProf[key] == null || R._usedProf[key] === R._profileSigs(key).join('\\n')) { return; }", "        if (R._usedProf[key] === R._profileSigs(key).join('\\n')) { return; }"],
    [X, 'a finished profile ranks a defect left behind', '        if (JiTA.ui.currentKey === key) { JiTA.ui.scheduleRender(); }\n    },\n\n    // The row\'s badge', '        JiTA.ui.scheduleRender();\n    },\n\n    // The row\'s badge'],
    [X, 'the badge does not say why', "            .text(exact ? 'same exception in log' : '~ same crash site in log')", "            .text(exact ? 'same exception' : '~ same crash site in log')"],

    // ---- where it is used ----
    [X, 'Similar defects get no boost', 'JiTA.rank.suggestBest(text, key, brCreated, JiTA.ui.modeOverride, terms, undefined, got[1])', 'JiTA.rank.suggestBest(text, key, brCreated, JiTA.ui.modeOverride, terms)'],
    [X, 'a late boost does not redraw the panel', '                var late = function () { if (!stale()) { JiTA.ui.scheduleRender(); } };', '                var late = function () {};'],
    [X, 'Matching bug reports get no boost', 'return JiTA.rank.suggestEbrBest(text, key, JiTA.ui.modeOverride, terms, undefined, JiTA.repexc.forDefect(key)).then(function (out) {',
        'return JiTA.rank.suggestEbrBest(text, key, JiTA.ui.modeOverride, terms).then(function (out) {'],
    [X, 'the slid-in report gets no boost', 'JiTA.rank.suggestEbrBest(text, defectKey, JiTA.ui.modeOverride, terms, undefined, JiTA.repexc.forDefect(defectKey))', 'JiTA.rank.suggestEbrBest(text, defectKey, JiTA.ui.modeOverride, terms)'],
    [X, 'the panel row has no badge', "        if (r.excHit) { JiTA.repexc.badge(r.excHit, '<div class=\"jita-sd-exc\"></div>').appendTo($li); }   // why it ranks higher\n", ''],
    [X, 'the scan keeps no exceptions', '                            keepExc(txt);\n', ''],
    [X, 'the scan forgets what it kept', '                            JiTA.ui._logExc[key] = exc;\n', ''],
    [X, 'a fingerprinting error hangs the scan', '                        } catch (e) { /* the matching below still runs */ }', '                        } catch (e) { throw e; }'],
    [X, 'a new reading leaves the ranking\'s copy', 'var stored = function () { JiTA.repexc.forget(issue.key); return rec; };', 'var stored = function () { return rec; };'],
    [X, 'a finished profile is not told', '            if (s.done) { JiTA.repexc.profileReady(key); }', '            if (s.done) { }'],
    [X, 'triage\'s report matches get no boost', 'JiTA.ui.modeOverride, terms, upgrade, boost);', 'JiTA.ui.modeOverride, terms, upgrade);'],
    [X, 'triage\'s defect matches get no boost', 'terms, upgrade, JiTA.repexc.forDefect(key)); }', 'terms, upgrade); }'],
    [X, 'triage never ranks a late boost', 'JiTA.repexc.soon(JiTA.repexc.forReport(key), upgrade)', 'JiTA.repexc.soon(JiTA.repexc.forReport(key), null)'],
    [X, 'triage rows have no badge', "                    if (r.excHit) { JiTA.repexc.badge(r.excHit, '<span class=\"jt-mexc\"></span>').appendTo($li); }   // why it ranks higher\n", ''],

    // ---- the background reader ----
    [X, 'the reader off by default', '    on: function () { return gmGet(JiTA.logread.KEY, true) !== false; },', '    on: function () { return !!gmGet(JiTA.logread.KEY, false); },'],
    [X, 'closed reports read', 'if (JiTA.util.isClosedStatus(f.status && f.status.name) || JiTA.util.isGmTeam(f.customfield_10001)) { return; }', 'if (JiTA.util.isGmTeam(f.customfield_10001)) { return; }'],
    [X, 'the GM team\'s reports read', 'if (JiTA.util.isClosedStatus(f.status && f.status.name) || JiTA.util.isGmTeam(f.customfield_10001)) { return; }', 'if (JiTA.util.isClosedStatus(f.status && f.status.name)) { return; }'],
    [X, 'every pass lists every report', `(since ? ' AND updated >= "' + since + '"' : '')`, "''"],
    [X, 'the mark moves past a failed read', '                var whole = listOk && !failed && LR.on() && next >= queue.length;', '                var whole = listOk && LR.on() && next >= queue.length;'],
    [X, 'the mark moves past a failed listing', "                listOk = false;\n                console.log('[JiTA] could not list", "                console.log('[JiTA] could not list"],
    [X, 'a log that did not download counts as read', '                        if (!(r && r.rec && r.rec.logs)) { failed++; }   // a log that did not download\n', ''],
    [X, 'cached reports count as downloads', '                        if (r && !r.cached) { read++;', '                        if (r) { read++;'],
    [X, 'the defect on screen is not ranked again', "                        if (JiTA.ui._isReportsKey(JiTA.ui.currentKey || '')) { JiTA.ui.scheduleRender(); }", '                        void 0;'],
    [X, 'a bug report on screen is redrawn too', "                        if (JiTA.ui._isReportsKey(JiTA.ui.currentKey || '')) { JiTA.ui.scheduleRender(); }", '                        JiTA.ui.scheduleRender();'],
    [X, 'switched off, a pass goes on', '            function lane() {\n                if (!LR.on()) { return Promise.resolve(); }\n', '            function lane() {\n'],
    [X, 'the lock ignored', 'function (lock) { return lock ? LR.pass() : null; }', 'function () { return LR.pass(); }'],
    [X, 'two passes at once in a tab', '        if (LR._running) { return LR._running; }\n        var run = (navigator.locks', '        var run = (navigator.locks'],
    [X, 'a pass with the Triage Assistant off', "        if (JITA_NO_JIRA_UI || !flagOn('similarDefects') || !LR.on()) { return Promise.resolve(); }", '        if (JITA_NO_JIRA_UI || !LR.on()) { return Promise.resolve(); }'],
    [X, 'a pass while switched off', "        if (JITA_NO_JIRA_UI || !flagOn('similarDefects') || !LR.on()) { return Promise.resolve(); }", "        if (JITA_NO_JIRA_UI || !flagOn('similarDefects')) { return Promise.resolve(); }"],
    [X, 'a stuck page token loops', "                    if (!d.nextPageToken || d.isLast || d.nextPageToken === token) { return null; }   // a token that does not move on would loop", '                    if (!d.nextPageToken || d.isLast) { return null; }'],
    [X, 'no pass after a page load', "    setTimeout(function () { try { JiTA.logread.prepare(); } catch (e) { /* swallow */ } }, JiTA.logread.START_MS);   // read the open reports' logs, for the exception boost\n", ''],
    [X, 'the Settings switch switches nothing', '                gmSet(JiTA.logread.KEY, !JiTA.logread.on());\n', ''],
    [S, 'a bug report sync reads no new logs', '        if (ebr) { JiTA.logread.prepare(); }                // read the logs of new or changed reports, for the exception boost\n', ''],
    [S, 'a defect sync keeps the old boosts (the sync tail)', '        if (defects) { JiTA.repexc.reset(); }               // which defects hold an exception may have changed\n', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutxb.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutxb.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
fs.unlinkSync('mutxb.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
