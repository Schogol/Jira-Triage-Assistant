// layout-check.js - the layouts a fake DOM cannot see, measured in a real headless Chromium (tests/browser.js): the Lead
// duties Members tab's columns, the result cards in the Triage Assistant's sidebar grid, Settings keeping its size on
// every tab, the Quality control rows keeping their columns once checked, and the Lead duties window keeping its size and
// its tabs' places on every tab (the Applications list filling it), the Settings window of a settings.yaml, and Player
// actions in the igbr.zip viewer (its hover cards, and a row opened at its line). The other harnesses stub GM_addStyle and
// draw into fake DOMs, so a column that shifted per row (the Members tab's note columns before v3.49.1) passed them all.
//
// Each view gets a page of its own with the REAL userscript in it: jQuery from the script's own @require (checked against
// the sha256 that line gives, and kept in the temp folder so a second run downloads nothing), stand-ins for the GM_*
// functions over a store the view presets, and every way out to the network failing at once. The Jira boot stops at its
// "no window.indexedDB" check, which is hidden while the script loads, so no worker, sync or Lead duties scheduler starts.
// The view is then opened through JiTA's own functions, with what it would read from Jira and Confluence handed to it as
// fixtures, and measured with getBoundingClientRect and scrollWidth.
//
// With no Chrome, Chromium or Edge (JITA_BROWSER names one), or no way to download jQuery the first time, it says SKIP
// and passes, unless JITA_LAYOUT_REQUIRED=1: CI sets it, so CI never skips.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const browser = require('./browser.js');

const SRC_FILE = process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js');
const REQUIRED = process.env.JITA_LAYOUT_REQUIRED === '1';
// JITA_LAYOUT_ONLY names the views to run, by their titles in VIEWS, split by |: mutate-layout.js runs only the view a
// breakage is about. A name that is no view fails the run, so a renamed view never leaves a breakage checked by nothing.
// JITA_LAYOUT_TIMES=1 says how long each view took.
const ONLY = (process.env.JITA_LAYOUT_ONLY || '').split('|').map((s) => s.trim()).filter(Boolean);
const TIMES = process.env.JITA_LAYOUT_TIMES === '1';
const W = 1400, H = 1000;   // the viewport: Lead duties is its full 1180 px wide on it, Settings its full 620 px high
const PX = 0.5;             // two edges this close count as one (layout is in fractions of a pixel)

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) { fail++; } };
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= PX;
const spread = (xs) => (xs.length ? Math.max.apply(null, xs) - Math.min.apply(null, xs) : 0);
const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);
function finish() {
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'layout checks passed.'));
    process.exit(fail ? 1 : 0);
}
function skip(why) {
    if (REQUIRED) { ok('the layout checks can run', false, why + ' (JITA_LAYOUT_REQUIRED=1, so nothing is skipped)'); finish(); }
    console.log('  SKIP  layout checks: ' + why);
    process.exit(0);
}

// ---- jQuery, as Tampermonkey gets it: from the @require URL, refused unless it matches the sha256 on that line ----
async function requireJquery(src) {
    const m = /^\/\/ @require\s+(\S*jquery\S*?)#sha256[=-](\S+)\s*$/im.exec(src);
    if (!m) { return { error: 'the userscript has no jQuery @require with a sha256' }; }
    const url = m[1], want = m[2], sri = (buf) => crypto.createHash('sha256').update(buf).digest('base64');
    const cache = path.join(os.tmpdir(), 'jita-require-' + crypto.createHash('sha256').update(url).digest('hex').slice(0, 16) + '.js');
    try { const buf = fs.readFileSync(cache); if (sri(buf) === want) { return { text: buf.toString('utf8') }; } } catch (e) { /* not kept yet */ }
    let buf;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        buf = Buffer.from(await res.arrayBuffer());
    } catch (e) { return { offline: 'could not download ' + url + ' (' + (e && e.message || e) + ')' }; }
    if (sri(buf) !== want) { return { error: url + ' does not match the sha256 on its @require line (it is ' + sri(buf) + '), so Tampermonkey would refuse it too' }; }
    // Written under a name of its own and moved into place, so two checks downloading at once never read half a file.
    const tmp = cache + '.' + process.pid + '.tmp';
    try { fs.writeFileSync(tmp, buf); fs.renameSync(tmp, cache); } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* never written */ } }
    return { text: buf.toString('utf8') };
}

// ---- the page ----
// Roughly what a Jira page gives every element (Atlaskit's css-reset): no body margin, its system font at 14 px.
const PAGE_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>JiTA layout check</title><style>' +
    'html, body { margin: 0; padding: 0; } body { background: #fff; color: #172b4d; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif; ' +
    'font-size: 14px; line-height: 1.42857142857143; }</style></head><body></body></html>';

// Runs in the page before the script: the GM_* functions over a store preset with `gm`, GM_addStyle putting a real
// <style> in, GM_info with the script's version, and every way out failing at once ($.ajax, fetch, GM_xmlhttpRequest;
// the browser itself resolves no host name). __hideIdb / __showIdb take window.indexedDB away while the script loads.
function prelude(gm, version, res) {
    const own = Object.prototype.hasOwnProperty, store = {};
    window.GM_getResourceText = (name) => (res && own.call(res, name) ? res[name] : null);   // the files fetched with the script
    const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    Object.keys(gm || {}).forEach((k) => { store[k] = copy(gm[k]); });
    let n = 0;
    window.__gm = store;
    window.GM_info = { script: { name: 'Jira Triage Assistant', version: version }, scriptHandler: 'Tampermonkey' };
    window.GM_getValue = (k, d) => (own.call(store, k) ? copy(store[k]) : d);
    window.GM_setValue = (k, v) => { store[k] = copy(v); };
    window.GM_addStyle = (css) => {
        const s = document.createElement('style');
        s.textContent = String(css);
        (document.head || document.documentElement).appendChild(s);
        return s;
    };
    window.GM_registerMenuCommand = () => ++n;
    window.GM_unregisterMenuCommand = () => {};
    window.GM_addValueChangeListener = () => ++n;
    window.GM_xmlhttpRequest = (d) => {
        setTimeout(() => {
            const r = { status: 0, statusText: '', readyState: 4, responseText: '', response: null, finalUrl: d && d.url, error: 'no network in the layout check' };
            if (d && d.onerror) { d.onerror(r); }
            if (d && d.onloadend) { d.onloadend(r); }
        }, 0);
        return { abort: () => {} };
    };
    window.fetch = () => Promise.reject(new TypeError('Failed to fetch: no network in the layout check'));
    const $ = window.jQuery, why = 'no network in the layout check';
    $.ajax = (url, opts) => {
        const o = (url && typeof url === 'object') ? url : (opts || {}), ctx = o.context || o, d = $.Deferred();
        const xhr = d.promise({ readyState: 4, status: 0, statusText: 'error', responseText: '', abort: () => xhr, getResponseHeader: () => null,
            getAllResponseHeaders: () => '', setRequestHeader: () => xhr, overrideMimeType: () => xhr });
        setTimeout(() => {
            if (o.error) { try { o.error.call(ctx, xhr, 'error', why); } catch (e) { /* the caller's */ } }
            d.rejectWith(ctx, [xhr, 'error', why]);
            if (o.complete) { try { o.complete.call(ctx, xhr, 'error'); } catch (e) { /* the caller's */ } }
        }, 0);
        return xhr;
    };
    const idb = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    window.__hideIdb = () => { Object.defineProperty(window, 'indexedDB', { configurable: true, enumerable: true, get: () => undefined }); };
    window.__showIdb = () => { if (idb) { Object.defineProperty(window, 'indexedDB', idb); } else { delete window.indexedDB; } };
}

// Runs in the page after the script: what the views read locally comes from memory, and the measuring helpers.
function helpers() {
    const meta = {};
    JiTA.db.open = () => Promise.reject(new Error('no IndexedDB in the layout check'));
    JiTA.db.getMeta = (k) => Promise.resolve(Object.prototype.hasOwnProperty.call(meta, k) ? meta[k] : null);
    JiTA.db.setMeta = (k, v) => { meta[k] = v; return Promise.resolve(); };
    JiTA.db.getDefect = () => Promise.resolve(null);
    JiTA.db.countDefectsOnly = () => Promise.resolve(18342);
    JiTA.db.countEbr = () => Promise.resolve(2731);
    const box = (el) => {
        if (!el) { return null; }
        const r = el.getBoundingClientRect();
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
    };
    // Where an element's text ends: the right edge of its last line (for right-aligned text, its content edge).
    const textRight = (el) => {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const rs = rg.getClientRects();
        return rs.length ? rs[rs.length - 1].right : null;
    };
    const waitFor = (fn, what) => new Promise((resolve, reject) => {
        const until = Date.now() + 15000;
        (function poll() {
            let v = null;
            try { v = fn(); } catch (e) { v = null; }
            if (v) { resolve(v); } else if (Date.now() > until) { reject(new Error('timed out waiting for ' + what)); } else { setTimeout(poll, 20); }
        })();
    });
    // Lead duties without Confluence or VMS: the overlay's other reads answer at once, with nothing to say.
    const leadDuties = (qc) => {
        const L = JiTA.leadduty;
        L.apps.refresh = () => Promise.resolve(null);
        L.ledger.read = () => Promise.resolve({ prop: null, value: null });
        L.reminder.mount = () => {};
        L.qc.claimMonth = () => Promise.resolve(qc);
    };
    // A month of quality control for schogol: rows still to judge, one checked (Undo), one flagged and since resolved by
    // another Lead (no Undo, so its action cell is empty), one with no status, and a summary far too long for a line.
    const qcMonth = () => {
        const L = JiTA.leadduty, ym = L._prevYm(), me = 'schogol', at = (d) => ym + '-' + d + 'T10:00:00.000Z';
        const items = [
            { key: 'EBR-101234', kind: 'report', summary: 'Client crashes when warping to a bookmark inside a wormhole while the rest of the fleet is still in warp, ' +
                'and again on every relog until the cache folder is deleted by hand, which the player only found out after three days of trying everything else first', status: 'Attached', created: at('03'), actor: 'ISD Distillery' },
            { key: 'EDR-23456', kind: 'defect', summary: 'Overview columns reset', status: 'Closed', created: at('05'), actor: 'ISD Astaris' },
            { key: 'EBR-99887', kind: 'report', summary: 'Market orders vanish after a session change', status: 'Attached', created: at('07'), actor: 'ISD Byteghost of the very long display name' },
            { key: 'EBR-7', kind: 'report', summary: 'Moved or deleted since', status: '', created: at('08'), actor: 'ISD Newcomer' },
            { key: 'PLAT-512', kind: 'defect', summary: 'Launcher update loops at 99%', status: 'Open', created: at('09'), actor: 'ISD Midshipman' }
        ];
        const done = {
            'EDR-23456': { verdict: 'ok', by: me, at: at('20'), actor: 'ISD Astaris' },
            'EBR-99887': { verdict: 'flag', by: me, at: at('21'), actor: 'ISD Byteghost of the very long display name', note: 'Should have gone to EDR-1' }
        };
        const flags = { 'EBR-99887': { ym: ym, by: me, at: at('21'), note: 'Should have gone to EDR-1', kind: 'report', resolvedBy: 'solnichka', resolvedAt: at('25') } };
        const record = { roster: ['lookuptable', 'schogol', 'solnichka'], quota: 10, poolSize: 41, minDefects: 2, poolDefects: 7, assign: { schogol: items.map((i) => i.key) } };
        return { ym: ym, record: record, items: items, done: done, shared: true, ledgerValue: { v: 1, months: {}, done: { [ym]: done }, flags: flags } };
    };
    window.__lc = { box: box, textRight: textRight, waitFor: waitFor, leadDuties: leadDuties, qcMonth: qcMonth };
}

