// balance-check.js - the credit balance from VMS on the credits pill (v3.40.0). Evals the real JiTA.credits and the
// Lead duties' VMS response check against stubs and the profile markup as VMS renders it:
//  - the balance and its "Updated" stamp are read from the profile's <dt>/<dd> pairs; a page without them, an empty
//    value, an expired session or a dropped connection is a failure with a reason, never a balance of 0
//  - a good read is cached an hour, a failed one five minutes; a failed read keeps the last good balance; one read at a time
//  - the pill shows the balance, this month's credits and the rank; a failed read shows a ⚠ and the last balance,
//    and a balance never read is left out; the ⚠ opens VMS, and focusing the tab after that reads again
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 12; i++) { await new Promise((r) => setImmediate(r)); } };

// ---- stubs: the meta store, a clock, the VMS GET ----
const meta = {};
let now = Date.UTC(2026, 9, 3, 12, 0, 0), gets = [], answer = null, opened = [];
Date.now = () => now;
global.flagOn = () => true;
global.window = { open: (u) => { opened.push(u); } };
global.JiTA = {
    db: {
        getMeta: (k) => Promise.resolve(Object.prototype.hasOwnProperty.call(meta, k) ? meta[k] : null),
        setMeta: (k, v) => { meta[k] = v; return Promise.resolve(); }
    },
    leadduty: { apps: {} }
};
eval(cut('JiTA.credits = {', '\n};\n') + '\n};');
Object.assign(JiTA.leadduty.apps, eval('({' + cut('    _unusable: function (r) {', '\n    },') + '\n    }})'));
JiTA.leadduty.apps._get = (url) => { gets.push(url); return Promise.resolve(typeof answer === 'function' ? answer() : answer); };
const B = JiTA.credits.balance, badge = JiTA.credits.badge;

// The profile's credits block exactly as VMS renders it (pasted from Schogol's browser, 2026-10-03), inside a page that
// has other <dt>/<dd> pairs before it and the transactions table, with its "Total Credits" column, after it.
const CREDITS = `<div class="col-md-12">
                            <h4>Credits</h4>
                            <dl class="dl-horizontal">
                                <dt>Credits</dt>
                                <dd>556</dd>
                                <dt>Updated</dt>
                                <dd>2026-10-02 15:33</dd>
                            </dl>
<h4>Credit transactions</h4>
<table class="table dataTable no-footer" id="DataTables_Table_0" role="grid"><thead><tr role="row"><th class="sorting">
                Total Credits
            </th><th class="sorting">Change</th><th class="sorting_asc">Changed by</th><th>Comment</th><th>Date</th></tr></thead>
    <tbody><tr class="odd"><td valign="top" colspan="5" class="dataTables_empty">No data available in table</td></tr></tbody></table></div>`;
const page = (inner) => '<html><body><h1>Settings / My profile</h1><dl><dt>Email</dt><dd>schogol@eve-isd.net</dd><dt>Joined</dt><dd>01 Sep 2017</dd></dl>' + inner + '</body></html>';
const got = (body, extra) => Object.assign({ body: body, finalUrl: B.URL, status: 200 }, extra || {});

