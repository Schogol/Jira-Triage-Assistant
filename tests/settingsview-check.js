// settingsview-check.js - settings.yaml drawn as the in-game Settings window (JiTA.settingsview, v3.54.0). Evals the real
// module against the real window layout (settings-window.json) and a made-up settings.yaml (settings-fixture.yaml) with
// every shape the client writes:
//  - the YAML reader: tagged keys, a list at its key's own indent, complex (tuple) keys, anchors and aliases, flow lists
//    over several lines, folded and escaped strings, sets, objects, integers too long for a number; it names the line of
//    text it cannot read
//  - what a control shows: the file's value or the default, the current display mode's window size / adapter / V-Sync /
//    UI scale, a default that follows another setting, a key the control starts from, the graphics defaults that depend
//    on the card, what the game greys out or hides, and what counts as changed from default (never the stored times)
//  - Shortcuts (a default given to another command is lost; None clears one), Reset Settings' suppressed warnings, and
//    Everything else, which leaves out what the player typed
//  - the HTML: escaped, no prefs.ini or server-side controls, Show raw and Copy; the layout file is consistent; the
//    @resource line asks for this version; the log parser hands settings.yaml over
// The page side (tabs, the filter, the search, Show raw, Copy) runs in a real browser in layout-check.js.
const fs = require('fs'), path = require('path');
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const TABLE_TEXT = fs.readFileSync(path.join(__dirname, '..', 'settings-window.json'), 'utf8');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'settings-fixture.yaml'), 'utf8').replace(/\r\n/g, '\n');
let resource = TABLE_TEXT;
global.GM_getResourceText = (name) => (name === 'settingswindow' ? resource : null);
global.SELECTORS = { CODE_BLOCK: "[data-testid='code-block']" };
global.JiTA = { log: () => {}, util: {} };
eval(S.top(src, 'JiTA.settingsview'));
const SV = JiTA.settingsview;
const T = SV.table();
const C = (s, key) => SV._idx[s + '|' + key];
const shows = (doc, s, key) => { const c = C(s, key), r = SV.read(doc, c); return { c: c, r: r, text: SV.show(c, r.v), chg: SV.differs(c, r) }; };
// A parse for one check: a throw comes back as { __error } and fails that check, not the whole harness.
const SP = (text) => { try { return SV.parse(text); } catch (e) { return { __error: e.message }; } };
const throwsAt = (text, line) => { try { SV.parse(text); return false; } catch (e) { return new RegExp('\\(line ' + line + '\\)').test(e.message); } };

// ---- the YAML reader ----
let doc = null;
try { doc = SV.parse(FIXTURE); } catch (e) { ok('the fixture reads at all', false, e.message); }
if (!doc) { console.log('\n1 FAILURE(S)'); process.exit(1); }
ok('the file reads into its three sections', ['char', 'user', 'public'].every((k) => doc[k] && typeof doc[k] === 'object') && Object.keys(doc).length === 3, Object.keys(doc).join());
ok('a tagged key is its text (!!python/unicode \'device\')', !!doc.public.device && !!doc.public.audio, Object.keys(doc.public).join());
ok('a value is its [time, value] pair, the time kept as digits (longer than a number holds)', JSON.stringify(doc.public.device.shaderQuality) === '["134394223713362255",1]', JSON.stringify(doc.public.device.shaderQuality));
ok('a list at its key\'s own indent belongs to the key', Array.isArray(doc.public.device.FullScreenSettings) && doc.public.device.FullScreenSettings[1].width === 2560 && doc.public.device.FixedWindowSettings[1].width === 3840,
    JSON.stringify(doc.public.device.FullScreenSettings));
