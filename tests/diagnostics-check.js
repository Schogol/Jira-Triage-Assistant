// diagnostics-check.js - Copy diagnostics (v3.53.0). Evals the real JiTA.caught, JiTA.dlog and JiTA.diag against stubs:
//  - an error JiTA catches and goes on from is kept, once per place and message with how often it came, the latest
//    CAUGHT_MAX of them, logged the first time when Debug logging is on; the recorder never throws, whatever it is given
//  - no catch in the script drops its error any more: each one that used to say "swallow" passes it on, naming the call
//  - the debug log keeps its last DLOG_MAX lines, only while Debug logging is on, each argument cut short
//  - the report has the version, script manager, browser, kind of page (never its address), worker, stored data and
//    the errors, and the debug log when it is on; a database or worker that does not answer, or fails, is a line that
//    says so, and the report still comes
//  - copying uses the clipboard and rejects where there is none
require('./clock').install();   // the report's waits run on a clock of their own (clock.js)
const S = require('./source');
const src = S.load();

const realConsole = console.log;   // the debug log prints with console.log, which the stubs below catch
let fail = 0;
const ok = (n, c, x) => { realConsole((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };

// ---- stubs ----
let debug = false;
const logged = [];
global.gmGet = (k, d) => (k === 'sdDebug' ? debug : d);
global.window = { console: console };
console.log = (...a) => { logged.push(a); };
global.JITA_IS_FORGE_FRAME = false; global.JITA_IS_SUBFRAME = false;
global.location = { pathname: '/browse/EDR-41291' };
Object.defineProperty(global, 'navigator', { value: { userAgent: 'Mozilla/5.0 TestBrowser/1.0' }, configurable: true, writable: true });   // Node has one of its own
global.GM_info = { scriptHandler: 'Tampermonkey', version: '5.3.3' };
global.JiTA = eval(S.members(src, 'var JiTA', ['dlog', 'DLOG_MAX', '_dlogLines', '_fmtArgs', 'caught', 'CAUGHT_MAX', '_caughtList']));
Object.assign(JiTA, { SCRIPT_VERSION: '3.53.0', DATA_VERSION: 3, DATA_VERSION_EBR: 4 });
eval(S.top(src, 'JiTA.diag'));
const D = JiTA.diag;
const reset = () => { JiTA._caughtList.length = 0; JiTA._dlogLines.length = 0; logged.length = 0; };

(async () => {
    // ================= JiTA.caught =================
    reset();
    const boom = new TypeError('x is undefined');
    JiTA.caught('ui.ensure', boom);
    let c = JiTA._caughtList;
    ok('a caught error is kept with where it was, its message, the top of its stack, and when', c.length === 1 && c[0].where === 'ui.ensure' && c[0].msg === 'x is undefined' &&
        c[0].n === 1 && c[0].first === c[0].last && /^TypeError: x is undefined/.test(c[0].stack) && c[0].stack.split('\n').length <= 4, JSON.stringify(c[0]));
    ok('...and, with Debug logging off, logs nothing', logged.length === 0);
    await new Promise((r) => setTimeout(r, 5000));
    for (let i = 0; i < 99; i++) { JiTA.caught('ui.ensure', new TypeError('x is undefined')); }
    ok('the same error in the same place, again and again (an observer on every page change), is one entry with its count', c.length === 1 && c[0].n === 100 && c[0].last - c[0].first === 5000, JSON.stringify(c[0]));
    JiTA.caught('dv.ensure', new TypeError('x is undefined'));
    JiTA.caught('ui.ensure', new RangeError('too far'));
    ok('...while another place, or another message, is an entry of its own', c.length === 3 && c.map((x) => x.where + '/' + x.n).join() === 'ui.ensure/100,dv.ensure/1,ui.ensure/1', c.map((x) => x.where + '/' + x.n).join());
    reset();
    for (let i = 0; i < JiTA.CAUGHT_MAX + 7; i++) { JiTA.caught('step' + i, new Error('e')); }
    ok('only the latest ' + JiTA.CAUGHT_MAX + ' are kept', c.length === JiTA.CAUGHT_MAX && c[0].where === 'step7' && c[c.length - 1].where === 'step' + (JiTA.CAUGHT_MAX + 6), c.length + ' ' + c[0].where);
    reset();
    debug = true;
    JiTA.caught('sched.tick', boom);
    JiTA.caught('sched.tick', boom);
    ok('with Debug logging on, the first time is logged to the console, not every time', logged.length === 1 && logged[0][0] === '[JiTA] caught in sched.tick:' && logged[0][1] === boom, JSON.stringify(logged));
    debug = false;
    reset();
    const weird = [null, undefined, 'a plain string', 42, { no: 'message' }, Object.create(null), { get message() { throw new Error('getter'); } }, new Error(''), { message: 'x'.repeat(500) }];
    let threw = null;
    try { weird.forEach((w, i) => JiTA.caught('weird' + i, w)); } catch (e) { threw = e; }
    ok('it never throws, whatever is thrown: nothing, a string, a number, an object, one whose message throws', !threw && c.length >= 7, (threw && threw.message) + ' / ' + c.length);
    ok('...and keeps something readable for each', c.find((x) => x.where === 'weird0').msg === 'unknown error' && c.find((x) => x.where === 'weird2').msg === 'a plain string' &&
        c.find((x) => x.where === 'weird3').msg === '42' && c.find((x) => x.where === 'weird7').msg === 'Error' && c.find((x) => x.where === 'weird8').msg.length === 300,
        c.map((x) => x.where + '=' + x.msg.slice(0, 20)).join(' | '));

    // ================= the catches in the script =================
    ok('no catch in the script drops its error any more', src.indexOf('/* swallow */') < 0, (src.match(/.*\/\* swallow \*\/.*/) || [''])[0].trim().slice(0, 120));
    // A one-line try names the call it made: JiTA.<label>(, <label>( for a jita function, or the short name the code
    // uses there (S.tick for a scheduler, C. for the changelog, onAfter for the menu's callback).
    const calls = (label) => label === 'menu onAfter' ? ['onAfter('] : label === 'menu.render' ? ['JiTA.menu.render('] :
        /^jita/.test(label) ? [label + '('] : ['JiTA.' + label + '(', label.replace(/^\w+\.sched\./, 'S.').replace(/^sched\./, 'JiTA.sched.') + '(', label.replace(/^changelog\./, 'C.') + '('];
    const sites = [...src.matchAll(/try \{ ([^\n]*?) \} catch \((\w+)\) \{ JiTA\.caught\('([^']*)', (\w+)\); \}/g)];
    const misnamed = sites.filter((m) => m[2] !== m[4] || !m[3] || !calls(m[3]).some((k) => m[1].indexOf(k) >= 0));
    const all = (src.match(/JiTA\.caught\('/g) || []).length;
    ok('each one passes its own error on, named after the call it made (' + all + ' of them)', all >= 40 && sites.length >= all - 1 && !misnamed.length,
        all + ' / ' + sites.length + ' / ' + misnamed.map((m) => m[3] + ' <- ' + m[1].slice(0, 60)).slice(0, 5).join(' | '));
    ok('the page observer\'s steps are among them', /JiTA\.ui\.ensure\(\); \} catch \(e\) \{ JiTA\.caught\('ui\.ensure', e\); \}/.test(src) && /JiTA\.dv\.ensure\(\); \} catch \(e4\) \{ JiTA\.caught\('dv\.ensure', e4\); \}/.test(src) &&
        /JiTA\.checklist\.reensure\(\); \} catch \(eCl0\) \{ JiTA\.caught\('checklist\.reensure', eCl0\); \}/.test(src));

    // ================= the debug log =================
    reset();
    debug = false;
    JiTA.dlog('[JiTA] not kept', 1);
    ok('with Debug logging off, the debug log keeps nothing and prints nothing', JiTA._dlogLines.length === 0 && logged.length === 0);
    debug = true;
    JiTA.dlog('[JiTA] sync:', { stored: 3, changed: 1 }, new RangeError('far'), undefined, 'x'.repeat(400));
    ok('with it on, a line is printed and kept: its time, then each argument as text, an error by name and message, JSON cut short',
        logged.length === 1 && JiTA._dlogLines.length === 1 && /^\d\d:\d\d:\d\d \[JiTA\] sync: \{"stored":3,"changed":1\} RangeError: far undefined x{300}\.\.\.$/.test(JiTA._dlogLines[0]), JiTA._dlogLines[0]);
    const loop = {}; loop.self = loop;
    JiTA.dlog('a loop', loop);
    ok('...an argument JSON cannot write is still a line', /a loop \[object Object\]$/.test(JiTA._dlogLines[1]), JiTA._dlogLines[1]);
    for (let i = 0; i < JiTA.DLOG_MAX + 5; i++) { JiTA.dlog('line ' + i); }
    ok('...and only the last ' + JiTA.DLOG_MAX + ' lines are kept', JiTA._dlogLines.length === JiTA.DLOG_MAX && / line 5$/.test(JiTA._dlogLines[0]), JiTA._dlogLines[0]);
    debug = false;

    // ================= the report =================
    reset();
    JiTA.caught('ui.ensure', boom);
    JiTA.caught('ui.ensure', boom);
    await new Promise((r) => setTimeout(r, 1000));
    JiTA.caught('migrate.run', new Error('quota exceeded'));
    const meta = { lastSyncHighWater: '2026-11-19T08:00:00.000+0000', lastSyncHighWaterEbr: '2026-11-19T08:01:00.000+0000', dataVersionDefects: 3, dataVersionEbr: 4 };
    JiTA.db = { countDefects: () => Promise.resolve(5210), countEbr: () => Promise.resolve(2423), getMeta: (k) => Promise.resolve(meta[k]) };
    let pings = 0;
    JiTA.worker = { _started: true, usable: () => true, _isLeader: true, call: (t) => { pings++; return Promise.resolve({ backend: 'webgpu/fp32', version: '3.53.0' }); } };
    let r = await D.report();
    const lines = r.split('\n');
    ok('the report starts with when, the version and script manager, the browser and the kind of page', /^JiTA diagnostics, \d{4}-\d\d-\d\dT/.test(lines[0]) &&
        lines[1] === 'Version: 3.53.0, in Tampermonkey 5.3.3' && lines[2] === 'Browser: Mozilla/5.0 TestBrowser/1.0' && lines[3] === 'Page: an issue in EDR', lines.slice(0, 4).join(' | '));
    ok('...never the page\'s address: the issue key is not in it', r.indexOf('41291') < 0 && r.indexOf('/browse/') < 0);
    ok('...the worker and its backend, from a ping', /^Worker: this tab leads it, backend webgpu\/fp32, built from v3\.53\.0$/m.test(r) && pings === 1, (r.match(/^Worker:.*$/m) || [])[0]);
    ok('...what is stored and how far it is synced, against what this build reads', /^Data: 5210 issues stored, 2423 of them bug reports; synced up to 2026-11-19T08:00:00\.000\+0000 \(defects\) and 2026-11-19T08:01:00\.000\+0000 \(bug reports\); stored as data v3 and v4, this build reads v3 and v4$/m.test(r),
        (r.match(/^Data:.*$/m) || [])[0]);
    ok('...the errors, the latest first, each with its count and times and the top of its stack', /^Errors JiTA caught and went on from: 2$/m.test(r) &&
        r.indexOf('  1x  migrate.run: quota exceeded  (at ') < r.indexOf('  2x  ui.ensure: x is undefined  (first ') && /^        at /m.test(r), r.slice(r.indexOf('Errors')));
    ok('...and with Debug logging off, says how to get more', /^Debug log: off\. For more detail turn on Settings > About > Debug logging/m.test(r) && r.indexOf('Debug log, the last') < 0);
    debug = true;
    JiTA.dlog('[JiTA] kept line');
    r = await D.report();
    ok('with Debug logging on, the debug log is in it', /^Debug logging: on$/m.test(r) && /^Debug log, the last 1 lines:\n  \d\d:\d\d:\d\d \[JiTA\] kept line$/m.test(r), r.slice(r.indexOf('Debug log')));
    debug = false;
    reset();
    r = await D.report();
    ok('no errors caught: it says none', /^Errors JiTA caught and went on from: none$/m.test(r));

    // ---- what cannot be read ----
    JiTA.db = { countDefects: () => new Promise(() => {}), countEbr: () => Promise.resolve(1), getMeta: () => Promise.resolve(null) };
    JiTA.worker = { _started: true, usable: () => true, _isLeader: false, call: () => new Promise(() => {}) };
    let done = null;
    D.report().then((t) => { done = t; });
    await flush();
    ok('a database or worker that does not answer holds the report up no longer than WAIT_MS', done === null);
    await new Promise((res) => setTimeout(res, D.WAIT_MS + 10));
    await flush();
    ok('...then it comes, saying which did not answer', done !== null && /^Data: no answer from the local database within 3 s$/m.test(done) &&
        /^Worker: another tab leads it, no answer to a ping$/m.test(done), done && done.split('\n').slice(4, 7).join(' | '));
    JiTA.db = { countDefects: () => Promise.reject(new Error('The database connection is closing.')), countEbr: () => Promise.resolve(1), getMeta: () => Promise.resolve(null) };
    JiTA.worker = { _started: true, usable: () => true, _isLeader: true, call: () => Promise.reject(new Error('timeout')) };
    r = await D.report();
    ok('a database that fails says why', /^Data: could not be read \(The database connection is closing\.\)$/m.test(r), (r.match(/^Data:.*$/m) || [])[0]);
    ok('...and so does a worker that fails its ping', /^Worker: this tab leads it, no answer to a ping$/m.test(r), (r.match(/^Worker:.*$/m) || [])[0]);
    JiTA.db = { countDefects() { throw new Error('no indexedDB'); } };
    JiTA.worker = { _started: false };
    r = await D.report();
    ok('a database that throws at once, and a worker never started, are lines too', /^Data: could not be read \(no indexedDB\)$/m.test(r) && /^Worker: not started$/m.test(r), r.split('\n').slice(4, 7).join(' | '));
    JiTA.worker = { _started: true, usable: () => false };
    ok('...as is one that gave up', /^Worker: gave up/m.test(await D.report()));
    JiTA.worker = undefined;
    ok('...and a frame with no worker at all', /^Worker: \?$/m.test(await D.report()));

    // ---- the kind of page ----
    const page = (p, forge, sub) => { location.pathname = p; global.JITA_IS_FORGE_FRAME = !!forge; global.JITA_IS_SUBFRAME = !!sub; return D._page(); };
    ok('the kind of page: Confluence, the issue search, a board, the Zendesk frame, anything else', page('/wiki/spaces/ISD/pages/1') === 'Confluence' && page('/issues/?jql=x') === 'the issue search' &&
        page('/jira/software/c/projects/EDR/boards/1') === 'a Jira board, list or issue view' && page('/', true, true) === 'a Forge frame (the Zendesk panel), inside a frame' && page('/secure/Dashboard.jspa') === 'another page',
        [page('/wiki/x'), page('/issues/'), page('/jira/x'), page('/', true, true), page('/x')].join(' | '));
    global.JITA_IS_FORGE_FRAME = false; global.JITA_IS_SUBFRAME = false;
    const gi = global.GM_info;
    delete global.GM_info;
    ok('no GM_info: the version stands alone', D._manager() === '');
    global.GM_info = gi;

    // ================= copying =================
    let wrote = null;
    navigator.clipboard = { writeText: (t) => { wrote = t; return Promise.resolve(); } };
    let res = await D.copy('the report').then(() => 'ok', () => 'no');
    ok('copying writes the report to the clipboard', res === 'ok' && wrote === 'the report');
    navigator.clipboard = { writeText: () => Promise.reject(new Error('NotAllowedError')) };
    res = await D.copy('x').then(() => 'ok', () => 'no');
    ok('...and rejects where the browser refuses', res === 'no');
    navigator.clipboard = { writeText() { throw new Error('sync throw'); } };
    res = await D.copy('x').then(() => 'ok', () => 'no');
    ok('...or throws', res === 'no');
    delete navigator.clipboard;
    res = await D.copy('x').then(() => 'ok', (e) => e.message);
    ok('...or has no clipboard at all', res === 'no clipboard here', res);

    // ================= the button in Settings > About > Debug =================
    // The real block from JiTA.menu's render, run against a small jQuery: elements with text, attributes, children, a
    // parent and click handlers.
    const A = '        // Copy diagnostics: a short plain-text report', B = '        $diagStatus.appendTo($dbg);\n';
    const a0 = src.indexOf(A), b0 = src.indexOf(B, a0);
    if (a0 < 0 || b0 < 0 || src.indexOf(A, a0 + 1) >= 0) { throw new Error('could not find the Copy diagnostics block in JiTA.menu'); }
    function El(html) {
        const n = { html: html || '', txt: (html || '').replace(/<[^>]*>/g, ''), attrs: {}, props: {}, handlers: {}, kids: [], parent: null, value: '', selected: false };
        n.cls = ((/class="([^"]*)"/.exec(n.html) || [])[1] || '').split(/\s+/).filter(Boolean);
        const j = {
            n: n, 0: n, length: 1,
            appendTo(p) { p.append(j); return j; },
            append(c) { c.n.parent = n; n.kids.push(c.n); return j; },
            attr(k, v) { if (v === undefined) { return n.attrs[k]; } n.attrs[k] = v; return j; },
            prop(k, v) { if (v === undefined) { return n.props[k]; } n.props[k] = v; return j; },
            on(ev, fn) { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return j; },
            text(v) { if (v === undefined) { return n.txt; } n.txt = String(v); return j; },
            val(v) { if (v === undefined) { return n.value; } n.value = v; return j; },
            each(fn) { fn.call({ select() { n.selected = true; } }); return j; },
            insertAfter(t) { const p = t.n.parent; n.parent = p; p.kids.splice(p.kids.indexOf(t.n) + 1, 0, n); return j; },
            siblings(sel) {
                const c = sel.replace(/^\./, ''), p = n.parent, them = p ? p.kids.filter((k) => k !== n && k.cls.indexOf(c) >= 0) : [];
                return { remove() { them.forEach((k) => { p.kids.splice(p.kids.indexOf(k), 1); }); } };
            }
        };
        n.j = j;
        return j;
    }
    const $ = (x) => El(x);
    const find = (root, f) => { if (f(root)) { return root; } for (const k of root.kids) { const r = find(k, f); if (r) { return r; } } return null; };
    let live = true;
    JiTA.menu = { _live: () => live };
    const mount = () => {
        const $dbg = El('<div class="jita-menu-sect"></div>');
        new Function('$', 'JiTA', '$dbg', src.slice(a0, b0 + B.length))($, JiTA, $dbg);
        const btn = find($dbg.n, (x) => x.txt === 'Copy diagnostics'), status = $dbg.n.kids[$dbg.n.kids.length - 1];
        return { root: $dbg.n, btn: btn, status: status, click: () => btn.handlers.click.forEach((f) => f()) };
    };
    let gather = null, copied = [], refuse = false;
    JiTA.diag = Object.assign({}, D, {
        report: () => new Promise((res, rej) => { gather = { res: res, rej: rej }; }),
        copy: (t) => { copied.push(t); return refuse ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }
    });
    let m = mount();
    ok('Settings > About > Debug has a Copy diagnostics button, which says nothing is sent anywhere', !!m.btn && /Nothing is sent anywhere\./.test(m.btn.attrs.title) && /^jita-menu-status$/.test(m.status.cls.join(' ')),
        m.btn && m.btn.attrs.title);
    m.click();
    ok('a click turns it off and says it is gathering', m.btn.props.disabled === true && m.status.txt === 'Gathering…', m.status.txt);
    gather.res('THE REPORT');
    await flush();
    ok('...then copies the report, says so, and turns the button back on', copied.join() === 'THE REPORT' && m.status.txt === 'Copied. Paste it into your message.' && m.btn.props.disabled === false, m.status.txt);
    refuse = true;
    m.click(); gather.res('REPORT 2'); await flush();
    let ta = m.root.kids.filter((k) => k.cls.indexOf('jita-diag-text') >= 0);
    ok('a browser that will not copy: it says to copy by hand, and shows the report right under that, selected', /select the text below and copy it yourself/.test(m.status.txt) &&
        ta.length === 1 && ta[0].value === 'REPORT 2' && ta[0].selected && m.root.kids.indexOf(ta[0]) === m.root.kids.indexOf(m.status) + 1 && m.btn.props.disabled === false, m.status.txt + ' / ' + ta.length);
    m.click(); gather.res('REPORT 3'); await flush();
    ta = m.root.kids.filter((k) => k.cls.indexOf('jita-diag-text') >= 0);
    ok('...a second try shows the new report in place of the old, not a second box', ta.length === 1 && ta[0].value === 'REPORT 3', ta.map((t) => t.value).join());
    refuse = false;
    m.click(); gather.rej(new Error('broken')); await flush();
    ok('a report that fails says why, and the button comes back', m.status.txt === 'Could not gather it: broken' && m.btn.props.disabled === false, m.status.txt);
    m = mount();
    m.click();
    live = false;
    refuse = true;
    gather.res('LATE'); await flush();
    ok('Settings closed meanwhile: nothing is written into it', m.status.txt === 'Gathering…' && !m.root.kids.some((k) => k.cls.indexOf('jita-diag-text') >= 0), m.status.txt);

    realConsole('\n' + (fail ? fail + ' FAILURE(S)' : 'diagnostics checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { realConsole('  FAIL  crashed: ' + (e && e.stack || e)); realConsole('\n1 FAILURE(S)'); process.exit(1); });
