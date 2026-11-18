// mutate-releases.js - breaks the changelog's history in a copy of CHANGELOG.md (inside the script before v3.52.2) and
// requires ci-static, run against origin/main, to go red: an entry for a version that shipped is dropped, an entry from
// before the rename is dropped, a shipped entry is re-dated, the newest shipped entry is renamed to a new version, and
// the file is emptied. A copy left as it is must pass, or the suite would prove nothing. The versions are read from the
// file and main, so it never goes stale.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const md = fs.readFileSync(process.env.JITA_CHANGELOG || path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
const BASE = 'origin/main';
const git = (args) => execFileSync('git', args, { cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const MB = git(['merge-base', 'HEAD', BASE]).trim();   // what ci-static compares against: main as this branch knows it
const shipped = (/^\/\/ @version\s+(\S+)/m.exec(git(['show', MB + ':JiTA.user.js'])) || [])[1];
const oldest = ((md.match(/\n## [\d.]+ \(/g) || []).pop() || '').slice(4, -2);
if (!shipped || !oldest) { throw new Error('could not read the shipped version on ' + BASE + ' or the oldest entry'); }

const esc = (v) => v.replace(/\./g, '\\.');
const entryRe = (v) => new RegExp('\\n## ' + esc(v) + ' \\(\\d{4}-\\d{2}-\\d{2}\\)\\n[\\s\\S]*?(?=\\n## |\\s*$)');
const drop = (v) => (t) => { const m = entryRe(v).exec(t); if (!m) { throw new Error('no entry for ' + v); } return t.replace(m[0], ''); };
const cases = [
    ['an entry for the version on ' + BASE + ' (' + shipped + ') is dropped', drop(shipped)],
    ['the oldest entry (' + oldest + ', before the rename) is dropped', drop(oldest)],
    ['the entry for ' + shipped + ' is re-dated', (t) => t.replace(new RegExp('\\n## ' + esc(shipped) + ' \\(\\d{4}-\\d{2}-\\d{2}\\)'), '\n## ' + shipped + ' (1999-01-01)')],
    ['the entry for ' + shipped + ' is renamed to a version that never shipped', (t) => t.replace('\n## ' + shipped + ' (', '\n## ' + shipped + '.99 (')],
    ['the file is emptied', () => '# JiTA changelog\n']
];

function run(text) {
    fs.writeFileSync(path.join(__dirname, 'mutr.md'), text);
    let out = '';
    try { out = execFileSync(process.execPath, ['ci-static.js', '--base', BASE, '--only', 'changelog'], { cwd: __dirname, encoding: 'utf8', env: Object.assign({}, process.env, { JITA_CHANGELOG: 'mutr.md' }) }); }
    catch (e) { out = e.stdout || ''; }
    return out.split('\n').filter((l) => /^  FAIL  (every (version released|changelog entry)|CHANGELOG\.md carries)/.test(l));
}

let allRed = true;
try {
    // The control: an unchanged copy must pass, or a red below would prove nothing. Printed as CONTROL rather than
    // RED / GREEN, so run-breakages counts only the breakages; a failed control still fails the suite.
    const control = run(md);
    if (control.length) { allRed = false; }
    console.log('CONTROL ' + (control.length ? 'FAILED  the changelog as it is fails ci-static: ' + control[0].replace(/^  FAIL /, '') : 'ok  the changelog as it is passes ci-static'));
    cases.forEach(([name, f]) => {
        const fails = run(f(md));
        if (!fails.length) { allRed = false; }
        console.log((fails.length ? 'RED   ' : 'GREEN ') + 'releases  ' + name + '  (' + fails.length + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
    });
} finally {
    if (fs.existsSync(path.join(__dirname, 'mutr.md'))) { fs.unlinkSync(path.join(__dirname, 'mutr.md')); }
}
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
