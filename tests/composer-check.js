// composer-check.js - the canned responses and the Zendesk composer (v3.39.3). Evals the real JiTA.responses members
// against a fake DOM:
//  - the compose editor is looked for only inside the Zendesk panel, nearest the composer's Add button: with no
//    editor there it is none, never another editor on the page (apply() empties whatever it is given)
//  - the dropdown's placeholder is written only when it changes (every write fired the panel observer again)
//  - a pick waits for the public reply tab and an editor, then inserts, and says so when it cannot
//  - the stored overlay: an override whose default was removed upstream survives, a legacy array is migrated
//  - the probe a GM note is confirmed by: the first line with text, as apply() types it
const fs = require('fs');
const whole = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
// Only the JiTA.responses block: other objects have members of the same name (JiTA.embed.load).
const rs = whole.indexOf('\nJiTA.responses = {'), re = whole.indexOf('\n};\n', rs);
if (rs < 0 || re < 0) { throw new Error('could not find JiTA.responses'); }
const src = whole.slice(rs, re + 4);
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};
const member = (head) => cut(head, '\n    },') + '\n    }';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a fake clock ----
let now = 0, timers = [];
global.setTimeout = (fn, ms) => { timers.push({ at: now + (ms || 0), fn: fn }); return timers.length; };
function runFor(ms) {
    const end = now + ms;
    for (;;) {
        timers.sort((a, b) => a.at - b.at);
        if (!timers.length || timers[0].at > end) { break; }
        const t = timers.shift();
        now = t.at;
        t.fn();
    }
    now = end;
}

// ---- a fake DOM tree ----
function N(name, kids, flags) {
    const n = Object.assign({ name: name, kids: kids || [], parentNode: null }, flags || {});
    n.kids.forEach((k) => { k.parentNode = n; });
    n.querySelector = () => { for (const k of n.kids) { if (k.editor) { return k; } const f = k.querySelector(); if (f) { return f; } } return null; };
    n.contains = (x) => x === n || n.kids.some((k) => k.contains(x));
    return n;
}
const ADD = 'button[data-testid="add-comment-button"]', LABEL = 'label[for="subdomain-select"]', VAL = '[data-jita-respval]';
global.SELECTORS = { ADD_COMMENT_BTN: ADD, ZD_SUBDOMAIN_LABEL: LABEL, ROLE_TAB: '[role="tab"]' };
let dom = {};
global.document = {
    querySelector: (s) => (s === ADD ? dom.add : s === LABEL ? dom.label : s === VAL ? dom.val : null) || null,
    getElementById: (id) => (id === 'jita-resp-col' ? dom.col : id === 'jita-resp-select' ? dom.sel : null) || null
};
function page(opts) {
    const col = N('col'), label = N('label'), add = N('add'), ed = N('editor', [], { editor: true }), jira = N('jira-editor', [], { editor: true });
    const composer = N('composer', opts.noEditor ? [add] : [ed, add]);
    const panel = N('panel', [N('header', [opts.noCol ? N('x') : col, opts.noLabel ? N('y') : label]), composer]);
    N('document', [jira, N('app', [panel])]);
    dom = { add: opts.noAdd ? null : add, label: opts.noLabel ? null : label, col: opts.noCol ? null : col };
    return { ed: ed, jira: jira };
}

global.JiTA = { ui: {} };
const toasts = [];
JiTA.ui.toast = (m) => { toasts.push(m); };
JiTA.responses = new Function('return ({' + [
    '    _emptyOverlay: function () {', '    _legacyToOverlay: function (arr) {', '    _overlay: function () {', '    _saveOverlay: function (ov) {',
    '    load: function () {', '    _composerEditor: function () {', '    _placeholder: function (list) {', '    _setDisplay: function (list) {',
    '    _onPick: function () {', '    _probe: function (note) {', '    _squash: function (s) {'
].map(member).join(',\n') + '});')();

