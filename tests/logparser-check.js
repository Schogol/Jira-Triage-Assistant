// logparser-check.js - the log parser (v3.38.17; JiTA.logparser since refactor 2). Evals the real module, the panel
// buttons and filter, swap()'s choice of editor and file, the watches start() sets up at load, and the PDM reader against
// fake tables and a small jQuery stand-in:
//  - a line with fewer than four columns no longer throws and leaves the spinner going; a parser that throws ends
//    the spinner with a message; logging errors after an exception are not marked as exceptions; no stray border
//  - the panel buttons recompute the parsed table only: Only Exceptions no longer hides the header or Jira's rows,
//    Show All no longer forces Jira's hidden rows open, a type toggle no longer hides Jira's own .error elements
//  - a log header in the comment box is never parsed or hidden; a viewer that hands over no text is left alone
//  - the header-less igbr.zip file a click opened is taken once, so a click while the parser was off cannot pick
//    the parser for a later file; a click with the parser off leaves nothing pending
//  - Method Calls / Process Health keep their last row; no NaN; numeric comparisons; the PDM reader keeps
//    colons in values and survives a stray brace
//  - the parser keeps its state and its wiring in JiTA.logparser, and starts watching only once the module is there
const fs = require('fs');
const S = require('./source');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

global.SELECTORS = { CODE_BLOCK: "[data-testid='code-block']", CM_LINE: '.cm-line' };
let parserOn = true;
global.flagOn = (name) => (name === 'parser' ? parserOn : false);
let timers = [];
global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
global.clearTimeout = () => {};
const runTimers = () => { while (timers.length) { timers.shift()(); } };
global.JiTA = require('./logstub')({});   // the parser logs through JiTA.log and JiTA.warn
console.log = ((log) => (...a) => { if (a[0] !== '[JiTA] log parser failed:') { log(...a); } })(console.log);
console.warn = () => {};

(0, eval)(S.fn(src, 'convertTextToObject'));   // the PDM reader
eval(S.top(src, 'JiTA.logparser'));             // the parser: its state, its plumbing, the builder and its types
const P = JiTA.logparser;
const HDR = P.HDR;
const realDraw = P.draw;

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
P.buildGroups = () => {};
P.regroup = () => { regroups++; };

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
    j.off = () => j;
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

