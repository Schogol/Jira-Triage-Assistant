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
//
// A suite much longer than the rest would still be the last to finish however many workers there are, so SHARDS splits
// it into shards, each a job of its own: shard k of n runs with JITA_BREAK_SHARD=k/n and makes only the breakages whose
// index % n === k (the suite says so in a "shard k/n" line). A suite passes only if every one of its shards does.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

const DIR = __dirname, REPO = path.join(DIR, '..');
// Measured on 16 cores with 8 workers: members alone took 195 s, and so did the run; excfind took 55 s, and all suites
// together about 450 s of work. Split 4 and 2 (shards of about 50 s and 27 s) the run takes 60 s, what 8 workers need for
// the whole load, so more shards would not shorten it. With 4 workers, as CI's runner has: 193 s before, 106 s after.
const SHARDS = { 'mutate-members.js': 4, 'mutate-excfind.js': 2 };
const runners = fs.readdirSync(DIR).filter((f) => /^mutate-.*\.js$/.test(f));
const needsRepo = (f) => /ci-static\.js|'git'/.test(fs.readFileSync(path.join(DIR, f), 'utf8'));
const jobsOf = (f) => {
    const n = SHARDS[f] || 1, size = fs.statSync(path.join(DIR, f)).size, out = [];
    for (let k = 0; k < n; k++) { out.push({ f: f, k: k, shard: n > 1 ? k + '/' + n : '', weight: size }); }
    return out;
};
// The biggest suites first, so a long one is not the last to start (the size of the file stands in for its time). Each
// shard weighs as much as its whole suite: a suite is split because it is the longest, and its shards go first.
const byWeight = (a, b) => b.weight - a.weight || (a.f < b.f ? -1 : a.f > b.f ? 1 : a.k - b.k);
const pool = [].concat(...runners.filter((f) => !needsRepo(f)).map(jobsOf)).sort(byWeight);
const inRepo = [].concat(...runners.filter(needsRepo).sort().map(jobsOf));
const W = Math.max(1, Math.min(pool.length, +process.env.JITA_BREAK_WORKERS || Math.min(8, os.cpus().length)));

// The runners write their broken copies (mut.js, mutt.js, ...) next to themselves; they are gitignored and
// removed again here so a crashed runner leaves nothing behind.
const scratch = (f) => /^mut[a-z]*\.js$/.test(f);
const cleanup = (dir) => fs.readdirSync(dir).filter(scratch).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* ignore */ } });

// The runners must break THIS file, not whatever JITA_SRC points at: they set JITA_SRC for their harnesses. And each
// makes every breakage it has unless this runner hands it a shard.
const env = Object.assign({}, process.env);
delete env.JITA_SRC;
delete env.JITA_BREAK_SHARD;

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

const failed = new Set();   // the suites with a job that failed
let done = 0, breakages = 0;
const t0 = Date.now(), total = pool.length + inRepo.length;
function run(job, cwd) {
    return new Promise((resolve) => {
        const t = Date.now(), chunks = [], name = job.f + (job.shard ? ' ' + job.shard : '');
        const p = spawn(process.execPath, [job.f], { cwd: cwd, env: job.shard ? Object.assign({}, env, { JITA_BREAK_SHARD: job.shard }) : env });
        p.stdout.on('data', (d) => chunks.push(d));
        p.stderr.on('data', (d) => chunks.push(d));
        p.on('error', (e) => chunks.push(Buffer.from(String(e && e.stack || e))));
        p.on('close', (code) => {
            const out = Buffer.concat(chunks).toString('utf8');
            const lines = out.split('\n');
            const caught = /every mutation caught/.test(out);
            const survived = lines.filter((l) => /^GREEN\b/.test(l) || /SURVIVED/.test(l));
            const anchors = lines.filter((l) => /^ANCHOR\b/.test(l));
            // A suite that ignored its shard would make every breakage in each of them: n times the work, and the count.
            const split = !job.shard || lines.some((l) => l.indexOf('shard ' + job.shard + ':') === 0);
            const good = caught && !survived.length && !anchors.length && split && code === 0;
            const count = lines.filter((l) => /^(RED|GREEN)\b/.test(l)).length;
            if (!good) { failed.add(job.f); }
            done++;
            breakages += count;
            console.log((good ? 'ok    ' : 'FAIL  ') + name.padEnd(26) + String(count).padStart(3) + ' breakages' +
                (anchors.length ? ', ' + anchors.length + ' anchor(s) missing' : '') + (split ? '' : ', not split into shards (JITA_BREAK_SHARD ignored)') +
                '  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)  [' + done + '/' + total + ']');
            if (!good) { console.log(out.split('\n').map((l) => '      | ' + l).join('\n')); }
            cleanup(cwd);
            resolve();
        });
    });
}
async function worker(cwd) { while (pool.length) { await run(pool.shift(), cwd); } }
async function repoLane() { for (const job of inRepo) { await run(job, DIR); } }

Promise.all(copies.map(worker).concat([repoLane()])).then(() => {
    removeCopies();
    const bad = failed.size;
    console.log('\n' + runners.length + ' breakage suites, ' + breakages + ' breakages, ' + (bad ? bad + ' failed' : 'every breakage caught') +
        '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, ' + W + ' workers)');
    process.exit(bad ? 1 : 0);
});
