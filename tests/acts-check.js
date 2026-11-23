// acts-check.js - Player actions (JiTA.acts, v3.55.0): what the player did, read out of logs.txt and methodcalls.txt in a
// report's igbr.zip. Evals the real module against a made-up logs.txt and methodcalls.txt holding every shape the client
// writes (no real player's log is in the repo):
//  - reading the files: logs.txt's header and lines with no time skipped, midnight counted; one methodcalls row a call
//    (the RemoteServiceCall row of a service call, the object call row), rows sorted by when the call started
//  - dates: the line that dates logs.txt (the network's start, the client's start, an exception's "logged at" only when
//    the day is told from the month), else methodcalls.txt; neither: times only
//  - the actions: start, character selection, logging in (one row), docking and undocking (stations and structures),
//    warps paired with their landings (a replaced warp, one with no landing, a landing with no start), stargate,
//    wormhole and jump-bridge jumps (a request in the same second as the jump), idle time, logoff, what the game refused,
//    errors, contracts, a ship change, the bug report window once; nothing read out of an exception or stacktrace block
//  - folding a run of the same row, the mark where methodcalls.txt starts, the text Copy hands out, the HTML (escaped),
//    which igbr.zip is read when a report has several
//  - a row's lines (v3.57.0): kept whole with their file, lines that read the same counted; the hover card (each line by
//    its parts, at most TIP_LINES, escaped); the chooser of a row read from both files; finding a line in the log parser's
//    view (seek: its count, what JiTA adds to a cell left out, the fallbacks, waiting for the right view)
// The entry in the viewer's file list, the list in its pane, the hover card and a row opened at its line run in a real
// browser in layout-check.js.
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

global.JiTA = { util: {}, settingsview: eval(S.members(src, 'JiTA.settingsview', ['esc'])) };
global.flagOn = () => true;
global.$ = { trim: (s) => String(s).trim() };
eval(S.top(src, 'JiTA.acts'));
const A = JiTA.acts;

