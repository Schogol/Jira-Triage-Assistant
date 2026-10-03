// hydrate-check.js - a QC month's sample is read even when one of its issues is gone (v3.38.11). _hydrate asks Jira
// for every sampled key in one `key in (...)` search, and Jira refuses the whole search (HTTP 400) when a single key
// no longer exists, so one deleted issue failed the month's Quality control tab outright. It now falls back to one
// read per key, and a key that is gone (404) or out of reach (403) shows as "(not found - moved or deleted)". Evals
// the real JiTA.leadduty.qc._hydrate against stubbed reads.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const head = '        _hydrate: function (ym, record, ledgerValue, shared, pool) {';
const s = src.indexOf(head), e = src.indexOf('\n        },', s);
if (s < 0 || e < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice qc._hydrate'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const httpErr = (status) => { const err = new Error('HTTP ' + status); err.status = status; return err; };

// ---- Jira: a set of issues that exist, some that are gone, some hidden ----
const ISSUES = {
    'EBR-1': { key: 'EBR-1', fields: { summary: 'crash on undock', status: { name: 'Closed' }, created: '2026-08-02', reporter: { displayName: 'Alice' } } },
    'EDR-2': { key: 'EDR-2', fields: { summary: 'warp bug', status: { name: 'Open' }, created: '2026-08-03', reporter: { displayName: 'Bob' } } },
    'EBR-3': { key: 'EBR-3', fields: { summary: 'market glitch', status: { name: 'Attached' }, created: '2026-08-04', reporter: null } }
};
let gone = {}, searches = [], gets = [], searchFails = null, getFails = null;
const L = {
    me: () => ({ handle: 'schogol' }),
    _search: (jql) => {
        searches.push(jql);
        if (searchFails) { return Promise.reject(searchFails); }
        const keys = /key in \(([^)]*)\)/.exec(jql)[1].split(', ');
        if (keys.some((k) => gone[k])) { return Promise.reject(httpErr(400)); }   // Jira: "An issue with key ... does not exist"
        return Promise.resolve(keys.map((k) => ISSUES[k]));
    },
    _get: (path) => {
        const key = decodeURIComponent(/\/issue\/([^?]+)\?/.exec(path)[1]);
        gets.push(key);
        if (getFails) { return Promise.reject(getFails); }
        if (gone[key]) { return Promise.reject(httpErr(gone[key])); }
        return Promise.resolve(ISSUES[key]);
    }
};
global.JiTA = { leadduty: L };
L.qc = eval('({' + src.slice(s, e) + '\n        }})');
const record = (keys) => ({ assign: { schogol: keys }, actors: {} });
const run = (keys, pool) => L.qc._hydrate('2026-08', record(keys), { done: {} }, true, pool || null);
const summaries = (res) => res.items.map((i) => i.key + ':' + i.summary).join(' | ');

(async () => {
    let res = await run(['EBR-1', 'EDR-2', 'EBR-3']);
    ok('a sample whose issues all exist is read in one search', searches.length === 1 && gets.length === 0 && res.items.length === 3, searches.length + ' ' + gets.length);
    ok('...each with its summary and kind', summaries(res) === 'EBR-1:crash on undock | EDR-2:warp bug | EBR-3:market glitch' && res.items[1].kind === 'defect', summaries(res));

    searches = []; gets = []; gone = { 'EDR-2': 404 };
    res = await run(['EBR-1', 'EDR-2', 'EBR-3']);
    ok('one deleted issue no longer fails the month: each key is read on its own instead', searches.length === 1 && gets.join() === 'EBR-1,EDR-2,EBR-3', gets.join());
    ok('...the deleted one shows as not found, the rest as usual',
        summaries(res) === 'EBR-1:crash on undock | EDR-2:(not found - moved or deleted) | EBR-3:market glitch', summaries(res));

    gets = []; gone = { 'EBR-3': 403, 'EDR-2': 404 };
    res = await run(['EBR-1', 'EDR-2', 'EBR-3']);
    ok('an issue out of reach (403) shows as not found too', /EBR-3:\(not found/.test(summaries(res)) && /EBR-1:crash/.test(summaries(res)), summaries(res));

    gone = {}; searchFails = httpErr(503);
    let err = null;
    try { await run(['EBR-1', 'EDR-2']); } catch (x) { err = x; }
    ok('a search that fails for another reason still fails the month, as before', !!err && err.status === 503, String(err && err.message));
    searchFails = null;

    gone = { 'EDR-2': 404 }; getFails = httpErr(502);
    err = null;
    try { await run(['EBR-1', 'EDR-2']); } catch (x) { err = x; }
    ok('a single read that fails with anything but 403 or 404 fails the month too: it is not "not found"', !!err && err.status === 502, String(err && err.message));
    getFails = null; gone = {};

    searches = []; gets = [];
    res = await run(['EBR-1', 'EDR-2'], { byKey: { 'EBR-1': { key: 'EBR-1', kind: 'report', summary: 'from the pool' } } });
    ok('keys the freshly fetched pool already holds are not asked for again', searches.length === 1 && /key in \(EDR-2\)/.test(searches[0]) && /EBR-1:from the pool/.test(summaries(res)), searches.join());

    // The fallback hinges on the real request helpers saying which status failed; the stubs above assume they do.
    const helper = (h) => { const i = src.indexOf(h), j = src.indexOf('\n    },', i); if (i < 0 || j < 0 || src.indexOf(h, i + 1) >= 0) { throw new Error('could not slice ' + h.slice(0, 40)); } return src.slice(i, j + 7); };
    global.$ = { ajax: () => { const x = { done() { return x; }, fail(f) { f({ status: 400, getResponseHeader: () => null }); return x; } }; return x; } };
    JiTA.HOST = 'https://x.atlassian.net'; JiTA.MAX_RETRIES = 0;
    const H = eval('({' + helper('    _apiPost: function (path, body) {') +
        helper("    _get: function (path) {\n        return new Promise(function (resolve, reject) {\n            $.ajax({ url: JiTA.HOST + path, dataType: 'json', headers: { 'Accept': 'application/json' } })") + '})');
    let e1 = null, e2 = null;
    try { await H._apiPost('/rest/api/3/search/jql', {}); } catch (x) { e1 = x; }
    try { await H._get('/rest/api/3/issue/EBR-1'); } catch (x) { e2 = x; }
    ok('the search and the single read both say which HTTP status failed', !!e1 && e1.status === 400 && !!e2 && e2.status === 400,
        (e1 && e1.status) + ' ' + (e2 && e2.status));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'QC hydrate checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((x) => { console.log('CRASH ' + (x && x.stack || x)); process.exit(2); });