(async () => {
    // ================= reading the profile =================
    let r = B._parse(got(page(CREDITS)));
    ok('the balance is read from the profile', r.ok === true && r.credits === 556, JSON.stringify(r));
    ok('...with when it last changed', r.updated === '2026-10-02 15:33', r.updated);
    r = B._parse(got(page(CREDITS.replace('<dd>556</dd>', '<dd> 1,234 </dd>'))));
    ok('a thousands separator and spaces are read through', r.ok && r.credits === 1234, JSON.stringify(r));
    r = B._parse(got(page(CREDITS.replace('<dd>556</dd>', '<dd>12.5</dd>'))));
    ok('a fraction is kept', r.ok && r.credits === 12.5, JSON.stringify(r));
    r = B._parse(got(page(CREDITS.replace('<dd>556</dd>', '<dd></dd>'))));
    ok('an empty balance is a failure, not 0', r.ok === false && r.reason === 'unreadable' && !('credits' in r), JSON.stringify(r));
    r = B._parse(got(page('<h4>Credit transactions</h4><table><tr><th>Total Credits</th></tr><tr><td>556</td></tr></table>')));
    ok('the transactions table is not read as the balance', r.ok === false && r.reason === 'unreadable', JSON.stringify(r));
    r = B._parse(got('<html><body><a href="https://login.eveonline.com/v2/oauth/authorize?x=1">Log in</a></body></html>'));
    ok('a page that only offers the SSO login is "log in"', r.ok === false && r.reason === 'login', JSON.stringify(r));
    r = B._parse(got('', { finalUrl: 'https://login.eveonline.com/account/logon' }));
    ok('a redirect to the SSO is "log in"', r.ok === false && r.reason === 'login', JSON.stringify(r));
    r = B._parse(got('', { status: 403 }));
    ok('a 403 is "log in"', r.ok === false && r.reason === 'login', JSON.stringify(r));
    r = B._parse({ failed: true, reason: 'net' });
    ok('a dropped connection is "unreachable"', r.ok === false && r.reason === 'net', JSON.stringify(r));
    ok('every failure has its own sentence', /Log in to VMS/.test(B.why({ reason: 'login' })) && /could not be reached/.test(B.why({ reason: 'net' })) &&
        /cannot be read from this browser/.test(B.why({ reason: 'nogm' })) && /could not be read/.test(B.why({ reason: 'unreadable' })));

    // ================= the cache =================
    answer = got(page(CREDITS));
    let rec = await B.refresh(false);
    ok('the first look reads VMS and stores the balance', gets.length === 1 && rec.ok && meta.creditsBalance && meta.creditsBalance.credits === 556 && meta.creditsBalance.at === now, gets.length + ' / ' + JSON.stringify(meta.creditsBalance));
    now += 30 * 60 * 1000;
    rec = await B.refresh(false);
    ok('within the hour the cached balance is used', gets.length === 1 && rec.credits === 556, String(gets.length));
    rec = await B.refresh(true);
    ok('...unless forced', gets.length === 2, String(gets.length));
    now += 61 * 60 * 1000;
    answer = got('', { finalUrl: 'https://login.eveonline.com/account/logon' });
    rec = await B.refresh(false);
    ok('an hour on, it reads again', gets.length === 3, String(gets.length));
    ok('a failed read keeps the last good balance', rec.ok === false && rec.reason === 'login' && rec.last && rec.last.credits === 556 && rec.last.updated === '2026-10-02 15:33', JSON.stringify(rec));
    const failedAt = now;
    now += 60 * 1000;
    rec = await B.refresh(false);
    ok('a failed read is not retried at once', gets.length === 3 && rec.at === failedAt, String(gets.length));
    now += 5 * 60 * 1000;
    answer = { failed: true, reason: 'net' };
    rec = await B.refresh(false);
    ok('...but after five minutes', gets.length === 4 && rec.reason === 'net', String(gets.length));
    ok('...and a second failure still keeps the balance from before the first', rec.last && rec.last.credits === 556, JSON.stringify(rec.last));
    answer = got(page(CREDITS.replace('<dd>556</dd>', '<dd>601</dd>')));
    const both = await Promise.all([B.refresh(true), B.refresh(true)]);
    ok('two refreshes at once read VMS once', gets.length === 5 && both[0] === both[1], String(gets.length));
    ok('a good read replaces the failure and drops the old balance', both[0].ok && both[0].credits === 601 && !('last' in both[0]), JSON.stringify(both[0]));

    // ================= what the pill says =================
    const month = { credits: 12, rank: 3, total: 40 };
    const good = { ok: true, credits: 556, updated: '2026-10-02 15:33', at: now };
    const stale = { ok: false, reason: 'login', at: now, last: { credits: 556, updated: '2026-10-02 15:33', at: Date.UTC(2026, 9, 2, 9, 5) } };
    let p = badge._parts(month, good, '');
    ok('the pill shows the balance, this month and the rank', p.text === '556 credits · +12 this month · #3/40' && !p.warn, p.text);
    ok('...and its tooltip says when the balance last changed and what this month earned',
        /Credit balance in VMS: 556 \(last changed 2026-10-02 15:33\)/.test(p.title) && /Earned so far this month: 12 credits, rank 3 of 40/.test(p.title), p.title);
    p = badge._parts(month, stale, '');
    ok('a failed read shows the last balance behind a warning', p.warn === true && p.text === '556 credits · +12 this month · #3/40', JSON.stringify(p));
    ok('...whose tooltip says why and what to do', /Log in to VMS/.test(p.warnTitle) && /open your VMS profile/.test(p.warnTitle) && /as read on 2026-10-02 09:05 UTC/.test(p.title), p.warnTitle + ' / ' + p.title);
    p = badge._parts(month, { ok: false, reason: 'unreadable', at: now }, '');
    ok('a balance never read is left out, not shown as 0', p.warn === true && p.text === '12 credits this month · #3/40' && !/\b0 credits/.test(p.text), p.text);
    p = badge._parts(month, null, '');
    ok('before the first read: no balance and no warning', p.warn === false && p.text === '12 credits this month · #3/40', JSON.stringify(p));
    ok('...and the month not computed yet: the balance alone', badge._parts(null, good, '').text === '556 credits');
    ok('...or a dash when there is neither', badge._parts(null, null, '').text === 'credits: -' && badge._parts({ na: true }, null, '').text === 'credits: n/a');
    ok('"updating…" still goes on the end', badge._parts(month, good, ' · updating…').text === '556 credits · +12 this month · #3/40 · updating…');

    // ================= the pill itself =================
    const mkEl = () => ({
        kids: [], attrs: {}, style: {}, title: '', _t: '', listeners: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(t, f) { this.listeners[t] = f; },
        appendChild(c) { this.kids.push(c); return c; },
        querySelector(sel) { const k = /data-cb="(\w+)"/.exec(sel)[1]; return this.kids.filter((c) => c.attrs['data-cb'] === k)[0] || null; },
        get textContent() { return this.kids.length ? this.kids.map((c) => c.textContent).join('') : this._t; },
        set textContent(v) { this.kids = []; this._t = v; }
    });
    global.document = { createElement: mkEl };
    const el = mkEl();
    el.textContent = '📊 credits…';
    badge._paint(el, badge._parts(month, stale, ''));
    ok('the pill reads with its warning', el.textContent === '📊 ⚠ 556 credits · +12 this month · #3/40', el.textContent);
    const warnEl = el.querySelector('[data-cb="warn"]');
    let stopped = false;
    warnEl.listeners.click({ stopPropagation: () => { stopped = true; } });
    ok('the warning opens the VMS profile instead of the leaderboard', stopped && opened[0] === B.URL && B._opened === true, opened.join() + ' / ' + stopped);
    badge._paint(el, badge._parts(month, good, ''));
    ok('a good read takes the warning away again, in the same spans', el.textContent === '📊 556 credits · +12 this month · #3/40' && el.kids.length === 3, el.textContent + ' / ' + el.kids.length);

    // ================= coming back to the tab =================
    JiTA.credits.badge.refresh = () => {};
    meta.creditsBalance = { ok: false, reason: 'login', at: now - 20 * 1000 };
    answer = got(page(CREDITS));
    let before = gets.length;
    await B.onFocus();
    ok('back from VMS after the warning sent you there: read again', gets.length === before + 1 && meta.creditsBalance.ok === true, String(gets.length - before));
    ok('...and a read that worked ends that', B._opened === false);
    meta.creditsBalance = { ok: false, reason: 'login', at: now - 20 * 1000 };
    before = gets.length;
    await B.onFocus();
    ok('otherwise a failure only seconds old is not read again on focus', gets.length === before, String(gets.length - before));
    meta.creditsBalance = { ok: false, reason: 'login', at: now - 3 * 60 * 1000 };
    await B.onFocus();
    ok('...but one a few minutes old is', gets.length === before + 1, String(gets.length - before));
    meta.creditsBalance = { ok: true, credits: 556, updated: '2026-10-02 15:33', at: now - 30 * 60 * 1000 };   // older than the focus wait, within the hour
    before = gets.length;
    await B.onFocus();
    ok('a good balance is not read again on focus, however old', gets.length === before, String(gets.length - before));

    // ================= wiring =================
    ok('the pill reads the balance when it mounts and listens for the tab coming back',
        /B\.refresh\(false\)\.then\(function \(\) \{ JiTA\.credits\.badge\.refresh\(\); \}/.test(src) && /window\.addEventListener\('focus', function \(\) \{ B\.onFocus\(\); \}\)/.test(src));
    ok('the credits poll keeps the balance fresh', src.indexOf('try { JiTA.credits.balance.refresh(false).then(function () { JiTA.credits.badge.refresh(); }') >= 0);

    await flush();
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'balance checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