ok('a flow list running over two lines', doc.public.device.UIScaleFullscreenSetAutomatically[1] === false, JSON.stringify(doc.public.device.UIScaleFullscreenSetAutomatically));
ok('a complex (tuple) key, "? key" / ": value"', JSON.stringify(doc.user.overview['(overviewScroll2, 2)']) === '["DISTANCE",true]', Object.keys(doc.user.overview).join(' | '));
ok('...its list at the map\'s own indent, beside a plain key (an empty tuple as Python writes it)', doc.user.overview.tupleKeys[1].shortcuts === true && doc.user.overview.tupleKeys[1]['(Engineering, ())'] === false,
    JSON.stringify(doc.user.overview.tupleKeys));
ok('a list in a list ("- - ICON")', JSON.stringify(doc.user.overview.columns[1]) === '["ICON","DISTANCE","NAME"]', JSON.stringify(doc.user.overview.columns));
ok('...and maps in a list in a list ("- - bold: 1"), as the ship labels are written', JSON.stringify(SP('a:\n- - bold: 1\n    size: 12\n  - bold: 0\n- 7\n').a) === '[[{"bold":1,"size":12},{"bold":0}],7]',
    JSON.stringify(SP('a:\n- - bold: 1\n    size: 12\n  - bold: 0\n- 7\n').a));
ok('an alias is what its anchor holds', JSON.stringify(doc.char.windows.zOtherWindow[1]) === '[10,20,300,400]' && doc.char.windows.zOtherWindow[1] === doc.char.windows.windowSizesAndPositions_1[1],
    JSON.stringify(doc.char.windows.zOtherWindow));
ok('a single-quoted string folded over two lines', doc.user.ui.longText[1] === 'a long string that the client folded over two lines', JSON.stringify(doc.user.ui.longText[1]));
ok('...and its doubled quote', doc.user.ui.quoteIn[1] === 'it\'s here', JSON.stringify(doc.user.ui.quoteIn[1]));
ok('a double-quoted string\'s escapes, and its escaped line break joining the lines', doc.user.ui.escaped[1] === 'Ayuda en Espa\u00f1ol \u2713 joined', JSON.stringify(doc.user.ui.escaped[1]));
ok('a set is the list of its members', JSON.stringify(doc.user.ui.tagSet[1]) === '["3446","3447"]', JSON.stringify(doc.user.ui.tagSet[1]));
ok('an object is its map', doc.user.ui.kv[1].charID === 2121935319 && doc.user.ui.kv[1].name === 'x', JSON.stringify(doc.user.ui.kv[1]));
ok('a long integer too long for a number stays its digits', doc.user.ui.bigNumber[1] === '1234567890123456789', JSON.stringify(doc.user.ui.bigNumber[1]));
ok('an empty map, and a complex key with an empty key', JSON.stringify(doc.char.autoreload) === '{}' && JSON.stringify(doc.user.ui.editHistory[1]) === '{"":["typed secret"]}',
    JSON.stringify(doc.user.ui.editHistory));
ok('a key named __proto__ is just a key', SP('a:\n  __proto__: 1\n').a.__proto__ === 1 && ({}).polluted === undefined);
ok('Windows line ends read the same', JSON.stringify(SP(FIXTURE.replace(/\n/g, '\r\n'))) === JSON.stringify(doc));
ok('scalars: null, ~, booleans, floats, exponents, ints, quoted numbers stay text',
    JSON.stringify(SP('a: null\nb: ~\nc: true\nd: False\ne: 0.5\nf: 1.0e-05\ng: -12\nh: \'12\'\ni: plain text\n')) === '{"a":null,"b":null,"c":true,"d":false,"e":0.5,"f":0.00001,"g":-12,"h":"12","i":"plain text"}',
    JSON.stringify(SP('a: null\nb: ~\nc: true\nd: False\ne: 0.5\nf: 1.0e-05\ng: -12\nh: \'12\'\ni: plain text\n')));
ok('a \\U escape past the BMP becomes its surrogate pair', SP('a: "\\U0001F600"\n').a === '\ud83d\ude00', JSON.stringify(SP('a: "\\U0001F600"\n').a));
ok('text it cannot read names its line: a [ that never closes', throwsAt('a: 1\nb: [1, 2\n', 3));
ok('...and text indented deeper than its map', throwsAt('a:\n    b: 1\n  c: 2\n', 3));
ok('an empty file is an empty document', JSON.stringify(SP('')) === '{}');

