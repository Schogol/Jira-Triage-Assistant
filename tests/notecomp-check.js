// notecomp-check.js - the VMS note composer (JiTA.leadduty.ui._noteComposer, v3.53.6, review 2026-11-20 leadduty-logic-1).
// VMS cannot edit or delete a note, and posting takes a second or two (the application page is read again first). Ctrl+Enter
// pressed again in that time posted the same note twice, and a tab rebuilt meanwhile (Refresh, a tab switch: the drafts
// are carried over) reopened the composer holding the note already posted. Checked here: one note at a time for an
// application, across rebuilt composers; the draft goes once the note is posted, whatever is on screen; a failure keeps
// the text; a rebuilt tab is redrawn from the outcome. Evals the real composer against a small fake jQuery.
const S = require('./source');
const src = S.load();
const piece = S.member(src, 'JiTA.leadduty.ui', '_noteComposer');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a fake jQuery: just what the composer calls ----
class El {
    constructor(html) {
        this.html = html; this.kids = []; this.attrs = {}; this.props = {}; this.cls = new Set(); this.handlers = {};
        this._val = ''; this.visible = true; this.focused = 0;
        const c = /class="([^"]*)"/.exec(html); if (c) { c[1].split(/\s+/).forEach((x) => this.cls.add(x)); }
        const t = />([^<]*)</.exec(html); this._text = t ? t[1] : '';
    }
    attr(k, v) { if (v === undefined) { return this.attrs[k]; } this.attrs[k] = v; return this; }
    appendTo(p) { p.kids.push(this); return this; }
    text(v) { if (v === undefined) { return this._text; } this._text = String(v); return this; }
    val(v) { if (v === undefined) { return this._val; } this._val = v; return this; }
    prop(k, v) { if (v === undefined) { return this.props[k]; } this.props[k] = v; return this; }
    addClass(c) { this.cls.add(c); return this; }
    removeClass(c) { this.cls.delete(c); return this; }
    toggle(on) { this.visible = !!on; return this; }
    is(sel) { return sel === ':visible' ? this.visible : false; }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    trigger(ev) { if (ev === 'focus') { this.focused++; } (this.handlers[ev] || []).forEach((f) => f.call(this, {})); return this; }
}
global.$ = (html) => new El(html);
const all = (el) => [el].concat(...el.kids.map(all));
const byClass = (root, c) => all(root).find((e) => e.cls.has(c));
const byText = (root, t) => all(root).find((e) => e._text === t && /^<button/.test(e.html));
const fire = (el, ev, e) => (el.handlers[ev] || []).forEach((f) => f.call(el, e || {}));
const ctrlEnter = () => ({ key: 'Enter', ctrlKey: true, preventDefault() {}, stopPropagation() {} });

// ---- the Lead duties UI around it ----
let open = true, statuses = [], shown = [], calls = [], answers = [];
const U = {
    _noteBusy: {}, _tab: 'apps', _apps: null,
    isOpen: () => open,
    _status: (m) => { statuses.push(m); },
    _showApp: (i) => { shown.push(i); }
};
const L = {
    ui: U,
    apps: {
        noteDefaultState: (states) => states[0],
        // Each call waits for the test to answer it: answers[n](res) resolves, answers[n].fail(err) rejects.
        addNote: (id, text, vis) => {
            calls.push({ id: id, text: text, vis: vis });
            return new Promise((res, rej) => { const a = (v) => res(v); a.fail = rej; answers.push(a); });
        }
    }
};
global.JiTA = { leadduty: L };
U._noteComposer = eval('({' + piece + '})')._noteComposer;
const settle = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setImmediate(r)); } };

const APP = { id: 'A1', name: 'ISD Bob' }, OTHER = { id: 'A2', name: 'ISD Eve' }, TARGET = { name: 'Bob', states: ['Developers', 'Public'] };
function state(drafts, items) { return { items: items || [APP], idx: 0, qa: { A1: { x: 1 }, A2: { x: 2 } }, drafts: drafts || {} }; }
function compose(it) {
    const box = $('<div class="ld-notes"></div>'), head = $('<div class="ld-nhead"></div>');
    U._noteComposer(box, head, it || APP, TARGET);
    const c = { box: box, ta: byClass(box, 'ld-nta'), post: byText(box, 'Post note'), msg: byClass(box, 'ld-nmsg') };
    c.type = (t) => { c.ta.val(t); fire(c.ta, 'input'); };
    return c;
}
const reset = () => { open = true; statuses = []; shown = []; calls = []; answers = []; U._noteBusy = {}; U._tab = 'apps'; };

