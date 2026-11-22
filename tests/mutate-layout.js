// mutate-layout.js - breaks what keeps each view in line, in turn, and requires layout-check (a real headless Chromium) to
// go red: the Members tab's note columns (the v3.49.1 fix) and month numbers, the Quality control columns, the cards'
// footers and grid, Settings' and the Lead duties window's fixed size and steady tabs, the Settings window's width, and the Player actions entry and
// list in the igbr.zip viewer. Every breakage starts a browser,
// so there are only a few.
//
// The check runs on the unbroken script first: a breakage proves nothing in a browser that fails anyway. Only a FAIL line
// counts as red here, not a crash: no breakage below can crash the check, so a crash is the browser, and it is reported.
// With no browser to run them in, the anchors are still checked and it says SKIP; CI sets JITA_LAYOUT_REQUIRED=1, so the
// check fails there instead, and so does this.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const LC = 'layout-check.js';
const muts = [
    [LC, 'the note columns are sized by their notes again (v3.49.0)', "'.jita-leadduty-view .ld-mnote { flex: 1 1 0;", "'.jita-leadduty-view .ld-mnote { flex: 1 1 auto;"],
    [LC, 'the month numbers are not right-aligned', '.ld-mnum { flex: 0 0 46px; text-align: right;', '.ld-mnum { flex: 0 0 46px; text-align: left;'],
    [LC, 'a checked row lets its action column collapse', '.ld-qc .ld-act { flex: 0 0 132px; justify-content: flex-end; }', '.ld-qc .ld-act { flex: 0 0 auto; justify-content: flex-end; }'],
    [LC, 'a row with no status has no status column', `var $stcol = $('<span class="ld-stcol"></span>').appendTo($row);\n        if (it.status) { $('<span class="ld-st"></span>').text(it.status).appendTo($stcol); }`,
        `if (it.status) { $('<span class="ld-stcol"></span>').append($('<span class="ld-st"></span>').text(it.status)).appendTo($row); }`],
    [LC, 'a card\'s footer follows its summary instead of the bottom of the card', '.jita-foot { display: flex; align-items: center; gap: 7px; margin-top: auto;',
        '.jita-foot { display: flex; align-items: center; gap: 7px;'],
    [LC, 'the sidebar grid needs 280 px for a column', 'grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));', 'grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));'],
    [LC, 'Settings is as high as its open tab', '#jita-menu.jita-settings-view { width: 460px; max-width: 94vw; height: 620px;', '#jita-menu.jita-settings-view { width: 460px; max-width: 94vw;'],
    [LC, 'the open tab in bold pushes the others along', '#jita-menu .jita-menu-tab::after { content: attr(data-label); display: block; height: 0; overflow: hidden; visibility: hidden; font-weight: 700; }', ''],
    // ---- the Lead duties window, the same on every tab (v3.53.9) ----
    [LC, 'the Lead duties window is as high as its open tab', '#jita-menu.jita-leadduty-view { width: 1180px; max-width: 96vw; height: 82vh; max-height: 82vh;', '#jita-menu.jita-leadduty-view { width: 1180px; max-width: 96vw; max-height: 82vh;'],
    [LC, 'the open Lead duties tab in bold pushes the others along', "'.jita-leadduty-view .ld-tab::after { content: attr(data-label); display: block; height: 0; overflow: hidden; visibility: hidden; font-weight: 700; }'", "''"],
    [LC, 'a count on a Lead duties tab keeps the bold width of the label before it', ".text(text).attr('data-label', text);", '.text(text);'],
    [LC, 'the Applications list grows the tab instead of filling it', "var $b = U._body().empty().addClass('ld-fill');", 'var $b = U._body().empty();'],
    [LC, 'the Applications fill stays on the next tab', "        U._body().removeClass('ld-fill');", '        U._body();'],
    // ---- the Settings window of a settings.yaml: one width on every tab (v3.54.1) ----
    [LC, 'the Settings window is as wide as its widest line again', '#jita-setv { display: flex; flex-direction: column; box-sizing: border-box; width: 950px;',
        '#jita-setv { display: flex; flex-direction: column; box-sizing: border-box;'],
    [LC, 'the Settings window runs past the right edge of a small screen', "            el.style.maxWidth = Math.max(480, window.innerWidth - r.left - 12) + 'px';\n", ''],
    // ---- Player actions in the igbr.zip viewer (v3.55.0) ----
    [LC, 'the Player actions entry keeps its download button', "if (!b.querySelector('[data-item-title]') && b.parentNode) { b.parentNode.removeChild(b); }", "if (!b.querySelector('[data-item-title]') && b.parentNode) { /* kept */ }"],
    [LC, 'the Player actions entry goes in again on every look', '        if (own) {\n            if (own.nextElementSibling !== logs) { list.insertBefore(own, logs); }\n            return;\n        }\n', ''],
    [LC, 'the Player actions list covers the viewer\'s top bar', "        el.style.top = A.TOP + 'px';\n", "        el.style.top = '0px';\n"],
    [LC, 'what the pane showed shows through the Player actions list', '.jita-acts-open > :not(#jita-acts) { visibility: hidden !important; }\n', ''],
    [LC, 'a click on a file of the archive leaves the Player actions list open', "if ((b.querySelector('[data-item-title]') && b.closest('[data-testid=\"archive-sidebar-folder-wrapper\"]')) || b.closest('#media-viewer-navigation')) {",
        "if (b.closest('#media-viewer-navigation')) {"]
];
// The check's output on a copy: { out, fails, passed, skip }. Only a check that ran to its end says passed or FAILURE.
function check(text) {
    fs.writeFileSync('mutly.js', text);
    let out = '';
    try { out = execSync('node ' + LC, { env: Object.assign({}, process.env, { JITA_SRC: 'mutly.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 240000 }); }
    catch (e) { out = e.stdout || ''; }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    return { out: out, fails: fails, passed: /^layout checks passed\.$/m.test(out), ran: /FAILURE|passed/.test(out), skip: (/^  SKIP  (.*)$/m.exec(out) || [])[1] };
}
let allRed = true;
const anchored = muts.filter(([h, name, a]) => {
    if (src.split(a).length === 2) { return true; }
    console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name);
    allRed = false;
    return false;
});
const control = check(src);
if (control.skip) {
    if (fs.existsSync('mutly.js')) { fs.unlinkSync('mutly.js'); }
    console.log('SKIP  ' + control.skip + ': no breakage made' + (allRed ? ' (every anchor is there)' : ''));
    process.exit(allRed ? 0 : 1);
}
if (!control.passed || control.fails.length) {
    console.log('CONTROL layout-check is not green on the unbroken script, so no breakage would prove anything:\n' + control.out);
    allRed = false;
} else {
    anchored.forEach(([h, name, a, b]) => {
        const r = check(src.replace(a, () => b));
        const red = r.fails.length > 0;
        if (!red) { allRed = false; }
        console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + r.fails.length + (r.ran ? '' : ', crashed') + ')' +
            (r.fails[0] ? '  e.g.' + r.fails[0].replace(/^  FAIL /, '').slice(0, 90) : (r.ran ? '' : '  ' + r.out.trim().split('\n').pop())));
    });
}
if (fs.existsSync('mutly.js')) { fs.unlinkSync('mutly.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
