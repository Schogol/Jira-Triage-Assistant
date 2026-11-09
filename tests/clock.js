// clock.js - a clock of its own for a harness that would otherwise sleep. setTimeout, setInterval (and their clears) and
// Date.now run on it, and it moves only when nothing else is left to run: then the earliest timer due runs, and the clock
// reads its time. So timers still run in the order they are due, each at its own time, and a harness waiting 80 ms for a
// refresh watcher, or a broken build hanging on a 2 s timeout, costs no real time at all.
//
// The one difference from real time: a timer never runs while promises or setImmediate hops are still under way, so a
// harness that hops (settle) sees a timer only once it waits for one. A test that passes on Windows, where even a 0 ms
// timer takes about 15 ms, does not count on more.
//
// require('./clock').install() first thing in a harness. new Date() still reads the real time.
'use strict';
let clock = null;
function install() {
    if (clock) { return clock; }
    let now = Date.now(), seq = 0, runs = 0;
    const queue = [];   // { id, at, fn, args, every }
    const add = (fn, ms, args, every) => {
        const t = { id: ++seq, at: now + Math.max(0, Number(ms) || 0), fn: fn, args: args, every: every ? Math.max(1, Number(ms) || 0) : 0 };
        queue.push(t);
        return t.id;
    };
    const clear = (id) => { const i = queue.findIndex((t) => t.id === id); if (i >= 0) { queue.splice(i, 1); } };
    Date.now = () => now;
    global.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
    global.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
    global.clearTimeout = clear;
    global.clearInterval = clear;
    // Node empties its event loop: nothing but our timers is left, so the earliest of them runs, in a turn of its own as a
    // real one would (an error in it is an uncaught one). Ties go in the order they were set.
    process.on('beforeExit', () => {
        if (!queue.length) { return; }
        if (++runs > 1000000) { console.log('CRASH the clock ran a million timers with nothing else to do'); process.exit(2); }
        let k = 0;
        for (let i = 1; i < queue.length; i++) { if (queue[i].at < queue[k].at || (queue[i].at === queue[k].at && queue[i].id < queue[k].id)) { k = i; } }
        const t = queue[k];
        now = Math.max(now, t.at);
        if (t.every) { t.at = now + t.every; } else { queue.splice(k, 1); }
        setImmediate(() => { t.fn.apply(null, t.args); });
    });
    clock = { now: () => now, pending: () => queue.length };
    return clock;
}
module.exports = { install: install };
