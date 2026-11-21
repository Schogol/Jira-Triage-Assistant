// ocrrace-check.js - the screenshot-translation races (v3.38.22). Evals the real JiTA.ocr methods against stubs:
//  - one pixel download per image however many boxes are drawn while it runs, and a failed one is not kept
//  - a box drawn before the pixels arrive owns the card: an earlier box's late answer or error never lands on it
//  - a language picked from the dropdown is not replaced by a slow label lookup
//  - overlapping translations: only the newest lands
//  - an engine start that goes quiet for ENGINE_STALL_MS is given up (progress keeps it alive); a failed warm-up
//    resets the engine
//  - the copy buttons say when the clipboard refused, through JiTA.util.copy
//  - labels that could not be read are said so and never kept for the image; an engine start given up is closed, not kept
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('\nJiTA.ocr = {');
if (start < 0) { throw new Error('could not find JiTA.ocr'); }
function method(name, from) {
    const s0 = src.indexOf('\n    ' + name + ': function (', from == null ? start : from);
    const e0 = src.indexOf('\n    },', s0) + '\n    },'.length;
    if (s0 < 0 || e0 < s0) { throw new Error('could not slice ' + name); }
    return src.slice(s0, e0);
}

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setImmediate(r)); } };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };

let fetches = [];
const canvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData() { throw new Error('SecurityError'); } }) });
global.document = { createElement: (t) => (t === 'canvas' ? canvas() : {}) };
global.createImageBitmap = (blob) => Promise.resolve({ width: 100, height: 50, blob: blob });
const realSetInterval = setInterval, realClearInterval = clearInterval;

const O = { ENGINE_STALL_MS: 120000 };
global.JiTA = { ocr: O };
Object.assign(O, eval('({' + method('_pixels') + method('_start') + method('_run') + method('_translate') + method('_engineTimed') + method('_enter') + method('_enqueue') + '})'));

