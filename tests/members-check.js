// members-check.js - the Lead duties Members tab (v3.48.0): every ISD member with what they actioned in each of the last 6
// full months (the ISD credits leaderboard's Total Actioned, GM handoffs made the old way added before the switch) and this
// month so far, against ECAID's 40 a month, with a role and a note every Lead shares, published to its own Confluence page.
// Evals the real JiTA.conf, JiTA.leadduty, JiTA.leadduty.members and JiTA.leadduty.ui against a stubbed Confluence (an
// in-memory property store and page), stubbed credits caches and counts, and a fake jQuery big enough for the tab. Time is
// held at 1 Nov 2026, so the window (May to Oct 2026) and the GM switch (21 Aug 2026) stay where the checks expect them.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const em = '\n    _noop: null\n};';
const ls = src.indexOf('JiTA.leadduty = {'), le = src.indexOf(em, ls);
const ms = src.indexOf('JiTA.leadduty.members = {'), me = src.indexOf(em, ms);
const us = src.indexOf('JiTA.leadduty.ui = {'), ue = src.indexOf('\n};', src.indexOf('_injectCss: function ()', us)) + 3;
if ([cs, ce, ls, le, ms, me, us].some((x) => x < 0)) { throw new Error('could not slice JiTA.conf / JiTA.leadduty / members / ui'); }
const member = (head) => { const s = src.indexOf(head); if (s < 0) { throw new Error('could not slice ' + head); } return src.slice(s, src.indexOf('\n    },', s) + 7); };

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const J = (x) => JSON.stringify(x);
const clone = (v) => JSON.parse(JSON.stringify(v));
const settle = async (n) => { for (let i = 0; i < (n || 30); i++) { await new Promise((r) => setImmediate(r)); } };
const later = async () => { await new Promise((r) => setTimeout(r, 5)); await settle(); };   // past a setTimeout(0), such as the publish a write asks for

// ---- time: 1 Nov 2026, 12:00 UTC ----
const NOW = Date.parse('2026-11-01T12:00:00Z');
const realNow = Date.now;
Date.now = () => NOW;

