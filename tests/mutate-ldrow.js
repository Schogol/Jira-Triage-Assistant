// mutate-ldrow.js - breaks each guard of the in-place Lead-duties row redraw (v3.38.1) and requires ldrow-check to
// go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'ldrow-check.js';
const muts = [
    // ---- the reload path coming back ----
    [H, 'Checked reloads the QC list', "L.qc.localKey(ym), it.key, settle(true));\n            }).appendTo($act);\n            $('<button class=\"jita-btn ld-mini\" title=\"Raise",
        "L.qc.localKey(ym), it.key, function () { U._qc = null; U._loadQc(false); });\n            }).appendTo($act);\n            $('<button class=\"jita-btn ld-mini\" title=\"Raise"],
    [H, 'Mark reviewed reloads the wiki list', 'U._act(this, L.wiki.markReviewed(id, ym), L.wiki.localKey(ym), id, settle(true));',
        'U._act(this, L.wiki.markReviewed(id, ym), L.wiki.localKey(ym), id, function () { U._loadWiki(false); });'],
    [H, 'Resolve reloads the follow-ups', 'var v = U._adopt(r);\n                            if (!v) { U._loadFlags(false); return; }',
        'var v = null;\n                            if (!v) { U._loadFlags(false); return; }'],
    // ---- folding the write into the tab's state ----
    [H, 'a QC write is not folded into the state', '        if (res && v) {\n            var me =', '        if (false) {\n            var me ='],
    [H, 'a wiki write is not folded into the state', 'if (res && v) { res.ledgerValue = v; }', 'if (false) { res.ledgerValue = v; }'],
    [H, 'a QC mark is not kept locally', 'if (marked) { local[key] = new Date().toISOString(); } else { delete local[key]; }', 'if (!marked) { delete local[key]; }'],
    [H, 'a wiki Undo keeps the local mark', 'if (marked) { local[id] = new Date().toISOString(); } else { delete local[id]; }', 'if (marked) { local[id] = new Date().toISOString(); }'],
    [H, 'a QC Undo settles as a mark', "!!done.local, settle(false)); })", "!!done.local, settle(true)); })"],
    [H, 'an Undo never hands back the ledger', 'after(r.error ? null : r, note);', 'after(null, note);'],
    [H, 'a dry run is taken as the ledger', 'return (r && r.value && !r.dry) ? r.value : null;', 'return (r && r.value) ? r.value : null;'],
    // ---- drawing only the clicked row, only on its own tab ----
    [H, 'a QC mark draws into another tab', "if (!res || !U.isOpen() || U._tab !== 'qc') { return; }", 'if (!res || !U.isOpen()) { return; }'],
    [H, 'the first row is swapped, not the clicked one', "return this.getAttribute('data-key') === key;", 'return true;'],
    [H, 'a QC row carries no key', "\n            .attr('data-key', it.key);\n", ';\n'],
    [H, 'a wiki row carries no key', "'\"></div>').attr('data-key', id);", "'\"></div>');"],
    [H, 'the hover card of a swapped row stays up', "        try { JiTA.ui._hideTip(true); } catch (e) { /* ignore */ }\n        $old.replaceWith($fresh);", '        $old.replaceWith($fresh);'],
    // ---- the status line ----
    [H, 'the QC status drops the note', "        if (note) { bits.unshift(note); }\n        U._status(bits.join(' · '));\n        U._tabCount", "        U._status(bits.join(' · '));\n        U._tabCount"],
    [H, 'the wiki status drops the note', "        if (note) { bits.unshift(note); }\n        U._status(bits.join(' · '));\n    },\n\n    // A row action has landed: fold it into the tab's state and redraw that row alone. The marked flag says\n    // which way the local mirror went (a mark adds the page",
        "        U._status(bits.join(' · '));\n    },\n\n    // A row action has landed: fold it into the tab's state and redraw that row alone. The marked flag says\n    // which way the local mirror went (a mark adds the page"],
    [H, 'a failed write says nothing', "done(null, 'Saved locally only - ' + String(e && e.message || e) + ' It will be retried automatically.');", "done(null, '');"],
    [H, 'a refused Undo says nothing', "else { note = 'Could not undo - the ledger changed since this was marked, so it is shown as it stands now'; }", "else { note = ''; }"],
    // ---- the follow-ups redraw ----
    [H, 'Resolve loses the scroll position', '                            U._body().scrollTop(top);\n', ''],
    [H, 'Resolve leaves the QC tab offering Undo on a resolved flag', 'if (U._qc) { U._qc.ledgerValue = v; }', '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutl.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutl.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutl.js')) { fs.unlinkSync('mutl.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
