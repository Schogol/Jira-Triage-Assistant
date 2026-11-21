// mutate-census.js - breaks each guard of Who runs what (v3.53.1) in a copy of the script (mutcs.js) and requires
// census-check to go red: the entry, when it is written, the property it goes to, reading them all, the table, and where
// it starts. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'census-check.js';
const muts = [
    // ---- the entry ----
    [H, 'a Features switch is left out', "        { id: 'credits', label: 'ISD Credits', short: 'Credits' },\n", ''],
    [H, 'a switch goes by another name than in Settings', "{ id: 'detailView', label: 'Detail view', short: 'Detail' }", "{ id: 'detailView', label: 'Detail View', short: 'Detail' }"],
    [H, 'an option is read as a flag of its own', ", short: 'Filters', sub: function () { return JiTA.dv._takeOn(); } }", ", short: 'Filters' }"],
    [H, 'a switch that cannot be read stops the entry', 'try { f[x.id] = x.sub ? !!x.sub() : flagOn(x.id); } catch (e) { f[x.id] = null; }', 'f[x.id] = x.sub ? !!x.sub() : flagOn(x.id);'],
    [H, 'the entry carries a setting more', "return { jita: JiTA.SCRIPT_VERSION || '?', tm: C._manager(), browser: C._browser(ua), f: f };", "return { jita: JiTA.SCRIPT_VERSION || '?', tm: C._manager(), browser: C._browser(ua), f: f, debug: gmGet('sdDebug', false) };"],
    [H, 'Edge is taken for Chrome', "['Edge', /\\bEdg\\/(\\d+)/]", "['Edge', /\\bEdgX\\/(\\d+)/]"],
    [H, 'Chrome is taken for Safari', "['Chrome', /\\bChrome\\/(\\d+)/], ['Safari', /\\bVersion\\/(\\d+)[\\d.]* (?:Mobile\\/\\S+ )?Safari\\//]", "['Safari', /\\bSafari\\/(\\d+)/], ['Chrome', /\\bChrome\\/(\\d+)/]"],
    [H, 'a key keeps a character Confluence rewrites', ".toLowerCase().replace(/[^a-z0-9]/g, '_'); },", ".toLowerCase().replace(/:/g, '_'); },"],
    // ---- when it is written ----
    [H, 'written at every look', '        return s.sig !== sig || !s.at || now - s.at >= JiTA.census.DAY_MS;', '        return true;'],
    [H, 'a change waits for the day to pass', '        return s.sig !== sig || !s.at || now - s.at >= JiTA.census.DAY_MS;', '        return !s.at || now - s.at >= JiTA.census.DAY_MS;'],
    [H, 'never written again', '        return s.sig !== sig || !s.at || now - s.at >= JiTA.census.DAY_MS;', '        return !s.at;'],
    [H, 'a failed write is tried at every look', '        if (s.retry) { return now >= s.retry; }\n', ''],
    [H, 'a failed write is never tried again', 'gmSet(C.SENT_KEY, { retry: now + C.RETRY_MS });', 'gmSet(C.SENT_KEY, { retry: Infinity });'],
    [H, 'not claimed before it writes', '            gmSet(C.SENT_KEY, { sig: sig, at: now });   // claimed first, so this browser\'s other tabs leave it be\n', ''],
    [H, 'a frame writes too', 'if (JITA_IS_SUBFRAME || JITA_IS_FORGE_FRAME) { return Promise.resolve(false); }', 'if (JITA_IS_FORGE_FRAME) { return Promise.resolve(false); }'],
    [H, 'who is signed in is never asked', ': L.resolveMe()).then(function (m) {', ': Promise.resolve(null)).then(function (m) {'],
    [H, 'a failed write escapes', "                JiTA.log('[JiTA] census: could not write this browser\\'s entry to the JiTA page:', (e && e.message) || e);\n                return false;", '                throw e;'],
    // ---- the property ----
    [H, 'the user\'s other browsers are dropped', '                    if (k !== name && t && now - t < C.KEEP_DAYS * C.DAY_MS) { b[k] = old[k]; }\n', ''],
    [H, 'a silent browser is kept for ever', 'if (k !== name && t && now - t < C.KEEP_DAYS * C.DAY_MS) { b[k] = old[k]; }', 'if (k !== name) { b[k] = old[k]; }'],
    [H, 'a write that crossed another fails at once', '                if (again && JiTA.conf.isConflict(e)) { return put(false); }\n', ''],
    [H, 'a write that crossed another is tried again and again', 'if (again && JiTA.conf.isConflict(e)) { return put(false); }', 'if (again && JiTA.conf.isConflict(e)) { return put(true); }'],
    [H, 'the history names Lead duties', "id: m.accountId, b: b }, prop, 'JiTA census');", 'id: m.accountId, b: b }, prop);'],
    [H, 'saveProperty forgets the writer\'s name', "version: { number: prop.version + 1, message: message || 'JiTA lead duties' }", "version: { number: prop.version + 1, message: 'JiTA lead duties' }"],
    [H, 'another page', "    PAGE: '281119715',", "    PAGE: '3214901257',"],
    // ---- reading them all, and the table ----
    [H, 'only the first page of properties is read', '                return next ? page(JiTA.conf._relPath(next)) : null;', '                return null;'],
    [H, 'other properties are read as entries', "p && typeof p.key === 'string' && p.key.indexOf(C.PREFIX) === 0 && p.value", "p && typeof p.key === 'string' && p.value"],
    [H, 'the rows come as they were read', '        return rows.sort(function (a, b) { return cmp(bare(a), bare(b)) || cmp(a.browser, b.browser); });', '        return rows;'],
    [H, 'an ISD in front counts in the order', "var bare = function (r) { return r.name.replace(/^ISD\\s+/i, '').toLowerCase(); };", 'var bare = function (r) { return r.name.toLowerCase(); };'],
    [H, 'an older version is not marked', "toggleClass('jcs-behind', !!cur && JiTA.worker._verCmp(r.jita, cur) < 0)", "toggleClass('jcs-behind', false)"],
    [H, 'a newer version is marked', "toggleClass('jcs-behind', !!cur && JiTA.worker._verCmp(r.jita, cur) < 0)", "toggleClass('jcs-behind', !!cur && JiTA.worker._verCmp(r.jita, cur) !== 0)"],
    [H, 'a browser long unseen is not greyed', "toggleClass('jcs-old', days === null || days >= C.OLD_DAYS)", "toggleClass('jcs-old', days === null)"],
    [H, 'off reads as not known', "v === true ? '✓' : v === false ? '·' : '?'", "v === true ? '✓' : '?'"],
    [H, 'the last row counts every browser', 'var k = rows.filter(function (r) { return r.f[f.id] === true; }).length;', 'var k = rows.length;'],
    [H, 'a closed overlay is drawn into', 'if (JiTA.menu._live($s)) { C._paint($s, C.rows(values), Date.now()); }', 'C._paint($s, C.rows(values), Date.now());'],
    // ---- where it starts ----
    [H, 'a frame starts it', 'if (C._started || JITA_IS_SUBFRAME || JITA_IS_FORGE_FRAME) { return; }', 'if (C._started || JITA_IS_FORGE_FRAME) { return; }'],
    [H, 'a tab starts it twice', '        C._started = true;\n        setTimeout(C.tick, C.FIRST_MS);', '        setTimeout(C.tick, C.FIRST_MS);'],
    // ---- only the tab that leads the worker writes (2026-11-21) ----
    [H, 'every tab writes, old ones over new ones', '        if (!(JiTA.worker && JiTA.worker._isLeader)) { return Promise.resolve(false); }\n', ''],
    [H, 'a tab writes while it does not lead', 'if (!(JiTA.worker && JiTA.worker._isLeader)) { return Promise.resolve(false); }', 'if (!JiTA.worker) { return Promise.resolve(false); }'],
    [H, 'the Confluence boot starts it again', "        // No census here: this browser's entry for Who runs what is written by the Jira tab that leads the worker.\n",
        "        try { JiTA.census.start(); } catch (e) { JiTA.caught('census.start', e); }   // this browser's entry for Who runs what\n"],
    [H, 'the button is there for everyone', "        if (JiTA.leadduty.OWNER === ((JiTA.leadduty.me() && JiTA.leadduty.me().handle) || '')) {\n            $('<button class=\"jita-btn\">Who runs what</button>')",
        "        if (true) {\n            $('<button class=\"jita-btn\">Who runs what</button>')"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutcs.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutcs.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutcs.js')) { fs.unlinkSync('mutcs.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