// ---- what a control shows ----
let x = shows(doc, 'public.device', 'shaderQuality');
ok('a combo shows its option\'s label (Shader Quality 1 = Low)', x.text === 'Low' && x.r.set, x.text);
ok('...a graphics default that depends on the card: Low is the low-end default, so not changed', !x.chg && x.c.dc && x.c.dc.low === 1, JSON.stringify(x.c.dc));
x = shows(doc, 'public.device', 'textureQuality');
ok('Texture Quality runs backwards (2 = Low) and differs from its default (High)', x.text === 'Low' && x.chg, x.text + ' ' + x.chg);
x = shows(doc, 'public.device', 'shadowQuality');
ok('a setting the file does not hold shows its default, not marked changed', !x.r.set && !x.chg && x.r.v === x.c.d, JSON.stringify(x.r));
const off = (s, key) => { const c = C(s, key); return !!(c.when && c.when.then === 'off' && SV.cond(doc, c.when)); };
const hidden = (s, key) => { const c = C(s, key); return !!(c.when && c.when.then === 'hide' && SV.cond(doc, c.when)); };
ok('Shadows, AO and Reflections grey out as Disabled at Low shader quality', ['shadowQuality', 'aoQuality', 'reflectionQuality'].every((k) => off('public.device', k) && C('public.device', k).when.text === 'Disabled'));
ok('Anti-Aliasing greys out under a temporal upscaler (DLSS)', off('public.device', 'antiAliasing'));
ok('Upscaling Setting shows N/A only while upscaling is off', !off('public.device', 'upscalingSetting') && SV.cond(SP('public:\n  device:\n    upscalingTechnique: [134394219908649071, 0]\n'), C('public.device', 'upscalingSetting').when) &&
    C('public.device', 'upscalingSetting').when.text === 'N/A');
ok('...and with no upscaling in the file at all (its default is off)', SV.cond(SP('public: {}\n'), C('public.device', 'upscalingSetting').when));
ok('Frame Generation is hidden without upscaling, shown with it', !hidden('public.device', 'frameGeneration') && SV.cond(SP('a: 1\n'), C('public.device', 'frameGeneration').when));
ok('the advanced audio sliders grey out until their switch is on', off('user.audio', 'soundLevel_custom_turrets') && off('user.audio', 'soundLevel_custom_atmosphere'));
ok('window blur greys out at Low shader quality, not at Medium', off('char.ui', 'enableWindowBlur') &&
    !SV.cond(SP(FIXTURE.replace("'shaderQuality': !!python/tuple [134394223713362255, 1]", "'shaderQuality': !!python/tuple [134394223713362255, 2]")), C('char.ui', 'enableWindowBlur').when));
