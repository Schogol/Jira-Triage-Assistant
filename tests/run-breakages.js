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
//
// Each harness a suite starts stops at its first failing check (failfast.js, put in NODE_OPTIONS here): that settles the
// breakage, and the rest of the harness would be time spent for nothing. JITA_BREAK_FULL=1 lets every harness run to its
// end, for the full "(N failing)" counts.
//
// CI splits the run over several machines: JITA_BREAK_PART=k/n makes only part k of n of the jobs. Every part deals the
// jobs the same way (the costliest first, each to the part with the least so far), so together the parts make each once.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

const DIR = __dirname, REPO = path.join(DIR, '..');
// Measured on 16 cores with 8 workers: members alone took 195 s, and so did the run; excfind took 55 s, and all suites
// together about 450 s of work. Split 4 and 2 (shards of about 50 s and 27 s) the run takes 60 s, what 8 workers need for
// the whole load, so more shards would not shorten it. With 4 workers, as CI's runner has: 193 s before, 106 s after.
// Then the Defect checklist came (v3.51.0): its suite alone took 228 s of the 680 s of work, and the run took as long.
// Split 4 like members, its shards take about 57 s each and the run 89 s, close to the 87 s 8 workers need for the work.
// Since the harnesses stop at their first failing check and the ones that slept run on clock.js, all of it is about 230
// s of work, and the shards (members about 10 s each, checklist 6 s, excfind 11 s) mostly let CI's three parts come out
// even: 18 to 20 s each on 4 workers.
const SHARDS = { 'mutate-members.js': 4, 'mutate-checklist.js': 4, 'mutate-excfind.js': 2 };
const runners = fs.readdirSync(DIR).filter((f) => /^mutate-.*\.js$/.test(f));
const needsRepo = (f) => /ci-static\.js|'git'/.test(fs.readFileSync(path.join(DIR, f), 'utf8'));
// A suite's size stands in for its time (about half a second per KB), except for one that starts a real browser for each
// breakage (mutate-layout.js): that takes about 8 times as long as its size says.
const BROWSER_WEIGHT = 8;
const jobsOf = (f) => {
    const browser = /layout-check\.js/.test(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const n = SHARDS[f] || 1, size = fs.statSync(path.join(DIR, f)).size * (browser ? BROWSER_WEIGHT : 1), out = [];
    for (let k = 0; k < n; k++) { out.push({ f: f, k: k, shard: n > 1 ? k + '/' + n : '', weight: size }); }
    return out;
};
// The biggest suites first, so a long one is not the last to start (the size of the file stands in for its time). Each
// shard weighs as much as its whole suite: a suite is split because it is the longest, and its shards go first.
const byWeight = (a, b) => b.weight - a.weight || (a.f < b.f ? -1 : a.f > b.f ? 1 : a.k - b.k);
const pool = [].concat(...runners.filter((f) => !needsRepo(f)).map(jobsOf)).sort(byWeight);
const inRepo = [].concat(...runners.filter(needsRepo).sort().map(jobsOf));
// This machine's part of the jobs. A job costs its suite's size over its shards; ties go in the pool's order.
const PART = process.env.JITA_BREAK_PART || '';
const part = /^(\d+)\/(\d+)$/.exec(PART);
if (PART && !(part && +part[1] < +part[2])) { console.log('JITA_BREAK_PART must read k/n, with k below n: ' + PART); process.exit(1); }
if (part) {
    const load = new Array(+part[2]).fill(0), mine = new Set();
    pool.concat(inRepo).map((j) => ({ j: j, cost: j.weight / (SHARDS[j.f] || 1) })).sort((a, b) => b.cost - a.cost || byWeight(a.j, b.j))
        .forEach((x) => { const p = load.indexOf(Math.min(...load)); load[p] += x.cost; if (p === +part[1]) { mine.add(x.j); } });
    [pool, inRepo].forEach((list) => { for (let i = list.length - 1; i >= 0; i--) { if (!mine.has(list[i])) { list.splice(i, 1); } } });
}
const suites = new Set(pool.concat(inRepo).map((j) => j.f)).size;
// JITA_BREAK_LIST=1 only lists the jobs this run would make, one per line (breakparts-check.js deals them all).
if (process.env.JITA_BREAK_LIST === '1') {
    pool.concat(inRepo).forEach((j) => console.log(j.f + (j.shard ? ' ' + j.shard : '')));
    process.exit(0);
}
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
delete env.JITA_BREAK_PART;
if (process.env.JITA_BREAK_FULL !== '1') {
    // Forward slashes: NODE_OPTIONS reads a backslash inside quotes as an escape.
    env.NODE_OPTIONS = ((env.NODE_OPTIONS || '') + ' --require "' + path.join(DIR, 'failfast.js').split(path.sep).join('/') + '"').trim();
}

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

const failed = new Set(), skipped = new Set();   // the suites with a job that failed, and those that could not run here
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
            // A suite that cannot run here says SKIP and why (mutate-layout.js without a browser); CI requires it to run.
            const skip = !caught && code === 0 && !survived.length && !anchors.length && lines.filter((l) => /^SKIP\b/.test(l))[0];
            const good = caught && !survived.length && !anchors.length && split && code === 0;
            const count = lines.filter((l) => /^(RED|GREEN)\b/.test(l)).length;
            if (!good && !skip) { failed.add(job.f); }
            if (skip) { skipped.add(job.f); }
            done++;
            breakages += count;
            console.log((good ? 'ok    ' : skip ? 'skip  ' : 'FAIL  ') + name.padEnd(26) + String(count).padStart(3) + ' breakages' +
                (anchors.length ? ', ' + anchors.length + ' anchor(s) missing' : '') + (split ? '' : ', not split into shards (JITA_BREAK_SHARD ignored)') +
                (skip ? ', ' + skip.replace(/^SKIP\s*/, '').trim() : '') + '  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)  [' + done + '/' + total + ']');
            if (!good && !skip) { console.log(out.split('\n').map((l) => '      | ' + l).join('\n')); }
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
    console.log('\n' + (part ? 'part ' + PART + ': ' + suites + ' of ' + runners.length : runners.length) + ' breakage suites, ' + breakages + ' breakages, ' + (bad ? bad + ' failed' : 'every breakage caught') +
        (skipped.size ? ', ' + skipped.size + ' skipped' : '') + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, ' + W + ' workers)');
    process.exit(bad ? 1 : 0);
});
