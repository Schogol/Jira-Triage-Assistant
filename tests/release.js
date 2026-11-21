// release.js - a release's version and changelog changes in one go. It raises @version in JiTA.user.js, gives every
// @resource line (CHANGELOG.md, settings-window.json) the same ?v=, and puts the new entry at the top of CHANGELOG.md,
// each item escaped the way GitHub needs it. changelog-check.js and ci-static.js check the result as they would a
// hand-made one.
//
//   node tests/release.js patch --fix "What no longer goes wrong."
//   node tests/release.js minor --feature "What a user can now do." --fix "What no longer goes wrong."
//   node tests/release.js 3.60.0 --feature "..." --date 2026-12-01
//   node tests/release.js --current      prints the version JiTA.user.js carries (the tag workflow reads it)
//
// patch raises the last digit, minor the middle one, major the first; a version can also be given as it is. A release
// with a new feature raises the middle digit at least. Each --feature / --fix is one item, written as JiTA shows it
// (no backslashes: this adds them). The date is today's unless --date gives one. --dry prints what it would do and
// writes nothing. JITA_SRC and JITA_CHANGELOG name other copies of the two files. releasetool-check.js runs release()
// in its own process, which is why a refusal throws rather than exits.
'use strict';
const fs = require('fs'), path = require('path');
const MAX = 240;                                      // the longest item changelog-check allows
const ACTIVE = '\\`*_[]<>#~|&';                       // what Markdown would act on inside an item
const DASHES = String.fromCharCode(0x2013, 0x2014);   // en and em dash, which no text of JiTA's carries
const VERSION_RE = /^(\/\/ @version[ \t]+)(\d+)\.(\d+)\.(\d+)[ \t]*$/m;
const RESOURCE_RE = /^(\/\/ @resource[ \t]+changelog[ \t]+\S+\?v=)(\S+)[ \t]*$/m;
const RESOURCES_RE = /^(\/\/ @resource[ \t]+\S+[ \t]+\S+\?v=)(\S+)[ \t]*$/gm;   // every file Tampermonkey fetches with the script
const HEADING_RE = /^## (\d+(?:\.\d+)+) \((\d{4}-\d{2}-\d{2})\)\r?$/m;

function stop(msg) { const e = new Error(msg); e.refused = true; throw e; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
function realDate(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    if (!m) { return false; }
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
}

// An item as CHANGELOG.md holds it: a backslash before each character Markdown would act on, and before a list marker
// the item starts with, so GitHub shows it as JiTA does (JiTA.changelog.parse takes them off again).
function escape(item) {
    let out = '';
    for (const ch of item) { out += (ACTIVE.indexOf(ch) >= 0 ? '\\' : '') + ch; }
    return out.replace(/^[-+]/, (m) => '\\' + m).replace(/^(\d+)([.)])/, (m, n, mark) => n + '\\' + mark);
}

