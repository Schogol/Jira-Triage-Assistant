// logparser-check.js - the log parsers (v3.38.17). Evals the real Parse* functions, the panel buttons and filter,
// SwapUI's choice of editor and file, and the PDM reader against fake tables and a small jQuery stand-in:
//  - a line with fewer than four columns no longer throws and leaves the spinner going; a parser that throws ends
//    the spinner with a message; logging errors after an exception are not marked as exceptions; no stray border
//  - the panel buttons recompute the parsed table only: Only Exceptions no longer hides the header or Jira's rows,
//    Show All no longer forces Jira's hidden rows open, a type toggle no longer hides Jira's own .error elements
//  - a log header in the comment box is never parsed or hidden; a viewer that hands over no text is left alone
//  - the header-less igbr.zip file a click opened is taken once, so a click while the parser was off cannot pick
//    the parser for a later file; a click with the parser off leaves nothing pending
//  - Method Calls / Process Health keep their last row; no NaN; numeric comparisons; the PDM reader keeps
//    colons in values and survives a stray brace
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const fnSrc = (name, indent) => {
    indent = indent || '';
    const head = '\n' + indent + 'function ' + name + '(';
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + name); }
    const e = src.indexOf('\n' + indent + '}', s + 1);
    return src.slice(s + 1, e + indent.length + 2);
};
const load = (name, indent) => (0, eval)(fnSrc(name, indent));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

global.LOG_HDR = 'Time\tFacility\tType\tMessage';
global.SELECTORS = { CODE_BLOCK: "[data-testid='code-block']", CM_LINE: '.cm-line' };
global.rows = '';
global.jitaIgbrFile = null;
global.jitaParserGen = 0;
global.jitaParserPending = 0;
let parserOn = true;
global.flagOn = (name) => (name === 'parser' ? parserOn : false);
let timers = [];
global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
global.clearTimeout = () => {};
const runTimers = () => { while (timers.length) { timers.shift()(); } };
console.log = ((log) => (...a) => { if (a[0] !== '[JiTA] log parser failed:') { log(...a); } })(console.log);
console.warn = () => {};

['prepLogRows', 'finishParserView', 'ParseLogs', 'ParseMcLogs', 'ParsePhLogs', 'convertTextToObject', 'jitaRunParse', 'mountParser',
    'readCodeBlock', 'jitaInEditable', 'SwapUI', 'jitaRunParserWhenLoaded', 'jitaWireLogControls', 'jitaApplyLogFilter'].forEach((n) => load(n));
const realParseLogs = global.ParseLogs;

// ---- a fake parsed table ----
function Cell() { return { innerHTML: '', className: '', colSpan: 1, set textContent(v) { this.innerHTML = String(v); }, get textContent() { return this.innerHTML; } }; }
function Tr(cls) {
    const tr = { className: cls || '', cells: [], style: {}, attrs: {} };
    tr.insertCell = (i) => { const c = Cell(); tr.cells.splice(i, 0, c); return c; };
    tr.getAttribute = (k) => (k in tr.attrs ? tr.attrs[k] : null);
    tr.setAttribute = (k, v) => { tr.attrs[k] = String(v); };
    Object.defineProperty(tr, 'textContent', { get: () => tr.cells.map((c) => c.innerHTML).join(' ') });
    return tr;
}
let tbody, table, loader;
function mountTable() {
    tbody = { rows: [], appendChild(r) { this.rows.push(r); } };
    table = { tBodies: [tbody], style: { display: 'none' } };
    loader = { style: { display: 'block' } };
}
global.document = {
    getElementById: (id) => (id === 'tableContent' ? table : id === 'loader' ? loader : null),
    createElement: () => Tr(),
    querySelector: () => null,
    querySelectorAll: () => []
};
let regroups = 0;
global.jitaBuildLogGroups = () => {};
global.jitaRegroupLog = () => { regroups++; };

