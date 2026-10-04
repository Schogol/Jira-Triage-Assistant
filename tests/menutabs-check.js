// menutabs-check.js - Settings in tabs (v3.42.0). Runs the real JiTA.menu.render against a fake DOM and jQuery:
//  - one tab per area, in order (Features, Triage Assistant, Lead duties, About), each section in its tab's pane
//  - a tab exists only where its sections do: the Triage Assistant while it is on and off Confluence, Lead duties
//    for a Lead
//  - only the open tab's pane shows; a click switches without a redraw, and a redraw stays on the tab
//  - a remembered tab that is not there now shows the first one, and comes back when it is there again
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
        find: (sel) => { const f = n.querySelectorAll(sel)[0]; return f ? f.j : N(''); },
        empty: () => { n.kids = []; return j; },
        prop: () => j, css: () => j, val: (v) => (v === undefined ? '' : j)
    };
    n.j = j;
    return j;
}
const menu = N('<div id="jita-menu">');
global.$ = (x) => (x === '#jita-menu' ? menu : N(typeof x === 'string' ? x : ''));
global.document = { body: { contains: () => false } };   // async status lines find themselves gone and write nothing

// ---- what render reads while it builds ----
let lead = true;
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
    util: {}, changelog: {}, responses: {}, sync: {}, logsig: {}
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

(async () => {
    // ================= every area =================
    M.render();
    ok('one tab per area, in order', tabs().map((t) => t.txt).join(' | ') === 'Features | Triage Assistant | Lead duties | About', tabs().map((t) => t.txt).join(' | '));
    ok('...the title and the tab bar sit together at the top', menu.n.kids[0].cls.indexOf('jita-menu-top') >= 0 &&
        menu.n.kids[0].kids.map((k) => k.cls[0]).join() === 'jita-menu-head,jita-menu-tabs', JSON.stringify(menu.n.kids[0].kids.map((k) => k.cls)));
    const text = (id) => (paneOf(id) ? paneOf(id).all() : '');
    ok('Features has the switches, the Defect profile with its zip setting, and the canned responses', /Log Parser/.test(text('features')) && /Defect profile/.test(text('features')) &&
        /Read igbr\.zip/.test(text('features')) && /Screenshot translation/.test(text('features')) && /Customize responses/.test(text('features')) && !/Sync now/.test(text('features')));
    ok('the Triage Assistant tab has its actions and settings', /Sync now/.test(text('triage')) && /Panel style/.test(text('triage')) && /Results shown/.test(text('triage')) &&
        /Embedding backend/.test(text('triage')) && /Hidden suggestions/.test(text('triage')) && !/Log Parser/.test(text('triage')));
    ok('Lead duties has the Lead duties', /Open lead duties/.test(text('lead')) && /Test Confluence access/.test(text('lead')));
    ok('About has the version, What\'s new and the debug settings', /v3\.42\.0/.test(text('about')) && /What's new/.test(text('about')) && /Debug logging/.test(text('about')));
    ok('only the open tab shows, the first one at first, and it is marked', shown() === 'features' && marked() === 'features', shown() + ' / ' + marked());

    // ================= switching =================
    const before = menu.n.kids.length;
    menu.n.scrollTop = 120;
    click('lead');
    ok('a click opens its tab, without a redraw, at the top', shown() === 'lead' && marked() === 'lead' && M._tab === 'lead' && menu.n.kids.length === before && menu.n.scrollTop === 0,
        shown() + ' / ' + M._tab + ' / ' + menu.n.scrollTop);
    M.render();
    ok('a redraw (a switch flipped) stays on it', shown() === 'lead' && marked() === 'lead');

    // ================= tabs that come and go =================
    click('triage');
    savedVariables[5][1] = false;
    M.render();
    ok('with the Triage Assistant off there is no tab for it, and the first tab shows', tabs().map((t) => t.getAttribute('data-tab')).join() === 'features,lead,about' && shown() === 'features' &&
        marked() === 'features', tabs().map((t) => t.getAttribute('data-tab')).join() + ' / ' + shown());
    ok('...its tab is still the one remembered', M._tab === 'triage');
    savedVariables[5][1] = true;
    M.render();
    ok('...and back on, Settings is on it again', shown() === 'triage' && marked() === 'triage');
    lead = false;
    M.render();
    ok('someone who is not a Lead gets no Lead duties tab', tabs().map((t) => t.getAttribute('data-tab')).join() === 'features,triage,about');
    global.JITA_IS_WIKI = true;
    M.render();
    ok('on Confluence there is no Triage Assistant tab', tabs().map((t) => t.getAttribute('data-tab')).join() === 'features,about' && shown() === 'features');
    global.JITA_IS_WIKI = false;
    ok('every pane has exactly one tab', panes().length === tabs().length);

    // ================= looks =================
    const css = M.css;
    ok('the first heading of a tab, which repeats its name, is hidden; the others stay', css.indexOf('#jita-menu .jita-menu-pane > .jita-menu-sect:first-child > h3:first-child { display: none; }') >= 0);
    ok('the tab bar stays at the top while a tab scrolls', /#jita-menu \.jita-menu-top \{ position: sticky; top: 0;/.test(css));
    ok('Settings is a little wider, for its tab bar; the other overlays keep their width', css.indexOf('#jita-menu.jita-settings-view { width: 420px; }') >= 0 && css.indexOf('#jita-menu { width: 360px;') >= 0);

    console.log('\n' + (fail ? 'FAILURE: ' + fail + ' check(s) failed' : 'settings tab checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