// Runs the tool on files.src (the script) and files.md (the changelog). Returns the lines it has to say; a refusal
// throws an error marked refused, before either file is written.
function release(argv, files) {
    const SRC = files.src, MD = files.md, said = [];

    // ---- the arguments ----
    let bump = null, date = null, dry = false, current = false;
    const features = [], fixes = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--feature' || a === '--fix') {
            if (i + 1 >= argv.length) { stop(a + ' needs the text of the item after it'); }
            (a === '--feature' ? features : fixes).push(argv[++i]);
        } else if (a === '--date') {
            if (i + 1 >= argv.length) { stop('--date needs a YYYY-MM-DD date after it'); }
            date = argv[++i];
        } else if (a === '--dry') {
            dry = true;
        } else if (a === '--current') {
            current = true;
        } else if (bump === null && !/^-/.test(a)) {
            bump = a;
        } else {
            stop('unknown argument: ' + a);
        }
    }

    const src = fs.readFileSync(SRC, 'utf8');
    const hv = VERSION_RE.exec(src);
    if (!hv) { stop(path.basename(SRC) + ' has no major.feature.patch @version line'); }
    const cur = [+hv[2], +hv[3], +hv[4]];
    if (current) { return [cur.join('.')]; }

    // ---- the new version ----
    let next = null;
    if (bump === 'patch') { next = [cur[0], cur[1], cur[2] + 1]; }
    else if (bump === 'minor') { next = [cur[0], cur[1] + 1, 0]; }
    else if (bump === 'major') { next = [cur[0] + 1, 0, 0]; }
    else if (/^\d+\.\d+\.\d+$/.test(bump || '')) { next = bump.split('.').map(Number); }
    else { stop('say how the version goes up: patch, minor, major or a version such as 3.60.0' + (bump ? ' (not ' + bump + ')' : '')); }
    if (cmp(next, cur) <= 0) { stop('the new version has to be above ' + cur.join('.') + ', not ' + next.join('.')); }
    if (features.length && next[0] === cur[0] && next[1] === cur[1]) {
        stop('a release with a new feature raises the middle digit at least (minor), so not ' + next.join('.'));
    }
    const v = next.join('.');

    // ---- the items and the date ----
    if (!features.length && !fixes.length) { stop('a release needs at least one --feature or --fix item'); }
    features.concat(fixes).forEach((t) => {
        const show = JSON.stringify(t.slice(0, 60));
        if (!t.trim()) { stop('an item is empty'); }
        if (/[\r\n]/.test(t)) { stop('an item is one line: ' + show); }
        if (t !== t.trim()) { stop('an item starts or ends with a space: ' + show); }
        if (t.split('').some((ch) => DASHES.indexOf(ch) >= 0)) { stop('use a hyphen, not an en or em dash: ' + show); }
        if (t.length > MAX) { stop('an item is at most ' + MAX + ' characters, this one is ' + t.length + ': ' + show); }
    });
    if (date === null) { const d = new Date(); date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    if (!realDate(date)) { stop('the date has to be a real YYYY-MM-DD date, not ' + date); }

    // ---- CHANGELOG.md ----
    const md = fs.readFileSync(MD, 'utf8');
    const top = HEADING_RE.exec(md);
    if (!top) { stop(path.basename(MD) + ' has no version heading to put the new entry above'); }
    if (top[1] !== cur.join('.')) { stop(path.basename(MD) + ' starts at ' + top[1] + ' while ' + path.basename(SRC) + ' is at ' + cur.join('.') + ': make them agree first'); }
    if (date < top[2]) { stop('the date ' + date + ' is before the newest entry\'s (' + top[2] + ')'); }
    const eol = md.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    const lines = ['## ' + v + ' (' + date + ')', ''];
    if (features.length) { lines.push('### New features', ''); features.forEach((t) => lines.push('- ' + escape(t))); lines.push(''); }
    if (fixes.length) { lines.push('### Fixed issues', ''); fixes.forEach((t) => lines.push('- ' + escape(t))); lines.push(''); }
    const entry = lines.join(eol) + eol;
    const mdOut = md.slice(0, top.index) + entry + md.slice(top.index);

    // ---- JiTA.user.js: @version and every @resource's ?v= (a resource left at the old ?v= stays the old copy) ----
    if (!RESOURCE_RE.test(src)) { stop(path.basename(SRC) + ' has no "// @resource changelog ...?v=" line'); }
    const srcOut = src.replace(VERSION_RE, (m, head) => head + v).replace(RESOURCES_RE, (m, head) => head + v);

    const what = [features.length && features.length + ' feature' + (features.length > 1 ? 's' : ''),
        fixes.length && fixes.length + ' fix' + (fixes.length > 1 ? 'es' : '')].filter(Boolean).join(' and ');
    if (dry) {
        said.push(entry.replace(/\r\n/g, '\n'));
        said.push('--dry: would raise ' + cur.join('.') + ' to ' + v + ' and add this entry (' + what + '); nothing written.');
        return said;
    }
    fs.writeFileSync(SRC, srcOut);
    fs.writeFileSync(MD, mdOut);
    said.push(path.basename(SRC) + ': @version ' + cur.join('.') + ' -> ' + v + ', and every @resource asks for ?v=' + v);
    said.push(path.basename(MD) + ': ## ' + v + ' (' + date + ') at the top, ' + what);
    return said;
}

module.exports = { release: release, escape: escape };

if (require.main === module) {
    let said;
    try {
        said = release(process.argv.slice(2), {
            src: process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'),
            md: process.env.JITA_CHANGELOG || path.join(__dirname, '..', 'CHANGELOG.md')
        });
    } catch (e) {
        if (!e.refused) { throw e; }
        console.error('release.js: ' + e.message);
        process.exit(1);
    }
    said.forEach((l) => console.log(l));
}
