// Eval the real JiTA.leadduty.ui literal and exercise _warmQc: the overlay now resolves the QC month as soon
// as it opens, so clicking the tab only paints. Checks it is single-flight, cached, and that the warm can
// never clobber a result _loadQc already stored.
const fs = require('fs');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const us = src.indexOf('JiTA.leadduty.ui = {');
const ue = src.indexOf('\n};', src.indexOf('_injectCss: function ()', us)) + 3;
if (us < 0 || ue < 3) { throw new Error('could not slice JiTA.leadduty.ui'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

let overlayOpen = true;
global.document = { querySelector: () => (overlayOpen ? {} : null), getElementById: () => null };
global.$ = () => ({ length: 0 });
global.GM_addStyle = () => {};

let calls = 0, resolveWith = null, rejectWith = null;
global.JiTA = {
    leadduty: {
        _prevYm: () => '2026-08',
        qc: {
            claimMonth(ym) {
                calls++;
                return new Promise((res, rej) => { resolveWith = () => res({ ym: ym, tag: 'fresh' }); rejectWith = rej; });
            }
        }
    }
};
eval(src.slice(us, ue));
const U = global.JiTA.leadduty.ui;

(async () => {
    // Two callers (the overlay's open-time warm and a tab click) must share ONE resolution.
    const a = U._warmQc(), b = U._warmQc();
    ok('two callers share one in-flight resolution', calls === 1, calls + ' calls');
    ok('the in-flight promise is tracked', !!U._qcWarm);
    resolveWith();
    const [ra, rb] = [await a, await b];
    ok('both callers get the same result', ra === rb && ra.ym === '2026-08');
    ok('the result is cached on the overlay', U._qc === ra);
    ok('the in-flight slot is cleared', U._qcWarm === null);

    // A warm already in flight must not overwrite whatever _loadQc stored meanwhile (e.g. a forced reload).
    U._qc = null; U._qcWarm = null; calls = 0;
    const late = U._warmQc();
    U._qc = { ym: '2026-08', tag: 'loadQc' };   // a forced load landed first
    resolveWith();
    await late;
    ok('a late warm does not clobber a stored result', U._qc.tag === 'loadQc', U._qc.tag);

    // Once cached for the month, no further request is made.
    calls = 0;
    const cached = await U._warmQc();
    ok('a cached month costs no request', calls === 0 && cached.tag === 'loadQc');

    // A different month must NOT be served from the cache.
    U._qc = { ym: '2026-07', tag: 'stale' }; calls = 0;
    const next = U._warmQc();
    ok('a stale month is re-resolved', calls === 1, calls + ' calls');
    resolveWith(); await next;

    // A failure clears the slot so the tab can retry rather than latching on a dead promise.
    U._qc = null; U._qcWarm = null; calls = 0;
    const bad = U._warmQc();
    rejectWith(new Error('confluence down'));
    let threw = false;
    try { await bad; } catch (e) { threw = true; }
    ok('a failure propagates to the caller', threw);
    ok('a failure clears the in-flight slot (retry is possible)', U._qcWarm === null);

    // A closed overlay must not have state written back into it.
    U._qc = null; calls = 0; overlayOpen = false;
    const after = U._warmQc();
    resolveWith(); await after;
    ok('a closed overlay is not populated', U._qc === null);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'warm checks passed.'));
    process.exit(fail ? 1 : 0);
})();
