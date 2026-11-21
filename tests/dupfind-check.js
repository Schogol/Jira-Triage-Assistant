// dupfind-check.js - the duplicate finder's list (JiTA.dupfind, review 2026-11-20 trend-logic-1..4). Evals the real
// JiTA.dupfind against a fake jQuery, a stubbed local DB and scripted issue-link reads:
//  - issue links are read again on Recompute and on opening the view: kept for the tab's life, a pair linked in Jira since
//    stayed a suggestion; a failed read is not kept as "no links", and a defect Jira answers 404 for is not suggested
//  - an older render (another threshold, the scan before) never paints over a newer one, nor over "Scanning"
//  - a hover card that comes back after the mouse left its row is not shown
//  - the scan time is the user's own time
process.env.TZ = 'Europe/Berlin';   // the scan time is shown in local time: pinned, so the check reads the same everywhere
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 12; i++) { await new Promise((r) => setImmediate(r)); } };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

// ---- a fake jQuery: the list body, the status line, and the elements a card is built of ----
function El(html) {
    const e = { html: html || '', kids: [], txt: '', attrs: {}, handlers: {}, props: {} };
    e.text = (v) => { if (v === undefined) { return e.txt; } e.txt = String(v); return e; };
    e.attr = (k, v) => { if (v === undefined) { return e.attrs[k]; } e.attrs[k] = v; return e; };
    e.prop = (k, v) => { e.props[k] = v; return e; };
    e.appendTo = (p) => { p.kids.push(e); return e; };
    e.append = (c) => { e.kids.push(c); return e; };
    e.empty = () => { e.kids = []; return e; };
    e.on = (ev, fn) => { (e.handlers[ev] = e.handlers[ev] || []).push(fn); return e; };
    e.addClass = () => e; e.val = () => e; e.find = () => e;
    e.length = 1;
    return e;
}
let body = El('<div id="jd-body">'), open = true;
const status = { textContent: '' };
global.document = { getElementById: (id) => (id === 'jd-body' ? (open ? {} : null) : id === 'jd-status' ? status : null) };
global.$ = (x) => {
    if (x === '#jd-body') { return open ? body : Object.assign(El(), { length: 0 }); }
    if (typeof x === 'string' && x.charAt(0) === '<') { return El(x); }
    return El();
};
// $.ajax for the issue-link reads: each answers as linkOf(key) says, or is held when hold[key] is set.
let asked = [], hold = {}, linkOf = () => ({ status: 200, links: [] });
$.ajax = (o) => {
    const key = (/issue\/([A-Z]+-\d+)\?/.exec(o.url) || [])[1];
    asked.push(key);
    const cbs = { done: [], fail: [] };
    const settle = () => {
        const a = linkOf(key);
        if (a.status === 200) { cbs.done.forEach((f) => f({ key: key, fields: { issuelinks: a.links.map((k) => ({ outwardIssue: { key: k } })) } })); }
        else { cbs.fail.forEach((f) => f({ status: a.status })); }
    };
    if (hold[key]) { hold[key].promise.then(settle); } else { setImmediate(settle); }
    const r = { done(f) { cbs.done.push(f); return r; }, fail(f) { cbs.fail.push(f); return r; } };
    return r;
};
const gm = {};
global.gmGet = (k, d) => (k in gm ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.JITA_IS_SUBFRAME = false;
global.flagOn = () => true;
global.GM_addStyle = () => {};
global.jitaLinkedKeys = eval('(' + S.fn(src, 'jitaLinkedKeys') + ')');

let tips = [], scans = [], defectReads = {};
global.JiTA = {
    HOST: '', log() {}, rank: {}, logsig: { clusters: () => Promise.resolve([]) }, sync: { _tellChanged() {} },
    excnoise: { isIgnored: () => false }, util: { isResolved: () => false },
    db: { getMeta: () => Promise.resolve(null), setMeta: () => Promise.resolve(), deleteDefects: () => Promise.resolve(),
        getDefect: (k) => (defectReads[k] ? defectReads[k].promise : Promise.resolve({ key: k, summary: 'S ' + k, description: 'd' })) },
    worker: { usable: () => true, call: () => { const d = deferred(); scans.push(d); return d.promise; } },
    ui: { _showTip: (r) => { tips.push(r.key); }, _hideTip() {} },
    menu: { _openOverlay: () => ({ $menu: El() }) }
};
eval(S.top(src, 'JiTA.dupfind'));
const D = JiTA.dupfind;

const scan = (pairs) => ({ computedAt: '2026-11-20T14:05:00.000Z', pairs: pairs, meta: {}, scanned: 40 });
const cards = () => body.kids.filter((k) => /jd-card/.test(k.html));
const rowsOf = (card) => card.kids.filter((k) => /jd-row/.test(k.html));
const keysShown = () => cards().map((c) => rowsOf(c).map((r) => r.attrs['data-key']).join('+')).join(', ');
const PAIR = [{ a: 'EDR-1', b: 'EDR-2', cos: 0.96 }];

(async () => {
    // ================= links read again =================
    gm[D.PCT_KEY] = 90;
    D._last = scan(PAIR);
    D.render();
    await flush();
    ok('an unlinked look-alike pair is suggested (control)', keysShown() === 'EDR-1+EDR-2', keysShown());
    linkOf = (k) => ({ status: 200, links: k === 'EDR-1' ? ['EDR-2'] : ['EDR-1'] });   // the Lead links them in Jira
    asked = [];
    D.compute();
    ok('Recompute shows Scanning while it runs', /Scanning/.test((body.kids[0] || { txt: '' }).txt), JSON.stringify(body.kids.map((k) => k.txt)));
    scans[0].resolve({ pairs: PAIR, meta: {}, scanned: 40 });
    await flush();
    ok('...and reads the links again, so a pair linked in Jira since is no longer suggested', asked.length === 2 && cards().length === 0 && /1 already linked/.test(status.textContent),
        asked.join() + ' / ' + keysShown() + ' / ' + status.textContent);
    D._links = { 'EDR-1': {}, 'EDR-2': {} };   // read as unlinked a while ago
    D._missing = {};
    D._fresh();
    ok('opening the view reads them again too', Object.keys(D._links).length === 0 && /D\._fresh\(\);\n\s+var ov = JiTA\.menu\._openOverlay\(/.test(S.member(src, 'JiTA.dupfind', 'openView')));

    linkOf = (k) => (k === 'EDR-2' ? { status: 500, links: [] } : { status: 200, links: [] });
    D._fresh(); asked = [];
    D.render();
    await flush();
    ok('a link read that fails still shows the pair, saying its links could not be checked', keysShown() === 'EDR-1+EDR-2' && /could not be checked/.test(status.textContent), status.textContent);
    asked = [];
    D.render();
    await flush();
    ok('...and keeps nothing, so the next look reads it again', asked.join() === 'EDR-2', asked.join());
    linkOf = (k) => (k === 'EDR-2' ? { status: 404, links: [] } : { status: 200, links: [] });
    D._fresh();
    D.render();
    await flush();
    ok('a defect Jira no longer has (404) is not suggested', cards().length === 0 && /Jira no longer has/.test(status.textContent), keysShown() + ' / ' + status.textContent);
    linkOf = () => ({ status: 200, links: [] });

    // ================= the newest render paints =================
    D._fresh(); asked = [];
    const TWO = [{ a: 'EDR-1', b: 'EDR-2', cos: 0.96 }, { a: 'EDR-3', b: 'EDR-4', cos: 0.85 }];
    D._last = scan(TWO);
    gm[D.PCT_KEY] = 80;
    hold = { 'EDR-3': deferred() };   // the 80% render waits on EDR-3's links
    D.render();
    await flush();
    gm[D.PCT_KEY] = 95;               // the select changed meanwhile
    D.render();
    await flush();
    ok('(the 95% render lands first)', keysShown() === 'EDR-1+EDR-2', keysShown());
    hold['EDR-3'].resolve();
    await flush();
    ok('the older render, for another threshold, does not paint over it when it lands last', keysShown() === 'EDR-1+EDR-2' && /1 suggestion/.test(status.textContent),
        keysShown() + ' / ' + status.textContent);
    D._fresh(); hold = { 'EDR-1': deferred() };
    gm[D.PCT_KEY] = 90;
    D._last = scan(PAIR);
    D.render();
    await flush();
    D.compute();
    hold['EDR-1'].resolve();
    await flush();
    ok('a render still checking links does not paint the old scan over Scanning', body.kids.length === 1 && /Scanning/.test(body.kids[0].txt), JSON.stringify(body.kids.map((k) => k.txt || k.html)));
    hold = {};
    scans[scans.length - 1].resolve({ pairs: PAIR, meta: {}, scanned: 40 });
    await flush();
    ok('...the new scan then paints (control)', keysShown() === 'EDR-1+EDR-2', keysShown());

    // ================= the hover card =================
    const row = rowsOf(cards()[0])[0], k1 = row.attrs['data-key'];
    defectReads[k1] = deferred();
    tips = [];
    row.handlers.mouseenter.forEach((f) => f.call(row));
    row.handlers.mouseleave.forEach((f) => f.call(row));   // off it before the read came back
    defectReads[k1].resolve({ key: k1, summary: 's', description: 'd' });
    await flush();
    ok('a hover card that comes back after the mouse left its row is not shown (it stayed on screen)', tips.length === 0, tips.join());
    defectReads[k1] = deferred();
    row.handlers.mouseenter.forEach((f) => f.call(row));
    defectReads[k1].resolve({ key: k1, summary: 's', description: 'd' });
    await flush();
    ok('...while one for the row still hovered is (control)', tips.join() === k1, tips.join());

    // ================= the scan time =================
    D._last = scan(PAIR);   // scanned at 14:05 UTC
    D.render();
    await flush();
    ok('the scan time is shown in the user\'s own time, not as UTC', D._scannedAt('2026-11-20T14:05:00.000Z') === '2026-11-20 15:05' &&
        /· 2026-11-20 15:05$/.test(status.textContent), D._scannedAt('2026-11-20T14:05:00.000Z') + ' / ' + status.textContent);
    ok('...and a missing one is nothing, not a broken date', D._scannedAt(null) === '' && D._scannedAt('nonsense') === '');

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'duplicate finder checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
