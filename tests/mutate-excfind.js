// mutate-excfind.js - breaks each guard of the hidden exception search (double-tap '+' on a defect) in turn and requires
// the harness that owns it to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const XF = 'excfind-check.js', PC = 'profile-check.js';
const muts = [
    // ---- what to look for ----
    [XF, 'a description exception listed twice', "            if (fp.sig && !seen[fp.sig]) { seen[fp.sig] = true; out.push({ sig: fp.sig, msg: fp.msg }); }",
        "            if (fp.sig) { seen[fp.sig] = true; out.push({ sig: fp.sig, msg: fp.msg }); }"],
    [XF, 'an exception without a stack looked for', "            if (fp.sig && !seen[fp.sig]) { seen[fp.sig] = true; out.push({ sig: fp.sig, msg: fp.msg }); }",
        "            if (!seen[fp.sig]) { seen[fp.sig] = true; out.push({ sig: fp.sig, msg: fp.msg }); }"],
    [XF, 'the description\'s exceptions start unticked', "var t = add(e.sig, e.msg); t.desc = true; t.def = true; });", "var t = add(e.sig, e.msg); t.desc = true; });"],
    [XF, 'the least shared offered first', "        shared.sort(function (a, b) { return b.count - a.count || (a.sig < b.sig ? -1 : 1); });",
        "        shared.sort(function (a, b) { return a.count - b.count || (a.sig < b.sig ? -1 : 1); });"],
    [XF, 'exactly half is not enough', "if (e.count >= 2 && of && e.count / of >= X.SHARED_MIN) { t.def = true; }", "if (e.count >= 2 && of && e.count / of > X.SHARED_MIN) { t.def = true; }"],
    [XF, 'one log is a share', "if (e.count >= 2 && of && e.count / of >= X.SHARED_MIN) { t.def = true; }", "if (of && e.count / of >= X.SHARED_MIN) { t.def = true; }"],
    [XF, 'a count over no logs is a share', "if (e.count >= 2 && of && e.count / of >= X.SHARED_MIN) { t.def = true; }", "if (e.count >= 2 && e.count / of >= X.SHARED_MIN) { t.def = true; }"],
    [XF, 'every shared exception offered', "        shared.slice(0, X.MAX_SHARED).forEach(function (e) {", "        shared.forEach(function (e) {"],
    [XF, 'one in both listed twice', "            var t = by[sig];\n            if (!t) { t = by[sig] =", "            var t = null;\n            if (!t) { t = by[sig] ="],
    // ---- matching ----
    [XF, 'an exception kept once per report', "                return pool[e.sig] || (pool[e.sig] = { sig: e.sig, crash: JiTA.logsig._crashOf(e.sig) });",
        "                return { sig: e.sig, crash: JiTA.logsig._crashOf(e.sig) };"],
    [XF, 'a loose match kept over a later exact one', "if (e.sig === t.sig) { if (!hit || !hit.exact) { hit = { t: t, exact: true, where: src[0] }; } }",
        "if (e.sig === t.sig) { if (!hit) { hit = { t: t, exact: true, where: src[0] }; } }"],
    [XF, 'no crash-site matches', "else if (!hit && e.crash && e.crash === t.crash) { hit = { t: t, exact: false, where: src[0] }; }", "else if (false) { hit = { t: t, exact: false, where: src[0] }; }"],
    [XF, 'the report\'s description not looked at', "            [['log', rep.log], ['description', rep.desc]].forEach(function (src) {", "            [['log', rep.log]].forEach(function (src) {"],
    [XF, 'one place said twice', "        return out.filter(function (h) { var k = h.t.crash || h.t.sig; if (seen[k]) { return false; } seen[k] = true; return true; });", "        return out;"],
    [XF, 'one place said by its loose match', "        out.sort(function (a, b) { return (b.exact ? 1 : 0) - (a.exact ? 1 : 0); });\n        // Two ticked", "        // Two ticked"],
    [XF, 'a message of its own given a stack hint', "            if (g.length < 2) { return; }\n            var labels = P._pathLabels(", "            if (g.length < 1) { return; }\n            var labels = P._pathLabels("],
    [XF, 'one message, no stack hint', "            g.forEach(function (t, i) { t.via = labels[i]; });\n", ''],
    [XF, 'the box hides its stack hint', "            if (t.via) { $('<span class=\"jx-via\"></span>').text(' via ' + t.via).appendTo($m); }\n", ''],
    [XF, 'a match hides its stack hint', "(h.t.via ? ' via ' + h.t.via : '')", "''"],
    [XF, 'the hover text is the raw signature', "attr('title', JiTA.profile._sigTip(t.sig, t.msg))", "attr('title', t.sig)"],
    [XF, 'a match has no hover text', ".attr('title', JiTA.profile._sigTip(h.t.sig, h.t.msg)).appendTo($h);", ".appendTo($h);"],
    [XF, 'the stack on one line', "            p.frames.forEach(function (f) { out.push('    ' + f.replace(':', ': ')); });", "            out.push(p.frames.join('>'));"],
    [XF, 'the message once per stack', "            if (!i) { out.push(msg || p.msg); }", "            out.push(msg || p.msg);"],
    [XF, 'the lowercased message', "            if (!i) { out.push(msg || p.msg); }", "            if (!i) { out.push(p.msg); }"],
    [XF, 'several stacks not numbered', "(list.length > 1 ? 'Stack ' + (i + 1) + ' of ' + list.length : 'Stack')", "'Stack'"],
    [XF, 'a frameless signature given a stack heading', "            if (!p.frames.length) { return; }\n            out.push('', ", "            out.push('', "],
    [XF, 'an attached report still listed', "        var out = (reports || []).filter(function (r) { return !r.gone && r.m && r.m.length; });",
        "        var out = (reports || []).filter(function (r) { return r.m && r.m.length; });"],
    [XF, 'a loose match not after the exact ones', "            if (ea !== eb) { return eb - ea; }\n            var ca = a.created || ''", "            var ca = a.created || ''"],
    [XF, 'oldest first', "            if (ca !== cb) { return ca < cb ? 1 : -1; }\n            return a.key < b.key", "            if (ca !== cb) { return ca < cb ? -1 : 1; }\n            return a.key < b.key"],
    // ---- reading a report ----
    [XF, 'a replaced log not read again', "if (rec && rec.logs && (rec.logSig == null || rec.logSig === P._logSig(item.fields.attachment))) { return { rec: rec, cached: true }; }",
        "if (rec && rec.logs) { return { rec: rec, cached: true }; }"],
    [XF, 'an older reading always read again', "if (rec && rec.logs && (rec.logSig == null || rec.logSig === P._logSig(item.fields.attachment))) { return { rec: rec, cached: true }; }",
        "if (rec && rec.logs && rec.logSig === P._logSig(item.fields.attachment)) { return { rec: rec, cached: true }; }"],
    [XF, 'a stale reading handed on as read', "            if (rec && rec.logs) { rec = JiTA.excfind._unread(rec); }   // a log was added or replaced since it was read\n", ''],
    [XF, 'the zip read in the search', "            return P._readFiles(item, rec, false).then(function (r) { return { rec: r, cached: false }; });",
        "            return P._readFiles(item, rec, true).then(function (r) { return { rec: r, cached: false }; });"],
    [XF, 'the cached reading changed in place', "        var r = JSON.parse(JSON.stringify(rec));\n        r.logs = false; r.hasLog = false;", "        var r = rec;\n        r.logs = false; r.hasLog = false;"],
    [XF, 'old exceptions kept for a re-read', "r.logs = false; r.hasLog = false; r.exc = []; r.build = null;", "r.logs = false; r.hasLog = false; r.build = null;"],
    [XF, 'the old log names kept', "        delete r.logSig;\n        return r;", "        return r;"],
    [PC, 'the log files read are not named', "                    rec.logSig = P._logSig(att);\n", ''],
    [PC, 'the log names unsorted', "return JiTA.profile._logFiles(att).map(function (a) { return (a.filename || '') + ':' + (a.size || 0); }).sort().join('|');",
        "return JiTA.profile._logFiles(att).map(function (a) { return (a.filename || '') + ':' + (a.size || 0); }).join('|');"],
    [PC, 'a replaced log of another size unseen', "return JiTA.profile._logFiles(att).map(function (a) { return (a.filename || '') + ':' + (a.size || 0); }).sort().join('|');",
        "return JiTA.profile._logFiles(att).map(function (a) { return a.filename || ''; }).sort().join('|');"],
    // ---- the search ----
    [XF, 'GM team reports searched', "if (st.seen[iss.key] || JiTA.util.isGmTeam((iss.fields || {}).customfield_10001)) { return; }", "if (st.seen[iss.key]) { return; }"],
    [XF, 'a report listed twice read twice', "if (st.seen[iss.key] || JiTA.util.isGmTeam((iss.fields || {}).customfield_10001)) { return; }", "if (JiTA.util.isGmTeam((iss.fields || {}).customfield_10001)) { return; }"],
    [XF, 'oldest reports first', "        var body = { jql: JiTA.EBR_SCOPE + ' ORDER BY created DESC', fields: X.FIELDS", "        var body = { jql: JiTA.EBR_SCOPE + ' ORDER BY created ASC', fields: X.FIELDS"],
    [XF, 'one lane too many', "        var lanes = [listing];\n        for (var i = 0; i < X.CONCURRENCY; i++) { lanes.push(lane()); }", "        var lanes = [listing];\n        for (var i = 0; i <= X.CONCURRENCY; i++) { lanes.push(lane()); }"],
    [XF, 'reading goes on after the window closed', "        function lane() {\n            if (!X._alive(st)) { return Promise.resolve(); }\n            if (next < st.queue.length) {",
        "        function lane() {\n            if (next < st.queue.length) {"],
    [XF, 'a failed listing not said', "            st.error = 'Could not list the open bug reports: ' + (e && e.message || e);\n", ''],
    [XF, 'a closed search marked done', "            if (!X._alive(st)) { return; }\n            st.done = true;", "            st.done = true;"],
    [XF, 'cached reports not counted', "        if (r && r.cached) { st.cached++; }\n", ''],
    [XF, 'failed downloads not counted', "        if (!(r && r.rec && r.rec.logs)) { st.failed++; }   // a log that did not download is read again next time\n", ''],
    [XF, 'a report\'s description not read', "        return { key: iss.key, desc: JiTA.excfind._fps(JiTA.util.toPlainText(f.description)), fields: {", "        return { key: iss.key, desc: [], fields: {"],
    [XF, 'a failed listing reads as complete', "            if (st.done && !st.error) { bits.push('All ' + st.read + ' open bug reports read'); }", "            if (st.done) { bits.push('All ' + st.read + ' open bug reports read'); }"],
    // ---- ticking, starting ----
    [XF, 'a box unticked by hand ticked again', "        ts.forEach(function (t) { if (!st.touched[t.sig]) { st.on[t.sig] = t.def; } });", "        ts.forEach(function (t) { st.on[t.sig] = t.def; });"],
    [XF, 'the search started again', "        if (!st.started && ts.length) { st.started = true; X._sweep(st); }", "        if (ts.length) { st.started = true; X._sweep(st); }"],
    [XF, 'the search started with nothing to look for', "        if (!st.started && ts.length) { st.started = true; X._sweep(st); }", "        if (!st.started) { st.started = true; X._sweep(st); }"],
    [XF, 'a closed window starts a search', "        if (!X._alive(st)) { return; }\n        var ts = X.targets(st.desc, st.profile);", "        var ts = X.targets(st.desc, st.profile);"],
    [XF, 'ticking does not match again', "            X._paintTargets(st);\n            X._rematch(st);\n            X._paintResults(st);", "            X._paintTargets(st);\n            X._paintResults(st);"],
    [XF, 'a ticked box changes nothing', "return t.sig + '|' + t.count + '/' + t.of + (st.on[t.sig] ? '+' : '-'); }).join('\\n')", "return t.sig + '|' + t.count + '/' + t.of; }).join('\\n')"],
    [XF, 'a box ticked by hand forgotten', "                st.on[t.sig] = this.checked;\n                st.touched[t.sig] = true;\n", "                st.on[t.sig] = this.checked;\n"],
    // ---- drawing ----
    [XF, 'rows drawn anew each time', "            var row = st.rows[rep.key] || (st.rows[rep.key] = X._row(st, rep));", "            var row = (st.rows[rep.key] = X._row(st, rep));"],
    [XF, 'rows that no longer match stay', "            if (!(n.getAttribute && keep[n.getAttribute('data-key')])) { box.removeChild(n); }", "            if (!n.getAttribute) { box.removeChild(n); }"],
    [XF, 'a linked report offered Attach', "        if (st.linked[rep.key]) {\n            $('<span class=\"jx-linked\">linked</span>')", "        if (false) {\n            $('<span class=\"jx-linked\">linked</span>')"],
    [XF, 'a row drawn before the links came stays', "                    delete st.rows[k];   // drawn again, as linked\n", ''],
    [XF, 'Attach for the issue on screen', "                defect: st.key,\n                still: function () { return X._alive(st); },", "                still: function () { return X._alive(st); },"],
    [XF, 'Attach after the window closed', "                still: function () { return X._alive(st); },\n                done:", "                still: function () { return true; },\n                done:"],
    [XF, 'an attached report keeps its row', "                done: function (k) { X._gone(st, k); }", "                done: function () {}"],
    [XF, 'an attached report drawn back', "        st.reports.forEach(function (r) { if (r.key === key) { r.gone = true; } });\n", ''],
    [XF, 'none found, done or not, said wrong', "(st.done ? 'No open bug report holds these exceptions.' : 'None found so far.')", "(st.done ? 'None found so far.' : 'No open bug report holds these exceptions.')"],
    [XF, 'nothing ticked not said', "none = !X._chosen(st).length ? 'Tick an exception above to look for it.'", "none = false ? 'Tick an exception above to look for it.'"],
    [XF, 'every match called the same stack', ".text(h.exact ? 'same stack' : '~ same crash site')", ".text('same stack')"],
    [XF, 'a description match not said', "(h.where === 'description' ? ' (in its description)' : '')", "''"],
    [XF, 'where an exception comes from not said', "        if (t.desc) { bits.push('in the description'); }\n", ''],
    [XF, 'nothing to look for not said', "                : 'Nothing to look for: the description holds no exception with a stack trace", "                : 'Looking: the description holds no exception with a stack trace"],
    // ---- the window ----
    [XF, 'opens off a defect', "        if (!/^(EDR|EO|PLAT)-\\d+$/.test(key || '')) {\n            JiTA.ui.toast('Open a defect first", "        if (false) {\n            JiTA.ui.toast('Open a defect first"],
    [XF, 'the profile stops while the panel still shows it', "}, function () { return X._alive(st) || (JiTA.ui.currentKey === st.key && flagOn('defectProfile')); })",
        "}, function () { return X._alive(st); })"],
    [XF, 'a failed profile waited on for good', "                .then(null, function () { /* no attached reports to read */ })\n", ''],
    [XF, 'the local copy skipped', "            if (rec && rec.description) { return rec.description; }\n            return new Promise(function (resolve) {\n                $.ajax({ url: JiTA.HOST + '/rest/api/2/issue/' + encodeURIComponent(key) + '?fields=description'",
        "            return new Promise(function (resolve) {\n                $.ajax({ url: JiTA.HOST + '/rest/api/2/issue/' + encodeURIComponent(key) + '?fields=description'"],
    // ---- the Attach control's options ----
    [XF, 'Attach ignores the defect it is given', "        var defectKey = opts.defect || JiTA.ui.currentKey;", "        var defectKey = JiTA.ui.currentKey;"],
    [XF, 'Attach ignores the list\'s own check', "        var still = opts.still || function () {", "        var still = function () {"],
    [XF, 'Attach always slides the panel row out', "                                .then(function () { if (opts.done) { opts.done(reportKey); } else { JiTA.ui._fadeOutAndReplace($b.closest('li'), defectKey); } });",
        "                                .then(function () { JiTA.ui._fadeOutAndReplace($b.closest('li'), defectKey); });"],
    [XF, 'a report attached in Jira stays in the list', "                        JiTA.ui._takeOffList([reportKey], still);\n                        if (opts.done) { opts.done(reportKey); }\n", "                        JiTA.ui._takeOffList([reportKey], still);\n"],
    [XF, 'the panel\'s own check for any list', "                        JiTA.ui._takeOffList([reportKey], still);", "                        JiTA.ui._takeOffList([reportKey], function () { return JiTA.ui.currentKey === defectKey; });"],
    // ---- the launcher ----
    [XF, '+ never reaches the launcher', "&& e.key !== '#' && e.key !== '+') { return; }", "&& e.key !== '#') { return; }"],
    [XF, 'one + opens it', "                if (now - lastPlus >= 400) { lastPlus = now; return; }\n", ''],
    [XF, 'a third tap opens it again', "                lastPlus = 0;\n                try { JiTA.excfind.openView(); }", "                try { JiTA.excfind.openView(); }"],
    [XF, 'opened twice', "if (!JiTA.excfind || document.querySelector('#jita-menu.jita-excfind-view')) { return; }", "if (!JiTA.excfind) { return; }"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
fs.unlinkSync('mutt.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