// ============ the game log ============
mountTable();
let rows = [HDR,
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
try { P.draw('log', rows); } catch (e) { threw = e; }
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
P.run(() => { throw new Error('boom'); });
ok('a parser that throws ends the spinner', loader.style.display === 'none');
ok('...and says so in the table, which is shown', tbody.rows.length === 1 && /could not be parsed \(boom\)/.test(tbody.rows[0].cells[0].innerHTML) && table.style.display === 'table',
    tbody.rows[0] && tbody.rows[0].cells[0].innerHTML);
mountTable();
P.run(() => {});
ok('...a parser that does not throw adds nothing (control)', tbody.rows.length === 0 && loader.style.display === 'block');
mountTable(); timers = [];
route = () => [];
P.draw = () => { throw new Error('late'); };
P.mount('log');
runTimers();
P.draw = realDraw;
ok('a mounted parser runs guarded, so its failure ends the spinner too', loader.style.display === 'none' && tbody.rows.length === 1);

// ============ Method Calls ============
const mcHdr = 'Time\tMethod\tDuration [ms]';
mountTable(); timers = [];
route = (sel) => (sel === '.peakMachoCell' ? [] : null);
rows = [mcHdr, '12:00:00\tfoo\t20', '12:00:01\tbar\t600', '   ', '12:00:02\tbaz\t1600'].join('\r\n') + '\r\n';
threw = null;
try { P.draw('mc', rows); } catch (e) { threw = e; }
ok('Method Calls without a GetTime call parses', !threw, threw && threw.message);
ok('...says n/a for the average and the peak instead of NaN', /: n\/a /.test(htmlOf['#averageMacho'] || '') && /: n\/a /.test(htmlOf['#peakMacho'] || '') && !/NaN/.test(htmlOf['#averageMacho']),
    (htmlOf['#averageMacho'] || '').slice(0, 50));
ok('...keeps its last row and skips the blank one', tbody.rows.length === 3 && tbody.rows[2].cells[1].innerHTML === 'baz', tbody.rows.map((r) => r.cells[1].innerHTML).join());
threw = null;
try { handlers['#peakMacho click'](); } catch (e) { threw = e; }
ok('...and a click on the peak with no peak row does nothing', !threw, threw && threw.message);
mountTable();
rows = [mcHdr, '12:00:00\tmachoNet::GetTime (RemoteServiceCall)\t100', '12:00:01\tmachoNet::GetTime (RemoteServiceCall)\t300', '12:00:02\tfoo\t5'].join('\r\n') + '\r\n';
P.draw('mc', rows);
ok('with GetTime calls the average and the peak are given in ms (control)', /: 200ms /.test(htmlOf['#averageMacho']) && /: 300ms /.test(htmlOf['#peakMacho']), htmlOf['#averageMacho'].slice(0, 50));
ok('...and the last call is listed too', tbody.rows.length === 3 && tbody.rows[2].cells[1].innerHTML === 'foo', tbody.rows.length + ' rows');

// ============ Process Health ============
const phHdr = 'dateTime\tpyDateTime\tprocCpu\tthreadCpu\tpyMem\tvirtualMem\ttaskletsProcessed\ttaskletsQueued\twatchdog time\tspf\tserviceCalls\tcallsFromClient\tbytesReceived\tbytesSent\tpacketsReceived\tpacketsSent\tsessionCount\ttidiFactor';
const ph = (sessions, tidi) => ['12:00:00', '1', '10', '5', '100', '200', '5', '0', '0', '0.016', '1', '1', '100', '100', '1', '1', sessions, tidi].join('\t');
mountTable();
route = () => null;
rows = [phHdr, ph('10', '1.0'), ph('1', '.15'), ph('1', '0.5'), ph('1', '.9'), ph('1', '1.10'), ph('2', '1.0')].join('\r\n') + '\r\n';
P.draw('ph', rows);
const cls = (i, c) => (tbody.rows[i] ? tbody.rows[i].cells[c].className : 'no row');
ok('Process Health keeps its last row', tbody.rows.length === 6, tbody.rows.length + ' rows');
ok('ten sessions is red (as text, "10" sorts below "2")', cls(0, 16) === 'red', cls(0, 16));
ok('...one session is not, two is (control)', cls(1, 16) === '' && cls(5, 16) === 'red');
ok('time dilation .15 is red', cls(1, 17) === 'red', cls(1, 17));
ok('...0.5 is yellow (control)', cls(2, 17) === 'yellow', cls(2, 17));
ok('....9 is fine (as text it compares below "0.2")', cls(3, 17) === '', cls(3, 17));
ok('...1.10 is red and 1.0 is fine (control)', cls(4, 17) === 'red' && cls(0, 17) === '', cls(4, 17) + '/' + cls(0, 17));
ok('the Process Health header the parser is found by is the file\'s', P.PH_HDR === phHdr && P.MC_HDR === mcHdr, JSON.stringify(P.PH_HDR));

// ============ PDM ============
let pdm = null;
threw = null;
try { pdm = convertTextToObject('{System}\n\tTIME: 12:34:56\n\tNAME: rig\n}\n}\nOS: Windows 11\n'); } catch (e) { threw = e; }
ok('a PDM value with colons is read whole', !!pdm && pdm.System && pdm.System.TIME === '12:34:56', pdm && JSON.stringify(pdm.System));
ok('a stray closing brace at the top does not stop the reading', !threw && pdm.OS === 'Windows 11', threw ? threw.message : JSON.stringify(pdm));

// ============ the views ============
const V = { log: P.view('log'), ph: P.view('ph'), mc: P.view('mc'), oc: P.view('oc'), lc: P.view('lc') };
const h1 = (v) => (/<h1>([^<]*)<\/h1>/.exec(v) || [])[1];
ok('every table view has its title, its loader and its hidden table, with the shared CSS and FontAwesome', Object.keys(V).every((k) => /<div id="loader"><\/div>/.test(V[k]) &&
    /<table id="tableContent" style="display:none;" class="fixedHead">/.test(V[k]) && V[k].indexOf(P.CSS) >= 0 && V[k].indexOf(P.FA) >= 0) &&
    JSON.stringify(Object.keys(V).map((k) => h1(V[k]))) === JSON.stringify(['Logfile Parser', 'Process Health', 'Method Calls', 'Outstanding Calls', 'Last Crashes']),
    JSON.stringify(Object.keys(V).map((k) => h1(V[k]))));
ok('...the game log alone has the panel and its own CSS', /id = "jita-group-toggle"/.test(V.log) && /id="jita-log-search"/.test(V.log) && V.log.indexOf(P.TYPES.log.css) >= 0 &&
    /\.notice \{/.test(V.log) && !/\.notice \{/.test(V.ph) && !/id="gpanel"/.test(V.oc));
ok('...Method Calls has its GetTime figures, Last Crashes its crash ids', /id="averageMacho"/.test(V.mc) && /id="peakMacho"/.test(V.mc) && /Crash ID/.test(V.lc) && !/Crash ID/.test(V.oc));
ok('...and the Quick Info boxes hold what their files fill in', /id="Requirements"/.test(P.info('pdm')) && /id="driverAge"/.test(P.info('pdm')) && /id="dxdiag"/.test(P.info('dx')) &&
    /Quick Info:/.test(P.info('dx')) && P.info('dx').indexOf(P.CSS) >= 0 && !/Requirements/.test(P.info('dx')));

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
P.wire();
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

// ============ swap(): which editor, which file ============
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
let comment, viewer, cmText = '', cbNodes = [], reveals = 0, parsedWith = [], dxRuns = 0;
const VIEWS = { log: 'LOG', ph: 'PH', mc: 'MC', oc: 'OC', lc: 'LC' };
P.view = (type) => VIEWS[type];
P.info = (kind) => kind.toUpperCase();
P.cmText = () => cmText;
P.reveal = () => { reveals++; };
P.draw = (type) => { parsedWith.push(type); };   // which table a file is drawn as
global.renderDxdiag = () => { dxRuns++; };
global.renderRequirements = () => {};
const CB = SELECTORS.CODE_BLOCK;
route = (sel) => {
    if (sel === SELECTORS.CM_LINE + ':contains(' + HDR + ')') { return [comment, viewer].filter(Boolean).map((e) => e.line).filter((l) => l.text.indexOf(HDR) >= 0); }
    if (sel === CB) { return cbNodes; }
    return null;
};
function scene(opts) {
    comment = opts.comment ? editor(HDR) : null;
    if (comment) { N('ProseMirror', { contenteditable: 'true' }, [N('code-block-wrap', { contenteditable: 'false' }, [comment.ed])]); }
    viewer = opts.viewer ? editor(HDR) : null;
    if (viewer) { N('media-viewer', {}, [viewer.ed]); }
    cmText = opts.cmText || '';
    cbNodes = opts.cb ? [N('code-block', {}, [], opts.cb)] : [];
    Object.keys(htmlOf).forEach((k) => { delete htmlOf[k]; });
    Object.keys(textOf).forEach((k) => { delete textOf[k]; });
    timers = []; reveals = 0; parsedWith = []; dxRuns = 0; P.pending = 7;
}
const LOG_TEXT = HDR + '\n12:00:00\tnet\tnotice\thi\n';
scene({ comment: true });
P.swap(); runTimers();
ok('a log header typed in the comment box is not parsed', !comment.ed.mounted && parsedWith.length === 0, String(comment.ed.mounted));
scene({ comment: true, viewer: true, cmText: LOG_TEXT });
P.swap(); runTimers();
ok('with a log open as well, the log viewer is parsed and the comment box left alone', viewer.ed.mounted === 'LOG' && !comment.ed.mounted && parsedWith.join() === 'log',
    viewer.ed.mounted + ' / ' + comment.ed.mounted);
ok('...from the text read out of the viewer', P.text === LOG_TEXT, JSON.stringify(P.text));
scene({ viewer: true, cmText: LOG_TEXT });
mountTable();
document.getElementById = (id) => (id === 'tableContent' ? table : id === 'loader' ? loader : null);
P.draw = () => { throw new Error('bad line'); };
threw = null;
try { P.swap(); runTimers(); } catch (e) { threw = e; }
ok('a log in the viewer that fails to parse ends the spinner with the reason', !threw && loader.style.display === 'none' && tbody.rows.length === 1, threw ? threw.message : loader.style.display);
P.draw = (type) => { parsedWith.push(type); };
scene({ viewer: true, cmText: '' });
P.swap(); runTimers();
ok('a viewer that hands over no text is left as it is, not emptied', !viewer.ed.mounted && parsedWith.length === 0, String(viewer.ed.mounted));
ok('...and is revealed, with nothing left pending', reveals >= 1 && P.pending === 0, reveals + ' / ' + P.pending);

// the hide-before-paint observer
scene({ comment: true, viewer: true });
document.getElementById = () => null;
document.querySelectorAll = () => [comment.content, viewer.content];
P.hide();
ok('the observer never hides a draft in the comment box', !comment.content.classList.contains('jita-log-hiding'), comment.content.className);
ok('...but does hide the log viewer until it is parsed (control)', viewer.content.classList.contains('jita-log-hiding'), viewer.content.className);
const samples = ['', 'raw outstanding calls', HDR, 'pre ' + HDR, 'dateTime\tpyDateTime\tprocCpu\tthreadCpu', 'Time\tMethod\tDuration [ms]', 'Time\tFacility\tType', 'dateTime pyDateTime procCpu'];
ok('a file is taken for one with a header row by how its header starts', samples.map((s) => (P.headed(s) ? 1 : 0)).join('') === '00111100', samples.map((s) => (P.headed(s) ? 1 : 0)).join(''));
document.querySelectorAll = () => [];   // and no parsed table from here on: the igbr poll waits for none

// header-less igbr.zip files
scene({ cb: 'raw outstanding calls' });
parserOn = false;
P.pending = 0; P.igbr = null;
P.whenLoaded('oc');
ok('a file click with the parser off leaves nothing pending', timers.length === 0 && P.igbr === null && P.pending === 0, timers.length + ' timers');
P.igbr = 'oc';
P.swap();
ok('a file left asked for while the parser was off is dropped by the next pass', P.igbr === null && !htmlOf[CB], String(P.igbr));
parserOn = true;
scene({ cb: 'raw dxdiag' });
P.igbr = 'dx';
P.swap(); runTimers();
ok('...so the next file opens in its own parser', dxRuns === 1 && htmlOf[CB] !== 'OC' && htmlOf[CB + ' +'] === 'DX' && parsedWith.indexOf('oc') < 0, dxRuns + ' / ' + htmlOf[CB]);
scene({ cb: 'before' });
P.whenLoaded('oc');
cbNodes[0].text = 'raw outstanding calls';
runTimers();
ok('a click with the parser on opens the file in the parser it asked for (control)', htmlOf[CB] === 'OC' && parsedWith.join() === 'oc' && P.igbr === null, htmlOf[CB] + ' / ' + parsedWith.join());
ok('...from the text that loaded', P.text === 'raw outstanding calls', JSON.stringify(P.text));
scene({ cb: 'before' });
P.whenLoaded('lc');
cbNodes[0].text = 'raw last crashes';
runTimers();
ok('Last Crashes opens in its own view, its rows drawn as its own type', htmlOf[CB] === 'LC' && parsedWith.join() === 'lc', htmlOf[CB] + ' / ' + parsedWith.join());
scene({ cb: 'before' });
const genWas = P.gen;
P.whenLoaded('oc');
P.gen++;   // another file entry clicked meanwhile (the capture listener)
cbNodes[0].text = 'fitting.txt text';
runTimers();
ok('a poll another click cancelled opens nothing', !htmlOf[CB] && parsedWith.length === 0 && P.gen === genWas + 2, htmlOf[CB] + ' / ' + P.gen);
scene({ cb: 'before' });
P.whenLoaded('oc');
cbNodes[0].text = HDR + '\n12:00:00\tnet\tnotice\thi';
timers.shift();   // the safety timer; the poll alone from here
let polls = 0;
while (timers.length && polls < 5) { timers.shift()(); polls++; }
ok('...and so does one whose code-block got a file with a header row', !htmlOf[CB] && parsedWith.length === 0 && timers.length === 1, htmlOf[CB] + ' / ' + parsedWith.join());
timers = [];
scene({ cb: 'garbled' });
global.convertTextToObject = () => { throw new Error('bad pdm'); };
P.igbr = 'pdm';
threw = null;
try { P.swap(); } catch (e) { threw = e; }
ok('a PDM file that cannot be read still reveals the view, with the reason in the box', !threw && reveals >= 1 && /Could not evaluate/.test(textOf['#Requirements'] || ''), threw ? threw.message : textOf['#Requirements']);

// ============ start(): the watches set up at load ============
const watches = [];
let listener = null, observer = null, styled = 0;
global.waitForKeyElements = (sel, fn) => { watches.push([sel, fn]); };
global.GM_addStyle = () => { styled++; };
global.window = { MutationObserver: function () {} };
global.MutationObserver = function (fn) { observer = { fn: fn }; this.observe = (node, opts) => { observer.opts = opts; }; };
document.addEventListener = (type, fn, capture) => { listener = { type: type, fn: fn, capture: capture }; };
document.body = {};
const fresh = () => {
    watches.length = 0; listener = null; observer = null; styled = 0;
    eval(S.top(src, 'JiTA.logparser'));   // the real module again, unstubbed
};
global.JITA_NO_JIRA_UI = false;
fresh();
const Q = JiTA.logparser;
let hides = 0, loaded = [];
Q.hide = () => { hides++; };
Q.whenLoaded = (file) => { loaded.push(file); };
Q.start();
const headSels = watches.slice(0, 4).map((w) => w[0]);
ok('start() watches for each header row, the CodeMirror viewer\'s too, and swaps what it finds', JSON.stringify(headSels) === JSON.stringify([CB + ':contains(' + HDR + ')',
    CB + ':contains(' + Q.PH_HDR + ')', CB + ':contains(' + Q.MC_HDR + ')', SELECTORS.CM_LINE + ':contains(' + HDR + ')']) && watches.slice(0, 4).every((w) => w[1] === Q.swap),
    JSON.stringify(headSels));
const fileWatch = watches.slice(4);
ok('...and for each header-less igbr.zip file\'s entry', JSON.stringify(fileWatch.map((w) => w[0])) === JSON.stringify(['outstandingcalls.txt', 'lastcrashes.txt', 'PDMData.txt', 'dxdiag.txt', 'settings.yaml']
    .map((n) => 'span[data-item-title="true"]:contains(' + n + ')')), JSON.stringify(fileWatch.map((w) => w[0])));
const bound = {};
route = (sel) => { const m = /^button:contains\('(.+)'\)$/.exec(sel); if (m) { const b = { attrs: {} }; bound[m[1]] = b; return [b]; } return null; };
fileWatch.forEach((w) => w[1]());
Object.keys(bound).forEach((name) => { bound[name]['onclick.jita'](); });
ok('...whose button opens it as its file', JSON.stringify(loaded) === JSON.stringify(['oc', 'lc', 'pdm', 'dx', 'set']), JSON.stringify(loaded));
const genAt = Q.gen;
const fileBtn = { querySelector: (s) => (s === '[data-item-title]' ? {} : null) }, otherBtn = { querySelector: () => null };
listener.fn({ target: { closest: () => fileBtn } });
const afterFile = Q.gen;
listener.fn({ target: { closest: () => otherBtn } });
listener.fn({ target: { closest: () => null } });
ok('a file entry clicked counts as a click in the capture phase, any other button not', listener.type === 'click' && listener.capture === true && afterFile === genAt + 1 && Q.gen === genAt + 1,
    afterFile + ' / ' + Q.gen);
Q.pending = 0;
observer.fn([{ addedNodes: [] }]);
const onKey = hides;
observer.fn([{ addedNodes: [{}] }]);
const onAdd = hides;
Q.pending = 3;
observer.fn([{ addedNodes: [] }]);
ok('the observer looks when a node was added, or while a header-less file loads, not on a keystroke', onKey === 0 && onAdd === 1 && hides === 2 && styled === 1 &&
    observer.opts.childList && observer.opts.subtree && observer.opts.characterData, onKey + '/' + onAdd + '/' + hides);
global.JITA_NO_JIRA_UI = true;
fresh();
JiTA.logparser.start();
ok('off a Jira page there is no observer and no click listener', !observer && !listener && styled === 0 && watches.length === 9,
    'observer ' + (!!observer) + ', listener ' + (!!listener) + ', ' + watches.length + ' watches (4 header rows + 5 files)');
global.JITA_NO_JIRA_UI = false;

// ============ the parser keeps its state in JiTA.logparser ============
const OLD = ['SwapUI', 'jitaIgbrFile', 'jitaParserGen', 'jitaParserPending', 'LOG_HDR', 'mountParser', 'readCodeBlock', 'getCmDocText', 'jitaRunParse', 'jitaRevealLogs',
    'jitaInEditable', 'jitaWireLogControls', 'jitaApplyLogFilter', 'jitaBuildLogGroups', 'jitaRegroupLog', 'jitaRunParserWhenLoaded', 'parserShell', 'cssLogParser',
    'FA_LINK', 'IGBR_FILES', 'phHtml', 'McHtml', 'ocHtml', 'lcHtml', 'pdmHtml', 'dxdiagHtml', 'hideLogs'];
const left = OLD.filter((n) => new RegExp('\\b' + n + '\\b').test(src)).concat(/^var (rows|css|html)\b/m.test(src) ? ['var rows / css / html'] : []);
ok('no parser global is left: its state, plumbing and views are JiTA.logparser\'s', !left.length && ['text', 'igbr', 'gen', 'pending'].every((k) => k in P), left.join());
const defAt = src.indexOf('\nJiTA.logparser = {'), starts = src.split('\nJiTA.logparser.start();\n').length - 1;
ok('the watches start once, at load, after the module (a file already on the page is swapped at once)', starts === 1 && src.indexOf('\nJiTA.logparser.start();\n') > defAt && defAt > 0,
    starts + ' call(s)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'Log parser checks passed.'));
process.exit(fail ? 1 : 0);
