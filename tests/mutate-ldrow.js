// mutate-ldrow.js - breaks each guard of the in-place Lead-duties row redraw (v3.38.1) and requires its harness to
// go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'ldrow-check.js', T = 'tip-check.js';
const muts = [
    // ---- the reload path coming back ----
    [H, 'Checked reloads the QC list', "L.qc.markChecked(it.key, 'ok', ym, null, it), L.qc.localKey(ym), it.key, settle);",
        "L.qc.markChecked(it.key, 'ok', ym, null, it), L.qc.localKey(ym), it.key, function () { U._qc = null; U._loadQc(false); });"],
    [H, 'Mark reviewed reloads the wiki list', 'U._act(this, L.wiki.markReviewed(id, ym), L.wiki.localKey(ym), id, settle);',
        'U._act(this, L.wiki.markReviewed(id, ym), L.wiki.localKey(ym), id, function () { U._loadWiki(false); });'],
    [H, 'Resolve reloads the follow-ups', 'var v = U._adopt(U._qc, r);', 'var v = null;'],
    // ---- folding the write into the tab's state ----
    [H, 'a QC write is not folded into the state', 'if (v) { res.ledgerValue = v; }', 'if (false) { res.ledgerValue = v; }'],
    [H, 'a wiki write is not folded into the state', 'if (res && v) { res.ledgerValue = v; }', 'if (false) { res.ledgerValue = v; }'],
    [H, 'a QC verdict the ledger dropped stays', 'if (d && d.by === me) { res.done[key] = d; } else { delete res.done[key]; }', 'if (d && d.by === me) { res.done[key] = d; }'],
    [H, 'a QC mark is not kept locally', 'if (marked === true) { local[key] = new Date().toISOString(); } else if (marked === false) { delete local[key]; }',
        'if (marked === false) { delete local[key]; }'],
    [H, 'a QC mark left alone clears this tab\'s copy', 'else if (marked === false) { delete local[key]; }', 'else { delete local[key]; }'],
    [H, 'a wiki Undo keeps the local mark', 'if (marked === true) { local[id] = new Date().toISOString(); } else if (marked === false) { delete local[id]; }',
        'if (marked === true) { local[id] = new Date().toISOString(); }'],
    [H, 'a wiki mark left alone clears this tab\'s copy', 'else if (marked === false) { delete local[id]; }', 'else { delete local[id]; }'],
    [H, 'a dry run is taken as the ledger', 'if (!r || !r.value || r.dry) { return null; }', 'if (!r || !r.value) { return null; }'],
    [H, 'an older answer overwrites a newer ledger', 'if (res && ver && res.ledgerVersion && ver < res.ledgerVersion) { return null; }', ''],
    [H, 'the version taken is never remembered', 'if (res && ver) { res.ledgerVersion = ver; }', ''],
    // ---- the Undo tail ----
    [H, 'every Undo clears the mirror', 'var gone = !!(local || (r.written && !r.dry));', 'var gone = true;'],
    [H, 'a local-only Undo keeps the mirror', 'var gone = !!(local || (r.written && !r.dry));', 'var gone = !!(r.written && !r.dry);'],
    [H, 'an Undo settles as a mark', 'after(r.error ? null : r, note, gone ? false : null);', 'after(r.error ? null : r, note, gone ? true : null);'],
    [H, 'an Undo always says the mirror went', 'after(r.error ? null : r, note, gone ? false : null);', 'after(r.error ? null : r, note, false);'],
    [H, 'an Undo never hands back the ledger', 'after(r.error ? null : r, note, gone ? false : null);', 'after(null, note, gone ? false : null);'],
    [H, 'a local-only Undo is reported as failed', 'if (local) { note = okMsg; }', 'if (false) { note = okMsg; }'],
    [H, 'a refused Undo says nothing', "else { note = 'Could not undo - the ledger changed since this was marked, so it is shown as it stands now'; }", "else { note = ''; }"],
    [H, 'an unreachable Undo says nothing', "else if (r.error) { note = 'Could not undo on Confluence - ' + String(r.error && r.error.message || r.error); }", "else if (r.error) { note = ''; }"],
    [H, 'a dry-run Undo says DRY RUN twice', "else if (r.dry) { note = ''; }", "else if (r.dry) { note = 'DRY RUN - not written to Confluence'; }"],
    [H, 'an Undo does not repaint the chip', 'after(r.error ? null : r, note, gone ? false : null);\n                try { L.reminder.mount(); } catch (e2) { /* ignore */ }',
        'after(r.error ? null : r, note, gone ? false : null);'],
    // ---- the write itself ----
    [H, 'only the clicked button is disabled', "var $btns = $(btn).closest('.ld-act').find('button');", 'var $btns = $(btn);'],
    [H, 'a mark does not repaint the chip', 'function done(r, note, marked) { after(r, note, marked); try { L.reminder.mount(); } catch (e2) { /* ignore */ } }',
        'function done(r, note, marked) { after(r, note, marked); }'],
    [H, 'a dry run is put in the mirror', "if (r && r.dry) { done(r, '', true); return null; }", ''],
    [H, 'a dry run says DRY RUN twice', "if (r && r.dry) { done(r, '', true); return null; }", "if (r && r.dry) { done(r, 'DRY RUN - not written to Confluence', true); return null; }"],
    [H, 'a failed write says nothing', "done(null, 'Saved locally only - ' + why + ' It will be retried automatically.', true);", "done(null, '', true);"],
    [H, 'a write kept in the mirror settles as left alone', "' It will be retried automatically.', true);", "' It will be retried automatically.', null);"],
    [H, 'a failed Flag or Skip is queued', 'if (queue === false) {', 'if (false) {'],
    [H, 'a failed Flag or Skip settles as marked', "' Try again once Confluence answers.', null);", "' Try again once Confluence answers.', true);"],
    [H, 'a Flag is queued', '}, false);   // replays as a plain Checked: never queued', '});'],
    [H, 'a Skip is queued', 'settle, false);   // replays as a review: never queued', 'settle);'],
    [H, 'a Flag forgets the reason typed before', "U._drafts[it.key] || '')", "'')"],
    [H, 'a Flag does not keep its reason', 'U._drafts[it.key] = note;', ''],
    [H, 'a saved Flag keeps its draft', 'if (r) { delete U._drafts[it.key]; }', ''],
    // ---- drawing only the clicked row, only on its own tab ----
    [H, 'a QC mark draws into another tab', "if (!res || !U.isOpen() || U._tab !== 'qc') { return; }", 'if (!res || !U.isOpen()) { return; }'],
    [H, 'a wiki mark draws into another tab', "if (!res || !U.isOpen() || U._tab !== 'wiki') { return; }", 'if (!res || !U.isOpen()) { return; }'],
    [H, 'the Follow-ups count waits for the QC tab', 'if (U.isOpen() && v) { U._tabCount(v); }', ''],
    [H, 'the first row is swapped, not the clicked one', "return this.getAttribute('data-key') === key;", 'return true;'],
    [H, 'a missing row counts as swapped', 'if (!$old.length) { return false; }', 'if (!$old.length) { return true; }'],
    [H, 'a QC settle paints over a rebuild', 'if (!it || !U._swapRow(key, U._qcRow(it, U._qcCtx()))) { return; }', 'if (!it) { return; } U._swapRow(key, U._qcRow(it, U._qcCtx()));'],
    [H, 'a wiki settle paints over a rebuild', 'if (!U._swapRow(id, U._wikiRow(id, U._wikiCtx()))) { return; }', 'U._swapRow(id, U._wikiRow(id, U._wikiCtx()));'],
    [H, 'a QC row carries no key', "\n            .attr('data-key', it.key);\n", ';\n'],
    [H, 'a wiki row carries no key', "'\"></div>').attr('data-key', id);", "'\"></div>');"],
    [H, 'a swapped row leaves its hover card up', 'try { if (JiTA.ui._tipKey === key) { JiTA.ui._hideTip(true); } } catch (e) { /* ignore */ }', ''],
    [H, 'a swap closes any hover card', 'if (JiTA.ui._tipKey === key) { JiTA.ui._hideTip(true); }', 'JiTA.ui._hideTip(true);'],
    [T, 'a late description measures a detached row', 'if (anchor && anchor.isConnected === false) { return; }', ''],
    // ---- the status line ----
    [H, 'the QC status drops the note', "        if (note) { bits.unshift(note); }\n        U._status(bits.join(' · '));\n        U._tabCount", "        U._status(bits.join(' · '));\n        U._tabCount"],
    [H, 'the wiki status drops the note', "        if (note) { bits.unshift(note); }\n        U._status(bits.join(' · '));\n    },\n\n    // A row action has landed",
        "        U._status(bits.join(' · '));\n    },\n\n    // A row action has landed"],
    // ---- loads that land on another tab ----
    [H, 'a late wiki load paints into another tab', "if (U._tab === 'wiki') { U._renderWiki(); }", 'U._renderWiki();'],
    [H, 'a late QC load paints into another tab', "if (U._tab === 'qc') { U._renderQc(); }", 'U._renderQc();'],
    [H, 'a late Follow-ups load paints into another tab', "if (U._tab !== 'flags') { U._tabCount(cur.value); return; }", ''],
    [H, 'a late Follow-ups load drops the count', "if (U._tab !== 'flags') { U._tabCount(cur.value); return; }", "if (U._tab !== 'flags') { return; }"],
    [H, 'a failed wiki load paints into another tab', "if (!U.isOpen() || U._tab !== 'wiki') { return; }", 'if (!U.isOpen()) { return; }'],
    [H, 'a failed QC load paints into another tab', "if (!U.isOpen() || U._tab !== 'qc') { return; }", 'if (!U.isOpen()) { return; }'],
    [H, 'a failed Follow-ups load paints into another tab', "if (!U.isOpen() || U._tab !== 'flags') { return; }", 'if (!U.isOpen()) { return; }'],
    // ---- the follow-ups redraw ----
    [H, 'Resolve loses the scroll position', 'U._renderFlags(v);\n                            U._body().scrollTop(top);', 'U._renderFlags(v);'],
    [H, 'Resolve leaves the QC tab offering Undo on a resolved flag', 'if (v && U._qc) { U._qc.ledgerValue = v; }', ''],
    [H, 'a Resolve on another tab leaves the count stale', 'if (v) { U._tabCount(v); }', ''],
    [H, 'a dry-run Resolve reloads into another tab', "if (U._tab !== 'flags') { return; }\n                            if (!v) { U._loadFlags(false); return; }",
        "if (!v) { U._loadFlags(false); return; }\n                            if (U._tab !== 'flags') { return; }"]
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
