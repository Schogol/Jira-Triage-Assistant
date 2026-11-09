// clock-check.js - pins tests/clock.js, the clock the harnesses that used to sleep run on: timers run in the order they
// are due, each at its own time, only once nothing else is left to run, and cost no real time; Date.now reads the clock;
// clears, intervals, arguments and ties behave as with real timers.
'use strict';
const realNow = Date.now;
const startReal = realNow();
const clock = require('./clock').install();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) { fail++; } };
const J = (x) => JSON.stringify(x);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hops = async (n) => { for (let i = 0; i < n; i++) { await new Promise((r) => setImmediate(r)); } };

(async () => {
    const t0 = Date.now();
    ok('Date.now starts at the real time', Math.abs(t0 - startReal) < 1000, t0 - startReal);
    ok('installing it again gives the same clock', require('./clock').install() === clock);

    const order = [];
    setTimeout(() => order.push('c'), 30);
    setTimeout(() => order.push('a'), 10);
    setTimeout(() => order.push('b'), 10);
    setTimeout(() => order.push('z'), 0);
    setTimeout(() => order.push('n'));
    await wait(50);
    ok('timers run in the order they are due, ties in the order they were set', order.join('') === 'znabc', order.join(''));
    ok('...and the clock reads the end of the wait', Date.now() - t0 === 50, Date.now() - t0);

    let fired = false;
    setTimeout(() => { fired = true; }, 0);
    await hops(50);
    ok('a timer waits while promises and hops are still under way', fired === false);
    await wait(0);
    ok('...and runs once the harness waits', fired === true);

    let cleared = false;
    const id = setTimeout(() => { cleared = true; }, 5);
    clearTimeout(id);
    clearTimeout(12345);   // an unknown id is ignored
    await wait(10);
    ok('a cleared timer never runs', cleared === false);

    const ticks = [], from = Date.now();
    const iv = setInterval(() => { ticks.push(Date.now() - from); if (ticks.length === 3) { clearInterval(iv); } }, 100);
    await wait(1000);
    ok('an interval runs every period until it is cleared', J(ticks) === J([100, 200, 300]), J(ticks));

    let got = null;
    const at = Date.now();
    setTimeout((a, b) => { got = [a, b, Date.now() - at]; }, 20, 'x', 'y');
    await wait(20);
    ok('a timer gets its arguments and reads its own time', J(got) === J(['x', 'y', 20]), J(got));

    const nested = [];
    setTimeout(() => { nested.push('outer'); setTimeout(() => nested.push('inner'), 5); }, 5);
    setTimeout(() => nested.push('later'), 8);
    await wait(20);
    ok('a timer set by a timer takes its place by time', J(nested) === J(['outer', 'later', 'inner']), J(nested));

    const r0 = realNow();
    await wait(3600 * 1000);
    const v = await new Promise((r) => setTimeout(() => r(42), 2000));
    ok('an hour of waiting, and a promise behind a timer, take no real time', v === 42 && realNow() - r0 < 1000, realNow() - r0 + ' ms');
    ok('nothing is left waiting', clock.pending() === 0, clock.pending());

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'clock checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
