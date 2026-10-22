// mutate-excnoise.js - breaks each guard of the exceptions that don't count (v3.46.0: UserErrors, the ones the user ignores,
// the ones common in the open reports' logs raise no match, point at no defect and make no pattern, and are listed apart)
// in turn and requires the harness that owns it to go red. A crashed harness counts as red. A breakage may name the part
// of the file it is made in: [harness, name, anchor, replacement, [its first line, its end]], the anchor then once there.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const N = 'excnoise-check.js', XF = 'excfind-check.js', PC = 'profile-check.js';
const EXCN = ['\nJiTA.excnoise = {', '\n};\n'], REPEXC = ['\nJiTA.repexc = {', '\n    _noop: null\n};\n'], LOGREAD = ['\nJiTA.logread = {', '\n    _noop: null\n};\n'];
const TMATCH = ['    _matchTextLocal: function (text) {', '\n    },'], WMATCH = ['    function lgMatch(text) {', '\n    }\n'];
const muts = [
    // ---- which are UserErrors, and a signature's message part ----
    [N, 'no UserError told apart', "isUserError: function (sig) { return /^(?:[a-z_]\\w*\\.)*usererror\\b/.test(", "isUserError: function (sig) { return /^$/.test("],
    [N, 'a class that only starts as UserError taken for one', "*usererror\\b/.test(String(sig == null ? '' : sig)); },", "*usererror/.test(String(sig == null ? '' : sig)); },"],
    [N, 'a UserError named anywhere in the message', "isUserError: function (sig) { return /^(?:", "isUserError: function (sig) { return /(?:"],
    [N, 'a UserError with its module named not taken for one', "isUserError: function (sig) { return /^(?:[a-z_]\\w*\\.)*usererror", "isUserError: function (sig) { return /^usererror"],
    [N, 'the worker tells no UserError apart', "function lgIsUserError(sig) { return /^(?:[a-z_]\\w*\\.)*usererror\\b/.test(", "function lgIsUserError(sig) { return /^$/.test("],
    [N, 'a message key that is the whole signature', "_msgKey: function (sig) { var s = String(sig == null ? '' : sig), at = s.lastIndexOf('|'); return at < 0 ? s : s.slice(0, at); },",
        "_msgKey: function (sig) { return String(sig == null ? '' : sig); },"],
    [N, 'a message key cut at its first bar', "_msgKey: function (sig) { var s = String(sig == null ? '' : sig), at = s.lastIndexOf('|');", "_msgKey: function (sig) { var s = String(sig == null ? '' : sig), at = s.indexOf('|');"],
    // ---- the index ----
    [N, 'a defect\'s UserErrors indexed', "                    if (L.isUserError(fp.sig)) { continue; }   // a message the game shows the player, no bug\n", ''],
    [N, 'the worker indexes UserErrors', "                    if (lgIsUserError(fp.sig)) { continue; }   // a message the game shows the player, no bug\n", ''],
    // ---- Known defects in attached log, and the parser's marks ----
    [N, 'a log\'s defects name no signatures', "                var by = found[defect].sigs[fp.sig] || (found[defect].sigs[fp.sig] = { n: 0, loose: loose });\n                by.n++;\n", '', TMATCH],
    [N, 'a signature counted once however often', '                by.n++;\n', '', TMATCH],
    [N, 'the worker\'s defects name no signatures', '            by.n++;\n', '', WMATCH],
    [N, 'two logs\' counts of a signature not added up', '} else { a.n += b.n; if (!b.loose) { a.loose = false; } }', '} else { if (!b.loose) { a.loose = false; } }'],
    [N, 'a signature found loosely in one log kept loose though exact in another', '} else { a.n += b.n; if (!b.loose) { a.loose = false; } }', '} else { a.n += b.n; }'],
    [N, 'a log whose result names no signatures leaves the entry filterable', '                            if (!found[k].sigs) { merged[k].sigs = null; }\n                            else if (merged[k].sigs) {',
        '                            if (merged[k].sigs && found[k].sigs) {'],
    [N, 'the panel lists a defect found only by an ignored exception', '                if (JiTA.excnoise.isIgnored(s)) { return; }\n', ''],
    [N, 'a defect\'s count not worked out again', 'if (n) { out[k] = { defect: k, count: n, msg: f.msg,', 'if (n) { out[k] = { defect: k, count: f.count, msg: f.msg,'],
    [N, 'its "~" not worked out again', 'msg: f.msg, loose: loose, sigs: sigs }; }', 'msg: f.msg, loose: f.loose, sigs: sigs }; }'],
    [N, 'a defect with nothing left kept', '            if (n) { out[k] = { defect: k,', '            if (true) { out[k] = { defect: k,'],
    [N, 'an entry naming no signatures dropped', '            if (!sigs) { out[k] = f; return; }', '            if (!sigs) { return; }'],
    [N, 'the panel shows the scan as it came', 'var found = JiTA.ui._counting(scanned);', 'var found = scanned;'],
    [N, 'the parser marks an ignored exception', '                if (hit && JiTA.excnoise && JiTA.excnoise.isIgnored(fp.sig)) { hit = null; }   // the user ignores it (JiTA.excnoise)\n', ''],
    [N, 'the clusters overview lists an ignored exception', '            clusters = (clusters || []).filter(function (c) { return !JiTA.excnoise.isIgnored(c.sig); });', '            clusters = (clusters || []);'],
    [N, 'the duplicate finder pairs by an ignored exception', '                if (JiTA.excnoise.isIgnored(clusters[c].sig)) { continue; }   // an exception the user ignores pairs nothing\n', ''],
    // ---- the rules ----
    [N, 'a UserError counts', "        if (JiTA.logsig.isUserError(sig)) { return 'user'; }\n", '', EXCN],
    [N, 'an ignored UserError told as ignored', "        if (JiTA.logsig.isUserError(sig)) { return 'user'; }\n        if (N.isIgnored(sig)) { return 'ignored'; }\n",
        "        if (N.isIgnored(sig)) { return 'ignored'; }\n        if (JiTA.logsig.isUserError(sig)) { return 'user'; }\n", EXCN],
    [N, 'an ignored one counts', "        if (N.isIgnored(sig)) { return 'ignored'; }\n", '', EXCN],
    [N, 'a common one counts', "        if (N.isCommon(sig)) { return 'common'; }\n", '', EXCN],
    [N, 'an ignored message held to its stack', 'hasOwnProperty.call(JiTA.excnoise._ignored(), JiTA.logsig._msgKey(sig)); },', 'hasOwnProperty.call(JiTA.excnoise._ignored(), sig); },', EXCN],
    [N, 'a count too old still gone by', ' || !(Date.now() - f.at < N.STALE_MS)) { return 0; }', ') { return 0; }', EXCN],
    [N, 'common in fewer than 10 logs', 'return (c >= N.COMMON_MIN && c >= N.COMMON_PCT * f.n) ? c / f.n : 0;', 'return (c >= N.COMMON_PCT * f.n) ? c / f.n : 0;', EXCN],
    [N, 'common under 5% of them', 'return (c >= N.COMMON_MIN && c >= N.COMMON_PCT * f.n) ? c / f.n : 0;', 'return (c >= N.COMMON_MIN) ? c / f.n : 0;', EXCN],
    [N, 'a common one counted anyway still common', 'JiTA.excnoise.share(sig) > 0 && !JiTA.excnoise._counted()[sig]; },', 'JiTA.excnoise.share(sig) > 0; },', EXCN],
    [N, 'the count read on every look', '        if (N._freqRead && Date.now() - N._freqRead < N.LOAD_MS) { return Promise.resolve(); }\n', '', EXCN],
    [N, 'a tab\'s first read changes what was worked out', 'N._setFreq((f && f.c) ? f : null, first);', 'N._setFreq((f && f.c) ? f : null, false);', EXCN],
    [N, 'a later read changes nothing', 'N._setFreq((f && f.c) ? f : null, first);', 'N._setFreq((f && f.c) ? f : null, true);', EXCN],
    [N, 'every read changes what counts', "if (!quiet && before !== N._common().join('\\n')) { N._changed(); }", 'if (!quiet) { N._changed(); }', EXCN],
    [N, 'what counts changing leaves its generation', '        N.gen++;\n', '', EXCN],
    [N, 'the boost\'s answers kept', '        try { JiTA.repexc.reset(); } catch (e) { /* ignore */ }\n', '', EXCN],
    [N, 'the Triage Assistant\'s answers kept', '        try { if (JiTA.triage) { JiTA.triage._cache = {}; } } catch (e) { /* ignore */ }\n', '', EXCN],
    [N, 'the parsed log\'s marks kept', '        try { JiTA.logsig.rematch(); } catch (e) { /* ignore */ }\n', '', EXCN],
    [N, 'the exception search not told', '        try { if (X && X._st) { X._st.tsig = null; X._retarget(X._st); } } catch (e) { /* ignore */ }\n', '', EXCN],
    [N, 'nothing drawn again', '        try { JiTA.ui.scheduleRender(); } catch (e) { /* ignore */ }\n', '', EXCN],
    [N, 'an ignored message kept as typed', "m[k] = { msg: String(msg || '').replace(/\\s+/g, ' ').trim().slice(0, 200), at: Date.now() };", "m[k] = { msg: String(msg || ''), at: Date.now() };", EXCN],
    [N, 'ignoring kept in this tab only', "at: Date.now() };\n        gmSet(N.IGNORE_KEY, m);\n", 'at: Date.now() };\n', EXCN],
    [N, 'ignoring changes nothing worked out', '        gmSet(N.IGNORE_KEY, m);\n        N._changed();\n    },\n    // Count an ignored message again', '        gmSet(N.IGNORE_KEY, m);\n    },\n    // Count an ignored message again', EXCN],
    [N, 'one counted again still ignored', '        delete m[key];\n', '', EXCN],
    [N, 'Count all again counts none again', '        N._ign = {};\n        gmSet(N.IGNORE_KEY, {});\n', '', EXCN],
    [N, 'counting anyway never taken back', 'if (on) { m[sig] = Date.now(); } else { delete m[sig]; }', 'if (on) { m[sig] = Date.now(); }', EXCN],
    [N, 'counting anyway kept in this tab only', '} else { delete m[sig]; } });\n        gmSet(N.COUNT_KEY, m);\n', '} else { delete m[sig]; } });\n', EXCN],
    [N, 'Treat as common again treats none so', '        N._cnt = {};\n        gmSet(N.COUNT_KEY, {});\n', '', EXCN],
    [N, 'the ignored listed the oldest first', '.sort(function (a, b) { return b.at - a.at || (a.key < b.key ? -1 : 1); });', '.sort(function (a, b) { return a.at - b.at || (a.key < b.key ? -1 : 1); });', EXCN],
    [N, 'a UserError\'s reason not said', "if (why === 'user') { return 'UserError: a message the game shows the player'; }", "if (why === 'user') { return ''; }", EXCN],
    [N, 'a common one\'s share not said', "return 'in ' + Math.max(1, Math.round(100 * JiTA.excnoise.share(sig))) + '% of the open reports\\' logs'; }", "return 'common'; }", EXCN],
    // ---- counting the common ones ----
    [N, 'a pass counts no report', '        t.n++;\n', '', EXCN],
    [N, 'a signature kept from its first count', 'if (t.h[h] >= N.COMMON_MIN && !t.s[h]) { t.s[h] = e.sig; }', 'if (!t.s[h]) { t.s[h] = e.sig; }', EXCN],
    [N, 'the count keeps one under 5% of the reports', 'if (k >= N.COMMON_PCT * t.n) { c[t.s[h]] = k; }', 'c[t.s[h]] = k;', EXCN],
    [N, 'the count never renewed', 'var recount = !(freq && now - freq.at < N.FREQ_MS) && !(tried && now - tried < N.RETRY_MS);', 'var recount = false;', LOGREAD],
    [N, 'the count renewed hours after the last try', 'var recount = !(freq && now - freq.at < N.FREQ_MS) && !(tried && now - tried < N.RETRY_MS);', 'var recount = !(freq && now - freq.at < N.FREQ_MS);', LOGREAD],
    [N, 'a fresh count renewed', 'var recount = !(freq && now - freq.at < N.FREQ_MS) && !(tried && now - tried < N.RETRY_MS);', 'var recount = !(tried && now - tried < N.RETRY_MS);', LOGREAD],
    [N, 'a recount lists only what changed', 'var since = (!recount && mark && mark.at', 'var since = (mark && mark.at', LOGREAD],
    [N, 'when a count was begun not kept', '            if (tally) { JiTA.db.setMeta(N.TRIED_KEY, now).then(null, none); }\n', '', LOGREAD],
    [N, 'a report with no log counted', 'if (tally && r && r.rec && r.rec.logs && r.rec.hasLog) { N.count(tally, r.rec.exc); }', 'if (tally && r && r.rec) { N.count(tally, r.rec.exc || []); }', LOGREAD],
    [N, 'a count left by a pass that did not list everything', 'var counted = (tally && listOk && LR.on() && next >= queue.length) ? N.table(tally, now) : null;', 'var counted = tally ? N.table(tally, now) : null;', LOGREAD],
    [N, 'a count only left when every report was read', 'var counted = (tally && listOk && LR.on() && next >= queue.length) ? N.table(tally, now) : null;', 'var counted = (tally && whole) ? N.table(tally, now) : null;', LOGREAD],
    [N, 'the count left not gone by in this tab', 'then(function () { N._setFreq(counted); }, none);', 'then(null, none);', LOGREAD],
    // ---- the ranking boost ----
    [N, 'a bug report\'s every exception asks', 'return JiTA.excnoise.load().then(function () { return (sigs || []).filter(JiTA.excnoise.counts); });', 'return JiTA.excnoise.load().then(function () { return sigs || []; });', REPEXC],
    [N, 'a bug report\'s boost does not wait for the count', 'return JiTA.excnoise.load().then(function () { return (sigs || []).filter(JiTA.excnoise.counts); });', 'return Promise.resolve((sigs || []).filter(JiTA.excnoise.counts));', REPEXC],
    [N, 'a bug report asks by all it holds', 'R._reportSigs(key).then(R._counting).then(', 'R._reportSigs(key).then(', REPEXC],
    [N, 'a defect takes every exception', '            if (!JiTA.excnoise.counts(sig)) { return; }\n', '', REPEXC],
    [N, 'a defect does not wait for the count', '        return JiTA.excnoise.load().then(function () {\n            prof.forEach(add);', '        return Promise.resolve().then(function () {\n            prof.forEach(add);', REPEXC],
    [N, 'a candidate raises by any exception', 'R._kind((reads[i] || []).filter(JiTA.excnoise.counts), ds)', 'R._kind(reads[i] || [], ds)', REPEXC],
    // ---- the defect profile ----
    [N, 'the profile\'s pattern takes what does not count', '                if (left(e.sig)) { return; }\n', ''],
    [PC, 'the shared list holds what does not count', 'out.excGroups = P._groups(withLog, function (e) { return !hid(e.sig) && !left(e.sig); });', 'out.excGroups = P._groups(withLog, function (e) { return !hid(e.sig); });'],
    [N, 'a hidden one also listed as not counted', 'out.leftExc = P._groups(withLog, function (e) { return !hid(e.sig) && !!left(e.sig); });', 'out.leftExc = P._groups(withLog, function (e) { return !!left(e.sig); });'],
    [PC, 'what does not count listed nowhere', 'out.leftExc = P._groups(withLog, function (e) { return !hid(e.sig) && !!left(e.sig); });', 'out.leftExc = [];'],
    [N, 'not said why', '        out.leftExc.forEach(function (g) { g.why = left(g.paths[0].sig); });\n', ''],
    [PC, 'a build summarises without the rules', 'summary: P.summarise(views, defect, hiddenOf, JiTA.excnoise.why)', 'summary: P.summarise(views, defect, hiddenOf)'],
    [PC, 'a build keeps nothing to summarise again with', '                        defect: defect, hiddenOf: hiddenOf, gen: JiTA.excnoise.gen };', '                        };'],
    [N, 'a build does not wait for the count', ', JiTA.db.getDefect(key).then(null, function () { return null; }), JiTA.excnoise.load()]).then(', ', JiTA.db.getDefect(key).then(null, function () { return null; })]).then('],
    [N, 'a kept state never summarised again', '        if (s && s.hiddenOf && s.views && s.gen !== N.gen) {', '        if (false) {'],
    [N, 'one made by hand summarised again', '        if (s && s.hiddenOf && s.views && s.gen !== N.gen) {', '        if (s && s.views && s.gen !== N.gen) {'],
    [N, 'a state summarised again on every draw', '            s.gen = N.gen;\n', ''],
    [PC, 'the card drawn by its old summary', "        var sm = P._fresh(s).summary;\n        $b.addClass('has-hits');", "        var sm = s.summary;\n        $b.addClass('has-hits');"],
    [PC, 'the full profile drawn by its old summary', 'appendTo(ov.$menu), sm = P._fresh(s).summary;', 'appendTo(ov.$menu), sm = s.summary;'],
    [PC, 'the card does not fold what does not count', '        if (lx.length) {\n            var $lx', '        if (false) {\n            var $lx'],
    [PC, 'the card\'s fold says not how many', "return (P._leftOpen ? '▾ ' : '▸ ') + lx.length + ' not counted'; };", "return (P._leftOpen ? '▾ ' : '▸ ') + 'not counted'; };"],
    [PC, 'the card\'s fold says not why', " + ' (' + JiTA.excnoise.label(g.why, g.paths[0].sig) + ')')", ')'],
    [PC, 'the card\'s fold closes on every draw', "$('<div class=\"jp-hidden\"></div>').toggleClass('open', !!P._leftOpen)", "$('<div class=\"jp-hidden\"></div>').toggleClass('open', false)"],
    [PC, 'the card\'s fold does not open', "P._leftOpen = !P._leftOpen; $lx.toggleClass('open', P._leftOpen);", "$lx.toggleClass('open', P._leftOpen);"],
    [PC, 'ignored without asking', "        if (!confirm('Ignore \"' + String(msg || '').slice(0, 200)", "        if (false && !confirm('Ignore \"' + String(msg || '').slice(0, 200)"],
    [PC, 'an ignore not drawn again', '        JiTA.excnoise.ignore(sig, msg);\n        return true;', '        JiTA.excnoise.ignore(sig, msg);\n        return false;'],
    [PC, 'the full profile not drawn again after a change', 'if (fn() !== false) { P.openView(key); }', 'fn();'],
    [PC, 'no ignore link on a shared one', "            act($r, 'ignore', 'Leave this message out for every defect, at any stack: no match, no defect pointed at', function () { return P._ignore(g.paths[0].sig, g.msg || g.key); });\n", ''],
    [PC, 'the full profile does not fold what does not count', '        if (lx.length) {\n            var $lv', '        if (false) {\n            var $lv'],
    [PC, 'the full profile says not why', "$('<span class=\"jpv-why\"></span>').text(JiTA.excnoise.label(g.why, sig)).appendTo($r);", "$('<span class=\"jpv-why\"></span>').appendTo($r);"],
    [PC, 'an ignored one not counted again from the full profile', "                if (g.why === 'ignored') { act($r, 'count again',", "                if (false) { act($r, 'count again',"],
    [PC, 'a common one not counted anyway from the full profile', "                if (g.why === 'common') {\n                    act($r, 'count anyway',", "                if (false) {\n                    act($r, 'count anyway',"],
    [PC, 'count anyway taken for treat as common', 'JiTA.excnoise.countAnyway(g.paths.map(function (p) { return p.sig; }), true);', 'JiTA.excnoise.countAnyway(g.paths.map(function (p) { return p.sig; }), false);'],
    [PC, 'nothing shared said when only what does not count is', "(hx.length || lx.length) ? 'No exception or stacktrace appears in more than one log, apart from '",
        "hx.length ? 'No exception or stacktrace appears in more than one log, apart from '"],
    // ---- the exception search ----
    [N, 'the search offers no shared one that does not count', '        ((sm && sm.leftExc) || []).forEach(function (g) {\n            (g.paths || []).forEach(function (p) { apart.push(',
        '        ([]).forEach(function (g) {\n            (g.paths || []).forEach(function (p) { apart.push('],
    [N, 'the search sets nothing apart', '        out.forEach(function (t) { var w = JiTA.excnoise.why(t.sig); if (w) { t.left = w; } });\n', ''],
    [XF, 'a target set apart not drawn again', "(st.on[t.sig] ? '+' : '-') + (t.left || ''); }).join('\\n')", "(st.on[t.sig] ? '+' : '-'); }).join('\\n')"],
    [XF, 'the count read as the window opens not drawn', '        JiTA.excnoise.load().then(function () { X._retarget(st); });   // which are common: they are then set apart\n', ''],
    [XF, 'nothing drawn apart', 'var apart = st.targets.filter(function (t) { return !!t.left; }), $into = $t, $apart = null;', 'var apart = [], $into = $t, $apart = null;'],
    [XF, 'what does not count drawn among the rest', 'st.targets.filter(function (t) { return !t.left; }).concat(apart).forEach(function (t) {', 'st.targets.forEach(function (t) {'],
    [XF, 'the fold says not how many', "'Not counted (' + apart.length + '): UserErrors, ones you ignore, and ones common in the open reports\\' logs'; };\n                $head",
        "'Not counted: UserErrors, ones you ignore, and ones common in the open reports\\' logs'; };\n                $head"],
    [XF, 'the fold closes on every draw', "$('<div class=\"jx-apart\"></div>').toggleClass('open', !!st.apartOpen)", "$('<div class=\"jx-apart\"></div>').toggleClass('open', false)"],
    [XF, 'the fold does not open', "st.apartOpen = !st.apartOpen; $apart.toggleClass('open', st.apartOpen);", "$apart.toggleClass('open', st.apartOpen);"],
    [XF, 'a target set apart says not why', "            if (t.left) { $('<span class=\"jx-left\"></span>').text(JiTA.excnoise.label(t.left, t.sig)).appendTo($row); }\n", ''],
    [XF, 'no link to change what counts', '            X._noiseLink(t, $row);\n', ''],
    [XF, 'ignore offered on one that does not count', "        if (!t.left) { a = ['ignore',", "        if (true) { a = ['ignore',"],
    [XF, 'an ignored one not counted again from the search', "        else if (t.left === 'ignored') { a = ['count again',", "        else if (false) { a = ['count again',"],
    [XF, 'a common one not counted anyway from the search', "        else if (t.left === 'common') { a = ['count anyway',", "        else if (false) { a = ['count anyway',"],
    [XF, 'count again counts nothing again', 'function () { N.unignore(N.keyOf(t.sig)); }]; }', 'function () { }]; }'],
    [XF, 'count anyway counts nothing', 'function () { N.countAnyway(t.sig, true); }]; }', 'function () { }]; }'],
    [XF, 'ignore ignores nothing', 'function () { JiTA.profile._ignore(t.sig, t.msg || t.sig); }]; }', 'function () { }]; }'],
    [XF, 'a pasted one set apart stays folded', "                if (JiTA.excnoise.why(e.sig)) { st.apartOpen = true; }   // one that doesn't count is drawn apart: unfolded, to be seen\n", ''],
    [N, 'a stacktrace\'s first line alone refused', '        if (head) { text = head[1]; stack = false; }\n', ''],
    [N, 'a header\'s count read as its message', 'STACKTRACE #\\d*(?!\\d)\\s*', 'STACKTRACE #\\d*\\s*'],
    [N, 'a header typed in lower case looked for whole', '(?:logged at \\S+ \\S+ :\\s*)?(?!logged at )', '(?!logged at )'],
    [N, 'an empty header looked for as logged at', '(?!logged at )(\\S(?:[^\\n]*\\S)?)/i.exec(text)', '(\\S(?:[^\\n]*\\S)?)/i.exec(text)'],
    [N, 'an empty header looked for from its space', '(?!logged at )(\\S(?:[^\\n]*\\S)?)/i.exec(text)', '(?!logged at )([^\\n]*\\S)/i.exec(text)'],
    // ---- Settings, and the other tabs ----
    [N, 'Count all again does nothing', 'noise.unignoreAll(); refreshMenu();', 'refreshMenu();'],
    [N, 'Count again does nothing', 'noise.unignore(x.key); refreshMenu();', 'refreshMenu();'],
    [N, 'Treat as common again does nothing', 'noise.uncountAll(); refreshMenu();', 'refreshMenu();'],
    [N, 'another tab\'s change not read', '                    JiTA.excnoise._drop();   // read again from storage on the next look\n', ''],
    [N, 'another tab\'s change not worked out', '                    if (remote) { JiTA.excnoise._changed(); }\n', '']
];
// Where an anchor is looked for: the whole file, or the one part named.
function within(fn) {
    if (!fn) { return [0, src.length]; }
    const s = src.indexOf(fn[0]);
    if (s < 0 || src.indexOf(fn[0], s + 1) >= 0) { return null; }
    const e = src.indexOf(fn[1], s + fn[0].length);
    return e < 0 ? null : [s, e];
}
let allRed = true;
muts.forEach(([h, name, a, b, fn]) => {
    const at = within(fn), part = at ? src.slice(at[0], at[1]) : '';
    if (!at || part.split(a).length !== 2) { console.log('ANCHOR ' + (at ? part.split(a).length - 1 : 'no part') + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutnz.js', src.slice(0, at[0]) + part.replace(a, () => b) + src.slice(at[1]));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutnz.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutnz.js')) { fs.unlinkSync('mutnz.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
