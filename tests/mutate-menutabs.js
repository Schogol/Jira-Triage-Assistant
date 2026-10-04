// mutate-menutabs.js - breaks Settings' tabs (v3.42.0) and requires menutabs-check to go red. A crashed harness, or one
// that never reaches its last line, counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'menutabs-check.js';
const muts = [
    // what goes where
    [H, 'the Triage Assistant\'s settings land under Features', "            pane('triage').append($ta);", "            pane('features').append($ta);"],
    [H, 'Lead duties land under About', "            pane('lead').append($ld);", "            pane('about').append($ld);"],
    [H, 'the debug settings land under Features', "        pane('about').append($dbg);", "        pane('features').append($dbg);"],
    [H, 'the canned responses land under About', "        pane('features').append($resp);", "        pane('about').append($resp);"],
    [H, 'a tab is named by its id', ".text(JiTA.menu.TABS[id]).appendTo($tabs);", '.text(id).appendTo($tabs);'],
    [H, 'the title stays outside the top bar', '        $top.append($head);', '        $p.append($head);'],
    // showing a tab
    [H, 'every pane shows at once', "panes[i].style.display = (panes[i].getAttribute('data-tab') === id) ? '' : 'none';", "panes[i].style.display = '';"],
    [H, 'the open tab is not marked', "            tabs[i].classList.toggle('on', on);\n", ''],
    [H, 'the open tab is not told to a screen reader', "            tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');\n", ''],
    [H, 'a tab that is not there shows nothing', "        if (!has && panes.length) { id = panes[0].getAttribute('data-tab'); }\n", ''],
    [H, 'a tab that is not there is forgotten', "        if (!has && panes.length) { id = panes[0].getAttribute('data-tab'); }", "        if (!has && panes.length) { id = panes[0].getAttribute('data-tab'); JiTA.menu._tab = id; }"],
    [H, 'a redraw shows no tab', '        JiTA.menu._showTab($p[0], JiTA.menu._tab);\n    },', '    },'],
    // switching
    [H, 'a click is not remembered', "            JiTA.menu._tab = this.getAttribute('data-tab');\n            JiTA.menu._showTab($p[0], JiTA.menu._tab);", "            JiTA.menu._showTab($p[0], this.getAttribute('data-tab'));"],
    [H, 'a new tab opens scrolled down', '            $p[0].scrollTop = 0;\n', ''],
    // looks
    [H, 'a tab repeats its name as a heading', '#jita-menu .jita-menu-pane > .jita-menu-sect:first-child > h3:first-child { display: none; }\\\n', ''],
    [H, 'the tab bar scrolls away', '#jita-menu .jita-menu-top { position: sticky; top: 0; z-index: 2; background: #282d33; border-radius: 8px 8px 0 0; }\\\n', ''],
    [H, 'Settings keeps its old width', '#jita-menu.jita-settings-view { width: 420px; }\\\n', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutmt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutmt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out) || !/settings tab checks passed/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutmt.js')) { fs.unlinkSync('mutmt.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