// ---- the made-up files ----
const BS = String.fromCharCode(92);
const SESSION = '<Session: (sid:7213576344461374491, clientID:0, mutating:0, contextOnly:False, locationid:30002734, userid:16009963, languageID:EN)>';
const L = (time, fac, type, msg) => [time, fac, type, msg].join('\t');
const LOGS = [
    'Time\tFacility\tType\tMessage',
    L('23:58:50', '::General', 'notice', 'EVE Client version 24.02 build 3724492 started 11/21/2026 23:58:50'),
    L('23:58:50', '::General', 'warning', 'EVE Client version 24.02 build 3724492 started 11/21/2026 23:58:50'),
    L('23:58:50', '::General', 'error', 'EVE Client version 24.02 build 3724492 started 11/21/2026 23:58:50'),
    'a line with no time at all',
    L('23:59:05', 'svc::gameui', 'notice', 'GameUI::OnSessionChanged, Heading for character selection True ' + SESSION + " {'userid': (None, 16009963)}"),
    L('23:59:20', 'svc::gameui', 'notice', 'GameUI::OnSessionChanged, Heading for station True ' + SESSION +
        " {'charid': (None, 90000001), 'stationid': (None, 60011851), 'locationid': (None, 60011851), 'solarsystemid2': (None, 30002734)}"),
    L('00:00:10', 'svc::gameui', 'notice', "GameUI::OnSessionChanged:{'stationid': (60011851, None), 'locationid': (60011851, 30002734), 'solarsystemid': (None, 30002734)} - Activating space view without a ego ball properly inserted into a proper ballpark."),
    L('00:00:41', 'svc::space', 'notice', 'StopWarpIndication Destination: Fricoure IX - Asteroid Belt 1<br> autopilot = 0'),
    L('00:01:30', 'svc::space', 'notice', 'StopWarpIndication Destination: Vittenyn<br> autopilot = 1'),
    L('00:01:35', 'svc::gatejump', 'notice', 'Stargate Jump from 30002734 to 50001398'),
    L('00:01:40', 'svc::gameui', 'notice', 'GameUI::OnSessionChanged, Heading for inflight with a valid ego True ' + SESSION +
        " {'solarsystemid2': (30002734, 30002731), 'solarsystemid': (30002734, 30002731), 'locationid': (30002734, 30002731)}"),
    L('00:02:00', 'client::general', 'warning', "EXCEPTION #1 logged at 22/11/26 00:02:00 : Unhandled exception in <TaskletExt object at 0x29fbfed9de8, abps=1001, ctxt='<NO CONTEXT>'>"),
    L('00:02:00', 'client::general', 'warning', ' '),
    L('00:02:00', 'client::general', 'warning', "Formatted exception info: UserError: User error, msg=TargetTooFar, dict={'distance': 5000}"),
    L('00:02:00', 'client::general', 'warning', 'Thread Locals:  session was ' + SESSION),
    L('00:02:00', 'client::general', 'warning', 'EXCEPTION END'),
    L('00:02:01', 'client::general', 'warning', 'EXCEPTION #2 logged at 22/11/26 00:02:01 : Unhandled exception in <TaskletExt>'),
    L('00:02:01', 'client::general', 'warning', "Formatted exception info: UserError: User error, msg=TargetTooFar, dict={'distance': 6000}"),
    L('00:02:01', 'client::general', 'warning', 'EXCEPTION END'),
    L('00:02:30', 'client::general', 'warning', 'STACKTRACE #1 logged at 22/11/26 00:02:30 : something logged its stack'),
    L('00:02:30', 'client::general', 'warning', 'GameUI::OnSessionChanged, Heading for station True ' + SESSION + " {'stationid': (None, 60000001)}"),
    L('00:02:30', 'client::general', 'warning', 'STACKTRACE END'),
    L('00:03:00', '::General', 'notice', 'Wormhole Jump from 30002731 to 9002322859000261117'),
    L('00:03:06', 'svc::gameui', 'notice', 'GameUI::OnSessionChanged, Heading for inflight with a valid ego True ' + SESSION +
        " {'solarsystemid2': (30002731, 31001307), 'solarsystemid': (30002731, 31001307), 'regionid': (10000032, 11000014), 'locationid': (30002731, 31001307)}"),
    L('00:03:30', 'svc::space', 'notice', 'StopWarpIndication  autopilot = 0'),
    L('00:04:00', 'svc::gameui', 'notice', 'I am now AFK after being idle for 300.5 seconds.'),
    L('00:09:00', 'svc::gameui', 'notice', 'I am no longer AFK after being idle for 600.2 seconds.'),
    L('00:10:00', 'client::general', 'warning', 'EXCEPTION #3 logged at 22/11/26 00:10:00 : Unhandled exception in <TaskletExt>'),
    L('00:10:00', 'client::general', 'warning', "Formatted exception info: AttributeError: 'NoneType' object has no attribute 'get'"),
    L('00:10:00', 'client::general', 'warning', 'EXCEPTION END'),
    L('00:11:00', '::General', 'notice', 'Docking 60010924'),
    L('00:11:07', 'svc::gameui', 'notice', 'GameUI::OnSessionChanged, Heading for station True ' + SESSION + " {'stationid': (None, 60010924), 'locationid': (31001307, 60010924), 'solarsystemid': (31001307, None)}"),
    L('00:12:00', 'svc::contracts', 'notice', "CreateContract, contractInfo =  ContractStruct: {'assignedToID': 2124488915, 'price': 1500000, 'title': ''}"),
    L('00:12:30', 'svc::gameui', 'notice', '_HandleSessionChangeInStructure:  Postponing ego assignment to 1039339381281 until ballpark is ready'),
    L('00:13:00', 'svc::gameui', 'notice', 'GameUI::OnSessionChanged, Heading for inflight True ' + SESSION + " {'structureid': (1039339381281L, None)}"),
    L('00:13:30', 'svc::gameui', 'notice', 'Changing ego: 1044855653047 -> 1048435843315'),
    L('00:14:00', 'svc::gameui', 'notice', 'GameUI::OnSessionChanged, Heading for inflight with a valid ego True ' + SESSION + " {'solarsystemid2': (31001307, 30000298), 'locationid': (31001307, 30000298)}"),
    L('00:14:20', 'svc::space', 'notice', 'StopWarpIndication Destination: <img src=x onerror=alert(1)><br> autopilot = 0'),
    L('00:15:00', 'svc::gameui', 'notice', 'Logging out character Someone'),
    L('00:15:30', 'svc::bugReporting', 'notice', 'Opening bug reporting  '),
    L('00:15:30', 'svc::bugReporting', 'notice', 'Opening bug reporting  Someone')
].join('\r\n');
const M = (time, method, ms) => ['2026.11.22 ' + time, method, ms].join('\t');
const OBJ = (m) => 'Remote Object Call::' + m + ' (ObjectCall' + BS + 'Client)';
const SVC = (m) => m + ' (ServiceCall' + BS + 'Client)';
const REM = (m) => m + ' (RemoteServiceCall)';
const MC = [
    'Time\tMethod\tDuration [ms]',
    M('00:00:15', 'objectCaching::GetCachableObject', 99),
    M('00:00:15', OBJ('ConeScan'), 109),
    M('00:00:17', OBJ('ConeScan'), 120),
    M('00:00:20', OBJ('CmdWarpToStuff'), 124),
    M('00:00:50', OBJ('CmdWarpToStuff'), 130),
    M('00:00:55', OBJ('CmdWarpToStuff'), 128),
    M('00:01:35', OBJ('CmdStargateJump'), 159),
    M('00:05:00', OBJ('Activate'), 90),
    M('00:05:02', OBJ('AddTarget'), 90),
    M('00:12:10', SVC('contractProxy::AcceptContract'), 251),
    M('00:12:10', SVC('contractProxy::AcceptContract'), 251),
    M('00:12:10', REM('contractProxy::AcceptContract'), 251),
    M('00:05:30', OBJ('Deactivate'), 3000),
    M('00:13:55', REM('structureJumpBridgeMgr::CmdJumpThroughStructureStargate'), 300),
    M('00:14:40', OBJ('CmdStargateJump'), 150),
    M('00:15:10', OBJ('CmdWarpToStuff'), 120),
    M('00:15:40', REM('machoNet::GetTime'), 50)
].join('\n');

