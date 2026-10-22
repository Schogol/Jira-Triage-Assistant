// mutate-stacktrace.js - breaks each guard of the stacktraces (v3.46.0: STACKTRACE blocks count wherever exceptions do,
// one cut off before its stack by its message, the logs read before them read again) in turn and requires the harness
// that owns it to go red. A crashed harness counts as red. The tab's and the worker's copies share whole lines, so a
// breakage may name the function it is made in: [harness, name, anchor, replacement, [function's first line, its end]],
// the anchor then once in that function.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const T = 'stacktrace-check.js', XF = 'excfind-check.js', PC = 'profile-check.js', XB = 'excboost-check.js';
const TFP = ['    _fingerprint: function (text) {', '\n    },'], WFP = ['    function lgFp(text) {', '\n    }\n'];
const TSPLIT = ['    _splitBlocks: function (text) {', '\n    },'], WSPLIT = ['    function lgSplit(text) {', '\n    }\n'];
const TLB = ['    _logBlocks: function (text) {', '\n    },'], WLB = ['    function lgBlocks(text) {', '\n    }\n'];
const APPLY = ['    applyToTable: function () {', '\n    },'];
const TIDX = ['    // A stacktrace also files its defect under its message (traceMsg)', '\n    },'], WIDX = ['    function buildIndexes(recs) {', '\n    }\n'];
const TPT = ['    _pointAt: function (idx, sig, crashSig) {', '\n    },'], WPT = ['    function lgPoint(idx, sig, crashSig) {', '\n    }\n'];
const TMATES = ['    _traceMates: function (idx, sig) {', '\n    },'], WMATES = ['    function lgMates(idx, sig) {', '\n    }\n'];
const THOLD = ['    _holdingLocal: function (sigs) {', '\n    },'], WHOLD = ['    function lgHolding(sigs) {', '\n    }\n'];
const muts = [
    // ---- the tag, the cut, the message part ----
    [T, 'stacktraces share the exceptions\' signatures', "    TRACE: '[stacktrace] ',", "    TRACE: '',"],
    [T, 'the worker gives stacktraces no tag', "    var LG_TRACE = '[stacktrace] ',", "    var LG_TRACE = '',"],
    [T, 'nothing is ever cut off', "return JiTA.logsig.isTrace(s) && s.charAt(s.length - 1) === '|'; },", 'return false; },'],
    [T, 'an exception with no frames taken for one cut off', "return JiTA.logsig.isTrace(s) && s.charAt(s.length - 1) === '|'; },", "return s.charAt(s.length - 1) === '|'; },"],
    [T, 'the worker cuts nothing off', "return lgIsTrace(s) && s.charAt(s.length - 1) === '|'; }", 'return false; }'],
    [T, 'a stacktrace\'s message part taken whole', "_traceKey: function (sig) { var s = String(sig == null ? '' : sig); return s.slice(0, s.lastIndexOf('|')); },",
        "_traceKey: function (sig) { return String(sig == null ? '' : sig); },"],
    [T, 'the worker takes the message part whole', "function lgTraceKey(sig) { var s = String(sig == null ? '' : sig); return s.slice(0, s.lastIndexOf('|')); }",
        "function lgTraceKey(sig) { return String(sig == null ? '' : sig); }"],
    // ---- a description's blocks ----
    [T, 'a description\'s stacktraces not split out', 're = /(EXCEPTION|STACKTRACE) #', 're = /(EXCEPTION) #', TSPLIT],
    [T, 'a block in a description runs on past the next of the other kind', '(?=(?:EXCEPTION|STACKTRACE) #)', '(?=\\1 #)', TSPLIT],
    [T, 'the worker splits out no stacktrace', 're = /(EXCEPTION|STACKTRACE) #', 're = /(EXCEPTION) #', WSPLIT],
    // ---- the fingerprint ----
    [T, 'a stacktrace read as an exception', 'var trace = si >= 0 ? (ei < 0 || si < ei)', 'var trace = si >= 0 ? false', TFP],
    [T, 'an exception quoting a stacktrace read as one', 'var trace = si >= 0 ? (ei < 0 || si < ei)', 'var trace = si >= 0 ? true', TFP],
    [T, 'a stack pasted without its first line read as an exception\'s', ': (ei < 0 && /\\bTraced at\\b/i', ': (false && /\\bTraced at\\b/i', TFP],
    [T, 'an exception pasted without its first line read as a stacktrace', ' && !/\\b(?:Formatted exception info|Caught at|Thrown at)\\b/i.test(text));', ');', TFP],
    [T, 'a stacktrace\'s message runs on to its stack', 'msg = rest.slice(0, end ? end.index : rest.length);', 'msg = rest;', TFP],
    [T, 'a stacktrace\'s message runs past its line\'s end', 'var end = /\\n|', 'var end = /\\u0000|', TFP],
    [T, 'a stacktrace\'s message runs past the next line\'s columns', '|\\s\\d{1,2}:\\d{2}:\\d{2}\\t[^\\t\\n]*\\t[^\\t\\n]*\\t|\\b(?:Common', '|\\b(?:Common', TFP],
    [T, 'a stacktrace\'s message runs past its stack', '|\\b(?:Common path prefix|Traced at|Thread Locals|Stackhash|Reported from|STACKTRACE END)\\b/i.exec(rest);', '/i.exec(rest);', TFP],
    [T, 'a message that may run on never open', 'open = !(end && /[\\n\\t]/.test(end[0]));', 'open = false;', TFP],
    [T, 'every stacktrace message open', 'open = !(end && /[\\n\\t]/.test(end[0]));', 'open = true;', TFP],
    [T, 'a run-on message kept whole', '        if (open) { msg = msg.slice(0, L.OPEN_CUT).trim(); }\n', ''],
    [T, 'a stacktrace\'s message taken from an exception in its dump', 'if (!trace && (mm = /Formatted exception info', 'if ((mm = /Formatted exception info', TFP],
    [T, 'no tag on a stacktrace\'s signature', '        if (trace) { nmsg = L.TRACE + nmsg; }\n', ''],
    [T, 'a stacktrace cut off before its stack has no signature', ": ((trace && msg) ? (nmsg + '|').toLowerCase() : null);", ': null;', TFP],
    [T, 'an exception with too few frames matched by its message', ": ((trace && msg) ? (nmsg + '|').toLowerCase() : null);", ": (msg ? (nmsg + '|').toLowerCase() : null);", TFP],
    [T, 'a cut stacktrace with no message matched by anything', ": ((trace && msg) ? (nmsg + '|').toLowerCase() : null);", ": (trace ? (nmsg + '|').toLowerCase() : null);", TFP],
    [T, 'the worker reads a stacktrace as an exception', 'var trace = si >= 0 ? (ei < 0 || si < ei)', 'var trace = si >= 0 ? false', WFP],
    [T, 'the worker\'s run-on messages never open', 'open = !(end && /[\\n\\t]/.test(end[0]));', 'open = false;', WFP],
    [T, 'the worker keeps a run-on message whole', '        if (open) { msg = msg.slice(0, LG_OPEN).trim(); }\n', ''],
    [T, 'the worker cuts no stacktrace off', ": ((trace && msg) ? (nmsg + '|').toLowerCase() : null);", ': null;', WFP],
    // ---- a raw log's blocks ----
    [T, 'a raw log\'s stacktraces not blocks', "var trace = messages[i].indexOf('STACKTRACE #') !== -1;", 'var trace = false;', TLB],
    [T, 'an exception runs on into a stacktrace in a raw log', "|| messages[j].indexOf('STACKTRACE #') !== -1 ", '', TLB],
    [T, 'a cut stacktrace runs on into the next record', '(pre && pres[j] && pres[j] !== pre)', 'false', TLB],
    [T, 'a line without columns ends a stacktrace', '(pre && pres[j] && pres[j] !== pre)', '(pre && pres[j] !== pre)', TLB],
    [T, 'a line without its time ends a stacktrace', 'pres.push((parts.length > 1 && parts[0]) ?', 'pres.push((parts.length > 1) ?', TLB],
    [T, 'a stacktrace waits for an exception\'s END line', "endLine = trace ? 'STACKTRACE END' : 'EXCEPTION END';", "endLine = 'EXCEPTION END';", TLB],
    [T, 'every line of a stacktrace a record of its own', "pre = trace ? pres[i] : ''", "pre = trace ? 'x' : ''", TLB],
    [T, 'the worker\'s raw log stacktraces not blocks', "var trace = messages[i].indexOf('STACKTRACE #') !== -1;", 'var trace = false;', WLB],
    [T, 'the worker lets a cut stacktrace run on', '(pre && pres[j] && pres[j] !== pre)', 'false', WLB],
    // ---- what a block points at ----
    [T, 'a log\'s loose matches counted exact', "loose = !!hit && hit.by !== 'stack';\n                if (!defect) { return; }", 'loose = false;\n                if (!defect) { return; }'],
    [T, 'the worker counts a log\'s loose matches exact', "var defect = hit.key, loose = hit.by !== 'stack';", 'var defect = hit.key, loose = false;'],
    [T, 'a stacktrace never found by its message', "        if ((mates = L._traceMates(idx, sig)).length) { return { key: mates[0].key, by: 'message' }; }\n", '', TPT],
    [T, 'a match by message said to be the stack', "by: 'message' }", "by: 'stack' }", TPT],
    [T, 'the worker never finds one by its message', "        if ((mates = lgMates(idx, sig)).length) { return { key: mates[0].key, by: 'message' }; }\n", '', WPT],
    [T, 'a whole one matched by any of its message', 'var map = L.isCut(sig) ? idx.traceMsg : idx.traceCut;', 'var map = idx.traceMsg;', TMATES],
    [T, 'a cut one matched only by cut ones', 'var map = L.isCut(sig) ? idx.traceMsg : idx.traceCut;', 'var map = idx.traceCut;', TMATES],
    [T, 'the worker matches a whole one by any of its message', 'var map = lgIsCut(sig) ? idx.traceMsg : idx.traceCut;', 'var map = idx.traceMsg;', WMATES],
    // ---- the index ----
    [T, 'a description of stacktraces alone not mined', "(desc.indexOf('EXCEPTION #') === -1 && desc.indexOf('STACKTRACE #') === -1)", "desc.indexOf('EXCEPTION #') === -1", TIDX],
    [T, 'stacktraces not filed by their message', '                    if (L.isTrace(fp.sig)) { file(traceMsg, L._traceKey(fp.sig), member); }\n', '', TIDX],
    [T, 'cut ones not filed among the cut', '                        file(traceCut, L._traceKey(fp.sig), member);\n', '', TIDX],
    [T, 'a defect\'s cut ones not kept for it', '                        if (keyToCut[key].indexOf(fp.sig) === -1) { keyToCut[key].push(fp.sig); }\n', '', TIDX],
    [T, 'a cut one clustered by an empty stack', '                        continue;\n', '', TIDX],
    [T, 'a defect filed twice under one message', 'if (list.indexOf(member) === -1) { list.push(member); }', 'list.push(member);', TIDX],
    [T, 'a message\'s defects not newest first', '            Object.keys(traceMsg).forEach(function (s) { traceMsg[s].sort(memberSort); });\n', '', TIDX],
    [T, 'the worker files no stacktrace by its message', '                    if (lgIsTrace(fp.sig)) { lgFile(traceMsg, lgTraceKey(fp.sig), lmember); }\n', '', WIDX],
    [T, 'the worker clusters cut ones', '                        continue;\n', '', WIDX],
    [T, 'the worker mines no description of stacktraces alone', " || r.description.indexOf('STACKTRACE #') !== -1)", ')', WIDX],
    // ---- which defects hold one ----
    [T, 'a stacktrace held as an exception', "put(c.members, L.isTrace(sig) ? 'st-exact' : 'exact');", "put(c.members, 'exact');", THOLD],
    [T, 'a stacktrace\'s site held as a crash site', "put(cc.members, L.isTrace(sig) ? 'st-site' : 'site');", "put(cc.members, 'site');", THOLD],
    [T, 'no defect held by a stacktrace\'s message', "            list.forEach(function (sig) { put(L._traceMates(idx, sig), 'st-msg'); });\n", '', THOLD],
    [T, 'a stacktrace before an exception at the same level', 'var list = (sigs || []).filter(function (s) { return !L.isTrace(s); }).concat((sigs || []).filter(L.isTrace));', 'var list = sigs || [];', THOLD],
    [T, 'the worker holds a stacktrace as an exception', "put(c.members, lgIsTrace(sig) ? 'st-exact' : 'exact');", "put(c.members, 'exact');", WHOLD],
    [T, 'the worker holds none by its message', "        list.forEach(function (sig) { put(lgMates(idx, sig), 'st-msg'); });\n", '', WHOLD],
    [T, 'a defect\'s cut ones not handed on', 'cuts: (idx && idx.keyToCut && idx.keyToCut[key]) || [] };\n        });', 'cuts: [] };\n        });'],
    [T, 'the worker hands on no cut ones', 'cuts: (idx && idx.keyToCut && idx.keyToCut[key]) || [] };\n    }', 'cuts: [] };\n    }'],
    // ---- the log parser ----
    [T, 'the parser skips stacktraces', "trace = head.indexOf('STACKTRACE #') !== -1;", 'trace = false;', APPLY],
    [T, 'the parser lets a cut stacktrace run on', '(p2 && p2 !== pre)', 'false', APPLY],
    [T, 'the parser reads past a stacktrace\'s END', "endLine = trace ? 'STACKTRACE END' : 'EXCEPTION END';", "endLine = 'EXCEPTION END';", APPLY],
    [T, 'a known stacktrace called an exception', "return st ? 'Known stacktrace · ' : 'Known exception · ';", "return 'Known exception · ';", APPLY],
    [T, 'a cut one\'s mark says the trace site', "(by === 'message' ? 'same message, stack cut off' : (st ? 'same trace site' : 'same crash site'))", "(st ? 'same trace site' : 'same crash site')", APPLY],
    [T, 'a stacktrace\'s site called a crash site', "(st ? 'same trace site' : 'same crash site')", "'same crash site'", APPLY],
    [T, 'a re-match keeps a stacktrace\'s old hover', '/^(Known (exception|stacktrace)|Possibly related \\(same [^)]*\\)) · /', '/^(Known exception|Possibly related \\(same crash site\\)) · /'],
    // ---- the profile's readings ----
    [T, 'a reading made now does not say how', '                    rec.lv = P.LOG_V;\n', ''],
    [T, 'a reading from before stacktraces never read again', '        if (rec.logs && !P._logsCurrent(rec, att, zip)) {', '        if (false) {'],
    [T, 'a log out of the zip read again without the zip', '            if (P._zipLog(rec, att)) { rec.zip = false; }\n', ''],
    [T, 'a log out of the zip lost where the zip is not read', '(rec.lv === JiTA.profile.LOG_V || (!zip && JiTA.profile._zipLog(rec, att)))', '(rec.lv === JiTA.profile.LOG_V)'],
    [T, 'a log out of the zip never read again', '(rec.lv === JiTA.profile.LOG_V || (!zip && JiTA.profile._zipLog(rec, att)))', '(rec.lv === JiTA.profile.LOG_V || JiTA.profile._zipLog(rec, att))'],
    [T, 'every log taken for one out of the zip', 'return !!(rec && rec.hasLog) && !JiTA.profile._logFiles(att).length; },', 'return !!(rec && rec.hasLog); },'],
    [T, 'the profile never reads a reading from before stacktraces again', ' || !JiTA.profile._logsCurrent(rec, att, zip); },', '; },'],
    [T, 'the profile\'s build blind to a report\'s own logs', 'if (P._needs(recs[i], zip, (iss.fields || {}).attachment)) {', 'if (P._needs(recs[i], zip)) {'],
    [T, 'stacktraces crowd out exceptions', 'if (!seen[e.sig] && n[k] < P.MAX_EXC) {', 'if (!seen[e.sig] && into.exc.length < P.MAX_EXC) {'],
    [T, 'a first log\'s stacktraces counted as exceptions', "into.exc.forEach(function (e) { seen[e.sig] = true; n[L.isTrace(e.sig) ? 'st' : 'exc']++; });", 'into.exc.forEach(function (e) { seen[e.sig] = true; n.exc++; });'],
    // ---- the profile's words ----
    [T, 'a stacktrace\'s hover says nothing of its kind', "out.push((st ? 'Stacktrace: ' : '') + (msg ||", "out.push(('') + (msg ||"],
    [T, 'a cut one\'s hover says nothing of its stack', "                if (L.isCut(sig)) { out.push('', head + ': cut off in the log, as the client cuts a stacktrace at 6400 characters'); }\n", ''],
    [T, 'a stacktrace\'s hover keeps its tag', '(msg || (st ? p.msg.slice(L.TRACE.length) : p.msg))', '(msg || p.msg)'],
    [T, 'a stack cut off labelled by nothing', "            if (!c.length) { return '(stack cut off)'; }\n", ''],
    [T, 'stacks labelled with the cut one among them', '        var full = chains.filter(function (c) { return c.length; });', '        var full = chains;'],
    [T, 'an outlier lacks an exception, whatever it lacks', "(JiTA.logsig.isTrace(out.domExc.sig) ? 'stacktrace ' : 'exception ')", "'exception '"],
    [PC, 'a shared stacktrace shown as an exception', "(JiTA.logsig.isTrace(sm.exc[0].sig) ? 'Stacktrace in ' : 'Exception in ')", "'Exception in '"],
    [PC, 'the full profile says nothing of a stacktrace', 'function kind($r, g) { if (JiTA.logsig.isTrace(g.key)) {', 'function kind($r, g) { if (false) {'],
    [PC, 'a report\'s stacktraces counted as exceptions', "(v.exc.length - nSt) + ' exception(s)' + (nSt ? ', ' + nSt + ' stacktrace(s)' : '')", "v.exc.length + ' exception(s)'"],
    // ---- the exception search ----
    [T, 'a description of stacktraces alone gives none', "if (!text || (String(text).indexOf('EXCEPTION #') < 0 && String(text).indexOf('STACKTRACE #') < 0)) { return out; }",
        "if (!text || String(text).indexOf('EXCEPTION #') < 0) { return out; }"],
    [T, 'a run-on one not said to run on', 'out.push(fp.open ? { sig: fp.sig, msg: fp.msg, open: true } : { sig: fp.sig, msg: fp.msg });', 'out.push({ sig: fp.sig, msg: fp.msg });'],
    [T, 'a run-on one in the description looked for as it is', 't.desc = true; if (e.open) { t.open = true; } });', 't.desc = true; });'],
    [T, 'a run-on one pasted looked for as it is', 't.own = true; if (e.open) { t.open = true; } });', 't.own = true; });'],
    [T, 'a stacktrace\'s message matched with its tag', 'm: sig.slice(st ? L.TRACE.length : 0, at)', 'm: sig.slice(0, at)'],
    [T, 'a stacktrace taken for an exception in matching', 'cut: !!(w && w.cut), st: st };', 'cut: !!(w && w.cut), st: false };'],
    [T, 'an exception finds a stacktrace', '                    else if (e.st === tx.st) {', '                    else {'],
    [T, 'an entry cut off looked for at its stack', 'if (tBare || (e.st && !e.fr)) {', 'if (tBare) {'],
    [T, 'a target cut off looked for at its stack', 'if (tBare || (e.st && !e.fr)) {', 'if (e.st && !e.fr) {'],
    [T, 'one cut off found by any message', 'bare = fits && (!!t.re || !!t.open || e.m === tx.m);', 'bare = fits;'],
    [T, 'a run-on one looked for by its signature', 'else if (t.re || t.open) {', 'else if (t.re) {'],
    [T, 'a run-on one compared to its end', '            if (t.open && tw) { tw.cut = true; }\n', ''],
    [T, 'a match by message kept over one at the site', 'else if (site) { if (!hit || hit.bare) {', 'else if (site) { if (!hit) {'],
    [T, 'a match by message over one at the site found before it', 'else if (bare && !hit) {', 'else if (bare) {'],
    [T, 'stacktraces pasted together read as one', "var whole = text.indexOf('EXCEPTION #') >= 0 || text.indexOf('STACKTRACE #') >= 0,", "var whole = text.indexOf('EXCEPTION #') >= 0,"],
    [T, 'an edit of one without a message starts with its tag', '        if (!w) { return JiTA.excfind._exc(t.sig).m; }', "        if (!w) { return t.sig.slice(0, t.sig.lastIndexOf('|')); }"],
    [XF, 'a stacktrace not said to be one', '            if (JiTA.logsig.isTrace(t.sig)) {   // a stacktrace says so', '            if (false) {   // a stacktrace says so'],
    [XF, 'one cut off not said to be cut off', "JiTA.logsig.isCut(t.sig) ? 'stacktrace, stack cut off' : 'stacktrace'", "'stacktrace'"],
    [XF, 'a match by message said to be at a site', "h.bare ? '~ same message, stack cut off'", "false ? '~ same message, stack cut off'"],
    [XF, 'a stacktrace\'s site called a crash site in the search', "(JiTA.logsig.isTrace(h.t.sig) ? '~ same trace site' : '~ same crash site')", "'~ same crash site'"],
    [XF, 'a reading from before stacktraces handed on as read', '&& P._logsCurrent(rec, att, false)) { return { rec: rec, cached: true }; }', ') { return { rec: rec, cached: true }; }'],
    // ---- the ranking boost ----
    [T, 'a stacktrace raises nothing', "'st-exact': 1.3,", "'st-exact': 1,"],
    [T, 'a stacktrace\'s site raises as much as its stack', "'st-site': 1.15,", "'st-site': 1.3,"],
    [T, 'a match by message raises nothing', "'st-msg': 1.15 },", "'st-msg': 1 },"],
    [T, 'a stacktrace ranked over an exception', "KINDS: ['exact', 'st-exact',", "KINDS: ['st-exact', 'exact',"],
    [T, 'a defect\'s cut ones filed by an empty stack', '            if (L.isCut(sig)) { out.cuts[L._traceKey(sig)] = true; return; }', '            if (L.isCut(sig)) { out.cuts[L._traceKey(sig)] = true; }'],
    [T, 'a defect\'s stacktraces not filed by their message', '            if (L.isTrace(sig)) { out.traces[L._traceKey(sig)] = true; }\n', ''],
    [T, 'a defect\'s cut ones from its description dropped', '            ((d && d.cuts) || []).forEach(add);\n', ''],
    [T, 'a defect\'s cut one counted twice', 'if (!sig || out.sigs[sig] || (L.isCut(sig) && out.cuts[L._traceKey(sig)])) { return; }', 'if (!sig || out.sigs[sig]) { return; }'],
    [T, 'a report\'s cut one held by nothing', "if (L.isCut(sig)) { k = ds.traces[L._traceKey(sig)] ? 'st-msg' : null; }", 'if (L.isCut(sig)) { k = null; }'],
    [T, 'a report\'s stack held by no cut one', "            else if (st && ds.cuts[L._traceKey(sig)]) { k = 'st-msg'; }\n", ''],
    [T, 'a report\'s stacktrace held as an exception', "            else if (ds.sigs[sig]) { k = st ? 'st-exact' : 'exact'; }", "            else if (ds.sigs[sig]) { k = 'exact'; }"],
    [T, 'the worst kind kept', 'R.KINDS.indexOf(k) < R.KINDS.indexOf(best)', 'R.KINDS.indexOf(k) > R.KINDS.indexOf(best)'],
    [XB, 'a stacktrace\'s badge says exception', "'st-exact': ['same stacktrace in log',", "'st-exact': ['same exception in log',"],
    [XB, 'a stacktrace\'s badge styled as a loose one', "exact = kind === 'exact' || kind === 'st-exact';", "exact = kind === 'exact';"],
    [XB, 'a match by message\'s badge says nothing of the cut', "where the client cut one of the two off before its stack']", "']"],
    // ---- reading the open reports again ----
    [XB, 'a pass by an older reader trusted', '(mark && mark.at && mark.lv === JiTA.profile.LOG_V)', '(mark && mark.at)'],
    [XB, 'a complete pass marked without its reader', '{ at: began, lv: JiTA.profile.LOG_V }', '{ at: began }']
];
// Where an anchor is looked for: the whole file, or the one function named.
function within(fn) {
    if (!fn) { return [0, src.length]; }
    const s = src.indexOf(fn[0]);
    if (s < 0 || src.indexOf(fn[0], s + 1) >= 0) { return null; }
    const e = src.indexOf(fn[1], s);
    return e < 0 ? null : [s, e];
}
let allRed = true;
muts.forEach(([h, name, a, b, fn]) => {
    const at = within(fn), part = at ? src.slice(at[0], at[1]) : '';
    if (!at || part.split(a).length !== 2) { console.log('ANCHOR ' + (at ? part.split(a).length - 1 : 'no function') + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutst.js', src.slice(0, at[0]) + part.replace(a, () => b) + src.slice(at[1]));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutst.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutst.js')) { fs.unlinkSync('mutst.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
