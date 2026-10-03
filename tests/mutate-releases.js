// mutate-releases.js - breaks the changelog's history in a copy of the script and requires ci-static, run against
// origin/main, to go red: an entry for a version that shipped is dropped, an entry from before the rename is dropped,
// a shipped entry is re-dated, and the newest shipped entry is renamed to a new version. A copy left as it is must
// pass, or the suite would prove nothing. The versions are read from the script and main, so it never goes stale.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const BASE = 'origin/main';
const git = (args) => execFileSync('git', args, { cwd: __dirname, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const MB = git(['merge-base', 'HEAD', BASE]).trim();   // what ci-static compares against: main as this branch knows it
const shipped = (/^\/\/ @version\s+(\S+)/m.exec(git(['show', MB + ':JiTA.user.js'])) || [])[1];
const es = src.indexOf('\n    ENTRIES: ['), ee = src.indexOf('\n    ],', es);   // entries close with 8 spaces, the list with 4
const oldest = (src.slice(es, ee).match(/\{ v: '[\d.]+'/g) || []).map((s) => s.slice(6, -1)).pop();
if (!shipped || !oldest) { throw new Error('could not read the shipped version on ' + BASE + ' or the oldest entry'); }

const entryRe = (v) => new RegExp("\\n        \\{ v: '" + v.replace(/\./g, '\\.') + "', date: '[\\d-]+', (?:features|fixes|items): \\[[\\s\\S]*?\\n        \\] \\},?");
const drop = (v) => (t) => { const m = entryRe(v).exec(t); if (!m) { throw new Error('no entry for ' + v); } return t.replace(m[0], ''); };
const cases = [
    ['an entry for the version on ' + BASE + ' (' + shipped + ') is dropped', drop(shipped)],
    ['the oldest entry (' + oldest + ', before the rename) is dropped', (t) => {
        const m = entryRe(oldest).exec(t);
        if (!m) { throw new Error('no entry for ' + oldest); }
        return t.replace(m[0], '').replace(/\] \},\n    \],/, '] }\n    ],');   // the new last entry loses its comma
    }],
    ['the entry for ' + shipped + ' is re-dated', (t) => t.replace(new RegExp("(\\{ v: '" + shipped.replace(/\./g, '\\.') + "', date: ')[\\d-]+'"), '$11999-01-01\'')],
    ['the entry for ' + shipped + ' is renamed to a version that never shipped', (t) => t.replace("{ v: '" + shipped + "', date:", "{ v: '" + shipped + ".99', date:")]
];

function run(text) {
    fs.writeFileSync(path.join(__dirname, 'mutr.js'), text);
    let out = '';
    try { out = execFileSync(process.execPath, ['ci-static.js', '--base', BASE], { cwd: __dirname, encoding: 'utf8', env: Object.assign({}, process.env, { JITA_SRC: 'mutr.js' }) }); }
    catch (e) { out = e.stdout || ''; }
    return out.split('\n').filter((l) => /^  FAIL  every (version released|changelog entry)/.test(l));
}

let allRed = true;
try {
    // The control: an unchanged copy must pass, or a red below would prove nothing. Printed as CONTROL rather than
    // RED / GREEN, so run-breakages counts only the breakages; a failed control still fails the suite.
    const control = run(src);
    if (control.length) { allRed = false; }
    console.log('CONTROL ' + (control.length ? 'FAILED  the script as it is fails ci-static: ' + control[0].replace(/^  FAIL /, '') : 'ok  the script as it is passes ci-static'));
    cases.forEach(([name, f]) => {
        const fails = run(f(src));
        if (!fails.length) { allRed = false; }
        console.log((fails.length ? 'RED   ' : 'GREEN ') + 'releases  ' + name + '  (' + fails.length + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
    });
} finally {
    if (fs.existsSync(path.join(__dirname, 'mutr.js'))) { fs.unlinkSync(path.join(__dirname, 'mutr.js')); }
}
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
