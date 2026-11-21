// mutate-crosstab.js - breaks each part of what one tab tells the others (review 2026-11-20: exccore-logic-2, drift-own-1,
// boost-logic-1): a sync run that changed the stored data, the duplicate finder's ghost delete, a stored log reading, the
// end of a reading pass; what a tab does on hearing them; and the cached readings with nothing to go by, looked up again
// after a while. Requires the named harness to go red. A crashed or hung harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const X = 'crosstab-check.js', W = 'worker-check.js';
const muts = [
    // ---- a sync run tells ----
    [W, 'a sync run that changed something tells nobody', 'JiTA.sync._invalidateWorker(); JiTA.sync._tellChanged(!opts.isEbr, !!opts.isEbr); } }', 'JiTA.sync._invalidateWorker(); } }'],
    [W, 'every run says the defects changed', 'JiTA.sync._tellChanged(!opts.isEbr, !!opts.isEbr); } }', 'JiTA.sync._tellChanged(true, false); } }'],
    [X, 'the tell does not say which tab', '{ at: Date.now(), tab: JiTA.sched.tabId, defects: !!defects, ebr: !!ebr }', '{ at: Date.now(), defects: !!defects, ebr: !!ebr }'],
    // ---- a tab hears it ----
    [X, 'a tab hears its own tell', '        if (!v || v.tab === JiTA.sched.tabId) { return; }\n        if (v.ebr)', '        if (!v) { return; }\n        if (v.ebr)'],
    [X, 'a defect sync elsewhere leaves this tab\'s signatures', '        JiTA.logsig._dirty = true;\n        JiTA.repexc.reset();', '        JiTA.repexc.reset();'],
    [X, '...and the boost\'s answers', '        JiTA.repexc.reset();\n        JiTA.logsig.rematch();', '        JiTA.logsig.rematch();'],
    [X, '...and an open log is not matched again', '        JiTA.repexc.reset();\n        JiTA.logsig.rematch();\n    },', '        JiTA.repexc.reset();\n    },'],
    [X, 'a bug report sync elsewhere drops the defect copies too', '        if (!v.defects) { return; }\n', ''],
    [X, '...and not the bug report keyword fallback', '        if (v.ebr) { JiTA.rank._dirtyEbr = true; }\n', ''],
    // ---- the duplicate finder's ghost delete ----
    [X, 'the ghost delete tells nobody', "                        JiTA.sync._tellChanged(true, false);   // the other tabs' own copies\n", ''],
    [X, 'the ghost delete leaves this tab\'s signatures', '                        JiTA.logsig._dirty = true;   // and its exception signatures, which the ghosts were mined into too\n', ''],
    // ---- a stored reading is told ----
    [X, 'a stored reading is not forgotten here', '        R.forget(key);\n        if (R._untold', '        if (R._untold'],
    [X, 'a stored reading is told once per time it was stored', 'if (R._untold.indexOf(key) < 0) { R._untold.push(key); }', 'R._untold.push(key);'],
    [X, 'a stored reading is never told', 'if (R._untold.indexOf(key) < 0) { R._untold.push(key); }', ''],
    [X, 'the batch is never sent', '        if (!R._tellT) { R._tellT = setTimeout(function () { R._tellReads(false); }, R.TELL_MS); }\n', ''],
    [X, 'each reading is told at once', 'if (!R._tellT) { R._tellT = setTimeout(function () { R._tellReads(false); }, R.TELL_MS); }', 'R._tellReads(false);'],
    [X, 'a sent batch is sent again', '        R._untold = [];\n        if (!keys.length && !done)', '        if (!keys.length && !done)'],
    [X, 'an empty batch is sent', '        if (!keys.length && !done) { return; }\n', ''],
    [X, 'a batch too big to name is named', 'keys: keys.length > R.TELL_MAX ? null : keys', 'keys: keys'],
    [X, 'a reading stored by the profile reader is not told', 'var stored = function () { JiTA.repexc.readStored(issue.key); return rec; };', 'var stored = function () { JiTA.repexc.forget(issue.key); return rec; };'],
    [X, 'a pass that ended tells nobody', '                        JiTA.repexc._tellReads(true);   // and the other tabs, which redraw an open defect too\n', ''],
    // ---- a tab hears readings ----
    [X, 'a tab hears its own readings', '        if (!v || v.tab === JiTA.sched.tabId) { return; }\n        if (v.keys)', '        if (!v) { return; }\n        if (v.keys)'],
    [X, 'too many to name: nothing dropped', '} else { R._reads = {}; R._report = {}; R._msgs = {}; }', '}'],
    [X, 'a pass that ended redraws nothing', "        if (v.done && JiTA.ui._isReportsKey(JiTA.ui.currentKey || '')) { JiTA.ui.scheduleRender(); }", ''],
    [X, 'every batch redraws', "if (v.done && JiTA.ui._isReportsKey(JiTA.ui.currentKey || ''))", "if (JiTA.ui._isReportsKey(JiTA.ui.currentKey || ''))"],
    [X, 'a pass that ended redraws a bug report too', "if (v.done && JiTA.ui._isReportsKey(JiTA.ui.currentKey || ''))", 'if (v.done)'],
    // ---- a reading with nothing to go by ----
    [X, 'one with nothing to go by is kept for the session', '        if (c && c.empty && !(Date.now() - c.at < R.EMPTY_MS)) { c = null; }\n', ''],
    [X, 'every reading is looked up again', 'if (c && c.empty && !(Date.now() - c.at < R.EMPTY_MS))', 'if (c && !(Date.now() - c.at < R.EMPTY_MS))'],
    [X, 'one with no reading is not marked as nothing to go by', '{ c.empty = true; return null; }   // exceptions come from a log', '{ return null; }   // exceptions come from a log'],
    [X, 'a reading made with no log file is gone by', '(rec.hasLog || (rec.exc && rec.exc.length))', 'true'],
    [X, 'an older reader\'s reading with exceptions has no log', '(rec.hasLog || (rec.exc && rec.exc.length))', 'rec.hasLog'],
    [X, 'a log with no exceptions is not looked up again', '                if (!sigs.length) { c.empty = true; }\n', ''],
    [X, 'a store that cannot be read is not tried again', '}, function () { c.empty = true; return null; });', '}, function () { return null; });'],
    // ---- the listeners ----
    [X, 'a tab hears the store change from itself as well', "if (remote) { try { JiTA.sync.heardChanged(newV); } catch (e) { JiTA.caught('sync.heardChanged', e); } }",
        "try { JiTA.sync.heardChanged(newV); } catch (e) { JiTA.caught('sync.heardChanged', e); }"],
    [X, 'nobody listens for readings', "if (remote) { try { JiTA.repexc.readsHeard(newV); } catch (e) { JiTA.caught('repexc.readsHeard', e); } }", '']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutxt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutxt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    if (!/FAILURE|passed/.test(out) && !/  FAIL  /.test(out)) { crashed = true; }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutxt.js')) { fs.unlinkSync('mutxt.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