// ---- a small jQuery stand-in: J(list) over fake nodes, $ routed per section ----
const htmlOf = {}, textOf = {}, handlers = {};
function J(list, sel) {
    const j = list.slice();
    j.filter = (f) => J(list.filter((e, i) => f.call(e, i, e)), sel);
    j.first = () => J(list.slice(0, 1), sel);
    j.not = (o) => J(list.filter((e) => Array.prototype.indexOf.call(o, e) < 0), sel);
    j.closest = (s) => J(list.map((e) => e.closest(s)).filter((e, i, a) => e && a.indexOf(e) === i), s);
    j.find = (s) => { const out = []; const walk = (n) => (n.kids || []).forEach((k) => { if (k.matches && k.matches(s)) { out.push(k); } walk(k); }); list.forEach(walk); return J(out, s); };
    j.attr = (k, v) => { if (v === undefined) { return list[0] ? (k === 'id' ? list[0].id : list[0].getAttribute(k)) : undefined; } list.forEach((e) => { e.attrs[k] = v; }); return j; };
    j.removeAttr = (k) => { list.forEach((e) => { delete e.attrs[k]; }); return j; };
    j.html = (v) => { htmlOf[sel] = v; list.forEach((e) => { e.mounted = v; }); return j; };
    j.text = (v) => { if (v === undefined) { return list.map((e) => e.text || '').join(''); } textOf[sel] = v; return j; };
    j.append = (v) => { htmlOf[sel + ' +'] = v; return j; };
    j.css = (o) => { list.forEach((e) => { if (e.style && o && o.display) { e.style.display = o.display; } }); return j; };
    j.remove = () => j;
    j.each = (f) => { list.forEach((e, i) => f.call(e, i, e)); return j; };
    j.click = (f) => { list.forEach((e) => { e.onclick = f; }); return j; };
    j.on = (ev, f) => { handlers[sel + ' ' + ev] = f; list.forEach((e) => { e['on' + ev] = f; }); return j; };
    j.val = () => (list[0] ? list[0].value : undefined);
    const has = (e, c) => (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0;
    j.hasClass = (c) => list.some((e) => has(e, c));
    j.addClass = (c) => { list.forEach((e) => { if (!has(e, c)) { e.className = (e.className + ' ' + c).trim(); } }); return j; };
    j.removeClass = (c) => { list.forEach((e) => { e.className = e.className.split(' ').filter((x) => x && x !== c).join(' '); }); return j; };
    j.toggleClass = (c) => { list.forEach((e) => { if (has(e, c)) { J([e]).removeClass(c); } else { J([e]).addClass(c); } }); return j; };
    return j;
}
let route = () => [];
global.$ = (sel) => (typeof sel === 'string' ? J(route(sel) || [], sel) : J([sel], '(node)'));

// ============ ParseLogs ============
mountTable();
rows = [LOG_HDR,
    '12:00:00\tnet\tnotice\tconnected',
    '12:00:01\tui\terror\tEXCEPTION #1 logged at 03/12/2025 12:00:01',
    '12:00:01\tui\terror\tTraceback (most recent call last)',
    '12:00:01\tui\terror\tEXCEPTION END',
    '***some logging error***',
    '12:00:02\t\twarning\tfacility is empty',
    'a line with no tabs at all',
    '12:00:03\tnet\tinfo\tkey\tvalue',
    '12:00:04\tnet\tnotice\tthe last line'].join('\r\n') + '\r\n';
let threw = null;
try { realParseLogs(); } catch (e) { threw = e; }
const msg = (r) => (r.cells[3] ? r.cells[3].innerHTML : '');
const byMsg = (re) => tbody.rows.filter((r) => re.test(msg(r)))[0];
ok('a log with short lines parses without throwing', !threw, threw && threw.message);
ok('...every line is a row, the last one included', tbody.rows.length === 9 && /the last line/.test(msg(tbody.rows[8])), tbody.rows.length + ' rows');
ok('...and the spinner ends and the table shows', loader.style.display === 'none' && table.style.display === 'table');
ok('the first row carries no stray top border', !/bordertop/.test(tbody.rows[0].className), tbody.rows[0].className);
ok('an exception block is marked as exception (control)', /\bexception\b/.test(byMsg(/Traceback/).className), byMsg(/Traceback/).className);
const logErr = byMsg(/Logging error occurred/);
ok('a logging error right after an exception is not marked as one', !!logErr && !/\bexception\b/.test(logErr.className), logErr && logErr.className);
const short = byMsg(/facility is empty/);
ok('a line missing its Facility keeps its time and its text', !!short && short.cells[0].innerHTML === '12:00:02' && /warning facility is empty/.test(msg(short)), short && JSON.stringify(short.cells.map((c) => c.innerHTML)));
const bare = byMsg(/no tabs at all/);
ok('a line with no tabs at all is kept whole as the message', !!bare && bare.cells[0].innerHTML === '' && /^a line with no tabs at all/.test(msg(bare)));
const tabbed = byMsg(/^key/);
ok('a message with a tab of its own keeps its tail', !!tabbed && /^key\tvalue/.test(msg(tabbed)), tabbed && JSON.stringify(msg(tabbed)));

// ============ a parser that throws ============
mountTable();
jitaRunParse(() => { throw new Error('boom'); });
ok('a parser that throws ends the spinner', loader.style.display === 'none');
ok('...and says so in the table, which is shown', tbody.rows.length === 1 && /could not be parsed \(boom\)/.test(tbody.rows[0].cells[0].innerHTML) && table.style.display === 'table',
    tbody.rows[0] && tbody.rows[0].cells[0].innerHTML);
mountTable();
jitaRunParse(() => {});
ok('...a parser that does not throw adds nothing (control)', tbody.rows.length === 0 && loader.style.display === 'block');
mountTable(); timers = [];
route = () => [];
mountParser('<chrome>', () => { throw new Error('late'); });
runTimers();
ok('a mounted parser runs guarded, so its failure ends the spinner too', loader.style.display === 'none' && tbody.rows.length === 1);

// ============ Method Calls ============
const mcHdr = 'Time\tMethod\tDuration [ms]';
mountTable(); timers = [];
route = (sel) => (sel === '.peakMachoCell' ? [] : null);
rows = [mcHdr, '12:00:00\tfoo\t20', '12:00:01\tbar\t600', '   ', '12:00:02\tbaz\t1600'].join('\r\n') + '\r\n';
threw = null;
try { ParseMcLogs(); } catch (e) { threw = e; }
ok('Method Calls without a GetTime call parses', !threw, threw && threw.message);
ok('...says n/a for the average and the peak instead of NaN', /: n\/a /.test(htmlOf['#averageMacho'] || '') && /: n\/a /.test(htmlOf['#peakMacho'] || '') && !/NaN/.test(htmlOf['#averageMacho']),
    (htmlOf['#averageMacho'] || '').slice(0, 50));
ok('...keeps its last row and skips the blank one', tbody.rows.length === 3 && tbody.rows[2].cells[1].innerHTML === 'baz', tbody.rows.map((r) => r.cells[1].innerHTML).join());
threw = null;
try { handlers['#peakMacho click'](); } catch (e) { threw = e; }
ok('...and a click on the peak with no peak row does nothing', !threw, threw && threw.message);
mountTable();
rows = [mcHdr, '12:00:00\tmachoNet::GetTime (RemoteServiceCall)\t100', '12:00:01\tmachoNet::GetTime (RemoteServiceCall)\t300', '12:00:02\tfoo\t5'].join('\r\n') + '\r\n';
ParseMcLogs();
ok('with GetTime calls the average and the peak are given in ms (control)', /: 200ms /.test(htmlOf['#averageMacho']) && /: 300ms /.test(htmlOf['#peakMacho']), htmlOf['#averageMacho'].slice(0, 50));
ok('...and the last call is listed too', tbody.rows.length === 3 && tbody.rows[2].cells[1].innerHTML === 'foo', tbody.rows.length + ' rows');

// ============ Process Health ============
const phHdr = 'dateTime\tpyDateTime\tprocCpu\tthreadCpu\tpyMem\tvirtualMem\ttaskletsProcessed\ttaskletsQueued\twatchdog time\tspf\tserviceCalls\tcallsFromClient\tbytesReceived\tbytesSent\tpacketsReceived\tpacketsSent\tsessionCount\ttidiFactor';
const ph = (sessions, tidi) => ['12:00:00', '1', '10', '5', '100', '200', '5', '0', '0', '0.016', '1', '1', '100', '100', '1', '1', sessions, tidi].join('\t');
mountTable();
route = () => null;
rows = [phHdr, ph('10', '1.0'), ph('1', '.15'), ph('1', '0.5'), ph('1', '.9'), ph('1', '1.10'), ph('2', '1.0')].join('\r\n') + '\r\n';
ParsePhLogs();
const cls = (i, c) => (tbody.rows[i] ? tbody.rows[i].cells[c].className : 'no row');
ok('Process Health keeps its last row', tbody.rows.length === 6, tbody.rows.length + ' rows');
ok('ten sessions is red (as text, "10" sorts below "2")', cls(0, 16) === 'red', cls(0, 16));
ok('...one session is not, two is (control)', cls(1, 16) === '' && cls(5, 16) === 'red');
ok('time dilation .15 is red', cls(1, 17) === 'red', cls(1, 17));
ok('...0.5 is yellow (control)', cls(2, 17) === 'yellow', cls(2, 17));
ok('....9 is fine (as text it compares below "0.2")', cls(3, 17) === '', cls(3, 17));
ok('...1.10 is red and 1.0 is fine (control)', cls(4, 17) === 'red' && cls(0, 17) === '', cls(4, 17) + '/' + cls(0, 17));

// ============ PDM ============
let pdm = null;
threw = null;
try { pdm = convertTextToObject('{System}\n\tTIME: 12:34:56\n\tNAME: rig\n}\n}\nOS: Windows 11\n'); } catch (e) { threw = e; }
ok('a PDM value with colons is read whole', !!pdm && pdm.System && pdm.System.TIME === '12:34:56', pdm && JSON.stringify(pdm.System));
ok('a stray closing brace at the top does not stop the reading', !threw && pdm.OS === 'Windows 11', threw ? threw.message : JSON.stringify(pdm));

// ============ the panel buttons and the filter ============
function A(id, cls) { return { id: id, className: cls || '', attrs: {}, getAttribute() { return null; } }; }
const anchors = ['notice', 'warning', 'error', 'exception', 'onlyexception', 'showAll', 'jita-group-toggle'].map((id) => A(id));
const aById = (id) => anchors.filter((a) => a.id === id)[0];
const search = { value: '' };
const bodyRows = [Tr('notice'), Tr('warning'), Tr('error'), Tr('error exception'), Tr('info')];
bodyRows.forEach((r, i) => { r.insertCell(0).innerHTML = ['hello', 'careful', 'boom here', 'boom deep', 'plain'][i]; r.style.display = 'table-row'; });
const headRow = Tr(''); headRow.style.display = '';
const jiraRow = Tr('jira-row'); jiraRow.style.display = 'none';           // a Jira row behind the viewer, hidden by Jira
const jiraError = Tr('error'); jiraError.style.display = 'block';         // Jira's own .error element
const allTr = bodyRows.concat([headRow, jiraRow]);
route = (sel) => {
    if (sel === '#gpanel a') { return anchors; }
    if (sel === '#gnav a.toggle') { return anchors.filter((a) => /\btoggle\b/.test(a.className)); }
    if (/^#gnav a#/.test(sel)) { return sel.split(',').map((s) => aById(s.trim().replace('#gnav a#', ''))); }
    if (sel === '#onlyexception, #showAll') { return [aById('onlyexception'), aById('showAll')]; }
    if (sel === '#jita-log-search') { return [search]; }
    if (sel === '#tableContent tbody tr') { return bodyRows; }
    if (sel === 'tr') { return allTr; }
    if (sel === 'tr.exception') { return allTr.filter((r) => /\bexception\b/.test(r.className)); }
    if (sel === 'tr:not(.exception):not(#fixedHead)') { return allTr.filter((r) => !/\bexception\b/.test(r.className)); }
    if (sel.charAt(0) === '.') { return allTr.concat([jiraError]).filter((r) => (' ' + r.className + ' ').indexOf(' ' + sel.slice(1) + ' ') >= 0); }
    return null;
};
document.getElementById = (id) => (id === 'tableContent' ? table : null);
timers = []; regroups = 0;
jitaWireLogControls();
const click = (id) => { const a = aById(id); a.onclick.call(a, { preventDefault() {} }); runTimers(); };
const shown = () => bodyRows.map((r) => (r.style.display === 'none' ? 0 : 1)).join('');
click('onlyexception');
ok('Only Exceptions shows the exception rows alone', shown() === '00010', shown());
ok('...and leaves the table header alone', headRow.style.display === '', headRow.style.display);
ok('...and Jira\'s own rows', jiraRow.style.display === 'none', jiraRow.style.display);
click('showAll');
ok('Show All shows every row of the log', shown() === '11111', shown());
ok('...without forcing open a row Jira had hidden', jiraRow.style.display === 'none', jiraRow.style.display);
click('error');
ok('Toggle Errors hides the error rows and marks the button', shown() === '11001' && /\btoggle\b/.test(aById('error').className), shown());
ok('...without hiding Jira\'s own .error elements', jiraError.style.display === 'block', jiraError.style.display);
click('error');
ok('...and a second click brings them back', shown() === '11111' && !/\btoggle\b/.test(aById('error').className), shown());
search.value = 'boom';
handlers['#jita-log-search input']();
runTimers();
ok('the search box filters the rows', shown() === '00110', shown());
click('error');
ok('...and composes with a type toggle', shown() === '00000', shown());
click('error');
search.value = '';
handlers['#jita-log-search input']();
runTimers();
regroups = 0;
click('jita-group-toggle');
ok('Group Repeats marks itself off and regroups', /\btoggle\b/.test(aById('jita-group-toggle').className) && regroups === 1, aById('jita-group-toggle').className + ' / ' + regroups);
click('jita-group-toggle');
ok('...and on again', !/\btoggle\b/.test(aById('jita-group-toggle').className), aById('jita-group-toggle').className);

// ============ SwapUI: which editor, which file ============
function N(cls, attrs, kids, text) {
    const n = { className: cls || '', attrs: attrs || {}, kids: kids || [], text: text || '', parentElement: null, style: {} };
    n.kids.forEach((k) => { k.parentElement = n; });
    n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
    n.matches = (sel) => sel.split(',').some((s) => {
        s = s.trim();
        if (s.charAt(0) === '.') { return (' ' + n.className + ' ').indexOf(' ' + s.slice(1) + ' ') >= 0; }
        const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(s);
        return !!m && n.attrs[m[1]] === m[2];
    });
    n.closest = (sel) => { for (let x = n; x; x = x.parentElement) { if (x.matches(sel)) { return x; } } return null; };
    n.classList = { contains: (c) => n.matches('.' + c), add: (c) => { if (!n.matches('.' + c)) { n.className = (n.className + ' ' + c).trim(); } }, remove() {} };
    n.querySelector = () => null;
    Object.defineProperty(n, 'textContent', { get: () => n.text + n.kids.map((k) => k.textContent).join('') });
    return n;
}
// CodeMirror marks its content contenteditable="true" in BOTH places; only the host tells them apart.
const editor = (text) => { const line = N('cm-line', {}, [], text); const content = N('cm-content', { contenteditable: 'true' }, [line]); return { line: line, content: content, ed: N('cm-editor', {}, [content]) }; };
let comment, viewer, cmText = '', cbNodes = [], reveals = 0, parsedWith = [], dxRuns = 0, reqText = null;
global.html = 'LOG'; global.phHtml = 'PH'; global.McHtml = 'MC'; global.ocHtml = 'OC'; global.lcHtml = 'LC'; global.dxdiagHtml = 'DX'; global.pdmHtml = 'PDM';
global.getCmDocText = () => cmText;
global.jitaRevealLogs = () => { reveals++; };
global.ParseLogs = () => { parsedWith.push('log'); };
global.ParseOcLogs = () => { parsedWith.push('oc'); };
global.renderDxdiag = () => { dxRuns++; };
global.renderRequirements = () => {};
const CB = SELECTORS.CODE_BLOCK;
route = (sel) => {
    if (sel === SELECTORS.CM_LINE + ':contains(' + LOG_HDR + ')') { return [comment, viewer].filter(Boolean).map((e) => e.line).filter((l) => l.text.indexOf(LOG_HDR) >= 0); }
    if (sel === CB) { return cbNodes; }
    return null;
};
function scene(opts) {
    comment = opts.comment ? editor(LOG_HDR) : null;
    if (comment) { N('ProseMirror', { contenteditable: 'true' }, [N('code-block-wrap', { contenteditable: 'false' }, [comment.ed])]); }
    viewer = opts.viewer ? editor(LOG_HDR) : null;
    if (viewer) { N('media-viewer', {}, [viewer.ed]); }
    cmText = opts.cmText || '';
    cbNodes = opts.cb ? [N('code-block', {}, [], opts.cb)] : [];
    Object.keys(htmlOf).forEach((k) => { delete htmlOf[k]; });
    Object.keys(textOf).forEach((k) => { delete textOf[k]; });
    timers = []; reveals = 0; parsedWith = []; dxRuns = 0; jitaParserPending = 7;
}
const LOG_TEXT = LOG_HDR + '\n12:00:00\tnet\tnotice\thi\n';
scene({ comment: true });
SwapUI(); runTimers();
ok('a log header typed in the comment box is not parsed', !comment.ed.mounted && parsedWith.length === 0, String(comment.ed.mounted));
scene({ comment: true, viewer: true, cmText: LOG_TEXT });
SwapUI(); runTimers();
ok('with a log open as well, the log viewer is parsed and the comment box left alone', viewer.ed.mounted === 'LOG' && !comment.ed.mounted && parsedWith.join() === 'log',
    viewer.ed.mounted + ' / ' + comment.ed.mounted);
scene({ viewer: true, cmText: LOG_TEXT });
mountTable();
document.getElementById = (id) => (id === 'tableContent' ? table : id === 'loader' ? loader : null);
global.ParseLogs = () => { throw new Error('bad line'); };
threw = null;
try { SwapUI(); runTimers(); } catch (e) { threw = e; }
ok('a log in the viewer that fails to parse ends the spinner with the reason', !threw && loader.style.display === 'none' && tbody.rows.length === 1, threw ? threw.message : loader.style.display);
global.ParseLogs = () => { parsedWith.push('log'); };
scene({ viewer: true, cmText: '' });
SwapUI(); runTimers();
ok('a viewer that hands over no text is left as it is, not emptied', !viewer.ed.mounted && parsedWith.length === 0, String(viewer.ed.mounted));
ok('...and is revealed, with nothing left pending', reveals >= 1 && jitaParserPending === 0, reveals + ' / ' + jitaParserPending);

// the hide-before-paint observer
const hideSig = src.split('\n').filter((l) => /^    var HIDE_SIG = /.test(l));
if (hideSig.length !== 1) { throw new Error('could not slice HIDE_SIG'); }
(0, eval)(hideSig[0].trim().replace(/^var /, 'global.'));
load('hideLogs', '    ');
scene({ comment: true, viewer: true });
document.getElementById = () => null;
document.querySelectorAll = () => [comment.content, viewer.content];
hideLogs();
ok('the observer never hides a draft in the comment box', !comment.content.classList.contains('jita-log-hiding'), comment.content.className);
ok('...but does hide the log viewer until it is parsed (control)', viewer.content.classList.contains('jita-log-hiding'), viewer.content.className);
document.querySelectorAll = () => [];   // and no parsed table from here on: the igbr poll waits for none

// header-less igbr.zip files
scene({ cb: 'raw outstanding calls' });
parserOn = false;
let flagged = 0;
jitaParserPending = 0;
jitaRunParserWhenLoaded(() => { flagged++; jitaIgbrFile = 'oc'; });
ok('a file click with the parser off leaves nothing pending', timers.length === 0 && flagged === 0 && jitaParserPending === 0, timers.length + ' timers');
jitaIgbrFile = 'oc';
SwapUI();
ok('a file left asked for while the parser was off is dropped by the next pass', jitaIgbrFile === null && !htmlOf[CB], String(jitaIgbrFile));
parserOn = true;
scene({ cb: 'raw dxdiag' });
jitaIgbrFile = 'dx';
SwapUI(); runTimers();
ok('...so the next file opens in its own parser', dxRuns === 1 && htmlOf[CB] !== 'OC' && parsedWith.indexOf('oc') < 0, dxRuns + ' / ' + htmlOf[CB]);
scene({ cb: 'before' });
jitaRunParserWhenLoaded(() => { jitaIgbrFile = 'oc'; });
cbNodes[0].text = 'raw outstanding calls';
runTimers();
ok('a click with the parser on opens the file in the parser it asked for (control)', htmlOf[CB] === 'OC' && parsedWith.join() === 'oc' && jitaIgbrFile === null, htmlOf[CB] + ' / ' + parsedWith.join());
scene({ cb: 'garbled' });
global.convertTextToObject = () => { throw new Error('bad pdm'); };
jitaIgbrFile = 'pdm';
threw = null;
try { SwapUI(); } catch (e) { threw = e; }
ok('a PDM file that cannot be read still reveals the view, with the reason in the box', !threw && reveals >= 1 && /Could not evaluate/.test(textOf['#Requirements'] || ''), threw ? threw.message : textOf['#Requirements']);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Log parser checks passed.'));
process.exit(fail ? 1 : 0);
