// Double-tap '#': on a bug report it flips the Triage Assistant panel to the trending defects and back (the funnel's
// switch, on a key), opening a collapsed panel first; anywhere else, or under an open overlay, it opens the standalone
// list. Evals the real JiTA.ui.toggleTrend / _reveal and the launcher's '#' branch out of the file.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');

function slice(sig) {
    const s = src.indexOf('    ' + sig);
    const e = src.indexOf('\n    },', s) + '\n    },'.length;
    if (s < 0 || e < 6) { throw new Error('could not slice ' + sig); }
    return src.slice(s, e);
}
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- stubs ----
let flag = true, gm = {}, els = {}, calls = [];
global.flagOn = (n) => n === 'similarDefects' && flag;
global.gmSet = (k, v) => { gm[k] = v; };
function el(id, collapsed) {
    const cls = new Set(collapsed ? ['collapsed'] : []);
    const attrs = {};
    const hdr = { attrs: { 'aria-expanded': 'false' }, setAttribute(k, v) { this.attrs[k] = v; } };
    return {
        id, hdr, scrolled: 0, textContent: '',
        classList: { contains: (c) => cls.has(c), remove: (c) => cls.delete(c), add: (c) => cls.add(c) },
        hasAttribute: (k) => k in attrs,
        setAttribute: (k, v) => { attrs[k] = v; },
        querySelector: (q) => (q === '[aria-expanded]' ? hdr : null),
        scrollIntoView() { this.scrolled++; },
        isCollapsed: () => cls.has('collapsed')
    };
}
global.document = { getElementById: (id) => els[id] || null, querySelector: (q) => els['q:' + q] || null };

global.JiTA = { ui: {} };
eval('Object.assign(global.JiTA.ui, {' + [slice('toggleTrend: function () {'), slice('_reveal: function () {')].join('\n') + '\n});');
const U = global.JiTA.ui;
U.SIDE_COLLAPSE_KEY = 'sdSideCollapsed'; U.COLLAPSE_KEY = 'sdPanelCollapsed';
U._chromePresent = () => !!els['jita-sd-list'];
U._closeFilterMenu = () => calls.push('closeMenu');
U._syncFilterBtn = () => calls.push('sync');
U._rerenderCurrent = () => calls.push('render');
U._setChevron = (g, c) => calls.push('chevron:' + c);
U._fitVertical = () => calls.push('fit');

function reset(key, opts) {
    opts = opts || {};
    flag = opts.flag !== false; gm = {}; calls = [];
    els = {};
    if (opts.panel !== false) { els['jita-sd-list'] = {}; }
    if (opts.side) { els['jita-side-group'] = el('jita-side-group', opts.side === 'collapsed'); }
    if (opts.floating) {
        els['jita-sd-panel'] = el('jita-sd-panel', opts.floating === 'collapsed');
        els['jita-sd-collapse'] = { textContent: '+' };
    }
    U.currentKey = key; U.trendMode = false; U.reporterMode = false; U.simReportsMode = false;
}

// ---- the panel switch ----
reset('EBR-100', { side: 'open' });
U.reporterMode = true;
ok('on a bug report it takes the key', U.toggleTrend() === true);
ok('turns trending on and the report view off', U.trendMode === true && U.reporterMode === false && U.simReportsMode === false);
ok('closes the funnel, re-colours it and re-renders', calls.join(' ') === 'closeMenu sync render', calls.join(' '));
ok('and brings the panel into view', els['jita-side-group'].scrolled === 1);
calls = [];
ok('a second double tap takes it too', U.toggleTrend() === true);
ok('...and turns trending off', U.trendMode === false && calls.indexOf('render') !== -1);

reset('EDR-5', { side: 'open' });
ok('on a defect it declines, for the list to open', U.toggleTrend() === false);
ok('...changing nothing', U.trendMode === false && calls.length === 0, calls.join(' '));
reset(null, { side: 'open' });
ok('off an issue it declines', U.toggleTrend() === false && calls.length === 0);
reset('EBR-100', { side: 'open', flag: false });
ok('with the Triage Assistant switched off it declines', U.toggleTrend() === false && U.trendMode === false);
reset('EBR-100', { panel: false });
ok('with no panel mounted it declines', U.toggleTrend() === false && U.trendMode === false);

// ---- a collapsed panel opens first ----
reset('EBR-100', { side: 'collapsed' });
U.toggleTrend();
const g = els['jita-side-group'];
ok('a collapsed sidebar group is expanded', !g.isCollapsed());
ok('...its chevron points down', calls.indexOf('chevron:false') !== -1, calls.join(' '));
ok('...its header says so', g.hdr.attrs['aria-expanded'] === 'true');
ok('...and the expansion is remembered', gm.sdSideCollapsed === false, JSON.stringify(gm));
reset('EBR-100', { side: 'open' });
U.toggleTrend();
ok('an open group is left alone', !('sdSideCollapsed' in gm) && calls.indexOf('chevron:false') === -1);
reset('EBR-100', { floating: 'collapsed' });
U.toggleTrend();
ok('a collapsed floating panel is expanded', !els['jita-sd-panel'].isCollapsed());
ok('...its control reads as expanded', els['jita-sd-collapse'].textContent === '–');
ok('...remembered, and re-fitted', gm.sdPanelCollapsed === false && calls.indexOf('fit') !== -1, JSON.stringify(gm) + ' ' + calls.join(' '));

// ---- the launcher ----
const ls = src.indexOf("            if (e.key === '#') {");
const le = src.indexOf("            // double-tap '>'", ls);
if (ls < 0 || le < 0) { throw new Error('could not slice the launcher'); }
let lastHash = 0;   // the launcher's own closure variable
const launch = eval('(function (e, now) {' + src.slice(ls, le) + '})');
let menuOpen = false, toggled = 0, opened = 0, takes = true;
global.JiTA.menu = { isOpen: () => menuOpen };
global.JiTA.trend = { openView: () => { opened++; } };
U.toggleTrend = () => { toggled++; return takes; };
const hash = { key: '#' };
function tap(t) { launch(hash, t); }
function clear() { lastHash = 0; toggled = 0; opened = 0; menuOpen = false; takes = true; els = {}; }

clear();
tap(1000);
ok('one # does nothing', toggled === 0 && opened === 0);
tap(1300);
ok('a double # switches the panel', toggled === 1 && opened === 0, toggled + ' ' + opened);
clear();
tap(1000); tap(1500);
ok('two slow taps do nothing', toggled === 0 && opened === 0);
clear(); takes = false;
tap(1000); tap(1200);
ok('where the panel has no view, the list opens', toggled === 1 && opened === 1, toggled + ' ' + opened);
clear(); menuOpen = true;
tap(1000); tap(1200);
ok('under an open overlay the list opens without touching the hidden panel', toggled === 0 && opened === 1, toggled + ' ' + opened);
clear(); els['q:#jita-menu.jita-trend-view'] = {};
tap(1000); tap(1200);
ok('with the list already open it does nothing', toggled === 0 && opened === 0);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'trending hotkey checks passed.'));
process.exit(fail ? 1 : 0);
