// overlay-check.js - overlays are not torn down by stray input (v3.38.8). A drag that starts in the box and is let
// go on the backdrop used to close the overlay (and discard a half-edited canned response); Esc in a text field
// closed it too; and Esc on a popover (the funnel's filter menu, the hide menu) closed the popover AND, bubbling on,
// the whole overlay under it - Triage mode included. Evals the real JiTA.menu.close / _openOverlay / _isTextField
// and JiTA.ui._popDismiss against a fake DOM.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const END = '\n    },';
const slice = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return src.slice(s, src.indexOf(END, s) + END.length);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a fake DOM and jQuery: nodes that take handlers, children and a parent ----
const byId = {}, keydown = [];
function N(html) {
    const n = { html: html || '', handlers: {}, kids: [], parentNode: null, id: ((/id="([^"]+)"/.exec(html || '') || [])[1] || '') };
    n[0] = n;
    n.on = (ev, fn) => { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return n; };
    n.appendTo = (p) => { const host = p[0] || p; host.kids.push(n); n.parentNode = host; if (n.id) { byId[n.id] = n; } return n; };
    n.append = (c) => { n.kids.push(c); c.parentNode = n; return n; };
    n.children = () => ({ text: () => n });
    n.text = () => n;
    n.removeChild = (c) => { n.kids = n.kids.filter((k) => k !== c); c.parentNode = null; if (byId[c.id] === c) { delete byId[c.id]; } };
    n.fire = (ev, e) => { (n.handlers[ev] || []).forEach((f) => f.call(n, e)); };
    return n;
}
const body = N('<body>');
global.document = {
    body: body,
    getElementById: (id) => byId[id] || null,
    addEventListener: (ev, fn) => { if (ev === 'keydown') { keydown.push(fn); } },
    removeEventListener: (ev, fn) => { const i = keydown.indexOf(fn); if (i >= 0) { keydown.splice(i, 1); } }
};
global.$ = (x) => (typeof x === 'string' ? N(x) : x);
global.JiTA = { menu: {}, ui: {} };
Object.assign(JiTA.menu, eval('({' + slice("    close: function () {\n        var o = document.getElementById('jita-menu-overlay');") +
    slice('    _openOverlay: function (opts) {') + slice('    _isTextField: function (el) {') + '})'));
JiTA.menu._injectCss = () => {};
JiTA.ui._popDismiss = eval('({' + slice('    _popDismiss: function (e, menu, anchor, close) {') + '})')._popDismiss;

const open = () => JiTA.menu._openOverlay({ title: 'Settings' });
const isOpen = () => !!byId['jita-menu-overlay'];
const esc = (target, extra) => { const e = Object.assign({ key: 'Escape', target: target || body, defaultPrevented: false }, extra || {}); keydown.slice().forEach((f) => f(e)); };
let blurred = 0;
const field = (tagName, type, editable) => ({ tagName: tagName, type: type || '', isContentEditable: !!editable, blur() { blurred++; } });

// ---- the backdrop ----
let ov = open();
ok('a plain Esc closes the overlay', (esc(), !isOpen()));
ov = open();
ov.$overlay[0].fire('mousedown', { target: ov.$overlay[0] });
ov.$overlay[0].fire('click', { target: ov.$overlay[0] });
ok('a click that begins and ends on the backdrop closes it', !isOpen());
ov = open();
ov.$overlay[0].fire('mousedown', { target: ov.$menu[0] });   // a drag-select starting in the box...
ov.$overlay[0].fire('click', { target: ov.$overlay[0] });    // ...let go on the backdrop
ok('a drag that starts in the box and ends on the backdrop leaves it open', isOpen());
ov.$overlay[0].fire('mousedown', { target: ov.$overlay[0] });
ov.$overlay[0].fire('click', { target: ov.$overlay[0] });
ok('...and a real backdrop click after it still closes it', !isOpen());

// ---- Esc in a field, and Esc already taken ----
ov = open();
blurred = 0;
esc(field('INPUT', 'text'));
ok('Esc in a text box only leaves the box', isOpen() && blurred === 1, String(blurred));
esc(field('TEXTAREA'));
esc(field('DIV', '', true));
ok('...the same in a text area or an editable element', isOpen() && blurred === 3, String(blurred));
esc(body);
ok('...and a second Esc then closes the overlay', !isOpen());
open();
esc(field('INPUT', 'checkbox'));
ok('Esc on a checkbox closes the overlay: there is no field to leave', !isOpen());
open();
esc(body, { defaultPrevented: true });
ok('an Esc something under the overlay has already handled leaves it open', isOpen());
JiTA.menu.close();

// ---- the popovers ----
let closed = 0, pd = 0, sp = 0;
const close = () => { closed++; };
const inside = { id: 'item' }, anchor = { contains: (t) => t === anchor }, menu = { contains: (t) => t === inside };
const key = (k) => ({ type: 'keydown', key: k, preventDefault() { pd++; }, stopPropagation() { sp++; } });
JiTA.ui._popDismiss(key('Escape'), menu, anchor, close);
ok('Esc on a popover closes it, and is stopped so it never reaches the overlay under it', closed === 1 && pd === 1 && sp === 1, closed + ' ' + pd + ' ' + sp);
JiTA.ui._popDismiss(key('Enter'), menu, anchor, close);
ok('...other keys are left alone', closed === 1 && pd === 1 && sp === 1);
JiTA.ui._popDismiss({ type: 'mousedown', target: inside }, menu, anchor, close);
JiTA.ui._popDismiss({ type: 'mousedown', target: anchor }, menu, anchor, close);
ok('a mousedown in the popover, or on the button that toggles it, keeps it', closed === 1, String(closed));
JiTA.ui._popDismiss({ type: 'mousedown', target: body }, menu, anchor, close);
ok('...one anywhere else closes it', closed === 2, String(closed));
ok('both popovers dismiss through it', src.indexOf('JiTA.ui._filterMenuDismiss = function (e) { JiTA.ui._popDismiss(e, menu, anchor, JiTA.ui._closeFilterMenu); };') >= 0 &&
    src.indexOf('JiTA.ui._hideMenuDismiss = function (e) { JiTA.ui._popDismiss(e, menu, null, JiTA.ui._closeHideMenu); };') >= 0);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'overlay checks passed.'));
process.exit(fail ? 1 : 0);
