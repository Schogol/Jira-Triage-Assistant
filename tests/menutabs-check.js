// menutabs-check.js - Settings in tabs (v3.42.0). Runs the real JiTA.menu.render against a fake DOM and jQuery:
//  - one tab per area, in order (Features, Triage Assistant, Canned responses, Lead duties, About), each section in its
//    tab's pane, whatever order render builds them in
//  - a tab exists only where its sections do: the Triage Assistant while it is on and off Confluence, Lead duties
//    for a Lead
//  - only the open tab's pane shows; a click switches without a redraw, and a redraw stays on the tab
//  - a remembered tab that is not there now shows the first one, and comes back when it is there again
//  - a click leaves no focus ring on the tab, and the open tab turning bold does not move the others
//  - Canned responses is the editor itself, and a redraw keeps that editor (typed edits, handlers and all)
//  - Settings keeps one height whichever tab is open, each tab scrolling under the title and the tab bar
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const block = (head, end) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return src.slice(s, src.indexOf(end, s) + end.length);
};

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a fake DOM and jQuery: nodes with classes, attributes, a style, children and handlers ----
function N(html) {
    html = html || '';
    const n = {
        cls: ((/class="([^"]*)"/.exec(html) || [])[1] || '').split(/\s+/).filter(Boolean),
        txt: html.replace(/<[^>]*>/g, ''), kids: [], attrs: {}, style: {}, handlers: {}, scrollTop: 7
    };
    n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.classList = {
        contains: (c) => n.cls.indexOf(c) >= 0,
        toggle: (c, on) => { const has = n.cls.indexOf(c) >= 0; if (on && !has) { n.cls.push(c); } if (!on && has) { n.cls.splice(n.cls.indexOf(c), 1); } }
    };
    n.querySelectorAll = (sel) => {
        const c = sel.replace(/^\./, ''), out = [];
        (function walk(x) { x.kids.forEach((k) => { if (k.cls.indexOf(c) >= 0) { out.push(k); } walk(k); }); })(n);
        return out;
    };
    n.all = () => n.txt + ' ' + n.kids.map((k) => k.all()).join(' ');
    const j = {
        0: n, length: 1, n: n,
        append: (c) => { if (c && c.n) { n.kids.push(c.n); } return j; },
        appendTo: (p) => { p.append(j); return j; },
        text: (t) => { if (t === undefined) { return n.all(); } n.txt = String(t); return j; },
        on: (ev, a, b) => { (n.handlers[ev] = n.handlers[ev] || []).push(typeof a === 'function' ? { fn: a } : { sel: a, fn: b }); return j; },
        addClass: (c) => { String(c).split(/\s+/).forEach((x) => { if (x && n.cls.indexOf(x) < 0) { n.cls.push(x); } }); return j; },
        removeClass: (c) => { n.cls = n.cls.filter((x) => x !== c); return j; },
        toggleClass: (c, on) => { n.classList.toggle(c, on); return j; },
        hasClass: (c) => n.cls.indexOf(c) >= 0,
        attr: (k, v) => { if (v === undefined) { return n.getAttribute(k); } n.attrs[k] = String(v); return j; },
        // Nothing found is an empty set, as in jQuery: length 0, and anything done to it does nothing.
        find: (sel) => { const f = n.querySelectorAll(sel)[0]; return f ? f.j : Object.assign(N(''), { length: 0 }); },
        // Out of the tree, handlers kept. empty() below strips the handlers of everything it removes, as jQuery's does.
        detach: () => { (function walk(x) { const i = x.kids.indexOf(n); if (i >= 0) { x.kids.splice(i, 1); } x.kids.forEach(walk); })(menu.n); return j; },
        empty: () => { (function strip(x) { x.kids.forEach((k) => { k.handlers = {}; strip(k); }); })(n); n.kids = []; return j; },
        prop: () => j, css: () => j, val: (v) => (v === undefined ? '' : j)
    };
    n.j = j;
    return j;
}
const menu = N('<div id="jita-menu">');
global.$ = (x) => (x === '#jita-menu' ? menu : N(typeof x === 'string' ? x : ''));
global.document = { body: { contains: () => false } };   // async status lines find themselves gone and write nothing