// ---- reading the files ----
const lines = A._logLines(LOGS);
ok('logs.txt: the header and a line with no time are skipped', lines.length === LOGS.split('\r\n').length - 2, lines.length + ' entries');
ok('logs.txt: a line after midnight counts as the next day', lines[0].d === 0 && lines[lines.length - 1].d === 1, lines[0].d + ' / ' + lines[lines.length - 1].d);
const calls = A._calls(MC);
ok('methodcalls.txt: one row a call, the RemoteServiceCall row and the object call row, no other', calls.length === 14 && calls.filter((c) => c.name === 'contractProxy::AcceptContract').length === 1 &&
    !calls.some((c) => /objectCaching/.test(c.name)), calls.map((c) => c.name).join(', '));
ok('methodcalls.txt: an object call is named by its method', calls[0].name === 'ConeScan' && calls.some((c) => c.name === 'structureJumpBridgeMgr::CmdJumpThroughStructureStargate'), calls[0].name);
ok('methodcalls.txt: rows are sorted by when the call started (a long call is written after later ones)',
    calls.every((c, i) => !i || calls[i - 1].t <= c.t) && calls.findIndex((c) => c.name === 'Deactivate') < calls.findIndex((c) => c.name === 'contractProxy::AcceptContract'), '');

// ---- dates ----
const D = (s) => JSON.stringify(A._dateOf(s));
ok('a date: the network\'s start', D(' I will accept connections at 2026.11.21 14:39:38') === JSON.stringify({ y: 2026, mo: 11, d: 21, tod: 52778 }), D(' I will accept connections at 2026.11.21 14:39:38'));
ok('a date: the client\'s start writes the month first', D('EVE Client version 24.02 build 1 started 05/06/2026 10:00:00') === JSON.stringify({ y: 2026, mo: 5, d: 6, tod: 36000 }), '');
ok('a date: an exception\'s "logged at" as the PC writes it, day first (21/11/26)', D('EXCEPTION #1 logged at 21/11/26 14:39:27 : x') === JSON.stringify({ y: 2026, mo: 11, d: 21, tod: 52767 }), D('EXCEPTION #1 logged at 21/11/26 14:39:27 : x'));
ok('a date: ...or month first (11/17/2026)', D('EXCEPTION #32 logged at 11/17/2026 17:32:44 : x') === JSON.stringify({ y: 2026, mo: 11, d: 17, tod: 63164 }), '');
ok('a date: an exception\'s date that could be either (05/06/2026) dates nothing', A._dateOf('EXCEPTION #1 logged at 05/06/2026 10:00:00 : x') === null, '');

