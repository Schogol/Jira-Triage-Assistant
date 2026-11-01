// mutate-members.js - breaks each guard of the Lead duties Members tab (v3.48.0: every member's Total Actioned in each of
// the last 6 full months against ECAID's 40 a month, counted once for all Leads, roles and notes shared, published to its
// own page) in turn and requires members-check to go red. A crashed harness counts as red. A breakage may name the part of
// the file it is made in: [harness, name, anchor, replacement, [its first line, its end]], the anchor then once there.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const MB = 'members-check.js';
const R = (head) => ['\n    ' + head, '\n    },'];
const FROM = R('fromCredits: function (res) {'), DEF = R('defaultRole: function (name) {'), STATE = R('state: function (role, months) {'),
    MODEL = R('model: function (act, mem, live, cur) {'), APPLY = R('_apply: function (v, freezes, roster, me, now) {'),
    GATHER = R('gather: function () {'), COUNT = R('count: function (onStep, onMonth) {'), ONE = R('_countOne: function (ym, say) {'),
    CRAWL = R('_crawl: function (y, m, say) {'), ROLE = R('setRole: function (acc, role, name) {'), NOTE = R('setNote: function (acc, note) {'),
    PERSON = R('_person: function (acc, change) {'), PUB = R('publish: function (force) {'), CONTENT = R('_content: function (rows, act, rich) {'),
    TICK = ['\n    // The scheduler\'s part (leadduty.sched)', '\n    },'], ROW = R('_memberRow: function (r, wins, cur) {'),
    SETROLE = R('_setMemberRole: function (sel, r, role) {'), EDITNOTE = R('_editMemberNote: function (r, wins, cur) {');
