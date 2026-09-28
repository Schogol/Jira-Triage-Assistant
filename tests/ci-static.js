// ci-static.js - the checks that need no harness: every script parses, git stores every text file with LF
// endings, nothing contains an em dash, and a pull request that changes JiTA.user.js raises its @version.
//
//   node tests/ci-static.js                      everything except the version check
//   node tests/ci-static.js --base origin/main   plus the version check against that ref
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

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'static checks passed.'));
process.exit(fail ? 1 : 0);