ok('a log line just after midnight dated just before it is on the next day', A._base([{ s: 1, d: 0, msg: 'EVE Client version 1 build 1 started 11/21/2026 23:59:59' }], []) === Date.UTC(2026, 10, 22), '');
ok('...and one just before midnight dated just after it on the day before', A._base([{ s: 86399, d: 0, msg: 'EVE Client version 1 build 1 started 11/22/2026 00:00:01' }], []) === Date.UTC(2026, 10, 21), '');
ok('dated by methodcalls.txt: a log ending before midnight, the calls after it, is on the day before', A._base([{ s: 85800, d: 0, msg: '' }], [{ t: Date.UTC(2026, 10, 22, 0, 10) }]) === Date.UTC(2026, 10, 21), '');

const b = A.build(LOGS, MC);
const rows = b.rows.map((r) => A._time(r.t) + ' ' + A._what(r) + (r.x ? ' | ' + r.x : ''));
const has = (re) => rows.filter((r) => re.test(r));
ok('the list is dated: the client\'s start dates logs.txt, midnight included', b.dated && A._day(b.rows[0].t) === 'Sat 21 Nov 2026' && A._day(b.rows[b.rows.length - 1].t) === 'Sun 22 Nov 2026',
    A._day(b.rows[0].t) + ' .. ' + A._day(b.rows[b.rows.length - 1].t));
