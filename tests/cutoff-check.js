// cutoff-check.js - the incremental syncs' "updated since the high-water mark" cutoff (v3.38.3). It used to be an
// absolute "yyyy/MM/dd HH:mm" written in the BROWSER's timezone, which JQL reads in the Jira PROFILE's: a browser
// two hours ahead of its profile asked for "since two hours after the mark" and skipped those updates for good. It
// is now a relative "-Nm", N minutes before Jira's own now, which no timezone touches. Evals the real
// JiTA.util.jqlSince and JiTA.sync.incrementalSync / incrementalSyncEbr against stubbed meta and sync calls.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const END = '\n    },';
const slice = (head) => { const s = src.indexOf(head); if (s < 0) { throw new Error('could not slice ' + head.trim()); } return src.slice(s, src.indexOf(END, s) + END.length); };
const U = slice('    jqlSince: function (iso, now) {');
const S1 = slice('    incrementalSync: function () {');
const S2 = slice('    incrementalSyncEbr: function () {');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const meta = {}, runs = [], full = [];
global.JiTA = {
    SCOPE: 'project in (EDR, EO, PLAT)',
    db: { getMeta: (k) => Promise.resolve(k in meta ? meta[k] : null) },
    util: eval('({' + U + '})'),
    sync: eval('({' + S1 + S2 + '})')
};
Object.assign(JiTA.sync, {
    _run: (jql, opts) => { runs.push({ jql: jql, opts: opts }); return Promise.resolve({ stored: 0 }); },
    fullSync: () => { full.push('defects'); return Promise.resolve({ stored: 0 }); },
    fullSyncEbr: () => { full.push('ebr'); return Promise.resolve({ stored: 0 }); }
});
const since = JiTA.util.jqlSince;
const NOW = Date.parse('2026-10-02T14:41:05.000Z'), MIN = 60000;
const mins = (s) => { const m = /^-(\d+)m$/.exec(s || ''); return m ? Number(m[1]) : NaN; };

(async () => {
    // ---- the cutoff itself ----
    ok('a mark ten minutes back asks for the last fifteen', since('2026-10-02T14:31:05.000+0000', NOW) === '-15m', since('2026-10-02T14:31:05.000+0000', NOW));
    ok('...a part minute is rounded up, never down', since('2026-10-02T14:30:35.000+0000', NOW) === '-16m', since('2026-10-02T14:30:35.000+0000', NOW));
    ok('...the same instant written with another offset is the same cutoff', since('2026-10-02T16:31:05.000+0200', NOW) === '-15m', since('2026-10-02T16:31:05.000+0200', NOW));
    ok('...and a month-old mark reaches back a month', since('2026-09-02T14:41:05.000+0000', NOW) === '-' + (30 * 24 * 60 + 5) + 'm', since('2026-09-02T14:41:05.000+0000', NOW));
    const marks = [1000, 59 * 1000, 10 * MIN, 3 * 60 * MIN, 2 * 24 * 60 * MIN];
    ok('every cutoff reaches at least four minutes past the mark, on Jira\'s clock', marks.every((back) => NOW - mins(since(new Date(NOW - back).toISOString(), NOW)) * MIN <= NOW - back - 4 * MIN),
        marks.map((back) => since(new Date(NOW - back).toISOString(), NOW)).join(' '));
    ok('a mark ahead of the computer\'s clock (it runs behind Jira\'s) still asks for five minutes', since('2026-10-02T14:44:05.000+0000', NOW) === '-5m', since('2026-10-02T14:44:05.000+0000', NOW));
    ok('a mark that is not a date gives no cutoff', since('garbage', NOW) === null && since(undefined, NOW) === null, String(since('garbage', NOW)));

    // The bug, in its own terms: the same mark, read on a computer in another timezone, must give the same cutoff.
    const mark = '2026-10-02T12:31:05.000+0000', seen = [];
    ['UTC', 'Europe/Berlin', 'America/Los_Angeles', 'Asia/Tokyo'].forEach((tz) => { process.env.TZ = tz; seen.push(since(mark, NOW)); });
    ok('the computer\'s timezone does not move the cutoff', seen.every((x) => x === seen[0]) && seen[0] === '-135m', seen.join(' '));

    // ---- the incremental syncs ----
    Date.now = () => NOW;
    meta.lastSyncHighWater = '2026-10-02T14:31:05.000+0000';
    await JiTA.sync.incrementalSync();
    ok('the defect sync asks Jira for the last fifteen minutes', runs.length === 1 && runs[0].jql === 'project in (EDR, EO, PLAT) AND updated >= "-15m" ORDER BY updated ASC', runs[0] && runs[0].jql);
    ok('...carrying the mark on as its starting high water', runs[0] && runs[0].opts.startHighWater === meta.lastSyncHighWater);
    runs.length = 0;
    meta.lastSyncHighWater = 'garbage';
    await JiTA.sync.incrementalSync();
    ok('...and a mark that is not a date means a full sync, not a broken query', runs.length === 0 && full.join(',') === 'defects', full.join(','));
    full.length = 0;
    meta.lastSyncHighWater = '';
    await JiTA.sync.incrementalSync();
    ok('...as does no mark at all', runs.length === 0 && full.join(',') === 'defects', full.join(','));

    full.length = 0;
    meta.lastSyncHighWaterEbr = '2026-10-02T14:31:05.000+0000';
    await JiTA.sync.incrementalSyncEbr();
    ok('the bug report sync asks for the last fifteen minutes, open or not', runs.length === 1 && runs[0].jql === 'project = EBR AND updated >= "-15m" ORDER BY updated ASC', runs[0] && runs[0].jql);
    ok('...pruning the reports that have closed since', runs[0] && runs[0].opts.pruneResolved === true && runs[0].opts.metaPrefix === 'Ebr' && runs[0].opts.startHighWater === meta.lastSyncHighWaterEbr);
    runs.length = 0;
    meta.lastSyncHighWaterEbr = 'garbage';
    await JiTA.sync.incrementalSyncEbr();
    ok('...and a mark that is not a date means a full bug report sync', runs.length === 0 && full.join(',') === 'ebr', full.join(','));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'sync cutoff checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