// A page with the script loaded in it, and nothing of JiTA running but what a view starts.
async function scriptPage(b, jq, src, gm, res) {
    const page = await b.page({ width: W, height: H });
    await page.load(PAGE_HTML);
    await page.evaluate(jq + '\n;void 0;\n//# sourceURL=jquery.min.js');
    const version = (/^\/\/ @version\s+(\S+)/m.exec(src) || [])[1] || '';
    await page.evaluate('(' + prelude.toString() + ')(' + JSON.stringify(gm || {}) + ', ' + JSON.stringify(version) + ', ' + JSON.stringify(res || {}) + ')');
    await page.evaluate('window.__hideIdb()');
    let threw = null;
    try { await page.evaluate(src + '\n;void 0;\n//# sourceURL=JiTA.user.js', 60000); } catch (e) { threw = e; }
    await page.evaluate('window.__showIdb()');
    if (threw) { throw new Error('the userscript did not load: ' + threw.message); }
    if (await page.evaluate('!!(window.JiTA && JiTA.worker && JiTA.worker._started)')) {
        throw new Error('the Jira boot went past its indexedDB check, so the page runs JiTA for real: find another way to keep it still');
    }
    await page.evaluate('(' + helpers.toString() + ')()');
    return page;
}

// GM storage as a Lead's browser has it: who they are (so Lead duties opens), and the changelog read (so no pill).
const LEAD = { accountId: 'acc-me', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true, at: 0 };
const gmFor = (src) => ({ leadDutyMe: LEAD, jitaChangelogSeen: (/^\/\/ @version\s+(\S+)/m.exec(src) || [])[1] || '' });

// ================= 1. Lead duties, Members =================
// Six members: a short note (one line high), a long public note, a long internal note, someone who left, someone not on
// the team page (the ?), a month before joining (-), and this month so far.
async function membersView() {
    const L = JiTA.leadduty, M = L.members, U = L.ui, { box, textRight, waitFor } = window.__lc;
    window.__lc.leadDuties(window.__lc.qcMonth());
    const cur = L._ym(), wins = M.window(cur);   // newest first
    const LONG = 'Cross trained to NEC and back again, runs the Tuesday training sessions, covers the late shift while Astaris is away, and asked to hear before any change to the rota';
    const people = [   // account, name, the months newest first (null: not in the group yet), this month so far
        ['acc-me', 'ISD BH Schogol', [12, 44, 51, 38, 40, 47], 6],
        ['acc-dist', 'ISD Distillery', [55, 61, 48, 70, 52, 66], 9],
        ['acc-ast', 'ISD Astaris', [23, 40, 34, 15, 0, null], 4],
        ['acc-byte', 'ISD Byteghost', [0, 0, 0, 3, 12, 8], 0],
        ['acc-new', 'ISD Newcomer With A Rather Long Display Name', [104, null, null, null, null, null], 31],
        ['acc-mid', 'ISD Midshipman', [0, 0, 0, 0, 2, 0], null]
    ];
    const act = { v: 1, frozen: {}, a: {}, g: { 'acc-ast': { [wins[2]]: 4 } }, crawl: {}, roster: { at: L._bounds(wins[0]).end + 'T00:10:00.000Z', n: {} } };
    wins.forEach((ym) => { act.frozen[ym] = { at: L._bounds(ym).end + 'T00:10:00.000Z', by: 'schogol', n: people.length }; });
    people.forEach(([acc, name, months]) => {
        act.roster.n[acc] = name;
        months.forEach((n, i) => { if (n !== null) { (act.a[acc] = act.a[acc] || {})[wins[i]] = n; } });
    });
    const HEADER = ['Name', 'Defects Created', 'Defects Resolved', 'Reports Attached', 'Reports Trashed', 'Reports Reassigned', 'Total Actioned', 'Extra Credits', 'Credits Earned'];
    const counted = people.filter((p) => p[3] !== null);
    const live = { ym: cur, computedAt: new Date().toISOString(), header: HEADER, rows: {}, nameToAcc: {}, memberAccounts: {},
        table: counted.map((p) => [p[1], 0, 0, p[3], 0, 0, p[3], 0, 0]).concat([['Total', 0, 0, 0, 0, 0, 0, 0, 0]]) };
    counted.forEach((p) => { live.nameToAcc[p[1]] = p[0]; live.rows[p[1]] = { created: 0, resolved: 0, attached: p[3], trashed: 0, reassigned: 0 }; });
    const mem = { v: 1, m: {
        'acc-dist': { note: LONG, by: 'schogol', at: '2026-11-02' },
        'acc-byte': { role: M.LEFT, by: 'lookuptable', at: '2026-10-30' },
        'acc-new': { note: 'New in October', by: 'solnichka', at: '2026-10-12' }
    } };
    const team = { ranks: { 'acc-me': 'Lead', 'acc-dist': 'Senior', 'acc-ast': 'Bug Hunter', 'acc-mid': 'Rookie' }, names: {},
        notes: { 'acc-me': '<p>Founder</p>', 'acc-ast': '<p />' }, nameNotes: {}, stuck: {}, n: 4, tables: 1, version: 12 };
    const inotes = { v: 1, m: {
        'acc-ast': { t: 'Asked for a break until December', by: 'schogol', at: '2026-11-03' },
        'acc-dist': { t: 'Mentor', by: 'schogol', at: '2026-10-01' },
        'acc-mid': { t: LONG, by: 'lookuptable', at: '2026-10-20' }
    } };
    M.gather = () => Promise.resolve({ act: act, mem: mem, live: live, cur: cur, actVersion: 3, memVersion: 5, missing: [] });
    M.team = () => Promise.resolve(team);
    M.readInternal = () => Promise.resolve({ value: inotes, version: 2 });
    U.open('members');
    await waitFor(() => document.querySelectorAll('#ld-body .ld-mrow:not(.ld-mhead)').length === people.length, 'the member rows');
    const cells = (row) => Array.prototype.map.call(row.children, (el) => ({ cls: el.className, box: box(el), sw: el.scrollWidth, cw: el.clientWidth,
        tr: el.tagName === 'SELECT' ? null : textRight(el), text: el.tagName === 'SELECT' ? el.value : el.textContent }));
    const head = document.querySelector('#ld-body .ld-mhead');
    return { head: cells(head),
        rows: Array.prototype.map.call(document.querySelectorAll('#ld-body .ld-mrow:not(.ld-mhead)'), (r) => ({ key: r.getAttribute('data-key'), box: box(r), cells: cells(r) })) };
}
function membersChecks(m) {
    const has = (c, cls) => (' ' + c.cls + ' ').indexOf(' ' + cls + ' ') >= 0;
    const pub = (cells) => cells.filter((c) => has(c, 'ld-mnote') && !has(c, 'ld-minote'))[0];
    const inn = (cells) => cells.filter((c) => has(c, 'ld-minote'))[0];
    const nums = (cells) => cells.filter((c) => has(c, 'ld-mnum'));
    const row = (key) => m.rows.filter((r) => r.key === key)[0];
    ok('Members: six members under a header of 14 columns, each row with as many', m.rows.length === 6 && m.head.length === 14 &&
        m.rows.every((r) => r.cells.length === 14) && !!pub(m.head) && !!inn(m.head) && nums(m.head).length === 7,
        m.rows.length + ' rows, header ' + m.head.map((c) => c.cls).join(' | '));
    if (m.rows.length !== 6 || m.head.length !== 14 || !m.rows.every((r) => r.cells.length === 14) || !pub(m.head) || !inn(m.head)) { return; }
    let off = [];
    m.rows.forEach((r) => {
        if (!near(pub(r.cells).box.l, pub(m.head).box.l)) { off.push(r.key + ' public note at x ' + r1(pub(r.cells).box.l) + ', header at ' + r1(pub(m.head).box.l)); }
        if (!near(inn(r.cells).box.l, inn(m.head).box.l)) { off.push(r.key + ' internal note at x ' + r1(inn(r.cells).box.l) + ', header at ' + r1(inn(m.head).box.l)); }
    });
    ok('Members: in every row the public and the internal note start where their headers do', !off.length, off.join('; '));
    const widths = [pub(m.head), inn(m.head)].concat(...m.rows.map((r) => [pub(r.cells), inn(r.cells)])).map((c) => c.box.w);
    ok('Members: the two note columns are as wide as each other in every row and in the header', spread(widths) <= PX && widths[0] > 40,
        'widths ' + widths.map(r1).join(', '));
    // Against the header's column rather than its text: a header in a wider font than Windows' can run past its cell.
    off = [];
    m.rows.forEach((r) => {
        nums(r.cells).forEach((c, i) => {
            const h = nums(m.head)[i];
            if (!near(c.tr, h.box.r) || !near(c.box.r, h.box.r)) { off.push(r.key + ' "' + c.text + '" ends at x ' + r1(c.tr) + ', the ' + h.text + ' column at ' + r1(h.box.r)); }
        });
    });
    ok('Members: each month\'s numbers end at the right edge of its header\'s column, this month so far too', !off.length, off.slice(0, 6).join('; '));
    off = [];
    m.rows.forEach((r) => {
        r.cells.forEach((c, i) => { if (!near(c.box.l, m.head[i].box.l)) { off.push(r.key + ' ' + c.cls + ' at x ' + r1(c.box.l) + ', its header at ' + r1(m.head[i].box.l)); } });
    });
    ok('Members: every column of every row starts where its header does', !off.length, off.slice(0, 6).join('; '));
    const one = row('acc-me'), longs = [[row('acc-dist'), pub], [row('acc-mid'), inn]];
    const bad = longs.filter(([r, which]) => !r || !(which(r.cells).sw > which(r.cells).cw + 20) || !near(r.box.h, one.box.h))
        .map(([r, which]) => r ? (r.key + ': its note ' + which(r.cells).sw + ' px wide in ' + which(r.cells).cw + ', the row ' + r1(r.box.h) + ' px high against ' + r1(one.box.h)) : 'a row is missing');
    ok('Members: a long note is cut short, and its row is as tall as a one-line row', !!one && !bad.length, bad.join('; '));
}