ok('the colour-blind hues are hidden while colour-blind mode is off', SV.cond(doc, T.tabs.find((t) => t.id === 'generic').sections.find((s) => s.c.some((c) => c.k === 'hues')).c.find((c) => c.k === 'hues').when));
const res = T.tabs[0].sections[0].c.find((c) => c.k === 'res'), ad = T.tabs[0].sections[0].c.find((c) => c.k === 'adapter'), vs = T.tabs[0].sections[0].c.find((c) => c.f && c.f[0] === 'presentInterval');
const ui = T.tabs[0].sections[0].c.find((c) => c.k === 'uiscale');
ok('the window size is the current mode\'s (fullscreen: 2560x1440, not the fixed window\'s 3840x2160)', SV.show(res, SV.read(doc, res).v) === '2560x1440', SV.show(res, SV.read(doc, res).v));
ok('...and follows the mode (fixed window: 3840x2160)', SV.show(res, SV.read(SP(FIXTURE.replace("'WindowMode': !!python/tuple [134394052202721043, 0]", "'WindowMode': !!python/tuple [134394052202721043, 2]")), res).v) === '3840x2160');
ok('the adapter and V-Sync are the current mode\'s too (Adapter 2, Off, which differs from On)', SV.show(ad, SV.read(doc, ad).v) === 'Adapter 2' && SV.show(vs, SV.read(doc, vs).v) === 'Off' && SV.differs(vs, SV.read(doc, vs)));
ok('UI scale: its fixed value (110%) when not automatic, changed from Auto', SV.show(ui, SV.read(doc, ui).v) === '110%' && SV.differs(ui, SV.read(doc, ui)), SV.show(ui, SV.read(doc, ui).v));
ok('...Auto when the automatic switch is on, whatever value is stored', SV.show(ui, SV.read(SP(FIXTURE.replace(/\n      false\]/, '\n      true]')), ui).v) === 'Auto');
x = shows(doc, 'public.audio', 'overrideWithOldJukebox');
ok('a checkbox that starts from the engine\'s key while its own is unset (old jukebox: on)', x.r.set && SV.truthy(x.r.v) && x.chg, JSON.stringify(x.r));
x = shows(doc, 'user.ui', 'chat_font_size_default');
ok('a default that follows another setting: chat font 14 is the default for client font Large, so not changed', x.r.d === 14 && !x.chg, JSON.stringify(x.r));
ok('...and 14 is changed for client font Medium', SV.differs(x.c, SV.read(SP(FIXTURE.replace("'clientFontSize': !!python/tuple [134394223836868352, 3]", "'clientFontSize': !!python/tuple [134394223836868352, 2]")), x.c)));
x = shows(doc, 'public.audio', 'audioEnabled');
ok('Audio Enabled defaults to on, so the file\'s off is changed', x.c.d === 1 && x.chg && x.text === 'Off', JSON.stringify(x.r));
x = shows(doc, 'user.ui', 'cameraShakeEnabled');
ok('a checkbox stored as 1 against a default of 1 is not changed', !x.chg && x.text === 'On');
ok('a checkbox stored as False against a default of true is changed (text shadow)', shows(doc, 'char.ui', 'global_font_shadow_enabled').chg);
ok('a slider value that differs (brightness 1.25 against 1.0)', shows(doc, 'public.device', 'brightness').chg);
const withVal = (s, key, v) => SP('public:\n  device:\n    ' + key + ': [134394223713362255, ' + v + ']\n');
const ao = C('public.device', 'aoQuality'), aoTip = SV.defaultText(ao, SV.read(doc, ao));
ok('a default by graphics card names each class EVE rates cards in, and a Mac\'s own', /rated high \(or not on its list\)/.test(aoTip) && /rated medium/.test(aoTip) && /rated low/.test(aoTip) &&
    /On a Mac with a card rated high: /.test(aoTip) && !/macOS|high-end/.test(aoTip), aoTip);
ok('...the Mac\'s default is one of them (AO 1 not changed), the common fallback no class uses is not (AO 2 changed)',
    !SV.differs(ao, SV.read(withVal('public.device', 'aoQuality', 1), ao)) && SV.differs(ao, SV.read(withVal('public.device', 'aoQuality', 2), ao)));