// ---- a fake jQuery: plain objects with classes, attributes, properties, text, children and handlers ----
function N(html) {
    const m = /class="([^"]*)"/.exec(html || ''), idm = /id="([^"]*)"/.exec(html || ''), tag = (/^<(\w+)/.exec(html || '') || [])[1] || '';
    const n = { html: html || '', tag: tag, id: idm ? idm[1] : '', cls: m ? m[1].split(/\s+/).filter(Boolean) : [], attrs: {}, props: {}, kids: [], handlers: {},
        _text: '', parent: null, _scroll: 0, length: 1, value: '' };
    if (/^<label/.test(html || '') && /type="checkbox"/.test(html)) { n.kids.push(Object.assign(N('<input type="checkbox">'), { parent: n })); }
    n.addClass = (c) => { String(c || '').split(/\s+/).filter(Boolean).forEach((x) => { if (n.cls.indexOf(x) < 0) { n.cls.push(x); } }); return n; };
    n.removeClass = (c) => { n.cls = n.cls.filter((x) => x !== c); return n; };
    n.toggleClass = (c, on) => (on ? n.addClass(c) : n.removeClass(c));
    n.hasClass = (c) => n.cls.indexOf(c) >= 0;
    n.attr = (k, v) => { if (v === undefined) { return n.attrs[k]; } n.attrs[k] = v; return n; };
    n.getAttribute = (k) => (n.attrs[k] == null ? null : String(n.attrs[k]));
    n.prop = (k, v) => { if (v === undefined) { return n.props[k]; } n.props[k] = v; if (k === 'checked') { n.checked = v; } return n; };
    n.text = (t) => { if (t === undefined) { return n._text + n.kids.map((k) => (k.text ? k.text() : k.data || '')).join(''); } n._text = String(t); n.kids = n.kids.filter((k) => k.tag); return n; };
    n.append = (c) => { if (c && typeof c === 'object') { c.parent = n; n.kids.push(c); } return n; };
    n.appendTo = (p) => { p.append(n); return n; };
    n.on = (ev, fn) => { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return n; };
    n.fire = (ev) => (n.handlers[ev] || []).forEach((fn) => fn.call(n, { preventDefault() {}, stopPropagation() {} }));
    n.empty = () => { n.kids = []; n._scroll = 0; return n; };
    n.scrollTop = (v) => { if (v === undefined) { return n._scroll; } n._scroll = v; return n; };
    n.val = (v) => { if (v === undefined) { return n.value; } n.value = v; return n; };
    n.find = (sel) => W(all(n).slice(1).filter((k) => match(k, sel)));
    n.children = (sel) => W(n.kids.filter((k) => match(k, sel)));
    n.replaceWith = (f) => { const p = n.parent, i = p.kids.indexOf(n); p.kids[i] = f; f.parent = p; n.parent = null; return n; };
    n.css = () => n; n.hide = () => n; n.show = () => n;
    return n;
}
function match(k, sel) { if (!k.tag) { return false; } if (sel === 'input') { return k.tag === 'input'; } if (sel.charAt(0) === '.') { return k.cls.indexOf(sel.slice(1)) >= 0; } return false; }
function all(n) { const out = [n]; (n.kids || []).forEach((k) => { if (k.tag) { all(k).forEach((d) => out.push(d)); } }); return out; }
function W(list) {
    return { length: list.length, filter(fn) { return W(list.filter((el) => fn.call(el))); }, first() { return W(list.slice(0, 1)); },
        each(fn) { list.forEach((el, i) => fn.call(el, i, el)); return this; }, text() { return this; }, toggleClass() { return this; },
        prop(k, v) { if (v === undefined) { return list[0] ? list[0].prop(k) : undefined; } list.forEach((el) => el.prop(k, v)); return this; },
        on(ev, fn) { list.forEach((el) => el.on(ev, fn)); return this; },
        replaceWith(f) { list.forEach((el) => el.replaceWith(f)); return this; } };
}
const body = N('<div class="ld-scroll" id="ld-body"></div>');
global.$ = (x) => {
    if (x && typeof x === 'object') { return x; }
    if (typeof x !== 'string') { return W([]); }
    if (x.charAt(0) === '<') { return N(x); }
    if (x === '#ld-body') { return body; }
    return W([]);
};
const status = { textContent: '' };
global.document = {
    querySelector: (s) => (s === '#jita-menu.jita-leadduty-view' ? {} : null),
    getElementById: (id) => (id === 'ld-status' ? status : (all(body).filter((k) => k.id === id)[0] || null)),
    createTextNode: (t) => ({ data: t })
};
global.confirm = () => true;
global.GM_addStyle = () => {};
global.window = {};

// ---- GM storage, the meta store, credits, the Confluence property store and page ----
const gm = { leadDutyMe: { accountId: 'acc-me', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true } };
global.gmGet = (k, d) => (k in gm ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
const caches = {};
let busyFor = 0, refreshed = [], gmAsked = [], refreshFail = null, gmFail = null, onRefresh = null, workerUp = true, leaseLost = 0;
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5, SCRIPT_VERSION: '3.48.0',
    sched: { tabId: 'tab-me' },
    dlog: () => {}, link: {}, sync: {}, util: {},
    worker: { usable: () => workerUp },
    ui: { _tipKey: null, _hideTip: () => {}, _showTip: () => {} },
    db: { getMeta: () => Promise.resolve(null), setMeta: () => Promise.resolve() },
    credits: {
        LEADS: { schogol: true, solnichka: true, lookuptable: true }, onProgress: null,
        getCached: (ym) => Promise.resolve(caches[ym] ? clone(caches[ym]) : null),
        busy: () => { if (busyFor > 0) { busyFor--; return true; } return false; },
        refreshLeased: (y, m) => {
            const ym = y + '-' + (m < 10 ? '0' : '') + m;
            // another tab took the full-crawl lease between busy() and here
            if (leaseLost > 0) { leaseLost--; return Promise.reject(Object.assign(new Error('An ISD credits count is already running'), { busy: true })); }
            refreshed.push(ym);
            if (refreshed.length > 60) { return Promise.reject(new Error('runaway count')); }   // a count that never stops fails fast
            if (JiTA.credits.onProgress) { JiTA.credits.onProgress(ym + ': reports attached…'); }
            if (onRefresh) { onRefresh(ym); }
            if (refreshFail) { const e = refreshFail; refreshFail = null; return Promise.reject(e); }
            return Promise.resolve(clone(caches['crawl:' + ym] || caches[ym]));
        },
        computeGmOld: (y, m, cut) => {
            const ym = y + '-' + (m < 10 ? '0' : '') + m;
            gmAsked.push(ym + '<' + cut);
            if (gmFail) { const e = gmFail; gmFail = null; return Promise.reject(e); }
            return Promise.resolve({ ym: ym, cut: cut, byAcc: clone(caches['gm:' + ym] || {}) });
        }
    }
};
Object.assign(JiTA.util, eval('({' + member('    hash: function (str) {') + '})'));
JiTA.worker._verCmp = eval('(' + member('    _verCmp: function (a, b) {').replace(/^\s*_verCmp: /, '').replace(/,\s*$/, '') + ')');
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
eval(src.slice(ms, me + em.length));
eval(src.slice(us, ue));
const L = JiTA.leadduty, M = L.members, U = L.ui;
const realYm = L._ym;
L._ym = (d) => realYm(d || new Date(Date.now()));
M.BUSY_POLL_MS = 1;
L.reminder = { mount: () => {} };
L.report.schedule = () => {};

const props = {};
let failNext = false, saves = [];
let onRead = null;   // hears each property read before it is answered, so a check can change the ledger between two reads
JiTA.conf.getProperty = (p, key) => { if (onRead) { onRead(key); } return Promise.resolve(props[key] ? clone(props[key]) : null); };
JiTA.conf.saveProperty = (p, key, value, prop) => {
    if (failNext) { failNext = false; return Promise.reject(Object.assign(new Error('HTTP 500'), { status: 500 })); }
    saves.push(key);
    props[key] = { id: key, key: key, value: clone(value), version: (prop ? prop.version : 0) + 1 };
    return Promise.resolve(clone(props[key]));
};
let pages = {}, pageWrites = [], refuseRich = false, failPage = null;
JiTA.conf.getPage = (id) => Promise.resolve({ id: id, title: 'page ' + id, version: (pages[id] && pages[id].version) || 1, status: 'current' });
JiTA.conf.savePageBody = (page, html) => {
    if (failPage) { const e = failPage; failPage = null; return Promise.reject(e); }
    if (refuseRich && /data-highlight-colour|style="color/.test(html)) { return Promise.reject(Object.assign(new Error('HTTP 400'), { status: 400 })); }
    pageWrites.push({ id: page.id, html: html });
    pages[page.id] = { version: page.version + 1, html: html };
    return Promise.resolve({ id: page.id, version: page.version + 1 });
};

// ---- credits results, as the worker's crComputeMonth builds them ----
const HEADER = ['Name', 'Defects Created', 'Defects Resolved', 'Reports Attached', 'Reports Trashed', 'Reports Reassigned', 'Total Actioned', 'Extra Credits', 'Credits Earned'];
function result(ym, at, people) {   // people: [[name, acc, total]]
    const table = people.map((p) => [p[0], 0, 0, p[2], 0, 0, p[2], 0, 0]), nameToAcc = {}, rows = {};
    people.forEach((p) => { nameToAcc[p[0]] = p[1]; rows[p[0]] = { created: 0, resolved: 0, attached: p[2], trashed: 0, reassigned: 0 }; });
    table.push(['Total', 0, 0, 0, 0, 0, people.reduce((s, p) => s + p[2], 0), 0, 0]);
    return { ym: ym, computedAt: at, header: HEADER, table: table, rows: rows, nameToAcc: nameToAcc, memberAccounts: {} };
}
const PEOPLE = (n) => [['ISD BH Schogol', 'acc-me', 12], ['ISD Distillery', 'acc-dist', 55], ['ISD Astaris', 'acc-ast', n], ['ISD Byteghost', 'acc-byte', 0]];

(async () => {
    // ================= the months =================
    ok('the window: the 6 full months before November, newest first', J(M.window('2026-11')) === J(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']), J(M.window('2026-11')));
    ok('...across a new year too', J(M.window('2027-02').slice(0, 3)) === J(['2027-01', '2026-12', '2026-11']));
    ok('a cached count is final once computed on or after the first day after its month', M.isFinal({ ym: '2026-10', computedAt: '2026-11-01T00:10:00.000Z' }, '2026-10') &&
        !M.isFinal({ ym: '2026-10', computedAt: '2026-10-31T23:59:00.000Z' }, '2026-10') && !M.isFinal({ ym: '2026-09', computedAt: '2026-11-01T00:10:00.000Z' }, '2026-10') && !M.isFinal(null, '2026-10'));
    ok('the GM switch cuts August at the 21st, a month before it at its end, and leaves the months after it alone', M.gmCut('2026-08') === '2026-08-21' &&
        M.gmCut('2026-07') === '2026-08-01' && M.gmCut('2026-05') === '2026-06-01' && M.gmCut('2026-09') === null && M.gmCut('2026-10') === null);

    // ================= a credits result =================
    let fc = M.fromCredits(result('2026-10', 'x', PEOPLE(23)));
    ok('a credits result gives each account its Total Actioned and its name, the Total row left out', J(fc.counts) === J({ 'acc-me': 12, 'acc-dist': 55, 'acc-ast': 23, 'acc-byte': 0 }) &&
        fc.names['acc-dist'] === 'ISD Distillery' && !('Total' in fc.names), J(fc));
    const odd = result('2026-10', 'x', PEOPLE(23));
    odd.table[1][6] = 99;   // the leaderboard's own column, not its parts added up
    odd.nameToAcc['Nobody'] = undefined; odd.table.splice(0, 0, ['Nobody', 0, 0, 5, 0, 0, 5, 0, 0]);
    fc = M.fromCredits(odd);
    ok('...Total Actioned read from the leaderboard\'s own column, and a name with no account skipped', fc.counts['acc-dist'] === 99 && !('undefined' in fc.counts) && Object.keys(fc.counts).length === 4, J(fc.counts));
    const noCol = result('2026-10', 'x', [['ISD Distillery', 'acc-dist', 7]]);
    noCol.header = HEADER.filter((h) => h !== 'Total Actioned'); noCol.rows['ISD Distillery'] = { created: 2, attached: 3, trashed: 1, reassigned: 1, resolved: 9 };
    ok('...and without that column, attached, trashed, reassigned and created added up (resolved is not actioned)', M.fromCredits(noCol).counts['acc-dist'] === 7, J(M.fromCredits(noCol)));

    // ================= roles, states and the rows =================
    ok('the default role: Lead for a name with a Lead\'s word in it, whatever its prefix, else Bug Hunter', M.defaultRole('ISD BH Schogol') === 'Lead' && M.defaultRole('ISD Lookuptable') === 'Lead' &&
        M.defaultRole('ISD Solnichka-Two') === 'Lead' && M.defaultRole('ISD Distillery') === 'Bug Hunter' && M.defaultRole('ISD BH Bootloader') === 'Bug Hunter');
    const st = (role, months) => M.state(role, months);
    ok('a Bug Hunter with 40 last month meets the minimum; with 39, or none, is below it', st('Bug Hunter', [40, 0, 0]) === 'meets' && st('Bug Hunter', [39, 50, 50]) === 'below' && st('Rookie', [0, 5, 0]) === 'below');
    ok('...with nothing in each of the last 3 months is inactive', st('Bug Hunter', [0, 0, 0, 30]) === 'inactive' && st('Rookie', [0, 0, 0]) === 'inactive');
    ok('...a month before joining counts towards neither: new, and not inactive', st('Bug Hunter', [null, null]) === 'new' && st('Bug Hunter', [0, 0, null]) === 'below');
    ok('...last month not counted yet: no state', st('Bug Hunter', [undefined, 0, 0]) === '');
    ok('Leads and Seniors are never judged by it', st('Lead', [0, 0, 0]) === '' && st('Senior', [3, 0, 0]) === '');
    const act0 = { frozen: { '2026-10': { at: 'x' }, '2026-09': { at: 'x' }, '2026-08': { at: 'x' } },
        a: { 'acc-dist': { '2026-10': 55, '2026-09': 50, '2026-08': 47 }, 'acc-ast': { '2026-10': 0, '2026-09': 0, '2026-08': 0 }, 'acc-me': { '2026-10': 12 }, 'acc-new': {} },
        g: { 'acc-dist': { '2026-08': 3 } },
        roster: { at: 'x', n: { 'acc-dist': 'ISD Distillery', 'acc-ast': 'ISD Astaris', 'acc-me': 'ISD BH Schogol', 'acc-new': 'ISD Newcomer', 'acc-sen': 'ISD Aravanadi' } } };
    const mem0 = { m: { 'acc-sen': { role: 'Senior', note: 'Health issues\nback in Jan', by: 'solnichka', at: '2026-10-02' }, 'acc-new': { role: 'Rookie' } } };
    const live0 = result('2026-11', '2026-11-01T11:00:00.000Z', [['ISD Distillery', 'acc-dist', 8], ['ISD Astaris', 'acc-ast', 0], ['ISD BH Schogol', 'acc-me', 2], ['ISD Newcomer', 'acc-new', 0], ['ISD Aravanadi', 'acc-sen', 0]]);
    let rows = M.model(act0, mem0, live0, '2026-11');
    ok('the rows: by role rank, then by name without "ISD "', J(rows.map((r) => r.name)) === J(['ISD BH Schogol', 'ISD Aravanadi', 'ISD Astaris', 'ISD Distillery', 'ISD Newcomer']), J(rows.map((r) => r.role + ':' + r.name)));
    const byAcc = {};
    rows.forEach((r) => { byAcc[r.acc] = r; });
    ok('...each month a count, null before the member was counted in it, undefined while not counted at all', J(byAcc['acc-me'].months.slice(0, 4)) === J([12, null, null, undefined]) &&
        J(byAcc['acc-dist'].months.slice(0, 3)) === J([55, 50, 47]), J(byAcc['acc-me'].months));
    ok('...the old-way GM handoffs inside each month, and this month so far from this browser\'s count', J(byAcc['acc-dist'].gm.slice(0, 3)) === J([0, 0, 3]) && byAcc['acc-dist'].cur === 8 &&
        byAcc['acc-ast'].cur === 0);
    ok('...Last active the newest month with anything in it, this month first', byAcc['acc-dist'].last === '2026-11' && byAcc['acc-ast'].last === '' && byAcc['acc-me'].last === '2026-11');
    ok('...a role a Lead set, a note and who set it; the default otherwise', byAcc['acc-sen'].role === 'Senior' && byAcc['acc-sen'].roleSet && byAcc['acc-sen'].note === 'Health issues\nback in Jan' &&
        byAcc['acc-sen'].noteBy === 'solnichka' && byAcc['acc-dist'].role === 'Bug Hunter' && !byAcc['acc-dist'].roleSet && byAcc['acc-me'].role === 'Lead');
    ok('...and the states: inactive, meets, new, and none for a Lead', byAcc['acc-ast'].state === 'inactive' && byAcc['acc-dist'].state === 'meets' && byAcc['acc-new'].state === 'new' && byAcc['acc-me'].state === '');
    rows = M.model(act0, mem0, null, '2026-11');
    ok('without this month\'s count in this browser, its column says so (undefined), and the roster still lists everyone', rows.length === 5 && rows.every((r) => r.cur === undefined));
    ok('...nor is another month\'s count taken for this one', M.model(act0, mem0, live0, '2026-12').every((r) => r.cur === undefined));
    // a name without "ISD ", one in lower case, a role no Lead can pick, someone only in this month's count, and two it left out
    const actS = { frozen: { '2026-10': { at: 'x' } }, a: { b: { '2026-10': 9 } }, roster: { at: 'x', n: { a: 'ISD Distillery', b: 'Borealis', c: 'isd astaris' } } };
    const liveS = result('2026-11', '2026-11-01T11:00:00.000Z', [['ISD Distillery', 'a', 3], ['ISD Zephyr', 'z', 1]]);
    rows = M.model(actS, { m: { a: { role: 'Overlord' } } }, liveS, '2026-11');
    const byS = {};
    rows.forEach((r) => { byS[r.acc] = r; });
    ok('...names sorted without "ISD ", whatever their case', J(rows.map((r) => r.name)) === J(['isd astaris', 'Borealis', 'ISD Distillery', 'ISD Zephyr']), J(rows.map((r) => r.name)));
    ok('...a stored role that is not one of the four is not taken', byS.a.role === 'Bug Hunter' && !byS.a.roleSet);
    ok('...someone only in this month\'s count is listed, and those it leaves out are not in the group this month (null)',
        !!byS.z && byS.z.cur === 1 && byS.b.cur === null && byS.c.cur === null, J([byS.z && byS.z.cur, byS.b.cur, byS.c.cur]));

    // ================= recording what the caches give, without a crawl =================
    caches['2026-10'] = result('2026-10', '2026-11-01T00:20:00.000Z', PEOPLE(23));
    caches['2026-09'] = result('2026-09', '2026-09-30T23:40:00.000Z', PEOPLE(40));   // counted before its month was over
    caches['2026-08'] = result('2026-08', '2026-09-01T00:20:00.000Z', PEOPLE(30));   // final, but before the switch: only Count records it
    caches['2026-11'] = result('2026-11', '2026-11-01T11:45:00.000Z', PEOPLE(4).concat([['ISD Newcomer', 'acc-new', 1]]));
    const g1 = M.gather(), g2 = M.gather();
    ok('two reads at once share one', g1 === g2);
    await g1;
    ok('...and a cache counted before its month was over is not recorded from', !props[L.ACTIVITY_KEY].value.frozen['2026-09'] && !!props[L.ACTIVITY_KEY].value.frozen['2026-10'] &&
        M._gather === null, J(Object.keys(props[L.ACTIVITY_KEY].value.frozen)));
    caches['2026-09'] = result('2026-09', '2026-10-01T00:20:00.000Z', PEOPLE(40));   // its final count
    let g = await M.gather();
    let act = props[L.ACTIVITY_KEY].value;
    ok('gather records each finished month after the GM switch from the cache, and nothing before it', J(Object.keys(act.frozen).sort()) === J(['2026-09', '2026-10']) &&
        act.a['acc-ast']['2026-10'] === 23 && act.a['acc-ast']['2026-09'] === 40 && !act.frozen['2026-08'], J(Object.keys(act.frozen)));
    ok('...the months still missing, newest first, for the Count button', J(g.missing) === J(['2026-08', '2026-07', '2026-06', '2026-05']), J(g.missing));
    ok('...the roster from the newest count (this month\'s), and who recorded', act.roster.at === '2026-11-01T11:45:00.000Z' && act.roster.n['acc-new'] === 'ISD Newcomer' && act.frozen['2026-10'].by === 'schogol' &&
        act.frozen['2026-10'].n === 4 && !act.frozen['2026-10'].late);
    ok('...and this month\'s count handed on for its column', g.live && g.live.ym === '2026-11');
    saves = [];
    await M.gather();
    ok('gathering again with nothing new writes nothing', saves.length === 0, J(saves));
    caches['2026-10'] = result('2026-10', '2026-11-01T06:00:00.000Z', PEOPLE(99));
    await M.gather();
    ok('a month recorded is never recorded again: the first count stands', props[L.ACTIVITY_KEY].value.a['acc-ast']['2026-10'] === 23);
    caches['2026-10'] = result('2026-10', '2026-11-01T00:20:00.000Z', PEOPLE(23));
    // _apply on its own: late months, stale claims, the window, the roster.
    let v = M._apply(null, { '2026-06': { at: '2026-07-20T00:00:00.000Z', counts: { a: 1 }, gm: { a: 0 } } }, null, 'me', NOW);
    ok('a month counted more than a week after its end is marked late; a zero GM count is not stored', v.frozen['2026-06'].late === true && !v.g.a, J(v));
    v = M._apply({ v: 1, frozen: {}, a: {}, g: {}, crawl: { '2026-07': { by: 'x', tab: 't', at: new Date(NOW - 31 * 60000).toISOString() }, '2026-06': { by: 'x', tab: 't', at: new Date(NOW - 60000).toISOString() } } }, {}, null, 'me', NOW);
    ok('a claim older than CLAIM_MS is dropped, a fresh one kept', v && !v.crawl['2026-07'] && !!v.crawl['2026-06']);
    v = M._apply({ v: 1, frozen: { '2026-04': { at: 'x' }, '2026-05': { at: 'x' } }, a: { k: { '2026-04': 3, '2026-05': 4 }, gone: { '2026-04': 1 } }, g: { k: { '2026-04': 1 } }, crawl: {} }, {}, null, 'me', NOW);
    ok('a month that left the window goes, with its counts, and an account left with none', v && !v.frozen['2026-04'] && v.frozen['2026-05'] && J(v.a.k) === J({ '2026-05': 4 }) && !v.a.gone && !v.g.k, J(v));
    const base = { v: 1, frozen: {}, a: {}, g: {}, crawl: {}, roster: { at: '2026-11-01T10:00:00.000Z', n: { a: 'Ann' } } };
    ok('an older count does not replace the roster, nor one naming the same people', M._apply(clone(base), {}, { at: '2026-10-01T00:00:00.000Z', names: { b: 'Bob' } }, 'me', NOW) === null &&
        M._apply(clone(base), {}, { at: '2026-11-01T11:00:00.000Z', names: { a: 'Ann' } }, 'me', NOW) === null);
    v = M._apply(clone(base), {}, { at: '2026-11-01T11:00:00.000Z', names: { a: 'Ann Renamed', b: 'Bob' } }, 'me', NOW);
    ok('...a newer one that does replaces it: a renamed member keeps their account, and so their history', v && v.roster.n.a === 'Ann Renamed' && v.roster.n.b === 'Bob');
    const many = {}, frz = {};
    for (let i = 0; i < 60; i++) { many['712020:' + ('0000000' + i).slice(-8) + '-1111-2222-3333-444455556666'] = 37 + i; }
    M.window('2026-11').forEach((ym) => { frz[ym] = { at: '2026-11-01T00:00:00.000Z', counts: many, gm: many }; });
    const big = M._apply(null, frz, { at: '2026-11-01T00:00:00.000Z', names: Object.keys(many).reduce((o, k) => { o[k] = 'ISD Some Rather Long Display Name'; return o; }, {}) }, 'me', NOW);
    ok('60 members over 6 months, every one with GM handoffs too, stay well under the property cap', J(big).length < L.MAX_PROP_BYTES, String(J(big).length));

    // ================= counting the missing months =================
    caches['crawl:2026-08'] = result('2026-08', '2026-11-01T12:00:00.000Z', PEOPLE(30));
    caches['crawl:2026-07'] = result('2026-07', '2026-11-01T12:00:00.000Z', PEOPLE(10));
    caches['crawl:2026-06'] = result('2026-06', '2026-11-01T12:00:00.000Z', PEOPLE(0));
    caches['crawl:2026-05'] = result('2026-05', '2026-11-01T12:00:00.000Z', PEOPLE(0).slice(0, 2));
    caches['gm:2026-08'] = { 'acc-ast': 4 };
    caches['gm:2026-07'] = { 'acc-ast': 5, 'acc-gone': 9 };
    let steps = [], monthsDone = [], claims = [];
    busyFor = 2;
    onRefresh = (ym) => { claims.push(((props[L.ACTIVITY_KEY].value.crawl || {})[ym] || {}).tab || 'none'); };
    await M.count((s) => steps.push(s), (ym) => monthsDone.push(ym));
    onRefresh = null;
    act = props[L.ACTIVITY_KEY].value;
    ok('Count counts the missing months newest first, one at a time, each recorded as it lands', J(refreshed) === J(['2026-08', '2026-07', '2026-06', '2026-05']) && J(monthsDone) === J(refreshed), J(refreshed));
    ok('...each claimed in the ledger by this tab while it is counted', J(claims) === J(['tab-me', 'tab-me', 'tab-me', 'tab-me']), J(claims));
    ok('...waiting first while an ISD credits count runs', steps.filter((s) => /^Waiting for the ISD credits count/.test(s)).length === 2, J(steps.slice(0, 4)));
    ok('...before the switch, the old-way GM handoffs counted up to the cut: the 21st for August, the month\'s end before', J(gmAsked) === J(['2026-08<2026-08-21', '2026-07<2026-08-01', '2026-06<2026-07-01', '2026-05<2026-06-01']), J(gmAsked));
    ok('...and added to the member\'s total, kept apart too, for an account the month counted only', act.a['acc-ast']['2026-08'] === 34 && act.a['acc-ast']['2026-07'] === 15 && act.g['acc-ast']['2026-08'] === 4 &&
        !act.g['acc-gone'] && !act.a['acc-gone'], J(act.a['acc-ast']));
    ok('...a member not in the group that month has no count for it', !('2026-05' in (act.a['acc-ast'] || {})) && act.a['acc-dist']['2026-05'] === 55);
    ok('...its progress handed on, and the credits hook given back', steps.some((s) => /^Counting Aug 2026/.test(s)) && steps.some((s) => /GM handoffs made the old way/.test(s)) &&
        steps.some((s) => /reports attached/.test(s)) && JiTA.credits.onProgress === null);
    ok('...no claim left behind; a month counted long after its end marked late, as the page footnotes it', Object.keys(act.crawl || {}).length === 0 && act.frozen['2026-08'].late === true);
    refreshed = []; gmAsked = [];
    await M.count();
    ok('with nothing missing Count does nothing', refreshed.length === 0);
    props[L.ACTIVITY_KEY].value.frozen = { '2026-10': { at: 'x' }, '2026-08': { at: 'x' }, '2026-07': { at: 'x' }, '2026-06': { at: 'x' }, '2026-05': { at: 'x' } };
    await M.count();
    ok('a month after the switch is counted without asking for old-way GM handoffs', J(refreshed) === J(['2026-09']) && gmAsked.length === 0 && !!props[L.ACTIVITY_KEY].value.frozen['2026-09'], J(gmAsked));
    refreshed = []; gmAsked = [];
    // a month frozen by another Lead while this one waited, a fresh claim elsewhere, a stale one, a failure
    const fresh = () => { props[L.ACTIVITY_KEY].value.frozen = { '2026-10': { at: 'x' }, '2026-09': { at: 'x' } }; };
    fresh();
    props[L.ACTIVITY_KEY].value.crawl = { '2026-08': { by: 'lookuptable', tab: 'their-tab', at: new Date(NOW - 60000).toISOString() },
        '2026-07': { by: 'lookuptable', tab: 'their-tab', at: new Date(NOW - 40 * 60000).toISOString() } };
    refreshed = [];
    onRefresh = (ym) => { if (ym === '2026-07') { props[L.ACTIVITY_KEY].value.frozen['2026-06'] = { at: 'theirs' }; } };
    await M.count();
    onRefresh = null;
    ok('a month another Lead\'s tab is counting is left to it; a claim gone stale is taken over', refreshed.indexOf('2026-08') < 0 && refreshed[0] === '2026-07', J(refreshed));
    ok('...and a month recorded elsewhere meanwhile is not counted again', refreshed.indexOf('2026-06') < 0 && props[L.ACTIVITY_KEY].value.frozen['2026-06'].at === 'theirs', J(refreshed));
    // ...nor one recorded between the count's read and its claim: the claim's own read sees it, and lets the month go
    await settle();   // the page publishes the months just recorded asked for, which read the ledger too
    fresh();
    props[L.ACTIVITY_KEY].value.crawl = {};
    let reads = 0;
    onRead = (key) => { if (key === L.ACTIVITY_KEY && ++reads === 2) { props[L.ACTIVITY_KEY].value.frozen['2026-08'] = { at: 'raced' }; } };
    refreshed = [];
    await M.count();
    onRead = null;
    ok('...nor one recorded between its read and its claim', refreshed.indexOf('2026-08') < 0 && refreshed[0] === '2026-07' && props[L.ACTIVITY_KEY].value.frozen['2026-08'].at === 'raced', J(refreshed));
    // a count that loses the full-crawl lease to another tab waits for that count, then counts
    fresh();
    props[L.ACTIVITY_KEY].value.crawl = {};
    leaseLost = 1; steps = []; refreshed = [];
    let err = null;
    await M.count((s) => steps.push(s)).catch((e) => { err = e; });
    ok('a count that loses the lease to another tab waits for it, then counts', !err && J(refreshed) === J(['2026-08', '2026-07', '2026-06', '2026-05']) &&
        steps.some((s) => /^Waiting for the ISD credits count/.test(s)), err ? err.message : J(refreshed));
    // ...and gives up on one running past BUSY_MAX_MS
    fresh();
    props[L.ACTIVITY_KEY].value.crawl = {};
    busyFor = 200; refreshed = []; err = null;
    let clock = 0;
    Date.now = () => NOW + (clock++) * 60000;   // every look at the clock a minute later
    await M.count().catch((e) => { err = e; });
    Date.now = () => NOW;
    busyFor = 0;
    ok('...and gives up on one running past BUSY_MAX_MS, saying so, its month let go', err && /running for over 20 minutes/.test(err.message) && refreshed.length === 0 &&
        !(props[L.ACTIVITY_KEY].value.crawl || {})['2026-08'], err ? err.message : J(refreshed));
    fresh();
    props[L.ACTIVITY_KEY].value.crawl = {};
    refreshFail = new Error('worker said no');
    err = null;
    await M.count().catch((e) => { err = e; });
    act = props[L.ACTIVITY_KEY].value;
    ok('a count that fails stops, says why, and releases its month', err && /worker said no/.test(err.message) && !act.frozen['2026-08'] && !(act.crawl || {})['2026-08'], err && err.message);
    // ...but not a claim another Lead's tab has taken over meanwhile (this one's having gone stale): that one is theirs
    onRefresh = (ym) => { const v = props[L.ACTIVITY_KEY].value; (v.crawl = v.crawl || {})[ym] = { by: 'lookuptable', tab: 'their-tab', at: new Date(NOW).toISOString() }; };
    refreshFail = new Error('worker said no');
    await M.count().catch(() => {});
    onRefresh = null;
    ok('...but a claim another Lead\'s tab took over meanwhile stays theirs', ((props[L.ACTIVITY_KEY].value.crawl || {})['2026-08'] || {}).tab === 'their-tab', J(props[L.ACTIVITY_KEY].value.crawl));
    props[L.ACTIVITY_KEY].value.crawl = {};
    gmFail = new Error('changelog unreachable');
    err = null;
    await M.count().catch((e) => { err = e; });
    ok('...so does one whose GM handoffs cannot be counted: the month is not recorded half-counted', err && /changelog unreachable/.test(err.message) && !props[L.ACTIVITY_KEY].value.frozen['2026-08']);
    workerUp = false;
    err = null;
    await M.count().catch((e) => { err = e; });
    ok('without the background worker Count refuses, saying where it works', err && /open Lead duties on a Jira page/.test(err.message));
    workerUp = true;
    refreshed = [];
    const p1 = M.count(), p2 = M.count();
    ok('two Counts share one run', p1 === p2);
    await p1;
    ok('...which counted each month once', J(refreshed) === J(['2026-08', '2026-07', '2026-06', '2026-05']), J(refreshed));
    fresh();
    gm.leadDutyDryRun = true;
    refreshed = [];
    await M.count();
    gm.leadDutyDryRun = false;
    ok('a dry run, which writes nothing, still tries each month only once', J(refreshed) === J(['2026-08', '2026-07', '2026-06', '2026-05']), J(refreshed));
    await M.count();

    // ================= roles and notes =================
    let pubs = 0;   // every publish, the ones a write asks for included
    const realPublish = M.publish;
    M.publish = function () { pubs++; return realPublish.apply(this, arguments); };
    await later();   // the publishes the months just recorded asked for
    saves = []; pageWrites = []; pubs = 0;
    let w = await M.setRole('acc-dist', 'Bug Hunter', 'ISD Distillery');
    await later();
    ok('picking the default role stores nothing, and asks for no publish', !w.written && saves.length === 0 && pubs === 0, pubs + ' publishes');
    w = await M.setRole('acc-dist', 'Senior', 'ISD Distillery');
    let mv = props[L.MEMBERS_KEY].value;
    ok('another role is stored, with who set it and when', w.written && mv.m['acc-dist'].role === 'Senior' && mv.m['acc-dist'].by === 'schogol' && /^\d{4}-\d\d-\d\d$/.test(mv.m['acc-dist'].at), J(mv));
    await later();
    ok('...and brings the page in step', pubs === 1 && pageWrites.length === 1 && pageWrites[0].id === L.MEMBERS_PAGE && /<td>Senior<\/td><td>ISD Distillery<\/td>/.test(pageWrites[0].html),
        pubs + ' publishes, ' + pageWrites.length + ' writes');
    w = await M.setNote('acc-dist', '  Ask   for update?  \n\n\n\nOn leave  ');
    mv = props[L.MEMBERS_KEY].value;
    ok('a note is stored as notes are: spaces squeezed, one blank line at most', mv.m['acc-dist'].note === 'Ask for update?\n\nOn leave', J(mv.m['acc-dist'].note));
    w = await M.setNote('acc-dist', 'Ask for update?\n\nOn leave');
    ok('...the same note again writes nothing', !w.written);
    await M.setRole('acc-dist', 'Bug Hunter', 'ISD Distillery');
    ok('back to the default role, the role goes and the note stays', !('role' in props[L.MEMBERS_KEY].value.m['acc-dist']) && props[L.MEMBERS_KEY].value.m['acc-dist'].note);
    await M.setNote('acc-dist', '   ');
    ok('...and an empty note removes the entry, nothing being left in it', !('acc-dist' in props[L.MEMBERS_KEY].value.m));
    err = null;
    await M.setRole('acc-dist', 'Overlord', 'ISD Distillery').catch((e) => { err = e; });
    ok('an unknown role is refused', err && /Unknown role/.test(err.message));
    await later();
    const pubsBefore = pubs;
    failNext = true;
    err = null;
    await M.setNote('acc-dist', 'x').catch((e) => { err = e; });
    ok('a write that fails rejects', err && /500/.test(err.message));
    await later();
    ok('...and asks for no publish', pubs === pubsBefore, (pubs - pubsBefore) + ' publishes');

    // ================= Leads only =================
    gm.leadDutyMe = { accountId: 'acc-x', displayName: 'ISD Distillery', handle: null, isLead: false };
    L._me = null;
    const refused = [];
    await M.gather().catch((e) => refused.push(e.message));
    await M.count().catch((e) => refused.push(e.message));
    await M.setRole('acc-ast', 'Senior', 'ISD Astaris').catch((e) => refused.push(e.message));
    await M.setNote('acc-ast', 'x').catch((e) => refused.push(e.message));
    const pr = await M.publish(true), tk = await M.tick();
    ok('a non-Lead can read, count, change and publish nothing', refused.length === 4 && refused.every((m) => /Leads only/.test(m)) && pr.skipped === 'not a Lead' && tk === null, J(refused));
    gm.leadDutyMe = { accountId: 'acc-me', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true };
    L._me = null;

    // ================= the page =================
    await M.setNote('acc-ast', 'Ask for <update>?\nTwice & more');
    await settle();
    pageWrites = [];
    let res = await M.publish(true);
    let html = pageWrites.length ? pageWrites[0].html : '';
    ok('the page is written to the members page, not the ledger page, and the build that wrote it recorded', res.written && pageWrites.length === 1 && pageWrites[0].id === '199754526' &&
        L.MEMBERS_PAGE !== L.LEDGER_PAGE && props[L.MEMBERS_KEY].value.pub.v === '3.48.0', J(res));
    ok('...one table: role, name, notes, the 6 months, Last active and State', /<th>Role<\/th><th>Name<\/th><th>Notes<\/th><th>Oct 2026<\/th><th>Sep 2026<\/th>.*<th>May 2026<\/th><th>Last active<\/th><th>State<\/th>/.test(html) &&
        (html.match(/<table>/g) || []).length === 1);
    ok('...rows by rank: the Lead first, then the Bug Hunters by name', html.indexOf('ISD BH Schogol') < html.indexOf('ISD Astaris') && html.indexOf('ISD Astaris') < html.indexOf('ISD Byteghost') &&
        html.indexOf('ISD Byteghost') < html.indexOf('ISD Distillery'));
    ok('...a note escaped, its lines kept', html.indexOf('Ask for &lt;update&gt;?<br />Twice &amp; more') >= 0);
    ok('...a Bug Hunter\'s month below 40 coloured, 0 in red, a GM month starred; a 40 and a Lead\'s plain', /<span style="color: #974f0c;">34\*<\/span>/.test(html) && /<span style="color: #ae2a19;">0<\/span>/.test(html) &&
        /<td>12<\/td>/.test(html) && !/<span[^>]*>12<\/span>/.test(html) && /<td[^>]*>40<\/td>/.test(html) && !/<span[^>]*>40<\/span>/.test(html));
    ok('...a month before joining shown as -', /<td[^>]*>-<\/td>/.test(html));
    const oddName = M._content([{ role: 'Bug Hunter', name: 'ISD <b>Bold</b> & Co', note: '', months: [1, 2, 3, 4, 5, 6], gm: [0, 0, 0, 0, 0, 0], last: '', state: '' }], { frozen: {} }, true);
    ok('...a name escaped too', oddName.indexOf('ISD &lt;b&gt;Bold&lt;/b&gt; &amp; Co') >= 0 && oddName.indexOf('<b>Bold') < 0);
    ok('...the State as a lozenge, the row tinted by it', /<ac:parameter ac:name="colour">Red<\/ac:parameter><ac:parameter ac:name="title">Inactive<\/ac:parameter>/.test(html) &&
        /<td class="highlight-#ffebe6" data-highlight-colour="#ffebe6">ISD Byteghost/.test(html.replace(/<td[^>]*>Bug Hunter<\/td>/g, '')) || /data-highlight-colour="#ffebe6"/.test(html), html.slice(0, 200));
    ok('...the minimum, the GM rule and the stamp said', /ECAID asks for <strong>40 a month<\/strong>/.test(html) && /\* includes GM handoffs made the old way/.test(html) && /<em>Generated from the shared lead-duty ledger/.test(html));
    ok('...and the months counted late footnoted', /Counted late: Aug 2026 \(on 2026-11-01\), Jul 2026 \(on 2026-11-01\)/.test(html), (html.match(/Counted late:[^<]*/) || [''])[0]);
    res = await M.publish(false);
    ok('nothing changed: nothing written', res.skipped === 'unchanged' && pageWrites.length === 1, J(res));
    props[L.MEMBERS_KEY].value.pub.v = '9.0.0';
    res = await M.publish(true);
    ok('an older build never overwrites a page a newer one published', /an older build does not overwrite a newer one/.test(res.skipped || '') && pageWrites.length === 1, J(res));
    props[L.MEMBERS_KEY].value.pub.v = '3.48.0';
    refuseRich = true;
    pageWrites = [];
    res = await M.publish(true);
    html = pageWrites.length ? pageWrites[0].html : '';
    ok('a page Confluence refuses in colour is written plain, the lozenges still saying the state', res.written && pageWrites.length === 1 && !/data-highlight-colour|style="color/.test(html) &&
        /ac:name="status"/.test(html) && props[L.MEMBERS_KEY].value.pub.plain === true, J(res));
    refuseRich = false;
    M._plain = false;
    pageWrites = [];
    res = await M.publish(false);
    ok('...and stays plain: the next publish finds it unchanged', res.skipped === 'unchanged' && M._plain === true, J(res));
    const ledgerPage = L.MEMBERS_PAGE;
    L.MEMBERS_PAGE = L.LEDGER_PAGE;
    ok('the ledger page is never written as the members page', (await M.publish(true)).skipped === 'the members page is the ledger page');
    L.MEMBERS_PAGE = '';
    ok('...and with no members page set nothing is published', (await M.publish(true)).skipped === 'no members page is set');
    L.MEMBERS_PAGE = ledgerPage;
    const actKeep = props[L.ACTIVITY_KEY];
    delete props[L.ACTIVITY_KEY];
    ok('with no month counted yet there is nothing to publish', (await M.publish(true)).skipped === 'no month counted yet');
    props[L.ACTIVITY_KEY] = actKeep;
    gm.leadDutyDryRun = true;
    ok('a dry run publishes nothing', (await M.publish(true)).skipped === 'dry run');
    gm.leadDutyDryRun = false;
    // two publishes at once: one writes, the other is run again once that one is done
    await later();
    props[L.MEMBERS_KEY].value.m['acc-dist'] = { note: 'Set in another browser', by: 'lookuptable', at: '2026-11-01' };
    pageWrites = []; pubs = 0;
    const q1 = M.publish(false), q2 = M.publish(false);
    const r2 = await q2;
    await q1;
    await later();
    ok('a publish asked for while one runs is not written alongside it, but run again once that one is done', r2.skipped === 'already publishing' && pageWrites.length === 1 && pubs === 3,
        J({ r2: r2, writes: pageWrites.length, pubs: pubs }));
    M._pubBusy = true; M._pubAt = Date.now() - M.PUB_BUSY_MAX_MS - 1;   // one that hung
    props[L.MEMBERS_KEY].value.m['acc-dist'].note = 'Set in another browser, twice';
    pageWrites = [];
    res = await M.publish(false);
    ok('...and one that hung does not hold up the next', res.written && pageWrites.length === 1, J(res));
    // in colour again: a failure other than Confluence refusing the colours is not retried plain - it is said, and the next goes ahead
    delete props[L.MEMBERS_KEY].value.pub.plain;
    M._plain = false;
    props[L.MEMBERS_KEY].value.m['acc-dist'].note = 'Set in another browser, three times';
    failPage = Object.assign(new Error('HTTP 503'), { status: 503 });
    err = null; pageWrites = [];
    await M.publish(false).catch((e) => { err = e; });
    ok('a page write that fails otherwise is not retried plain, and the tab says it failed', err && err.status === 503 && pageWrites.length === 0 && !M._plain &&
        /publishing the members page FAILED .*HTTP 503/.test(M.lastLine()), M.lastLine());
    res = await M.publish(false);
    ok('...and the next publish goes ahead, in colour', res.written && pageWrites.length === 1 && /data-highlight-colour/.test(pageWrites[0].html), J(res));
    // the scheduler's tick: a change made elsewhere reaches the page
    props[L.MEMBERS_KEY].value.m['acc-dist'].note = 'Set in another browser, four times';
    pageWrites = [];
    const tk2 = await M.tick();
    ok('the scheduler\'s tick brings the page in step with a change made elsewhere', tk2 && tk2.written && pageWrites.length === 1 && /four times/.test(pageWrites[0].html), J(tk2));

    // ================= the wiki pool and the scheduler =================
    const pool = L.pool._applyExclusions({ rootId: 'root', pages: [{ id: '199754526', parentId: 'root' }, { id: 'child', parentId: '199754526' }, { id: 'other', parentId: 'root' }],
        parents: { '199754526': 'root', child: '199754526', other: 'root' } });
    ok('the wiki review never assigns the members page, nor anything under it', J(pool.pages.map((p) => p.id)) === J(['other']) && pool.verified, J(pool.pages));
    const sched = src.slice(src.indexOf('JiTA.leadduty.sched = {'));
    ok('the scheduler brings the members page in step after the ledger page, and its failure never fails the tick',
        /return L\.report\.publish\(false\)[\s\S]{0,400}return Promise\.resolve\(\)\.then\(function \(\) \{ return L\.members\.tick\(\); \}\)\.catch\(function \(\) \{/.test(sched));

    // ================= the tab =================
    gm.leadDutyMe = { accountId: 'acc-me', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true };
    U._tab = 'members';
    U._mem = null;
    let asked = null, answer = 'Cross trained to NEC';
    U._askNote = (o, then) => { asked = o; if (answer !== null) { then(answer); } };
    U._load(false);   // through the window's own loader, as a click on the tab does
    await settle();
    const rowsOf = () => body.kids.filter((k) => k.hasClass('ld-mrow') && !k.hasClass('ld-mhead'));
    const rowFor = (acc) => rowsOf().filter((r) => r.attrs['data-key'] === acc)[0];
    const cell = (r, i) => r.kids.filter((k) => k.hasClass('ld-mnum'))[i];
    ok('the tab lists every member under a header, by rank', body.kids.some((k) => k.hasClass('ld-mhead')) && rowsOf().length === 5 && rowsOf()[0].attrs['data-key'] === 'acc-me', J(rowsOf().map((r) => r.attrs['data-key'])));
    const ast = rowFor('acc-ast');
    ok('a Bug Hunter\'s month under 40 is marked, 0 in red, with what it means in its hover', cell(ast, 2).hasClass('low') && cell(ast, 2).text() === '34' &&
        /34 actioned in Aug 2026, of the 40 a month ECAID asks for\nincl\. 4 handed to the GMs the old way/.test(cell(ast, 2).attrs.title) && cell(rowFor('acc-byte'), 0).hasClass('zero'), cell(ast, 2).attrs.title);
    ok('...a 40 is not', cell(ast, 1).text() === '40' && !cell(ast, 1).hasClass('low'), cell(ast, 1).text());
    const lead = rowFor('acc-me');
    ok('...a Lead\'s is not, and has no state', !cell(lead, 0).hasClass('low') && !cell(lead, 0).hasClass('zero') && lead.kids[0].hasClass('none'));
    ok('...this month so far, saying how many to go', cell(ast, 6).text() === '4' && /4 so far this month, 36 to go for the 40/.test(cell(ast, 6).attrs.title), cell(ast, 6).attrs.title);
    ok('...a month before joining shown as - with its reason', cell(rowFor('acc-new'), 0).text() === '-' && /Not in the group yet/.test(cell(rowFor('acc-new'), 0).attrs.title));
    ok('...the state dot saying why', rowFor('acc-byte').kids[0].hasClass('inactive') && /^Inactive: nothing actioned in Aug 2026 to Oct 2026/.test(rowFor('acc-byte').kids[0].attrs.title), rowFor('acc-byte').kids[0].attrs.title);
    ok('the status line counts them', /5 members · \d+ meet the minimum · \d+ below · \d+ inactive/.test(status.textContent), status.textContent);
    // the filter
    const bar = body.kids.filter((k) => k.hasClass('ld-mbar'))[0], box = bar.kids.filter((k) => k.hasClass('ld-mfilter'))[0].kids[0];
    box.checked = true; box.fire('change');
    ok('"Only below the minimum or inactive" leaves just those: the one below it and the one inactive', J(rowsOf().map((r) => r.attrs['data-key'])) === J(['acc-ast', 'acc-byte']) &&
        rowFor('acc-ast').hasClass('ld-m-below') && rowFor('acc-byte').hasClass('ld-m-inactive'), J(rowsOf().map((r) => r.cls.join('.'))));
    box.checked = false; box.fire('change');
    // a role
    body._scroll = 120;
    const sel = rowFor('acc-ast').kids.filter((k) => k.hasClass('ld-mrole'))[0];
    sel.value = 'Rookie'; sel.fire('change');
    await settle();
    ok('a role picked is saved, and the list drawn again where it was', props[L.MEMBERS_KEY].value.m['acc-ast'].role === 'Rookie' && body._scroll === 120 && rowFor('acc-ast').kids.filter((k) => k.hasClass('ld-mrole'))[0].kids.filter((o) => o.props.selected)[0].attrs.value === 'Rookie');
    // a note
    const before = rowsOf().slice(), noteEl = rowFor('acc-ast').kids.filter((k) => k.hasClass('ld-mnote'))[0];
    U._drafts['member:acc-ast'] = 'typed in the dialog before';   // as the real dialog keeps what was typed
    noteEl.fire('click');
    await settle();
    ok('a note saved lets its draft go', !('member:acc-ast' in U._drafts), J(U._drafts));
    ok('a note clicked opens the dialog with the note as it is', asked && asked.value === 'Ask for <update>?\nTwice & more' && asked.draft === 'member:acc-ast', J(asked));
    ok('...saved, only its row is drawn again', props[L.MEMBERS_KEY].value.m['acc-ast'].note === 'Cross trained to NEC' && rowFor('acc-ast') !== before.filter((r) => r.attrs['data-key'] === 'acc-ast')[0] &&
        rowsOf().filter((r) => r.attrs['data-key'] !== 'acc-ast').every((r) => before.indexOf(r) >= 0) && rowFor('acc-ast').kids.filter((k) => k.hasClass('ld-mnote'))[0].text() === 'Cross trained to NEC');
    // the Count button
    props[L.ACTIVITY_KEY].value.frozen = { '2026-10': { at: 'x' }, '2026-09': { at: 'x' } };
    U._loadMembers(true);
    await settle();
    const countBtn = () => all(body).filter((k) => k.hasClass('ld-mcount'))[0];
    ok('with months missing, a Count button says how many and which', countBtn() && countBtn().text() === 'Count 4 months' && /Not counted yet: Aug 2026, Jul 2026, Jun 2026, May 2026/.test(countBtn().attrs.title) && !countBtn().props.disabled,
        countBtn() && countBtn().text());
    workerUp = false;
    U._renderMembers(true);
    ok('...disabled, saying why, without the background worker', countBtn().props.disabled === true && /open Lead duties on a Jira page/.test(countBtn().attrs.title));
    workerUp = true;
    U._renderMembers(true);
    refreshed = [];
    let loads = 0;
    const realLoad = U._loadMembers;
    U._loadMembers = function () { loads++; return realLoad.apply(this, arguments); };
    countBtn().fire('click');
    await settle(60);
    await new Promise((r) => setTimeout(r, 30)); await settle(60);
    U._loadMembers = realLoad;
    ok('...which counts them and fills the table', J(refreshed) === J(['2026-08', '2026-07', '2026-06', '2026-05']) && !countBtn() && cell(rowFor('acc-ast'), 2).text() === '34', J(refreshed));
    ok('...read again as each month lands, and once more at the end', loads === 5, loads + ' loads');
    // a Count that stops says why, on the bar
    props[L.ACTIVITY_KEY].value.frozen = { '2026-10': { at: 'x' }, '2026-09': { at: 'x' } };
    U._loadMembers(true);
    await settle();
    refreshFail = new Error('worker said no');
    countBtn().fire('click');
    await settle(60);
    const prog = all(body).filter((k) => k.id === 'ld-mprog')[0];
    ok('a Count that stops says why on the bar', /^Counting stopped: worker said no/.test(U._memProg) && prog && /^Counting stopped: worker said no/.test(prog.text()), U._memProg);

    Date.now = realNow;
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'members checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
