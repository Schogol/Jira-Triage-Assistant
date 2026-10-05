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
    [H, 'the canned responses land under Features', "        pane('responses').append($respEd.length ? $respEd : JiTA.responses.buildEditor());", "        pane('features').append($respEd.length ? $respEd : JiTA.responses.buildEditor());"],
    [H, 'a non-Lead gets the Lead duties', '        if (JiTA.leadduty.isLead()) {\n            var $ld', '        if (true) {\n            var $ld'],
    [H, 'a tab is named by its id', ".text(JiTA.menu.TABS[id]).appendTo($tabs);", '.text(id).appendTo($tabs);'],
    [H, 'the tabs are in the order their sections are built', "triage: 'Triage Assistant', responses: 'Canned responses'", "responses: 'Canned responses', triage: 'Triage Assistant'"],
    [H, 'every area gets a tab, with a section there or not', "            if (panes[id]) { $('<button", "            { $('<button"],
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
    [H, 'pressing the mouse on a tab focuses it', "        $tabs.on('mousedown', '.jita-menu-tab', function (e) { e.preventDefault(); });\n", ''],
    // the canned responses editor
    [H, 'a redraw builds a new editor, losing what is typed', "        pane('responses').append($respEd.length ? $respEd : JiTA.responses.buildEditor());", "        pane('responses').append(JiTA.responses.buildEditor());"],
    [H, 'the editor is emptied with the menu, losing its handlers', "        var $respEd = $p.find('.jita-resp-editor').detach();", "        var $respEd = $p.find('.jita-resp-editor');"],
    [H, 'the editor builds into the menu itself', "        var $ed = $('<div class=\"jita-resp-editor\"></div>');", "        var $ed = $('#jita-menu');"],
    [H, 'the editor hands nothing over', '        return $ed;\n    },', '    },'],
    [H, 'Save closes Settings', "                JiTA.ui.toast('Saved ' + list.length + ' canned response' + (list.length === 1 ? '' : 's') + '.');\n",
        "                JiTA.ui.toast('Saved ' + list.length + ' canned response' + (list.length === 1 ? '' : 's') + '.');\n                JiTA.menu.close();\n"],
    // looks
    [H, 'a tab repeats its name as a heading', '#jita-menu .jita-menu-pane > .jita-menu-sect:first-child > h3:first-child { display: none; }\\\n', ''],
    [H, 'Settings grows and shrinks with its tab', 'max-width: 94vw; height: 620px; max-height: 82vh;', 'max-width: 94vw; max-height: 82vh;'],
    [H, 'Settings keeps its old width', 'width: 460px; max-width: 94vw; height: 620px;', 'width: 420px; max-width: 94vw; height: 620px;'],
    [H, 'the title and tab bar are squeezed by a long tab', '#jita-menu .jita-menu-top { flex: 0 0 auto;', '#jita-menu .jita-menu-top {'],
    [H, 'a long tab runs out of the bottom instead of scrolling', '#jita-menu .jita-menu-pane { flex: 1 1 auto; min-height: 0; overflow-y: auto; }\\\n', ''],
    [H, 'the editor\'s footer scrolls away with its list', '#jita-menu .jita-menu-pane[data-tab="responses"] { display: flex; flex-direction: column; overflow: hidden; }\\\n', ''],
    [H, 'a focused tab is ringed', '#jita-menu .jita-menu-tab:focus { outline: none !important; box-shadow: none !important; }\\\n', ''],
    [H, 'a tab reached by the keyboard is not marked', '#jita-menu .jita-menu-tab:focus-visible { color: #e6e6e6; background: #343c44; border-radius: 4px 4px 0 0; }\\\n', ''],
    [H, 'the open tab turning bold pushes the others along', '#jita-menu .jita-menu-tab::after { content: attr(data-label); display: block; height: 0; overflow: hidden; visibility: hidden; font-weight: 700; }\\\n', ''],
    [H, 'the tabs carry no name for the bold-width reserve', ".attr('data-label', JiTA.menu.TABS[id])", '']
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
