// ocr-check.js - the screenshot-translation layer (JiTA.ocr) must sit outside Jira's media-viewer focus lock.
// The viewer wraps itself in react-focus-lock, which pulls focus back into the viewer whenever it lands
// elsewhere unless the focused element is inside a [data-no-focus-lock] subtree. Without that, the card's
// language dropdown closed the instant it opened (v3.35.2). _enter and _showCard run for real against a
// small DOM stub; the check mirrors focus-lock's own test: some [data-no-focus-lock] node contains the element.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf('\nJiTA.ocr = {');
if (start < 0) { throw new Error('could not find JiTA.ocr'); }
function method(name) {
    const s0 = src.indexOf('\n    ' + name + ': function (', start);
    const e0 = src.indexOf('\n    },', s0) + '\n    },'.length;
    if (s0 < 0 || e0 < s0) { throw new Error('could not slice ' + name); }
    return src.slice(s0, e0);
}

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a DOM just big enough for _enter and _showCard ----
function el(tag) {
    const kids = {};
    const e = {
        tag: tag, id: '', className: '', innerHTML: '', style: {}, attrs: {}, children: [], parentNode: null, listeners: {},
        classList: { add: function () {}, remove: function () {} },
        setAttribute: function (k, v) { this.attrs[k] = String(v); },
        getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
        hasAttribute: function (k) { return k in this.attrs; },
        appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
        removeChild: function (c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
        addEventListener: function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
        // Markup set through innerHTML is not parsed; any selector answers with a child stub of this element,
        // which is what matters here: where in the tree the focusable controls end up.
        querySelector: function (sel) {
            if (!kids[sel]) { kids[sel] = el(sel); kids[sel].parentNode = this; }
            return kids[sel];
        },
        querySelectorAll: function (sel) { return [this.querySelector(sel), this.querySelector(sel + ':2')]; }
    };
    return e;
}
const body = el('body');
global.document = { body: body, createElement: el, getElementById: () => null };
global.window = { addEventListener: function () {}, removeEventListener: function () {}, innerWidth: 1600, innerHeight: 900 };

const O = {
    LANGS: [{ code: 'eng', name: 'English' }, { code: 'chi_sim', name: 'Chinese' }],
    _tgt: { img: {} }, _btn: null, _layer: null, _box: null, _card: null, _cardAt: null,
    _css: function () {}, _placeBox: function () {}, _placeCard: function () {}, _removeCard: function () {},
    _onDown: function () {}, _onKey: function () {}, _exit: function () {},
    _resolveLang: function () { return new Promise(function () {}); }
};
global.JiTA = { ocr: O };
Object.assign(O, eval('({' + method('_enter') + method('_showCard') + '})'));

// focus-lock's focusIsHidden(): is the element inside any [data-no-focus-lock] node?
function lockIgnores(node) {
    for (let n = node; n; n = n.parentNode) { if (n.hasAttribute && n.hasAttribute('data-no-focus-lock')) { return true; } }
    return false;
}
function attached(node) {
    for (let n = node; n; n = n.parentNode) { if (n === body) { return true; } }
    return false;
}

O._enter();
const layer = O._layer;
ok('entering selection mode adds the layer to the page', !!layer && attached(layer));
ok('the layer is marked data-no-focus-lock', !!layer && layer.hasAttribute('data-no-focus-lock'), layer && JSON.stringify(layer.attrs));
ok('...so the hint and its Done button are outside the lock too', lockIgnores(layer.querySelector('.jita-ocr-exit')));

O._showCard({ x: 10, y: 10, w: 200, h: 40 });
const card = O._card;
ok('the result card is on the page', !!card && attached(card));
ok('the card is inside the layer', !!card && card.parentNode === layer);
ok('the language dropdown can keep its focus', lockIgnores(card.querySelector('.jo-lang')));
ok('the recognized-text box can keep its focus', lockIgnores(card.querySelector('.jo-src')));
ok('the buttons can too', lockIgnores(card.querySelector('.jo-retx')) && lockIgnores(card.querySelector('.jo-copy')));

// A second box replaces the first card, in the same layer.
O._showCard({ x: 20, y: 20, w: 100, h: 30 });
ok('a new card after a new box is still inside the layer', lockIgnores(O._card) && O._card !== card);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'screenshot translation focus checks passed.'));
process.exit(fail ? 1 : 0);