// ================= 2. The result cards in the Triage Assistant's sidebar grid =================
// Six cards in a 400 px list: long and short summaries side by side, one with no date, one whose status is far too long.
async function cardsView() {
    const { box } = window.__lc;
    JiTA.ui.injectCss();
    const $g = $('<div id="jita-side-group"></div>').css({ width: '400px', margin: '20px' }).appendTo(document.body);
    const $ul = $('<ul id="jita-sd-list"></ul>').appendTo($g);
    [
        { key: 'EDR-48213', pct: 91, status: 'Open', created: '2026-06-12T10:00:00.000+0000', excHit: 'exact',
            summary: 'Ships warping to a bookmark inside a wormhole land 200 km off grid, and the overview keeps showing the old system until a session change' },
        { key: 'EDR-3', pct: 74, status: 'Ready for Deployment', created: '2025-03-06T10:00:00.000+0000', summary: 'Short' },
        { key: 'EO-777', pct: 63, status: 'Closed', resolution: 'Fixed', created: null, summary: 'A defect with no created date at all' },
        { key: 'PLAT-31', pct: 58, status: 'Waiting for the next launcher build to reach the test servers and be verified there by QA', created: '2026-10-01T10:00:00.000+0000',
            staleNote: 'fixed 4 months before this report', summary: 'Launcher update loops at 99%' },
        { key: 'EDR-91', pct: 42, status: 'In Progress', created: '2026-09-20T10:00:00.000+0000',
            summary: 'The fitting window drops a module when it is dragged onto an offline slot while the ship is docked in a citadel' },
        { key: 'EDR-1204', pct: 37, status: 'Blocked', created: '2026-01-02T10:00:00.000+0000', summary: 'Small' }
    ].forEach((r) => { JiTA.ui._item(r).appendTo($ul); });
    const px = (v) => parseFloat(v) || 0;
    return { list: box(document.getElementById('jita-sd-list')), cards: Array.prototype.map.call(document.querySelectorAll('#jita-side-group #jita-sd-list > li'), (li) => {
        const cs = getComputedStyle(li), f = li.querySelector('.jita-foot'), fs = f && getComputedStyle(f), d = li.querySelector('.jita-foot-date');
        return { key: li.getAttribute('data-jita-key'), box: box(li), padR: px(cs.paddingRight) + px(cs.borderRightWidth), padB: px(cs.paddingBottom) + px(cs.borderBottomWidth),
            foot: f ? { box: box(f), padT: px(fs.paddingTop), lh: px(fs.lineHeight), kids: Array.prototype.map.call(f.children, (k) => ({ cls: k.className, box: box(k) })) } : null,
            date: d ? box(d) : null };
    }) };
}
function cardsChecks(m) {
    const cards = m.cards, lefts = [];
    cards.forEach((c) => { if (!lefts.some((l) => near(l, c.box.l))) { lefts.push(c.box.l); } });
    ok('Cards: six cards in two columns of a ' + Math.round(m.list.w) + ' px list', cards.length === 6 && lefts.length === 2 && cards.every((c) => c.foot),
        cards.length + ' cards at x ' + cards.map((c) => r1(c.box.l)).join(', '));
    if (cards.length !== 6 || !cards.every((c) => c.foot)) { return; }
    let off = cards.filter((c) => !(c.foot.box.h - c.foot.padT <= c.foot.lh + PX) || c.foot.kids.some((k) => !(k.box.h <= c.foot.lh + PX)))
        .map((c) => c.key + ': footer ' + r1(c.foot.box.h) + ' px high (' + c.foot.padT + ' px of it padding, lines ' + c.foot.lh + ' px)');
    ok('Cards: every footer is one line high, a long status cut short rather than wrapped', !off.length, off.join('; '));
    const rows = [];
    cards.forEach((c) => { const row = rows.filter((x) => near(x[0].box.t, c.box.t))[0]; if (row) { row.push(c); } else { rows.push([c]); } });
    off = [];
    rows.forEach((row) => {
        if (spread(row.map((c) => c.foot.box.b)) > PX) { off.push(row.map((c) => c.key + ' footer ends at y ' + r1(c.foot.box.b)).join(', ')); }
        row.forEach((c) => { if (!near(c.foot.box.b, c.box.b - c.padB)) { off.push(c.key + ' footer ends at y ' + r1(c.foot.box.b) + ', the card at ' + r1(c.box.b - c.padB)); } });
    });
    ok('Cards: the footers of a row share one bottom, the bottom of their cards', rows.length === 3 && !off.length, rows.length + ' rows; ' + off.join('; '));
    const dated = cards.filter((c) => c.date);
    off = dated.filter((c) => !near(c.date.r, c.box.r - c.padR)).map((c) => c.key + ' date ends at x ' + r1(c.date.r) + ', the card at ' + r1(c.box.r - c.padR));
    ok('Cards: the date ends at the right edge of its card', dated.length === 5 && !off.length, dated.length + ' dated; ' + off.join('; '));
}

// ================= 3. Settings =================
// Every tab clicked in turn: the box, and every tab button, measured with each open.
async function settingsView() {
    const { box } = window.__lc;
    JiTA.menu.open();
    const menu = document.getElementById('jita-menu'), tabs = Array.prototype.slice.call(menu.querySelectorAll('.jita-menu-tab'));
    const states = tabs.map((t) => {
        t.click();
        return { open: (menu.querySelector('.jita-menu-tab.on') || {}).textContent || '', box: box(menu), tabs: tabs.map(box) };
    });
    return { names: tabs.map((t) => t.getAttribute('data-tab')), labels: tabs.map((t) => t.textContent), states: states };
}
function settingsChecks(m) {
    const st = m.states;
    ok('Settings: a Lead has its five tabs, each opening when clicked', m.names.join(',') === 'features,triage,responses,lead,about' &&
        st.length === 5 && st.every((s, i) => s.open === m.labels[i]), m.names.join(',') + ' / opened ' + st.map((s) => s.open).join(','));
    if (!st.length) { return; }
    ok('Settings: the box keeps its width and height on every tab', spread(st.map((s) => s.box.w)) <= PX && spread(st.map((s) => s.box.h)) <= PX,
        st.map((s) => s.open + ' ' + r1(s.box.w) + 'x' + r1(s.box.h)).join(', '));
    const off = [];
    st[0].tabs.forEach((t, i) => {
        if (spread(st.map((s) => s.tabs[i].l)) > PX || spread(st.map((s) => s.tabs[i].w)) > PX) {
            off.push(m.names[i] + ' at x ' + st.map((s) => r1(s.tabs[i].l)).join('/') + ', ' + st.map((s) => r1(s.tabs[i].w)).join('/') + ' wide');
        }
    });
    ok('Settings: the tab buttons keep their places whichever tab is open', !off.length, off.join('; '));
}

// ================= 4. Lead duties, Quality control =================
async function qcView() {
    const U = JiTA.leadduty.ui, { box, waitFor } = window.__lc, month = window.__lc.qcMonth();
    window.__lc.leadDuties(month);
    U.open('qc');
    await waitFor(() => document.querySelectorAll('#ld-body .ld-row.ld-qc').length === month.items.length, 'the quality control rows');
    return Array.prototype.map.call(document.querySelectorAll('#ld-body .ld-row.ld-qc'), (r) => {
        const q = (s) => r.querySelector(s), sum = q('.ld-sum');
        return { key: r.getAttribute('data-key'), done: r.classList.contains('done'), buttons: r.querySelectorAll('.ld-act button').length,
            key_: box(q('.ld-key')), sum: box(sum), st: box(q('.ld-stcol')), who: box(q('.ld-who')), act: box(q('.ld-act')),
            sumSw: sum.scrollWidth, sumCw: sum.clientWidth };
    });
}
function qcChecks(rows) {
    const n = (b) => rows.filter((r) => r.buttons === b).length;
    ok('Quality control: rows still to judge, checked, and flagged with nothing left to do, drawn with every column', rows.length === 5 && n(2) === 3 && n(1) === 1 && n(0) === 1 &&
        rows.every((r) => r.key_ && r.sum && r.st && r.who && r.act), rows.map((r) => r.key + ':' + r.buttons + (r.st ? '' : ' (no status column)')).join(', '));
    if (rows.length !== 5) { return; }
    const off = [];
    [['key', 'key_'], ['status', 'st'], ['handler', 'who']].forEach(([name, k]) => {
        if (!rows.every((r) => r[k]) || spread(rows.map((r) => r[k].l)) > PX) {
            off.push(name + ' at x ' + rows.map((r) => r.key + ' ' + (r[k] ? r1(r[k].l) : 'none')).join(', '));
        }
    });
    ok('Quality control: the key, status and handler columns start at the same x on every row, open or checked', !off.length, off.join('; '));
    ok('Quality control: the action column keeps its width on a row with no buttons', rows.every((r) => r.act) && spread(rows.map((r) => r.act.w)) <= PX && rows[0].act.w > 0,
        rows.map((r) => r.key + ' ' + (r.act ? r1(r.act.w) : 'none')).join(', '));
    const long = rows.filter((r) => r.key === 'EBR-101234')[0], short = rows.filter((r) => r.key === 'EDR-23456')[0];
    ok('Quality control: a long summary is cut to one line', !!long && !!short && long.sumSw > long.sumCw + 20 && near(long.sum.h, short.sum.h),
        long && short ? (long.sumSw + ' px of text in ' + long.sumCw + ', ' + r1(long.sum.h) + ' px high against ' + r1(short.sum.h)) : 'a row is missing');
}