const noAnchor = LOGS.split('\r\n').filter((l) => !/ started |EXCEPTION #/.test(l)).join('\n');
const b2 = A.build(noAnchor, MC);
ok('with no dated line, methodcalls.txt dates logs.txt', b2.dated && A._day(b2.rows[0].t) === 'Sat 21 Nov 2026', b2.rows.length ? A._day(b2.rows[0].t) : 'no rows');
const b3 = A.build(noAnchor, '');
ok('with neither, the list has times and no dates', !b3.dated && A.text(b3).indexOf('Nov') < 0 && /^23:59:05 /m.test(A.text(b3)), A.text(b3).split('\n').slice(0, 3).join(' / '));

// ---- the actions ----
const want = [
    '23:58:50 Started the client | Version 24.02, build 3724492',
    '23:59:05 At the character selection',
    '23:59:20 Logged in | In station 60011851, system 30002734',
    '00:00:10 Undocked | Station 60011851',
    '00:00:15 methodcalls.txt starts here | From here on the server calls are listed too: warp starts, d-scan, target locks, modules.',
    '00:00:15 Used the directional scanner (2 times)',
    '00:00:20 Warped to Fricoure IX - Asteroid Belt 1 | Landed after 21 s',
    '00:00:50 Tried to warp | No landing was logged after it: the warp was stopped, refused, or replaced by another warp.',
    '00:00:55 Warped to Vittenyn | Landed after 35 s, on autopilot',
    '00:01:40 Jumped through a stargate | From system 30002734 to system 30002731',
    '00:02:00 The game refused (2 times) | TargetTooFar',
    '00:03:06 Jumped through a wormhole | From system 30002731 to wormhole system 31001307',
    '00:03:30 Landed from a warp | No warp command from this client before it',
    '00:04:00 Went idle | No input for 5 min',
    '00:05:00 Turned a module on',
    '00:05:02 Locked a target',
    '00:05:30 Turned a module off',
    '00:09:00 Active again | After 10 min without input',
    "00:10:00 Error logged | AttributeError: 'NoneType' object has no attribute 'get'",
    '00:11:07 Docked | Station 60010924',
    '00:12:00 Created a contract | Price 1,500,000 ISK',
    '00:12:10 Accepted a contract',
    '00:12:30 In a structure | Structure 1039339381281',
    '00:13:00 Undocked | Structure 1039339381281',
    '00:13:30 Changed ship | Ship 1044855653047 to ship 1048435843315',
    '00:14:00 Jumped through a jump bridge | From wormhole system 31001307 to system 30000298',
    '00:14:20 Landed from a warp at <img src=x onerror=alert(1)> | No warp command from this client before it',
    '00:14:40 Asked to jump through a stargate | No jump was logged after it',
    '00:15:00 Logged off | Back to the character selection',
    '00:15:10 Warp started | No landing logged after it',
    '00:15:30 Opened the bug report window'
];
const firstOff = want.findIndex((w, i) => rows[i] !== w);
ok('every action, in order, as the list says it', firstOff < 0 && rows.length === want.length,
    firstOff < 0 ? rows.length + ' rows, ' + want.length + ' wanted' : 'row ' + firstOff + ': ' + JSON.stringify(rows[firstOff]) + ', wanted ' + JSON.stringify(want[firstOff]));
ok('the client\'s start, logged three times over, is one row', has(/Started the client/).length === 1, has(/Started the client/).length + ' rows');
ok('the bug report window, two lines in one second, is one row', has(/bug report window/).length === 1, '');
ok('a session change quoted in a stacktrace block is no action', !rows.some((r) => /60000001/.test(r)), has(/60000001/).join(' / '));
ok('the exception blocks give no other rows (their session lines included)', has(/Error logged/).length === 1 && has(/The game refused/).length === 1, '');
const jump = b.rows.find((r) => r.a === 'Jumped through a stargate');
ok('a stargate jump carries the request, the jump and the arrival (the request in the same second as the jump)',
    jump && jump.raw.length === 3 && /CmdStargateJump/.test(jump.raw[0].line) && /Stargate Jump from/.test(jump.raw[1].line) && /OnSessionChanged/.test(jump.raw[2].line) &&
    jump.raw.map((x) => x.f).join() === 'methodcalls.txt,logs.txt,logs.txt', jump && jump.raw.map((x) => x.f + ' ' + x.line).join(' / '));
const dock = b.rows.find((r) => r.x === 'Station 60010924');
ok('docking and the dock are one row, both lines in its hover', dock && dock.raw.length === 2 && /Docking 60010924/.test(dock.raw[0].line), dock && dock.raw.map((x) => x.line).join(' / '));
const warp = b.rows.find((r) => /^Warped to Fricoure/.test(r.a));
ok('a warp carries its command and its landing', warp && warp.raw.length === 2 && /CmdWarpToStuff/.test(warp.raw[0].line) && /StopWarpIndication/.test(warp.raw[1].line), warp && warp.raw.map((x) => x.line).join(' / '));
const refused = b.rows.find((r) => r.a === 'The game refused');
ok('what the game refused: the message\'s name, what came with it in the hover, the last time in the fold', refused && /distance/.test(refused.hint) && A._time(refused.end) === '00:02:01',
    refused && refused.hint + ' / ' + refused.end);
ok('a landing from before methodcalls.txt begins says nothing more, and its hover says why', (() => {
    const early = A.build(LOGS, MC.split('\n').filter((l) => !/ 00:00:\d\d\t/.test(l)).join('\n')).rows.find((r) => /Warped to Fricoure|Landed from a warp at Fricoure/.test(r.a));
    return early && early.a === 'Landed from a warp at Fricoure IX - Asteroid Belt 1' && early.x === '' && /begins later/.test(early.hint);
})(), '');
ok('a destination in another language: the game\'s own label is taken off', A._dest('Ziel: Jita IV - Moon 4<br>') === 'Jita IV - Moon 4' && A._dest('Destination : Amarr VIII<br>') === 'Amarr VIII' &&
    A._dest('目的地：Jita<br>') === 'Jita' && A._dest(' ') === '', A._dest('Destination : Amarr VIII<br>'));
ok('a destination with a colon of its own keeps it', A._dest('Destination: Home: safe spot<br>') === 'Home: safe spot', A._dest('Destination: Home: safe spot<br>'));
ok('places: a wormhole system and Abyssal space are named as such', A._sys('31001307') === 'wormhole system 31001307' && A._sys('32000005') === 'Abyssal space 32000005' && A._sys('30000142') === 'system 30000142', '');
ok('every command in CALLS has a category, and the rows a text', Object.keys(A.CALLS).every((k) => {
    const d = A.CALLS[k];
    return (d.length === 1 && ['warp', 'gatecmd', 'bridgecmd'].indexOf(d[0]) >= 0) || (d.length === 2 && ['session', 'move', 'act'].indexOf(d[0]) >= 0 && d[1]);
}), '');

// ---- the view ----
const text = A.text(b);
ok('Copy: a line a row, under its day, with what it says', /^Player actions, from logs\.txt and methodcalls\.txt \(EVE time\)\n\nSat 21 Nov 2026\n23:58:50  Started the client  Version 24\.02, build 3724492\n/.test(text) &&
    text.indexOf('\nSun 22 Nov 2026\n00:00:10  Undocked  Station 60011851\n') > 0 && text.indexOf('00:02:00  The game refused (2 times)  TargetTooFar') > 0, text.slice(0, 160));
const html = A.view(b);
ok('the HTML escapes what the files say (a destination holding a tag)', html.indexOf('<img src=x') < 0 && html.indexOf('&lt;img src=x onerror=alert(1)&gt;') > 0, '');
ok('the HTML: a day row each day, a row each action, each with its place in the list and what the search looks through', (html.match(/class="jpa-day"/g) || []).length === 2 &&
    (html.match(/class="jpa-r /g) || []).length === want.length && html.indexOf('data-i="0" data-q=" logs.txt 23:58:50') > 0 && !/<tr[^>]* title=/.test(html), html.slice(html.indexOf('<tbody>'), html.indexOf('<tbody>') + 300));
ok('the HTML: where each file starts and ends', html.indexOf('logs.txt 23:58:50 to 00:15:30 · methodcalls.txt 00:00:15 to 00:15:40') > 0, '');
ok('the HTML: a fold says how many', html.indexOf('<span class="jpa-n">2 times</span>') > 0, '');
// ---- a row's lines: what each says and where it is ----
ok('a line is kept whole, with its file, and lines that read the same are counted (logs.txt)', (() => {
    const e = A._logLines(['Time\tFacility\tType\tMessage', L('10:00:00', 'a', 'notice', 'x'), L('10:00:01', 'a', 'notice', 'x'), L('10:00:00', 'a', 'notice', 'x')].join('\n'));
    return e.map((x) => x.k).join() === '0,0,1';
})(), '');
ok('...and in methodcalls.txt, counting the rows a call does not keep', A._calls([M('00:12:10', SVC('a::B'), 2), M('00:12:10', REM('a::B'), 2), M('00:12:10', REM('a::B'), 2)].join('\n')).map((c) => c.k).join() === '0,1', '');
const long = A.build([LOGS.split('\r\n')[0], L('10:00:00', 'svc::x', 'notice', 'Opening bug reporting ' + 'y'.repeat(600))].join('\n'), '').rows[0];
ok('a long line is kept whole, not cut at 400', long && long.raw[0].line.length > 600, long && long.raw[0].line.length);
const tipOf = (re) => A.tip(b.rows.find((r) => re.test(r.a)));
const tWarp = tipOf(/^Warped to Fricoure/);
ok('the hover card: each line by its parts, oldest first: the file, its time (a call without its date), how long the call took or the facility and type, then the call or the message',
    /^<div class="jpa-tip-hint">Landed after 21 s<\/div>|^<div class="jpa-tip-lines">/.test(tWarp) &&
    tWarp.indexOf('<div class="jpa-tip-line jpa-tip-mc"><div class="jpa-tip-head"><span class="jpa-tip-file">methodcalls.txt</span><span class="jpa-tip-time">00:00:20</span><span class="jpa-tip-meta">124 ms</span></div><div class="jpa-tip-msg">Remote Object Call::CmdWarpToStuff (ObjectCall' + BS + 'Client)</div></div>') > 0 &&
    tWarp.indexOf('<span class="jpa-tip-file">logs.txt</span><span class="jpa-tip-time">00:00:41</span><span class="jpa-tip-meta">svc::space · notice</span></div><div class="jpa-tip-msg">StopWarpIndication Destination: Fricoure IX - Asteroid Belt 1&lt;br&gt; autopilot = 0</div>') > 0 &&
    tWarp.indexOf('methodcalls.txt') < tWarp.indexOf('>logs.txt<'), tWarp);
ok('...and what a click does: a row read from both files asks which', /<div class="jpa-tip-foot">Click to open it in methodcalls\.txt or logs\.txt<\/div>$/.test(tWarp), tWarp.slice(-120));
const tRef = tipOf(/^The game refused/);
ok('...why the row says what it says first, and how many there were, the last when', tRef.indexOf('<div class="jpa-tip-hint">With {\'distance\': 5000}</div><div class="jpa-tip-hint">2 times, the last at 00:02:01</div>') === 0, tRef.slice(0, 160));
ok('...a warning\'s type in its colour, and one file only: a click opens that line', tRef.indexOf('<span class="jpa-tip-meta jpa-tip-warning">client::general · warning</span>') > 0 && /Click to open this line in logs\.txt<\/div>$/.test(tRef), tRef);
const many = { a: 'x', hint: '', n: 1, raw: Array.from({ length: 9 }, (x, i) => ({ f: 'logs.txt', line: L('10:00:0' + i, 'f', 'notice', 'line ' + i + ' <b>' + (i === 0 ? 'z'.repeat(1300) : '')), k: 0 })) };
const tMany = A.tip(many);
ok('...at most TIP_LINES lines, the rest counted, a long message cut, and what the files say escaped', (tMany.match(/class="jpa-tip-line[ "]/g) || []).length === A.TIP_LINES && tMany.indexOf('<div class="jpa-tip-more">and 3 more</div>') > 0 &&
    tMany.indexOf('z'.repeat(1200 - 10) + '…') > 0 && tMany.indexOf('z'.repeat(1201)) < 0 && tMany.indexOf('<b>') < 0 && tMany.indexOf('&lt;b&gt;') > 0, tMany.length);
const mark = b.rows.find((r) => r.cat === 'mark');
ok('...a mark has no lines: no card beyond what it says, nothing to click', A.tip(mark).indexOf('jpa-tip-foot') < 0 && A._files(mark).length === 0 &&
    html.indexOf('class="jpa-r jpa-c-mark" data-i=') > 0, A.tip(mark));
const warp2 = b.rows.find((r) => /^Warped to Fricoure/.test(r.a));
ok('the chooser: a button a file, in the order of the row\'s lines, each with its first line\'s time', A.pickHtml(warp2, A._files(warp2)) ===
    '<div class="jpa-pick-h">Open in</div><button type="button" data-f="methodcalls.txt"><span>methodcalls.txt</span><span class="jpa-pick-t">00:00:20</span></button>' +
    '<button type="button" data-f="logs.txt"><span>logs.txt</span><span class="jpa-pick-t">00:00:41</span></button>', A.pickHtml(warp2, A._files(warp2)));

// ---- finding a line in the log parser's view ----
JiTA.logparser = { TYPES: eval(S.members(src, 'JiTA.logparser', ['TYPES'])).TYPES };
const txt = (t) => ({ nodeType: 3, textContent: t });
const el = (cls, t) => ({ nodeType: 1, classList: { contains: (c) => c === cls }, textContent: t });
const tr = (cells) => ({ cells: cells.map((c) => ({ childNodes: Array.isArray(c) ? c : [txt(c)] })) });
let view = null;
const table = (title, rows, shown) => ({ style: { display: shown === false ? 'none' : 'table' }, tBodies: [{ rows: rows }], closest: (sel) => (sel === '#body' ? { querySelector: () => ({ textContent: ' ' + title + ' ' }) } : null) });
global.document = { getElementById: (id) => (id === 'tableContent' ? view : null), querySelector: () => null };
const LT = JiTA.logparser.TYPES.log.title, MT = JiTA.logparser.TYPES.mc.title;
const R = [
    tr(['10:00:00', 'svc::a', 'notice', 'first']),
    tr(['10:00:05', 'svc::a', 'notice', [el('jita-rep-badge', '3×'), el('jita-sig-link', '[EDR-1]'), txt(' again  and\tagain')]]),
    tr(['10:00:05', 'svc::a', 'notice', 'again and again']),
    tr(['10:00:09', 'svc::b', 'notice', 'something else in that second']),
    tr(['10:00:09', 'svc::a', 'notice', 'Fran&ccedil;ais as Jira shows it'])
];
const src1 = (line, k) => ({ f: 'logs.txt', line: line, k: k || 0 });
view = null;
ok('seek: nothing while the file\'s view is not there', A.seek(src1(L('10:00:00', 'svc::a', 'notice', 'first'))) === null, '');
view = table(LT, R, false);
ok('...nor while it is still being drawn', A.seek(src1(L('10:00:00', 'svc::a', 'notice', 'first'))) === null, '');
view = table(MT, R);
ok('...nor while the view is another file\'s', A.seek(src1(L('10:00:00', 'svc::a', 'notice', 'first'))) === null, '');
view = table(LT, R);
ok('...in the file\'s view, the row that reads as the line does', A.seek(src1(L('10:00:00', 'svc::a', 'notice', 'first'))) === R[0], '');
ok('...a count of repeats and a defect\'s link in it, and its spacing, left out', A.seek(src1(L('10:00:05', 'svc::a', 'notice', 'again and again'))) === R[1], '');
ok('...of two that read the same, the one its count says', A.seek(src1(L('10:00:05', 'svc::a', 'notice', 'again and again'), 1)) === R[2] &&
    A.seek(src1(L('10:00:05', 'svc::a', 'notice', 'again and again'), 5)) === R[2], '');
ok('...one the view shows otherwise: the row of its time that starts as it does', A.seek(src1(L('10:00:09', 'svc::a', 'notice', 'Français as Jira shows it'))) === R[4], '');
ok('...else the first row of its time', A.seek(src1(L('10:00:09', 'svc::c', 'notice', 'nothing like it'))) === R[3], '');
ok('...one not there at all: false, so the wait ends', A.seek(src1(L('11:00:00', 'svc::a', 'notice', 'gone'))) === false, '');
view = table(MT, [tr(['2026.11.22 00:00:20', 'Remote Object Call::CmdWarpToStuff (ObjectCall' + BS + 'Client)', '124' + String.fromCharCode(13)])]);
ok('...a methodcalls.txt row, its duration\'s line break left out', A.seek({ f: 'methodcalls.txt', line: M('00:00:20', OBJ('CmdWarpToStuff'), 124), k: 0 }) === view.tBodies[0].rows[0], '');
global.document = undefined;

ok('the HTML: an archive with neither file says so', A.view(A.build('', '')).indexOf('holds no logs.txt and no methodcalls.txt') > 0, '');

// ---- which igbr.zip ----
const z = (id, size, created, filename) => ({ id: id, filename: filename || 'igbr.zip', size: size, created: created, content: '/c/' + id });
ok('the report\'s only igbr.zip is read, and no other zip', A.pick([z(1, 100, '2026-01-01', 'other.zip'), z(2, 500, '2026-01-01')], 0).id === 2 && A.pick([z(1, 100, '', 'other.zip')], 0) === null, '');
ok('of two igbr.zip, the one nearest the size the viewer shows', A.pick([z(1, 60000, '2026-01-02'), z(2, 131000, '2026-01-01')], 128 * 1024).id === 2, '');
ok('...and with no size shown, the newest', A.pick([z(1, 60000, '2026-01-01T10:00'), z(2, 131000, '2026-01-02T10:00')], 0).id === 2, '');
global.document = { querySelector: (s) => (s === '[data-testid="media-viewer-file-metadata-text"]' ? { textContent: 'archive· 128 KB' } : null) };
ok('the size the viewer shows, in bytes', A._shownSize() === 128 * 1024, A._shownSize());

console.log(fail ? '\n' + fail + ' FAILURE(S)' : '\nall Player actions checks passed');
process.exit(fail ? 1 : 0);
