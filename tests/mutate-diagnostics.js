// mutate-diagnostics.js - breaks each guard of Copy diagnostics (v3.53.0) in a copy of the script (mutdg.js) and requires
// diagnostics-check to go red: the error recorder, the catches that use it, the debug log, the report and the button.
// A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'diagnostics-check.js';
const muts = [
    // ---- JiTA.caught ----
    [H, 'the same error is a new entry every time', 'if (list[i].key === key) { list[i].n++; list[i].last = now; return; }', ''],
    [H, 'every caught error is kept', '            if (list.length > JiTA.CAUGHT_MAX) { list.shift(); }\n', ''],
    [H, 'every repeat is logged', 'if (list[i].key === key) { list[i].n++; list[i].last = now; return; }',
        "if (list[i].key === key) { list[i].n++; list[i].last = now; JiTA.dlog('[JiTA] caught in ' + where + ':', e); return; }"],
    [H, 'a caught error is never logged', "            JiTA.dlog('[JiTA] caught in ' + where + ':', e);\n", ''],
    [H, 'the recorder throws on what it cannot read', '} catch (x) { /* the recorder never throws */ }', '} catch (x) { throw x; }'],
    [H, 'a long message is kept whole', "var msg = String((e && (e.message || e.name)) || e || 'unknown error').slice(0, 300);", "var msg = String((e && (e.message || e.name)) || e || 'unknown error');"],
    [H, 'no stack is kept', "var stack = (e && typeof e.stack === 'string') ? e.stack.split('\\n').slice(0, 4).join('\\n') : '';", "var stack = '';"],
    // ---- the catches ----
    [H, 'a catch drops its error again', "catch (e4) { JiTA.caught('dv.ensure', e4); }", 'catch (e4) { /* swallow */ }'],
    [H, 'a catch names another call', "catch (e2) { JiTA.caught('ui.updateVisibility', e2); }", "catch (e2) { JiTA.caught('ui.ensure', e2); }"],
    [H, 'a catch passes on another error than its own', "catch (e3) { JiTA.caught('logsig.updateVisibility', e3); }", "catch (e3) { JiTA.caught('logsig.updateVisibility', e2); }"],
    // ---- the debug log ----
    [H, 'the debug log runs with Debug logging off', "            if (!gmGet('sdDebug', false)) { return; }\n", ''],
    [H, 'the debug log keeps every line', '            if (JiTA._dlogLines.length > JiTA.DLOG_MAX) { JiTA._dlogLines.shift(); }\n', ''],
    [H, 'a long argument is kept whole', "out.push(s.length > 300 ? s.slice(0, 300) + '...' : s);", 'out.push(s);'],
    [H, 'an argument JSON cannot write loses the line', '} catch (e) { s = Object.prototype.toString.call(a); }', '} catch (e) { throw e; }'],
    // ---- the report ----
    [H, 'the report gives the page\'s address', "            return kind + (JITA_IS_SUBFRAME ? ', inside a frame' : '');", '            return p;'],
    [H, 'the report waits for ever', 'return Promise.race([Promise.resolve().then(p), wait]).then(null, failed);', 'return Promise.resolve().then(p).then(null, failed);'],
    [H, 'a database that fails fails the report', 'return Promise.race([Promise.resolve().then(p), wait]).then(null, failed);', 'return Promise.race([Promise.resolve().then(p), wait]);'],
    [H, 'the debug log is in it with Debug logging off', "            if (gmGet('sdDebug', false)) {\n                lines.push('Debug log, the last '", "            if (true) {\n                lines.push('Debug log, the last '"],
    [H, 'the oldest error comes first', 'var c = JiTA._caughtList.slice().sort(function (a, b) { return b.last - a.last; });', 'var c = JiTA._caughtList.slice();'],
    [H, 'a worker never started is pinged', '        if (!live) { return Promise.resolve(state); }\n', ''],
    [H, 'the data line leaves out the bug reports', "return v[0] + ' issues stored, ' + v[1] + ' of them bug reports; synced up to '", "return v[0] + ' issues stored; synced up to '"],
    // ---- copying and the button ----
    [H, 'no clipboard counts as copied', "return Promise.reject(new Error('no clipboard here'));", 'return Promise.resolve();'],
    [H, 'a clipboard that throws escapes', '} catch (e) { return Promise.reject(e); }\n        return Promise.reject(', '} catch (e) { throw e; }\n        return Promise.reject('],
    [H, 'the button stays off', '}).then(function () { $diag.prop(\'disabled\', false); });', '});'],
    [H, 'a closed Settings is written into', "                        if (!JiTA.menu._live($diagStatus)) { return; }\n                        $diagStatus.text('The browser would not copy it", "                        $diagStatus.text('The browser would not copy it"],
    [H, 'a second try adds a second box', "                        $diagStatus.siblings('.jita-diag-text').remove();\n", ''],
    [H, 'the report shown is not selected', '.insertAfter($diagStatus).each(function () { this.select(); });', '.insertAfter($diagStatus);']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutdg.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutdg.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutdg.js')) { fs.unlinkSync('mutdg.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
