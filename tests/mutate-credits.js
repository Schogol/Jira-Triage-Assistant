// mutate-credits.js - breaks each ISD credits fix (v3.38.25), and what the Members tab takes from the credits count (v3.48.0:
// busy, the leased count, the progress hook, the old-way GM handoffs), and requires credits-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'credits-check.js';
const muts = [
    // ---- requests ----
    [H, 'a 5xx is not retried', '                    if ((resp.status === 429 || resp.status >= 500) && retries > 0) {\n                        var ra = parseInt(resp.headers.get(\'Retry-After\'), 10);\n                        again(',
        '                    if (resp.status === 429 && retries > 0) {\n                        var ra = parseInt(resp.headers.get(\'Retry-After\'), 10);\n                        again('],
    [H, 'a dropped connection is not retried', '                    if (retries > 0) { again((cfg.MAX_RETRIES - retries + 1) * 1000); return; }\n                    reject(e);', '                    reject(e);'],
    [H, 'Retry-After is ignored', 'again(resp.status === 429 ? (isNaN(ra) ? 5 : ra) * 1000 : (cfg.MAX_RETRIES - retries + 1) * 1000);', 'again(5000);'],
    [H, 'a 4xx is retried', '                    if ((resp.status === 429 || resp.status >= 500) && retries > 0) {\n                        var ra = parseInt(resp.headers.get(\'Retry-After\'), 10);\n                        again(',
        '                    if (!resp.ok && retries > 0) {\n                        var ra = parseInt(resp.headers.get(\'Retry-After\'), 10);\n                        again('],
    // ---- old-domain accounts ----
    [H, 'a handle is asked about by every member', 'function look(cand) { if (!lookups[cand]) { lookups[cand] = crReporterAccount(cand); } return lookups[cand]; }', 'function look(cand) { return crReporterAccount(cand); }'],
    [H, 'members are not taken in name order', "        var byName = members.slice().sort(function (a, b) {\n            var x = a.displayName || a.accountId || '', y = b.displayName || b.accountId || '';\n            return x < y ? -1 : (x > y ? 1 : 0);\n        });",
        '        var byName = members.slice();'],
    [H, 'a taken account is handed out again', '                var p = (hit && !taken[hit.cand]) ? Promise.resolve(hit) : firstFree(candsOf[k], hit ? hit.i + 1 : candsOf[k].length, taken);', '                var p = Promise.resolve(hit);'],
    [H, 'a member whose account was taken gets nothing', '                var p = (hit && !taken[hit.cand]) ? Promise.resolve(hit) : firstFree(candsOf[k], hit ? hit.i + 1 : candsOf[k].length, taken);',
        '                var p = (hit && !taken[hit.cand]) ? Promise.resolve(hit) : Promise.resolve(null);'],
    [H, 'a quote in a handle breaks the JQL', "        var q = String(value).replace(/[\\\\\"]/g, '\\\\$&');", '        var q = String(value);'],
    // ---- the tab ----
    [H, 'ties are numbered by position', '            ranks[i] = (i > 0 && real[i][8] === real[i - 1][8]) ? ranks[i - 1] : i + 1;', '            ranks[i] = i + 1;'],
    [H, 'members without credits count as with', '            if (real[i][8]) { withCredits++; }', '            withCredits++;'],
    [H, 'a scheduled run flashes "ready"', "                if (!quiet) { JiTA.credits._flash('Credits ' + res.ym", "                if (true) { JiTA.credits._flash('Credits ' + res.ym"],
    [H, 'a failed quiet run leaves its pill', '            else { JiTA.credits._clearProgress(); }   // a pill a manual Refresh made it draw would otherwise stay up\n', ''],
    [H, 'the badge drops "updating…"', "            var busy = JiTA.credits._updating ? ' · updating…' : '';", "            var busy = '';"],
    [H, 'the poll can start twice', '            if (S._timer || S._started) { return; }\n            S._started = true;', '            if (S._timer) { return; }'],
    [H, 'last month is never finished', "            if (gmGet(S.PREV_DONE_KEY, '') !== prev.ym && ", '            if (false && '],
    [H, 'last month is recomputed every poll', '                }).then(function () { gmSet(S.PREV_DONE_KEY, prev.ym); gmSet(S.FAIL_PREV_KEY, 0); end(); },', '                }).then(function () { gmSet(S.FAIL_PREV_KEY, 0); end(); },'],
    [H, 'a month already final is recomputed', "                    if (!res || String(res.computedAt || '') >= now.ym + '-01') { return; }", '                    if (!res) { return; }'],
    [H, 'Refresh flips the quiet flag over a running crawl', "            if (C.running) { JiTA.ui.toast('A credit computation is already running…'); return; }\n", ''],
    [H, 'a manual Refresh leaves the scheduler to repeat it', '                gmSet(C.sched.LAST_FULL_KEY, Date.now()); gmSet(C.sched.FAIL_FULL_KEY, 0);\n', ''],
    // ---- for the Members tab (v3.48.0) ----
    [H, 'the progress hook hears nothing', '        if (JiTA.credits.onProgress) { try { JiTA.credits.onProgress(msg); } catch (e) { /* ignore */ } }\n', ''],
    [H, 'a count in another tab is not busy', '!!(l && l.ts && (Date.now() - l.ts) <= S.FULL_TTL_MS && l.tabId !== JiTA.sched.tabId)', 'false'],
    [H, 'a stale lease is busy', '(Date.now() - l.ts) <= S.FULL_TTL_MS && l.tabId !== JiTA.sched.tabId', 'l.tabId !== JiTA.sched.tabId'],
    [H, 'this tab\'s own lease is busy', '(Date.now() - l.ts) <= S.FULL_TTL_MS && l.tabId !== JiTA.sched.tabId)', '(Date.now() - l.ts) <= S.FULL_TTL_MS)'],
    [H, 'this tab\'s running count is not busy', 'return JiTA.credits.running || !!(l && l.ts', 'return !!(l && l.ts'],
    [H, 'a leased count runs beside another tab\'s', 'if (C.running || !S._lease(S.FULL_LEASE_KEY, S.FULL_TTL_MS)) { return Promise.reject(busy()); }', 'if (C.running) { return Promise.reject(busy()); }'],
    [H, 'the lease is not given back', 'var end = function () { clearInterval(hb); S._release(S.FULL_LEASE_KEY); };', 'var end = function () { clearInterval(hb); };'],
    [H, 'a leased count is not quiet', '        C._quiet = true;\n        return C.refresh(y, m).then(function (res) {', '        return C.refresh(y, m).then(function (res) {'],
    [H, 'a leased count that found one running resolves empty', '            if (!res) { throw busy(); }   // refresh() found one running after all\n', ''],
    [H, 'a failed leased count keeps the lease', '        }, function (e) { end(); throw e; });\n    },\n    // GM handoffs made the old way', '        }, function (e) { throw e; });\n    },\n    // GM handoffs made the old way'],
    [H, 'the old-way GM count runs without the worker', "        if (!(JiTA.worker && JiTA.worker.usable())) { return Promise.reject(new Error('credits: worker unavailable')); }\n        var tag = (JiTA.sched.tabId) + ':' + (++C._tagSeq);\n        C._workerTag = tag;\n        return JiTA.worker.call('creditsGmOld'",
        "        var tag = (JiTA.sched.tabId) + ':' + (++C._tagSeq);\n        C._workerTag = tag;\n        return JiTA.worker.call('creditsGmOld'"],
    [H, 'the cut is not passed on', "JiTA.worker.call('creditsGmOld', { y: y, m: m, cut: cut, tag: tag }", "JiTA.worker.call('creditsGmOld', { y: y, m: m, tag: tag }"],
    [H, 'the old-way window is not cut', 'var cut = (payload.cut && payload.cut < b.end) ? payload.cut : b.end, byAcc = {};', 'var cut = b.end, byAcc = {};'],
    [H, 'a cut past its month reads past it', '(payload.cut && payload.cut < b.end) ? payload.cut : b.end', 'payload.cut || b.end'],
    [H, 'a month after the switch is searched', '        if (cut <= b.start) { return Promise.resolve({ ym: ym, cut: cut, byAcc: byAcc }); }\n', ''],
    [H, 'deactivated members are asked too', 'var accs = members.filter(function (x) { return x.active !== false; }).map(function (x) { return x.accountId; }).sort();\n            var keysOf',
        'var accs = members.map(function (x) { return x.accountId; }).sort();\n            var keysOf'],
    [H, 'the old way is not searched by the member\'s assignee changes', "' AND assignee CHANGED BY \"' + acc + '\" ' + win", "' AND assignee CHANGED ' + win"],
    [H, 'a Team change outside the window counts', 'day < start || day >= end) { continue; }', 'false) { continue; }'],
    [H, 'a Team change on the cut day counts', '|| day >= end) { continue; }', '|| day > end) { continue; }'],
    [H, 'another member\'s Team change counts', 'if (!h.author || h.author.accountId !== acc || day < start', 'if (!h.author || day < start'],
    [H, 'another team counts', "(isGmTeam(it.to) || /gamemasters/i.test(it.toString || ''))", 'true'],
    [H, 'the Team field is known by its id alone', "(it.field === 'Team' || it.fieldId === 'customfield_10001')", "it.fieldId === 'customfield_10001'"],
    [H, 'a member with none is listed', '                    if (c) { byAcc[acc] = c; }\n', '                    byAcc[acc] = c;\n'],
    [H, 'the same window asked twice counts twice', "var key = 'gmold:' + payload.y + '-' + payload.m + ':' + (payload.cut || ''), tag = payload.tag || null;\n        if (crLast && crLast.key === key) {",
        "var key = 'gmold:' + payload.y + '-' + payload.m + ':' + (payload.cut || ''), tag = payload.tag || null;\n        if (false) {"],
    [H, 'an old-way GM count runs alongside a count', '        var begin = function () { crActiveTags = run.tags; return crGmOld(payload); };\n        run.promise = prev.then(begin, begin);',
        '        var begin = function () { crActiveTags = run.tags; return crGmOld(payload); };\n        run.promise = begin();'],
    [H, 'the worker does not answer it', "            else if (type === 'creditsGmOld') { result = await runGmOld(payload); }   // the Members tab's old-way GM handoffs, queued like a count\n", '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutc.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutc.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutc.js')) { fs.unlinkSync('mutc.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
