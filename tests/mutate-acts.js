// mutate-acts.js - breaks each guard of Player actions (JiTA.acts, v3.55.0) and requires acts-check to go red. A crashed
// harness counts as red. The entry in the viewer's file list and the list in its pane are broken in mutate-layout.js.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'acts-check.js', TMP = 'mutpa.js';
const muts = [
    // ---- reading the files ----
    [H, 'midnight is not counted', '            if (prev >= 0 && s < prev - 3600) { day++; }   // the clock went back by more than an hour: midnight passed\n', ''],
    [H, 'a service call counts twice or three times', "if (kind === 'RemoteServiceCall' && base.indexOf(OBJ) !== 0) { name = base; }", "if (kind.indexOf('ServiceCall') >= 0 && base.indexOf(OBJ) !== 0) { name = base; }"],
    [H, 'calls stay in the order they ended', '        return out.sort(function (a, b) { return a.t - b.t || a.o - b.o; });', '        return out;'],
    // ---- dates ----
    [H, 'an exception\'s day-first date is not read', '        if (a > 12 && b <= 12) { return { y: y, mo: b, d: a, tod: tod }; }\n', ''],
    [H, 'an exception\'s date that could be either dates the log', '        return start && a <= 12 ? { y: y, mo: a, d: b, tod: tod } : null;', '        return a <= 12 ? { y: y, mo: a, d: b, tod: tod } : null;'],
    [H, 'a line dated before midnight and logged after it stays on that day', 'if (w.tod - L[i].s > 43200) { day += 86400000; }', 'if (false) { day += 86400000; }'],
    [H, 'methodcalls.txt dates a log that ended before midnight on the next day', '        if (t > last + 3600000) { base -= 86400000; } else if (t < last - 82800000) { base += 86400000; }', ''],
    // ---- the actions ----
    [H, 'lines inside a stacktrace block are read as actions', String.raw`            if (e.s === st.blk.s && e.d === st.blk.d && !/^(EXCEPTION|STACKTRACE) #\d+/.test(m)) {`, '            if (false) {'],
    [H, 'an exception\'s message is not read', String.raw`                if (st.blk.exc && !st.blk.info && (r = /^Formatted exception info:\s*(.*)$/.exec(m))) { st.blk.info = r[1]; }`, ''],
    [H, 'the client\'s start is listed each time it is logged', "            if (once('start')) {", '            if (true) {'],
    [H, 'the bug report window is listed for each of its lines', "            if (once('report')) {", '            if (true) {'],
    [H, 'logging in is three rows', "                ev.push(A._row(t, 'session', 'Logged in', at.length ? 'In ' + at.join(', ') : '', raw));\n                return;", "                ev.push(A._row(t, 'session', 'Logged in', at.length ? 'In ' + at.join(', ') : '', raw));"],
    [H, 'the game\'s own label stays on a destination', String.raw`.replace(/^[^:：]{1,30}[:：]\s*/, '')`, ''],
    [H, 'a warp is never paired with its landing', '            var s = starts.length && e.t - starts[starts.length - 1].t <= A.WARP_MAX ? starts.pop() : null;', '            var s = null;'],
    [H, 'a replaced warp is lost', "                A._turn(o, 'move', 'Tried to warp', 'No landing was logged after it: the warp was stopped, refused, or replaced by another warp.');\n", ''],
    [H, 'a landing from before methodcalls.txt begins is taken for one with no command', '                var late = mcFrom !== null && e.t >= mcFrom;', '                var late = true;'],
    [H, 'a wormhole jump is not paired with its arrival', "if (!how && (p.k === 'gate' || p.k === 'wh') && p.from === e.from) { how = p; }", "if (!how && p.k === 'gate' && p.from === e.from) { how = p; }"],
    [H, 'a jump bridge request is not paired with its arrival', "                    else if (!how && p.k === 'bridgecmd') { how = p; }\n", ''],
    [H, 'a stargate request stays a row of its own', "                if (gate && cmd) { e.raw = cmd.raw.concat(e.raw); cmd.k = 'gone'; }   // the request first: the hover reads oldest first\n", ''],
    [H, 'docking stays a row of its own', "                if (dock) { dock.raw = e.raw.concat(dock.raw); e.k = 'gone'; }", "                if (false) { dock.raw = e.raw.concat(dock.raw); e.k = 'gone'; }"],
    [H, 'the directional scanner is not listed', "        'ConeScan': ['act', 'Used the directional scanner'],\n", ''],
    // ---- the list ----
    [H, 'repeats are not folded', "            if (p && p.cat !== 'mark' && p.a === r.a && p.x === r.x && r.t - (p.end || p.t) <= 300000) {", '            if (false) {'],
    [H, 'nothing marks where methodcalls.txt starts', "            ev.push(A._row(out.mcFrom, 'mark', 'methodcalls.txt starts here', 'From here on the server calls are listed too: warp starts, d-scan, target locks, modules.'));\n            ev[ev.length - 1].first = true;\n", ''],
    [H, 'the mark sorts after what happened in its second', "(b.first ? 1 : 0) - (a.first ? 1 : 0) || ", ''],
    [H, 'Copy leaves out the days', "            if (day && day !== lastDay) { out.push('', day); lastDay = day; }\n            out.push(A._time(r.t)", '            out.push(A._time(r.t)'],
    [H, 'what the files say is not escaped', '<td class="jpa-a">\' + H(r.a) +', '<td class="jpa-a">\' + r.a +'],
    // ---- a row's lines: the hover card, the chooser, finding a line in the log parser's view (v3.57.0) ----,
    [H, "lines that read the same are not counted (logs.txt)", "            same[line] = k + 1;\n", ""],
    [H, "lines that read the same are not counted (methodcalls.txt)", "            same[line] = n + 1;\n", ""],
    [H, "a log line is cut at 400 again", "raw = { f: 'logs.txt', line: e.line, k: e.k }", "raw = { f: 'logs.txt', line: e.line.slice(0, 400), k: e.k }"],
    [H, "the card leaves out why the row says what it says", "        if (r.hint) { out += '<div class=\"jpa-tip-hint\">' + H(r.hint) + '</div>'; }\n", ""],
    [H, "the card leaves out how many there were", "        if (r.n > 1) { out += '<div class=\"jpa-tip-hint\">' + r.n + ' times, the last at ' + A._time(r.end) + '</div>'; }\n", ""],
    [H, "the card shows every line", "shown = lines.slice(0, A.TIP_LINES)", "shown = lines"],
    [H, "the card shows a message whole", "        if (msg.length > A.TIP_CHARS) { msg = msg.slice(0, A.TIP_CHARS) + '…'; }\n", ""],
    [H, "the card does not escape a message", "'<div class=\"jpa-tip-msg\">' + H(msg) + '</div></div>'", "'<div class=\"jpa-tip-msg\">' + msg + '</div></div>'"],
    [H, "a warning is not in its colour", "(/^(warning|error)$/.test(type) ? ' jpa-tip-' + type : '')", "''"],
    [H, "a call keeps its date in the card", "return s.f === 'methodcalls.txt' ? c0.slice(-8) : c0;", "return c0;"],
    [H, "a row read from both files says a click opens one", "(files.length > 1 ? 'Click to open it in ' + files.join(' or ') : 'Click to open this line in ' + files[0])", "('Click to open this line in ' + files[0])"],
    [H, "the chooser has no times", "H(A._lineTime(A._firstIn(r, f)))", "''"],
    [H, "a mark can be clicked", "(r.raw.length ? ' jpa-go' : '')", "' jpa-go'"],
    [H, "the search does not look through the lines", "var q = [r.hint].concat(r.raw.map(function (s) { return s.f + ' ' + s.line; })).join(' ');", "var q = r.hint;"],
    [H, "seek takes a view still being drawn", "if (!tc || tc.style.display !== 'table' || !tc.tBodies", "if (!tc || !tc.tBodies"],
    [H, "seek takes another file's view", " || A._viewOf(tc) !== src.f) { return null; }", ") { return null; }"],
    [H, "seek takes the first of lines that read the same", "if (n++ === (src.k || 0)) { return rows[i]; }", "if (n++ === 0) { return rows[i]; }"],
    [H, "seek reads a count of repeats or a defect's link as the line", "(n.classList.contains('jita-sig-link') || n.classList.contains('jita-rep-badge'))", "false"],
    [H, "seek compares spacing", "    _squeeze: function (s) { return String(s == null ? '' : s).replace(/\\s+/g, ' ').trim(); },", "    _squeeze: function (s) { return String(s == null ? '' : s).trim(); },"],
    [H, "seek takes the first row of the time over the one that starts most like the line", "if (c > most) { most = c; like = rows[i]; }", "if (most < 0) { most = c; like = rows[i]; }"],
    [H, "seek takes the last of the rows that start alike", "if (c > most) { most = c; like = rows[i]; }", "if (c >= most) { most = c; like = rows[i]; }"],
    [H, "seek waits on for a line not in the view", "        return last || like || false;", "        return last || like || null;"],
    // ---- which igbr.zip ----
    [H, 'of two igbr.zip, the newest, whatever the viewer shows', '(shown ? Math.abs((a.size || 0) - shown) - Math.abs((b.size || 0) - shown) : 0) || ', ''],
    [H, 'any zip is read', "        var zips = (att || []).filter(function (a) { return JiTA.acts.ZIP.test(a.filename || '') && a.content; });", '        var zips = (att || []).filter(function (a) { return a.content; });']
];
let allRed = true;
// The harness has to pass on the script as it is first: one that cannot even start would count every breakage below as
// red, caught by nothing.
try {
    execSync('node ' + H, { env: Object.assign({}, process.env, { JITA_SRC: process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js') }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 });
} catch (e) {
    console.log('BASELINE ' + H + ' does not pass on the unbroken script, so no breakage below can count: ' + String((e.stdout || '').split('\n').filter((l) => /FAIL|Error/.test(l))[0] || e.message).slice(0, 160));
    allRed = false;
}
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync(TMP, src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: TMP }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|^  FAIL  /m.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync(TMP)) { fs.unlinkSync(TMP); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
