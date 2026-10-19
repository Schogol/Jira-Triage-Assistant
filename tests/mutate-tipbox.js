// mutate-tipbox.js - breaks each guard of the hover card beside a window (v3.44.1: the exception search keeps room on its
// left for the card, and the card goes there instead of over the list) in turn and requires the harness that owns it to go
// red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const T = 'tip-check.js', XF = 'excfind-check.js';
const muts = [
    [T, 'the window ignored', "side = box ? box.getBoundingClientRect() : rect;", "side = rect;"],
    [T, 'the row ignored beside a window', "var left = null, top = rect.top;\n        if (side.left - tipW - GAP >= M)", "var left = null, top = side.top;\n        if (side.left - tipW - GAP >= M)"],
    [T, 'beside the window on the left, measured from the row', "if (side.left - tipW - GAP >= M) { left = side.left - tipW - GAP; }", "if (side.left - tipW - GAP >= M) { left = rect.left - tipW - GAP; }"],
    [T, 'the window not passed on at first', "            JiTA.ui._positionTip($tip, anchor, box);\n            return;", "            JiTA.ui._positionTip($tip, anchor);\n            return;"],
    [T, 'the window not passed on once loaded', "            JiTA.ui._positionTip($live, anchor, box);", "            JiTA.ui._positionTip($live, anchor);"],
    [T, 'the window not passed on while loading', "        JiTA.ui._positionTip($tip, anchor, box);\n\n", "        JiTA.ui._positionTip($tip, anchor);\n\n"],
    [T, 'the card as wide beside a window', "$tip.toggleClass('jita-sd-tip-side', !!box);", "$tip.toggleClass('jita-sd-tip-side', false);"],
    [T, 'the card narrow everywhere', "$tip.toggleClass('jita-sd-tip-side', !!box);", "$tip.toggleClass('jita-sd-tip-side', true);"],
    [T, 'the room kept too small for the card', "margin-left: max(400px, calc((100vw - 1180px) / 2));", "margin-left: max(300px, calc((100vw - 1180px) / 2));"],
    [T, 'the window wider than the room left', "width: min(1180px, calc(100vw - 416px));", "width: min(1180px, calc(100vw - 32px));"],
    [T, 'the card wider than the room', "#jita-sd-tip.jita-sd-tip-side { width: 380px;", "#jita-sd-tip.jita-sd-tip-side { width: 420px;"],
    [T, 'the card\'s padding on top of its width', "#jita-sd-tip.jita-sd-tip-side { width: 380px; box-sizing: border-box;", "#jita-sd-tip.jita-sd-tip-side { width: 380px;"],
    [T, 'the card as short beside the window as over a list', "box-sizing: border-box; max-height: 88vh; }", "box-sizing: border-box; }"],
    [XF, 'the search passes no window', "this, rep.status, st.box); });", "this, rep.status); });"],
    [XF, 'the search keeps no window', "        st.box = ov.$menu[0];   // the hover card goes beside it\n", ''],
    [XF, 'the overlay keeps no room', "        ov.$overlay.addClass('jx-overlay');\n", '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
fs.unlinkSync('mutt.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
