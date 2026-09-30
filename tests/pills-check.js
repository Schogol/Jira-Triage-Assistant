// pills-check.js - pins the corner pills' layering: JITA_PILL_Z sits between Atlassian's page chrome and its
// popup layers, every pill uses it, and jitaPillsYield steps a pill aside while a floating menu / dialog covers it.
'use strict';
const fs = require('fs');
const SRC = process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js');
const src = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n); } }
function section(t) { console.log('\n' + t); }

// ---- stubs ----
const BODY = { tag: 'BODY', parentElement: null };
let byId = {}, layers = [], qsaCalls = 0, rafs = [];
function el(opts) {
    return Object.assign({
        style: {}, parentElement: BODY, pos: 'static', own: false,
        rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
        getBoundingClientRect() { return this.rect; },
        closest() { return this.own ? this : null; }
    }, opts);
}
function box(l, t, w, h) { return { left: l, top: t, right: l + w, bottom: t + h, width: w, height: h }; }
global.document = {
    body: BODY,
    getElementById: (id) => byId[id] || null,
    querySelectorAll: () => { qsaCalls++; return layers; }
};
global.window = {
    getComputedStyle: (n) => ({ position: n.pos || 'static' }),
    requestAnimationFrame: (fn) => { rafs.push(fn); return rafs.length; }
};

const a = src.indexOf('var JITA_PILL_Z = ');
const b = src.indexOf('// Throttle: a single issue-view re-render', a);
if (a < 0 || b < 0) { console.log('FAIL  pill block not found'); process.exit(1); }
(0, eval)(src.slice(a, b) + '\nglobal.JITA_PILL_Z = JITA_PILL_Z; global.jitaPillsYield = jitaPillsYield; global.jitaPillsYieldSoon = jitaPillsYieldSoon; global.jitaStackPills = jitaStackPills; global.JITA_PILL_IDS = JITA_PILL_IDS;');

function reset() { byId = {}; layers = []; qsaCalls = 0; rafs = []; }
function badge() { const p = el({ id: 'jita-credits-badge', rect: box(16, 860, 180, 26) }); byId['jita-credits-badge'] = p; return p; }

