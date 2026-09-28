// Eval the real JiTA.ui._positionTip out of the file and drive it against the actual geometries. The bug
// this pins: on a row nearly as wide as the viewport (the Lead-duties and duplicate-finder overlays are
// 1180px), the card fits on NEITHER side, and clamping it into view dropped it on the right-hand end of
// that same row - on top of the action buttons the reader was reaching for.
const fs = require('fs');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('    _positionTip: function ($tip, anchor) {');
const e = src.indexOf('\n    },', s) + '\n    },'.length;
if (s < 0 || e < 6) { throw new Error('could not slice _positionTip'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const VW = 1512, VH = 900, TIPW = 420, TIPH = 300;
global.window = { innerWidth: VW, innerHeight: VH };

// Minimal $ stub: the function only reads offsetWidth/Height and writes left/top/visibility.
function place(rect, tipH) {
    let css = {};
    const el = { offsetWidth: TIPW, offsetHeight: tipH || TIPH };
    const $tip = { 0: el, css(o) { Object.assign(css, o); return $tip; } };
    const anchor = { getBoundingClientRect: () => rect };
    global.JiTA = { ui: {} };
    eval('global.JiTA.ui = {' + src.slice(s, e) + '};');
    global.JiTA.ui._positionTip($tip, anchor);
    return { left: parseInt(css.left, 10), top: parseInt(css.top, 10), h: el.offsetHeight };
}
const overlaps = (p, rect, h) =>
    p.left < rect.right && p.left + TIPW > rect.left && p.top < rect.bottom && p.top + (h || TIPH) > rect.top;

// ---- the reported case: a Lead-duties QC row (1180px overlay, centred, rows inset 16px) ----
const LD = { left: 182, right: 1330, top: 300, bottom: 328 };
const ld = place(LD);
ok('a wide row\'s card does not cover the row itself', !overlaps(ld, LD), JSON.stringify(ld));
ok('...specifically not the action buttons at its right end',
    !(ld.left < LD.right && ld.left + TIPW > LD.right - 132 && ld.top < LD.bottom && ld.top + TIPH > LD.top),
    JSON.stringify(ld));
ok('it sits flush under the row, left-aligned', ld.top === LD.bottom && ld.left === LD.left, JSON.stringify(ld));
ok('and stays on screen', ld.left >= 6 && ld.left + TIPW <= VW - 6 && ld.top >= 6 && ld.top + TIPH <= VH - 6);

// A row near the bottom has no room below -> flip above, still flush so the pointer can reach the card.
const LOW = { left: 182, right: 1330, top: 700, bottom: 728 };
const low = place(LOW);
ok('a row near the bottom flips the card above it', low.top + TIPH === LOW.top, JSON.stringify(low));
ok('and still clears the row', !overlaps(low, LOW), JSON.stringify(low));

// ---- the narrow panels must be untouched: the card still goes BESIDE the row ----
const PANEL = { left: 1150, right: 1490, top: 200, bottom: 240 };   // floating suggestions panel, right edge
const p = place(PANEL);
ok('a narrow panel keeps the card beside it, on the left', p.left + TIPW + 10 === PANEL.left, JSON.stringify(p));
ok('and level with the row', p.top === PANEL.top);

const LEFTPANEL = { left: 20, right: 360, top: 200, bottom: 240 };   // panel dragged to the left edge
const lp = place(LEFTPANEL);
ok('a panel at the left edge flips the card to its right', lp.left === LEFTPANEL.right + 10, JSON.stringify(lp));
ok('and never overlaps the row', !overlaps(lp, LEFTPANEL));

// ---- the triage match cards (a ~580px column in a full-screen sheet) still fit beside ----
const TRIAGE = { left: 780, right: 1360, top: 400, bottom: 460 };
const t = place(TRIAGE);
ok('a triage match row keeps the card beside it', !overlaps(t, TRIAGE), JSON.stringify(t));

// ---- a tall card on a wide row: it is clamped on screen, and the roomier side is chosen ----
const tall = place(LD, 700);
ok('a tall card picks the side with more room', tall.top >= 6 && tall.top + 700 <= VH - 6, JSON.stringify(tall));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'hover-card placement checks passed.'));
process.exit(fail ? 1 : 0);