const muts = [
    // ---- the months ----
    [MB, 'the window takes in the current month', 'for (var i = 0; i < L.members.MONTHS; i++) { cur = L._prevYm(cur); out.push(cur); }',
        'for (var i = 0; i < L.members.MONTHS; i++) { out.push(cur); cur = L._prevYm(cur); }'],
    [MB, 'a count made inside its month reads as final', "String(res.computedAt || '') >= JiTA.leadduty._bounds(ym).end", "String(res.computedAt || '') >= JiTA.leadduty._bounds(ym).start"],
    [MB, 'a cached count of another month reads as final', '!!(res && res.ym === ym && String(', '!!(res && String('],
    [MB, 'August is not cut at the switch', 'return b.end <= sw ? b.end : sw;', 'return b.end;'],
    [MB, 'a month after the switch gets a cut', '        if (b.start >= sw) { return null; }\n', ''],
    // ---- a credits result ----
    [MB, 'Total Actioned is not read from its column', "var col = (res.header || []).indexOf('Total Actioned');", 'var col = -1;'],
    [MB, 'resolved counts as actioned', '(r.attached || 0) + (r.trashed || 0) + (r.reassigned || 0) + (r.created || 0));',
        '(r.attached || 0) + (r.trashed || 0) + (r.reassigned || 0) + (r.created || 0) + (r.resolved || 0));'],
    [MB, 'a name with no account is listed', '            if (!acc) { return; }\n', '', FROM],
    // ---- roles and states ----
    [MB, 'a Lead\'s name gets Bug Hunter', "if (toks[i] && leads[toks[i]]) { return 'Lead'; }", "if (toks[i] && leads[toks[i]]) { return 'Bug Hunter'; }"],
    [MB, 'a hyphenated Lead name is missed', "String(name || '').toLowerCase().replace(/-/g, ' ')", "String(name || '').toLowerCase()", DEF],
    [MB, 'a 40 is below the minimum', "return last >= M.MIN_ACTIONED ? 'meets' : 'below';", "return last > M.MIN_ACTIONED ? 'meets' : 'below';"],
    [MB, 'one empty month is inactive', "if (empty === M.INACTIVE_MONTHS) { return 'inactive'; }", "if (empty >= 1) { return 'inactive'; }"],
    [MB, 'a month before joining counts as empty', 'if (months[i] === 0) { empty++; }', 'if (!months[i]) { empty++; }'],
    [MB, 'Leads and Seniors are judged', "if (!M.JUDGED[role] || last === undefined) { return ''; }", "if (last === undefined) { return ''; }"],
    [MB, 'a month not counted yet is judged', "if (!M.JUDGED[role] || last === undefined) { return ''; }", "if (!M.JUDGED[role]) { return ''; }"],
    [MB, 'a member new last month is not new', "        if (last === null) { return 'new'; }\n", '', STATE],
    // ---- the rows ----
    [MB, 'the rows are not ranked by role', '            if (rx !== ry) { return rx - ry; }\n', '', MODEL],
    [MB, '"ISD " is sorted on', "return r.name.replace(/^isd\\s+/i, '').toLowerCase();", 'return r.name.toLowerCase();'],
    [MB, 'a stored role that is not one of the four is used', 'var set = !!(p.role && M.ROLES.indexOf(p.role) >= 0)', 'var set = !!p.role'],
    [MB, 'a member not counted in a frozen month shows 0', '? a[acc][ym] : null) : undefined;', '? a[acc][ym] : 0) : undefined;'],
    [MB, 'a member missing from this month\'s count shows 0', 'var now = lv ? (lv.counts[acc] != null ? lv.counts[acc] : null) : undefined', 'var now = lv ? (lv.counts[acc] || 0) : undefined'],
    [MB, 'another month\'s count is taken for this one', 'var lv = (live && live.ym === cur) ? M.fromCredits(live) : null', 'var lv = live ? M.fromCredits(live) : null'],
    [MB, 'Last active ignores this month', "last = now > 0 ? cur : '';", "last = '';"],
    [MB, 'the roster is not listed', '        Object.keys(roster).forEach(function (k) { accs[k] = true; });\n', '', MODEL],
    [MB, 'someone only in this month\'s count is not listed', '        if (lv) { Object.keys(lv.names).forEach(function (k) { accs[k] = true; }); }\n', '', MODEL],
    // ---- recording ----
    [MB, 'a month recorded is recorded again', 'if (!f || v.frozen[ym]) { return; }', 'if (!f) { return; }'],
    [MB, 'a late month is not marked', "            if (Date.parse(f.at) - Date.parse(L._bounds(ym).end + 'T00:00:00Z') > M.LATE_DAYS * 86400000) { rec.late = true; }\n", '', APPLY],
    [MB, 'a month counted on time is marked late', '> M.LATE_DAYS * 86400000) { rec.late = true; }', '> 0) { rec.late = true; }'],
    [MB, 'a zero GM count is stored', 'if (f.gm[acc]) { (v.g[acc] = v.g[acc] || {})[ym] = f.gm[acc]; }', '(v.g[acc] = v.g[acc] || {})[ym] = f.gm[acc];'],
    [MB, 'the claim stays after its month is recorded', '            delete v.crawl[ym];\n            changed = true;\n', '            changed = true;\n', APPLY],
    [MB, 'an older count replaces the roster', "(!v.roster || String(roster.at) > String(v.roster.at || ''))", 'true'],
    [MB, 'a roster naming the same people is written again', 'names(roster.names) !== names(v.roster && v.roster.n)', 'true'],
    [MB, 'a stale claim is kept', '            if (!c || !(now - Date.parse(c.at) < M.CLAIM_MS)) { delete v.crawl[ym]; changed = true; }\n', '', APPLY],
    [MB, 'a fresh claim is dropped', 'if (!c || !(now - Date.parse(c.at) < M.CLAIM_MS)) {', 'if (true) {', APPLY],
    [MB, 'a month that left the window stays', '            if (keep[ym]) { return; }\n', '            return;\n', APPLY],
    [MB, '...with its counts', '                    delete map[acc][ym];\n', '', APPLY],
    [MB, 'an account left with no month stays', '                    if (!Object.keys(map[acc]).length) { delete map[acc]; }\n', '', APPLY],
    [MB, 'nothing changed is written anyway', '        return changed ? v : null;', '        return v;', APPLY],
    [MB, 'a write that changed something does not republish', 'if (w && w.written) { setTimeout(function () { JiTA.leadduty.members.publish(false)',
        'if (false) { setTimeout(function () { JiTA.leadduty.members.publish(false)'],
    [MB, 'a write that changed nothing republishes', 'if (w && w.written) { setTimeout(function () { JiTA.leadduty.members.publish(false)',
        'if (w) { setTimeout(function () { JiTA.leadduty.members.publish(false)'],
    // ---- gather ----
    [MB, 'a non-Lead can read the members', '        if (!L.isLead()) { return Promise.reject(M._notLead()); }\n', '', GATHER],
    [MB, 'two reads at once read twice', '        if (M._gather) { return M._gather; }\n', '', GATHER],
    [MB, 'a month before the switch is recorded from the cache', 'if (ym && !M.gmCut(ym) && M.isFinal(res, ym))', 'if (ym && M.isFinal(res, ym))'],
    [MB, 'an unfinished month is recorded from the cache', 'if (ym && !M.gmCut(ym) && M.isFinal(res, ym))', 'if (ym && !M.gmCut(ym) && res && res.table)'],
    [MB, 'the roster comes from the oldest count', "String(res.computedAt || '') > String(newest.computedAt || '')", "String(res.computedAt || '') < String(newest.computedAt || '')"],
    [MB, 'the months counted are still missing', 'missing: wins.filter(function (ym) { return !frozen[ym]; })', 'missing: wins.slice()'],
    // ---- Count ----
    [MB, 'a non-Lead can count', '        if (!L.isLead()) { return Promise.reject(M._notLead()); }\n', '', COUNT],
    [MB, 'two Counts run twice', '        if (M._count) { return M._count; }\n', '', COUNT],
    [MB, 'Count runs without the worker', 'if (!(JiTA.worker && JiTA.worker.usable())) {', 'if (false) {', COUNT],
    [MB, 'the oldest month is counted first', 'var todo = M.window(L._ym()).filter(', 'var todo = M.window(L._ym()).reverse().filter('],
    [MB, 'a month another Lead is counting is counted too', '!(c && c.tab !== JiTA.sched.tabId && now - Date.parse(c.at) < M.CLAIM_MS)', 'true'],
    [MB, 'another Lead\'s stale claim still holds its month', 'now - Date.parse(c.at) < M.CLAIM_MS);', 'true);', COUNT],
    [MB, 'a month is tried again in the same run', 'return !frozen[ym] && !tried[ym] && !(c', 'return !frozen[ym] && !(c'],
    [MB, 'the progress is not heard', '        C.onProgress = say;\n', '', COUNT],
    [MB, 'the credits progress hook is not given back', 'var end = function () { C.onProgress = hook; if (M._count === p)', 'var end = function () { if (M._count === p)'],
    [MB, 'a month recorded is not told', 'if (recorded) { try { if (onMonth) { onMonth(todo[0]); } } catch (e) { /* ignore */ } }', ''],
    [MB, 'a month being counted is not claimed', '            v.crawl[ym] = { by: me, tab: tab, at: new Date().toISOString() };\n', '', ONE],
    [MB, 'a month recorded meanwhile is counted again', 'if (w.value && w.value.frozen && w.value.frozen[ym]) { return false; }', ''],
    [MB, 'the old-way GM handoffs are never counted', 'if (!cut) { return { res: res, gm: {} }; }', 'return { res: res, gm: {} };'],
    [MB, 'the old-way GM handoffs are asked for after the switch too', 'if (!cut) { return { res: res, gm: {} }; }', ''],
    [MB, 'the GM handoffs are not added to the count', '{ fc.counts[acc] += out.gm[acc]; gm[acc] = out.gm[acc]; }', '{ gm[acc] = out.gm[acc]; }'],
    [MB, 'GM handoffs of someone not in the group that month count', 'if (fc.counts[acc] != null && out.gm[acc]) {', 'if (out.gm[acc]) {'],
    [MB, 'a failed count keeps its claim', '                    delete v.crawl[ym];\n                    return v;\n', '                    return v;\n', ONE],
    [MB, 'a failed count takes another Lead\'s claim', '!v.crawl[ym] || v.crawl[ym].tab !== tab) { return null; }', '!v.crawl[ym]) { return null; }'],
    [MB, 'a failed count is not reported', '.then(function () { throw e; }, function () { throw e; });', '.then(function () { return false; }, function () { return false; });'],
    [MB, 'a month whose GM handoffs cannot be counted is recorded without them',
        'return C.computeGmOld(p.y, p.m, cut).then(function (g) { return { res: res, gm: (g && g.byAcc) || {} }; });',
        'return C.computeGmOld(p.y, p.m, cut).then(function (g) { return { res: res, gm: (g && g.byAcc) || {} }; }, function () { return { res: res, gm: {} }; });'],
    [MB, 'a count does not wait for a running one', '            if (C.busy()) { return wait(); }\n', '', CRAWL],
    [MB, 'a lease lost to another tab is not waited out', 'if (e && e.busy) { return wait(); } throw e;', 'throw e;'],
    [MB, 'a count waits for ever', 'if (Date.now() - t0 > M.BUSY_MAX_MS) {', 'if (false) {'],
    // ---- roles and notes ----
    [MB, 'a non-Lead can set a role', '        if (!L.isLead()) { return Promise.reject(M._notLead()); }\n', '', ROLE],
    [MB, 'an unknown role is stored', "        if (M.ROLES.indexOf(role) < 0) { return Promise.reject(new Error('Unknown role: ' + role)); }\n", '', ROLE],
    [MB, 'the default role is stored', "var want = role === M.defaultRole(name) ? '' : role;", 'var want = role;'],
    [MB, 'the same role is written again', "            if ((e.role || '') === want) { return false; }\n", '', ROLE],
    [MB, 'a non-Lead can set a note', '        if (!L.isLead()) { return Promise.reject(M._notLead()); }\n', '', NOTE],
    [MB, 'a note is stored as typed', 'var want = L._note(note);', "var want = String(note || '');"],
    [MB, 'the same note is written again', "            if ((e.note || '') === want) { return false; }\n", '', NOTE],
    [MB, 'an entry with nothing left is kept', '            if (!e.role && !e.note) { delete v.m[acc]; return v; }\n', '', PERSON],
    [MB, 'who set it is not stored', '            e.by = M._meName();\n', '', PERSON],
    [MB, 'when it was set is not stored', '            e.at = M._today();\n', '', PERSON],
    // ---- the page ----
    [MB, 'a non-Lead can publish', "        if (!L.isLead()) { return Promise.resolve({ skipped: 'not a Lead' }); }\n", '', PUB],
    [MB, 'a dry run publishes', "        if (L._dry()) { return Promise.resolve({ skipped: 'dry run' }); }\n", '', PUB],
    [MB, 'with no members page set it publishes anyway', "        if (!page) { return Promise.resolve({ skipped: 'no members page is set' }); }\n", '', PUB],
    [MB, 'the ledger page is written as the members page', "        if (page === String(L.ledgerPage())) { return Promise.resolve({ skipped: 'the members page is the ledger page' }); }\n", '', PUB],
    [MB, 'two publishes at once both write', "        if (M._pubBusy && (Date.now() - M._pubAt) < M.PUB_BUSY_MAX_MS) { M._pubAgain = true; return Promise.resolve({ skipped: 'already publishing' }); }\n", '', PUB],
    [MB, 'a publish asked for while one runs is dropped', 'var rerun = function () { if (M._pubAgain) { M._pubAgain = false; M._tap({ written: true }); } };', 'var rerun = function () { M._pubAgain = false; };'],
    [MB, 'a publish that hung blocks every later one', '(Date.now() - M._pubAt) < M.PUB_BUSY_MAX_MS', 'true', PUB],
    [MB, 'a failed publish leaves it busy', 'var fail = function (e) { M._pubBusy = false;', 'var fail = function (e) {'],
    [MB, 'a failed publish is not said', "var fail = function (e) { M._pubBusy = false; M._last = { at: Date.now(), error: String(e && e.message || e) };", 'var fail = function (e) { M._pubBusy = false;'],
    [MB, 'with no month counted it publishes an empty page', "            if (!act || !act.frozen || !Object.keys(act.frozen).length) { return { skipped: 'no month counted yet' }; }\n", '', PUB],
    [MB, 'an unchanged page is written again', "            if (!force && pub && pub.hash === hash) { return { skipped: 'unchanged' }; }\n", '', PUB],
    [MB, 'a forced publish is skipped as unchanged', 'if (!force && pub && pub.hash === hash)', 'if (pub && pub.hash === hash)'],
    [MB, 'an older build overwrites a newer one\'s page', 'JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, pub.v) < 0', 'JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, pub.v) < -1', PUB],
    [MB, 'the same build is refused too', 'JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, pub.v) < 0', 'JiTA.worker._verCmp(JiTA.SCRIPT_VERSION, pub.v) <= 0', PUB],
    [MB, 'the publishing build is not recorded', "v.pub = { hash: hash, v: JiTA.SCRIPT_VERSION || '',", "v.pub = { hash: hash, v: '',"],
    [MB, 'a page refused in colour is not written plain', 'if (M._plain || !e || e.status !== 400) { throw e; }', 'throw e;'],
    [MB, 'any failure is retried plain', 'if (M._plain || !e || e.status !== 400) { throw e; }', 'if (M._plain || !e) { throw e; }'],
    [MB, 'the plain page carries the colours', '                body = M._content(rows, act, false);\n', '                body = M._content(rows, act, true);\n', PUB],
    [MB, 'the plain page\'s hash is not kept', '                hash = JiTA.util.hash(body);\n', '', PUB],
    [MB, 'plain is not kept in the ledger', '                    if (M._plain) { v.pub.plain = true; }\n', '', PUB],
    [MB, 'the ledger\'s plain mark is not heeded', '            if (pub && pub.plain) { M._plain = true; }\n', '', PUB],
    [MB, 'the page is written to the ledger page', "return L.report._write(M._stamp() + '\\n' + body, false, page).catch(", "return L.report._write(M._stamp() + '\\n' + body, false).catch("],
    [MB, 'the GM rule is not footnoted', "(gm ? ('<p>* includes GM handoffs", "(false ? ('<p>* includes GM handoffs"],
    [MB, 'a late month is not footnoted', "(late.length ? ('<p>Counted late: '", "(false ? ('<p>Counted late: '"],
    [MB, 'the rows are not tinted', 'tints.push(rich ? (M.TINT[r.state] || null) : null);', 'tints.push(null);'],
    [MB, 'the plain page is tinted', 'tints.push(rich ? (M.TINT[r.state] || null) : null);', 'tints.push(M.TINT[r.state] || null);'],
    [MB, 'a Lead\'s low month is coloured on the page', 'var ink = (rich && judged && n < M.MIN_ACTIONED)', 'var ink = (rich && n < M.MIN_ACTIONED)'],
    [MB, 'a 40 is coloured on the page', 'var ink = (rich && judged && n < M.MIN_ACTIONED)', 'var ink = (rich && judged && n <= M.MIN_ACTIONED)'],
    [MB, 'a 0 is not red on the page', '(n === 0 ? M.INK.zero : M.INK.low)', 'M.INK.low'],
    [MB, 'a note is not escaped', 'cells = [R._txt(r.role), R._txt(r.name), R._lines(r.note)]', 'cells = [R._txt(r.role), R._txt(r.name), r.note]'],
    [MB, 'a name is not escaped', 'R._txt(r.name), R._lines(r.note)]', 'r.name, R._lines(r.note)]'],
    [MB, 'the State is not a lozenge', '            cells.push(lozenge(r.state));\n', '            cells.push(R._txt(r.state));\n', CONTENT],
    [MB, 'a month with GM handoffs is not starred', "R._txt(String(n) + (r.gm[i] ? '*' : ''))", 'R._txt(String(n))'],
    [MB, 'a month before joining is blank on the page', "                if (n === null) { cells.push('-'); return; }\n", "                if (n === null) { cells.push(''); return; }\n", CONTENT],
    // ---- the scheduler and the wiki pool ----
    [MB, 'a non-Lead\'s scheduler ticks the members', '        if (!L.isLead()) { return Promise.resolve(null); }\n', '', TICK],
    [MB, 'the tick does not publish', 'return M.gather().then(function () { return M.publish(false); });', 'return M.gather();'],
    [MB, 'the wiki review assigns the members page', 'if (ex[cur] || (members && cur === members)) { return true; }', 'if (ex[cur]) { return true; }'],
    // ---- the tab ----
    [MB, 'the tab never loads its members', "        else if (U._tab === 'members') { U._loadMembers(force); }\n", ''],
    [MB, 'the filter leaves everyone', "return !U._memQuiet || r.state === 'below' || r.state === 'inactive';", 'return true;'],
    [MB, 'the filter leaves the inactive out', "return !U._memQuiet || r.state === 'below' || r.state === 'inactive';", "return !U._memQuiet || r.state === 'below';"],
    [MB, 'Count is clickable without the worker', ".prop('disabled', !worker || !!M._count)", ".prop('disabled', !!M._count)"],
    [MB, 'a role picked draws the list again at the top', '            U._renderMembers(true);\n        }, function (e) {', '            U._renderMembers(false);\n        }, function (e) {', SETROLE],
    [MB, 'a role picked is not taken into the list', '            if (v && U._mem) { U._mem.mem = v; }\n            U._renderMembers(true);', '            U._renderMembers(true);', SETROLE],
    [MB, 'a note saved draws nothing again', '                if (fresh) { U._swapRow(r.acc, U._memberRow(fresh, wins, cur)); }\n', '', EDITNOTE],
    [MB, 'the note dialog opens empty', 'draft: draft, value: r.note }', 'draft: draft }'],
    [MB, 'a note saved stays a draft', '                delete U._drafts[draft];\n', '', EDITNOTE],
    [MB, 'a Lead\'s low month is marked in the tab', "if (judged && n < M.MIN_ACTIONED) { $c.addClass(n === 0 ? 'zero' : 'low'); }", "if (n < M.MIN_ACTIONED) { $c.addClass(n === 0 ? 'zero' : 'low'); }"],
    [MB, 'a 40 is marked in the tab', 'if (judged && n < M.MIN_ACTIONED) { $c.addClass(', 'if (judged && n <= M.MIN_ACTIONED) { $c.addClass('],
    [MB, 'a 0 is not red in the tab', "$c.addClass(n === 0 ? 'zero' : 'low');", "$c.addClass('low');"],
    [MB, 'this month so far does not say how many to go', "(', ' + (M.MIN_ACTIONED - r.cur) + ' to go for the ' + M.MIN_ACTIONED)", "''"],
    [MB, 'a month before joining shows as 0', "if (n === null) { $c.text('-').addClass('dim')", "if (n === null) { $c.text('0').addClass('dim')", ROW],
    [MB, 'the state dot does not say why', ".addClass(r.state || 'none').attr('title', M.stateText(r, wins))", ".addClass(r.state || 'none')"],
    [MB, 'a month with GM handoffs does not say so', "(r.gm[i] ? ('\\nincl. ' + r.gm[i] + ' handed to the GMs the old way') : '')", "''"],
    [MB, 'Count does not fill the table as each month lands', 'M.count(say, reload).then(', 'M.count(say).then('],
    [MB, 'a Count that stops does not say why', "U._memProg = 'Counting stopped: ' + (e && e.message || e);", "U._memProg = '';"]
];
function within(fn) {
    if (!fn) { return [0, src.length]; }
    const s = src.indexOf(fn[0]);
    if (s < 0 || src.indexOf(fn[0], s + 1) >= 0) { return null; }
    const e = src.indexOf(fn[1], s + fn[0].length);
    return e < 0 ? null : [s, e];
}
let allRed = true;
muts.forEach(([h, name, a, b, fn]) => {
    const at = within(fn), part = at ? src.slice(at[0], at[1]) : '';
    if (!at || part.split(a).length !== 2) { console.log('ANCHOR ' + (at ? part.split(a).length - 1 : 'no part') + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutmb.js', src.slice(0, at[0]) + part.replace(a, () => b) + src.slice(at[1]));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutmb.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutmb.js')) { fs.unlinkSync('mutmb.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