// ================= 5. Lead duties, every tab =================
// Every tab clicked in turn, each with what the fixtures give it (five quality control rows, an empty Follow-ups, the
// wiki and the members unreadable): the window, the tab buttons and the content area, measured with each open. Before
// v3.53.9 the window was as high as the open tab's content and stood in the middle of the page, so the tabs moved.
async function ldTabsView() {
    const U = JiTA.leadduty.ui, { box } = window.__lc;
    window.__lc.leadDuties(window.__lc.qcMonth());
    U.open('wiki');
    const menu = document.getElementById('jita-menu'), tabs = Array.prototype.slice.call(menu.querySelectorAll('.ld-tab'));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const states = [];
    for (const t of tabs) {
        t.click();
        await wait(300);   // what each tab reads answers at once or fails at once (no network here)
        const body = document.getElementById('ld-body'), top = body.getBoundingClientRect().top;
        // How far the tab's own content reaches (its scrollHeight is the area's height while the content is shorter).
        const content = Array.prototype.reduce.call(body.children, (m, c) => Math.max(m, c.getBoundingClientRect().bottom - top), 0);
        states.push({ tab: t.getAttribute('data-tab'), on: t.classList.contains('on'), box: box(menu), tabs: tabs.map(box), body: box(body), content: Math.round(content) });
    }
    // Then the Applications list, long enough to scroll, and a Members tab after it (the list's fill must not stay on).
    const L = JiTA.leadduty, people = [];
    for (let i = 0; i < 40; i++) { people.push({ id: 'A' + i, name: 'ISD Applicant ' + i, url: '#', state: 'Pending', applied: '2026-11-01' }); }
    L.apps.list = () => Promise.resolve({ ok: true, items: people });
    L.apps.adopt = () => Promise.resolve(null);
    L.apps.detail = () => new Promise(() => {});   // the application stays "Loading"
    const tab = (name) => tabs.filter((t) => t.getAttribute('data-tab') === name)[0];
    tab('apps').click();
    await wait(300);
    const body = document.getElementById('ld-body'), wrap = body.querySelector('.ld-apps-wrap'), list = body.querySelector('.ld-apps-list');
    const apps = { box: box(menu), body: box(body), wrap: box(wrap), padB: parseFloat(getComputedStyle(body).paddingBottom),
        rows: list ? list.children.length : 0, listSh: list ? list.scrollHeight : 0, listCh: list ? list.clientHeight : 0, bodyOver: body.scrollHeight - body.clientHeight };
    tab('members').click();
    await wait(300);
    apps.after = { fill: body.classList.contains('ld-fill'), overflow: getComputedStyle(body).overflowY };
    // A count on a tab, as a ledger read puts it there: the tab is as wide in bold (open) as not.
    const open = {};
    for (let i = 0; i < 12; i++) { open['EBR-' + i] = { ym: L._prevYm(), by: 'schogol', at: '2026-11-0' + (i % 9 + 1) + 'T10:00:00Z', note: 'x' }; }
    L.ui._tabCount({ v: 1, months: {}, done: {}, flags: open });
    const fl = tab('flags'), widths = [];
    fl.classList.remove('on'); widths.push(fl.getBoundingClientRect().width);
    fl.classList.add('on'); widths.push(fl.getBoundingClientRect().width);
    fl.classList.remove('on');
    const count = { text: fl.textContent, widths: widths };
    return { vh: window.innerHeight, states: states, apps: apps, count: count };
}
function ldTabsChecks(m) {
    const st = m.states;
    ok('Lead duties: its five tabs, each opening when clicked', st.length === 5 && st.map((s) => s.tab).join(',') === 'wiki,qc,flags,apps,members' && st.every((s) => s.on),
        st.map((s) => s.tab + (s.on ? '' : ' (not opened)')).join(','));
    if (!st.length) { return; }
    ok('Lead duties: the tabs hold contents of different heights (so the next checks measure something)', spread(st.map((s) => s.content)) > 50,
        st.map((s) => s.tab + ' ' + s.content).join(', '));
    ok('Lead duties: the window keeps its place and its size on every tab', spread(st.map((s) => s.box.t)) <= PX && spread(st.map((s) => s.box.h)) <= PX && spread(st.map((s) => s.box.w)) <= PX,
        st.map((s) => s.tab + ' top ' + r1(s.box.t) + ', ' + r1(s.box.w) + 'x' + r1(s.box.h)).join('; '));
    ok('...as high as the most a JiTA window takes, 82% of the page', Math.abs(st[0].box.h - 0.82 * m.vh) <= 3, r1(st[0].box.h) + ' px of ' + m.vh);
    const off = [];
    st[0].tabs.forEach((t, i) => {
        if (spread(st.map((s) => s.tabs[i].t)) > PX || spread(st.map((s) => s.tabs[i].l)) > PX) {
            off.push(st[i].tab + ' at ' + st.map((s) => r1(s.tabs[i].l) + ',' + r1(s.tabs[i].t)).join(' / '));
        }
    });
    ok('Lead duties: the tab buttons keep their places whichever tab is open', !off.length, off.join('; '));
    ok('...and so does the content area, filling the window between the tabs and the footer', spread(st.map((s) => s.body.t)) <= PX && spread(st.map((s) => s.body.h)) <= PX && st[0].body.h > 0.6 * m.vh,
        st.map((s) => s.tab + ' ' + r1(s.body.t) + '+' + r1(s.body.h)).join('; '));
    const c = m.count;
    ok('Lead duties: a tab with a count is as wide open (in bold) as not', c.text === 'Follow-ups (12)' && near(c.widths[0], c.widths[1]), c.text + ': ' + c.widths.map(r1).join(' / '));
    const a = m.apps;
    ok('Lead duties, Applications: a long list keeps the window as it is', !!a.wrap && a.rows >= 40 && near(a.box.h, st[0].box.h) && near(a.box.t, st[0].box.t),
        a.wrap ? (a.rows + ' rows, ' + r1(a.box.t) + '+' + r1(a.box.h) + ' against ' + r1(st[0].box.t) + '+' + r1(st[0].box.h)) : 'no list drawn');
    if (!a.wrap) { return; }
    ok('...the list scrolls on its own, and the tab itself does not', a.listSh > a.listCh + 50 && a.bodyOver <= 1, 'list ' + a.listSh + ' in ' + a.listCh + ', tab ' + a.bodyOver + ' px over');
    ok('...the list and the application reach the bottom of the tab', Math.abs(a.wrap.b - (a.body.b - a.padB)) <= 1, 'they end at ' + r1(a.wrap.b) + ', the tab at ' + r1(a.body.b - a.padB));
    ok('...and the next tab scrolls as one again', !a.after.fill && a.after.overflow === 'auto', JSON.stringify(a.after));
}

