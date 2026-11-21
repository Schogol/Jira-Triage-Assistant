// ci-static.js - the checks that need no harness: every script parses, git stores every text file with LF
// endings, nothing contains an em dash, the page code declares nothing with let / const, JiTA.user.js passes the lint
// rules, a pull request that changes JiTA.user.js raises its @version, and the changelog keeps every release: each
// version main has carried has an entry, and no entry already out is dropped or re-dated.
//
//   node tests/ci-static.js                      everything except the checks against a base
//   node tests/ci-static.js --base origin/main   plus the version check and the changelog against that ref
//   node tests/ci-static.js --only es5,changelog only those checks (parse, eol, dash, es5, lint, version, changelog)
//
// Run it from anywhere inside the repo. It reads the committed state through git, so stage new files first.
// --only is for the breakage suites, which test one rule each: the parse check alone starts node once per script.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const argBase = process.argv.indexOf('--base');
const BASE = argBase > 0 ? process.argv[argBase + 1] : null;
const argOnly = process.argv.indexOf('--only');
const ONLY = argOnly > 0 ? String(process.argv[argOnly + 1] || '').split(',') : null;
const CHECKS = ['parse', 'eol', 'dash', 'es5', 'lint', 'version', 'changelog'];
if (ONLY && (!ONLY.length || ONLY.some((k) => CHECKS.indexOf(k) < 0))) {
    console.log('--only takes a comma-separated list of: ' + CHECKS.join(', '));
    process.exit(2);
}
const want = (k) => !ONLY || ONLY.indexOf(k) >= 0;

let fail = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond || !detail ? '' : '\n          ' + detail));
    if (!cond) { fail++; }
};

// ---- every script parses ----
if (want('parse')) {
    git(['ls-files', '-z']).split('\0').filter((f) => /\.js$/.test(f)).forEach((f) => {
        try {
            execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
            ok('parses: ' + f, true);
        } catch (e) {
            ok('parses: ' + f, false, String(e.stderr || e.message).trim().split('\n').slice(0, 4).join('\n          '));
        }
    });
}

// ---- git stores LF ----
// The Windows working copy is CRLF (core.autocrlf), which is fine: what matters is what is committed. A file
// committed with CRLF or mixed endings shows up here as i/crlf or i/mixed. Binary files (i/-text) are skipped.
const eol = !(want('eol') || want('dash')) ? [] : git(['ls-files', '--eol', '-z']).split('\0').filter(Boolean).map((l) => {
    const m = /^i\/(\S*)\s+w\/\S*\s+attr\/.*?\t(.*)$/.exec(l);
    return m ? { index: m[1], file: m[2] } : null;
}).filter(Boolean);
if (want('eol')) {
    const badEol = eol.filter((e) => e.index !== 'lf' && e.index !== 'none' && e.index !== '-text');
    ok('every text file is committed with LF endings (' + eol.length + ' files)', badEol.length === 0,
        badEol.map((e) => e.file + ' is stored as ' + e.index).join('\n          '));
    // Unicode's line and paragraph separators: editors take them for line breaks (VS Code asks to remove them each time
    // the file is opened), so a string needing one writes String.fromCharCode(0x2028) / (0x2029) instead.
    const SEPS = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)], separated = [];
    eol.filter((e) => e.index !== '-text').forEach((e) => {
        fs.readFileSync(path.join(ROOT, e.file), 'utf8').split('\n').forEach((l, i) => {
            if (SEPS.some((s) => l.indexOf(s) >= 0)) { separated.push(e.file + ':' + (i + 1)); }
        });
    });
    ok('no Unicode line or paragraph separator (U+2028, U+2029) in any tracked file', separated.length === 0, separated.slice(0, 20).join('\n          '));
}

// ---- no em dashes ----
if (want('dash')) {
    const EM = String.fromCharCode(0x2014);
    const dashed = [];
    eol.filter((e) => e.index !== '-text').forEach((e) => {
        const lines = fs.readFileSync(path.join(ROOT, e.file), 'utf8').split('\n');
        lines.forEach((l, i) => { if (l.indexOf(EM) >= 0) { dashed.push(e.file + ':' + (i + 1) + '  ' + l.trim().slice(0, 100)); } });
    });
    ok('no em dashes in any tracked file', dashed.length === 0, dashed.slice(0, 20).join('\n          ') +
        (dashed.length > 20 ? '\n          ...and ' + (dashed.length - 20) + ' more' : ''));
}

