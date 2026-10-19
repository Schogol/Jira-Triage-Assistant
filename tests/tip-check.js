// Eval the real JiTA.ui._positionTip out of the file and drive it against the actual geometries. The bug
// this pins: on a row nearly as wide as the viewport (the Lead-duties and duplicate-finder overlays are
// 1180px), the card fits on NEITHER side, and clamping it into view dropped it on the right-hand end of
// that same row - on top of the action buttons the reader was reaching for.
const fs = require('fs');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('    _positionTip: function ($tip, anchor, box) {');
const e = src.indexOf('\n    },', s) + '\n    },'.length;
if (s < 0 || e < 6) { throw new Error('could not slice _positionTip'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const VW = 1512, VH = 900, TIPW = 420, TIPH = 300;
global.window = { innerWidth: VW, innerHeight: VH };

// Minimal $ stub: the function only reads offsetWidth/Height and writes left/top/visibility.
function place(rect, tipH, box, tipW) {
    let css = {};
    const el = { offsetWidth: tipW || TIPW, offsetHeight: tipH || TIPH };
    const $tip = { 0: el, css(o) { Object.assign(css, o); return $tip; } };
    const anchor = { getBoundingClientRect: () => rect };
    global.JiTA = { ui: {} };
    eval('global.JiTA.ui = {' + src.slice(s, e) + '};');
    global.JiTA.ui._positionTip($tip, anchor, box ? { getBoundingClientRect: () => box } : undefined);
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

// ---- beside a window (the exception search): outside it, on its left, level with the row ----
// Under a row, a long description grew up over the row itself and stood in the way of the next one.
const SIDE_RULE = /#jita-sd-tip\.jita-sd-tip-side \{ width: (\d+)px;([^}]*)\}/.exec(src), SIDE = +SIDE_RULE[1];
// The card is otherwise content-box: its 10px/12px padding and 1px border came on top, 406px in a 400px room, and it
// fell back under the row (seen in the browser at 1280 and 1920 wide).
ok('the narrow card\'s width takes in its padding and border', /box-sizing: border-box;/.test(SIDE_RULE[2]), SIDE_RULE[0]);
ok('...and beside the window it may be as tall as the window', /max-height: 88vh;/.test(SIDE_RULE[2]) && /height: 88vh; max-height: 88vh;/.test(src), SIDE_RULE[0]);
const GUT = +/'#jita-menu\.jita-excfind-view \{[^']*margin-left: max\((\d+)px,/.exec(src)[1];
const KEEP = +/'#jita-menu\.jita-excfind-view \{[^']*width: min\(1180px, calc\(100vw - (\d+)px\)\)/.exec(src)[1];
ok('the room the exception search keeps on its left takes the card beside it, and the rest of the screen the window',
    GUT >= SIDE + 10 + 6 && KEEP === GUT + 16, SIDE + ' / ' + GUT + ' / ' + KEEP);
const WIN = { left: GUT, right: VW - 16, top: 54, bottom: 846 }, ROW = { left: GUT + 16, right: VW - 32, top: 300, bottom: 340 };
const bw = place(ROW, 0, WIN, SIDE);
ok('beside a window, the card is outside it, on its left, level with the row', bw.left + SIDE + 10 === WIN.left && bw.top === ROW.top && bw.left >= 6, JSON.stringify(bw));
const low2 = place({ left: ROW.left, right: ROW.right, top: 820, bottom: 840 }, 0, WIN, SIDE);
ok('...a row low in the window: the card moved up to stay on screen, still beside the window', low2.left + SIDE + 10 === WIN.left && low2.top + TIPH <= VH - 6, JSON.stringify(low2));
const full = place(ROW, 0, { left: 20, right: VW - 20, top: 54, bottom: 846 }, SIDE);
ok('...no room beside the window: under the row, as for any wide row', full.top === ROW.bottom && full.left === ROW.left, JSON.stringify(full));
const wide = { left: 690, right: 1870, top: 54, bottom: 846 };
global.window.innerWidth = 2560;
const ww = place({ left: 706, right: 1854, top: 300, bottom: 330 }, 0, wide, SIDE);
global.window.innerWidth = VW;
ok('...on a wide screen too', ww.left + SIDE + 10 === wide.left && ww.top === 300, JSON.stringify(ww));

// ---- the late description: a row that has left the page is not measured ----
// A Lead-duties row action swaps its row for a freshly drawn one (v3.38.1). When the pointer stays over it, the
// new row's hover opens the card again for the same key while the old row's request for Jira's rendered
// description may still be out. That answer passes the key check, and placing the card against the old,
// detached row - which measures as 0,0 - flung it into the top-left corner.
const ss = src.indexOf('    _showTip: function (r, anchor, meta, box) {');
const END = String.fromCharCode(10) + '    },';
const se = src.indexOf(END, ss) + END.length;
if (ss < 0 || se < 6) { throw new Error('could not slice _showTip'); }
function fake() {
    const n = { length: 1, 0: {}, side: null };
    ['on', 'empty', 'addClass', 'removeClass', 'html', 'css', 'text', 'appendTo', 'find'].forEach((m) => { n[m] = () => n; });
    n.toggleClass = (c, on) => { if (c === 'jita-sd-tip-side') { n.side = on; } return n; };
    return n;
}
let lastTip = null;
async function late(detach, box, cache) {
    const tip = fake(), placed = [];
    lastTip = tip;
    let land = () => {};
    global.document = { body: {} };
    global.$ = (x) => (x === '#jita-sd-tip' ? tip : fake());
    global.JiTA = { ui: {} };
    eval('global.JiTA.ui = {' + src.slice(ss, se) + '};');
    Object.assign(global.JiTA.ui, {
        injectCss() {}, _watchMedia() {}, _killMedia() {}, _renderedCache: cache || {},
        _getRendered: () => new Promise((res) => { land = res; }),
        _positionTip: (t, a, b) => { placed.push(b === undefined ? a : [a, b]); }
    });
    const row = { isConnected: true };
    global.JiTA.ui._showTip({ key: 'EBR-9', summary: 'one', description: 'the stored text' }, row, 'Closed', box);
    if (detach) { row.isConnected = false; }
    land('<p>rendered</p>');
    await new Promise((r) => setTimeout(r, 0));
    return placed;
}
(async () => {
    const still = await late(false);
    ok('a description landing for a row still on the page places the card again', still.length === 2, String(still.length));
    const gone = await late(true);
    ok('...but not against a row that has left the page', gone.length === 1, String(gone.length));
    ok('without a window, the card is its usual width', lastTip.side === false);
    const win = { id: 'win' }, inWin = await late(false, win);
    ok('with one, the window goes along to every placing, both of them', inWin.length === 2 && inWin.every((x) => Array.isArray(x) && x[1] === win), JSON.stringify(inWin));
    ok('...and the card is the narrower one', lastTip.side === true);
    const cached = await late(false, win, { 'EBR-9': '<p>cached</p>' });
    ok('...a description already fetched is placed once, beside the window too', cached.length === 1 && Array.isArray(cached[0]) && cached[0][1] === win, JSON.stringify(cached));
    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'hover-card placement checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
