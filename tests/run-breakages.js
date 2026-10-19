// run-breakages.js - runs every mutate-*.js in this folder. Each one breaks a guard in a copy of
// JiTA.user.js on purpose and requires the harness that owns that guard to go red; a harness that stays
// green through a breakage is not actually testing it. A runner passes only when it prints
// "every mutation caught". "SURVIVED" means a test went soft; "ANCHOR" means the code it breaks has
// moved or changed, so the runner needs updating along with that change.
//
// The suites run side by side, one per worker (JITA_BREAK_WORKERS, default one per CPU, at most 8). They write
// their broken copies under fixed names (mutt.js and the like) into their own folder, so each worker runs in a
// copy of this folder, with JiTA.user.js one level up as here. A suite that reads git (it runs ci-static.js or
// git itself) needs the real checkout: those run one after another in this folder, alongside the workers.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

const DIR = __dirname, REPO = path.join(DIR, '..');
const runners = fs.readdirSync(DIR).filter((f) => /^mutate-.*\.js$/.test(f));
const needsRepo = (f) => /ci-static\.js|'git'/.test(fs.readFileSync(path.join(DIR, f), 'utf8'));
// The biggest suites first, so a long one is not the last to start (the size of the file stands in for its time).
const bySize = (a, b) => fs.statSync(path.join(DIR, b)).size - fs.statSync(path.join(DIR, a)).size || (a < b ? -1 : 1);
const pool = runners.filter((f) => !needsRepo(f)).sort(bySize), inRepo = runners.filter(needsRepo).sort();
const W = Math.max(1, Math.min(pool.length, +process.env.JITA_BREAK_WORKERS || Math.min(8, os.cpus().length)));

// The runners write their broken copies (mut.js, mutt.js, ...) next to themselves; they are gitignored and
// removed again here so a crashed runner leaves nothing behind.
const scratch = (f) => /^mut[a-z]*\.js$/.test(f);
const cleanup = (dir) => fs.readdirSync(dir).filter(scratch).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ } });

// The runners must break THIS file, not whatever JITA_SRC points at: they set JITA_SRC for their harnesses.
const env = Object.assign({}, process.env);
delete env.JITA_SRC;

const roots = [];
const removeCopies = () => roots.splice(0).forEach((r) => { try { fs.rmSync(r, { recursive: true, force: true }); } catch (e) { /* ignore */ } });
process.on('exit', removeCopies);
const copies = [];
for (let k = 0; k < W; k++) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jita-breakages-'));
    roots.push(root);
    fs.copyFileSync(path.join(REPO, 'JiTA.user.js'), path.join(root, 'JiTA.user.js'));
    fs.cpSync(DIR, path.join(root, 'tests'), { recursive: true, filter: (s) => !scratch(path.basename(s)) });
    copies.push(path.join(root, 'tests'));
}

let bad = 0, done = 0;
const t0 = Date.now(), total = runners.length;
function run(f, cwd) {
    return new Promise((resolve) => {
        const t = Date.now(), chunks = [];
        const p = spawn(process.execPath, [f], { cwd: cwd, env: env });
        p.stdout.on('data', (d) => chunks.push(d));
        p.stderr.on('data', (d) => chunks.push(d));
        p.on('error', (e) => chunks.push(Buffer.from(String(e && e.stack || e))));
        p.on('close', (code) => {
            const out = Buffer.concat(chunks).toString('utf8');
            const lines = out.split('\n');
            const caught = /every mutation caught/.test(out);
            const survived = lines.filter((l) => /^GREEN\b/.test(l) || /SURVIVED/.test(l));
            const anchors = lines.filter((l) => /^ANCHOR\b/.test(l));
            const good = caught && !survived.length && !anchors.length && code === 0;
            const count = lines.filter((l) => /^(RED|GREEN)\b/.test(l)).length;
            if (!good) { bad++; }
            done++;
            console.log((good ? 'ok    ' : 'FAIL  ') + f.padEnd(26) + String(count).padStart(3) + ' breakages' +
                (anchors.length ? ', ' + anchors.length + ' anchor(s) missing' : '') +
                '  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)  [' + done + '/' + total + ']');
            if (!good) { console.log(out.split('\n').map((l) => '      | ' + l).join('\n')); }
            cleanup(cwd);
            resolve();
        });
    });
}
async function worker(cwd) { while (pool.length) { await run(pool.shift(), cwd); } }
async function repoLane() { for (const f of inRepo) { await run(f, DIR); } }

Promise.all(copies.map(worker).concat([repoLane()])).then(() => {
    removeCopies();
    console.log('\n' + total + ' breakage suites, ' + (bad ? bad + ' failed' : 'every breakage caught') + '  (' +
        ((Date.now() - t0) / 1000).toFixed(1) + ' s, ' + W + ' workers)');
    process.exit(bad ? 1 : 0);
});
