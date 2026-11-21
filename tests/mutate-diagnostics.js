// mutate-diagnostics.js - breaks each guard of Copy diagnostics (v3.53.0, the console lines since v3.53.1) in a copy of the
// script (mutdg.js) and requires diagnostics-check to go red: the error recorder, the catches that use it, the log and
// the console lines that go through it, the report and the button. A crashed harness counts as red.
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
    [H, "no stack is kept", "var stack = (e && typeof e.stack === 'string') ? JiTA._frames(e.stack) : '';", "var stack = '';"],
    [H, "the stack's first line is always dropped", "        return lines.slice(at < 0 ? 0 : at).filter(function (s) { return !!s.trim(); }).slice(0, JiTA.CAUGHT_FRAMES).join('\\n');", "        return lines.slice(1).filter(function (s) { return !!s.trim(); }).slice(0, JiTA.CAUGHT_FRAMES).join('\\n');"],
    [H, "a Chrome stack keeps its header", "        return lines.slice(at < 0 ? 0 : at).filter(function (s) { return !!s.trim(); }).slice(0, JiTA.CAUGHT_FRAMES).join('\\n');", "        return lines.filter(function (s) { return !!s.trim(); }).slice(0, JiTA.CAUGHT_FRAMES).join('\\n');"],
    [H, "a Chrome header over two lines keeps its second", "        return lines.slice(at < 0 ? 0 : at).filter(function (s) { return !!s.trim(); }).slice(0, JiTA.CAUGHT_FRAMES).join('\\n');", "        return lines.slice(at < 0 ? 0 : 1).filter(function (s) { return !!s.trim(); }).slice(0, JiTA.CAUGHT_FRAMES).join('\\n');"],
    [H, "the report drops the frame that threw", "            x.stack.split('\\n').forEach(function (s) { if (s.trim()) { out.push('        ' + s.trim()); } });", "            x.stack.split('\\n').slice(1).forEach(function (s) { if (s.trim()) { out.push('        ' + s.trim()); } });"],
    // ---- the catches ----
    [H, 'a catch drops its error again', "catch (e4) { JiTA.caught('dv.ensure', e4); }", 'catch (e4) { /* swallow */ }'],
    [H, 'a catch names another call', "catch (e2) { JiTA.caught('ui.updateVisibility', e2); }", "catch (e2) { JiTA.caught('ui.ensure', e2); }"],
    [H, 'a catch passes on another error than its own', "catch (e3) { JiTA.caught('logsig.updateVisibility', e3); }", "catch (e3) { JiTA.caught('logsig.updateVisibility', e2); }"],
    // ---- the log ----
    [H, 'a log line is printed but not kept', "            JiTA._logLines.push(new Date().toISOString().slice(11, 19) + ' ' + JiTA._fmtArgs(args));\n", ''],
    [H, 'a log line is kept but not printed', 'console[level].apply(console, args);', ''],
    [H, 'JiTA.log keeps only with Debug logging on', "    log: function () { JiTA._out('log', arguments); },", "    log: function () { if (gmGet('sdDebug', false)) { JiTA._out('log', arguments); } },"],
    [H, 'JiTA.warn prints as console.log', "    warn: function () { JiTA._out('warn', arguments); },", "    warn: function () { JiTA._out('log', arguments); },"],
    [H, 'JiTA.error prints as console.log', "    error: function () { JiTA._out('error', arguments); },", "    error: function () { JiTA._out('log', arguments); },"],
    [H, 'the debug log runs with Debug logging off', "try { if (gmGet('sdDebug', false)) { JiTA._out('log', arguments); } } catch (e) { /* ignore */ }", "try { JiTA._out('log', arguments); } catch (e) { /* ignore */ }"],
    [H, 'the log keeps every line', '            if (JiTA._logLines.length > JiTA.LOG_MAX) { JiTA._logLines.shift(); }\n', ''],
    [H, 'a console that throws throws on', '        try { if (window.console) { console[level].apply(console, args); } } catch (e) { /* ignore */ }\n', '        if (window.console) { console[level].apply(console, args); }\n'],
    [H, 'a long argument is kept whole', "out.push(s.length > 300 ? s.slice(0, 300) + '...' : s);", 'out.push(s);'],
    [H, 'an argument JSON cannot write loses the line', '} catch (e) { s = Object.prototype.toString.call(a); }', '} catch (e) { throw e; }'],
    // ---- the console lines that go through it ----
    [H, 'a page line goes straight to the console again', "JiTA.log('[JiTA] auto-sync error:', e && e.message || e);", "console.log('[JiTA] auto-sync error:', e && e.message || e);"],
    [H, 'a ledger dump goes into the report', "console.log('[JiTA.leadduty] DRY RUN: would '", "JiTA.log('[JiTA.leadduty] DRY RUN: would '"],
    [H, 'the earliest error never reaches the report', "if (typeof JiTA !== 'undefined' && JiTA && JiTA.error) { JiTA.error(", 'if (false) { JiTA.error('],
    // ---- the report ----
    [H, 'the report gives the page\'s address', "            return kind + (JITA_IS_SUBFRAME ? ', inside a frame' : '');", '            return p;'],
    [H, 'the report waits for ever', 'return Promise.race([Promise.resolve().then(p), wait]).then(null, failed);', 'return Promise.resolve().then(p).then(null, failed);'],
    [H, 'a database that fails fails the report', 'return Promise.race([Promise.resolve().then(p), wait]).then(null, failed);', 'return Promise.race([Promise.resolve().then(p), wait]);'],
    [H, 'the log is left out of the report', "            log.forEach(function (l) { lines.push('  ' + l); });\n", ''],
    [H, 'the Debug logging hint shows with it on', "            if (!gmGet('sdDebug', false)) {\n                lines.push('', 'Debug logging is off.", "            if (true) {\n                lines.push('', 'Debug logging is off."],
    [H, 'a full log reads as the whole of it', ": log.length >= JiTA.LOG_MAX ? 'Log, the latest '", ": log.length > JiTA.LOG_MAX ? 'Log, the latest '"],
    [H, 'one line reads "1 lines"', "(log.length === 1 ? ' line:' : ' lines:')", "' lines:'"],
    [H, 'an older worker is not pointed out', "var older = v !== '?' && JiTA.SCRIPT_VERSION && w._verCmp(v, JiTA.SCRIPT_VERSION) < 0;", 'var older = false;'],
    [H, 'a newer worker is called older', 'w._verCmp(v, JiTA.SCRIPT_VERSION) < 0;', 'w._verCmp(v, JiTA.SCRIPT_VERSION) !== 0;'],
    [H, 'a worker that gives no version is called older', "var older = v !== '?' && JiTA.SCRIPT_VERSION &&", 'var older = JiTA.SCRIPT_VERSION &&'],
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
