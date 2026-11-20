// mutate-changelog.js - breaks each guard of the changelog and its "What's new" pill (v3.38.0), and of CHANGELOG.md as
// the script reads it (v3.52.2), and requires changelog-check to go red. A breakage either changes the script (a copy
// in mutt.js, handed over as JITA_SRC) or, marked MD, the changelog file (a copy in mutt.md, as JITA_CHANGELOG). A
// crashed harness counts as red.
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const md = fs.readFileSync(process.env.JITA_CHANGELOG || path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const H = 'changelog-check.js', MD = 'md';
const ver = (/^\/\/ @version\s+(\S+)/m.exec(src) || [])[1] || '';
const nextVer = ver.replace(/(\d+)$/, (d) => String(+d + 1));
const firstItem = (/\n- [^\n]*/.exec(md.slice(md.indexOf('\n## ')) ) || [''])[0];
const muts = [
    // ---- the data has to match the release ----
    [H, 'a release without an entry', '// @version     ' + ver + '\n', '// @version     ' + nextVer + '\n'],
    // ---- the file comes with the script (v3.52.2) ----
    [H, 'the @resource line asks for an older copy', '/CHANGELOG.md?v=' + ver + '\n', '/CHANGELOG.md?v=' + ver.replace(/(\d+)$/, (d) => String(+d - 1)) + '\n'],
    [H, 'the @resource line asks for no version', '/CHANGELOG.md?v=' + ver + '\n', '/CHANGELOG.md\n'],
    [H, 'the script may not read it', '// @grant       GM_getResourceText\n', ''],
    [H, 'the script reads another resource', "    RESOURCE: 'changelog',", "    RESOURCE: 'CHANGELOG',"],
    [H, 'the file is read on every call', '        if (!C._entries) {\n            var text', '        if (true) {\n            var text'],
    [H, 'the GitHub address goes elsewhere', "    URL: 'https://github.com/Schogol/Jira-Triage-Assistant/blob/main/CHANGELOG.md',", "    URL: 'https://github.com/Schogol/Jira-Triage-Assistant',"],
    // ---- the parser ----
    [H, 'a version heading takes any text', "m = /^## (\\d+(?:\\.\\d+)+) \\((\\d{4}-\\d{2}-\\d{2})\\)$/.exec(line);", "m = /^## (\\S+) \\((\\S+)\\)$/.exec(line);"],
    [H, 'escapes are kept', "    _unescape: function (s) { return String(s).replace(/\\\\([!-\\/:-@\\[-`{-~])/g, '$1'); },", '    _unescape: function (s) { return String(s); },'],
    [H, 'a list named twice is merged', 'if (kind && !cur[kind]) { cur[kind] = []; } else {', 'if (kind) { cur[kind] = cur[kind] || []; } else {'],
    [H, 'another heading leaves the list above it open', 'if (m || /^#/.test(line)) {', 'if (m) {'],
    [H, 'a list heading is taken by any name', "        for (var i = 0; i < T.length; i++) { if (T[i].label === label) { return T[i].kind; } }\n        return null;", "        return label === 'New features' ? 'features' : 'fixes';"],
    [H, 'a line passed over is not listed', "            errors.push((i + 1) + ': ' + line);\n        }\n        return { entries: entries, errors: errors };", '        }\n        return { entries: entries, errors: errors };'],
    [H, 'the notes above the first version are read as errors', '            if (!cur || !line.trim()) { continue; }', '            if (!line.trim()) { continue; }'],
    // ---- with no changelog (v3.52.2) ----
    [H, 'no changelog: marking seen throws', 'if (top && (!seen || JiTA.worker._verCmp(top.v, seen) > 0)) { gmSet(C.SEEN_KEY, top.v); }', 'if (!seen || JiTA.worker._verCmp(top.v, seen) > 0) { gmSet(C.SEEN_KEY, top.v); }'],
    [H, 'no changelog: ensure throws', "        if (!top || String(gmGet(C.SEEN_KEY, '') || '') === top.v) { return; }", "        if (String(gmGet(C.SEEN_KEY, '') || '') === top.v) { return; }"],
    [H, 'no changelog: the file read throws', "            try { text = (typeof GM_getResourceText === 'function' && GM_getResourceText(C.RESOURCE)) || ''; } catch (e) { text = ''; }", "            text = GM_getResourceText(C.RESOURCE) || '';"],
    [H, 'no changelog: an empty list with no link', '            if (!C.entries().length) {   // the script manager gave', '            if (false) {   // the script manager gave'],
    // ---- what counts as new ----
    [H, 'first sight shows the whole history as new', 'if (!seen) { return C.entries().slice(0, 1); }', 'if (!seen) { return C.entries().slice(); }'],
    [H, 'the seen version still counts as new', 'return C.entries().filter(function (e) { return JiTA.worker._verCmp(e.v, seen) > 0; });', 'return C.entries().filter(function (e) { return JiTA.worker._verCmp(e.v, seen) >= 0; });'],
    [H, 'seeing it is never remembered', 'if (top && (!seen || JiTA.worker._verCmp(top.v, seen) > 0)) { gmSet(C.SEEN_KEY, top.v); }\n        C.remove();', 'C.remove();'],
    [H, 'the oldest version is remembered as seen', 'gmSet(C.SEEN_KEY, top.v);', 'gmSet(C.SEEN_KEY, C.entries()[C.entries().length - 1].v);'],
    [H, 'the pill never counts', 'if (fresh.length === 1) {', 'if (fresh.length >= 1) {'],
    [H, 'shows inside a frame', 'return !JITA_IS_SUBFRAME && JiTA.changelog.unseenFeatures().length > 0;', 'return JiTA.changelog.unseenFeatures().length > 0;'],
    [H, 'shows with nothing new', 'return !JITA_IS_SUBFRAME && JiTA.changelog.unseenFeatures().length > 0;', 'return !JITA_IS_SUBFRAME;'],
    // ---- only features bring the pill (v3.39.0) ----
    [H, 'a fix-only update brings the pill', 'return !JITA_IS_SUBFRAME && JiTA.changelog.unseenFeatures().length > 0;', 'return !JITA_IS_SUBFRAME && JiTA.changelog.unseen().length > 0;'],
    [H, 'the pill counts the fix-only updates too', '        if (lbl) { lbl.textContent = C.label(C.unseenFeatures()); }', '        if (lbl) { lbl.textContent = C.label(C.unseen()); }'],
    [H, 'any entry counts as a feature', "    hasFeatures: function (e) { return JiTA.changelog._list(e, 'features').length > 0; },", '    hasFeatures: function (e) { return !!e; },'],
    // ---- the two tabs ----
    [H, 'a tab lists every version', '        return C.entries().filter(function (e) { return C._list(e, kind).length > 0; }).map(function (e) {', '        return C.entries().map(function (e) {'],
    [H, 'a tab shows the other kind\'s items', '            return { v: e.v, date: e.date, items: C._list(e, kind), isNew:', "            return { v: e.v, date: e.date, items: C._list(e, kind === 'features' ? 'fixes' : 'features'), isNew:"],
    [H, 'nothing is marked new in the tabs', 'items: C._list(e, kind), isNew: !!fresh[e.v],', 'items: C._list(e, kind), isNew: false,'],
    [H, 'the list always opens on New features', "        return (!C._newCount('features') && C._newCount('fixes')) ? 'fixes' : 'features';", "        return 'features';"],
    [H, 'the tabs do not say what is new in them', "                .text(tb.label + (counts[tb.kind] ? ' (' + counts[tb.kind] + ' new)' : '')).appendTo($tabs);", '                .text(tb.label).appendTo($tabs);'],
    [H, 'clicking a tab does nothing', "        $tabs.on('click', '.jcl-tab', function () { paint($(this).attr('data-tab')); });\n", ''],
    [H, 'opening the list is not seeing it', '        paint(tab || C._startTab());\n        C.markSeen();', '        paint(tab || C._startTab());'],
    [H, 'the old part loses its divider', '                if (!older && r.old) {', '                if (false) {'],
    [H, 'the date lands a month off', "JiTA.changelog.MONTHS[parseInt(p[1], 10) - 1]", "JiTA.changelog.MONTHS[parseInt(p[1], 10)]"],
    [H, 'the day loses its leading zero', "return p[2] + ' ' + JiTA.changelog.MONTHS", "return parseInt(p[2], 10) + ' ' + JiTA.changelog.MONTHS"],
    // ---- the pill ----
    [H, 'the pill ignores whether anything is new', "        if (!C.shouldShow()) { C.remove(); return; }\n        var el = document.getElementById(C.PILL_ID);", "        var el = document.getElementById(C.PILL_ID);"],
    [H, 'mounting twice makes two pills', "        if (!el) {\n            el = document.createElement('div');\n            el.id = C.PILL_ID;", "        if (true) {\n            el = document.createElement('div');\n            el.id = C.PILL_ID;"],
    [H, 'the x only hides the pill', 'x.addEventListener(\'click\', function (e) { e.stopPropagation(); JiTA.changelog.markSeen(); });', 'x.addEventListener(\'click\', function (e) { e.stopPropagation(); JiTA.changelog.remove(); });'],
    [H, 'the x also opens the list', 'x.addEventListener(\'click\', function (e) { e.stopPropagation(); JiTA.changelog.markSeen(); });', 'x.addEventListener(\'click\', function (e) { JiTA.changelog.markSeen(); });'],
    [H, 'clicking the pill does nothing', "            el.addEventListener('click', function () { JiTA.changelog.openView(); });\n", "            el.addEventListener('click', function () {});\n"],
    [H, 'the corner is not restacked', "        if (lbl) { lbl.textContent = C.label(C.unseenFeatures()); }   // the updates that bring features, not every one\n        try { jitaStackPills(); } catch (e) { /* ignore */ }", "        if (lbl) { lbl.textContent = C.label(C.unseenFeatures()); }"],
    // ---- the pill comes back (v3.38.5) ----
    [H, 'ensure puts the pill up before the page settles', 'if (!C._armed || document.getElementById(C.PILL_ID)) { return; }', 'if (document.getElementById(C.PILL_ID)) { return; }'],
    [H, 'ensure redraws a pill that is up', 'if (!C._armed || document.getElementById(C.PILL_ID)) { return; }', 'if (!C._armed) { return; }'],
    [H, 'ensure never puts the pill back', '        if (C.shouldShow()) { C.mount(); }\n    },', '    },'],
    [H, 'start looks only once', 'START_MS: [2500, 10000, 30000],', 'START_MS: [2500],'],
    [H, 'start never listens to the other tabs', '        C.watch();\n        C.START_MS.forEach', '        C.START_MS.forEach'],
    [H, 'start never arms ensure', 'setTimeout(function () { try { C._armed = true; C.ensure(); } catch (e) { /* swallow */ } }, ms);', 'setTimeout(function () { try { C.ensure(); } catch (e) { /* swallow */ } }, ms);'],
    // ---- CHANGELOG.md itself (v3.52.2) ----
    [H, 'the newest entry is not this version', '\n## ' + ver + ' (', '\n## ' + nextVer + ' (', MD],
    [H, 'an item with an unescaped Markdown character', firstItem, firstItem + ' <b>', MD],
    [H, 'an item that starts a list of its own', firstItem, '\n- + ' + firstItem.slice(3), MD],
    [H, 'a line the script would pass over', firstItem, firstItem + '\nA loose line', MD],
    [H, 'an item too long to read at a glance', firstItem, firstItem + ' ' + 'x'.repeat(240), MD],
    [H, 'an en dash in an item', firstItem, firstItem + ' a ' + String.fromCharCode(0x2013) + ' b', MD]
];
let allRed = true;
muts.forEach(([h, name, a, b, onMd]) => {
    const text = onMd ? md : src;
    if (text.split(a).length !== 2) { console.log('ANCHOR ' + (text.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', onMd ? src : src.replace(a, () => b));
    fs.writeFileSync('mutt.md', onMd ? md.replace(a, () => b) : md);
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js', JITA_CHANGELOG: 'mutt.md' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + (onMd ? ' (CHANGELOG.md)' : '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
['mutt.js', 'mutt.md'].forEach((f) => { if (fs.existsSync(f)) { fs.unlinkSync(f); } });
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