// ---- what render reads while it builds ----
let lead = true, built = 0;
global.JITA_IS_WIKI = false;
global.JITA_NO_JIRA_UI = false;
global.savedVariables = [['key', ''], ['parser', true], ['scrollbar', true], ['credits', true], ['buttons', true], ['similarDefects', true], ['detailView', true], ['screenOcr', true], ['defectProfile', true]];
const FLAGS = { parser: 1, scrollbar: 2, credits: 3, buttons: 4, similarDefects: 5, detailView: 6, screenOcr: 7, defectProfile: 8 };
global.flagOn = (name) => !!savedVariables[FLAGS[name]][1];
global.gmGet = (k, d) => d;
global.refreshMenu = () => {};
const never = () => new Promise(() => {});
global.JiTA = {
    TOP_N: 8, SCRIPT_VERSION: '3.42.0', MODEL_VERSION: 'm', embed: { MODEL: 'x' },
    ui: { mode: () => 'sidebar' }, hidden: { count: () => 0 }, dv: { _takeOn: () => true }, profile: { zipOn: () => true },
    db: { countDefectsOnly: never, countEbr: never, getMeta: never },
    worker: { _started: false, usable: () => false, _isLeader: false },
    leadduty: { isLead: () => lead, me: () => ({ handle: 'someone' }), ROSTER: () => ['someone'], OWNER: 'owner', pool: { CACHE_KEY: 'pool' } },
    // The editor, as buildEditor hands it over: one element, with a handler of its own (a section header's click).
    responses: { buildEditor: () => { built++; return N('<div class="jita-resp-editor">Opening & closing Responses Add section Save Restore defaults</div>').on('click', () => {}); } },
    util: {}, changelog: {}, sync: {}, logsig: {}
};
eval(block('JiTA.menu = {', '\n};\n'));
const M = JiTA.menu;

const tabs = () => menu.n.querySelectorAll('.jita-menu-tab');
const panes = () => menu.n.querySelectorAll('.jita-menu-pane');
const paneOf = (id) => panes().filter((p) => p.getAttribute('data-tab') === id)[0];
const shown = () => panes().filter((p) => p.style.display !== 'none').map((p) => p.getAttribute('data-tab')).join();
const marked = () => tabs().filter((t) => t.cls.indexOf('on') >= 0 && t.getAttribute('aria-selected') === 'true').map((t) => t.getAttribute('data-tab')).join();
const click = (id) => {
    const t = tabs().filter((x) => x.getAttribute('data-tab') === id)[0], bar = menu.n.querySelectorAll('.jita-menu-tabs')[0];
    bar.handlers.click.forEach((h) => { if (h.sel === '.jita-menu-tab') { h.fn.call(t); } });
};
const editor = () => menu.n.querySelectorAll('.jita-resp-editor')[0];