// ================= 6. settings.yaml as the in-game Settings window =================
// The igbr.zip viewer's code-block holding a settings.yaml (tests/settings-fixture.yaml), swapped for the window as the log
// parser does it (JiTA.settingsview.mount). Its host is only as wide as what it holds, as Jira's viewer is. Then every tab
// clicked, the filter on and off, a search, Everything else's groups opened (one holds a value with an <img> tag in it),
// Show raw and back, and Copy. Last, the host moved right, leaving the window little room on the screen.
async function setvView(fixture) {
    const { box } = window.__lc, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const host = document.createElement('div'), cb = document.createElement('code');
    host.style.cssText = 'position: relative; display: inline-block; margin: 60px 16px 0;';
    cb.setAttribute('data-testid', 'code-block');
    cb.style.cssText = 'display: block; white-space: pre; font-family: monospace;';
    cb.textContent = fixture;
    host.appendChild(cb);
    document.body.appendChild(host);
    let copied = null;
    JiTA.util.copy = (t) => { copied = t; return Promise.resolve(); };
    JiTA.settingsview.mount();
    const el = document.getElementById('jita-setv');
    if (!el) { return { mounted: false }; }
    const shown = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
    const all = (sel) => Array.prototype.slice.call(el.querySelectorAll(sel));
    const tabs = all('.jsv-tab'), rows = () => all('.jsv-panel .jsv-row').filter((r) => !r.classList.contains('jsv-hid'));
    const total = all('.jsv-panel .jsv-row').length;
    const opened = tabs.map((t) => {
        t.click();
        return { tab: t.getAttribute('data-tab'), panels: all('.jsv-panel').filter(shown).map((p) => p.getAttribute('data-panel')), on: all('.jsv-tab.jsv-on').map((x) => x.getAttribute('data-tab')),
            w: el.getBoundingClientRect().width };
    });
    tabs[0].click();
    const sizes = { el: box(el), nav: box(el.querySelector('.jsv-nav')), main: box(el.querySelector('.jsv-main')), vh: window.innerHeight, overX: el.scrollWidth - el.clientWidth,
        mainScrolls: getComputedStyle(el.querySelector('.jsv-main')).overflowY };
    const only = el.querySelector('.jsv-only');
    only.click();
    const filtered = { rows: rows().length, changed: rows().filter((r) => r.classList.contains('jsv-chg')).length, dim: tabs.filter((t) => t.classList.contains('jsv-dim')).map((t) => t.getAttribute('data-tab')) };
    only.click();
    const unfiltered = rows().length;
    const q = el.querySelector('.jsv-q');
    q.value = 'turret';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    const searched = rows().map((r) => r.getAttribute('data-q'));
    q.value = 'quotein';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    const restHits = all('.jsv-hits .jsv-rrow').map((r) => r.textContent);
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    el.querySelector('.jsv-tab[data-tab="rest"]').click();
    all('.jsv-group').forEach((g) => { g.open = true; });
    await wait(100);
    const groups = all('.jsv-group').map((g) => ({ id: g.getAttribute('data-g'), rows: g.querySelectorAll('.jsv-rrow').length }));
    const imgs = document.querySelectorAll('#jita-setv img').length;
    const rawBtn = el.querySelector('.jsv-rawbtn'), raw = el.querySelector('.jsv-raw');
    rawBtn.click();
    const rawOpen = { shown: shown(raw), same: raw.textContent === fixture, bodyHidden: !shown(el.querySelector('.jsv-body')), label: rawBtn.textContent };
    rawBtn.click();
    const rawShut = { hidden: !shown(raw), bodyShown: shown(el.querySelector('.jsv-body')), label: rawBtn.textContent };
    el.querySelector('.jsv-copy').click();
    await wait(50);
    host.style.marginLeft = (window.innerWidth - 600) + 'px';
    window.dispatchEvent(new Event('resize'));
    const narrow = { w: el.getBoundingClientRect().width, room: window.innerWidth - el.getBoundingClientRect().left - 12, overX: el.scrollWidth - el.clientWidth };
    return { mounted: true, narrow: narrow, total: total, opened: opened, sizes: sizes, filtered: filtered, unfiltered: unfiltered, searched: searched, restHits: restHits, groups: groups, imgs: imgs,
        rawOpen: rawOpen, rawShut: rawShut, copiedSame: copied === fixture, status: el.querySelector('.jsv-status').textContent };
}
function setvChecks(m) {
    ok('Settings window: settings.yaml\'s code-block is swapped for it', m.mounted, 'no #jita-setv after mount()');
    if (!m.mounted) { return; }
    const s = m.sizes;
    ok('Settings window: it fills the screen below its top, the left list 230 px wide, the controls beside it scrolling on their own',
        s.el.b <= s.vh + PX && s.el.h >= 320 && near(s.nav.w, 230) && s.main.l >= s.nav.r - PX && s.mainScrolls === 'auto', JSON.stringify(s));
    ok('Settings window: nothing reaches past its right edge', s.overX <= 0, s.overX + ' px over');
    const widths = m.opened.map((o) => r1(o.w));
    ok('Settings window: 950 px wide on every tab, in a code-block only as wide as what it holds', widths.every((w) => near(w, 950)), JSON.stringify(widths));
    ok('Settings window: with less room on the screen, it stops 12 px short of the right edge, and nothing reaches past its own',
        near(m.narrow.w, m.narrow.room) && m.narrow.overX <= 0, JSON.stringify(m.narrow));
    const bad = m.opened.filter((o) => o.panels.length !== 1 || o.panels[0] !== o.tab || o.on.length !== 1 || o.on[0] !== o.tab);
    ok('Settings window: every entry on the left shows its own tab, and only it, highlighted', m.opened.length >= 18 && !bad.length, JSON.stringify(bad.slice(0, 3)));
    ok('Settings window: "Only changed from default" leaves the changed rows only, and dims what has none (Camera)', m.filtered.rows > 5 && m.filtered.rows === m.filtered.changed &&
        m.filtered.dim.indexOf('camera') >= 0 && m.filtered.dim.indexOf('rest') < 0, JSON.stringify(m.filtered));
    ok('Settings window: ...and off again, every row is back', m.unfiltered === m.total, m.unfiltered + ' of ' + m.total);
    ok('Settings window: a search leaves the rows it names (turret)', m.searched.length >= 2 && m.searched.every((q) => q.indexOf('turret') >= 0), JSON.stringify(m.searched));
    ok('Settings window: ...and finds a key in Everything else (quoteIn)', m.restHits.length === 1 && /quoteIn/.test(m.restHits[0]), JSON.stringify(m.restHits));
    ok('Settings window: Everything else draws a group when it is opened, and a value\'s tag is text, never an element', m.groups.length >= 3 && m.groups.every((g) => g.rows > 0) && m.imgs === 0,
        JSON.stringify(m.groups) + ', ' + m.imgs + ' <img>');
    ok('Settings window: Show raw shows the file exactly as it is, in place of the window', m.rawOpen.shown && m.rawOpen.same && m.rawOpen.bodyHidden && m.rawOpen.label === 'Show settings', JSON.stringify(m.rawOpen));
    ok('Settings window: ...and back', m.rawShut.hidden && m.rawShut.bodyShown && m.rawShut.label === 'Show raw', JSON.stringify(m.rawShut));
    ok('Settings window: Copy copies the file exactly as it is', m.copiedSame && m.status === 'Copied.', m.status);
}