(async () => {
    // ---- one note at a time ----
    reset();
    let st = U._apps = state();
    let c = compose();
    c.type('  Flagged in the background check.  ');
    ok('typing keeps a draft (control)', st.drafts.A1 && st.drafts.A1.text === '  Flagged in the background check.  ', JSON.stringify(st.drafts));
    fire(c.ta, 'keydown', ctrlEnter());
    fire(c.ta, 'keydown', ctrlEnter());
    fire(c.ta, 'keydown', Object.assign(ctrlEnter(), { repeat: true }));
    fire(c.post, 'click');
    ok('Ctrl+Enter pressed again, held down, or Post clicked while a note is on its way posts it once', calls.length === 1, calls.length + ' posts');
    ok('...the one post sends the text trimmed, with the visibility chosen', calls[0].text === 'Flagged in the background check.' && calls[0].vis === 'Developers' && calls[0].id === 'A1', JSON.stringify(calls[0]));
    ok('...Post is disabled and says it is sending', c.post.props.disabled === true && c.msg._text === 'Sending to VMS…', c.msg._text);
    answers[0]({ ok: true, name: 'Bob' });
    await settle();
    ok('once posted: the box is emptied and the draft goes', c.ta._val === '' && !st.drafts.A1, JSON.stringify(st.drafts));
    ok('...Post works again', c.post.props.disabled === false && JSON.stringify(U._noteBusy) === '{}', JSON.stringify(U._noteBusy));
    ok('...the status line says so, and the application is read again from VMS', statuses[statuses.length - 1] === "✓ Note added on Bob's account." && !st.qa.A1 && shown.join() === '0', statuses.join(' | ') + ' / ' + shown.join());
    c.type('A second, different note.');
    fire(c.ta, 'keydown', ctrlEnter());
    ok('a next note can be posted once the first has landed', calls.length === 2 && calls[1].text === 'A second, different note.', calls.length + ' posts');
    answers[1]({ ok: true });
    await settle();

    // ---- one at a time is per application ----
    reset();
    st = U._apps = state(null, [APP, OTHER]);
    c = compose();
    const c2 = compose(OTHER);
    c.type('On A1.'); c2.type('On A2.');
    fire(c.ta, 'keydown', ctrlEnter());
    fire(c2.ta, 'keydown', ctrlEnter());
    ok('another application\'s note can be posted meanwhile', calls.length === 2 && calls[1].id === 'A2', calls.map((x) => x.id).join());
    answers[0]({ ok: true }); answers[1]({ ok: true });
    await settle();

    // ---- a failure keeps the text ----
    reset();
    st = U._apps = state();
    c = compose();
    c.type('Keep me.');
    fire(c.ta, 'keydown', ctrlEnter());
    answers[0]({ ok: false, message: 'HTTP 403' });
    await settle();
    ok('a refused note keeps its text and its draft, and says why', c.ta._val === 'Keep me.' && st.drafts.A1 && st.drafts.A1.text === 'Keep me.' && c.msg._text === '✗ HTTP 403' && c.msg.cls.has('warn'), c.msg._text);
    ok('...and Post works again', c.post.props.disabled === false && !U._noteBusy.A1);
    fire(c.ta, 'keydown', ctrlEnter());
    answers[1].fail(new Error('the connection dropped'));
    await settle();
    ok('a post that throws gives Post back too, with the reason', c.post.props.disabled === false && !U._noteBusy.A1 && c.msg._text === '✗ the connection dropped' && st.drafts.A1, c.msg._text);

    // ---- the tab rebuilt while the note is on its way ----
    reset();
    st = U._apps = state();
    c = compose();
    c.type('Posted while the tab was rebuilt.');
    fire(c.ta, 'keydown', ctrlEnter());
    let st2 = U._apps = state(st.drafts);   // Refresh: a new state, the same drafts carried over
    let r = compose();
    ok('a composer built while the note is on its way shows it sending, Post disabled', r.post.props.disabled === true && r.msg._text === 'Sending to VMS…' && r.ta._val === 'Posted while the tab was rebuilt.', r.msg._text);
    fire(r.ta, 'keydown', ctrlEnter());
    fire(r.post, 'click');
    ok('...and cannot post the same note again', calls.length === 1, calls.length + ' posts');
    answers[0]({ ok: true, name: 'Bob' });
    await settle();
    ok('once posted, the carried-over draft is gone', !st2.drafts.A1 && !st.drafts.A1, JSON.stringify(st2.drafts));
    ok('...the application on screen is drawn again, read from VMS', shown.join() === '0' && !st2.qa.A1 && st2.qa.A2, shown.join() + ' / ' + JSON.stringify(st2.qa));
    ok('...and the status line says the note went in', statuses[statuses.length - 1] === "✓ Note added on Bob's account.", statuses.join(' | '));

    reset();
    st = U._apps = state();
    c = compose();
    c.type('Refused while the tab was rebuilt.');
    fire(c.ta, 'keydown', ctrlEnter());
    st2 = U._apps = state(st.drafts);
    answers[0]({ ok: false, message: 'HTTP 403' });
    await settle();
    ok('refused after a rebuild: the draft stays, the application is drawn again from what it had', st2.drafts.A1 && st2.drafts.A1.text === 'Refused while the tab was rebuilt.' && shown.join() === '0' && st2.qa.A1, JSON.stringify(st2.drafts));
    ok('...and the status line says the note was not posted', statuses[statuses.length - 1] === '✗ Note not posted: HTTP 403', statuses.join(' | '));
    ok('...and it can be posted again', !U._noteBusy.A1);

    reset();
    st = U._apps = state(null, [APP, OTHER]);
    c = compose();
    c.type('Posted, then the Lead moved on.');
    fire(c.ta, 'keydown', ctrlEnter());
    st2 = U._apps = state(st.drafts, [APP, OTHER]);
    st2.idx = 1;
    answers[0]({ ok: true });
    await settle();
    ok('rebuilt and on another application: its draft still goes, and nothing is redrawn', !st2.drafts.A1 && shown.length === 0, JSON.stringify(st2.drafts) + ' / ' + shown.join());

    reset();
    st = U._apps = state();
    c = compose();
    c.type('Posted, then the overlay closed.');
    fire(c.ta, 'keydown', ctrlEnter());
    open = false;
    answers[0]({ ok: true });
    await settle();
    ok('the overlay closed meanwhile: the draft still goes, and nothing is drawn', !st.drafts.A1 && shown.length === 0 && statuses.length === 0 && !U._noteBusy.A1, JSON.stringify(st.drafts));

    // ---- what it did before (controls) ----
    reset();
    st = U._apps = state();
    c = compose();
    fire(c.ta, 'keydown', ctrlEnter());
    ok('an empty note is not sent', calls.length === 0 && c.msg._text === 'Write something first.' && !U._noteBusy.A1, c.msg._text);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'note composer checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
