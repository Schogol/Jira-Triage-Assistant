// run-breakages.js - runs every mutate-*.js in this folder. Each one breaks a guard in a copy of
// JiTA.user.js on purpose and requires the harness that owns that guard to go red; a harness that stays
// green through a breakage is not actually testing it. A runner passes only when it prints
// "every mutation caught". "SURVIVED" means a test went soft; "ANCHOR" means the code it breaks has
// moved or changed, so the runner needs updating along with that change.
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const runners = fs.readdirSync(DIR).filter((f) => /^mutate-.*\.js$/.test(f)).sort();
// The runners write their broken copies (mut.js, mutt.js, ...) into this folder; they are gitignored and
// removed again here so a crashed runner leaves nothing behind.
const cleanup = () => fs.readdirSync(DIR).filter((f) => /^mut[a-z]?\.js$/.test(f)).forEach((f) => { try { fs.unlinkSync(path.join(DIR, f)); } catch (e) { /* ignore */ } });

// The runners must break THIS file, not whatever JITA_SRC points at: they set JITA_SRC for their harnesses.
const env = Object.assign({}, process.env);
delete env.JITA_SRC;

let bad = 0;
const t0 = Date.now();
runners.forEach((f) => {
    const t = Date.now();
    const r = spawnSync(process.execPath, [f], { cwd: DIR, env: env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = (r.stdout || '') + (r.stderr || '');
    const lines = out.split('\n');
    const caught = /every mutation caught/.test(out);
    const survived = lines.filter((l) => /^GREEN\b/.test(l) || /SURVIVED/.test(l));
    const anchors = lines.filter((l) => /^ANCHOR\b/.test(l));
    const good = caught && !survived.length && !anchors.length && r.status === 0;
    const count = lines.filter((l) => /^(RED|GREEN)\b/.test(l)).length;
    if (!good) { bad++; }
    console.log((good ? 'ok    ' : 'FAIL  ') + f.padEnd(26) + String(count).padStart(3) + ' breakages' +
        (anchors.length ? ', ' + anchors.length + ' anchor(s) missing' : '') +
        '  (' + ((Date.now() - t) / 1000).toFixed(1) + ' s)');
    if (!good) { console.log(out.split('\n').map((l) => '      | ' + l).join('\n')); }
    cleanup();
});
console.log('\n' + runners.length + ' breakage suites, ' + (bad ? bad + ' failed' : 'every breakage caught') + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
process.exit(bad ? 1 : 0);