const dof = C('public.device', 'dofEnabled');
ok('...and a checkbox\'s Mac default reads On / Off (Depth Of Field)', / Off\.$/.test(SV.defaultText(dof, SV.read(doc, dof))) && dof.dc.mac === false, SV.defaultText(dof, SV.read(doc, dof)));
x = shows(doc, 'public.ui', 'clientFontSize');
ok('a default by client language: Large is the default on a Chinese, Japanese or Korean client, so not changed', x.text === 'Large' && !x.chg, JSON.stringify(x.r));
ok('...said in its hover', SV.defaultText(x.c, x.r) === 'Default: Medium (Large on a Chinese, Japanese or Korean client).', SV.defaultText(x.c, x.r));
ok('...and Small differs from both', SV.differs(x.c, SV.read(SP('public:\n  ui:\n    clientFontSize: [134394223836868352, 1]\n'), x.c)));
x = C('user.ui', 'chat_font_size_default');
ok('the chat font\'s default for a client font of Huge, which this build moves to Large: 14', SV.read(SP('public:\n  ui:\n    clientFontSize: [134394223836868352, 5]\n'), x).d === 14, JSON.stringify(SV.read(SP('public:\n  ui:\n    clientFontSize: [134394223836868352, 5]\n'), x)));
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
ok('the escapes for a line and a paragraph separator read as those characters', SP('a: "x\\Ly\\Pz"\n').a === 'x' + LS + 'y' + PS + 'z', JSON.stringify(SP('a: "x\\Ly\\Pz"\n').a));
ok('...though the script holds neither character itself (editors take them for line breaks)', src.indexOf(LS) < 0 && src.indexOf(PS) < 0);
ok('a float with a rounding tail is the same value', SV.same(0.30000000000000004, 0.3) && !SV.same(0.31, 0.3) && SV.same(true, 1) && SV.same(false, 0) && SV.same(null, undefined));
ok('the colour theme shows the file\'s preset (Caldari), changed from Photon', shows(doc, 'char.windows', 'wndColorThemeID').chg);
ok('a value no option holds shows the game\'s "nothing selected" text', SV.show(C('public.device', 'reflectionQuality'), 0) === 'Disabled');
ok('a default that is not known is never marked changed', !SV.differs({ k: 'combo' }, { v: 3, set: true, d: undefined }));
ok('no stored time is ever shown: a control reads only the value half', SV.read(doc, C('public.device', 'shaderQuality')).v === 1);

