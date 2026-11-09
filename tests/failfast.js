// failfast.js - loaded into every harness a breakage run starts (run-breakages.js puts it in NODE_OPTIONS). A breakage
// only needs its harness to go red, and the first failing check settles that, so the harness stops there: it prints that
// check, then a RED line, and exits 1. Every suite counts any failing check as caught, so the verdicts stay the same;
// only a suite's "(N failing)" reads 1. A harness that passes runs to its end untouched, so a breakage it misses still
// shows as missed.
//
// Left alone: anything that is not a harness (a suite, ci-static.js), a harness run on the real file (no JITA_SRC), and
// layout-check.js, which has a browser to close. JITA_BREAK_FULL=1 makes run-breakages.js leave this out altogether.
'use strict';
const fs = require('fs');
const script = process.argv[1] || '';
if (process.env.JITA_SRC && /-check\.js$/.test(script) && !/layout-check\.js$/.test(script)) {
    const write = process.stdout.write.bind(process.stdout);
    // Written straight to the descriptor, so nothing is lost when the process exits right after. A pipe that is full for a
    // moment (EAGAIN) is tried again: the suite reading it empties it.
    const writeNow = (s) => {
        const b = Buffer.from(s, 'utf8');
        let off = 0, tries = 0;
        while (off < b.length) {
            try { off += fs.writeSync(1, b, off, b.length - off); } catch (e) { if (e.code !== 'EAGAIN' || ++tries > 100000) { return; } }
        }
    };
    process.stdout.write = function (chunk, encoding, cb) {
        const s = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
        if (/^  FAIL  /m.test(s)) {
            writeNow(s + (s.endsWith('\n') ? '' : '\n') + 'RED   stopped at the first failing check (a breakage run)\n');
            process.exit(1);
        }
        return write(chunk, encoding, cb);
    };
}
