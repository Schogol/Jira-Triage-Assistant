// run-checks.js - runs every *-check.js in this folder against ../JiTA.user.js (or JITA_SRC, when set) and
// fails if any of them exits non-zero or prints a FAIL line. Each harness evals the real code out of the
// userscript against stubs, so a change to the code it slices shows up here.
//
// They run side by side (JITA_CHECK_WORKERS, default one per CPU, at most 8): none writes into this folder (layout-check.js
// keeps its cache and its browser's profile in the temp folder). Each is reported in name order as soon as the ones
// before it are.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

const DIR = __dirname;
const checks = fs.readdirSync(DIR).filter((f) => /-check\.js$/.test(f)).sort();
const W = Math.max(1, Math.min(checks.length, +process.env.JITA_CHECK_WORKERS || Math.min(8, os.cpus().length)));
const results = new Array(checks.length);
let bad = 0, next = 0, shown = 0;
const t0 = Date.now();

function print(r) {
    const lines = r.out.split('\n');
    const fails = lines.filter((l) => /^\s*FAIL\b/.test(l));
    const passes = lines.filter((l) => /^\s*PASS\b/.test(l)).length;
    const good = r.code === 0 && fails.length === 0;
    // A harness that cannot run here passes with a SKIP line saying why (layout-check.js without a browser).
    const skip = good && !passes && lines.filter((l) => /^\s*SKIP\b/.test(l))[0];
    if (!good) { bad++; }
    console.log((good ? (skip ? 'skip  ' : 'ok    ') : 'FAIL  ') + r.f.padEnd(24) + String(passes).padStart(4) + ' passed' +
        (fails.length ? ', ' + fails.length + ' failed' : '') + (r.code !== 0 ? ', exit ' + r.code : '') +
        (skip ? ', ' + skip.replace(/^\s*SKIP\s*/, '').trim() : '') + '  (' + r.ms + ' ms)');
    if (!good) {
        // The whole output for a red harness: the FAIL lines alone rarely say enough in a CI log.
        console.log(r.out.split('\n').map((l) => '      | ' + l).join('\n'));
    }
}
function run(i) {
    return new Promise((resolve) => {
        const f = checks[i], t = Date.now(), chunks = [];
        const p = spawn(process.execPath, [f], { cwd: DIR });
        p.stdout.on('data', (d) => chunks.push(d));
        p.stderr.on('data', (d) => chunks.push(d));
        p.on('error', (e) => chunks.push(Buffer.from(String(e && e.stack || e))));
        p.on('close', (code) => {
            results[i] = { f: f, code: code, out: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - t };
            while (shown < checks.length && results[shown]) { print(results[shown++]); }
            resolve();
        });
    });
}
async function worker() { while (next < checks.length) { await run(next++); } }

Promise.all(Array.from({ length: W }, worker)).then(() => {
    console.log('\n' + checks.length + ' test files, ' + (bad ? bad + ' red' : 'all green') + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, ' + W + ' workers)');
    process.exit(bad ? 1 : 0);
});
