// logtables-check.js - what each log parser draws, row by row and cell by cell, for a set of made-up files: the game
// log (logs.txt, Group Repeats included, on and off), Method Calls, Outstanding Calls, Last Crashes (the Outstanding
// Calls parser) and Process Health (and its FPS / spf header toggle). Evals the real parsers against a small DOM of its
// own (cells keep innerHTML and textContent apart, as a browser does: text set is escaped, HTML set is not) and a
// jQuery stand-in for the few jQuery calls they make.
//
// Each drawing is compared with tests/logtables.golden.json, written from the parsers as they were before the
// JiTA.logparser module (refactor 2): the module must draw exactly the same. `node logtables-check.js --write` writes the
// file anew from the code as it is now; do that only for a change meant to alter what a parser draws, and say so.
// The rules a reader would look for are checked by name as well, so a failure says what broke.
const fs = require('fs');
const path = require('path');
const S = require('./source');
const src = S.load();
const GOLDEN = path.join(__dirname, 'logtables.golden.json');
const WRITE = process.argv.indexOf('--write') >= 0;

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a small DOM ----
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENT[m]);
function El(tag) {
    const el = { tagName: String(tag).toUpperCase(), className: '', style: {}, attrs: {}, kids: [], _html: '', parentNode: null, title: '' };
    Object.defineProperty(el, 'innerHTML', { get: () => el.kids.map((k) => '<' + k.tagName.toLowerCase() + ' class="' + k.className + '">' + k.innerHTML + '</' + k.tagName.toLowerCase() + '>').join('') + el._html,
        set: (v) => { el._html = String(v); el.kids = []; } });
    Object.defineProperty(el, 'textContent', { get: () => el.kids.map((k) => k.textContent).join('') + unesc(el._html), set: (v) => { el._html = esc(v); el.kids = []; } });
    Object.defineProperty(el, 'firstChild', { get: () => el.kids[0] || null });
    el.insertBefore = (node, ref) => { node.parentNode = el; const i = ref ? el.kids.indexOf(ref) : -1; if (i < 0) { el.kids.push(node); } else { el.kids.splice(i, 0, node); } return node; };
    el.removeChild = (node) => { el.kids = el.kids.filter((k) => k !== node); node.parentNode = null; return node; };
    el.scrollIntoView = () => { el.scrolled = true; };
    el.getAttribute = (k) => (Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null);
    el.setAttribute = (k, v) => { el.attrs[k] = String(v); };
    el.classList = {
        contains: (c) => (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0,
        add: (c) => { if (!el.classList.contains(c)) { el.className = (el.className + ' ' + c).trim(); } },
        remove: (c) => { el.className = el.className.split(' ').filter((x) => x && x !== c).join(' '); }
    };
    if (el.tagName === 'TR') {
        el.cells = [];
        el.insertCell = (i) => { const c = El('td'); c.parentNode = el; el.cells.splice(i < 0 ? el.cells.length : i, 0, c); return c; };
    }
    return el;
}
let tbody, table, loader, groupBtn, ths, side;
function mount(columns) {
    tbody = El('tbody');
    tbody.rows = [];
    tbody.appendChild = (r) => { r.parentNode = tbody; tbody.rows.push(r); return r; };
    tbody.querySelectorAll = (sel) => {
        const cls = /^\.([\w-]+)$/.exec(sel)[1], out = [];
        tbody.rows.forEach((r) => r.cells.forEach((c) => c.kids.forEach((k) => { if (k.classList.contains(cls)) { out.push(k); } })));
        return out;
    };
    table = El('table');
    table.tBodies = [tbody];
    table.style.display = 'none';
    loader = El('div');
    loader.style.display = 'block';
    groupBtn = El('a');
    ths = [];
    for (let i = 0; i < columns; i++) { ths.push(El('th')); }
    side = {};
}
global.document = {
    getElementById: (id) => ({ tableContent: table, loader: loader, 'jita-group-toggle': groupBtn }[id] || null),
    createElement: (tag) => El(tag),
    querySelector: (sel) => (sel === '#tableContent tbody' ? tbody : null),
    querySelectorAll: () => []
};
// ---- the jQuery calls the parsers make ----
const handlers = {};
function J(list, sel) {
    const j = list.slice();
    j.html = (v) => {
        if (v === undefined) { return list[0] ? list[0].innerHTML : undefined; }
        list.forEach((e) => { e.innerHTML = v; });
        return j;
    };
    j.text = (v) => {
        if (v === undefined) { return list.map((e) => e.textContent).join(''); }
        list.forEach((e) => { e.textContent = v; });
        return j;
    };
    j.on = (ev, f) => { handlers[sel + ' ' + ev] = f; return j; };
    j.each = (f) => { list.forEach((e, i) => f.call(e, i, e)); return j; };
    j.removeClass = (c) => { list.forEach((e) => e.classList.remove(c)); return j; };
    return j;
}
global.$ = (sel) => {
    if (typeof sel !== 'string') { return J([sel], '(node)'); }
    if (sel === '#averageMacho' || sel === '#peakMacho') { return J([side[sel] || (side[sel] = El('div'))], sel); }
    if (sel === '.peakMachoCell') { return J(tbody.rows.filter((r) => r.classList.contains('peakMachoCell')), sel); }
    let m = /^#tableContent > thead > tr > th:nth-child\((\d+)\)$/.exec(sel);
    if (m) { return J(ths[m[1] - 1] ? [ths[m[1] - 1]] : [], sel); }
    m = /^#tableContent > tbody > tr > td:nth-child\((\d+)\)$/.exec(sel);
    if (m) { return J(tbody.rows.map((r) => r.cells[m[1] - 1]).filter(Boolean), sel); }
    throw new Error('the stand-in has no ' + sel);
};
global.JiTA = require('./logstub')({});   // no logsig: the known-exception pass is logsig-check's
global.rows = '';

// ---- the parsers as the script has them ----
// The parser module: its table builder and types, and Group Repeats, which the game log runs once drawn.
eval(S.top(src, 'JiTA.logparser'));
const draw = (type) => () => JiTA.logparser.draw(type, rows);
const PARSERS = { log: draw('log'), mc: draw('mc'), oc: draw('oc'), lc: draw('lc'), ph: draw('ph') };

// What a drawing is: every row (its class, whether it is hidden, its grouping marks) and every cell (its HTML, its class,
// a badge in it), the loader and the table, and the side lines (Method Calls' average and peak, the headers).
const drawn = () => ({
    loader: loader.style.display, table: table.style.display,
    rows: tbody.rows.map((r) => {
        const o = { c: r.className, cells: r.cells.map((c) => (c.className ? [c.innerHTML, c.className] : c.innerHTML)) };
        if (r.style.display) { o.hidden = r.style.display; }
        if (Object.keys(r.attrs).length) { o.a = r.attrs; }
        const badge = r.cells.map((c) => c.kids.map((k) => k.title).join('')).join('');
        if (badge) { o.badge = badge; }
        return o;
    }),
    side: Object.keys(side).sort().reduce((o, k) => { o[k] = side[k].innerHTML; return o; }, {}),
    heads: ths.reduce((o, t, i) => { if (t.innerHTML) { o[i] = t.innerHTML; } return o; }, {})
});
function run(kind, text, opts) {
    opts = opts || {};
    mount(kind === 'ph' ? 18 : 4);
    if (opts.groupOff) { groupBtn.className = 'toggle'; }
    if (kind === 'ph') { ths[9].innerHTML = 'FPS <i class="fa-regular fa-circle-question" title="Frames per second"></i>'; }
    rows = text;
    PARSERS[kind]();
    const out = { first: drawn() };
    if (opts.clicks) {
        out.clicks = [];
        for (let i = 0; i < opts.clicks; i++) { handlers[opts.clickOn + ' click'].call(ths[9]); out.clicks.push(drawn()); }
    }
    if (opts.peakClick) { handlers['#peakMacho click'](); out.scrolledTo = tbody.rows.map((r, i) => (r.scrolled ? i : -1)).filter((i) => i >= 0); }
    return out;
}

// ---- the files (made up; real players' logs are never committed) ----
const lines = (a) => a.join('\r\n') + '\r\n';
const LOG = lines([
    'Time\tFacility\tType\tMessage',
    '10:00:00\tGeneral\tnotice\tClient starting',
    '10:00:01\tnet\tinfo\tconnected to <proxy> & ready',
    '10:00:02\tnet\tnotice\tping',
    '10:00:03\tnet\tnotice\tping',
    '10:00:04\tnet\tnotice\tping',
    '10:00:05\tui\twarning\tslow frame',
    '10:00:06\tui\terror\tEXCEPTION #1 logged at 03/12/2026 10:00:06 : KeyError: 2',
    '10:00:06\tui\terror\tFormatted exception info: KeyError: 2',
    '10:00:06\tui\terror\t/build/eve/a/x.py(10) one',
    '10:00:06\tui\terror\tEXCEPTION END',
    '10:00:06\tui\terror\t',
    '10:00:07\tui\terror\tEXCEPTION #2 logged at 03/12/2026 10:00:07 : KeyError: 2',
    '10:00:07\tui\terror\tFormatted exception info: KeyError: 2',
    '10:00:07\tui\terror\t/build/eve/a/x.py(10) one',
    '10:00:07\tui\terror\tEXCEPTION END',
    '10:00:07\tui\terror\t',
    '***a logging error***',
    '10:00:08\tnet\tnotice\tping',
    '10:00:09\tcore\terror\tSTACKTRACE #3 logged at 03/12/2026 10:00:09 : Lock held too long',
    '10:00:09\tcore\terror\tTraced at:',
    '10:00:09\tcore\terror\tSTACKTRACE END',
    '10:00:10\tcore\tinfo\tafter the stacktrace',
    '10:00:11\tui\terror\tEXCEPTION #4 logged at 03/12/2026 10:00:11 : ValueError: bad',
    '10:00:11\tui\terror\tCaught at:',
    '10:00:12\tui\twarning\ta block cut off by the next second',
    '10:00:13\t\twarning\tfacility is empty',
    'a line with no tabs at all',
    '10:00:14\tnet\tinfo\tkey\tvalue',
    '',
    '',
    '10:00:15\tnet\tunknowntype\tthe last line'
]);
const MC = lines([
    'Time\tMethod\tDuration [ms]',
    '12:00:00\tmachoNet::GetTime (RemoteServiceCall)\t100',
    '12:00:01\tfoo::Bar\t20',
    '12:00:02\tbaz::Slow\t500',
    '12:00:03\tbaz::Slower\t1499',
    '12:00:04\tbaz::Slowest\t1500',
    '12:00:05\tmachoNet::GetTime (RemoteServiceCall)\t300',
    '   ',
    '12:00:06\tmachoNet::GetTime (RemoteServiceCall)\t300',
    '12:00:07\tq::<lambda>\t7',
    '12:00:08\tmachoNet::GetTime (RemoteServiceCall)\t50'
]);
const MC_NONE = lines(['Time\tMethod\tDuration [ms]', '12:00:00\tfoo\t20', '12:00:01\tbar\t600']);
const OC = lines([
    '2026-11-21 12:00:00 - machoNet::Call (RemoteServiceCall)',
    '2026-11-21 12:00:01 - inventory::<GetItems>',
    'a line without a dash',
    '2026-11-21 12:00:02 - a - b - c',
    '',
    '2026-11-21 12:00:03 - after the empty line'
]);
const LC = lines(['2026-11-20 09:15:00 - 3f2a9c1e-0000-4000-8000-000000000001', '2026-11-21 10:30:00 - 3f2a9c1e-0000-4000-8000-000000000002']);
const PH_HDR = 'dateTime\tpyDateTime\tprocCpu\tthreadCpu\tpyMem\tvirtualMem\ttaskletsProcessed\ttaskletsQueued\twatchdog time\tspf\tserviceCalls\tcallsFromClient\tbytesReceived\tbytesSent\tpacketsReceived\tpacketsSent\tsessionCount\ttidiFactor';
const ph = (spf, sessions, tidi, cpu) => ['12:00:00', '1700000000.5', cpu || '10.4', '5.6', '100.5', '2048.49', '5', '0', '0.25', spf, '12', '3', '1000', '900', '10', '9', sessions, tidi].join('\t');
const PH = lines([PH_HDR, ph('0.016', '1', '1.0'), ph('0.0333333333333333', '1', '.15', '99.5'), ph('0.0666666666666667', '1', '0.5'), ph('0.05', '10', '.9'),
    ph('0.02', '2', '1.10'), ph('0.1', '1', '0.2'), ph('0.0125', '1', '0.8'), ph('0.0125', '1', '1.05'), '', ph('0.0125', '1', '1')]);

const CASES = {
    'game log': () => run('log', LOG),
    'game log, Group Repeats off': () => run('log', LOG, { groupOff: true }),
    'game log, header only': () => run('log', lines(['Time\tFacility\tType\tMessage'])),
    'Method Calls': () => run('mc', MC, { peakClick: true }),
    'Method Calls without GetTime': () => run('mc', MC_NONE, { peakClick: true }),
    'Outstanding Calls': () => run('oc', OC),
    'Last Crashes': () => run('lc', LC),
    'Process Health, and the FPS / spf toggle': () => run('ph', PH, { clicks: 2, clickOn: '#tableContent > thead > tr > th:nth-child(10)' })
};
const got = {};
Object.keys(CASES).forEach((k) => { got[k] = CASES[k](); });

// ---- the rules, by name ----
// A cell's text as a reader sees it (a Group Repeats badge aside; the last column keeps the line's \r, which a browser
// shows as nothing), its class.
const txt = (c) => (Array.isArray(c) ? c[0] : c).replace(/^<span class="jita-rep-badge">[^<]*<\/span>/, '').replace(/\r+$/, ''), clsOf = (c) => (Array.isArray(c) ? c[1] : '');
const cellsOf = (r) => r.cells.map(txt);
const L = got['game log'].first;
const msgRow = (d, re) => d.rows.filter((r) => re.test(cellsOf(r)[3] || ''))[0];
const grp = (r) => r.a && r.a['data-jita-grp'];
ok('the game log: every line a row, the header and the empty lines left out, the spinner ended', L.rows.length === 29 && L.loader === 'none' && L.table === 'table', L.rows.length + ' rows');
ok('...a row takes its type\'s class, any other type is info', msgRow(L, /^Client starting/).c === 'notice' && msgRow(L, /^slow frame/).c === 'warning' &&
    msgRow(L, /^the last line/).c === 'info' && cellsOf(msgRow(L, /^the last line/))[2] === 'unknowntype', msgRow(L, /^the last line/).c);
ok('...text is shown as written, < and & included', cellsOf(msgRow(L, /proxy/))[3] === 'connected to &lt;proxy> & ready', cellsOf(msgRow(L, /proxy/))[3]);
ok('...an exception block is marked, with a border above and below', msgRow(L, /^EXCEPTION #1/).c === 'error bordertop exception' &&
    msgRow(L, /^Formatted exception info: KeyError/).c === 'error exception' && L.rows[9].c === 'error exception borderbot', L.rows[9].c);
ok('...and so is a stacktrace, though its rows are not marked as an exception', msgRow(L, /^STACKTRACE #3/).c === 'error bordertop' && msgRow(L, /^STACKTRACE END/).c === 'error borderbot');
ok('...a block cut off by the next second closes there', msgRow(L, /cut off by the next second/).c === 'warning bordertop');
ok('...a logging error is one row of its own, with no time', cellsOf(L.rows[16]).join('|') === '|||Logging error occurred', cellsOf(L.rows[16]).join('|'));
ok('...a line short of columns keeps its time and its text, a line with no tabs its whole text', cellsOf(msgRow(L, /facility is empty/)).join('|') === '10:00:13|||warning facility is empty' &&
    cellsOf(msgRow(L, /no tabs at all/)).join('|') === '|||a line with no tabs at all');
ok('...a message with a tab of its own keeps it', cellsOf(msgRow(L, /^key/))[3] === 'key\tvalue');
ok('Group Repeats: three pings in a row become one with a 3x badge, the others hidden', L.rows[2].badge === '3 identical in a row · 10:00:02 → 10:00:04' &&
    L.rows[3].hidden === 'none' && L.rows[4].hidden === 'none' && !L.rows[2].hidden, JSON.stringify(L.rows.slice(2, 5)));
ok('...a repeated exception block is one with a 2x badge, the blank line after it inside it', /^2 identical in a row/.test(msgRow(L, /^EXCEPTION #1/).badge || '') &&
    grp(L.rows[10]) === grp(L.rows[6]) && L.rows.slice(11, 16).every((r) => r.hidden === 'none') && !L.rows[10].hidden, JSON.stringify(L.rows.slice(10, 16).map((r) => r.hidden)));
ok('...the same line further on, after other lines, is not grouped with them', !msgRow(L, /^ping/) || !L.rows[17].hidden && !L.rows[17].badge);
const off = got['game log, Group Repeats off'].first;
ok('...switched off, nothing is hidden or badged, the rows keep their grouping marks', off.rows.every((r) => !r.hidden && !r.badge) && off.rows.every((r) => grp(r) != null));
ok('...a file with its header alone draws an empty table, the spinner ended', got['game log, header only'].first.rows.length === 0 && got['game log, header only'].first.loader === 'none');
const M = got['Method Calls'].first;
const mrow = (re) => M.rows.filter((r) => re.test(cellsOf(r)[1]))[0];
ok('Method Calls: every call a row, the header and the blank line left out', M.rows.length === 9, M.rows.length + ' rows');
ok('...500 ms and over is yellow, 1500 and over red, under 500 a plain row', mrow(/^baz::Slow$/).c === 'yellow' && mrow(/Slower/).c === 'yellow' && mrow(/Slowest/).c === 'red' && mrow(/^foo/).c === 'row');
ok('...the average and the peak GetTime in ms', /Average machoNet::GetTime duration: 188ms /.test(M.side['#averageMacho']) && /Peak machoNet::GetTime duration: 300ms /.test(M.side['#peakMacho']),
    M.side['#averageMacho'].slice(0, 60));
const peaks = M.rows.map((r, i) => (/peakMachoCell/.test(r.c) ? i : -1)).filter((i) => i >= 0);
ok('...the last of the peak calls is marked, and a click on the peak scrolls to it', peaks.join() === '6' && cellsOf(M.rows[6])[0] === '12:00:06' && JSON.stringify(got['Method Calls'].scrolledTo) === '[6]',
    peaks.join() + ' / ' + JSON.stringify(got['Method Calls'].scrolledTo));
const MN = got['Method Calls without GetTime'];
ok('...without a GetTime call, n/a for both, and the click scrolls nowhere', /: n\/a /.test(MN.first.side['#averageMacho']) && /: n\/a /.test(MN.first.side['#peakMacho']) && MN.scrolledTo.length === 0);
const O = got['Outstanding Calls'].first;
ok('Outstanding Calls: a row per line, the time and the method either side of " - "', O.rows.length === 5 && cellsOf(O.rows[0]).join('|') === '2026-11-21 12:00:00|machoNet::Call (RemoteServiceCall)' &&
    cellsOf(O.rows[1])[1] === 'inventory::&lt;GetItems>', O.rows.length + ' rows');
ok('Last Crashes: a row per crash, its time and its id', got['Last Crashes'].first.rows.length === 2 &&
    cellsOf(got['Last Crashes'].first.rows[1]).join('|') === '2026-11-21 10:30:00|3f2a9c1e-0000-4000-8000-000000000002');
const P = got['Process Health, and the FPS / spf toggle'];
const pc = (i, c) => txt(P.first.rows[i].cells[c]), pk = (i, c) => clsOf(P.first.rows[i].cells[c]);
ok('Process Health: every sample a row, the header and the blank line left out', P.first.rows.length === 9, P.first.rows.length + ' rows');
ok('...the CPU and memory columns rounded', pc(0, 2) === '10' && pc(1, 2) === '100' && pc(0, 3) === '6' && pc(0, 4) === '101' && pc(0, 5) === '2048', [pc(0, 2), pc(1, 2), pc(0, 3), pc(0, 4), pc(0, 5)].join());
ok('...the frame time shown as frames a second: red at 15 or less, yellow at 30 or less', pc(0, 9) === '62.5' && pk(0, 9) === '' && pc(2, 9) === '15' && pk(2, 9) === 'red' &&
    pk(5, 9) === 'red' && pc(1, 9) === '30' && pk(1, 9) === 'yellow' && pk(3, 9) === 'yellow' && pk(4, 9) === '', [0, 1, 2, 3, 4, 5].map((i) => pc(i, 9) + ':' + pk(i, 9)).join());
ok('...two sessions or more red', pk(3, 16) === 'red' && pk(4, 16) === 'red' && pk(0, 16) === '' && pc(3, 16) === '10');
ok('...time dilation red at 0.2 or less and at 1.05 or more, yellow at 0.8 or less', pk(1, 17) === 'red' && pk(5, 17) === 'red' && pk(7, 17) === 'red' && pk(4, 17) === 'red' &&
    pk(2, 17) === 'yellow' && pk(6, 17) === 'yellow' && pk(3, 17) === '' && pk(0, 17) === '' && pk(8, 17) === '', [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => pc(i, 17) + ':' + pk(i, 17)).join());
const t1 = P.clicks[0], t2 = P.clicks[1];
ok('...a click on the FPS header shows seconds a frame, and the header says spf', /^FPS /.test(P.first.heads[9]) && /^spf /.test(t1.heads[9]) && txt(t1.rows[0].cells[9]) === '0.016',
    t1.heads[9] + ' / ' + JSON.stringify(t1.rows[0].cells[9]));
ok('...and a second click frames a second again', /^FPS /.test(t2.heads[9]) && txt(t2.rows[0].cells[9]) === '62.5', t2.heads[9] + ' / ' + JSON.stringify(t2.rows[0].cells[9]));
// One builder draws every file (refactor 2): no parser of its own is left, and swap() mounts each file as its type, Last
// Crashes as its own, whose rows read as Outstanding Calls' do.
const swap = S.member(src, 'JiTA.logparser', 'swap');
const MOUNTS = ["P.mount('log')", "P.mount('ph')", "P.mount('mc')", "(igbr === 'oc' || igbr === 'lc') && flagOn('parser')) { P.mount(igbr); }"];
const offMount = MOUNTS.filter((m) => swap.indexOf(m) < 0);
ok('every file is drawn by the one table builder, as its type', !/\nfunction (Parse(Mc|Oc|Ph)?Logs|prepLogRows|finishParserView)\(/.test(src) && !offMount.length &&
    ['log', 'mc', 'oc', 'lc', 'ph'].every((k) => typeof JiTA.logparser.TYPES[k].row === 'function') && /P\.run\(function \(\) \{ P\.draw\('log', P\.text\); \}\)/.test(swap),
    offMount.join());
// Kept as they were, in the saved drawings rather than by name: a method holding " - " is cut at it, a line without
// one shows "undefined" as its method, a stacktrace's rows are not grouped as one block, an exception block cut off by
// the next second runs on to the next END for Group Repeats, and the last column keeps the line's \r.

// ---- the drawings, against the ones saved before the module ----
if (WRITE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1) + '\n');
    console.log('\nwrote ' + path.basename(GOLDEN) + ' (' + Object.keys(got).length + ' drawings)');
} else {
    const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    Object.keys(CASES).forEach((k) => {
        const a = JSON.stringify(got[k]), b = JSON.stringify(want[k]);
        let at = 0;
        while (at < a.length && a[at] === b[at]) { at++; }
        ok('drawn as before: ' + k, a === b, b === undefined ? 'not in the saved drawings' : 'first difference at ' + at + ': now ' + a.slice(at, at + 80) + ' / was ' + String(b).slice(at, at + 80));
    });
    ok('...and nothing saved that is no longer drawn', Object.keys(want).every((k) => k in CASES), Object.keys(want).filter((k) => !(k in CASES)).join());
}

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'log table checks passed.'));
process.exit(fail ? 1 : 0);
