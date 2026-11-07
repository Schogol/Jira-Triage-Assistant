// frames-check.js - the script in a frame inside another page (v3.48.0): a database or macro a Confluence article
// embeds, or the Zendesk Forge panel. The page itself boots and shows the pills; a frame boots nothing and shows nothing,
// so the Lead duties pill no longer appears a second time inside a database cell while an article is edited. Evals the
// real JITA_IS_SUBFRAME against stand-in windows, and checks that both boots and everything that floats over a page read
// it.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const at = src.indexOf('var JITA_IS_SUBFRAME = ');
if (at < 0) { throw new Error('could not find JITA_IS_SUBFRAME'); }
const def = src.slice(at, src.indexOf('})();', at) + 5);
const flag = (forge, win) => new Function('JITA_IS_FORGE_FRAME', 'window', def + '\nreturn JITA_IS_SUBFRAME;')(forge, win);
const me = {};
ok('the page itself is no frame', flag(false, { self: me, top: me }) === false);
ok('a frame inside another page is one: a database an article embeds, a macro', flag(false, { self: me, top: {} }) === true);
ok('...the Zendesk Forge panel is one, whatever it says', flag(true, { self: me, top: me }) === true);
ok('...and so is a frame that cannot even look at itself', flag(false, { get self() { throw new Error('blocked'); }, top: {} }) === true);

// both boots, and everything that floats over a page
const near = (anchor, re, span) => { const i = src.indexOf(anchor); return i >= 0 && re.test(src.slice(i, i + (span || 600))); };
ok('the Confluence boot runs in the page, not in a frame it embeds', /\nif \(JITA_IS_WIKI && !JITA_IS_SUBFRAME\) \{/.test(src));
ok('...nor does the Jira boot', near('// ---- Jira boot:', /if \(JITA_NO_JIRA_UI \|\| JITA_IS_SUBFRAME\) \{ return; \}/));
ok('the ISD credits pill is never mounted in a frame', near('    badge: {\n        mount: function () {', /if \(!flagOn\('credits'\) \|\| JITA_NO_JIRA_UI \|\| JITA_IS_SUBFRAME\) \{ return; \}/));
ok('...nor the Lead duties window, its pill or its daily reminder', near('JiTA.leadduty.ui = {', /open: function \(tab\) \{\n[^\n]*\n\s+if \(JITA_IS_SUBFRAME \|\| !L\.isLead\(\)\) \{ return; \}/, 200000) &&
    near('JiTA.leadduty.reminder = {', /shouldShow: function \(\) \{\n[^\n]*\n\s+if \(JITA_IS_SUBFRAME \|\| !L\.isLead\(\)\) \{ return false; \}/, 3000) &&
    near('JiTA.leadduty.reminder = {', /if \(R\._nagged \|\| JITA_IS_SUBFRAME \|\| !L\.isLead\(\)\) \{ return; \}/, 8000));
ok('...nor the What\'s new pill', /shouldShow: function \(\) \{ return !JITA_IS_SUBFRAME && JiTA\.changelog\.unseenFeatures\(\)\.length > 0; \}/.test(src));
ok('...nor Triage mode, the duplicate finder, or the shared worker', /if \(JITA_IS_SUBFRAME \|\| T\._open\) \{ return; \}/.test(src) &&
    /var D = JiTA\.dupfind;\n\s+if \(JITA_IS_SUBFRAME\) \{ return; \}/.test(src) && /if \(JiTA\.worker\._started \|\| JITA_IS_SUBFRAME\) \{ return; \}/.test(src));
ok('the canned-response dropdown still looks in every frame: it is the one thing the Zendesk panel runs',
    near('/* ---- canned responses: inject the dropdown', /\(function \(\) \{\n\s+if \(JITA_IS_WIKI\) \{ return; \}/));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'frame checks passed.'));
process.exit(fail ? 1 : 0);