(async () => {
    // ================= every area =================
    M.render();
    ok('one tab per area, in order, though Canned responses is built before the Triage Assistant', tabs().map((t) => t.txt).join(' | ') ===
        'Features | Triage Assistant | Canned responses | Lead duties | About', tabs().map((t) => t.txt).join(' | '));
    ok('...each tab carries its name for the bold-width reserve', tabs().every((t) => t.getAttribute('data-label') === t.txt), JSON.stringify(tabs().map((t) => t.attrs)));
    ok('...the title and the tab bar sit together at the top', menu.n.kids[0].cls.indexOf('jita-menu-top') >= 0 &&
        menu.n.kids[0].kids.map((k) => k.cls[0]).join() === 'jita-menu-head,jita-menu-tabs', JSON.stringify(menu.n.kids[0].kids.map((k) => k.cls)));
    const text = (id) => (paneOf(id) ? paneOf(id).all() : '');
    ok('Features has the switches, the Defect profile with its zip setting', /Log Parser/.test(text('features')) && /Defect profile/.test(text('features')) &&
        /Read igbr\.zip/.test(text('features')) && /Screenshot translation/.test(text('features')) && !/Restore defaults/.test(text('features')) && !/Sync now/.test(text('features')));
    ok('Canned responses is the editor itself, not a button that opens it', built === 1 && paneOf('responses').kids.length === 1 &&
        paneOf('responses').kids[0] === editor() && !/Customize responses/.test(menu.n.all()), built + ' / ' + text('responses'));
    ok('the Triage Assistant tab has its actions and settings', /Sync now/.test(text('triage')) && /Panel style/.test(text('triage')) && /Results shown/.test(text('triage')) &&
        /Embedding backend/.test(text('triage')) && /Hidden suggestions/.test(text('triage')) && !/Log Parser/.test(text('triage')));
    ok('Lead duties has the Lead duties', /Open lead duties/.test(text('lead')) && /Test Confluence access/.test(text('lead')));
    ok('About has the version, What\'s new and the debug settings', /v3\.42\.0/.test(text('about')) && /What's new/.test(text('about')) && /Debug logging/.test(text('about')));
    ok('only the open tab shows, the first one at first, and it is marked', shown() === 'features' && marked() === 'features', shown() + ' / ' + marked());

    // ================= switching =================
    const before = menu.n.kids.length;
    click('lead');
    ok('a click opens its tab, without a redraw', shown() === 'lead' && marked() === 'lead' && M._tab === 'lead' && menu.n.kids.length === before,
        shown() + ' / ' + M._tab);
    const bar = menu.n.querySelectorAll('.jita-menu-tabs')[0];
    let prevented = 0;
    (bar.handlers.mousedown || []).forEach((h) => { if (h.sel === '.jita-menu-tab') { h.fn.call(tabs()[0], { preventDefault: () => { prevented++; } }); } });
    ok('pressing the mouse on a tab does not focus it, so a click leaves no focus ring', prevented === 1, String(prevented));
    M.render();
    ok('a redraw (a switch flipped) stays on it', shown() === 'lead' && marked() === 'lead');

    // ================= the canned responses editor across a redraw =================
    const ed = editor();
    ed.typed = 'Greetings Capsuleer,';   // stands for what is typed in it
    click('responses');
    M.render();
    ok('a redraw keeps the editor, with what is typed in it, in its tab', editor() === ed && editor().typed === 'Greetings Capsuleer,' && built === 1 &&
        paneOf('responses').kids[0] === ed && shown() === 'responses', built + ' / ' + (editor() === ed));
    ok('...and its handlers, which emptying the menu would strip', (ed.handlers.click || []).length === 1, JSON.stringify(Object.keys(ed.handlers)));
    menu.n.kids = [];   // Settings closed and opened again: a new, empty #jita-menu
    M.render();
    ok('Settings opened again builds a fresh editor (unsaved edits went with the old one)', built === 2 && editor() !== ed && !editor().typed, String(built));
    click('features');

    // ================= tabs that come and go =================
    click('triage');
    savedVariables[5][1] = false;
    M.render();
    ok('with the Triage Assistant off there is no tab for it, and the first tab shows', tabs().map((t) => t.getAttribute('data-tab')).join() === 'features,responses,lead,about' && shown() === 'features' &&
        marked() === 'features', tabs().map((t) => t.getAttribute('data-tab')).join() + ' / ' + shown());
    ok('...its tab is still the one remembered', M._tab === 'triage');
    savedVariables[5][1] = true;
    M.render();
    ok('...and back on, Settings is on it again', shown() === 'triage' && marked() === 'triage');
    lead = false;
    M.render();
    ok('someone who is not a Lead gets no Lead duties tab', tabs().map((t) => t.getAttribute('data-tab')).join() === 'features,triage,responses,about');
    global.JITA_IS_WIKI = true;
    M.render();
    ok('on Confluence there is no Triage Assistant tab', tabs().map((t) => t.getAttribute('data-tab')).join() === 'features,responses,about' && shown() === 'features');
    global.JITA_IS_WIKI = false;
    ok('every pane has exactly one tab', panes().length === tabs().length);
    ok('the redraws built no second editor', built === 2, String(built));

    // ================= looks =================
    const css = M.css;
    ok('the first heading of a tab, which repeats its name, is hidden; the others stay', css.indexOf('#jita-menu .jita-menu-pane > .jita-menu-sect:first-child > h3:first-child { display: none; }') >= 0);
    ok('Settings keeps one height whichever tab is open (at most 82% of the window), wide enough for five tabs; the other overlays keep their size',
        css.indexOf('#jita-menu.jita-settings-view { width: 460px; max-width: 94vw; height: 620px; max-height: 82vh; display: flex; flex-direction: column; overflow: hidden; }') >= 0 &&
        css.indexOf('#jita-menu { width: 360px; max-height: 82vh; overflow-y: auto;') >= 0);
    ok('...the title and tab bar keep their height, and the open tab scrolls under them', css.indexOf('#jita-menu .jita-menu-top { flex: 0 0 auto;') >= 0 &&
        css.indexOf('#jita-menu .jita-menu-pane { flex: 1 1 auto; min-height: 0; overflow-y: auto; }') >= 0);
    ok('...the canned responses tab lays out the editor, whose list scrolls over its footer', css.indexOf('#jita-menu .jita-menu-pane[data-tab="responses"] { display: flex; flex-direction: column; overflow: hidden; }') >= 0);
    ok('a focused tab gets no ring; one reached by the keyboard is marked', css.indexOf('#jita-menu .jita-menu-tab:focus { outline: none !important; box-shadow: none !important; }') >= 0 &&
        /#jita-menu \.jita-menu-tab:focus-visible \{ color: #e6e6e6; background: #343c44;/.test(css));
    ok('every tab is as wide as its name in bold, so the open one turning bold moves no other',
        css.indexOf('#jita-menu .jita-menu-tab::after { content: attr(data-label); display: block; height: 0; overflow: hidden; visibility: hidden; font-weight: 700; }') >= 0 &&
        /\.jita-menu-tab\.on \{[^}]*font-weight: 700;/.test(css));

    // ================= the editor's own build (it runs on a real page; here only its source) =================
    const be = block('    buildEditor: function () {', '\n    },\n');
    ok('the editor builds into an element of its own, list and footer, and hands it over', /var \$ed = \$\('<div class="jita-resp-editor"><\/div>'\);/.test(be) &&
        /\$\('<div class="jita-resp-scroll"><\/div>'\)\.appendTo\(\$ed\)/.test(be) && /\$\('<div class="jita-resp-foot"><\/div>'\)\.appendTo\(\$ed\)/.test(be) &&
        /\n        return \$ed;\n    },\n$/.test(be) && !/#jita-menu|_openOverlay/.test(be));
    ok('...and Save keeps Settings open', /JiTA\.responses\.save\(list\);/.test(be) && !/\.close\(|closeEditor/.test(be));

    console.log('\n' + (fail ? 'FAILURE: ' + fail + ' check(s) failed' : 'settings tab checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
