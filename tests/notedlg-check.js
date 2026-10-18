// notedlg-check.js - the note dialog of a Flag, a Resolve and a Resolve all (v3.43.0). The notes used to be asked for
// with prompt(), which takes one line. The dialog takes several, saves on its button or Ctrl+Enter (plain Enter is a
// new line), and cancels on its button or Esc - which it keeps from reaching the Lead duties window behind, so that
// one does not close too. While it is open no key gets past it to the page. What was typed is kept as a draft
// whether it is saved or not, and offered the next time the dialog opens for the same thing; a blank one is not
// kept. A click beside it does nothing, so a stray one cannot cost the note. Evals the real JiTA.leadduty and
// JiTA.leadduty.ui against a fake DOM just big enough for the dialog.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
const us = src.indexOf('JiTA.leadduty.ui = {'), ue = src.indexOf('\n};', src.indexOf('_injectCss: function ()', us)) + 3;
if (ls < 0 || le < 0 || us < 0 || ue < 3) { throw new Error('could not slice JiTA.leadduty / JiTA.leadduty.ui'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a fake DOM: elements are plain objects, the window keeps its capture-phase key listeners ----
function El(tag) {
    const e = { tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {}, on: {},
        className: '', id: '', textContent: '', value: '', rows: 0, maxLength: -1, type: '', sel: null };
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
    e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
    e.appendChild = (c) => { if (c.parentNode) { c.parentNode.removeChild(c); } c.parentNode = e; e.children.push(c); return c; };
    e.removeChild = (c) => { const i = e.children.indexOf(c); if (i >= 0) { e.children.splice(i, 1); } c.parentNode = null; return c; };
    e.addEventListener = (t, f) => { (e.on[t] = e.on[t] || []).push(f); };
    e.focus = () => { doc.activeElement = e; };
    e.setSelectionRange = (a, b) => { e.sel = [a, b]; };
    return e;
}
const doc = { body: El('body'), activeElement: null, createElement: (t) => El(t) };
global.document = doc;
const win = { keys: [] };
win.addEventListener = (t, f, cap) => { if (t === 'keydown' && cap === true) { win.keys.push(f); } };
win.removeEventListener = (t, f, cap) => { if (t === 'keydown' && cap === true) { win.keys = win.keys.filter((x) => x !== f); } };
global.window = win;
let styles = 0;
global.GM_addStyle = (css) => { if (css.indexOf('#ld-note-dlg') >= 0) { styles++; } };
global.gmGet = (k, d) => d;
global.gmSet = () => {};
let hides = 0;
global.JiTA = { HOST: 'https://x.atlassian.net', credits: { LEADS: {} }, dlog: () => {},
    ui: { _hideTip: (now) => { if (now === true) { hides++; } } } };
eval(src.slice(ls, le + em.length));
eval(src.slice(us, ue));
const L = JiTA.leadduty, U = L.ui;

// ---- helpers ----
function all(n) { let out = []; n.children.forEach((k) => { out.push(k); out = out.concat(all(k)); }); return out; }
const layer = () => doc.body.children.find((k) => k.id === 'ld-note-layer') || null;
const layers = () => doc.body.children.filter((k) => k.id === 'ld-note-layer').length;
const part = (cls) => { const l = layer(); return l ? all(l).find((n) => n.className.split(' ').indexOf(cls) >= 0) || null : null; };
const ta = () => part('ldn-ta');
const btn = (label) => { const l = layer(); return l ? all(l).find((n) => n.tagName === 'BUTTON' && n.textContent === label) || null : null; };
function type(text) { const t = ta(); t.value = text; (t.on.input || []).forEach((f) => f({ target: t })); }
function key(k, mods) {
    const e = { key: k, ctrlKey: false, metaKey: false, target: doc.activeElement, prevented: false, stopped: false, stoppedNow: false };
    Object.assign(e, mods || {});
    e.preventDefault = () => { e.prevented = true; };
    e.stopPropagation = () => { e.stopped = true; };
    e.stopImmediatePropagation = () => { e.stopped = true; e.stoppedNow = true; };
    win.keys.slice().forEach((f) => { if (!e.stoppedNow) { f(e); } });
    return e;
}
function click(el) { (el.on.click || []).forEach((f) => f({ target: el })); }
function mousedown(target) { const e = { target: target, prevented: false, preventDefault() { this.prevented = true; } }; (layer().on.mousedown || []).forEach((f) => f(e)); return e; }

let saved = [];
const ask = (o) => U._askNote(o, (note) => { saved.push(note); });

// ---- opening ----
ask({ title: 'Flag EBR-1', hint: 'What is wrong with it?', save: 'Flag', draft: 'EBR-1' });
const lay = layer(), box = lay && lay.children[0];
ok('it opens one dialog, over the page', !!lay && layers() === 1 && !!box && box.id === 'ld-note-dlg');
ok('...marked as a modal dialog that a focus trap of Jira\'s leaves alone', box.getAttribute('role') === 'dialog' && box.getAttribute('aria-modal') === 'true' &&
    lay.getAttribute('data-no-focus-lock') === 'true');
ok('...with its title and hint', part('ldn-title').textContent === 'Flag EBR-1' && part('ldn-hint').textContent === 'What is wrong with it?');
ok('...a text area of several rows, focused, empty, capped at NOTE_MAX', ta().tagName === 'TEXTAREA' && ta().rows >= 3 && doc.activeElement === ta() &&
    ta().value === '' && ta().maxLength === L.NOTE_MAX, ta().rows + ' rows, max ' + ta().maxLength);
ok('...a counter of what is left', part('ldn-count').textContent === '0 / ' + L.NOTE_MAX, part('ldn-count').textContent);
ok('...Cancel, and Save under the label asked for, neither a form submit', !!btn('Cancel') && !!btn('Flag') && btn('Cancel').type === 'button' && btn('Flag').type === 'button');
ok('...its styles are there, and the hover card is closed', styles === 1 && hides === 1, styles + ' styles, ' + hides + ' hides');
ok('...and it listens for keys ahead of the page', win.keys.length === 1);

// ---- typing ----
type('line one\nline two');
ok('the counter follows the typing', part('ldn-count').textContent === '17 / ' + L.NOTE_MAX, part('ldn-count').textContent);
let e = key('Enter');
ok('plain Enter is a new line: not taken, not saved', !e.prevented && layers() === 1 && saved.length === 0);
ok('...and no key reaches the page behind', e.stopped);
e = key('j');
ok('a letter types as usual and stays in the dialog', !e.prevented && e.stopped && layers() === 1);

// ---- clicks beside it ----
ok('a mousedown beside the dialog keeps the focus in the text', mousedown(lay).prevented === true);
ok('...one in the text area is left to the browser', mousedown(ta()).prevented === false);
ok('...and nothing closes the dialog but its buttons and keys', layers() === 1 && saved.length === 0);

// ---- Esc: cancel, and never the window behind ----
e = key('Escape');
ok('Esc cancels: the dialog closes without saving', layers() === 0 && saved.length === 0);
ok('...and the key goes no further, so the Lead duties window stays open', e.prevented && e.stoppedNow);
ok('...its key listener is gone with it', win.keys.length === 0);
ok('...what was typed is kept', U._drafts['EBR-1'] === 'line one\nline two', JSON.stringify(U._drafts));

// ---- the draft is offered again ----
ask({ title: 'Flag EBR-1', save: 'Flag', draft: 'EBR-1' });
ok('opened again for the same thing, it offers the note kept', ta().value === 'line one\nline two' && part('ldn-count').textContent === '17 / ' + L.NOTE_MAX);
ok('...with the caret at its end', JSON.stringify(ta().sel) === '[17,17]', JSON.stringify(ta().sel));
ok('...and no hint line when none is given', !part('ldn-hint'));
e = key('Enter', { ctrlKey: true });
ok('Ctrl+Enter saves, with the lines as typed', saved.length === 1 && saved[0] === 'line one\nline two' && layers() === 0, JSON.stringify(saved));
ok('...and is not passed on', e.prevented && e.stoppedNow && win.keys.length === 0);
ok('...the draft stays until the caller has saved it', U._drafts['EBR-1'] === 'line one\nline two');
delete U._drafts['EBR-1'];   // the caller, once the write landed

ask({ title: 'Resolve EBR-2', save: 'Resolve', draft: 'resolve:EBR-2' });
type('done');
key('Enter', { metaKey: true });
ok('Cmd+Enter saves too', saved.length === 2 && saved[1] === 'done' && layers() === 0);

// ---- the buttons ----
saved = [];
ask({ title: 'Resolve EBR-3', save: 'Resolve', draft: 'resolve:EBR-3' });
type('talked it through');
click(btn('Resolve'));
ok('the Save button saves', saved.length === 1 && saved[0] === 'talked it through' && layers() === 0 && win.keys.length === 0);
ask({ title: 'Resolve EBR-3', save: 'Resolve', draft: 'resolve:EBR-3' });
type('changed my mind');
click(btn('Cancel'));
ok('the Cancel button cancels, keeping what was typed', saved.length === 1 && layers() === 0 && U._drafts['resolve:EBR-3'] === 'changed my mind');
ask({ title: 'Resolve EBR-3', save: 'Resolve', draft: 'resolve:EBR-3' });
type('  \n ');
click(btn('Cancel'));
ok('...and a blank note is not kept', !('resolve:EBR-3' in U._drafts), JSON.stringify(U._drafts));
ask({ title: 'Flag EBR-4', save: 'Flag', draft: 'EBR-4' });
click(btn('Flag'));
ok('an empty note can still be saved (a flag without a reason)', saved.length === 2 && saved[1] === '' && !('EBR-4' in U._drafts));

// ---- one at a time ----
saved = [];
ask({ title: 'Flag EBR-5', save: 'Flag', draft: 'EBR-5' });
const first = btn('Flag');
type('first');
ask({ title: 'Flag EBR-6', save: 'Flag', draft: 'EBR-6' });
ok('a second dialog replaces the first', layers() === 1 && part('ldn-title').textContent === 'Flag EBR-6' && win.keys.length === 1);
click(first);
ok('...whose Save then does nothing', saved.length === 0 && layers() === 1);
key('Escape');

// ---- without a draft key, and with nothing given ----
const before = JSON.stringify(U._drafts);
U._askNote({}, (n) => { saved.push(n); });
ok('without a title or label it says Note and Save', part('ldn-title').textContent === 'Note' && !!btn('Save'));
type('loose');
key('Escape');
ok('...and without a draft key it keeps no draft', JSON.stringify(U._drafts) === before, JSON.stringify(U._drafts));
e = key('Escape');
ok('with no dialog open, keys are left alone', !e.prevented && !e.stopped && win.keys.length === 0);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'note dialog checks passed.'));
process.exit(fail ? 1 : 0);
