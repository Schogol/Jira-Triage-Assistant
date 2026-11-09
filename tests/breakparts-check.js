// breakparts-check.js - pins how run-breakages.js deals its jobs over CI's machines (JITA_BREAK_PART=k/n): together the
// parts make every job of a whole run exactly once, so no suite or shard is left out, and the parts carry about the same
// weight. Lists the jobs with JITA_BREAK_LIST=1, which makes nothing.
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) { fail++; } };
const J = (x) => JSON.stringify(x);
const RUNNER = path.join(__dirname, 'run-breakages.js');
const list = (part) => {
    const env = Object.assign({}, process.env, { JITA_BREAK_LIST: '1' });
    delete env.JITA_BREAK_PART;
    if (part) { env.JITA_BREAK_PART = part; }
    const r = spawnSync(process.execPath, [RUNNER], { cwd: __dirname, encoding: 'utf8', env: env, timeout: 30000 });
    return { status: r.status, out: r.stdout || '', jobs: (r.stdout || '').split('\n').filter((l) => /^mutate-/.test(l)) };
};

const all = list('');
ok('a whole run lists its jobs and makes nothing', all.status === 0 && all.jobs.length > 60 && all.jobs.length === all.out.trim().split('\n').length, all.status + ' ' + all.jobs.length);
const shards = (name) => all.jobs.filter((j) => j.split(' ')[0] === name);
ok('...a sharded suite once per shard', shards('mutate-members.js').length > 1 && shards('mutate-members.js').every((j, i, a) => j === 'mutate-members.js ' + i + '/' + a.length), J(shards('mutate-members.js')));
[2, 3, 4].forEach((n) => {
    const parts = [];
    for (let k = 0; k < n; k++) { parts.push(list(k + '/' + n)); }
    const dealt = [].concat(...parts.map((p) => p.jobs));
    ok('in ' + n + ' parts every job is made exactly once', parts.every((p) => p.status === 0) && dealt.length === all.jobs.length &&
        J(dealt.slice().sort()) === J(all.jobs.slice().sort()), dealt.length + ' of ' + all.jobs.length);
    ok('...and each part gets some', parts.every((p) => p.jobs.length > 0), J(parts.map((p) => p.jobs.length)));
});
const third = [0, 1, 2].map((k) => list(k + '/3'));
const heavy = ['mutate-members.js', 'mutate-checklist.js'];
ok('in 3 parts the shards of a big suite are spread, not all on one machine', heavy.every((s) => third.filter((p) => p.jobs.some((j) => j.split(' ')[0] === s)).length >= 2),
    J(third.map((p) => p.jobs.filter((j) => heavy.indexOf(j.split(' ')[0]) >= 0))));
ok('the browser suite goes first in its part, not last (it takes many times its size)', third.some((p) => p.jobs.indexOf('mutate-layout.js') >= 0 && p.jobs.indexOf('mutate-layout.js') < 4),
    J(third.map((p) => p.jobs.indexOf('mutate-layout.js'))));
ok('the same deal every time, as each machine deals for itself', J(list('1/3').jobs) === J(third[1].jobs));
['3/3', '1/0', 'x', '1', '-1/3'].forEach((bad) => {
    const r = list(bad);
    ok('a part that cannot be (' + bad + ') stops the run', r.status === 1 && !r.jobs.length && /JITA_BREAK_PART/.test(r.out), r.status + ' ' + J(r.out));
});

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'breakage part checks passed.'));
process.exit(fail ? 1 : 0);