// ---- Shortcuts, Reset Settings, Everything else ----
const cmds = SV.commands(doc), cmd = (n) => cmds.find((r) => r.name === n);
ok('a command the player bound shows their keys (Broadcast: Need Armor = A)', SV.keysText(cmd('CmdFleetBroadcast_HealArmor').keys) === 'A' && cmd('CmdFleetBroadcast_HealArmor').changed);
ok('...a mouse button by its name (Broadcast Radial Menu = MOUSE3)', SV.keysText(cmd('CmdOpenBroadcastRadialMenu').keys) === 'MOUSE3');
ok('None clears a default (Align to: A taken away)', cmd('CmdAlignToItem').keys === null && cmd('CmdAlignToItem').changed && SV.keysText(cmd('CmdAlignToItem').keys) === T.shortcuts.none);
ok('...a default nobody else took too (Track: C cleared)', cmd('CmdToggleCameraTracking').keys === null && cmd('CmdToggleCameraTracking').own && cmd('CmdToggleCameraTracking').changed);
ok('a default the player gave to another command is lost, as the game drops it', (() => {
    const d2 = SP('user:\n  cmd:\n    customCmds: !!python/tuple\n    - 134394199694836691\n    - CmdFleetBroadcast_HealArmor: !!python/tuple [65]\n');
    const r = SV.commands(d2).find((c) => c.name === 'CmdAlignToItem');
    return r.keys === null && r.changed && !r.own;
})());
ok('an untouched command keeps its default, not marked (Character Sheet = ALT-A)', SV.keysText(cmd('OpenCharactersheet').keys) === 'ALT-A' && !cmd('OpenCharactersheet').changed);
ok('keys have one fixed set of names: modifiers first, joined by -', SV.keysText([17, 18, 87]) === 'CTRL-ALT-W' && SV.keysText([16, 8]) === 'SHIFT-BACKSPACE');
ok('an old (ctrl, alt, shift, "KEY") binding reads too', SV.keysText(SV.keysOf([1, 0, 1, 'f'])) === 'CTRL-SHIFT-F');
ok('commands are listed by name, as the game sorts them', cmds.every((r, i) => !i || cmds[i - 1].label.toLowerCase() <= r.label.toLowerCase()));
ok('every command belongs to one of the sub-tabs', cmds.every((r) => T.tabs.find((t) => t.k === 'shortcuts').sub.some((s) => s.id === r.cat)));
const sup = SV.suppressed(doc);
ok('Reset Settings: a switched-off warning by its title, with the answer it gives (Confirm quit game: Yes)', sup.some((r) => r.title === 'Confirm quit game' && r.answer === 'Yes'), JSON.stringify(sup));
ok('...a choice dialog\'s answer with its choice (OK (option 2))', sup.some((r) => r.key === 'suppress.AgtShare' && r.answer === 'OK (option 2)'), JSON.stringify(sup));
ok('...a message with no title by its key', sup.some((r) => r.title === 'SomethingUnknownXyz' && r.answer === 'No'));
const none = sup.find((r) => r.key === 'suppress.MultiplePilotTraining') || {};
ok('...one stored as None is not switched off: it shows again', none.answer === 'Shows again' && none.off === false && sup.filter((r) => r.off).length === sup.length - 1, JSON.stringify(none));
const supHtml = SV._suppress('Reset', sup), noneRow = (/<div class="jsv-row[^"]*"[^>]*><span class="jsv-l">MultiplePilotTraining<\/span>/.exec(supHtml) || [''])[0];
ok('...drawn dimmed, not marked as changed, its hover saying why', /jsv-again/.test(noneRow) && !/jsv-chg/.test(noneRow) && /shows this warning again/.test(noneRow), noneRow);
const resetTab = (/data-tab="resetsettings">.{0,160}/.exec(SV.view(FIXTURE)) || [''])[0];
ok('...and left out of the tab' + "'" + 's count', /<span class="jsv-cnt"[^>]*>3</.test(resetTab), resetTab);
ok('...by title', sup.map((r) => r.title.toLowerCase()).join('|') === sup.map((r) => r.title.toLowerCase()).sort().join('|'));
const rest = SV.rest(doc), restIds = rest.map((g) => g.id), restKeys = [].concat.apply([], rest.map((g) => g.rows.map((r) => g.id + '|' + r[0])));
ok('Everything else holds what the window does not show (char.ui someCharSetting, the tuple-keyed overview)', restKeys.indexOf('char.ui|someCharSetting') >= 0 && restKeys.indexOf('user.overview|(overviewScroll2, 2)') >= 0, restKeys.join(' '));
ok('...and nothing the window shows (shader quality, turrets, the shortcuts, the suppressed warnings)', restKeys.indexOf('public.device|shaderQuality') < 0 && restKeys.indexOf('user.ui|turretsEnabled') < 0 &&
    restKeys.indexOf('user.cmd|customCmds') < 0 && restIds.indexOf('user.suppress') < 0 && restKeys.indexOf('public.device|FullScreenSettings') < 0 && restKeys.indexOf('public.device|UIScaleFullscreenSetAutomatically') < 0 &&
    restKeys.indexOf('public.audio|useOldJukeboxOverride') < 0, restKeys.join(' '));
ok('...nor what the player typed: the notepad, the calculator, edit-box history', restIds.indexOf('char.notepad') < 0 && restKeys.indexOf('public.ui|CalculatorHistory') < 0 && restKeys.indexOf('user.ui|editHistory') < 0, restKeys.join(' '));

// ---- the HTML ----
const html = SV.view(FIXTURE);
ok('the window: every tab of the table on the left, then Everything else', T.tabs.every((t) => html.indexOf('data-tab="' + t.id + '"') >= 0) && html.indexOf('data-tab="rest"') > html.indexOf('data-tab="' + T.tabs[T.tabs.length - 1].id + '"'));
ok('...Shortcuts with its eight sub-tabs', T.tabs.find((t) => t.k === 'shortcuts').sub.every((s) => html.indexOf('data-tab="sc-' + s.id + '"') >= 0));
ok('...Reset Settings, listing the switched-off warnings', html.indexOf('Confirm quit game') >= 0 && html.indexOf('data-tab="resetsettings"') >= 0);
ok('...no prefs.ini or server-side setting (language, crash upload, emergency warp, duel invitations)', ['Upload crashes', 'Disable Emergency Warp', 'Auto Reject Invitations</span><span class="jsv-cb', 'English</span>'].every((t) => html.indexOf(t) < 0) &&
    !JSON.stringify(T).match(/"s":"(prefs\.ini|server_setting)"/));