section('1. the layer');
ok(JITA_PILL_Z > 200, 'above Atlassian page chrome (navigation layer 200, the sidebar sits at 2)');
ok(JITA_PILL_Z < 300, 'below every Atlassian layer that opens over the page (dialog 300, popups 400, modal 510, flag 600)');
ok(!/z-index:9000;left:16px/.test(src) && !/z-index:2147483647/.test(src), 'no corner pill keeps its old z-index');
const uses = (src.match(/el\.style\.cssText = 'position:fixed;z-index:' \+ JITA_PILL_Z \+ ';/g) || []).length;
ok(uses === 4, 'all four pills (credits badge, lead-duties chip, what\'s new, credits progress) take JITA_PILL_Z  (found ' + uses + ')');

section('2. stepping aside');
reset(); jitaPillsYield();
ok(qsaCalls === 0, 'no pill on the page: no layer scan at all');

reset(); let p = badge();
layers = [el({ pos: 'absolute', rect: box(100, 500, 300, 400) })];
jitaPillsYield();
ok(p.style.visibility === 'hidden', 'a floating flyout overlapping the pill hides it');
layers = [];
jitaPillsYield();
ok(p.style.visibility === '', 'the flyout closes: the pill comes back');

reset(); p = badge();
layers = [el({ pos: 'fixed', rect: box(400, 100, 300, 300) })];
jitaPillsYield();
ok(p.style.visibility !== 'hidden', 'a menu elsewhere on the page leaves the pill alone');

reset(); p = badge();
layers = [el({ pos: 'static', rect: box(0, 0, 400, 1000) })];
jitaPillsYield();
ok(p.style.visibility !== 'hidden', 'a menu in the normal page flow (say, a nav list with role="menu") never hides a pill');

reset(); p = badge();
const deep = el({ pos: 'static', rect: box(0, 800, 400, 200) });
deep.parentElement = el({ pos: 'static', parentElement: el({ pos: 'absolute' }) });
layers = [deep];
jitaPillsYield();
ok(p.style.visibility === 'hidden', 'floating through a near ancestor counts (Atlaskit positions the wrapper, not the menu)');
const far = el({ pos: 'static', rect: box(0, 800, 400, 200) });
far.parentElement = el({ parentElement: el({ parentElement: el({ parentElement: el({ parentElement: el({ pos: 'fixed' }) }) }) }) });
layers = [far];
jitaPillsYield();
ok(p.style.visibility === '', 'a fixed ancestor further up (the whole sidebar, say) does not');

reset(); p = badge();
layers = [el({ pos: 'absolute', own: true, rect: box(0, 800, 400, 200) })];
jitaPillsYield();
ok(p.style.visibility !== 'hidden', 'our own popovers never hide our own pills');

reset(); p = badge();
layers = [el({ pos: 'absolute', rect: { left: 16, top: 860, right: 16, bottom: 860, width: 0, height: 0 } })];
jitaPillsYield();
ok(p.style.visibility !== 'hidden', 'a closed (zero-size) layer is ignored');

reset(); p = badge();
const chip = el({ id: 'jita-leadduty-chip', rect: box(16, 820, 330, 26) });
byId['jita-leadduty-chip'] = chip;
layers = [el({ pos: 'absolute', rect: box(260, 600, 300, 235) })];   // reaches the wide chip, not the badge
jitaPillsYield();
ok(chip.style.visibility === 'hidden' && p.style.visibility !== 'hidden', 'each pill is judged on its own box');

section('3. at most one check a frame');
reset(); badge();
jitaPillsYieldSoon(); jitaPillsYieldSoon(); jitaPillsYieldSoon();
ok(rafs.length === 1, 'a burst of mutations schedules one check');
rafs.shift()();
jitaPillsYieldSoon();
ok(rafs.length === 1, 'the next frame can schedule again');

section('3. stacking');
// The bottom-left pills stack from the corner up, each only while it is on the page (v3.38.0).
function pill(id, h) { const q = el({ id: id, offsetHeight: h }); byId[id] = q; return q; }
const at = (...ps) => ps.map((q) => q.style.bottom).join(', ');
reset();
let sc = pill('jita-credits-badge', 26), sl = pill('jita-leadduty-chip', 26), sn = pill('jita-changelog-pill', 26);
jitaStackPills();
ok(at(sc, sl, sn) === '16px, 56px, 96px', 'all three stack from the corner up: credits, lead duties, what\'s new  (' + at(sc, sl, sn) + ')');
reset(); sl = pill('jita-leadduty-chip', 26); sn = pill('jita-changelog-pill', 26);
jitaStackPills();
ok(at(sl, sn) === '16px, 56px', 'with credits off nothing hovers over an empty slot  (' + at(sl, sn) + ')');
reset(); sc = pill('jita-credits-badge', 26); sn = pill('jita-changelog-pill', 26);
jitaStackPills();
ok(at(sc, sn) === '16px, 56px', 'without the Lead-duties chip the what\'s new pill sits right above credits  (' + at(sc, sn) + ')');
reset(); sc = pill('jita-credits-badge', 40); sl = pill('jita-leadduty-chip', 26);
jitaStackPills();
ok(sl.style.bottom === '70px', 'a taller pill pushes the next one up by its own height  (' + sl.style.bottom + ')');
reset(); jitaStackPills();
ok(Object.keys(byId).length === 0, 'no pills on the page: nothing to stack, and no error');
ok(JITA_PILL_IDS.indexOf('jita-changelog-pill') >= 0, 'the what\'s new pill steps aside under an open menu like the others');

console.log('\n' + (fail ? 'RED' : 'GREEN') + '  pills-check  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