const realRun = O._run;
(async () => {
    // ================= pixels and boxes =================
    let statuses = [], runs = 0, cards = 0;
    Object.assign(O, {
        _pix: null, _pixP: null, _job: null, _card: null, _tgt: { img: { currentSrc: 'https://media/x.png' } },
        _fetchBlob: (u) => { const d = deferred(); fetches.push(d); return d.promise; },
        _showCard: () => { O._card = { n: ++cards }; },
        _status: (m, k) => { statuses.push({ card: O._card && O._card.n, m: m, k: k }); },
        _run: () => { runs++; }
    });
    const cb = { x: 0, y: 0, w: 100, h: 50 }, rA = { x: 0, y: 0, w: 10, h: 10 }, rB = { x: 50, y: 20, w: 20, h: 10 };
    O._start(rA, cb);
    O._start(rB, cb);   // a second box before the image has arrived
    ok('two boxes drawn while the image downloads download it once', fetches.length === 1, fetches.length + ' downloads');
    fetches[0].resolve('bytes');
    await flush();
    ok('...and only the newest box is read', runs === 1 && O._job && O._job.screen === rB, runs + ' runs, job for ' + JSON.stringify(O._job && O._job.screen));
    ok('...whose pixels are kept for the next box', !!O._pix && O._pixP === null);

    O._pix = null; fetches = []; statuses = []; runs = 0;
    O._start(rA, cb);
    O._start(rB, cb);
    fetches[0].reject(new Error('HTTP 403'));
    await flush();
    const errs = statuses.filter((s) => s.k === 'err');
    ok('a failed download is said once, on the newest box\'s card', errs.length === 1 && errs[0].card === cards && /HTTP 403/.test(errs[0].m), JSON.stringify(errs));
    O._start(rB, cb);
    ok('...and the next box tries the download again', fetches.length === 2, fetches.length + ' downloads');
    fetches[1].resolve('bytes');
    await flush();

    // ================= the language =================
    let langD = deferred();
    Object.assign(O, {
        _run: realRun, _lang: null, _runId: 0, _card: {}, _job: { pix: {}, rect: {} },
        _resolveLang: () => langD.promise, _setText() {}, _cardLang() {}, _langByCode: () => ({ name: 'German' }),
        _variants: () => [], _crop: () => ({}), _recognize: () => Promise.resolve(null)
    });
    O._run();
    O._lang = { code: 'fra', why: 'picked' };   // picked from the dropdown while the labels were still loading
    langD.resolve({ code: 'deu', why: 'label', label: 'German' });
    await flush();
    ok('a language picked while the labels load is kept', O._lang.code === 'fra' && O._lang.why === 'picked', JSON.stringify(O._lang));
    O._lang = null; langD = deferred();
    O._run();
    langD.resolve({ code: 'deu', why: 'label', label: 'German' });
    await flush();
    ok('...otherwise the label decides (control)', O._lang && O._lang.code === 'deu', JSON.stringify(O._lang));
    // The labels could not be read (a 429, a lapsed session): read as English, but asked again for the next box.
    const real = eval('({' + method('_resolveLang') + method('_cardLang') + '})');
    Object.assign(O, { _issueKey: () => 'EBR-5', _langOverride: {}, _langFromLabels: (ls) => (ls.indexOf('Russian') >= 0 ? { code: 'rus', label: 'Russian' } : null) });
    O._labels = () => Promise.reject(new Error('HTTP 429'));
    let rl = await real._resolveLang.call(O);
    ok('labels that could not be read are a result of their own, read as English', rl.code === 'eng' && rl.why === 'failed', JSON.stringify(rl));
    O._labels = () => Promise.resolve([]);
    rl = await real._resolveLang.call(O);
    ok('...apart from no language label at all (control)', rl.why === 'none', JSON.stringify(rl));
    O._labels = () => Promise.resolve(['Russian']);
    rl = await real._resolveLang.call(O);
    ok('...and from a label (control)', rl.code === 'rus' && rl.why === 'label', JSON.stringify(rl));
    O._lang = null; langD = deferred();
    O._run();
    langD.resolve({ code: 'eng', why: 'failed' });
    await flush();
    ok('...one that failed is not kept for the image, so the next box asks again', O._lang === null, JSON.stringify(O._lang));
    const why = { textContent: '' }, sel = { value: '' }, srcEl = { setAttribute() {} };
    const keepCard = O._card, keepBy = O._langByCode;
    O._card = { querySelector: (s) => (s === '.jo-why' ? why : s === '.jo-lang' ? sel : srcEl) };
    O._langByCode = () => ({ bcp: 'en' });
    real._cardLang.call(O, { code: 'eng', why: 'failed' });
    ok('...and the card says the labels could not be read, not that there is none', /could not be read/.test(why.textContent) && !/no language label/.test(why.textContent), why.textContent);
    real._cardLang.call(O, { code: 'eng', why: 'none' });
    ok('...while with none it says so (control)', why.textContent === 'no language label - English', why.textContent);
    O._card = keepCard; O._langByCode = keepBy;

    // ================= translations =================
    const tx = [];
    const card = { tx: '', q: { '.jo-src': { value: 'Hallo' }, '.jo-join': { checked: false } }, querySelector(s) { return s === '.jo-tx' ? { set textContent(v) { card.tx = v; } } : this.q[s]; } };
    global.jitaTranslateFree = () => { const d = deferred(); tx.push(d); return d.promise; };
    Object.assign(O, { _card: card, _runId: 7, _txSeq: 0, _placeCard() {}, _join: (s) => s });
    O._translate(7);
    O._translate(7);   // Translate again before the first came back
    tx[1].resolve('Hello (newer)');
    await flush();
    tx[0].resolve('Hello (older)');
    await flush();
    ok('of two overlapping translations only the newer lands', card.tx === 'Hello (newer)', card.tx);

    // ================= the engine =================
    let t = 1000000, ticks = [];
    const realNow = Date.now;
    Date.now = () => t;
    global.setInterval = (fn) => { const h = { fn: fn, on: true }; ticks.push(h); return h; };
    global.clearInterval = (h) => { if (h) { h.on = false; } };
    let engineD = deferred();
    O._engine = () => engineD.promise;
    let outcome = null;
    O._engineTimed('deu').then(() => { outcome = 'ok'; }, (e) => { outcome = 'err:' + e.message; });
    const tick = () => ticks.filter((h) => h.on).forEach((h) => h.fn());
    t += 100000; O._engineBeat = t;   // a progress message from a slow model download
    t += 100000; tick();
    await flush();
    ok('an engine start that keeps reporting progress is not given up', outcome === null, String(outcome));
    t += 121000; tick();
    await flush();
    ok('...one silent for two minutes is', /^err:.*stopped responding/.test(outcome || '') && ticks.every((h) => !h.on), String(outcome));
    engineD = deferred(); outcome = null;
    O._engineTimed('deu').then(() => { outcome = 'ok'; }, (e) => { outcome = 'err:' + e.message; });
    engineD.resolve({});
    await flush();
    ok('...and one that starts stops being watched (control)', outcome === 'ok' && ticks.every((h) => !h.on), String(outcome));
    ok('every read starts its engine through that watch', /return O\._engineTimed\(code\)\.then\(/.test(method('_recognize')));
    Date.now = realNow;
    global.setInterval = realSetInterval; global.clearInterval = realClearInterval;

    // ================= a failed warm-up =================
    let resets = 0, armed = 0;
    const el = () => ({ attrs: {}, setAttribute() {}, addEventListener() {}, querySelector: () => ({ addEventListener() {} }), classList: { add() {} } });
    global.document = { createElement: el, body: { appendChild() {} } };
    global.window = { addEventListener() {} };
    Object.assign(O, {
        _layer: null, _btn: null, _lang: null, _q: null, _tgt: { img: {} },
        _css() {}, _placeBox() {}, _onDown() {}, _onKey() {}, _exit() {},
        _resolveLang: () => Promise.resolve({ code: 'deu', why: 'label' }),
        _engineTimed: () => Promise.reject(new Error('no model')),
        _resetEngine: () => { resets++; }, _armIdle: () => { armed++; }
    });
    O._enter();
    await flush();
    ok('a warm-up whose engine fails to start leaves no half-started engine behind', resets === 1 && armed === 0, resets + ' resets, ' + armed + ' idle timers');
    const codes = [];
    Object.assign(O, { _lang: null, _q: null, _layer: null, _tgt: { img: {} }, _resolveLang: () => Promise.resolve({ code: 'eng', why: 'failed' }),
        _engineTimed: (c) => { codes.push(c); return Promise.resolve(); } });
    O._enter();
    await flush();
    ok('a warm-up whose labels could not be read starts the English engine, keeping no language for the image', codes.join() === 'eng' && O._lang === null, codes.join() + ' / ' + JSON.stringify(O._lang));

    // ================= an engine start given up =================
    {
        const eng = eval('({' + method('_engine') + method('_engineTimed') + '})');
        let made = [], terminated = [];
        const W = (n) => ({ n, terminate() { terminated.push(n); }, setParameters: () => Promise.resolve(), reinitialize: () => Promise.resolve() });
        Object.assign(O, { _engine: eng._engine, _engineTimed: eng._engineTimed, _engineGen: 0, _worker: null, _workerKey: '', _idleT: null,
            _langList: (c) => (c === 'eng' ? ['eng'] : [c, 'eng']), _workerOpts: () => ({}),
            _lib: () => Promise.resolve({ createWorker: () => { const d = deferred(); made.push(d); return d.promise; } }) });
        global.$ = { extend: (a, b) => Object.assign({}, a, b) };
        let t2 = 2000000, ticks2 = [];
        const now0 = Date.now;
        Date.now = () => t2;
        global.setInterval = (fn) => { const h = { fn, on: true }; ticks2.push(h); return h; };
        global.clearInterval = (h) => { if (h) { h.on = false; } };
        let gaveUp = null;
        O._engineTimed('deu').then(() => { gaveUp = 'ok'; }, (e) => { gaveUp = e.message; });
        await flush();
        t2 += O.ENGINE_STALL_MS + 1000; ticks2.filter((h) => h.on).forEach((h) => h.fn());
        await flush();
        ok('(a start that went quiet is given up)', /stopped responding/.test(gaveUp || ''), String(gaveUp));
        O._engineTimed('deu').then(null, () => {});   // the next read starts a new one
        await flush();
        made[1].resolve(W('new'));
        await flush();
        made[0].resolve(W('abandoned'));   // the given-up start finishes after all
        await flush();
        ok('a start given up that finishes later is closed, not installed over the newer worker', O._worker && O._worker.n === 'new' && terminated.join() === 'abandoned' &&
            O._workerKey === 'deu+eng', (O._worker && O._worker.n) + ' / closed: ' + terminated.join());
        Date.now = now0; global.setInterval = realSetInterval; global.clearInterval = realClearInterval;
    }

    // ================= copy =================
    const uSrc = src.slice(src.indexOf('\nJiTA.util = {'));
    const util = eval('({' + method('copy', 0).replace(/^\n/, '') + '})');
    let execOk = false, appended = 0;
    global.navigator = {};
    global.document = { createElement: () => ({ style: {}, select() {} }), body: { appendChild() { appended++; }, removeChild() {} }, execCommand: () => execOk };
    let r = null;
    await util.copy('x').then(() => { r = 'ok'; }, () => { r = 'refused'; });
    ok('a copy the browser refuses rejects', r === 'refused', String(r));
    execOk = true;
    await util.copy('x').then(() => { r = 'ok'; }, () => { r = 'refused'; });
    ok('...one it accepts resolves (control)', r === 'ok', String(r));
    ok('the screenshot card and Lead duties both copy through it', uSrc.length > 0 && src.indexOf('JiTA.util.copy(txt).then(') > 0 && src.indexOf('JiTA.util.copy($msg.val()).then(') > 0 &&
        !/\n    _copy: function/.test(src) && /flash\('Copy failed'\)/.test(src));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'OCR race checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