ok('a control the game hides is not drawn (the colour-blind hues), one it shows is (Frame Generation with DLSS)', html.indexOf('class="jsv-hues"') < 0 && /data-q="frame generation off"/.test(html));
ok('a greyed-out control is drawn greyed, showing what the game shows (Shadow Quality: Disabled, not its default High)', /class="jsv-row jsv-vrow jsv-off[^"]*" data-q="shadow quality disabled"/.test(html) &&
    /class="jsv-row jsv-vrow jsv-off[^"]*" data-q="anti-aliasing disabled"/.test(html));
const marks = (html.match(/jsv-row [^"]*jsv-chg/g) || []).length;
ok('changed rows are marked, and the filter counts them', marks > 10 && /Only changed from default \(\d+\)/.test(html), marks + ' marked');
ok('a value from the file is escaped: no tag of the player\'s reaches the page', html.indexOf('<img') < 0 && SV.esc('<img src=x onerror=alert(1)> & "') === '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;');
ok('...nor does a hostile message key in Reset Settings', SV.view('user:\n  suppress:\n    suppress.<b>x</b>: [134393820644998315, 6]\n').indexOf('<b>x') < 0);
ok('the raw file is not in the page until Show raw asks for it, and Show raw / Copy are there', html.indexOf('secret note text') < 0 && html.indexOf('typed secret') < 0 && /jsv-rawbtn/.test(html) && /jsv-copy/.test(html) && /<pre class="jsv-raw"/.test(html));
ok('the stored times are nowhere in the window', html.indexOf('134394') < 0);
ok('a file it cannot read still gets Show raw and Copy, and says why', /could not be read: [^<]+ \(line \d+\)/.test(SV.view('a: [1\n')) && /jsv-rawbtn/.test(SV.view('a: [1\n')), SV.view('a: [1\n').slice(-400));
resource = null; SV._t = undefined;
const noLayout = (() => { try { return SV.view(FIXTURE); } catch (e) { return 'threw: ' + e.message; } })();
ok('no layout with the script: it says to reinstall, and still offers Show raw', /Reinstall JiTA/.test(noLayout) && /jsv-rawbtn/.test(noLayout), noLayout.slice(0, 160));
resource = TABLE_TEXT; SV._t = undefined; SV.table();
const smHead = '<div class="jsv-h">' + SV.esc(T.tabs.find((t) => t.id === 'generic').sections.find((s) => s.onlyIfSet).h) + '</div>';
ok('the SpaceMouse section shows only when the file holds one of its keys', html.indexOf(smHead) < 0 &&
    SV.view(FIXTURE.replace('  ui:\n    bigNumber', '  ui:\n    spaceMouseSpeed: [134394214740687666, 0.5]\n    bigNumber')).indexOf(smHead) >= 0, smHead);

// ---- the layout file ----
const KINDS = ['check', 'combo', 'slider', 'res', 'adapter', 'uiscale', 'theme', 'hues', 'card', 'text'];
const ctrls = [].concat.apply([], T.tabs.map((t) => [].concat.apply([], (t.sections || []).map((s) => s.c))));
ok('the layout: its version, tabs and shortcuts', T.v === 1 && T.tabs.length >= 8 && T.shortcuts.cmds.length > 200, T.v + ' ' + T.tabs.length);
ok('...every control of a known kind, with its store (section.group)', ctrls.every((c) => KINDS.indexOf(c.k) >= 0 && (c.k === 'text' || /^(char|user|public)\.\w+$/.test(c.s))), ctrls.filter((c) => KINDS.indexOf(c.k) < 0).map((c) => c.k).join());
ok('...every combo\'s options distinct and labelled', ctrls.filter((c) => c.o).every((c) => c.o.every((o) => typeof o[1] === 'string' && o[1]) && new Set(c.o.map((o) => JSON.stringify(o[0]))).size === c.o.length));
const optionless = (c) => !c.ns && !(c.k === 'uiscale' && c.d === 'auto' && c.auto) && !c.o.some((o) => SV.same(o[0], c.d));   // UI scale's Auto is an option of its own
ok('...every combo\'s known default one of its options (or its "nothing selected" text, or UI scale\'s Auto)', !ctrls.filter((c) => c.o && c.d !== undefined && !c.dc).some(optionless),
    ctrls.filter((c) => c.o && c.d !== undefined && !c.dc && optionless(c)).map((c) => c.key || c.mk[0]).join());
ok('...every rule reads a setting some control shows (so its default is known)', ctrls.filter((c) => c.when).every((c) => !!C(c.when.s, c.when.key)), ctrls.filter((c) => c.when && !C(c.when.s, c.when.key)).map((c) => c.when.key).join());
ok('...every command row: name, label, sub-tab, keys', T.shortcuts.cmds.every((r) => typeof r[0] === 'string' && typeof r[1] === 'string' && r[1] && typeof r[2] === 'string' && (r[3] === null || Array.isArray(r[3]))));
ok('...the key names for the modifiers and the mouse', ['17', '18', '16', '4', '5', '6'].every((k) => T.shortcuts.vk[k]) && T.shortcuts.vk['17'] === 'CTRL');
ok('...no em or en dash in it', !/[\u2013\u2014]/.test(TABLE_TEXT));
const dcs = ctrls.filter((c) => c.dc);
ok('...every default by graphics card a value for each class, and no other (no notes, no fallback no class uses)', dcs.length >= 8 && dcs.every((c) =>
    ['high', 'medium', 'low'].every((k) => k in c.dc) && Object.keys(c.dc).every((k) => ['high', 'medium', 'low', 'mac'].indexOf(k) >= 0 && typeof c.dc[k] !== 'string')),
    dcs.filter((c) => !['high', 'medium', 'low'].every((k) => k in c.dc) || Object.keys(c.dc).some((k) => typeof c.dc[k] === 'string' || ['high', 'medium', 'low', 'mac'].indexOf(k) < 0)).map((c) => c.key + ' ' + JSON.stringify(c.dc)).join('; '));

// ---- the script around it ----
const hv = (/^\/\/ @version\s+(\S+)\s*$/m.exec(src) || [])[1];
const resLine = /^\/\/ @resource\s+settingswindow\s+(\S+)\s*$/m.exec(src);
ok('Tampermonkey fetches settings-window.json from main with the script', !!resLine && /^https:\/\/raw\.githubusercontent\.com\/Schogol\/Jira-Triage-Assistant\/main\/settings-window\.json\?v=/.test(resLine[1]) && SV.RESOURCE === 'settingswindow',
    resLine && resLine[1]);
ok('...asking for this very version, so it never keeps an older copy', !!resLine && resLine[1].split('?v=')[1] === hv, (resLine && resLine[1]) + ' vs ' + hv);
const swap = S.member(src, 'JiTA.logparser', 'swap'), igbr = S.member(src, 'JiTA.logparser', 'IGBR');
ok('the log parser opens settings.yaml from the igbr.zip as the window', /'settings\.yaml': 'set'/.test(igbr) && /else if \(igbr === 'set' && flagOn\('parser'\)\) \{ JiTA\.settingsview\.mount\(\); \}/.test(swap), igbr);
const mount = S.member(src, 'JiTA.settingsview', 'mount');
ok('...reading the code-block\'s text, comments kept (layout-check reads a highlighted file), and leaving the raw text as it is should drawing fail',
    /JiTA\.logparser\.readBlock\(true\)/.test(mount) && /try \{ html = SV\.view\(text\); \} catch \(e\) \{[^}]*return; \}/.test(mount));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Settings view checks passed.'));
process.exit(fail ? 1 : 0);
