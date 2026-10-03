// ranklog-check.js - ranking and the "Defects in log" panel (v3.38.24). Evals the real code against stubs:
//  - a late ranking result redraws only when it is a Hybrid upgrade (a late Keyword fallback looped the panel), and
//    goes to whoever asked; Triage drops its cached Keyword ranking and redraws the report on screen
//  - the panel cycles only through occurrences on screen, and lives inside Triage mode's attachment viewer when the
//    log is parsed there
//  - the tab and worker fingerprint copies agree, end a block at EXCEPTION END and strip every log-column prefix
//  - a sync write that lands while the tab builds its own index leaves that index dirty
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to, at) => {
    const s = src.indexOf(from, at || 0), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || (at == null && src.indexOf(from, s + 1) >= 0)) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setImmediate(r)); } };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

(async () => {
    // ================= a late ranking result =================
    let renders = 0, timers = [];
    const realTimeout = setTimeout;
    global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
    global.clearTimeout = () => {};
    global.JiTA = { worker: { _started: true, usable: () => true }, embed: { WARM_WAIT_MS: 1500 }, ui: { scheduleRender: () => { renders++; } }, rank: {} };
    (0, eval)(cut('JiTA.rank._pickMode = function (', '\n};\n') + '\n};');
    const late = async (mode, onUpgrade) => {
        timers = []; renders = 0;
        const h = deferred();
        const p = JiTA.rank._pickMode(null, () => Promise.resolve({ mode: 'Keyword', results: ['kw'] }), () => h.promise, onUpgrade);
        timers.forEach((f) => f());   // the warm window closes first
        const first = await p;
        h.resolve({ mode: mode, results: [] });
        await flush();
        return first;
    };
    let first = await late('Keyword');
    ok('a slow worker shows Keyword first (control)', first.mode === 'Keyword');
    ok('a late Keyword fallback does not redraw the panel', renders === 0, String(renders));
    await late('Hybrid');
    ok('a late Hybrid result does (control)', renders === 1, String(renders));
    let upgraded = null;
    await late('Hybrid', (res) => { upgraded = res; });
    ok('...and goes to whoever asked for the ranking, instead of the panel', !!upgraded && upgraded.mode === 'Hybrid' && renders === 0, renders + ' renders');
    global.setTimeout = realTimeout;

    // ================= the suggest functions pass it on =================
    let picked = [];
    JiTA.rank._pickMode = (f, k, h, up) => { picked.push(up); return Promise.resolve({}); };
    (0, eval)(cut('JiTA.rank.suggestBest = function (', '\n};\n') + '\n};');
    (0, eval)(cut('JiTA.rank.suggestEbrBest = function (', '\n};\n') + '\n};');
    const cb1 = () => {}, cb2 = () => {};
    JiTA.rank.suggestBest('t', 'EBR-1', null, null, [], cb1);
    JiTA.rank.suggestEbrBest('t', 'EDR-1', null, [], cb2);
    ok('suggestBest and suggestEbrBest hand the upgrade hook on', picked[0] === cb1 && picked[1] === cb2);

    // ================= Triage =================
    let rendered = 0, hook = null;
    const T = { _mode: 'ebr', _view: () => 'defects', _cache: {}, _open: true, _queue: [{ key: 'EBR-7', created: '2026-10-01' }], _idx: 0, _render: () => { rendered++; } };
    global.JiTA = {
        triage: T,
        db: { getDefect: () => Promise.resolve({ key: 'EBR-7', summary: 's' }) },
        util: { effectiveText: () => 'text' },
        ui: { _filterTerms: () => [], modeOverride: null },
        rank: { suggestBest: (text, key, created, mode, terms, up) => { hook = up; return Promise.resolve({ mode: 'Keyword', results: [] }); } }
    };
    const tStart = src.indexOf('\nJiTA.triage = {');
    Object.assign(T, eval('({' + cut('    _resolve: function (item) {', '\n    },\n', tStart) + '\n    }})'));
    const r1 = await T._resolve(T._queue[0]);
    ok('Triage ranks a report and caches it (control)', r1.mode === 'Keyword' && !!T._cache['EBR-7'] && typeof hook === 'function');
    hook({ mode: 'Hybrid' });
    ok('a late Hybrid result drops Triage\'s cached Keyword ranking and redraws the report on screen', !T._cache['EBR-7'] && rendered === 1, rendered + ' / ' + !!T._cache['EBR-7']);
    await T._resolve(T._queue[0]);
    const again = hook;
    T._idx = 1; T._queue.push({ key: 'EBR-8' });
    again({ mode: 'Hybrid' });
    ok('...for a report not on screen it only drops the cache', !T._cache['EBR-7'] && rendered === 1, String(rendered));
    T._cache['EBR-7'] = Promise.resolve('newer');
    again({ mode: 'Hybrid' });
    ok('...and leaves a newer ranking of the same report alone', !!T._cache['EBR-7'] && rendered === 1);

    // ================= the "Defects in log" panel =================
    function El(tag) {
        const e = { tag: tag, children: [], parentNode: null, listeners: {}, style: {}, attrs: {}, id: '', className: '', textContent: '', innerHTML: '' };
        e.appendChild = (c) => { if (c.parentNode) { c.parentNode.removeChild(c); } c.parentNode = e; e.children.push(c); return c; };
        e.removeChild = (c) => { e.children = e.children.filter((x) => x !== c); c.parentNode = null; return c; };
        e.addEventListener = (t, f) => { (e.listeners[t] = e.listeners[t] || []).push(f); };
        e.classList = { add() {}, remove() {}, toggle: () => false, contains: () => false };
        e.setAttribute = (k, v) => { e.attrs[k] = v; };
        e.closest = (s) => { for (let n = e; n; n = n.parentNode) { if (s === '#jt-viewer' && n.id === 'jt-viewer') { return n; } } return null; };
        return e;
    }
    const body = El('body'), viewer = El('div'), table = El('table');
    viewer.id = 'jt-viewer';
    body.appendChild(viewer);
    let toasts = [];
    const find = (root, id) => { if (root.id === id) { return root; } for (const c of root.children) { const f = find(c, id); if (f) { return f; } } return null; };
    global.document = { body: body, createElement: (t) => El(t), getElementById: (id) => (id === 'tableContent' ? (table.parentNode ? table : null) : find(body, id)) };
    global.gmGet = () => false; global.gmSet = () => {};
    global.setTimeout = () => 0;
    global.JiTA = {
        ui: { toast: (m) => { toasts.push(m); }, _hideTip() {} },
        logsig: { COLLAPSE_KEY: 'c', _injectCss() {}, _injectClusterCss() {}, _fitVertical() {}, _applyPos() {}, _makeDraggable() {}, _showDefectTip() {}, _panelIdx: {} }
    };
    Object.assign(JiTA.logsig, eval('({' + cut('    renderPanel: function (found) {', '\n    },\n') + '\n    }})'));
    const row = (visible) => { const r = { isConnected: true, offsetParent: visible ? {} : null, shown: 0, classList: { add() {}, remove() {} } }; r.scrollIntoView = () => { r.shown++; }; return r; };
    const rows = [row(false), row(true), row(true)];
    body.appendChild(table);
    JiTA.logsig.renderPanel({ 'EDR-1': { count: 3, rows: rows, raw: 'KeyError' } });
    const panel = find(body, 'jita-logmatch-panel');
    ok('on the page the panel is put on the page (control)', !!panel && panel.parentNode === body);
    const li = find(panel, 'jita-logmatch-list').children[0];
    const click = () => li.listeners.click.forEach((f) => f({ stopPropagation() {} }));
    click(); click(); click();
    ok('clicking an entry steps only through the occurrences on screen', rows[0].shown === 0 && rows[1].shown === 2 && rows[2].shown === 1, rows.map((r) => r.shown).join());
    rows[1].offsetParent = null; rows[2].offsetParent = null;
    click();
    ok('...and says so when the filters hide every one', toasts.length === 1 && /hidden/.test(toasts[0]), toasts.join());
    body.removeChild(table); viewer.appendChild(table);   // the same log, now parsed in Triage mode's viewer
    JiTA.logsig.renderPanel({ 'EDR-1': { count: 1, rows: [row(true)], raw: 'KeyError' } });
    const p2 = find(body, 'jita-logmatch-panel');
    ok('a log parsed in Triage mode\'s viewer gets its panel inside the viewer', !!p2 && p2.parentNode === viewer && body.children.indexOf(p2) === -1, p2 && p2.parentNode && (p2.parentNode.id || p2.parentNode.tag));

    // ================= the fingerprint, in both copies =================
    global.JiTA = { logsig: { MIN_FRAMES: 2, CRASH_FRAMES: 2 } };
    Object.assign(JiTA.logsig, eval('({' + cut('    _splitBlocks: function (text) {', '\n    },\n') + '\n    },' + cut('    _fingerprint: function (text) {', '\n    },\n') + '\n    }})'));
    const W = new Function('LG_MIN', 'LG_CRASH', cut('    function lgSplit(text) {', '    function lgSiblings(key) {') + '\nreturn { split: lgSplit, fp: lgFp };')(2, 2);
    const tab = (x) => JiTA.logsig._splitBlocks(x).map((b) => JiTA.logsig._fingerprint(b).sig);
    const wrk = (x) => W.split(x).map((b) => W.fp(b).sig);
    const LOG = ['EXCEPTION #1 logged at 10/02/2026 12:00:00', 'Formatted exception info: KeyError: 2', 'Thrown at:', '/eve/a/foo.py(130) baz', '/eve/b/qux.py(40) quux', 'EXCEPTION END'].join('\n');
    const WITH_TRACE = LOG.split('\n').join(' ') + ' STACKTRACE #1 logged at 10/02/2026 12:00:01 /eve/c/other.py(10) zap /eve/d/more.py(20) zop STACKTRACE END';
    const P = '12:00:00\tgeneral\terror\t';
    const PASTED = LOG.split('\n').map((l) => P + l).join(' ');
    const want = tab(LOG)[0];
    ok('a parsed log block has a signature (control)', !!want && want === wrk(LOG)[0], want);
    ok('a stack trace pasted after EXCEPTION END is not read as more frames', tab(WITH_TRACE)[0] === want, tab(WITH_TRACE)[0]);
    ok('a description pasted with its log columns, lines joined by spaces, matches the parsed log', tab(PASTED)[0] === want, tab(PASTED)[0]);
    const samples = [LOG, WITH_TRACE, PASTED, LOG + '\n' + LOG.replace('#1', '#2').replace('KeyError: 2', 'ValueError: x'), 'no exception here'];
    ok('the worker\'s copy reads every sample exactly as the tab\'s does', samples.every((s) => JSON.stringify(tab(s)) === JSON.stringify(wrk(s))),
        samples.map((s) => JSON.stringify(tab(s)) + ' vs ' + JSON.stringify(wrk(s))).filter((x, i) => JSON.stringify(tab(samples[i])) !== JSON.stringify(wrk(samples[i]))).join(' | '));

    // ================= the tab's own index =================
    const read = deferred();
    global.JiTA = { db: { allDefects: () => read.promise }, rank: { _index: null, _dirty: true, _building: null } };
    Object.assign(JiTA.rank, eval('({' + cut('    _ensureCached: function (indexKey, dirtyKey, buildingKey, build) {', '\n    },\n') + '\n    }})'));
    const built = JiTA.rank._ensureCached('_index', '_dirty', '_building', (recs) => ({ n: recs.length }));
    JiTA.rank._dirty = true;   // a sync write commits while the read is under way
    read.resolve([1, 2]);
    await built;
    ok('a sync write during the tab\'s own index build leaves the index dirty, so the next call rebuilds', JiTA.rank._dirty === true, String(JiTA.rank._dirty));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ranking and log panel checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
