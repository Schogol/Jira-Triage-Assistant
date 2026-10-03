// translate-check.js - the foreign-report translate pass (v3.38.26). Evals the real JiTA.translate against stubs:
//  - one report whose translation cannot be stored is logged and skipped; the pass goes on and ends normally (a
//    rejected write ended one lane while the other went on, and the next prepare() started a second pass beside it)
//  - an endpoint that refuses everything is given up after MAX_CAPPED waits at the backoff cap instead of being
//    retried for as long as the tab is open; the other lane takes the rest, and with both refusing the pass still ends
//  - the pass hands the panel's status line back when it is done
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s0 = src.indexOf('\nJiTA.translate = {'), e0 = src.indexOf('\n};\n', s0);
if (s0 < 0 || e0 < 0) { throw new Error('could not slice JiTA.translate'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

let recs = [], stored = [], refuse = {}, waits = [], renders = 0, statuses = [], ep = null, logs = [];
const log0 = console.log;
global.navigator = {};
global.JiTA = {
    db: {
        allDefects: () => Promise.resolve(recs.slice()),
        mergeEach: () => Promise.resolve(),
        setMeta: () => Promise.resolve(),
        updateRecord: (key, apply) => { if (refuse[key]) { return Promise.reject(new Error('QuotaExceededError')); } const c = {}; apply(c); stored.push(key + ':' + c.lang); return Promise.resolve(true); }
    },
    util: {
        isClosedStatus: () => false, isGmTeam: () => false,
        cleanForCompare: (s) => s, detectLang: (t) => (/^en /.test(t) ? 'english' : 'foreign'),
        // A pass that never gives up would spin here for good: fail it instead of hanging the harness.
        delay: (ms) => { waits.push(ms); return waits.length > 1000 ? Promise.reject(new Error('runaway retries')) : new Promise((r) => setImmediate(r)); }
    },
    ui: { setStatus: (m) => { statuses.push(m); }, scheduleRender: () => { renders++; }, currentKey: null },
    rank: {}, embed: { prepare() {} }
};
eval(src.slice(s0 + 1, e0) + '\n};');
const T = JiTA.translate;
const reports = (n) => Array.from({ length: n }, (_, i) => ({ key: 'EBR-' + (i + 1), project: 'EBR', status: 'Open', summary: 'texto ' + i, description: '' }));
const run = async () => {
    stored = []; waits = []; renders = 0; statuses = []; logs = [];
    console.log = (...a) => { logs.push(a.join(' ')); };
    let outcome = 'pending';
    try { await T.pass(); outcome = 'done'; } catch (e) { outcome = 'threw ' + e.message; }
    console.log = log0;
    return outcome;
};

(async () => {
    // ================= a write that fails =================
    recs = reports(4);
    refuse = { 'EBR-2': true };
    global.jitaTranslateRR = (text) => Promise.resolve({ en: 'translated ' + text, src: 'de' });
    let outcome = await run();
    ok('a report whose translation cannot be stored does not end the pass', outcome === 'done', outcome);
    ok('...every other report is still stored', stored.sort().join() === 'EBR-1:de,EBR-3:de,EBR-4:de', stored.join());
    ok('...and the failure is logged', logs.some((l) => /could not store EBR-2/.test(l)), logs.join(' | '));
    refuse = {};

    // ================= an endpoint that refuses everything =================
    recs = reports(5);
    let calls = [0, 0];
    global.jitaTranslateRR = (text, e) => { calls[e]++; return Promise.resolve(e === 0 ? { fail: true, hard: false } : { en: 'ok ' + text, src: 'fr' }); };
    outcome = await run();
    ok('a refusing endpoint is given up while the other lane translates the rest', outcome === 'done' && stored.length === 4, outcome + ' / ' + stored.join());
    ok('...after MAX_CAPPED waits at the cap, not forever', waits.filter((w) => w === T.BACKOFF_MAX).length === T.MAX_CAPPED - 1 && calls[0] < 20, calls[0] + ' tries, ' + waits.filter((w) => w === T.BACKOFF_MAX).length + ' capped waits');
    ok('...and says so', logs.some((l) => /endpoint 0 keeps refusing/.test(l)), logs.join(' | '));

    recs = reports(3);
    global.jitaTranslateRR = () => Promise.resolve({ fail: true, hard: false });
    outcome = await run();
    ok('with both endpoints refusing, the pass still ends and lets go of its lock', outcome === 'done' && stored.length === 0, outcome);

    recs = reports(2);
    let n = 0;
    global.jitaTranslateRR = (text) => { n++; return Promise.resolve(n % 3 === 0 ? { en: 'ok', src: 'de' } : { fail: true, hard: false }); };
    outcome = await run();
    ok('refusals that never reach the cap never give up (control)', outcome === 'done' && stored.length === 2, stored.join());
    recs = reports(14);
    const per = [0, 0];
    global.jitaTranslateRR = (text, e) => { per[e]++; return Promise.resolve(per[e] % 8 === 0 ? { en: 'ok', src: 'de' } : { fail: true, hard: false }); };
    outcome = await run();
    ok('a lane that reaches the cap again and again, with a success each time, starts its count again every time', outcome === 'done' && stored.length === 14, stored.length + ' of 14');

    // ================= the status line =================
    ok('the pass hands the status line back to the view when it is done', renders >= 1 && statuses.length > 0, renders + ' renders');
    recs = [];
    renders = 0;
    await run();
    ok('...and leaves the view alone when it had nothing to do (control)', renders === 0, String(renders));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'translate checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log = log0; console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
