// mutate-ranklog.js - breaks each ranking / log-panel fix (v3.38.24) and requires ranklog-check to go red. A crashed
// harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'ranklog-check.js';
const muts = [
    [H, 'any late result redraws', "                if (res && res.mode === 'Hybrid') {\n                    try { if (onUpgrade) { onUpgrade(res); } else { JiTA.ui.scheduleRender(); } } catch (e) { /* ignore */ }\n                }",
        "                try { if (onUpgrade) { onUpgrade(res); } else { JiTA.ui.scheduleRender(); } } catch (e) { /* ignore */ }"],
    [H, 'the upgrade always redraws the panel', 'try { if (onUpgrade) { onUpgrade(res); } else { JiTA.ui.scheduleRender(); } } catch (e) { /* ignore */ }', 'try { JiTA.ui.scheduleRender(); } catch (e) { /* ignore */ }'],
    [H, 'suggestBest drops the hook', '    return JiTA.rank._pickMode(forceMode, keywordOnly, hybrid, onUpgrade);\n};\n\n// EDR (defect)', '    return JiTA.rank._pickMode(forceMode, keywordOnly, hybrid);\n};\n\n// EDR (defect)'],
    [H, 'Triage keeps its Keyword ranking', '                delete T._cache[key];\n                if (T._open', '                if (T._open'],
    [H, 'Triage redraws whatever report is on screen', "                if (T._open && T._queue[T._idx] && T._queue[T._idx].key === key) { T._render(); }", '                if (T._open) { T._render(); }'],
    [H, 'Triage drops a newer ranking', '                if (T._cache[key] !== p) { return; }\n', ''],
    [H, 'hidden occurrences are cycled through', 'var rowsArr = entry.rows.filter(function (r) { return r.isConnected && r.offsetParent !== null; });', 'var rowsArr = entry.rows;'],
    [H, 'all hidden goes unsaid', "                    if (entry.rows.length) { try { JiTA.ui.toast('Every occurrence is hidden by the filters or Group Repeats.'); } catch (e) { /* ignore */ } }\n", ''],
    [H, 'the panel always goes on the page', "        var host = (tc && tc.closest && tc.closest('#jt-viewer')) || document.body;", '        var host = document.body;'],
    [H, 'a panel on the wrong host stays there', '        if (panel && panel.parentNode !== host) { panel.parentNode.removeChild(panel); panel = null; }\n', ''],
    [H, 'the tab reads past EXCEPTION END', '        var blocks = [], re = /EXCEPTION #[\\s\\S]*?(?:EXCEPTION END|(?=EXCEPTION #)|$)/gi, m;\n        while ((m = re.exec(text))) { blocks.push(m[0]); if (re.lastIndex === m.index) { re.lastIndex++; } }\n        return blocks.length ? blocks : [text || \'\'];\n    },',
        '        var blocks = [], re = /EXCEPTION #[\\s\\S]*?(?=EXCEPTION #|$)/gi, m;\n        while ((m = re.exec(text))) { blocks.push(m[0]); if (re.lastIndex === m.index) { re.lastIndex++; } }\n        return blocks.length ? blocks : [text || \'\'];\n    },'],
    [H, 'the worker reads past EXCEPTION END', '    function lgSplit(text) {   // KEEP IN SYNC with JiTA.logsig._splitBlocks\n        var blocks = [], re = /EXCEPTION #[\\s\\S]*?(?:EXCEPTION END|(?=EXCEPTION #)|$)/gi, m;',
        '    function lgSplit(text) {   // KEEP IN SYNC with JiTA.logsig._splitBlocks\n        var blocks = [], re = /EXCEPTION #[\\s\\S]*?(?=EXCEPTION #|$)/gi, m;'],
    [H, 'the tab strips only line-start prefixes', "        text = text.replace(/(^|\\s)\\d{1,2}:\\d{2}:\\d{2}\\t[^\\t\\n]*\\t[^\\t\\n]*\\t/g, '$1');", "        text = text.replace(/^[ \\t]*\\d{1,2}:\\d{2}:\\d{2}\\t[^\\t\\n]*\\t[^\\t\\n]*\\t/gm, '');"],
    [H, 'the worker strips only line-start prefixes', "        text = (text || '').replace(/(^|\\s)\\d{1,2}:\\d{2}:\\d{2}\\t[^\\t\\n]*\\t[^\\t\\n]*\\t/g, '$1');", "        text = (text || '').replace(/^[ \\t]*\\d{1,2}:\\d{2}:\\d{2}\\t[^\\t\\n]*\\t[^\\t\\n]*\\t/gm, '');"],
    [H, 'the tab index is marked clean after its build', '        R[dirtyKey] = false;\n        R[buildingKey] = JiTA.db.allDefects().then(function (records) {\n            R[indexKey] = build(records);\n            R[buildingKey] = null;',
        '        R[buildingKey] = JiTA.db.allDefects().then(function (records) {\n            R[indexKey] = build(records);\n            R[dirtyKey] = false;\n            R[buildingKey] = null;']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutk.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutk.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutk.js')) { fs.unlinkSync('mutk.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
