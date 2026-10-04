// mutate-profile.js - breaks the defect profile (v3.41.0) and requires profile-check to go red. A crashed harness counts
// as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'profile-check.js';
const muts = [
    // Computer Info
    [H, 'Windows 11 is not told from Windows 10', "        if (build >= 22000) { return 'Windows 11'; }\n", ''],
    [H, 'the driver date mixes up month and day', "hw.driverDate = rd[3] + '-' + P._p2(rd[1]) + '-' + P._p2(rd[2]);", "hw.driverDate = rd[3] + '-' + P._p2(rd[2]) + '-' + P._p2(rd[1]);"],
    // a Mac
    [H, 'a Mac is read as a Windows PC', "        var mac = /Trinity platform:\\s*metal\\b/i.test(t) || /\\bCPU:\\s*Apple\\b/i.test(t);", '        var mac = false;'],
    [H, 'macOS loses its version', "return mv ? 'macOS ' + mv[1] : 'macOS';", "return 'macOS';"],
    [H, 'a Mac\'s build counts as a Windows build', '            if (!mac) { hw.osBuild = +m[2]; }', '            hw.osBuild = +m[2];'],
    [H, 'a driver part without a date loses the GPU name', String.raw`\(Driver:\s*([^,()]*?),\s*Released:\s*([^()]*?)\s*\)/i`, String.raw`\(Driver:\s*([^,()]*?),\s*Released:\s*(\d[^()]*?)\s*\)/i`],
    [H, 'a Mac\'s 0.0.0.0 counts as a driver', '            if (/[1-9]/.test(m[2])) { hw.driver = m[2]; }', '            hw.driver = m[2];'],
    [H, 'an Apple CPU gets no generation', "hw.cpuGen = (hw.cpuVendor === 'Apple') ? P._appleChip(hw.gpu) : P._cpuGen(m[1]);", 'hw.cpuGen = P._cpuGen(m[1]);'],
    [H, 'a Mac\'s PDMData gives no macOS version', "hw.os = P._osName(String(os.MAJOR_VERSION || ''), null, true);", "hw.os = 'macOS';"],
    [H, 'Optimus is not switchable graphics', "hw.hybrid = !!((opt && /yes/i.test(opt[1])) || (sw && /yes/i.test(sw[1])));", "hw.hybrid = !!(sw && /yes/i.test(sw[1]));"],
    [H, 'Raptor Lake desktop parts are missed', '(mod === 183 || mod === 186 || mod === 191)', '(mod === 186 || mod === 191)'],
    [H, 'an Intel CPU the table does not name is not counted', "            return 'Intel (other)';", '            return null;'],
    [H, 'Zen 4 is read as Zen 3', "if (fam === 25) { return mod >= 96 ? 'AMD Zen 4' : 'AMD Zen 3'; }", "if (fam === 25) { return 'AMD Zen 3'; }"],
    [H, 'a GPU without a driver part is lost', "        } else if ((m = /Video Card:\\s*(.+?)(?=\\s+(?:Is Optimus|Is AMD|CPU|Memory):|$)/i.exec(t))) { hw.gpu = m[1]; }\n", '        }\n'],
    [H, 'only the description is looked at', '            if (t && P.MARK.test(t)) { return t; }\n', ''],
    [H, 'the free memory is read as total', 'hw.freeGB = Math.round(+m[2] / 102.4) / 10;', 'hw.freeGB = Math.round(+m[1] / 102.4) / 10;'],
    // logs
    [H, 'the build is not read', "var m = /EVE Client version\\s+([\\d.]+)\\s+build\\s+(\\d+)/i.exec(", "var m = /EVE Client version\\s+([\\d.]+)\\s+build\\s+(\\d+) never/i.exec("],
    [H, 'an exception logged twice counts twice', '            if (!fp.sig || seen[fp.sig]) { return; }', '            if (!fp.sig) { return; }'],
    // the zip
    [H, 'a file in a folder of the zip is not found', String.raw`.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/^.*[\/\\]/, '').toLowerCase();`, '.decode(u8.subarray(p + 46, p + 46 + nlen)).toLowerCase();'],
    [H, 'an encrypted entry is read', " || taken[base] || (flags & 1) || ", ' || taken[base] || '],
    [H, 'UTF-16 without a byte-order mark is read as UTF-8', 'if (n > 20 && zeros > n / 4) {', 'if (false) {'],
    // dxdiag and PDMData
    [H, 'a blue screen counts as an EVE client crash', "            if (k === 'eve') {", "            if (k === 'eve' || k === 'kernel') {"],
    [H, 'PDMData memory is read in the wrong unit', 'hw.ramGB = Math.round(mem / 1073741824);', 'hw.ramGB = Math.round(mem / 1048576);'],
    // reading a report's files
    [H, 'logs.txt is not read first', "            logs.sort(function (a, b) { return ((/^logs\\.txt$/i.test(b.filename) ? 1 : 0) - (/^logs\\.txt$/i.test(a.filename) ? 1 : 0)) || ((a.size || 0) - (b.size || 0)); });\n", ''],
    [H, 'a zip a player added is read as the igbr.zip', "return /^igbr\\.zip$/i.test(a.filename || '') && a.content;", "return /\\.zip$/i.test(a.filename || '') && a.content;"],
    [H, 'a failed log download is never read again', 'function () { /* a log failed: all of them are read again next time */ }', 'function () { return nextLog(); }'],
    [H, 'a report\'s logs are downloaded side by side', '            jobs = (function nextLog() {', '            small.forEach(function (a) { P._fetchLog(a.content, hint); });\n            jobs = (function nextLog() {'],
    // logs in Windows' own code page
    [H, 'every line is read as UTF-8', '        try { legacy = new TextDecoder(P._codepage(b, bad, hint)); } catch (e3) { legacy = lax; }', '        legacy = lax;'],
    [H, 'a valid UTF-8 line with Cyrillic is read in the code page', '            if (k < end) { try { strict.decode(b.subarray(i, end)); } catch (e2) { bad.push(i, end); } }', '            if (k < end) { bad.push(i, end); }'],
    [H, 'the client language does not settle the code page', '        if (P.CODEPAGES[hint]) { return P.CODEPAGES[hint]; }\n', ''],
    [H, 'Cyrillic without a label is read as Western', "        return (runs && hi / runs >= 3) ? 'windows-1251' : 'windows-1252';", "        return 'windows-1252';"],
    [H, 'a log is fetched and read as UTF-8 text', 'return JiTA.profile._fetchBytes(url).then(function (buf) { return JiTA.profile._decodeLog(new Uint8Array(buf), hint); });',
        "return JiTA.profile._fetchBytes(url).then(function (buf) { return new TextDecoder('utf-8').decode(new Uint8Array(buf)); });"],
    [H, 'the client language does not go with the logs', 'return P._fetchLog(small[li++].content, hint)', 'return P._fetchLog(small[li++].content)'],
    [H, 'the zip\'s log is read without the client language', 'return P.unzip(buf, want, P.MAX_LOG_BYTES, hint);', 'return P.unzip(buf, want, P.MAX_LOG_BYTES);'],
    [H, 'text in the zip is read as UTF-8 only', '        return JiTA.profile._decodeLog(b, hint);\n    },', "        return new TextDecoder('utf-8').decode(b);\n    },"],
    // the same message through other call stacks
    [H, 'a message reached two ways is two rows', '                var k = P._sigParts(e.sig).msg, g = msgs[k]', '                var k = e.sig, g = msgs[k]'],
    [H, 'a report that reaches the shared message another way is an outlier', 'return P._sigParts(e.sig).msg === P._sigParts(out.domExc.sig).msg;', 'return e.sig === out.domExc.sig;'],
    [H, 'a "<module>" frame is cut in two', "            if (frames.length && p.indexOf(':') < 0) { frames[frames.length - 1] += '>' + p; } else if (p) { frames.push(p); }", '            if (p) { frames.push(p); }'],
    [H, 'call stacks are labelled by their whole chain', 'chains[0][chains[0].length - 1 - cs]; })) { cs++; }', 'chains[0][chains[0].length - 1 - cs]; })) { break; }'],
    [H, 'the full profile lists a message\'s call stacks nowhere', '            if (g.paths.length < 2) { return; }', '            return;'],
    [H, 'what a half-read set of logs said is kept', "useLog(got, String(t || ''));", "useLog(rec, String(t || ''));"],
    [H, 'the zip\'s log is unpacked for a report with its own', "                if (rec.logs && !rec.hasLog) { want.push('logs.txt'); }", "                want.push('logs.txt');"],
    [H, 'the zip is unpacked without a size cap', 'return P.unzip(buf, want, P.MAX_LOG_BYTES, hint);', 'return P.unzip(buf, want, 0, hint);'],
    [H, 'a zip entry over the cap is unpacked', '            if (maxBytes && usize > maxBytes) { continue; }\n', ''],
    [H, 'every defect looked at stays in memory', '        if (keys.length > P.KEEP) { delete P._last[keys[0]]; }\n', ''],
    [H, 'a defect looked at again is the first dropped', '        delete P._last[key];\n        P._last[key] = s;', '        P._last[key] = s;'],
    [H, 'a failed zip download is never read again', '}, function () { /* the download failed: read it again next time */ });', '}, function () { rec.zip = true; });'],
    [H, 'a huge zip is downloaded', 'if (z.size > P.MAX_ZIP_BYTES) {', 'if (false) {'],
    [H, 'the zip is read with the switch off', '        if (zip && !rec.zip) {', '        if (!rec.zip) {'],
    [H, 'the log inside the zip is never used', "                    if (!rec.hasLog && files['logs.txt'] && rec.logs) { useLog(rec, files['logs.txt']); }\n", ''],
    [H, 'the zip\'s hardware beats the description\'s', 'var hw = ci || (rec && (rec.dxHw || rec.pdmHw)) || null;', 'var hw = (rec && (rec.dxHw || rec.pdmHw)) || ci || null;'],
    // the profile
    [H, 'a pattern needs no minimum of reports', '(known >= P.MIN_N && counts[top] / known >= P.DOMINANT)', '(counts[top] / known >= P.DOMINANT)'],
    [H, 'a pattern needs only 60%', '    DOMINANT: 0.75,', '    DOMINANT: 0.6,'],
    [H, 'an unread log counts as one without the exception', 'var withLog = views.filter(function (v) { return v.logRead === true; })', 'var withLog = views.filter(function (v) { return v.logRead !== false; })'],
    [H, 'a language makes an outlier', 'if (!d.dominant || !d.outlier || x == null', 'if (!d.dominant || x == null'],
    [H, 'a reopened defect still counts reports after its fix', 'if (defect && defect.resolutiondate && JiTA.util.isResolved(defect.status, defect.resolution)) {', 'if (defect && defect.resolutiondate) {'],
    [H, 'a crash history without the module is no outlier', "            if (out.domCrash && v.crashRead === true && !v.crashes.some(function (c) { return c.module === out.domCrash.module; })) {", '            if (false) {'],
    // building
    [H, 'reports linked from other projects count too', "var P = JiTA.profile, jql = 'issue in linkedIssues(\"' + key + '\") AND project = EBR';", "var P = JiTA.profile, jql = 'issue in linkedIssues(\"' + key + '\")';"],
    [H, 'every report is read again on every visit', '                issues.forEach(function (iss, i) { if (P._needs(recs[i], zip)) { todo.push(i); } });', '                issues.forEach(function (iss, i) { todo.push(i); });'],
    [H, 'a reading cached by an older build is trusted', '_usable: function (rec) { return (rec && rec.v === JiTA.profile.V) ? rec : null; },', '_usable: function (rec) { return rec || null; },'],
    [H, 'leaving the defect does not stop new reads', '                    if (next >= todo.length || (still && !still())) { return Promise.resolve(); }', '                    if (next >= todo.length) { return Promise.resolve(); }'],
    [H, 'a profile is marked done before all its reports are read', '                return Promise.all(lanes).then(function () { return (left || !todo.length) ? P._last[key] : publish(true); });', '                return Promise.all(lanes).then(function () { return publish(true); });'],
    // the panel and Settings
    [H, 'a value no pattern holds is shown as one', "            if (!d.dominant || d.id === 'lang') { return; }", "            if (d.id === 'lang') { return; }"],
    [H, 'a shared exception below the pattern is highlighted', "sm.domExc ? 'strong' : ''", "'strong'"],
    [H, 'a profile is painted under another issue', '        if (JiTA.ui.currentKey !== key) { return; }\n        var $b = P._box(!!s.total);', '        var $b = P._box(!!s.total);'],
    [H, 'the outliers are not listed in the card', '            sm.outliers.slice(0, P.SHOW_OUTLIERS).forEach(function (o) {', '            [].forEach(function (o) {'],
    // the Defect Profile card
    [H, 'the profile gets no card of its own', "        if (create && side && side.parentNode && !document.getElementById(P.GROUP_ID)) {", '        if (false) {'],
    [H, 'the card goes below the Triage Assistant', '            side.parentNode.insertBefore(g, side);', '            side.parentNode.insertBefore(g, side.nextSibling);'],
    [H, 'a rebuilt Triage Assistant card leaves the profile card below it', '        if (pg) { group.parentNode.insertBefore(pg, group); }', '        if (pg) { group.parentNode.insertBefore(pg, group.nextSibling); }'],
    [H, 'a second card is built on every paint', "        if (create && side && side.parentNode && !document.getElementById(P.GROUP_ID)) {", "        if (create && side && side.parentNode) {"],
    [H, 'the card is built for a defect without reports', '        var $b = P._box(!!s.total);', '        var $b = P._box(true);'],
    [H, 'the card stays up when the reports are gone', "        if (!s.total) { $b.removeClass('has-hits'); P._show(false); return; }", "        if (!s.total) { $b.removeClass('has-hits'); return; }"],
    [H, 'leaving the defect leaves the card', '        if (g && g.parentNode) { g.parentNode.removeChild(g); }\n        $(\'#jita-sd-profile\')', "        $('#jita-sd-profile')"],
    [H, 'a card Jira wiped stays away', '        P._paint(key, s);\n    },\n\n    renderSection', '    },\n\n    renderSection'],
    [H, 'the card comes back for a defect without reports', "        if (!s || !s.total || document.getElementById(P.GROUP_ID)", "        if (!s || document.getElementById(P.GROUP_ID)"],
    [H, 'the observer never puts the card back', '            JiTA.profile.reensure();   // the Defect Profile card, which Jira can wipe on its own\n', ''],
    [H, 'the profile stays in the Triage Assistant card', "               '<div id=\"jita-sd-exccluster\"></div>' +\n               '<ul id=\"jita-sd-list\"></ul>';", "               '<div id=\"jita-sd-exccluster\"></div>' +\n               '<div id=\"jita-sd-profile\"></div>' +\n               '<ul id=\"jita-sd-list\"></ul>';"],
    [H, 'the cards share their collapse state', '                gmSet(o.collapseKey, isColl);', '                gmSet(JiTA.ui.SIDE_COLLAPSE_KEY, isColl);'],
    [H, 'the defect page never draws the section', '        JiTA.profile.renderSection(key, background);        // what the bug reports attached to this defect have in common\n', ''],
    [H, 'the zip is off by default', 'zipOn: function () { return !!gmGet(JiTA.profile.ZIP_KEY, true); },', 'zipOn: function () { return !!gmGet(JiTA.profile.ZIP_KEY, false); },']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutpf.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutpf.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    // A run that never reaches its last line (a promise left pending ends node quietly, exit 0) is red too.
    const red = crashed || fails.length > 0 || /FAILURE/.test(out) || !/profile checks passed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutpf.js')) { fs.unlinkSync('mutpf.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