(async () => {
    // ================= the compose editor =================
    let p = page({});
    ok('the editor next to the Add button is the one', JiTA.responses._composerEditor() === p.ed);
    p = page({ noEditor: true });
    ok('with no editor in the panel there is none, not the Jira editor elsewhere on the page', JiTA.responses._composerEditor() === null);
    p = page({ noAdd: true });
    ok('with no composer there is none', JiTA.responses._composerEditor() === null);
    p = page({ noCol: true, noLabel: true });
    ok('with no panel header to bound the search there is none', JiTA.responses._composerEditor() === null);
    p = page({ noCol: true });
    ok('before our dropdown is built the panel header bounds it', JiTA.responses._composerEditor() === p.ed);

    // ================= the placeholder =================
    let writes = 0, text = '';
    dom.val = { get textContent() { return text; }, set textContent(v) { writes++; text = v; } };
    JiTA.responses._setDisplay([{ title: 'a' }]);
    JiTA.responses._setDisplay([{ title: 'a' }]);
    JiTA.responses._setDisplay([{ title: 'a' }]);
    ok('the placeholder is written once, not on every pass', writes === 1 && /^Insert a response/.test(text), writes + ' ' + text);
    JiTA.responses._setDisplay([]);
    ok('...and again when it changes', writes === 2 && text === 'No responses configured', writes + ' ' + text);

    // ================= a pick =================
    const LIST = [{ title: 'S - one', body: 'first' }, { title: 'S - two', body: 'second' }];
    let applied = [], activeAt = 0, found = true, writable = true, edThere = true;
    Object.assign(JiTA.responses, {
        PICK_WAIT_MS: 3000,
        load: () => LIST,
        _compose: (b) => '[' + b + ']',
        _selectPublicReply: () => found,
        _publicReplyActive: () => now >= activeAt,
        _composerEditor: () => (edThere ? {} : null),
        apply: (b) => { applied.push(now + ':' + b); return writable; }
    });
    function pick(value, opts) {
        opts = opts || {};
        applied = []; toasts.length = 0; now = 0; timers = [];
        activeAt = opts.activeAt || 0; found = opts.found !== false; writable = opts.writable !== false; edThere = opts.edThere !== false;
        dom.sel = { value: value };
        JiTA.responses._onPick();
        runFor(10000);
    }
    pick('1');
    ok('a pick inserts the picked response', applied.length === 1 && /:\[second\]$/.test(applied[0]) && !toasts.length, applied.join() + ' ' + toasts.join());
    ok('...and resets the dropdown', dom.sel.value === '');
    pick('0', { activeAt: 700 });
    ok('a slow tab switch is waited for', applied.length === 1 && Number(applied[0].split(':')[0]) >= 700 && !toasts.length, applied.join());
    pick('0', { activeAt: 99999 });
    ok('a tab that never switches is said, and nothing is typed', !applied.length && toasts.length === 1 && /did not open/.test(toasts[0]), toasts.join());
    pick('0', { edThere: false });
    ok('...as is a reply box that never appears', !applied.length && toasts.length === 1, toasts.join());
    pick('0', { found: false });
    ok('a missing public reply tab is said', !applied.length && toasts.length === 1 && /tab was not found/.test(toasts[0]), toasts.join());
    pick('0', { writable: false });
    ok('a reply box that cannot be written to is said', applied.length === 1 && toasts.length === 1 && /could not be written to/.test(toasts[0]), toasts.join());
    pick('');
    ok('the placeholder picks nothing', !applied.length && !toasts.length);

    // ================= the stored overlay =================
    const stored = {};
    global.gmGet = (k, d) => (k in stored ? stored[k] : d);
    global.gmSet = (k, v) => { stored[k] = v; };
    Object.assign(JiTA.responses, { GM_KEY: 'resp', DEFAULTS: [{ title: 'A', body: 'a' }, { title: 'B', body: 'b' }] });
    delete JiTA.responses.load;
    JiTA.responses.load = new Function('return ({' + member('    load: function () {') + '}).load;')();
    stored.resp = { v: 2, overrides: { A: { title: 'A', body: 'a2' }, B: { title: 'B', body: 'b2' }, Z: { title: 'Z', body: 'z' } }, deleted: ['B'], added: [{ title: 'N', body: 'n' }] };
    const l = JiTA.responses.load();
    ok('an edited default, an override whose default was removed, and an addition, in that order; a deleted one is gone',
        l.map((r) => r.title + '=' + r.body).join() === 'A=a2,Z=z,N=n' && l[0]._orig === 'A', JSON.stringify(l));
    stored.resp = [{ title: 'A', body: 'a' }, { title: 'X', body: 'x' }];
    const l2 = JiTA.responses.load();
    ok('a legacy full list is migrated to the overlay', !Array.isArray(stored.resp) && stored.resp.deleted.join() === 'B' && l2.map((r) => r.title).join() === 'A,X', JSON.stringify(stored.resp));

    // ================= the probe =================
    const pr = JiTA.responses._probe;
    ok('the probe is the first line with text', pr('\n\nRefund approved\nby the lead') === 'Refund approved', pr('\n\nRefund approved\nby the lead'));
    ok('...with the bullet apply() types for a "- " line', pr('- first item\n- second') === String.fromCharCode(0x2022) + ' first item', pr('- first item'));
    ok('...whitespace squashed, at most 40 characters', pr('  a   b ' + 'x'.repeat(60)).length === 40 && pr('  a   b c') === 'a b c');

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'canned response checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL  crashed: ' + (e && e.stack || e)); process.exit(1); });
