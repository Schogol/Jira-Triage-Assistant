// layout-check.js - the layouts a fake DOM cannot see, measured in a real headless Chromium (tests/browser.js): the Lead
// duties Members tab's columns, the result cards in the Triage Assistant's sidebar grid, Settings keeping its size on
// every tab, and the Quality control rows keeping their columns once checked. The other harnesses stub GM_addStyle and
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
function prelude(gm, version) {
    const own = Object.prototype.hasOwnProperty, store = {};
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
async function scriptPage(b, jq, src, gm) {
    const page = await b.page({ width: W, height: H });
    await page.load(PAGE_HTML);
    await page.evaluate(jq + '\n;void 0;\n//# sourceURL=jquery.min.js');
    const version = (/^\/\/ @version\s+(\S+)/m.exec(src) || [])[1] || '';
    await page.evaluate('(' + prelude.toString() + ')(' + JSON.stringify(gm || {}) + ', ' + JSON.stringify(version) + ')');
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

const VIEWS = [
    { title: 'Members', page: membersView, check: membersChecks },
    { title: 'Cards', page: cardsView, check: cardsChecks },
    { title: 'Settings', page: settingsView, check: settingsChecks },
    { title: 'Quality control', page: qcView, check: qcChecks }
];

(async () => {
    // A browser that stops answering must not hold up a CI run for its whole timeout.
    setTimeout(() => { ok('the layout checks finish', false, 'still running after 180 s'); finish(); }, 180000).unref();
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
    for (const v of VIEWS) {
        let page = null, m = null;
        try {
            page = await scriptPage(b, jq.text, src, gmFor(src));
            m = await page.evaluate('(' + v.page.toString() + ')()', 30000);
        } catch (e) {
            ok(v.title + ': the view opens and is measured', false, String(e && e.message || e) + (page && page.errors.length ? ' | the page said: ' + page.errors.slice(0, 3).join(' | ') : ''));
        }
        if (m) { v.check(m); }
        if (page) { await page.close(); }
    }
    await b.close();
    finish();
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
