// mutate-wikiundo.js - breaks each guard of the wiki review Undo (v3.37.0) and requires wikiundo-check to go
// red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'wikiundo-check.js';
const muts = [
    // ---- the snapshot ----
    [H, 'a review records nothing', "v.done[ym][pageId] = { by: handle, at: nowIso, was: was };", "v.done[ym][pageId] = { by: handle, at: nowIso };"],
    [H, 'the snapshot misses the previous reading', "prev: v.prevReviewed[pageId] || '',", "prev: '',"],
    // ---- putting it back ----
    [H, 'the last review is not restored', "                    W._restore(v.lastReviewed, pageId, d.was.last);\n", ''],
    [H, 'the previous review is not restored', "                    W._restore(v.prevReviewed, pageId, d.was.prev);\n", ''],
    [H, 'the reviewer is not restored', "                    W._restore(v.reviewedBy, pageId, d.was.by);\n", ''],
    [H, 'an absent value comes back as an empty one', "_restore: function (map, id, val) { if (val) { map[id] = val; } else { delete map[id]; } },", "_restore: function (map, id, val) { map[id] = val; },"],
    [H, 'a skip rewrites the history', "                if (!d.skipped) {\n                    if (!W._stillLatest", "                if (true) {\n                    if (!W._stillLatest"],
    [H, 'an Undo never reaches the page', "                delete v.done[ym][pageId];\n                return v;\n            }).then(L.report.tap);", "                delete v.done[ym][pageId];\n                return v;\n            });"],
    // ---- what is left alone ----
    [H, "another Lead's review can be undone", "v.done[ym][pageId];\n                if (!d || d.by !== handle) { return null; }", "v.done[ym][pageId];\n                if (!d) { return null; }"],
    [H, 'the ledger is not re-checked before restoring', "                    if (!W._stillLatest(v, pageId, d, handle)) { return null; }\n", ''],
    [H, 'a review without a snapshot is guessed at', "return !!(d && d.was && v &&", "return !!(d && v &&"],
    [H, 'a review someone built on can be undone', "v.reviewedBy[pageId] === handle && v.lastReviewed[pageId]", "v.lastReviewed[pageId]"],
    [H, 'a stamp that is no longer the latest can be undone', " && v.lastReviewed[pageId] === String(d.at || '').slice(0, 10));", ");"],
    // ---- the button ----
    [H, "the button is offered on anyone's review", "            if (!done || !me || done.by !== me) { return false; }\n            if (done.skipped || done.local) { return true; }", "            if (!done || !me) { return false; }\n            if (done.skipped || done.local) { return true; }"],
    [H, 'skips and offline marks lose the button', "            if (done.skipped || done.local) { return true; }\n", ''],
    [H, 'the button ignores whether it can be restored', "            return JiTA.leadduty.wiki._stillLatest(ledgerValue, pageId, done, me);", "            return true;"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutt.js')) { fs.unlinkSync('mutt.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