// ================= 7. Player actions in the igbr.zip viewer =================
// The viewer as Jira drew it in November 2026 (a snapshot, rebuilt with its sizes): the file name and size in the top bar,
// archive-layout holding the 300 px file list (a row a file: its button, and a download button beside it) and the pane
// beside it, the open file from 75 px down. JiTA.acts puts its entry in (the script's own poller, and ensure() called
// again), a click opens the list (load() handing over a made-up logs.txt and methodcalls.txt), the search and Copy are
// tried, then a click on a file of the archive, and on the arrow to the next attachment, puts the viewer back. The "Defects
// in log" panel of a logs.txt opened before hides while the list shows and comes back with the log (v3.55.2). Last, an
// archive with another name, and one without logs.txt, lose the entry.
async function actsView(files) {
    const { box } = window.__lc, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const row = (name) => '<div class="row" style="display: flex; align-items: center; height: 46px; padding-bottom: 6px; box-sizing: border-box; cursor: pointer;">' +
        '<div style="width: 85%;"><button type="button" style="display: flex; align-items: center; width: 100%; height: 40px; padding: 8px; background: none; border: 0; color: inherit; font: inherit; text-align: left;">' +
        '<span style="display: flex; align-items: center; gap: 12px;"><span data-item-elem-before="true" style="display: flex; width: 24px; height: 24px;"><span data-testid="file-type-icon">' +
        '<span role="img" aria-label="media-type"><svg width="24" height="24"></svg></span></span></span><div><span data-item-title="true">' + name + '</span></div></span></button></div>' +
        '<button aria-label="Download Media" data-testid="media-archiveDownloadButton" style="width: 39px; height: 40px;"><span role="img" aria-label="Download"></span></button></div>';
    const names = ['logs.txt', 'processHealth.txt', 'methodcalls.txt', 'outstandingcalls.txt', 'fitting.txt', 'settings.yaml', 'dxdiag.txt'];
    document.body.insertAdjacentHTML('beforeend', '<div data-testid="media-viewer-popup" role="dialog" style="position: fixed; inset: 0; background: #1d2125; color: #c7d1db;">' +
        '<div style="position: absolute; top: 0; left: 0; right: 0; height: 98px; z-index: 2; pointer-events: none;"><h1 data-testid="media-viewer-file-name" style="position: absolute; left: 368px; top: 24px; margin: 0; font-size: 14px;">igbr.zip</h1>' +
        '<div data-testid="media-viewer-file-metadata-text" style="position: absolute; left: 368px; top: 44px;"><span>archive</span>· 128 KB</div></div>' +
        '<div data-testid="archive-layout" style="position: absolute; inset: 0; display: flex;">' +
        '<div class="side" style="position: absolute; left: 0; top: 0; bottom: 0; width: 300px; padding: 22px 20px; box-sizing: border-box;">' +
        '<button type="button" class="home" style="width: 260px; height: 40px;"><span><div><span data-item-title="true"><span role="img" aria-label="Home"></span></span></div></span></button>' +
        '<div style="height: 2px; margin: 16px 0; background: #333;"></div><div data-testid="archive-sidebar-folder-wrapper">' + names.map(row).join('') + '</div></div>' +
        '<div class="pane" style="position: absolute; top: 0; left: 300px; right: 0; bottom: 0; display: flex; align-items: center;"><div class="inner" style="width: 100%; height: 100%;">' +
        '<div style="height: 75px;"></div><span data-testid="code-block" style="display: block;">fitting.txt as Jira shows it</span></div></div></div>' +
        '<div id="media-viewer-navigation"><button type="button" class="next" data-testid="media-viewer-navigation-next">next</button></div></div>');
    let copied = null;
    JiTA.util.copy = (t) => { copied = t; return Promise.resolve(); };
    JiTA.acts.load = () => Promise.resolve(files);
    const list = document.querySelector('[data-testid="archive-sidebar-folder-wrapper"]'), pane = document.querySelector('.pane'), inner = document.querySelector('.inner');
    const title = (r) => r.querySelector('[data-item-title]');
    await wait(700);   // the script's own poller has found the list by now
    JiTA.acts.ensure();
    JiTA.acts.ensure();
    const entries = list.querySelectorAll('.jita-acts-entry'), entry = entries[0];
    if (!entry) { return { entry: false }; }
    const logsRow = Array.prototype.find.call(list.children, (r) => r !== entry && title(r).textContent === 'logs.txt');
    const look = { count: entries.length, first: list.firstElementChild === entry, beforeLogs: entry.nextElementSibling === logsRow, name: title(entry).textContent,
        icon: (entry.querySelector('.jita-acts-ico') || {}).textContent || '', buttons: entry.querySelectorAll('button').length, download: entry.querySelectorAll('[data-testid="media-archiveDownloadButton"]').length,
        rows: list.children.length, box: box(entry), logsBox: box(logsRow), titleL: box(title(entry)).l, logsTitleL: box(title(logsRow)).l };
    entry.querySelector('button').click();
    await wait(150);
    const el = document.getElementById('jita-acts');
    if (!el) { return { entry: true, look: look, opened: false }; }
    const all = (sel) => Array.prototype.slice.call(el.querySelectorAll(sel));
    const shownRows = () => all('tbody tr.jpa-r').filter((r) => getComputedStyle(r).display !== 'none');
    const open = { inPane: el.parentNode === pane, box: box(el), pane: box(pane), vw: window.innerWidth, vh: window.innerHeight, rows: all('tbody tr.jpa-r').length,
        innerHidden: getComputedStyle(inner).visibility, codeHidden: getComputedStyle(document.querySelector('[data-testid="code-block"]')).visibility,
        on: entry.classList.contains('jita-acts-on'), bodyScrolls: getComputedStyle(el.querySelector('.jpa-body')).overflowY, top: box(el.querySelector('.jpa-top')) };
    // The list as drawn, measured on its own elements. Then logs.txt as opened before: the log parser's view stays in the pane,
    // hidden, with its page-wide CSS (td { font-size: 11px; border-right: ... }), and so do rules any page could have. The list
    // must look the same.
    const looks = () => {
        const cs = (n) => getComputedStyle(n), r = all('tbody tr.jpa-r')[0], a = r.querySelector('.jpa-a'), th = el.querySelector('.jpa-t th'), copy = el.querySelector('.jpa-copy');
        return { rowH: Math.round(r.getBoundingClientRect().height * 10) / 10, aFont: cs(a).fontSize, aLine: cs(a).borderRightWidth + ' ' + cs(a).borderRightStyle, aWrap: cs(a).whiteSpace,
            thWeight: cs(th).fontWeight, thBg: cs(th).backgroundColor, label: cs(el.querySelector('.jpa-errlbl')).color, copy: cs(copy).fontSize + ' ' + cs(copy).color };
    };
    const clean = looks();
    document.querySelector('[data-testid="code-block"]').insertAdjacentHTML('beforeend', JiTA.logparser.view('log') +
        '<style>td, th { font-size: 9px; border: 2px solid red; padding: 9px; } button, input, label { font-size: 20px; color: red; } * { color: red; }</style>');
    await wait(50);
    const leaked = looks();
    // The "Defects in log" panel of that logs.txt, drawn now (as a sync's rematch would), stays out of sight; and as on the
    // screenshot of November 2026 (opened with logs.txt, then the list), goes and comes back with the list, at once.
    const logPanel = () => { const p = document.getElementById('jita-logmatch-panel'); return p ? getComputedStyle(p).display : 'gone'; };
    JiTA.logsig.renderPanel({ 'EDR-1': { count: 1, rows: [], raw: 'KeyError' } });
    const panelDrawn = logPanel();
    const q = el.querySelector('.jpa-q');
    q.value = 'stargate';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    const searched = shownRows().map((r) => r.textContent);
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    el.querySelector('.jpa-copy').click();
    await wait(50);
    title(logsRow).closest('button').click();
    await wait(50);
    const back = { gone: !document.getElementById('jita-acts'), paneClass: pane.classList.contains('jita-acts-open'), innerShown: getComputedStyle(inner).visibility, on: entry.classList.contains('jita-acts-on') };
    const panelBack = logPanel();
    entry.querySelector('button').click();
    const panelOpen = logPanel();
    await wait(150);
    const reopened = !!document.getElementById('jita-acts');
    document.querySelector('.next').click();
    await wait(50);
    const nav = !document.getElementById('jita-acts');
    document.querySelector('[data-testid="media-viewer-file-name"]').textContent = 'other.zip';
    JiTA.acts.ensure();
    const otherZip = list.querySelectorAll('.jita-acts-entry').length;
    document.querySelector('[data-testid="media-viewer-file-name"]').textContent = 'igbr.zip';
    JiTA.acts.ensure();
    const backAgain = list.querySelectorAll('.jita-acts-entry').length;
    logsRow.parentNode.removeChild(logsRow);
    JiTA.acts.ensure();
    const noLogs = list.querySelectorAll('.jita-acts-entry').length;
    return { entry: true, look: look, opened: true, open: open, clean: clean, leaked: leaked, searched: searched, copied: copied, status: el.querySelector('.jpa-status').textContent, back: back, reopened: reopened, nav: nav,
        otherZip: otherZip, backAgain: backAgain, noLogs: noLogs, panel: { drawn: panelDrawn, back: panelBack, open: panelOpen } };
}
function actsChecks(m) {
    ok('Player actions: the entry is put into an igbr.zip\'s file list', m.entry, 'no .jita-acts-entry');
    if (!m.entry) { return; }
    const l = m.look;
    ok('Player actions: one entry, first, above logs.txt, however often the list is looked at', l.count === 1 && l.first && l.beforeLogs && l.rows === 8, JSON.stringify(l));
    ok('Player actions: named, with its own symbol, and no download button', l.name === 'Player actions' && l.icon === '☰' && l.buttons === 1 && l.download === 0, JSON.stringify(l));
    ok('Player actions: the entry sits like the other rows (as tall, the name where theirs is)', near(l.box.h, l.logsBox.h) && near(l.box.l, l.logsBox.l) && near(l.titleL, l.logsTitleL),
        JSON.stringify({ box: l.box, logs: l.logsBox, titleL: l.titleL, logsTitleL: l.logsTitleL }));
    ok('Player actions: a click opens the list in the pane', m.opened, 'no #jita-acts after the click');
    if (!m.opened) { return; }
    const o = m.open;
    ok('Player actions: the list fills the pane from below the viewer\'s top bar (75 px) to the screen\'s edges', o.inPane && near(o.box.l, o.pane.l) && near(o.box.t, 75) && near(o.box.r, o.vw) && near(o.box.b, o.vh),
        JSON.stringify(o.box) + ' in ' + JSON.stringify(o.pane));
    ok('Player actions: what the pane showed is hidden meanwhile, and the entry is marked', o.innerHidden === 'hidden' && o.codeHidden === 'hidden' && o.on, JSON.stringify(o));
    ok('Player actions: its rows are drawn, and they scroll on their own below its top bar (which sits at its top, under a 1 px line)', o.rows >= 5 && o.bodyScrolls === 'auto' && near(o.top.t, o.box.t + 1),
        o.rows + ' rows, ' + o.bodyScrolls + ', top bar at ' + r1(o.top.t));
    ok('Player actions: its rows are as drawn: 12 px text, no lines between the columns', m.clean.aFont === '12px' && /^0px/.test(m.clean.aLine) && m.clean.aWrap === 'nowrap', JSON.stringify(m.clean));
    ok('Player actions: the page\'s CSS does not reach the list (logs.txt\'s parsed view left in the pane, and rules for every td, button and *)',
        JSON.stringify(m.leaked) === JSON.stringify(m.clean), JSON.stringify({ clean: m.clean, leaked: m.leaked }));
    ok('Player actions: the search leaves the rows it names', m.searched.length >= 1 && m.searched.every((t) => /stargate/i.test(t)), JSON.stringify(m.searched));
    ok('Player actions: Copy hands out the list as text', /^Player actions, from logs\.txt and methodcalls\.txt/.test(m.copied || '') && m.status === 'Copied.', String(m.copied).slice(0, 80));
    ok('Player actions: a click on a file of the archive puts the viewer back', m.back.gone && !m.back.paneClass && m.back.innerShown === 'visible' && !m.back.on, JSON.stringify(m.back));
    ok('Player actions: ...and so does the arrow to the next attachment', m.reopened && m.nav, JSON.stringify({ reopened: m.reopened, nav: m.nav }));
    ok('Player actions: the "Defects in log" panel of a logs.txt opened before is hidden while the list shows, even one drawn meanwhile', m.panel.drawn === 'none', JSON.stringify(m.panel));
    ok('Player actions: ...comes back with logs.txt, and goes again the moment the list opens', m.panel.back === 'flex' && m.panel.open === 'none', JSON.stringify(m.panel));
    ok('Player actions: an archive with another name has no entry, and gets it back as igbr.zip', m.otherZip === 0 && m.backAgain === 1, m.otherZip + ' / ' + m.backAgain);
    ok('Player actions: an archive without logs.txt has no entry', m.noLogs === 0, String(m.noLogs));
}
const ACTS_FILES = {
    logs: ['Time\tFacility\tType\tMessage',
        '10:00:00\t::General\tnotice\tEVE Client version 24.02 build 3724492 started 11/21/2026 10:00:00',
        '10:01:00\tsvc::gameui\tnotice\tGameUI::OnSessionChanged, Heading for character selection True <Session: (sid:1)> {}',
        '10:02:10\tsvc::space\tnotice\tStopWarpIndication Destination: Jita<br> autopilot = 0',
        '10:02:15\tsvc::gatejump\tnotice\tStargate Jump from 30000142 to 50001248',
        "10:02:20\tsvc::gameui\tnotice\tGameUI::OnSessionChanged, Heading for inflight with a valid ego True <Session: (sid:1)> {'solarsystemid2': (30000142, 30000144)}",
        '10:03:00\tsvc::gameui\tnotice\tI am now AFK after being idle for 300 seconds.',
        '10:04:00\tsvc::bugReporting\tnotice\tOpening bug reporting'].join('\n'),
    mc: ['Time\tMethod\tDuration [ms]',
        '2026.11.21 10:01:50\tRemote Object Call::ConeScan (ObjectCall' + String.fromCharCode(92) + 'Client)\t100',
        '2026.11.21 10:01:55\tRemote Object Call::CmdWarpToStuff (ObjectCall' + String.fromCharCode(92) + 'Client)\t100'].join('\n')
};

