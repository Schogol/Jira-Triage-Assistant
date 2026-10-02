// ci-static.js - the checks that need no harness: every script parses, git stores every text file with LF
// endings, nothing contains an em dash, a pull request that changes JiTA.user.js raises its @version, and the
// changelog keeps every release: each version main has carried has an entry, and no entry already out is
// dropped or re-dated.
//
//   node tests/ci-static.js                      everything except the checks against a base
//   node tests/ci-static.js --base origin/main   plus the version check and the changelog against that ref
//
// Run it from anywhere inside the repo. It reads the committed state through git, so stage new files first.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const argBase = process.argv.indexOf('--base');
const BASE = argBase > 0 ? process.argv[argBase + 1] : null;

let fail = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond || !detail ? '' : '\n          ' + detail));
    if (!cond) { fail++; }
};

// ---- every script parses ----
const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
files.filter((f) => /\.js$/.test(f)).forEach((f) => {
    try {
        execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
        ok('parses: ' + f, true);
    } catch (e) {
        ok('parses: ' + f, false, String(e.stderr || e.message).trim().split('\n').slice(0, 4).join('\n          '));
    }
});

// ---- git stores LF ----
// The Windows working copy is CRLF (core.autocrlf), which is fine: what matters is what is committed. A file
// committed with CRLF or mixed endings shows up here as i/crlf or i/mixed. Binary files (i/-text) are skipped.
const eol = git(['ls-files', '--eol', '-z']).split('\0').filter(Boolean).map((l) => {
    const m = /^i\/(\S*)\s+w\/\S*\s+attr\/.*?\t(.*)$/.exec(l);
    return m ? { index: m[1], file: m[2] } : null;
}).filter(Boolean);
const badEol = eol.filter((e) => e.index !== 'lf' && e.index !== 'none' && e.index !== '-text');
ok('every text file is committed with LF endings (' + eol.length + ' files)', badEol.length === 0,
    badEol.map((e) => e.file + ' is stored as ' + e.index).join('\n          '));

// ---- no em dashes ----
const EM = String.fromCharCode(0x2014);
const dashed = [];
eol.filter((e) => e.index !== '-text').forEach((e) => {
    const lines = fs.readFileSync(path.join(ROOT, e.file), 'utf8').split('\n');
    lines.forEach((l, i) => { if (l.indexOf(EM) >= 0) { dashed.push(e.file + ':' + (i + 1) + '  ' + l.trim().slice(0, 100)); } });
});
ok('no em dashes in any tracked file', dashed.length === 0, dashed.slice(0, 20).join('\n          ') +
    (dashed.length > 20 ? '\n          ...and ' + (dashed.length - 20) + ' more' : ''));

// ---- the version moves forward ----
// Tampermonkey only offers an update when @version is higher than the installed one, so a change that ships
// without a bump never reaches anyone.
function version(text) {
    const m = /^\/\/ @version\s+(\d+)\.(\d+)\.(\d+)\s*$/m.exec(text || '');
    return m ? [+m[1], +m[2], +m[3]] : null;
}
const head = version(fs.readFileSync(path.join(ROOT, 'JiTA.user.js'), 'utf8'));
ok('JiTA.user.js has a major.feature.patch @version', !!head);
if (BASE) {
    const changed = git(['diff', '--name-only', BASE + '...HEAD', '--', 'JiTA.user.js']).trim() !== '';
    if (!changed) {
        console.log('  ----  JiTA.user.js unchanged against ' + BASE + ', no version bump needed');
    } else {
        let baseText = '';
        try { baseText = git(['show', BASE + ':JiTA.user.js']); } catch (e) { /* new file */ }
        const base = version(baseText);
        const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
        ok('JiTA.user.js changed, so @version goes up (' + (base ? base.join('.') : 'none') + ' -> ' + (head ? head.join('.') : 'none') + ')',
            !!head && (!base || cmp(head, base) > 0),
            'bump the last digit for a fix, the middle one for a feature, the first for a major rework');
    }
}

// ---- the changelog keeps every release ----
// changelog-check pins the newest entry to @version, so no version ships without one. These guard the rest of the
// list. Every version main has ever carried must still be listed: @updateURL points at main, so each one reached
// someone. And an entry that is already out must not be dropped or re-dated by a later change (its wording may
// be corrected); that also covers the versions before the 2.35.0 rename, which predate this file's history.
const CL_END = '\n    _noop: null\n};';
function changelog(text) {
    const s = String(text || '').replace(/\r\n/g, '\n'), cs = s.indexOf('\nJiTA.changelog = {'), ce = s.indexOf(CL_END, cs);
    if (cs < 0 || ce < 0) { return null; }
    const J = {};
    try { new Function('JiTA', s.slice(cs, ce + CL_END.length))(J); } catch (e) { return null; }
    return (J.changelog && Array.isArray(J.changelog.ENTRIES)) ? J.changelog.ENTRIES : null;
}
// JITA_SRC names another copy whose changelog to check instead, as the harnesses take it (mutate-releases.js).
const entries = changelog(fs.readFileSync(process.env.JITA_SRC || path.join(ROOT, 'JiTA.user.js'), 'utf8'));
ok('JiTA.user.js carries its changelog', !!entries);
if (entries) {
    const listed = {};
    entries.forEach((e) => { listed[e.v] = e; });
    // Released = every @version on main's first-parent history, up to where this branch forked from it (the
    // merge-base): a branch that forked before main's latest release is not asked for that entry yet, and the pull
    // request's own check runs on its merge with main, where the merge-base is main itself. A pull request's own
    // intermediate bumps never shipped, so they need no entry.
    const REL = BASE ? git(['merge-base', 'HEAD', BASE]).trim() : 'HEAD', released = [];
    git(['log', '--first-parent', REL, '-p', '-G^// @version', '--format=', '--', 'JiTA.user.js']).split('\n').forEach((l) => {
        const m = /^\+\/\/ @version\s+(\S+)\s*$/.exec(l);
        if (m && released.indexOf(m[1]) < 0) { released.push(m[1]); }
    });
    const unlisted = released.filter((v) => !listed[v]);
    ok('every version released on ' + (BASE || 'this branch') + ' has a changelog entry (' + released.length + ', back to ' + (released[released.length - 1] || 'none') + ')',
        released.length > 0 && unlisted.length === 0,
        'no entry for: ' + unlisted.join(', ') + ' - each of these was on main, so its users got it: put its entry back');
    if (BASE) {
        let baseEntries = null;
        try { baseEntries = changelog(git(['show', REL + ':JiTA.user.js'])); } catch (e) { /* no script on the base */ }
        if (baseEntries) {
            const lost = baseEntries.filter((e) => !listed[e.v]).map((e) => e.v);
            const redated = baseEntries.filter((e) => listed[e.v] && listed[e.v].date !== e.date)
                .map((e) => e.v + ' ' + e.date + ' -> ' + listed[e.v].date);
            ok('every changelog entry on ' + BASE + ' is still there, with its date (' + baseEntries.length + ' entries)',
                lost.length === 0 && redated.length === 0,
                [lost.length ? 'removed: ' + lost.join(', ') : '', redated.length ? 're-dated: ' + redated.join(', ') : ''].filter(Boolean).join('; '));
        }
    }
}

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'static checks passed.'));
process.exit(fail ? 1 : 0);
