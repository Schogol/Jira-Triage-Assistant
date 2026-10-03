// mutate-changelog.js - breaks each guard of the changelog and its "What's new" pill (v3.38.0) and requires
// changelog-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'changelog-check.js';
const ver = (/^\/\/ @version\s+(\S+)/m.exec(src) || [])[1] || '';
const muts = [
    // ---- the data has to match the release ----
    [H, 'a release without an entry', '// @version     ' + ver + '\n', '// @version     ' + ver.replace(/(\d+)$/, (d) => String(+d + 1)) + '\n'],
    // ---- what counts as new ----
    [H, 'first sight shows the whole history as new', 'if (!seen) { return C.ENTRIES.slice(0, 1); }', 'if (!seen) { return C.ENTRIES.slice(); }'],
    [H, 'the seen version still counts as new', 'return C.ENTRIES.filter(function (e) { return JiTA.worker._verCmp(e.v, seen) > 0; });', 'return C.ENTRIES.filter(function (e) { return JiTA.worker._verCmp(e.v, seen) >= 0; });'],
    [H, 'seeing it is never remembered', 'gmSet(C.SEEN_KEY, C.latest().v);\n        C.remove();', 'C.remove();'],
    [H, 'the oldest version is remembered as seen', 'gmSet(C.SEEN_KEY, C.latest().v);', 'gmSet(C.SEEN_KEY, C.ENTRIES[C.ENTRIES.length - 1].v);'],
    [H, 'the pill never counts', 'if (fresh.length === 1) {', 'if (fresh.length >= 1) {'],
    [H, 'shows inside the Zendesk frame', 'return !JITA_IS_FORGE_FRAME && JiTA.changelog.unseenFeatures().length > 0;', 'return JiTA.changelog.unseenFeatures().length > 0;'],
    [H, 'shows with nothing new', 'return !JITA_IS_FORGE_FRAME && JiTA.changelog.unseenFeatures().length > 0;', 'return !JITA_IS_FORGE_FRAME;'],
    // ---- only features bring the pill (v3.39.0) ----
    [H, 'a fix-only update brings the pill', 'return !JITA_IS_FORGE_FRAME && JiTA.changelog.unseenFeatures().length > 0;', 'return !JITA_IS_FORGE_FRAME && JiTA.changelog.unseen().length > 0;'],
    [H, 'the pill counts the fix-only updates too', '        if (lbl) { lbl.textContent = C.label(C.unseenFeatures()); }', '        if (lbl) { lbl.textContent = C.label(C.unseen()); }'],
    [H, 'any entry counts as a feature', "    hasFeatures: function (e) { return JiTA.changelog._list(e, 'features').length > 0; },", '    hasFeatures: function (e) { return !!e; },'],
    // ---- the two tabs ----
    [H, 'a tab lists every version', '        return C.ENTRIES.filter(function (e) { return C._list(e, kind).length > 0; }).map(function (e) {', '        return C.ENTRIES.map(function (e) {'],
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
    [H, 'start never arms ensure', 'setTimeout(function () { try { C._armed = true; C.ensure(); } catch (e) { /* swallow */ } }, ms);', 'setTimeout(function () { try { C.ensure(); } catch (e) { /* swallow */ } }, ms);']
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
if (fs.existsSync('mutt.js')) { fs.unlinkSync('mutt.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