// ================= 8. Player actions: the hover card, and a row opened at its line =================
// The same viewer, and Jira's part played by the page: a click on logs.txt or methodcalls.txt in the file list marks that
// row current and, a moment later, puts the file's text into a fresh code-block, which the log parser draws as its table
// (the script's own poller finds it). logs.txt has 300 lines between the client's start and the warp's landing, so the
// landing is far down. Three views, each as short as it can be, since mutate-layout.js runs a view for each breakage of it:
//  - card: the hover card (where it sits, its text, that it takes no mouse events, above its row at the bottom), and the
//    chooser of a row read from both files (Esc closes it, and the viewer never hears the Esc);
//  - jump: a row opened in logs.txt and in methodcalls.txt (the line marked, scrolled to, visible), the list opened again as
//    it was left, its search through the lines, and a row opened in the file already shown under the list, its notices
//    hidden: nothing loaded again, the line shown and marked;
//  - redraw: Jira not marking the file shown current, and drawing it again on a click on it, quickly and slowly, and a
//    marked line scrolled away by something else, then by the user.
async function actsJumpView(data) {
    const { box } = window.__lc, wait = (ms) => new Promise((r) => setTimeout(r, ms)), files = data.files, part = data.part;
    const row = (name) => '<div class="row" style="display: flex; align-items: center; height: 46px;"><div style="width: 85%;"><button type="button" style="display: flex; width: 100%; height: 40px; background: none; border: 0; color: inherit; font: inherit;">' +
        '<span style="display: flex; gap: 12px;"><span data-item-elem-before="true" style="display: flex; width: 24px; height: 24px;"></span><div><span data-item-title="true">' + name + '</span></div></span></button></div>' +
        '<button aria-label="Download Media" data-testid="media-archiveDownloadButton" style="width: 39px; height: 40px;"></button></div>';
    document.body.insertAdjacentHTML('beforeend', '<div data-testid="media-viewer-popup" role="dialog" style="position: fixed; inset: 0; background: #1d2125; color: #c7d1db;">' +
        '<h1 data-testid="media-viewer-file-name" style="position: absolute; left: 368px; top: 24px; margin: 0; font-size: 14px;">igbr.zip</h1>' +
        '<div data-testid="archive-layout" style="position: absolute; inset: 0; display: flex;"><div class="side" style="position: absolute; left: 0; top: 0; bottom: 0; width: 300px; padding: 22px 20px; box-sizing: border-box;">' +
        '<div data-testid="archive-sidebar-folder-wrapper">' + ['logs.txt', 'processHealth.txt', 'methodcalls.txt', 'fitting.txt'].map(row).join('') + '</div></div>' +
        '<div class="pane" style="position: absolute; top: 0; left: 300px; right: 0; bottom: 0;"><div class="inner" style="width: 100%; height: 100%;">' +
        '<div style="height: 75px;"></div><span data-testid="code-block" style="display: block;">fitting.txt as Jira shows it</span></div></div></div></div>');
    JiTA.acts.load = () => Promise.resolve(files);
    let toasts = [], escSeen = 0, loads = 0;
    JiTA.ui.toast = (t) => { toasts.push(t); };
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { escSeen++; } });   // what the viewer would hear
    const list = document.querySelector('[data-testid="archive-sidebar-folder-wrapper"]'), text = { 'logs.txt': files.logs, 'methodcalls.txt': files.mc };
    Array.prototype.forEach.call(list.querySelectorAll('button'), (b) => {
        const t = b.querySelector('[data-item-title]');
        if (!t || !text[t.textContent]) { return; }
        b.addEventListener('click', () => setTimeout(() => {
            Array.prototype.forEach.call(list.querySelectorAll('[aria-current]'), (x) => x.removeAttribute('aria-current'));
            if (!window.__noCurrent) { b.setAttribute('aria-current', 'true'); }
            const old = document.querySelector('[data-testid="code-block"]'), cb = document.createElement('span');
            cb.setAttribute('data-testid', 'code-block');
            cb.style.display = 'block';
            cb.textContent = text[t.textContent];
            old.parentNode.replaceChild(cb, old);
            loads++;
        }, window.__loadMs || 100));
    });
    const said = [], log0 = JiTA.log;
    JiTA.log = function (s) { if (/Player actions/.test(String(s))) { said.push(String(s)); } return log0.apply(this, arguments); };
    JiTA.acts.ensure();
    const entry = list.querySelector('.jita-acts-entry');
    if (!entry) { return { entry: false }; }
    const until = async (f, ms) => { for (let i = 0; i < (ms || 5000) / 50; i++) { const v = f(); if (v) { return v; } await wait(50); } return null; };
    const openList = async () => {
        entry.querySelector('button').click();
        return until(() => { const e = document.getElementById('jita-acts'); return e && e.querySelector('.jpa-t') ? e : null; }, 3000);
    };
    const rowNamed = (el, re) => Array.prototype.find.call(el.querySelectorAll('tbody tr.jpa-r'), (r) => re.test(r.querySelector('.jpa-a').textContent));
    const search = async (el, q) => { el.querySelector('.jpa-q').value = q; el.querySelector('.jpa-q').dispatchEvent(new Event('input', { bubbles: true })); await wait(200); };
    const marked = () => document.querySelectorAll('#tableContent tr.jita-jump');
    const markedLike = (re) => { const m = marked()[0]; return m && re.test(m.textContent) ? m : null; };
    const seen = (tr) => {   // on screen, and what is at its middle is that row
        const r = tr.getBoundingClientRect(), at = document.elementFromPoint(r.left + Math.min(r.width / 2, 200), r.top + r.height / 2);
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, onScreen: r.top >= 0 && r.bottom <= window.innerHeight, atRow: !!at && tr.contains(at), text: tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) };
    };
    const clickAt = (r) => r.cells[1].dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box(r).l + 200, clientY: box(r).t + 8 }));
    let el = await openList();
    if (!el) { return { entry: true, opened: false }; }
    const out = { entry: true, opened: true, toasts: toasts };
    if (part === 'card') {
        const warpRow = rowNamed(el, /^Warped to Jita/), cs = (n) => getComputedStyle(n);
        warpRow.cells[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const card = await until(() => el.querySelector('.jpa-tip'), 2000);
        out.hover = card ? { box: box(card), list: box(el), row: box(warpRow), pe: cs(card).pointerEvents, size: cs(card).fontSize, msgSize: cs(card.querySelector('.jpa-tip-msg')).fontSize,
            msgFont: cs(card.querySelector('.jpa-tip-msg')).fontFamily, wrap: cs(card.querySelector('.jpa-tip-msg')).whiteSpace, lines: card.querySelectorAll('.jpa-tip-line').length,
            files: Array.prototype.map.call(card.querySelectorAll('.jpa-tip-file'), (n) => n.textContent).join(), foot: (card.querySelector('.jpa-tip-foot') || {}).textContent || '',
            title: warpRow.getAttribute('title') } : null;
        warpRow.cells[1].dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
        out.cardGone = !el.querySelector('.jpa-tip');
        // a card with no room under its row goes above it
        const probe = document.createElement('div');
        probe.className = 'jpa-tip';
        probe.style.height = '200px';
        el.appendChild(probe);
        const lb = el.getBoundingClientRect();
        JiTA.acts._place(el, probe, { top: lb.bottom - 40, bottom: lb.bottom - 20 }, lb.left + 50);
        out.flipped = { top: box(probe).t, bottom: box(probe).b, rowTop: lb.bottom - 40 };
        probe.parentNode.removeChild(probe);
        // the chooser, and Esc
        clickAt(warpRow);
        const pick = el.querySelector('.jpa-pick');
        out.chooser = pick ? { buttons: Array.prototype.map.call(pick.querySelectorAll('button'), (b) => b.textContent).join(' | '), box: box(pick), list: box(el) } : null;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        out.afterEsc = { pick: !!el.querySelector('.jpa-pick'), list: !!document.getElementById('jita-acts'), escSeen: escSeen };
        return out;
    }
    if (part === 'jump') {
        // opened in logs.txt, from the chooser, with a search on the list
        await search(el, 'warp');
        clickAt(rowNamed(el, /^Warped to Jita/));
        const pickLogs = el.querySelector('.jpa-pick button[data-f="logs.txt"]');
        if (pickLogs) { pickLogs.click(); }
        const m1 = pickLogs ? await until(() => marked()[0]) : null;
        out.inLogs = { listGone: !document.getElementById('jita-acts'), loads: loads, marks: marked().length, row: m1 ? seen(m1) : null, look: m1 ? getComputedStyle(m1.cells[0]).backgroundImage : '' };
        // the list opened again as it was left; a search finds a row by its lines too
        el = await openList();
        const shownNow = () => Array.prototype.filter.call(el.querySelectorAll('tbody tr.jpa-r'), (r) => getComputedStyle(r).display !== 'none').map((r) => r.textContent);
        out.reopened = { q: el.querySelector('.jpa-q').value, shown: shownNow() };
        await search(el, 'conescan');
        out.reopened.byLine = shownNow();
        // opened in methodcalls.txt: one file, so no chooser
        await search(el, '');
        rowNamed(el, /^Used the directional scanner/).cells[1].click();
        const noPick = !el.querySelector('.jpa-pick');
        const m2 = await until(() => markedLike(/ConeScan/));
        out.inMc = { noPick: noPick, loads: loads, row: m2 ? seen(m2) : null };
        // logs.txt again, then its notices hidden, and a row opened in it while it is the file shown under the list
        el = await openList();
        rowNamed(el, /^Jumped through a stargate/).cells[1].click();
        const m3 = await until(() => markedLike(/Stargate Jump from/));
        const notice = () => document.querySelector('#gnav a#notice') || { click() {}, classList: { contains: () => true } };   // none while the log is drawn again
        notice().click();
        const idleHidden = Array.prototype.find.call(document.querySelectorAll('#tableContent tbody tr'), (r) => /I am now AFK/.test(r.textContent));
        const hiddenBefore = idleHidden ? idleHidden.style.display : 'none found';
        const loadsBefore = loads;
        el = await openList();
        rowNamed(el, /^Went idle/).cells[1].click();
        const m4 = await until(() => markedLike(/I am now AFK/));
        await wait(200);
        out.again = { gate: m3 ? seen(m3).text : null, hiddenBefore: hiddenBefore, loads: loads - loadsBefore, listGone: !document.getElementById('jita-acts'),
            noticeOff: notice().classList.contains('toggle'), row: m4 ? seen(m4) : null, display: m4 ? m4.style.display : null };
        return out;
    }
    // redraw. logs.txt shown first, as a jump leaves it; then Jira as it may be: the file shown not marked current, so its
    // entry is clicked, and Jira draws it again. Quickly: the table from before the click is never marked. Slowly (after
    // GO_STALE): that table is marked, then the line is marked again in the table drawn again, and scrolled to.
    rowNamed(el, /^Jumped through a stargate/).cells[1].click();
    await until(() => markedLike(/Stargate Jump from/));
    window.__noCurrent = true;
    Array.prototype.forEach.call(list.querySelectorAll('[aria-current]'), (x) => x.removeAttribute('aria-current'));
    let n0 = loads;
    said.length = 0;
    el = await openList();
    rowNamed(el, /^Opened the bug report window/).cells[1].click();
    const t0 = Date.now();
    const q5 = await until(() => (loads > n0 ? markedLike(/Opening bug reporting/) : null), 4000);
    await wait(Math.max(0, JiTA.acts.GO_STALE + 200 - (Date.now() - t0)));   // past the time the table from before would be taken
    out.quick = { loads: loads - n0, row: q5 && q5.isConnected ? seen(q5) : null, said: said.slice() };
    n0 = loads;
    said.length = 0;
    window.__loadMs = JiTA.acts.GO_STALE + 300;
    el = await openList();
    rowNamed(el, /^Went idle/).cells[1].click();
    const m5 = await until(() => (loads > n0 ? markedLike(/I am now AFK/) : null), 6000);
    out.slow = { loads: loads - n0, row: m5 ? seen(m5) : null, said: said.slice() };
    // scrolled away by something else than the user: back in view; scrolled by the user: left there
    const tbl = document.getElementById('table');
    if (tbl) { tbl.scrollTop = 0; }
    await wait(JiTA.acts.GO_POLL * 2 + 50);
    out.back = m5 ? seen(m5) : null;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    if (tbl) { tbl.scrollTop = 0; }
    await wait(JiTA.acts.GO_POLL * 2 + 50);
    out.left = m5 ? seen(m5) : null;
    return out;
}
function actsOpened(m, title) {
    ok(title + ': the list opens', m.entry && m.opened, JSON.stringify(m));
    return !!m.opened;
}
function actsCardChecks(m) {
    if (!actsOpened(m, 'Player actions, hover card')) { return; }
    const h = m.hover;
    ok('Player actions: hovering a row shows its card, under the row, inside the list, in place of the browser\'s own tooltip', !!h && h.box.t >= h.row.b - 1 && h.box.l >= h.list.l && h.box.r <= h.list.r + 0.5 &&
        h.box.b <= h.list.b && h.title === null, JSON.stringify(h));
    ok('Player actions: ...readable: 13 px text, each line by its parts, its message in 12 px monospace that wraps', !!h && h.size === '13px' && h.msgSize === '12px' && /Consolas|Courier|monospace/.test(h.msgFont) &&
        h.wrap === 'pre-wrap' && h.lines === 2 && h.files === 'methodcalls.txt,logs.txt' && /logs\.txt or methodcalls\.txt|methodcalls\.txt or logs\.txt/.test(h.foot), JSON.stringify(h));
    ok('Player actions: ...it takes no mouse events, and goes when the mouse leaves the row', !!h && h.pe === 'none' && m.cardGone, JSON.stringify({ pe: h && h.pe, gone: m.cardGone }));
    ok('Player actions: a card with no room under its row goes above it', m.flipped.bottom <= m.flipped.rowTop + 0.5 && m.flipped.top >= 0, JSON.stringify(m.flipped));
    ok('Player actions: a click on a row read from both files asks which, at the click, inside the list', !!m.chooser && m.chooser.buttons === 'methodcalls.txt10:01:55 | logs.txt10:02:10' &&
        m.chooser.box.r <= m.chooser.list.r + 0.5 && m.chooser.box.b <= m.chooser.list.b + 0.5, JSON.stringify(m.chooser));
    ok('Player actions: ...Esc closes the chooser, not the list, and the viewer never hears it', !m.afterEsc.pick && m.afterEsc.list && m.afterEsc.escSeen === 0, JSON.stringify(m.afterEsc));
}
function actsJumpChecks(m) {
    if (!actsOpened(m, 'Player actions, rows to lines')) { return; }
    const l = m.inLogs;
    ok('Player actions: picking logs.txt opens it, the list closed, and the line is marked, scrolled to and visible (300 lines down)', l.listGone && l.loads === 1 && l.marks === 1 && !!l.row &&
        /StopWarpIndication Destination: Jita/.test(l.row.text) && l.row.onScreen && l.row.atRow && /gradient/.test(l.look), JSON.stringify(l));
    ok('Player actions: the list opens again as it was left, its search in it', m.reopened.q === 'warp' && m.reopened.shown.length >= 1 && m.reopened.shown.every((t) => /warp/i.test(t)), JSON.stringify(m.reopened));
    ok('Player actions: the search finds a row by the lines in its card (ConeScan)', m.reopened.byLine.length === 1 && /directional scanner/.test(m.reopened.byLine[0]), JSON.stringify(m.reopened.byLine));
    const c = m.inMc;
    ok('Player actions: a row read from methodcalls.txt only opens it at once, its line marked and visible', c.noPick && c.loads === 2 && !!c.row && /ConeScan/.test(c.row.text) && c.row.onScreen && c.row.atRow, JSON.stringify(c));
    const a = m.again;
    ok('Player actions: a row opened in the file already shown under the list: nothing loaded again, the list closed', /Stargate Jump from/.test(a.gate || '') && a.hiddenBefore === 'none' && a.loads === 0 && a.listGone, JSON.stringify(a));
    ok('Player actions: ...a line its hidden notices kept out of sight is shown, the notices on again, and marked', !!a.row && a.display !== 'none' && !a.noticeOff && a.row.onScreen && a.row.atRow, JSON.stringify(a));
    ok('Player actions: nothing went wrong on the way', !m.toasts.length, JSON.stringify(m.toasts));
}
function actsRedrawChecks(m) {
    if (!actsOpened(m, 'Player actions, drawn again')) { return; }
    const q5 = m.quick, s5 = m.slow;
    ok('Player actions: the file shown, not marked current by Jira and drawn again on the click: the line is marked in the table drawn again, visible, the table from before never marked',
        q5.loads === 1 && !!q5.row && /Opening bug reporting/.test(q5.row.text) && q5.row.onScreen && q5.row.atRow && q5.said.length === 1 && !/again|from before/.test(q5.said[0]), JSON.stringify(q5));
    ok('Player actions: ...drawn again only after a while: the table from before is marked, then the line again in the new table, scrolled to', s5.loads === 1 && !!s5.row &&
        /I am now AFK/.test(s5.row.text) && s5.row.onScreen && s5.row.atRow && s5.said.length === 2 && /marked again in the table drawn again/.test(s5.said[1]), JSON.stringify(s5));
    ok('Player actions: a marked line scrolled away by something else is scrolled back to', !!m.back && m.back.onScreen, JSON.stringify(m.back));
    ok('Player actions: ...but not once the user has scrolled', !!m.left && !m.left.onScreen, JSON.stringify(m.left));
    ok('Player actions: nothing went wrong on the way', !m.toasts.length, JSON.stringify(m.toasts));
}
const JUMP_FILES = {
    logs: ['Time\tFacility\tType\tMessage',
        '10:00:00\t::General\tnotice\tEVE Client version 24.02 build 3724492 started 11/21/2026 10:00:00',
        '10:01:00\tsvc::gameui\tnotice\tGameUI::OnSessionChanged, Heading for character selection True <Session: (sid:1)> {}']
        .concat(Array.from({ length: 300 }, (x, i) => '10:01:' + String(10 + Math.floor(i / 10)).padStart(2, '0') + '\tsvc::filler\twarning\tfiller line ' + i))
        .concat(['10:02:10\tsvc::space\tnotice\tStopWarpIndication Destination: Jita<br> autopilot = 0',
            '10:02:15\tsvc::gatejump\tnotice\tStargate Jump from 30000142 to 50001248',
            "10:02:20\tsvc::gameui\tnotice\tGameUI::OnSessionChanged, Heading for inflight with a valid ego True <Session: (sid:1)> {'solarsystemid2': (30000142, 30000144)}",
            '10:03:00\tsvc::gameui\tnotice\tI am now AFK after being idle for 300 seconds.',
            '10:04:00\tsvc::bugReporting\tnotice\tOpening bug reporting']).join('\n'),
    mc: ['Time\tMethod\tDuration [ms]']
        .concat(Array.from({ length: 200 }, (x, i) => '2026.11.21 10:00:' + String(10 + Math.floor(i / 5)).padStart(2, '0') + '\tmachoNet::GetTime (RemoteServiceCall)\t' + (40 + i % 7)))
        .concat(['2026.11.21 10:01:50\tRemote Object Call::ConeScan (ObjectCall' + String.fromCharCode(92) + 'Client)\t100',
            '2026.11.21 10:01:55\tRemote Object Call::CmdWarpToStuff (ObjectCall' + String.fromCharCode(92) + 'Client)\t100']).join('\n')
};