// ---- the page code is ES5 ----
// JiTA.user.js is written as plain ES5 (var + function) throughout. The one exception is jitaWorkerBody: it is
// serialized into a module worker and may use what the worker supports (async, let, const). A declaration with
// let / const at the start of a statement, or in a for head, anywhere else fails. JITA_SRC names another copy to
// check, as the harnesses take it (mutate-es5.js).
function es5Breaks(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n'), out = [];
    const ws = lines.findIndex((l) => /^function jitaWorkerBody\(/.test(l));
    let we = ws;
    while (ws >= 0 && we < lines.length && lines[we] !== '}') { we++; }
    lines.forEach((l, i) => {
        if (ws >= 0 && i >= ws && i <= we) { return; }
        if (/^\s*(let|const)\s+[A-Za-z_$]/.test(l) || /\bfor\s*\(\s*(let|const)\s/.test(l)) {
            out.push('JiTA.user.js:' + (i + 1) + '  ' + l.trim().slice(0, 100));
        }
    });
    return out;
}
if (want('es5')) {
    const es5 = es5Breaks(fs.readFileSync(process.env.JITA_SRC || path.join(ROOT, 'JiTA.user.js'), 'utf8'));
    ok('the page code declares with var, not let / const (jitaWorkerBody excepted)', es5.length === 0,
        es5.slice(0, 20).join('\n          '));
}

// ---- the lint rules ----
// ESLint with tests/eslint.config.js: rules that find bugs only (a name defined nowhere or never used, a key or case
// written twice, code that can never run). It comes through npx, at this exact version, so the test files still need
// nothing installed. Without npx or the network it skips, unless JITA_LINT_REQUIRED=1, which CI sets. JITA_SRC names
// another copy to lint (mutate-lint.js).
const ESLINT = 'eslint@10.14.0';
function lint(file) {
    const args = ['--yes', ESLINT, '--config', path.join(ROOT, 'tests', 'eslint.config.js'), '--format', 'json', '--no-warn-ignored', file];
    const win = process.platform === 'win32';   // npx is npx.cmd there, which only a shell runs
    const r = require('child_process').spawnSync(win ? 'npx.cmd' : 'npx', win ? args.map((a) => '"' + a + '"') : args,
        { cwd: ROOT, encoding: 'utf8', shell: win, maxBuffer: 64 * 1024 * 1024 });
    let res = null;
    try { res = JSON.parse(r.stdout)[0]; } catch (e) { /* no report: npx or ESLint could not run */ }
    return res ? { messages: res.messages } : { error: String(r.error || r.stderr || 'no output').trim().split('\n').slice(-3).join(' / ') };
}
if (want('lint')) {
    const file = path.resolve(process.env.JITA_SRC || path.join(ROOT, 'JiTA.user.js'));
    const r = lint(file);
    if (r.error) {
        if (process.env.JITA_LINT_REQUIRED === '1') { ok('JiTA.user.js passes the lint rules (' + ESLINT + ')', false, 'ESLint did not run: ' + r.error); }
        else { console.log('  SKIP  the lint rules: ESLint did not run (' + r.error.slice(0, 120) + ')'); }
    } else {
        ok('JiTA.user.js passes the lint rules (' + ESLINT + ', tests/eslint.config.js)', r.messages.length === 0,
            r.messages.slice(0, 20).map((m) => 'JiTA.user.js:' + m.line + ':' + m.column + '  ' + (m.ruleId || 'parse') + '  ' + m.message).join('\n          ') +
            (r.messages.length > 20 ? '\n          ...and ' + (r.messages.length - 20) + ' more' : ''));
    }
}

// ---- the version moves forward ----
// Tampermonkey only offers an update when @version is higher than the installed one, so a change that ships
// without a bump never reaches anyone.
function version(text) {
    const m = /^\/\/ @version\s+(\d+)\.(\d+)\.(\d+)\s*$/m.exec(text || '');
    return m ? [+m[1], +m[2], +m[3]] : null;
}
const head = version(fs.readFileSync(path.join(ROOT, 'JiTA.user.js'), 'utf8'));
if (want('version')) { ok('JiTA.user.js has a major.feature.patch @version', !!head); }
if (want('version') && BASE) {
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
// changelog-check pins CHANGELOG.md's newest entry to @version, so no version ships without one. These guard the rest of the
// list. Every version main has ever carried must still be listed: @updateURL points at main, so each one reached
// someone. And an entry that is already out must not be dropped or re-dated by a later change (its wording may
// be corrected); that also covers the versions before the 2.35.0 rename, which predate this file's history.
// Since v3.52.2 the changelog is CHANGELOG.md, read here with the script's own parser (JiTA.changelog.parse), so what
// these rules see is what JiTA shows. Before that it was JiTA.changelog.ENTRIES inside the script, which is how a base
// from before the move still carries it.
const CL_END = '\n    _noop: null\n};';
function changelogModule(text) {
    const s = String(text || '').replace(/\r\n/g, '\n'), cs = s.indexOf('\nJiTA.changelog = {'), ce = s.indexOf(CL_END, cs);
    if (cs < 0 || ce < 0) { return null; }
    const J = {};
    try { new Function('JiTA', s.slice(cs, ce + CL_END.length))(J); } catch (e) { return null; }
    return J.changelog || null;
}
const quiet = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }); } catch (e) { return null; } };
// JITA_SRC and JITA_CHANGELOG name other copies to check instead, as the harnesses take them (mutate-releases.js).
const CL = want('changelog') ? changelogModule(fs.readFileSync(process.env.JITA_SRC || path.join(ROOT, 'JiTA.user.js'), 'utf8')) : null;
const fromFile = (md) => {
    if (!CL || typeof CL.parse !== 'function' || md == null) { return null; }
    const got = CL.parse(md).entries;
    return got.length ? got : null;
};
// A ref's changelog: its CHANGELOG.md, or, from before the move, the list inside its script.
function changelogAt(ref) {
    const md = quiet(['show', ref + ':CHANGELOG.md']);
    if (md != null) { return fromFile(md); }
    const m = changelogModule(quiet(['show', ref + ':JiTA.user.js']));
    return (m && Array.isArray(m.ENTRIES)) ? m.ENTRIES : null;
}
const clPath = process.env.JITA_CHANGELOG || path.join(ROOT, 'CHANGELOG.md');
const entries = want('changelog') ? fromFile(fs.existsSync(clPath) ? fs.readFileSync(clPath, 'utf8') : null) : null;
if (want('changelog')) { ok('CHANGELOG.md carries the changelog, as JiTA.user.js reads it', !!entries); }
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
        const baseEntries = changelogAt(REL);
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
