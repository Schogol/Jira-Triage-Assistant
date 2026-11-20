// census-check.js - Who runs what (v3.53.1). Evals the real JiTA.census, and the real JiTA.conf property calls, against a
// small Confluence of its own (properties with versions, a 409 on a stale one, pages of results):
//  - each browser's entry: the JiTA version, Tampermonkey's, the browser and each switch in Settings > Features (the same
//    switches, with the same names, as that tab), and nothing else
//  - written to the user's own property on the JiTA page when something changed, else once a day, from one tab at a time;
//    a failed write is tried again hours later, not every hour; another browser's entry is kept while it still writes;
//    a write that crossed another is read again and made once more
//  - the owner's table: every entry on the page, one row per user and browser, by name; older versions and browsers not
//    seen for a while marked; how many have each switch on
//  - the boots start it in the top frame only, and the button for the table is in Settings for the owner alone
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };
const J = JSON.stringify;

// ---- stubs ----
let now = Date.UTC(2026, 10, 20, 12, 0, 0);
const realNow = Date.now;
Date.now = () => now;
const gm = {};
global.gmGet = (k, d) => (k in gm ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.JITA_IS_SUBFRAME = false; global.JITA_IS_FORGE_FRAME = false;
const flags = { parser: true, scrollbar: false, buttons: true, similarDefects: true, defectProfile: true, defectChecklist: true, credits: false, detailView: true, screenOcr: false };
global.flagOn = (n) => !!flags[n];
global.GM_info = { scriptHandler: 'Tampermonkey', version: '5.5.0' };
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0';
Object.defineProperty(global, 'navigator', { value: { userAgent: FIREFOX }, configurable: true, writable: true });
const logs = [];
let me = { accountId: '557058:aB-12', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true }, resolves = 0, resolveTo = null;
let zip = true, take = false;
global.JiTA = {
    SCRIPT_VERSION: '3.53.1',
    log: function () { logs.push([].slice.call(arguments).join(' ')); },
    profile: { zipOn: () => zip },
    dv: { _takeOn: () => { if (take === 'throw') { throw new Error('no dv'); } return take; } },
    leadduty: { OWNER: 'schogol', me: () => me, resolveMe: () => { resolves++; return resolveTo instanceof Error ? Promise.reject(resolveTo) : Promise.resolve(resolveTo); } },
    worker: eval('({' + S.member(src, 'JiTA.worker', '_verCmp') + '})'),
    conf: eval(S.members(src, 'JiTA.conf', ['PAGE_LIMIT', 'CONFLICT', '_relPath', '_nextLink', 'isConflict', 'getProperty', '_mapProp', 'saveProperty']))
};
eval(S.top(src, 'JiTA.census'));
const C = JiTA.census;

// ---- a Confluence with one page's properties ----
const server = { props: {}, nextId: 1, calls: [], fail: null, bumps: 0, pageSize: 2 };
const clone = (x) => JSON.parse(J(x));
const httpErr = (status) => Object.assign(new Error('Confluence failed: HTTP ' + status), { status: status });
JiTA.conf._ajax = (method, path, body) => {
    server.calls.push(method + ' ' + path + (body && body.version ? ' v' + body.version.number + ' ' + body.version.message : ''));
    const xhr = { getResponseHeader: () => null };
    if (server.fail) { const f = server.fail; server.fail = null; return Promise.reject(f); }
    let m;
    if (method === 'GET' && (m = /^\/wiki\/api\/v2\/pages\/(\d+)\/properties\?key=([^&]+)&limit=1$/.exec(path))) {
        const p = m[1] === C.PAGE && server.props[decodeURIComponent(m[2])];
        return Promise.resolve({ data: { results: p ? [clone(p)] : [] }, xhr: xhr });
    }
    if (method === 'GET' && (m = /^\/wiki\/api\/v2\/pages\/(\d+)\/properties\?limit=\d+(?:&cursor=(\d+))?$/.exec(path))) {
        const all = Object.keys(server.props).sort().map((k) => server.props[k]), at = +(m[2] || 0);
        const more = at + server.pageSize < all.length;
        return Promise.resolve({ data: { results: clone(all.slice(at, at + server.pageSize)), _links: more ? { next: '/api/v2/pages/' + m[1] + '/properties?limit=250&cursor=' + (at + server.pageSize) } : {} }, xhr: xhr });
    }
    if (method === 'POST' && /^\/wiki\/api\/v2\/pages\/\d+\/properties$/.test(path)) {
        if (server.props[body.key]) { return Promise.reject(httpErr(400)); }
        const p = { id: String(server.nextId++), key: body.key, value: clone(body.value), version: { number: 1 } };
        server.props[body.key] = p;
        return Promise.resolve({ data: clone(p), xhr: xhr });
    }
    if (method === 'PUT' && (m = /^\/wiki\/api\/v2\/pages\/\d+\/properties\/(\w+)$/.exec(path))) {
        const p = Object.keys(server.props).map((k) => server.props[k]).find((x) => x.id === m[1]);
        if (!p) { return Promise.reject(httpErr(404)); }
        if (server.bumps > 0) { server.bumps--; p.version.number++; }   // another tab or browser wrote in between
        if (body.version.number !== p.version.number + 1) { return Promise.reject(httpErr(409)); }
        p.value = clone(body.value); p.version = { number: body.version.number, message: body.version.message };
        return Promise.resolve({ data: clone(p), xhr: xhr });
    }
    return Promise.reject(new Error('the fake Confluence has no ' + method + ' ' + path));
};
const KEY = C.key(me.accountId);
const mine = () => server.props[KEY] && server.props[KEY].value;

(async () => {
    // ================= the entry =================
    const menuSrc = S.top(src, 'JiTA.menu');
    const FLAG = eval('(' + /\nvar FLAG = (\{[^\n]*\});/.exec(src)[1] + ')');
    const rows = [...menuSrc.matchAll(/_toggleRow\('([^']+)', (\d+)/g)].map((m) => ({ label: m[1], id: Object.keys(FLAG).find((k) => FLAG[k] === +m[2]) }));
    const byId = {};
    C.FEATURES.forEach((f) => { byId[f.id] = f; });
    const subs = C.FEATURES.filter((f) => f.sub);
    ok('every switch in Settings > Features is in it, by the same name', rows.length === 9 && rows.every((r) => byId[r.id] && byId[r.id].label === r.label && !byId[r.id].sub),
        rows.filter((r) => !byId[r.id] || byId[r.id].label !== r.label).map((r) => r.label).join(', '));
    ok('...and the two options under them, read by their own calls', subs.length === 2 && subs.every((f) => menuSrc.indexOf('<span class="lbl">' + f.label + '</span>') >= 0) &&
        C.FEATURES.length === rows.length + subs.length, subs.map((f) => f.label).join(', '));
    ok('...each with a short name for the table\'s header', C.FEATURES.every((f) => f.short && f.short.length <= 10), C.FEATURES.map((f) => f.short).join(','));
    let e = C.entry();
    ok('the entry holds the JiTA and Tampermonkey versions, the browser and the switches, and nothing else', J(Object.keys(e)) === J(['jita', 'tm', 'browser', 'f']) &&
        e.jita === '3.53.1' && e.tm === 'Tampermonkey 5.5.0' && e.browser === 'Firefox 158', J(e));
    ok('...each switch as it is set', J(e.f) === J({ parser: true, scrollbar: false, buttons: true, similarDefects: true, defectProfile: true, igbrZip: true, defectChecklist: true, credits: false, detailView: true, dvTake: false, screenOcr: false }), J(e.f));
    take = 'throw';
    ok('...and one that cannot be read as not known', C.entry().f.dvTake === null);
    take = false;
    const gi = global.GM_info;
    delete global.GM_info;
    ok('no GM_info: Tampermonkey\'s version is not known', C.entry().tm === '?');
    global.GM_info = gi;
    const ua = {
        'Firefox 158': FIREFOX,
        'Edge 131': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70',
        'Chrome 131': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Opera 115': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
        'Safari 18': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
        'other': 'curl/8.0'
    };
    const named = Object.keys(ua).map((k) => k + '=' + C._browser(ua[k]));
    ok('the browser by name and major version: Edge and Opera are not taken for Chrome, nor Chrome for Safari', Object.keys(ua).every((k) => C._browser(ua[k]) === k), named.join(' | '));
    ok('a user\'s property key is the account id, in the characters a key may hold', C.key('557058:aB-12') === 'jita_census_557058_ab_12' && /^[a-z0-9_]+$/.test(C.key('x:Y-z.1')), C.key('557058:aB-12'));

    // ================= writing =================
    let wrote = await C.tick();
    let v = mine();
    ok('the first look writes the user\'s property on the JiTA page: their name, and this browser\'s entry', wrote === true && C.PAGE === '281119715' && !!v &&
        v.v === 1 && v.name === 'ISD BH Schogol' && v.id === me.accountId && J(Object.keys(v.b)) === J(['Firefox']) && v.b.Firefox.jita === '3.53.1' &&
        v.b.Firefox.at === new Date(now).toISOString() && J(v.b.Firefox.f) === J(e.f), J(v));
    ok('...with the time it wrote, so the next tab knows', gm[C.SENT_KEY] && gm[C.SENT_KEY].at === now && typeof gm[C.SENT_KEY].sig === 'string', J(gm[C.SENT_KEY]));
    server.calls.length = 0;
    now += 3600 * 1000;
    ok('an hour later, nothing changed: nothing is written', (await C.tick()) === false && server.calls.length === 0, server.calls.join(' | '));
    flags.credits = true;
    wrote = await C.tick();
    ok('a switch flipped: written at the next look, over the same property', wrote === true && mine().b.Firefox.f.credits === true && server.props[KEY].version.number === 2 &&
        server.calls.some((c) => /^PUT .* v2 JiTA census$/.test(c)), server.calls.join(' | '));
    server.calls.length = 0;
    now += C.DAY_MS - 1;
    ok('nothing else for a day', (await C.tick()) === false && server.calls.length === 0);
    now += 1;
    ok('...then it writes again, so "last seen" stays true', (await C.tick()) === true && mine().b.Firefox.at === new Date(now).toISOString());
    JiTA.SCRIPT_VERSION = '3.53.2';
    ok('an update: written at once', (await C.tick()) === true && mine().b.Firefox.jita === '3.53.2');
    JiTA.SCRIPT_VERSION = '3.53.1';
    await C.tick();

    // one tab at a time
    flags.scrollbar = true;
    server.calls.length = 0;
    const both = await Promise.all([C.tick(), C.tick()]);
    ok('two looks at once in one tab: one write', J(both) === J([true, false]) && server.calls.filter((c) => /^PUT /.test(c)).length === 1, J(both) + ' / ' + server.calls.join(' | '));
    flags.scrollbar = false;
    gm[C.SENT_KEY] = { sig: J([me.displayName, '3.53.1', 'Tampermonkey 5.5.0', 'Firefox 158', C.entry().f]), at: now };   // another tab just wrote it
    server.calls.length = 0;
    ok('another tab of this browser has just written it: this one leaves it be', (await C.tick()) === false && server.calls.length === 0);

    // a frame, and who is signed in
    global.JITA_IS_SUBFRAME = true;
    flags.parser = false;
    ok('never from inside a frame', (await C.tick()) === false && server.calls.length === 0);
    global.JITA_IS_SUBFRAME = false;
    me = null; resolveTo = null;
    ok('who is signed in not known yet: asked, and with no answer nothing is written', (await C.tick()) === false && resolves === 1 && server.calls.length === 0);
    resolveTo = new Error('offline');
    ok('...asking that fails is logged, and the next look still runs', (await C.tick()) === false && logs.some((l) => /census: could not tell who is signed in: offline/.test(l)), logs.join(' | '));
    resolveTo = { accountId: '557058:aB-12', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true };
    ok('...and once known, it writes', (await C.tick()) === true && mine().b.Firefox.f.parser === false && resolves === 3);
    me = resolveTo;

    // a failed write
    flags.parser = true;
    server.fail = httpErr(403);
    logs.length = 0;
    ok('a write the page refuses (no edit rights): logged, and nothing thrown', (await C.tick()) === false && logs.some((l) => /census: could not write this browser's entry to the JiTA page: Confluence failed: HTTP 403/.test(l)), logs.join(' | '));
    ok('...tried again after RETRY_MS, not at every look', gm[C.SENT_KEY] && gm[C.SENT_KEY].retry === now + C.RETRY_MS && C.RETRY_MS >= 3600 * 1000 * 3, J(gm[C.SENT_KEY]));
    server.calls.length = 0;
    now += C.RETRY_MS - 1;
    ok('...so an hour later nothing is tried', (await C.tick()) === false && server.calls.length === 0);
    now += 1;
    ok('...and then it is', (await C.tick()) === true && mine().b.Firefox.f.parser === true);

    // the user's other browsers, and writes that cross
    const old = (days) => new Date(now - days * C.DAY_MS).toISOString();
    server.props[KEY].value.b.Chrome = { at: old(10), jita: '3.52.0', tm: 'Tampermonkey 5.4.1', browser: 'Chrome 131', f: { parser: false } };
    server.props[KEY].value.b.Edge = { at: old(C.KEEP_DAYS + 1), jita: '3.40.0', tm: 'Tampermonkey 5.1.0', browser: 'Edge 120', f: {} };
    flags.credits = false;
    await C.tick();
    v = mine();
    ok('another browser\'s entry is kept while it still writes, one silent for KEEP_DAYS is dropped', J(Object.keys(v.b).sort()) === J(['Chrome', 'Firefox']) && v.b.Chrome.jita === '3.52.0' &&
        v.b.Firefox.f.credits === false, J(Object.keys(v.b)));
    flags.credits = true;
    server.bumps = 1;
    server.calls.length = 0;
    ok('a write that crossed another: read again and made once more', (await C.tick()) === true && mine().b.Firefox.f.credits === true &&
        server.calls.filter((c) => /^GET .*key=/.test(c)).length === 2 && server.calls.filter((c) => /^PUT /.test(c)).length === 2, server.calls.join(' | '));
    flags.credits = false;
    server.bumps = 2;
    ok('...but only once: crossing twice is a failed write', (await C.tick()) === false && !!gm[C.SENT_KEY].retry);
    delete gm[C.SENT_KEY];
    await C.tick();

    // ================= reading them all =================
    server.props.other_key = { id: '90', key: 'other_key', value: { not: 'ours' }, version: { number: 1 } };
    server.props.jita_census_broken = { id: '91', key: 'jita_census_broken', value: 'a string', version: { number: 1 } };
    // Charlie's key is read first and his name listed second, so a table that is not sorted shows.
    server.props.jita_census_0charlie = { id: '92', key: 'jita_census_0charlie', value: { v: 1, name: 'Charlie Hunter', id: '557058:x', b: {
        Firefox: { at: old(2), jita: '3.51.5', tm: 'Tampermonkey 5.5.0', browser: 'Firefox 150', f: { parser: true, credits: true } } } }, version: { number: 1 } };
    server.props.jita_census_zz = { id: '93', key: 'jita_census_zz', value: { v: 1, name: 'ISD Mentor Zed', id: 'zz', b: {
        Edge: { at: old(C.OLD_DAYS + 3), jita: '3.54.0', tm: 'Tampermonkey 5.5.0', browser: 'Edge 131', f: { parser: false } } } }, version: { number: 1 } };
    server.calls.length = 0;
    const values = await C.all();
    ok('the owner reads every entry on the page, a page of properties at a time, and only JiTA\'s', values.length === 3 && server.calls.filter((c) => /^GET .*properties\?limit=/.test(c)).length === 3 &&
        values.map((x) => x.name).sort().join() === 'Charlie Hunter,ISD BH Schogol,ISD Mentor Zed', server.calls.join(' | '));
    const R = C.rows(values);
    ok('one row per user and browser, by name with an ISD in front left out, then by browser', R.map((r) => r.name + '/' + r.browser.split(' ')[0]).join() ===
        'ISD BH Schogol/Chrome,ISD BH Schogol/Firefox,Charlie Hunter/Firefox,ISD Mentor Zed/Edge', R.map((r) => r.name + '/' + r.browser).join());
    ok('...a row missing its parts reads as not known', J(C.rows([{ id: 'q', b: { Firefox: {} } }])) === J([{ name: 'q', id: 'q', at: '', jita: '?', tm: '?', browser: 'Firefox', f: {} }]) &&
        C.rows([{ name: 'n' }, null]).length === 0);

    // ================= the owner's table =================
    function El(html) {
        const n = { html: html || '', tag: ((/^<(\w+)/.exec(html || '') || [])[1] || ''), txt: '', attrs: {}, cls: [], kids: [] };
        n.cls = ((/class="([^"]*)"/.exec(n.html) || [])[1] || '').split(/\s+/).filter(Boolean);
        const j = {
            n: n, 0: n,
            appendTo(p) { p.n.kids.push(n); n.parent = p.n; return j; },
            append(c) { n.kids.push(c.n); c.n.parent = n; return j; },
            text(t) { if (t === undefined) { return n.txt; } n.txt = String(t); return j; },
            attr(k, val) { if (val === undefined) { return n.attrs[k]; } n.attrs[k] = val; return j; },
            addClass(c) { if (n.cls.indexOf(c) < 0) { n.cls.push(c); } return j; },
            toggleClass(c, on) { n.cls = n.cls.filter((x) => x !== c); if (on) { n.cls.push(c); } return j; },
            empty() { n.kids = []; return j; }
        };
        return j;
    }
    global.$ = (html) => El(html);
    const css = [];
    global.GM_addStyle = (t) => { css.push(t); };
    let live = true, menu = null;
    JiTA.menu = { _openOverlay: (o) => { menu = El('<div id="jita-menu"></div>'); menu.title = o.title; return { $menu: menu }; }, _live: () => live };
    const all = (node, f, out) => { out = out || []; if (f(node)) { out.push(node); } node.kids.forEach((k) => all(k, f, out)); return out; };
    const tags = (node, t) => all(node, (x) => x.tag === t);
    await C.openView();
    const tb = tags(menu.n, 'table')[0];
    ok('Who runs what opens over the page, with the table in it', menu.title === 'Who runs what' && menu.n.cls.indexOf('jita-census-view') >= 0 && !!tb && css.length === 1);
    const th = tags(tb, 'th');
    ok('...headed Name, Version, Seen, Browser, Tampermonkey, then each switch by its short name, its full name on hover', th.slice(0, 5).map((x) => x.txt).join() === 'Name,Version,Seen,Browser,Tampermonkey' &&
        th.slice(5).map((x) => x.txt).join() === C.FEATURES.map((f) => f.short).join() && th.slice(5).every((x, i) => x.attrs.title === C.FEATURES[i].label), th.map((x) => x.txt).join());
    const trs = tags(tags(tb, 'tbody')[0], 'tr'), cells = (tr) => tags(tr, 'td');
    ok('...a row for each user and browser, in that order', trs.length === 4 && trs.map((tr) => cells(tr)[0].txt + '/' + cells(tr)[3].txt).join() ===
        'ISD BH Schogol/Chrome 131,ISD BH Schogol/Firefox 158,Charlie Hunter/Firefox 150,ISD Mentor Zed/Edge 131', trs.map((tr) => cells(tr)[0].txt + '/' + cells(tr)[3].txt).join());
    const row = (name, br) => trs.find((tr) => cells(tr)[0].txt === name && cells(tr)[3].txt.indexOf(br) === 0);
    const schC = row('ISD BH Schogol', 'Chrome'), schF = row('ISD BH Schogol', 'Firefox'), charlie = row('Charlie Hunter', 'Firefox'), zed = row('ISD Mentor Zed', 'Edge');
    const ch = cells(charlie);
    ok('...each with its version, when it was seen and Tampermonkey\'s version', ch[1].txt === '3.51.5' && ch[2].txt === '2 days ago' && ch[2].attrs.title === old(2) && ch[4].txt === 'Tampermonkey 5.5.0',
        ch.slice(0, 5).map((x) => x.txt).join(' | '));
    const sw = ch.slice(5), zsw = cells(zed).slice(5);
    ok('...a switch that is on ticked, one that is off a dot, one not written a question mark, each saying which on hover', sw[0].txt === '✓' && sw[0].cls.indexOf('on') >= 0 &&
        sw[7].txt === '✓' && sw[1].txt === '?' && zsw[0].txt === '·' && zsw[0].cls.indexOf('off') >= 0 && sw[0].attrs.title === 'Log Parser: on' &&
        zsw[0].attrs.title === 'Log Parser: off' && sw[1].attrs.title === 'Custom Scrollbar: not known', sw.map((x) => x.txt).join(''));
    const behind = (tr) => cells(tr)[1].cls.indexOf('jcs-behind') >= 0;
    ok('an older version than this one is marked, this one and a newer one are not', behind(charlie) && behind(schC) && !behind(schF) && !behind(zed),
        trs.map((tr) => cells(tr)[1].txt + (behind(tr) ? ' behind' : '')).join(' | '));
    ok('a browser not seen for OLD_DAYS is greyed, the others not', zed.cls.indexOf('jcs-old') >= 0 && [schC, schF, charlie].every((tr) => tr.cls.indexOf('jcs-old') < 0) && cells(schF)[2].txt === 'today',
        trs.map((tr) => tr.cls.join('.')).join(' | '));
    const foot = tags(tags(tb, 'tfoot')[0], 'td');
    ok('...and the last row counts, for each switch, the browsers it is on in', foot[0].txt === 'Switched on' && foot[0].attrs.colspan === undefined && /colspan="5"/.test(foot[0].html) &&
        foot[1].txt === '2' && foot[1].attrs.title === 'Log Parser: on in 2 of 4' && foot[8].txt === '1', foot.map((x) => x.txt).join(','));
    const note = all(menu.n, (x) => x.cls.indexOf('jcs-note') >= 0)[0];
    ok('...under a line saying how many users, browsers and of them on this version', note && note.txt.indexOf('3 users in 4 browsers; 1 of them on v3.53.1, this version.') === 0, note && note.txt);
    ok('the table\'s colours: ticks green, dots grey, old versions amber, its header stays put', /td\.jcs-f\.on \{ color: #7fdca4; \}/.test(css[0]) && /td\.jcs-f\.off \{ color: #626f86; \}/.test(css[0]) &&
        /td\.jcs-behind \{ color: #ffb547; \}/.test(css[0]) && /position: sticky; top: 0;/.test(css[0]));
    for (const k of Object.keys(server.props)) { delete server.props[k]; }
    await C.openView();
    ok('nobody written yet: it says so', all(menu.n, (x) => x.cls.indexOf('jcs-note') >= 0).map((x) => x.txt).join() === 'Nobody\'s JiTA has written an entry yet.');
    server.fail = httpErr(401);
    await C.openView();
    ok('a page that cannot be read: it says why', all(menu.n, (x) => x.cls.indexOf('jcs-note') >= 0).map((x) => x.txt).join() === 'Could not read the JiTA page: Confluence failed: HTTP 401');
    let release;
    const realAll = C.all;
    C.all = () => new Promise((r) => { release = r; });
    const p = C.openView();
    live = false;
    release([{ name: 'late', id: 'l', b: { Firefox: { at: old(1) } } }]);
    await p;
    ok('closed before the page answered: nothing is drawn into it', !tags(menu.n, 'table').length && all(menu.n, (x) => x.cls.indexOf('jcs-note') >= 0)[0].txt === 'Reading the JiTA page…');
    C.all = realAll; live = true;

    // ================= starting, and where it lives =================
    const timers = [], intervals = [];
    const st = global.setTimeout, si = global.setInterval;
    global.setTimeout = (fn, ms) => { timers.push([fn, ms]); return 1; };
    global.setInterval = (fn, ms) => { intervals.push([fn, ms]); return 2; };
    try {
        global.JITA_IS_SUBFRAME = true; C.start();
        const inFrame = timers.length + intervals.length;
        global.JITA_IS_SUBFRAME = false; C.start(); C.start();
        ok('a tab starts it once, in its top frame: a first look after a minute, then one every hour', inFrame === 0 && J(timers.map((x) => x[1])) === J([60000]) &&
            J(intervals.map((x) => x[1])) === J([3600000]) && timers[0][0] === C.tick && intervals[0][0] === C.tick, J(timers.map((x) => x[1])) + ' ' + J(intervals.map((x) => x[1])));
    } finally { global.setTimeout = st; global.setInterval = si; }
    ok('the Jira boot and the Confluence boot both start it, each in a try that keeps what it throws', /try \{ JiTA\.census\.start\(\); \} catch \(eCs\) \{ JiTA\.caught\('census\.start', eCs\); \}/.test(src) &&
        /try \{ JiTA\.census\.start\(\); \} catch \(e\) \{ JiTA\.caught\('census\.start', e\); \}/.test(src.slice(src.indexOf('\nif (JITA_IS_WIKI && !JITA_IS_SUBFRAME) {'), src.indexOf('\n}\n', src.indexOf('\nif (JITA_IS_WIKI && !JITA_IS_SUBFRAME) {')))));
    const about = /\n        if \(JiTA\.leadduty\.OWNER === \(\(JiTA\.leadduty\.me\(\) && JiTA\.leadduty\.me\(\)\.handle\) \|\| ''\)\) \{\n            \$\('<button class="jita-btn">Who runs what<\/button>'\)[^]*?\.on\('click', function \(\) \{ JiTA\.census\.openView\(\); \}\)/.exec(menuSrc);
    ok('Settings > About has the Who runs what button for the owner alone', !!about);

    Date.now = realNow;
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'census checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); console.log('\n1 FAILURE(S)'); process.exit(1); });