const SETV_FIXTURE = fs.readFileSync(path.join(__dirname, 'settings-fixture.yaml'), 'utf8').replace(/\r\n/g, '\n');
const VIEWS = [
    { title: 'Members', page: membersView, check: membersChecks },
    { title: 'Cards', page: cardsView, check: cardsChecks },
    { title: 'Settings', page: settingsView, check: settingsChecks },
    { title: 'Quality control', page: qcView, check: qcChecks },
    { title: 'Lead duties tabs', page: ldTabsView, check: ldTabsChecks },
    { title: 'Settings window', page: setvView, check: setvChecks, data: SETV_FIXTURE },
    { title: 'Player actions', page: actsView, check: actsChecks, data: ACTS_FILES },
    { title: 'Player actions, hover card', page: actsJumpView, check: actsCardChecks, data: { files: JUMP_FILES, part: 'card' } },
    { title: 'Player actions, rows to lines', page: actsJumpView, check: actsJumpChecks, data: { files: JUMP_FILES, part: 'jump' } },
    { title: 'Player actions, drawn again', page: actsJumpView, check: actsRedrawChecks, data: { files: JUMP_FILES, part: 'redraw' } }
];
// The files Tampermonkey fetches with the script (@resource), as the page's GM_getResourceText hands them out.
const RESOURCES = { settingswindow: fs.readFileSync(path.join(__dirname, '..', 'settings-window.json'), 'utf8') };

(async () => {
    // A browser that stops answering must not hold up a CI run for its whole timeout.
    setTimeout(() => { ok('the layout checks finish', false, 'still running after 180 s'); finish(); }, 180000).unref();
    const unknown = ONLY.filter((t) => !VIEWS.some((v) => v.title === t));
    if (unknown.length) { ok('JITA_LAYOUT_ONLY names views there are', false, 'no view called ' + unknown.join(', ')); finish(); }
    const views = ONLY.length ? VIEWS.filter((v) => ONLY.indexOf(v.title) >= 0) : VIEWS;
    const src = fs.readFileSync(SRC_FILE, 'utf8').replace(/\r\n/g, '\n');
    const exe = browser.find();
    if (!exe) { skip(process.env.JITA_BROWSER ? 'JITA_BROWSER is ' + process.env.JITA_BROWSER + ', which is no program here' : 'no Chrome, Chromium or Edge found (set JITA_BROWSER to one)'); }
    const jq = await requireJquery(src);
    if (jq.offline) { skip(jq.offline); }
    if (jq.error) { ok('jQuery as the @require line gives it', false, jq.error); finish(); }
    let b = null, why = '';
    for (let i = 0; i < 2 && !b; i++) {   // once more: a browser starting beside eight busy breakage suites can be slow
        try { b = await browser.launch({ executable: exe }); } catch (e) { why = String(e && e.message || e); }
    }
    if (!b) { ok('the browser starts (' + exe + ')', false, why); finish(); }
    console.log('  ----  ' + exe + ', ' + await b.version());
    for (const v of views) {
        let page = null, m = null, t0 = Date.now();
        try {
            page = await scriptPage(b, jq.text, src, gmFor(src), RESOURCES);
            m = await page.evaluate('(' + v.page.toString() + ')(' + (v.data === undefined ? '' : JSON.stringify(v.data)) + ')', 30000);
        } catch (e) {
            ok(v.title + ': the view opens and is measured', false, String(e && e.message || e) + (page && page.errors.length ? ' | the page said: ' + page.errors.slice(0, 3).join(' | ') : ''));
        }
        if (m) { v.check(m); }
        if (page) { await page.close(); }
        if (TIMES) { console.log('  ----  ' + v.title + ': ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s'); }
    }
    await b.close();
    finish();
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
