// mutate-cardfoot.js - breaks each guard of the cards' footer (v3.47.0: one row of symbols, unicode text CSS colours and
// never emoji, with the date at its right, in place of the status, exception and Created lines) in turn and requires the
// harness that owns it to go red. A crashed harness counts as red. A breakage may name the part of the file it is made
// in: [harness, name, anchor, replacement, [its first line, its end]], the anchor then once there.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const CF = 'cardfoot-check.js', XB = 'excboost-check.js', TR = 'trend-check.js';
const FOOT = ['    _foot: function (r, opts) {', '\n    },'], ROW = ['    _row: function (r, target, action, opts) {', '\n    },'];
const muts = [
    // ---- the dates ----
    [CF, 'no date read as 01 Jan 1970 again', "        if (!iso) { return ''; }   // new Date(null) is the epoch: no date read as 01 Jan 1970\n", ''],
    [CF, 'the year shown in the current year', '? full.slice(0, 6) : full.slice(0, 7) + full.slice(-2);', '? full : full.slice(0, 7) + full.slice(-2);'],
    [CF, 'the year dropped before it', '? full.slice(0, 6) : full.slice(0, 7) + full.slice(-2);', '? full.slice(0, 6) : full.slice(0, 6);'],
    [CF, 'the date judged by this year whatever it is asked', 'String((now || new Date()).getFullYear())', 'String(new Date().getFullYear())'],
    // ---- the status ----
    [CF, 'a bug report judged by its old resolution', "/^EBR-/.test(r.key || '') ? U.isClosedStatus(st) : U.isResolved(st, r.resolution)", 'U.isResolved(st, r.resolution)'],
    [CF, 'a defect judged by its status alone', "/^EBR-/.test(r.key || '') ? U.isClosedStatus(st) : U.isResolved(st, r.resolution)", 'U.isClosedStatus(st)'],
    [CF, 'nothing ever in progress', "return JiTA.ui.PROGRESS_RE.test(st) ? 'prog' : 'todo';", "return 'todo';"],
    [CF, 'a resolved defect labelled by its status', '.text(cat === \'done\' && r.resolution ? r.resolution : r.status)', '.text(r.status)', FOOT],
    [CF, 'the status hover without the resolution', ".attr('title', r.status + (r.resolution ? ' · ' + r.resolution : ''))", ".attr('title', r.status)", FOOT],
    [CF, 'no status shown', '        if (r.status) {\n            var cat = U._statusCat(r);', '        if (false) {\n            var cat = U._statusCat(r);', FOOT],
    // ---- the symbols ----
    [CF, '▲ on trending rows too', '        if (!(opts && opts.score)) {\n            var hot = T.badge(r.key);', '        if (true) {\n            var hot = T.badge(r.key);', FOOT],
    [CF, 'no ▲ anywhere', '            if (hot) { hot.appendTo($f); }\n', '', FOOT],
    [CF, 'no ◷ for a defect fixed long before', '        if (r.staleNote) {   // Feature A: explain the demotion', '        if (false) {   // Feature A: explain the demotion', FOOT],
    [CF, '◷ not saying it ranks lower', " + ', so it ranks lower'", '', FOOT],
    [CF, 'no trend on a trending row', '        if (r.trend && S[r.trend]) {', '        if (false) {', FOOT],
    [CF, 'the trend not saying what is usual', "': usually about ' + T.usual(r.base) + ' per ' + T.WINDOW_DAYS + ' days'", "''", FOOT],
    [CF, 'a warning at one report after the fix', "        if (r.afterFix >= T.AFTER_FIX_MIN) {\n            U._mark('warn'", "        if (r.afterFix >= 1) {\n            U._mark('warn'", FOOT],
    [CF, 'the warning without its count', ', r.afterFix).appendTo($f);', ').appendTo($f);', FOOT],
    [CF, 'no date', "        if (when) { $('<span class=\"jita-foot-date\"></span>')", "        if (false) { $('<span class=\"jita-foot-date\"></span>')", FOOT],
    [CF, 'the date in full', '        var when = JiTA.util.shortDate(r.created);', '        var when = JiTA.util.fmtDate(r.created);', FOOT],
    [CF, 'the date without its hover', ".attr('title', 'Created ' + JiTA.util.fmtDate(r.created))", '', FOOT],
    [CF, 'a symbol without its hover', ".addClass('jita-mark-' + cls).attr('title', title).text(", ".addClass('jita-mark-' + cls).text("],
    [CF, 'the warning an emoji', "warn: '⚠\\uFE0E' },", "warn: '⚠' },"],
    [CF, 'the trending badge a flame again', '.text(JiTA.ui.SYM.hot + n)', ".text('🔥 ' + n)"],
    [CF, 'the trending switch a flame again', "JiTA.ui.SYM.hot + ' Trending defects'", "'🔥 Trending defects'"],
    [TR, 'the trend note\'s warning an emoji', "bits.push(JiTA.ui.SYM.warn + ' ' + r.afterFix + ' filed after the fix');", "bits.push('⚠ ' + r.afterFix + ' filed after the fix');"],
    [CF, 'the same stack and a looser match alike', "JiTA.ui.SYM[exact ? 'exact' : 'loose']", 'JiTA.ui.SYM.exact'],
    [XB, 'a mark\'s hover without what it is', "label.charAt(0).toUpperCase() + label.slice(1) + '\\n' + 'The bug report", "'The bug report"],
    [CF, 'the footer binds a handler', "$f = $('<div class=\"jita-foot\"></div>');", "$f = $('<div class=\"jita-foot\"></div>').on('click', function () {});", FOOT],
    // ---- the card ----
    [CF, 'the meta line back on the card', '        JiTA.ui._foot(r, opts).appendTo($li);', "        $('<div class=\"jita-sd-meta\"></div>').text(meta).appendTo($li);\n        JiTA.ui._foot(r, opts).appendTo($li);", ROW],
    [CF, 'no footer on the card', '        JiTA.ui._foot(r, opts).appendTo($li);\n', '', ROW],
    [CF, 'the hover preview without the meta line', "$li.on('mouseenter', function () { JiTA.ui._showTip(r, this, meta); });", "$li.on('mouseenter', function () { JiTA.ui._showTip(r, this, ''); });", ROW],
    [CF, 'the meta line without the stale note', 'var bits = [r.status, r.resolution, r.staleNote, r.note]', 'var bits = [r.status, r.resolution, r.note]'],
    [CF, 'the meta line with the date always', "var when = withDate ? JiTA.util.fmtDate(r.created) : '';", 'var when = JiTA.util.fmtDate(r.created);'],
    [CF, 'the key off the top line', ".attr('target', target).text(r.key).appendTo($top);", ".attr('target', target).text(r.key).appendTo($li);", ROW],
    [CF, 'a % on reporter rows', "        else if (!(opts && opts.noScore)) { $('<span class=\"jita-sd-score\"></span>')", "        else { $('<span class=\"jita-sd-score\"></span>')", ROW],
    // ---- the stylesheets ----
    [CF, 'the card no flex column', 'word-break: break-word; display: flex; flex-direction: column; }\\', 'word-break: break-word; }\\'],
    [CF, 'the footer not at the bottom', 'gap: 7px; margin-top: auto; padding-top: 4px;', 'gap: 7px; padding-top: 4px;'],
    [CF, 'the date not at the right', '.jita-foot-date { flex: 0 0 auto; margin-left: auto;', '.jita-foot-date { flex: 0 0 auto;'],
    [CF, 'the top line loses its floats', '.jita-sd-top { display: flow-root; }\\', '.jita-sd-top { }\\'],
    [CF, 'an empty footer shown', '\n.jita-foot:empty { display: none; }\\', ''],
    [CF, 'the sidebar keeps its strip', '#jita-side-group #jita-sd-list li { padding: 7px 0; border-bottom:', '#jita-side-group #jita-sd-list li { position: relative; padding: 7px 0 22px; border-bottom:'],
    [CF, 'the sidebar\'s warning symbols in no theme colour', '\n#jita-side-group .jita-mark-up, #jita-side-group .jita-mark-new, #jita-side-group .jita-mark-warn { color: var(--ds-icon-warning, #e56910); }\\', ''],
    [CF, 'a checking Attach link blue again', '\n#jita-side-group .jita-sd-link.jita-sd-linking { color: var(--ds-text-subtlest, #626f86); cursor: default; text-decoration: none; }\\', ''],
    [CF, 'triage cards no flex column', "background: #22272b; display: flex; flex-direction: column; }' +", "background: #22272b; }' +"],
    [CF, 'triage numbers off the top line', "$('<span class=\"jt-n\"></span>').text(n).appendTo($top);", "$('<span class=\"jt-n\"></span>').text(n).appendTo($li);"],
    [CF, 'triage\'s reporter view without its dates', "var meta = JiTA.ui._meta(r, view === 'reporter');", 'var meta = JiTA.ui._meta(r, false);']
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
    fs.writeFileSync('mutcf.js', src.slice(0, at[0]) + part.replace(a, () => b) + src.slice(at[1]));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutcf.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutcf.js')) { fs.unlinkSync('mutcf.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
