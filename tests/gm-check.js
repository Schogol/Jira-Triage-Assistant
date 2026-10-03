// gm-check.js - Convert to Support Ticket (v3.38.2). Two guards. The note for the GMs goes into whichever Zendesk
// composer tab is active, so it is posted only once "Add internal note" is found AND seen selected, and the tab is
// looked at once more right before Add is clicked: a composer left on "Add public reply" used to send the note to
// the player. And closing the modal (Cancel, Esc, the backdrop, another overlay opening) stops the conversion: the
// chain used to post the note and run the automation after the Lead had backed out. Evals the real
// JiTA.responses._selectInternalNote / _internalNoteActive / postInternalNote and jitaOpenGmModal against a fake
// composer, a fake clock and a fake jQuery.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const END = '\n    },';
const rs = src.indexOf('    _selectInternalNote: function () {');
const ps = src.indexOf('    postInternalNote: function (note) {', rs);
const re = src.indexOf(END, ps) + END.length;
const ms = src.indexOf('function jitaOpenGmModal(key) {');
const me = src.indexOf('\n}\n', ms) + 3;
if (rs < 0 || ps < 0 || re < END.length || ms < 0 || me < 3) { throw new Error('could not slice the GM flow'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a fake clock: the flow polls every 200 ms for up to 9 s, which a test should not sit through ----
const realTimeout = setTimeout;
let now = 0, timers = [], seq = 0;
global.setTimeout = (fn, ms) => { const id = ++seq; timers.push({ id, at: now + (ms || 0), fn, every: 0 }); return id; };
global.setInterval = (fn, ms) => { const id = ++seq; timers.push({ id, at: now + ms, fn, every: ms }); return id; };
global.clearTimeout = global.clearInterval = (id) => { timers = timers.filter((x) => x.id !== id); };
const flush = () => new Promise((r) => realTimeout(r, 0));   // lets every pending promise callback run
async function advance(ms) {   // run each timer due within ms, in time order, settling promises between them
    const end = now + ms;
    for (;;) {
        await flush();
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = timers[0];
        if (!next || next.at > end) { break; }
        now = next.at;
        if (next.every) { next.at = now + next.every; } else { timers.shift(); }
        next.fn();
    }
    now = end;
    await flush();
}

// ---- a fake Zendesk composer: a tab strip, one editor per tab, one Add button ----
const TAB = '[role="tab"]', ADD = 'button[data-testid="add-comment-button"]';
global.SELECTORS = { ROLE_TAB: TAB, ADD_COMMENT_BTN: ADD };
let tabs = [], active = null, editors = {}, posted = [], fills = [], clicks = [], takes = true, flipOnFill = false, noReset = false;
let failPost = false, placeholder = false, replace = false, gone = {};
function select(label) { active = label; tabs.forEach((x) => { x.attrs['aria-selected'] = String(x.textContent === label); }); }
function Tab(label) {
    const tb = { textContent: label, attrs: { 'aria-selected': 'false' } };
    tb.getAttribute = (k) => (k in tb.attrs ? tb.attrs[k] : null);
    tb.click = () => { clicks.push(label); if (takes) { select(label); } };
    return tb;
}
const add = { disabled: true, click() {
    posted.push({ tab: active, text: editors[active] });
    if (failPost) { add.disabled = true; setTimeout(() => { add.disabled = false; }, 400); return; }   // the post fails: the button comes back, the note stays
    if (replace) { gone[active] = true; add.disabled = true; return; }                                 // a fresh editor takes the old one's place
    if (!noReset) { editors[active] = placeholder ? 'Add an internal note for your team' : ''; add.disabled = true; }
} };
global.document = {
    querySelectorAll: (sel) => (sel === TAB ? tabs : []),
    querySelector: (sel) => (sel === ADD ? add : null)
};
function composer(opts) {
    tabs = (opts.tabs || ['Add internal note', 'Add public reply']).map(Tab);
    editors = {};
    tabs.forEach((x) => { editors[x.textContent] = ''; });
    select(opts.on);
    takes = opts.takes !== false;
    flipOnFill = !!opts.flip;
    noReset = !!opts.noReset;
    failPost = !!opts.failPost; placeholder = !!opts.placeholder; replace = !!opts.replace; gone = {};
    posted = []; fills = []; clicks = [];
    add.disabled = true;
}

global.JiTA = { responses: {}, menu: {}, ui: {} };
eval('JiTA.responses = {' + src.slice(rs, re) + '};');
Object.assign(JiTA.responses, {
    _hasTicket: () => true,
    _composerEditor: () => ({ textContent: editors[active] }),
    // The real apply types into the ACTIVE editor; the fill registering is what enables Add.
    apply: (text) => {
        const tab = active;
        fills.push(tab); editors[tab] = text; add.disabled = false;
        if (flipOnFill) { select('Add public reply'); }
        return { get isConnected() { return !gone[tab]; }, get textContent() { return editors[tab]; } };
    }
});
async function post(note) {
    let res = null;
    JiTA.responses.postInternalNote(note).then((r) => { res = r; });
    await advance(30000);
    return res;
}

// ---- the modal: a fake jQuery just big enough for its elements, and stubs for what it calls ----
function El(html) {
    const n = { html: html || '', kids: [], handlers: {}, props: {}, _text: '', _val: '', parent: null };
    n.text = (v) => { if (v === undefined) { return n._text; } n._text = String(v); return n; };
    n.val = (v) => { if (v === undefined) { return n._val; } n._val = v; return n; };
    n.css = () => n;
    n.prop = (k, v) => { if (v === undefined) { return n.props[k]; } n.props[k] = v; return n; };
    n.on = (ev, fn) => { (n.handlers[ev] = n.handlers[ev] || []).push(fn); return n; };
    n.appendTo = (p) => { p.kids.push(n); n.parent = p; return n; };
    n.append = (c) => { n.kids.push(c); c.parent = n; return n; };
    n.children = () => ({ css: () => {} });
    n.empty = () => { n.kids = []; return n; };
    return n;
}
global.$ = (x) => {
    if (typeof x === 'string' && x.charAt(0) === '<') { return El(x); }
    return El('');
};
// One overlay at a time, as JiTA.menu has it: opening one closes whatever was up, and close() closes whatever is up.
let open = null, closes = 0, menu = null;
JiTA.menu._openOverlay = () => {
    if (open) { open[0].isConnected = false; }
    open = [{ isConnected: true }];
    menu = El('<div id="jita-menu"></div>');
    return { $overlay: open, $menu: menu, close: JiTA.menu.close };
};
JiTA.menu.close = () => { closes++; if (open) { open[0].isConnected = false; open = null; } };
const deferred = () => { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; };
let ticket, notePost, invoke, closedD, notes = [], invokes = [], toasts = [], waits = [], reloads = 0, onKey = 'EBR-77';
global.JITA_GM_CATEGORIES = ['Account', 'Billing'];
global.jitaZdTicketState = () => ticket.promise;
global.jitaInvokeGmAutomation = (key, cat) => { invokes.push(key + ' ' + cat); return invoke.promise; };
global.jitaCloseAsWontDo = () => { throw new Error('not in these tests'); };
global.jitaWaitClosed = (key, tries) => { waits.push(key + ' ' + tries); return closedD.promise; };
global.jitaCurrentKey = () => onKey;
JiTA.ui.toast = (m) => { toasts.push(m); };
global.window = { location: { reload: () => { reloads++; } } };
eval(src.slice(ms, me));

function findEl(n, pred) { if (pred(n)) { return n; } for (const k of n.kids) { const f = findEl(k, pred); if (f) { return f; } } return null; }
const tap = (n) => n.handlers.click.forEach((f) => f.call(n));
const buttonOf = (label) => findEl(menu, (n) => /^<button/.test(n.html) && (n._text === label || n.html.indexOf('>' + label + '</button>') >= 0));
const statusText = () => findEl(menu, (n) => n.html.indexOf('min-height:15px') >= 0)._text;
// Open the modal, pick a category, type the note (if any) and press Convert.
function convert(note) {
    ticket = deferred(); notePost = deferred(); invoke = deferred(); closedD = deferred();
    notes = []; invokes = []; toasts = []; waits = []; closes = 0; reloads = 0; onKey = 'EBR-77';
    JiTA.responses.postInternalNote = (n) => { notes.push(n); return notePost.promise; };
    jitaOpenGmModal('EBR-77');
    tap(buttonOf('Billing'));
    findEl(menu, (n) => /^<textarea/.test(n.html)).val(note || '');
    tap(buttonOf('Convert'));
}
const cancel = () => tap(buttonOf('Cancel'));

(async () => {
    // ================= the internal note =================
    const NOTE = 'Refund approved by the GM lead';
    composer({ on: 'Add public reply' });
    let r = await post(NOTE);
    ok('a composer left on "Add public reply" is switched to the internal note first', clicks.indexOf('Add internal note') >= 0, clicks.join(','));
    ok('...and the note is posted there', !!r && r.ok === true && posted.length === 1 && posted[0].tab === 'Add internal note' && posted[0].text === NOTE, JSON.stringify(r) + ' ' + JSON.stringify(posted));
    ok('...never touching the public-reply editor', fills.length === 1 && fills.every((t) => t === 'Add internal note'), fills.join(','));

    composer({ on: 'Add internal note' });
    r = await post(NOTE);
    ok('a composer already on the internal note posts without a tab click', !!r && r.ok === true && clicks.length === 0 && posted.length === 1 && posted[0].tab === 'Add internal note');

    composer({ on: 'Add public reply', tabs: ['Add public reply'] });
    r = await post(NOTE);
    ok('no internal-note tab: nothing is posted', !!r && r.ok === false && posted.length === 0, JSON.stringify(posted));
    ok('...nothing is even typed into the public reply', fills.length === 0, fills.join(','));
    ok('...and the error says why', String(r && r.error).indexOf('Could not find the "Add internal note" tab') === 0, r && r.error);

    composer({ on: 'Add public reply', takes: false });
    r = await post(NOTE);
    ok('a tab click that does not take: nothing is posted', !!r && r.ok === false && posted.length === 0, JSON.stringify(posted));
    ok('...nothing is typed into the public reply', fills.length === 0, fills.join(','));
    ok('...and the error says the composer did not switch', String(r && r.error).indexOf('did not switch to "Add internal note"') >= 0, r && r.error);

    composer({ on: 'Add public reply', flip: true });
    r = await post(NOTE);
    ok('the composer leaving the internal note before Add: nothing is sent', !!r && r.ok === false && posted.length === 0, JSON.stringify(posted));
    ok('...and the error says so', String(r && r.error).indexOf('left "Add internal note" before the note was sent') >= 0, r && r.error);

    composer({ on: 'Add internal note', noReset: true });
    r = await post(NOTE);
    ok('Add clicked but never seen to go through is not a success, and says it was clicked', !!r && r.ok === false && r.clicked === true && posted.length === 1, JSON.stringify(r));
    composer({ on: 'Add internal note', failPost: true });
    r = await post(NOTE);
    ok('a post that fails is not a success, though the Add button disabled for a moment', !!r && r.ok === false && r.clicked === true, JSON.stringify(r));
    composer({ on: 'Add internal note', placeholder: true });
    r = await post(NOTE);
    ok('a reset editor showing its placeholder counts as posted', !!r && r.ok === true, JSON.stringify(r));
    composer({ on: 'Add internal note', replace: true });
    r = await post(NOTE);
    ok('...as does the editor being replaced by a fresh one', !!r && r.ok === true, JSON.stringify(r));

    // ================= the modal =================
    convert('for the GMs');
    ticket.resolve('ticket');
    await advance(0);
    ok('Convert with a ticket posts the note', notes.length === 1 && notes[0] === 'for the GMs', notes.join('|'));
    notePost.resolve({ ok: true });
    await advance(0);
    ok('...then runs the automation for the report and category', invokes.join('|') === 'EBR-77 Billing', invokes.join('|'));
    invoke.resolve({});
    await advance(0);
    ok('...and then waits for the report to close, the proof the rule did its work', statusText().indexOf('Automation started - waiting for the report to close') === 0 &&
        waits.join() === 'EBR-77 10', statusText() + ' / ' + waits.join());
    closedD.resolve(true);
    await advance(0);
    ok('...and reloads the page once it has', reloads === 1, String(reloads));

    convert('for the GMs');
    ticket.resolve('ticket'); notePost.resolve({ ok: true }); invoke.resolve({});
    await advance(0);
    closedD.resolve(false);
    await advance(0);
    ok('a report still open after the wait is said to be open, and why that may be', /still open 20 seconds later/.test(statusText()) && !!open && closes === 0, statusText());
    ok('...with Convert held, since a slow rule may yet finish', buttonOf('Convert').props.disabled === true && buttonOf('Convert')._text === 'Started', buttonOf('Convert')._text);
    ok('...and the page is not reloaded', reloads === 0, String(reloads));

    convert('');
    ticket.resolve('ticket'); invoke.resolve({});
    await advance(0);
    onKey = 'EBR-99';   // the user moved on to another issue meanwhile
    closedD.resolve(true);
    await advance(0);
    ok('a report that closes while the user is on another issue does not reload that issue', reloads === 0 && closes === 1, reloads + ' ' + closes);

    convert('');
    ticket.resolve('ticket'); invoke.resolve({});
    await advance(0);
    cancel();
    closedD.resolve(false);
    await advance(0);
    ok('a report still open after the modal was closed is said in a toast', toasts.length === 1 && /still open/.test(toasts[0]), toasts.join('|'));

    convert('for the GMs');
    cancel();
    ticket.resolve('ticket');
    notePost.resolve({ ok: true });
    invoke.resolve({});
    await advance(30000);
    ok('Cancel during the ticket check: no note is posted', notes.length === 0, notes.join('|'));
    ok('...and nothing is converted', invokes.length === 0, invokes.join('|'));
    ok('...silently', toasts.length === 0, toasts.join('|'));

    convert('');
    cancel();
    ticket.resolve('ticket');
    invoke.resolve({});
    await advance(30000);
    ok('Cancel during the check with no note: nothing is converted', invokes.length === 0, invokes.join('|'));

    convert('for the GMs');
    ticket.resolve('ticket');
    await advance(0);
    cancel();
    notePost.resolve({ ok: true });
    invoke.resolve({});
    await advance(30000);
    ok('Cancel while the note posts: the note was sent, but nothing is converted', notes.length === 1 && invokes.length === 0, invokes.join('|'));
    ok('...silently', toasts.length === 0, toasts.join('|'));

    convert('for the GMs');
    ticket.resolve('ticket');
    await advance(0);
    cancel();
    notePost.resolve({ ok: false, error: 'The Add button vanished.' });
    await advance(30000);
    ok('a note failing after Cancel says nothing: nothing was converted, as asked', invokes.length === 0 && toasts.length === 0, toasts.join('|'));

    convert('');
    ticket.resolve('ticket');
    await advance(0);
    invoke.resolve({});
    await advance(0);
    JiTA.menu._openOverlay({ title: 'Lead duties' });   // the Lead moved on to something else
    const other = open;
    onKey = 'EBR-99';
    closedD.resolve(true);
    await advance(0);
    ok('another overlay opened after the automation started is never closed by it', other[0].isConnected === true && closes === 0, String(closes));

    convert('');
    ticket.resolve('ticket');
    await advance(0);
    cancel();
    invoke.reject(new Error('Automation did not report success.'));
    await advance(0);
    ok('the automation failing after the modal was closed is still said, in a toast', toasts.join('|') === 'Convert to Support Ticket failed: Automation did not report success.', toasts.join('|'));

    convert('');
    ticket.resolve('ticket');
    await advance(0);
    invoke.reject(new Error('Automation did not report success.'));
    await advance(0);
    ok('the automation failing while the modal is open says so there', statusText() === 'Failed: Automation did not report success.' && toasts.length === 0, statusText());
    ok('...and Convert can be pressed again', buttonOf('Convert').props.disabled === false && buttonOf('Convert')._text === 'Convert');

    // A retry after a failed automation does not post the note a second time (v3.38.16).
    convert('for the GMs');
    ticket.resolve('ticket');
    await advance(0);
    notePost.resolve({ ok: true });
    await advance(0);
    invoke.reject(new Error('Automation did not report success.'));
    await advance(0);
    ok('a failed automation after the note went out says the note is already on the ticket', /already on the ticket/.test(statusText()), statusText());
    ticket = deferred(); invoke = deferred();
    tap(buttonOf('Convert'));
    ticket.resolve('ticket');
    await advance(0);
    ok('...and Convert again runs the automation without posting the note twice', notes.length === 1 && invokes.length === 2, notes.length + ' notes, ' + invokes.length + ' runs');

    convert('for the GMs');
    ticket.resolve('ticket');
    await advance(0);
    notePost.resolve({ ok: false, clicked: true, error: 'Could not confirm the note posted (composer did not reset).' });
    await advance(0);
    ok('a note whose Add was clicked but not confirmed counts as posted', /already on the ticket/.test(statusText()), statusText());
    ticket = deferred(); invoke = deferred();
    tap(buttonOf('Convert'));
    ticket.resolve('ticket');
    await advance(0);
    ok('...so Convert again does not post it again', notes.length === 1 && invokes.length === 1, notes.length + ' notes, ' + invokes.length + ' runs');

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'GM conversion checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
