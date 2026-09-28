// run-checks.js - runs every *-check.js in this folder against ../JiTA.user.js (or JITA_SRC, when set) and
// fails if any of them exits non-zero or prints a FAIL line. Each harness evals the real code out of the
// userscript against stubs, so a change to the code it slices shows up here.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const checks = fs.readdirSync(DIR).filter((f) => /-check\.js$/.test(f)).sort();
let bad = 0;
const t0 = Date.now();
checks.forEach((f) => {
    const t = Date.now();
    const r = spawnSync(process.execPath, [f], { cwd: DIR, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = (r.stdout || '') + (r.stderr || '');
    const lines = out.split('\n');
    const fails = lines.filter((l) => /^\s*FAIL\b/.test(l));
    const passes = lines.filter((l) => /^\s*PASS\b/.test(l)).length;
    const good = r.status === 0 && fails.length === 0;
    if (!good) { bad++; }
    console.log((good ? 'ok    ' : 'FAIL  ') + f.padEnd(24) + String(passes).padStart(4) + ' passed' +
        (fails.length ? ', ' + fails.length + ' failed' : '') + (r.status !== 0 ? ', exit ' + r.status : '') +
        '  (' + (Date.now() - t) + ' ms)');
    if (!good) {
        // The whole output for a red harness: the FAIL lines alone rarely say enough in a CI log.
        console.log(out.split('\n').map((l) => '      | ' + l).join('\n'));
    }
});
console.log('\n' + checks.length + ' test files, ' + (bad ? bad + ' red' : 'all green') + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(bad ? 1 : 0);
