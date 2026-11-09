// failfast-check.js - pins tests/failfast.js, which a breakage run loads into every harness: a harness stops at its first
// failing check (printing it, then RED) and exits 1, while one that passes runs to its end untouched, so a breakage it
// misses still shows as missed. A harness run on the real file, anything that is not a harness and layout-check.js are
// left alone. Runs small stand-in harnesses in a temporary folder, with the preload put in NODE_OPTIONS as
// run-breakages.js puts it.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) { fail++; } };
const J = (x) => JSON.stringify(x);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jita-failfast-'));
const pre = path.join(__dirname, 'failfast.js').split(path.sep).join('/');
const put = (name, body) => { fs.writeFileSync(path.join(dir, name), body); return name; };
// A stand-in harness: prints each line, then "end", and exits 0, the way a harness whose checks all print would.
const lines = (ls) => ls.map((l) => 'console.log(' + J(l) + ');').join('\n') + '\nconsole.log("end");\nprocess.exit(0);\n';
const run = (name, env) => spawnSync(process.execPath, [name], {
    cwd: dir, encoding: 'utf8', timeout: 30000,
    env: Object.assign({}, process.env, { NODE_OPTIONS: '--require "' + pre + '"', JITA_SRC: 'mutt.js' }, env || {})
});

try {
    put('x-check.js', lines(['  PASS  one', '  FAIL  two', '  PASS  three', '  FAIL  four']));
    let r = run('x-check.js');
    ok('a harness stops at its first failing check, which it prints, then says RED and exits 1',
        r.status === 1 && /^  FAIL  two\nRED /m.test(r.stdout) && !/three|four|end/.test(r.stdout), r.status + ' ' + J(r.stdout));
    put('y-check.js', lines(['  PASS  one', '  PASS  two']));
    r = run('y-check.js');
    ok('a harness that passes runs to its end untouched, so a breakage it misses still shows', r.status === 0 && r.stdout === '  PASS  one\n  PASS  two\nend\n', r.status + ' ' + J(r.stdout));
    r = run('x-check.js', { JITA_SRC: '' });
    ok('a harness run on the real file (no JITA_SRC) runs to its end', r.status === 0 && /  FAIL  four\nend\n$/.test(r.stdout) && !/RED/.test(r.stdout), r.status + ' ' + J(r.stdout));
    put('mutate-x.js', lines(['  FAIL  a line a suite shows']));
    r = run('mutate-x.js');
    ok('anything that is not a harness is left alone', r.status === 0 && /end\n$/.test(r.stdout), r.status + ' ' + J(r.stdout));
    put('layout-check.js', lines(['  FAIL  a', '  FAIL  b']));
    r = run('layout-check.js');
    ok('...and so is layout-check.js, which has a browser to close', r.status === 0 && /  FAIL  b\nend\n$/.test(r.stdout), r.status + ' ' + J(r.stdout));
    put('z-check.js', 'process.stdout.write("  PASS  a\\n  FAIL  b\\n  PASS  c");\nconsole.log("end");\nprocess.exit(0);\n');
    r = run('z-check.js');
    ok('a failing check written along with other lines, with no newline at the end, stops it too', r.status === 1 && /  FAIL  b\n  PASS  c\nRED /.test(r.stdout) && !/end/.test(r.stdout), r.status + ' ' + J(r.stdout));
    put('b-check.js', 'process.stdout.write(Buffer.from("  FAIL  from a buffer\\n"));\nconsole.log("end");\nprocess.exit(0);\n');
    r = run('b-check.js');
    ok('...as does one written as a buffer', r.status === 1 && /^  FAIL  from a buffer\nRED /.test(r.stdout) && !/end/.test(r.stdout), r.status + ' ' + J(r.stdout));
    put('w-check.js', lines(['  PASS  x', 'FAIL  not a check line', '    FAIL  nor this', 'the word FAIL in a name']));
    r = run('w-check.js');
    ok('only a check line (two spaces, FAIL, two spaces) stops it, as the suites count only those', r.status === 0 && /end\n$/.test(r.stdout), r.status + ' ' + J(r.stdout));
    put('n-check.js', lines([]).replace('process.exit(0);', 'process.exitCode = 0;'));
    r = run('n-check.js');
    ok('nothing printed, nothing changed', r.status === 0 && r.stdout === 'end\n', r.status + ' ' + J(r.stdout));
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'fail-fast checks passed.'));
process.exit(fail ? 1 : 0);
