// mutate-excboost.js - breaks each guard of the exception boost (v3.45.0: an exception both sides hold raises a match
// the text found, on a bug report from its log, on a defect from its candidate reports' read-ahead logs) in turn and
// requires the harness that owns it to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const X = 'excboost-check.js', S = 'synctail-check.js';
const muts = [
    // ---- the boost on a row, and how the rankers use it ----
    [X, 'the same stack raises nothing', "FACTOR: { exact: 1.3, site: 1.15, 'st-exact'", "FACTOR: { exact: 1, site: 1.15, 'st-exact'"],
    [X, 'the crash site raises as much as the stack', "FACTOR: { exact: 1.3, site: 1.15, 'st-exact'", "FACTOR: { exact: 1.3, site: 1.3, 'st-exact'"],
    [X, 'the % may reach 100', '    PCT_MAX: 99,\n', '    PCT_MAX: 100,\n'],
    [X, 'the % uncapped', 'r.pct = Math.min(JiTA.repexc.PCT_MAX, Math.round(r.pct * f));', 'r.pct = Math.round(r.pct * f);'],
    [X, 'the row not told why', '    r.excHit = o.kind;\n', '\n'],
    [X, 'the row not told what the log holds', '    r.excHits = o.hits || null;\n', '\n'],
    [X, 'an older worker\'s kind alone raises nothing', "var o = (hit && typeof hit === 'object') ? hit : { kind: hit, hits: null }, f = JiTA.repexc.FACTOR[o.kind];", "var o = (hit && typeof hit === 'object') ? hit : {}, f = JiTA.repexc.FACTOR[o.kind];"],
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
    [X, 'only the newest defect of a stack counts', "            list.forEach(function (sig) { var c = idx.sigMap[sig]; if (c) { put(c.members, L.isTrace(sig) ? 'st-exact' : 'exact', sig); } });",
        "            list.forEach(function (sig) { var c = idx.sigMap[sig]; if (c) { put([c.members[0]], L.isTrace(sig) ? 'st-exact' : 'exact', sig); } });"],
    [X, 'the crash site overrides the stack', '\n                    var o = out[m.key] || (out[m.key] = { kind: kind, hits: [] });',
        '\n                    var o = out[m.key] = { kind: kind, hits: (out[m.key] && out[m.key].hits) || [] };'],
    [X, 'the crash site never counts (tab)', "var cs = L._crashOf(sig), cc = cs && idx.crashMap[cs]; if (cc) { put(cc.members, L.isTrace(sig) ? 'st-site' : 'site', sig); } });",
        "var cs = L._crashOf(sig), cc = cs && idx.crashMap[cs]; if (false) { put(cc.members, L.isTrace(sig) ? 'st-site' : 'site', sig); } });"],
    [X, 'the worker counts only the newest defect', "        list.forEach(function (sig) { var c = idx.sigMap[sig]; if (c) { put(c.members, lgIsTrace(sig) ? 'st-exact' : 'exact', sig); } });",
        "        list.forEach(function (sig) { var c = idx.sigMap[sig]; if (c) { put([c.members[0]], lgIsTrace(sig) ? 'st-exact' : 'exact', sig); } });"],
    [X, 'the worker lets the crash site override the stack', '\n                var o = out[m.key] || (out[m.key] = { kind: kind, hits: [] });',
        '\n                var o = out[m.key] = { kind: kind, hits: (out[m.key] && out[m.key].hits) || [] };'],
    [X, 'a defect names none of what it holds (tab)', '\n                    if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push({ sig: sig, kind: kind }); }', ''],
    [X, 'a defect names one twice (tab)', '\n                    if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push(', '\n                    if (true) { o.hits.push('],
    [X, 'each one named with the defect\'s best kind (tab)', '\n                    if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push({ sig: sig, kind: kind }); }',
        '\n                    if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push({ sig: sig, kind: o.kind }); }'],
    [X, 'the worker names none of what a defect holds', '\n                if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push({ sig: sig, kind: kind }); }', ''],
    [X, 'the worker names one twice', '\n                if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push(', '\n                if (true) { o.hits.push('],
    [X, 'the worker names each with the defect\'s best kind', '\n                if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push({ sig: sig, kind: kind }); }',
        '\n                if (!o.hits.some(function (h) { return h.sig === sig; })) { o.hits.push({ sig: sig, kind: o.kind }); }'],
    [X, 'the worker\'s sigsOf without crash sites', "        return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: (idx && idx.keyToCrash[key]) || [], cuts: (idx && idx.keyToCut && idx.keyToCut[key]) || [] };\n    }\n\n    // One load",
        "        return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: [], cuts: (idx && idx.keyToCut && idx.keyToCut[key]) || [] };\n    }\n\n    // One load"],
    [X, 'the worker does not answer holding', "                else if (op === 'holding') { result = lgHolding(payload.sigs); }\n", ''],
    [X, 'the worker does not answer sigsOf', "                else if (op === 'sigsOf') { result = lgSigsOf(payload.key); }\n", ''],
    [X, 'holding never asks the worker', "if (JiTA.worker && JiTA.worker.usable()) { return JiTA.worker.call('logsig', { op: 'holding', sigs: sigs })", "if (false) { return JiTA.worker.call('logsig', { op: 'holding', sigs: sigs })"],
    [X, 'the tab\'s sigsOf without crash sites', "            return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: (idx && idx.keyToCrash[key]) || [], cuts: (idx && idx.keyToCut && idx.keyToCut[key]) || [] };\n        });",
        "            return { sigs: (idx && idx.keyToSigs[key]) || [], crashes: [], cuts: (idx && idx.keyToCut && idx.keyToCut[key]) || [] };\n        });"],

    // ---- a report's own exceptions ----
    [X, 'a reading made without its logs counts', '                if (!(rec && rec.logs)) { return null; }\n', '                if (!rec) { return null; }\n'],
    [X, 'a reading keeps no messages', '                R._keep(key, rec.exc);\n', ''],
    [X, 'a scanned report keeps no messages', '                JiTA.repexc._keep(key, exc);\n', ''],
    [X, 'no message kept', '        (exc || []).forEach(function (e) { if (e && e.sig && e.msg) { m[e.sig] = e.msg; } });\n', ''],
    [X, 'readings looked up every time', '        if (!R._reads[key]) {\n            R._reads[key] = ', '        if (true) {\n            R._reads[key] = '],
    [X, 'a new reading does not replace the cached one', '    forget: function (key) { delete JiTA.repexc._reads[key]; delete JiTA.repexc._report[key];', '    forget: function (key) { delete JiTA.repexc._report[key];'],
    [X, 'a new reading keeps the old messages', ' delete JiTA.repexc._report[key]; delete JiTA.repexc._msgs[key]; },', ' delete JiTA.repexc._report[key]; },'],
    // ---- naming what the log holds ----
    [X, 'a report\'s boost names nothing', '}).then(function (m) { return R._named(m, R._msgs[key]); }, function () {', '}).then(function (m) { return m || {}; }, function () {'],
    [X, 'an older worker\'s answer dropped', "var v = m[k], o = (v && typeof v === 'object') ? v : { kind: v, hits: [] };", "var v = m[k], o = (v && typeof v === 'object') ? v : {};"],
    [X, 'an answer with no kind kept', '            if (!o.kind) { return; }\n            out[k] = { kind: o.kind, hits:', '            out[k] = { kind: o.kind, hits:'],
    [X, 'a report\'s boost names no message', "kind: h.kind, msg: (msgs && msgs[h.sig]) || '' }; }) };", "kind: h.kind, msg: '' }; }) };"],
    [X, 'a defect\'s boost names nothing', '        if (kind) { out[k] = { kind: kind, hits: R._hits(sigs, ds, R._msgs[k]) }; }', '        if (kind) { out[k] = { kind: kind, hits: [] }; }'],
    [X, 'a defect\'s boost names by another report\'s messages', 'hits: R._hits(sigs, ds, R._msgs[k]) }; }', 'hits: R._hits(sigs, ds, R._msgs[key]) }; }'],
    [X, 'what a log holds not the best first', 'return out.sort(function (a, b) { return R.KINDS.indexOf(a.kind) - R.KINDS.indexOf(b.kind); });', 'return out;'],
    [X, 'what a log holds named by no message', "            if (k) { out.push({ sig: sig, kind: k, msg: (msgs && msgs[sig]) || '' }); }", "            if (k) { out.push({ sig: sig, kind: k, msg: '' }); }"],
    [X, 'the badge names nothing', "            $('<span class=\"jita-exc-what\"></span>').text(': ' + R._said(named[0])).appendTo($b);\n", ''],
    [X, 'the badge\'s hover says nothing of it', "            tip += ':\\n\\n' + JiTA.profile._sigTip(named[0].sig, R._said(named[0]));\n", ''],
    [X, 'the others not named', "            if (more.length) {\n                tip += '\\n\\nIts log also holds: '", "            if (false) {\n                tip += '\\n\\nIts log also holds: '"],
    [X, 'every other one named', 'more.slice(0, R.MORE_SHOWN).map(function (h) {', 'more.map(function (h) {'],
    [X, 'how many more not said', "(more.length > R.MORE_SHOWN ? '; and ' + (more.length - R.MORE_SHOWN) + ' more' : '');", "'';"],
    [X, 'one without a signature named', 'var named = (hits || []).filter(function (h) { return h && h.sig; });', 'var named = hits || [];'],
    [X, 'a long message named whole', "return m.length > R.SAID_MAX ? m.slice(0, R.SAID_MAX - 1) + '…' : m;", 'return m;'],
    [X, 'a message named on several lines', "        m = String(m || '').replace(/\\s+/g, ' ').trim();\n        return m.length > R.SAID_MAX", "        m = String(m || '');\n        return m.length > R.SAID_MAX"],
    [X, 'a stacktrace named with its tag', ' if (L.isTrace(h.sig)) { m = m.slice(L.TRACE.length); } }', ' }'],
    [X, 'the name runs past the row', '.jita-sd-exc { margin-top: 2px; color: #7fdca4; font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
        '.jita-sd-exc { margin-top: 2px; color: #7fdca4; font-size: 10px; font-weight: 700; }'],
    [X, 'the name as loud as the badge', '\n.jita-exc-what { font-weight: 400; color: #9aa6b2; }', '\n.jita-exc-what { }'],
    [X, 'the name runs past a triage row', "font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }' +", "font-weight: 700; margin-top: 2px; }' +"],
    [X, 'the name as loud as the badge in triage', "'.jita-triage-view .jt-mexc .jita-exc-what { font-weight: 400; color: #9aa6b2; }' +", "'.jita-triage-view .jt-mexc .jita-exc-what { }' +"],
    [X, 'the name not muted in the sidebar', '\n#jita-side-group .jita-exc-what { color: var(--ds-text-subtlest, #626f86); }', ''],
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
    [X, 'the crash site never counts (a defect\'s reports)', "            else if ((c = L._crashOf(sig)) && ds.crashes[c]) { k = st ? 'st-site' : 'site'; }\n", ''],
    [X, 'the same stack only counts as a crash site', "            else if (ds.sigs[sig]) { k = st ? 'st-exact' : 'exact'; }", "            else if (ds.sigs[sig]) { k = st ? 'st-site' : 'site'; }"],
    [X, 'a defect with no exceptions reads every reading', '                if (!ds.n) { return {}; }\n', ''],
    [X, 'a finished profile always ranks again', "        if (R._usedProf[key] == null || R._usedProf[key] === R._profileSigs(key).join('\\n')) { return; }", '        if (R._usedProf[key] == null) { return; }'],
    [X, 'a finished profile ranks before any ranking', "        if (R._usedProf[key] == null || R._usedProf[key] === R._profileSigs(key).join('\\n')) { return; }", "        if (R._usedProf[key] === R._profileSigs(key).join('\\n')) { return; }"],
    [X, 'a finished profile ranks a defect left behind', '        if (JiTA.ui.currentKey === key) { JiTA.ui.scheduleRender(); }\n    },\n\n    // The row\'s badge', '        JiTA.ui.scheduleRender();\n    },\n\n    // The row\'s badge'],
    [X, 'the badge does not say why', "        exact: ['same exception in log', ", "        exact: ['same exception', "],

    // ---- where it is used ----
    [X, 'Similar defects get no boost', 'JiTA.rank.suggestBest(text, key, brCreated, JiTA.ui.modeOverride, terms, undefined, got[1])', 'JiTA.rank.suggestBest(text, key, brCreated, JiTA.ui.modeOverride, terms)'],
    [X, 'a late boost does not redraw the panel', '                var late = function () { if (!stale()) { JiTA.ui.scheduleRender(); } };', '                var late = function () {};'],
    [X, 'Matching bug reports get no boost', 'return JiTA.rank.suggestEbrBest(text, key, JiTA.ui.modeOverride, terms, undefined, JiTA.repexc.forDefect(key)).then(function (out) {',
        'return JiTA.rank.suggestEbrBest(text, key, JiTA.ui.modeOverride, terms).then(function (out) {'],
    [X, 'the slid-in report gets no boost', 'JiTA.rank.suggestEbrBest(text, defectKey, JiTA.ui.modeOverride, terms, undefined, JiTA.repexc.forDefect(defectKey))', 'JiTA.rank.suggestEbrBest(text, defectKey, JiTA.ui.modeOverride, terms)'],
    [X, 'the panel row has no badge', "        if (r.excHit) { JiTA.repexc.badge(r.excHit, '<div class=\"jita-sd-exc\"></div>', r.excHits).appendTo($li); }   // why it ranks higher\n", ''],
    [X, 'the panel row\'s badge names nothing', "JiTA.repexc.badge(r.excHit, '<div class=\"jita-sd-exc\"></div>', r.excHits)", "JiTA.repexc.badge(r.excHit, '<div class=\"jita-sd-exc\"></div>')"],
    [X, 'the scan keeps no exceptions', '                            keepExc(txt);\n', ''],
    [X, 'the scan forgets what it kept', '                            JiTA.ui._logExc[key] = exc;\n', ''],
    [X, 'a fingerprinting error hangs the scan', '                        } catch (e) { /* the matching below still runs */ }', '                        } catch (e) { throw e; }'],
    [X, 'a new reading leaves the ranking\'s copy', 'var stored = function () { JiTA.repexc.forget(issue.key); return rec; };', 'var stored = function () { return rec; };'],
    [X, 'a finished profile is not told', '            if (s.done) { JiTA.repexc.profileReady(key); }', '            if (s.done) { }'],
    [X, 'triage\'s report matches get no boost', 'JiTA.ui.modeOverride, terms, upgrade, boost);', 'JiTA.ui.modeOverride, terms, upgrade);'],
    [X, 'triage\'s defect matches get no boost', 'terms, upgrade, JiTA.repexc.forDefect(key)); }', 'terms, upgrade); }'],
    [X, 'triage never ranks a late boost', 'JiTA.repexc.soon(JiTA.repexc.forReport(key), upgrade)', 'JiTA.repexc.soon(JiTA.repexc.forReport(key), null)'],
    [X, 'triage rows have no badge', "                    if (r.excHit) { JiTA.repexc.badge(r.excHit, '<span class=\"jt-mexc\"></span>', r.excHits).appendTo($li); }   // why it ranks higher\n", ''],
    [X, 'triage rows\' badges name nothing', "JiTA.repexc.badge(r.excHit, '<span class=\"jt-mexc\"></span>', r.excHits)", "JiTA.repexc.badge(r.excHit, '<span class=\"jt-mexc\"></span>')"],

    // ---- the background reader ----
    [X, 'the reader off by default', '    on: function () { return gmGet(JiTA.logread.KEY, true) !== false; },', '    on: function () { return !!gmGet(JiTA.logread.KEY, false); },'],
    [X, 'closed reports read', 'if (JiTA.util.isClosedStatus(f.status && f.status.name) || JiTA.util.isGmTeam(f.customfield_10001)) { return; }', 'if (JiTA.util.isGmTeam(f.customfield_10001)) { return; }'],
    [X, 'the GM team\'s reports read', 'if (JiTA.util.isClosedStatus(f.status && f.status.name) || JiTA.util.isGmTeam(f.customfield_10001)) { return; }', 'if (JiTA.util.isClosedStatus(f.status && f.status.name)) { return; }'],
    [X, 'every pass lists every report', `(since ? ' AND updated >= "' + since + '"' : '')`, "''"],
    [X, 'the mark moves past a failed read', '                var whole = listOk && !failed && LR.on() && next >= queue.length;', '                var whole = listOk && LR.on() && next >= queue.length;'],
    [X, 'the mark moves past a failed listing', "                listOk = false;\n                console.log('[JiTA] could not list", "                console.log('[JiTA] could not list"],
    [X, 'a log that did not download counts as read', '                        if (!(r && r.rec && r.rec.logs)) { failed++; }   // a log that did not download\n', ''],
    [X, 'cached reports count as downloads', 'if (r && !r.cached && JiTA.profile._logFiles(item.fields.attachment).length) { read++;', 'if (r && JiTA.profile._logFiles(item.fields.attachment).length) { read++;'],
    [X, 'a report with no log file counts as a download, and waits', 'if (r && !r.cached && JiTA.profile._logFiles(item.fields.attachment).length) { read++;', 'if (r && !r.cached) { read++;'],
    [X, 'the reader lists the launcher\'s reports too', '            var jql = JiTA.excfind.SCOPE + (since', '            var jql = JiTA.EBR_SCOPE + (since'],
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
