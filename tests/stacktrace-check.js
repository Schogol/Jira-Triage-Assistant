// stacktrace-check.js - stacktraces count wherever exceptions do (v3.46.0). The client's log.LogTraceback writes a
// STACKTRACE block: a message, maybe a dump, and the stack it was logged from under "Traced at:". It is one log message,
// every line of it under the same time, facility and type, and the client cuts it at 6400 characters, so a long one loses
// its STACKTRACE END line, or its stack. Evals the real JiTA.logsig (tab) and its worker twins, which must agree, against
// logs built here as the client writes them: the blocks, the fingerprints, the defect index and every lookup on it, the log
// parser's marks, the profile's readings (and reading again the logs read before stacktraces were), the exception
// search's matching and the ranking boost's kinds.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const once = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return s;
};
const member = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n    },', s) + 7); };
// A member whose head other modules share, taken from inside JiTA.logsig.
const lsMember = (head) => { const at = once('\nJiTA.logsig = {'), s = src.indexOf(head, at); return src.slice(s, src.indexOf('\n    },', s) + 7); };
const line = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n', s) + 1); };
const block = (head, end) => { const s = once(head); return src.slice(s, src.indexOf(end, s) + end.length); };

let fail = 0;
// Straight to stdout: the index build logs through console.log, which is silenced around it.
const ok = (n, c, x) => { process.stdout.write((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || '')) + '\n'); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 20; i++) { await new Promise((r) => setImmediate(r)); } };
const J = (x) => JSON.stringify(x);

// ---- the real code ----
global.gmGet = (k, d) => d;
global.gmSet = () => {};
global.flagOn = () => true;
global.GM_addStyle = () => {};
global.JiTA = { HOST: 'https://jira', EBR_SCOPE: 'project = EBR AND statusCategory != Done', PAGE_SIZE: 100, util: {}, logsig: {}, ocr: {}, db: {}, sync: {}, ui: {}, menu: {},
    hidden: { isHidden: () => false }, worker: { usable: () => false }, rank: {} };
Object.assign(JiTA.util, eval('({' + member('    toPlainText: function (d) {') + member('    isClosedStatus: function (status) {') + '})'));
JiTA.ocr._langFromLabels = () => null;
const L = JiTA.logsig;
Object.assign(L, eval('({' + line('    MIN_FRAMES: ') + line('    CRASH_FRAMES: ') + line('    TRACE: ') + line('    OPEN_CUT: ') + line('    isTrace: function (sig) {') +
    line('    isCut: function (sig) {') + line('    _traceKey: function (sig) {') + member('    _splitBlocks: function (text) {') + member('    _fingerprint: function (text) {') +
    lsMember('    ensure: function () {') + member('    applyToTable: function () {') + member('    rematch: function () {') + member('    _logBlocks: function (text) {') +
    member('    _matchTextLocal: function (text) {') + member('    _defectsLocal: function (sigs) {') + member('    _holdingLocal: function (sigs) {') +
    member('    _sigsOfLocal: function (key) {') + member('    _crashOf: function (sig) {') + member('    _traceMates: function (idx, sig) {') +
    member('    _pointAt: function (idx, sig, crashSig) {') + member('    sigsOf: function (key) {') + member('    defectsForSigs: function (sigs) {') + '})'));
L._index = null; L._dirty = true; L._building = null;
// What counts (JiTA.excnoise), the real one (excnoise-check.js covers it; nothing here is ignored or common).
Object.assign(L, eval('({' + line('    isUserError: function (sig) {') + line('    _msgKey: function (sig) {') + '})'));
Object.assign(JiTA.util, eval('({' + member('    hash: function (str) {') + '})'));
JiTA.util.fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : '');
eval(block('JiTA.excnoise = {', '\n};\n'));
eval(block('JiTA.profile = {', '\n    _noop: null\n};\n'));
eval(block('JiTA.excfind = {', '\n    _noop: null\n};\n'));
(0, eval)(block('JiTA.repexc = {', '\n    _noop: null\n};\n'));
(0, eval)(block('JiTA.rank._boostRow = function (', '\n};\n'));
const P = JiTA.profile, X = JiTA.excfind, R = JiTA.repexc;
// The worker's copies, from jitaWorkerBody itself: the logsig section and the index build.
const W = new Function('isClosedStatus', 'isGmTeam', 'tokenize', 'effectiveText', 'cfg',
    'var vecCache = null, kwCache = null, logsigCache = null;\n' + line('    var LG_MIN = 2') + line('    var LG_TRACE = ') +
    src.slice(once('    // ---- logsig: exception-signature mining'), once('\n    // One load at a time')) +
    src.slice(once('    function buildIndexes(recs) {'), once('    // Cosine == dot product')) +
    '\nreturn { split: lgSplit, fp: lgFp, blocks: lgBlocks, match: lgMatch, defects: lgDefects, holding: lgHolding, sigsOf: lgSigsOf, mates: function (s) { return lgMates(logsigCache, s); },' +
    ' point: function (s, c) { return lgPoint(logsigCache, s, c); }, build: function (r) { buildIndexes(r); return logsigCache; } };')(
    () => false, () => false, (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), (r) => (r.summary || '') + ' ' + (r.description || ''), { MODEL_VERSION: 'm' });

// ---- logs as the client writes them ----
const col = (t, fac, type) => t + '\t' + fac + '\t' + type + '\t';
// A stacktrace: its header line, a dump, maybe its stack (the frames under "Traced at:" and the innermost one's locals),
// and maybe its end, every line under one time, facility and type.
function trace(o) {
    const out = ['STACKTRACE #' + o.n + ' logged at 04/12/2026 ' + o.time + ' : ' + o.msg].concat(o.dump || []);
    if (o.frames) { out.push(' ', 'Common path prefix = ', ' ', 'Traced at:'); o.frames.forEach((f) => out.push(f)); (o.locals || []).forEach((l) => out.push(l)); }
    if (o.end) { out.push(' ', 'Thread Locals:  session was <Session: (sid:1, clientID:0)>', 'Stackhash: -2252', 'Reported from: logmodule', 'STACKTRACE END', ''); }
    return out.map((l) => col(o.time, o.fac || 'client::general', o.type || 'error') + l);
}
function exception(o) {
    const out = ['EXCEPTION #' + o.n + ' logged at 04/12/2026 ' + o.time + ' : Unhandled exception in <TaskletExt object at 0xd2251b858>', ' ',
        'Formatted exception info: ' + o.msg, ' ', 'Common path prefix = ', ' ', 'Thrown at:'].concat(o.frames);
    if (o.end !== false) { out.push('Stackhash: -1723', 'EXCEPTION END', ''); }
    return out.map((l) => col(o.time, 'client::general', 'warning') + l);
}
const other = (t, fac, msg) => col(t, fac, 'notice') + msg;
const B = '/build/eve/release/V23.02/';
const HUD = [B + 'packages/bluepy/__init__.py(54) CallWrapper', B + 'packages/uthread2/bluepyimpl.py(31) inner', B + 'eve/client/script/remote/michelle.py(368) _DetectAndFixMissingHudModules'];
const DUMP = (ids) => ['', '---------------- dogmaModules ----------------', '=>[(' + ids[0] + 'L, 2281, 24), (' + ids[1] + 'L, 12058, 19)]', '',
    'Module (' + ids[2] + 'L, 30, 1820) (Mjolnir Auto-Targeting Heavy Missile I):', 'Checking if I need to substitute parent module itemID.... Nope!', 'ABORT: No godma item found!', ''];
const MSG_DATA = '_DetectAndFixMissingHudModules found missing modules in spaceUI data! I will attempt to refresh godma items and redraw!';
const MSG_VIEW = '_DetectAndFixMissingHudModules found missing modules in spaceUI view. I will attempt to redraw!';
const MSG_LOCK = 'Possible service deadlock detected!';
const LOCALS = ['        clientDogmaLM = <eve.client.script.dogma.clientDogmaLocation.DogmaLocation object at 0xcaec02518>', "        dogmaReport = u'\\n---------------- dogmaModules ----------------\\n=>[(10529157"];
// Cut by the client after its stack, before its END: the next line is another facility's.
const DATA = trace({ n: 95, time: '20:32:52', msg: MSG_DATA, dump: DUMP([1000000000026, 1000000000066, 1000000000022]), frames: HUD, locals: LOCALS });
// The same, another session: other ids in the dump, other line numbers in the stack.
const DATA2 = trace({ n: 7, time: '21:00:01', msg: MSG_DATA, dump: DUMP([2000000000001, 2000000000002, 2000000000003]), frames: HUD.map((f) => f.replace('(368)', '(371)').replace('(54)', '(60)')), locals: LOCALS });
// Cut before its stack (its dump took all 6400 characters): the next line is under the same time, another facility.
const VIEW = trace({ n: 106, time: '20:35:34', msg: MSG_VIEW, dump: DUMP([1000000000035, 1000000000036, 1000000000037]).concat(['---------------- shipUIButtons ----------------', '=>[(10000000']) });
// Whole, with its END line; two more of its message, one by another way (another crash site), one to the same site by another.
const LOCK_F = [B + 'packages/bluepy/__init__.py(54) CallWrapper', B + 'carbon/common/lib/autoexec_client_core.py(194) Startup', B + 'eve/client/script/parklife/gameui.py(915) DoLogin',
    B + 'carbon/common/script/sys/serviceManager.py(350) GetService'];
const LOCK = trace({ n: 1, time: '11:23:16', type: 'warning', msg: MSG_LOCK, frames: LOCK_F, locals: ["        serviceName = 'connection'"], end: true });
const LOCK_PATH = [B + 'packages/bluepy/__init__.py(54) CallWrapper', B + 'packages/loginrewards/client/loginCampaignService.py(321) should_reward_btn_be_visible',
    B + 'carbon/common/script/sys/serviceManager.py(350) GetService'];
const LOCK2 = trace({ n: 2, time: '11:23:31', type: 'warning', msg: MSG_LOCK, frames: LOCK_PATH, end: true });
const LOCK_SITE = [B + 'packages/bluepy/__init__.py(54) CallWrapper', B + 'eve/client/script/ui/login/charSelection/characterSelection.py(278) AddLogin',
    B + 'eve/client/script/parklife/gameui.py(915) DoLogin', B + 'carbon/common/script/sys/serviceManager.py(350) GetService'];
const LOCK3 = trace({ n: 3, time: '11:24:02', type: 'warning', msg: MSG_LOCK, frames: LOCK_SITE, end: true });
const msgCol = (lines) => lines.map((l) => l.split('\t').slice(3).join('\t'));
// The line after DATA names a frame of its own: kept apart, it does not change DATA's stack.
const LOG = [other('20:32:44', 'blue::Memory', 'Python memory: 902224K')].concat(DATA, [other('20:32:53', 'svc::godma', 'InitSlots.no quantity Mjolnir in ' + B + 'eve/client/script/godma/godma.py(812) InitSlots')],
    VIEW, [other('20:35:34', 'trinity::Main', 'resource file res:/fisfx/generic/x.red is not of correct type!')], DATA2, [other('21:00:02', 'svc::godma', 'done')], LOCK2,
    [other('11:23:32', 'svc::ServiceManager', 'Service seasonalLoginCampaignService Startup time: 0.181s')]).join('\n');

(async () => {
    // ================= the blocks of a raw log =================
    const blocks = L._logBlocks(LOG);
    ok('a raw log\'s stacktraces are blocks of their own', blocks.length === 4 && blocks.every((b) => /^STACKTRACE #/.test(b)), blocks.length + ' ' + blocks.map((b) => b.slice(0, 16)).join());
    ok('...one cut by the client before its END ends at the first line logged under another facility', blocks[0].split('\n').length === DATA.length && !/InitSlots/.test(blocks[0]),
        blocks[0].split('\n').slice(-1)[0]);
    ok('...under the same time too: the facility tells them apart', blocks[1].split('\n').length === VIEW.length && !/not of correct type/.test(blocks[1]), blocks[1].split('\n').slice(-1)[0]);
    ok('...and a whole one at its STACKTRACE END line, the line after it left out', blocks[3].split('\n').slice(-1)[0] === 'STACKTRACE END' && !/Startup time/.test(blocks[3]));
    const cont = L._logBlocks(DATA.slice(0, 3).concat(['a line the client wrapped, with no columns', '\tclient::general\terror\ta line without its time'], DATA.slice(3)).join('\n'));
    ok('a line without columns, or without its time, stays with the stacktrace it is in, as the parser shows it', cont.length === 1 && /client wrapped/.test(cont[0]) &&
        /without its time/.test(cont[0]) && /Traced at:/.test(cont[0]));
    const two = L._logBlocks(DATA.slice(0, 5).concat([DATA[5].split('\t')[0] + '\tsomething else'], DATA.slice(5)).join('\n'));
    ok('a line of two columns is another record, as the log parser shows it: the stacktrace ends there', two.length === 1 && !/Traced at:/.test(two[0]));
    const cutExc = exception({ n: 4, time: '20:31:00', msg: 'KeyError: 2', frames: [B + 'a/foo.py(1) OnClick', B + 'a/bar.py(2) Load'], end: false });
    const ce = L._logBlocks(cutExc.concat(LOCK).join('\n'));
    ok('an exception cut before its EXCEPTION END ends where a stacktrace starts', ce.length === 2 && !/STACKTRACE/.test(ce[0]) &&
        L._fingerprint(ce[0]).sig === 'keyerror: 2|foo.py:onclick>bar.py:load', ce.map((b) => L._fingerprint(b).sig).join(' / '));
    ok('the worker\'s copy cuts every log the same', J(W.blocks(LOG)) === J(blocks) && J(W.blocks(cutExc.concat(LOCK).join('\n'))) === J(ce) &&
        J(W.blocks(DATA.slice(0, 3).concat(['a line the client wrapped, with no columns', '\tclient::general\terror\ta line without its time'], DATA.slice(3)).join('\n'))) === J(cont));

    // ================= the fingerprint =================
    const fData = L._fingerprint(blocks[0]), fView = L._fingerprint(blocks[1]), fData2 = L._fingerprint(blocks[2]), fLock2 = L._fingerprint(blocks[3]);
    const fLock = L._fingerprint(L._logBlocks(LOCK.join('\n'))[0]), fLock3 = L._fingerprint(L._logBlocks(LOCK3.join('\n'))[0]);
    ok('a stacktrace\'s message is the rest of its first line, as written', fData.msg === MSG_DATA && fLock.msg === MSG_LOCK, fData.msg);
    ok('...its signature its kind\'s tag, the message and the frames under "Traced at:", innermost last',
        fData.sig === L.TRACE + MSG_DATA.toLowerCase() + '|__init__.py:callwrapper>bluepyimpl.py:inner>michelle.py:_detectandfixmissinghudmodules' && L.isTrace(fData.sig) && !L.isCut(fData.sig), fData.sig);
    ok('...its site the message and the innermost two', fData.crashSig === L.TRACE + MSG_DATA.toLowerCase() + '|bluepyimpl.py:inner>michelle.py:_detectandfixmissinghudmodules', fData.crashSig);
    ok('...the same in another session, whatever the dump and the line numbers', fData2.sig === fData.sig && !fData.open && !fData2.open);
    ok('one cut off before its stack keeps its message, and no frames: matched by that alone', fView.sig === L.TRACE + MSG_VIEW.toLowerCase() + '|' && L.isCut(fView.sig) &&
        fView.crashSig === null && fView.msg === MSG_VIEW, J(fView));
    ok('...but none at all without a message', L._fingerprint(trace({ n: 9, time: '01:00:00', msg: '', dump: ['x'] }).join('\n')).sig === null);
    ok('the same message by another way is another stack and another site', fLock2.sig !== fLock.sig && fLock2.crashSig !== fLock.crashSig);
    ok('...to the same site by another way, another stack at the same site', fLock3.sig !== fLock.sig && fLock3.crashSig === fLock.crashSig);
    const asExc = L._fingerprint(exception({ n: 5, time: '11:23:16', msg: MSG_LOCK, frames: LOCK_F }).join('\n'));
    ok('an exception with a stacktrace\'s message and stack shares neither its signature nor its site', asExc.sig && !L.isTrace(asExc.sig) && asExc.sig !== fLock.sig &&
        asExc.crashSig !== fLock.crashSig && asExc.sig === fLock.sig.slice(L.TRACE.length), asExc.sig);
    const numbered = (n) => L._fingerprint(trace({ n: 3, time: '02:00:00', msg: 'Failed to load item ' + n + 'L for ' + n, frames: HUD }).join('\n'));
    ok('a stacktrace\'s message reads its ids as any number, as an exception\'s does', numbered(1000000000001).sig === numbered(1000000000002).sig &&
        numbered(1000000000001).msg !== numbered(1000000000002).msg && /failed to load item # for #\|/.test(numbered(1000000000001).sig), numbered(1000000000001).sig);
    ok('...the tag and the cut are the signature\'s own: isTrace and isCut read nothing else', !L.isTrace('keyerror: 2|a.py:f') && !L.isCut('keyerror: 2|') && !L.isTrace(null) &&
        L._traceKey(fView.sig) === L.TRACE + MSG_VIEW.toLowerCase() && L._traceKey(fData.sig) === L.TRACE + MSG_DATA.toLowerCase());
    const excFirst = L._fingerprint(msgCol(exception({ n: 1, time: '01:00:00', msg: 'KeyError: 2', frames: [B + 'a/foo.py(1) OnClick', B + 'a/bar.py(2) Load'] })).join('\n') +
        "\n        note = 'STACKTRACE #4 logged at 04/12/2026 01:00:00 : quoted'");
    ok('an exception whose text quotes a stacktrace\'s first line after its own is still an exception', !L.isTrace(excFirst.sig) && excFirst.msg === 'KeyError: 2', excFirst.sig);
    const pasted = L._fingerprint('Formatted exception info: KeyError: 2 Thrown at: ' + B + 'a/foo.py(1) OnClick ' + B + 'a/bar.py(2) Load        why = "Traced at: nothing"');
    ok('...so is one pasted without its first line, though the words "Traced at" are in it', !L.isTrace(pasted.sig) && pasted.msg === 'KeyError: 2', pasted.sig);
    const quoting = L._fingerprint(trace({ n: 5, time: '01:00:00', msg: 'Dump follows', dump: ['Formatted exception info: KeyError: 9'], frames: HUD }).join('\n'));
    ok('a stacktrace whose dump holds an exception\'s text keeps its own message', quoting.msg === 'Dump follows' && L.isTrace(quoting.sig), quoting.msg);
    ok('an exception with too few frames has no signature, stacktraces aside', L._fingerprint(msgCol(exception({ n: 1, time: '01:00:00', msg: 'TypeError: lone', frames: [B + 's/one.py(1) Only'] })).join('\n')).sig === null);

    // ================= in a description =================
    const code = msgCol(DATA).join('\n');                         // in a code block: the lines kept, as the parser shows them
    const flat = msgCol(DATA).join(' ');                          // outside one: Jira joins the lines
    const raw = DATA.join(' ');                                   // the raw log pasted outside one: joined, each line's columns kept
    const dc = L._splitBlocks('Steps: undock. ' + code), df = L._splitBlocks('Steps: undock. ' + flat), dr = L._splitBlocks(raw);
    ok('a stacktrace pasted in a code block reads as the log\'s', dc.length === 1 && L._fingerprint(dc[0]).sig === fData.sig && !L._fingerprint(dc[0]).open);
    ok('...pasted raw, its lines joined, its message ends where the next line\'s columns start', L._fingerprint(dr[0]).sig === fData.sig && L._fingerprint(dr[0]).msg === MSG_DATA &&
        !L._fingerprint(dr[0]).open, L._fingerprint(dr[0]).msg);
    const fFlat = L._fingerprint(df[0]);
    ok('...outside a code block, what followed its first line runs into its message: open, and cut at ' + L.OPEN_CUT,
        fFlat.open === true && fFlat.msg.indexOf(MSG_DATA + ' ----') === 0 && fFlat.msg.length <= L.OPEN_CUT && fFlat.sig !== fData.sig, fFlat.msg.length + ' ' + fFlat.msg.slice(0, 140));
    ok('...its frames the log\'s all the same', fFlat.sig.slice(fFlat.sig.lastIndexOf('|')) === fData.sig.slice(fData.sig.lastIndexOf('|')));
    const lockFlat = L._fingerprint(msgCol(LOCK).join(' '));
    ok('...one with nothing after its first line reads its message whole, open or not', lockFlat.open === true && lockFlat.sig === fLock.sig, lockFlat.sig);
    const mixed = L._splitBlocks(msgCol(exception({ n: 1, time: '01:00:00', msg: 'KeyError: 2', frames: [B + 'a/foo.py(1) OnClick', B + 'a/bar.py(2) Load'] })).join(' ') + ' ' +
        msgCol(LOCK).join(' ') + ' ' + msgCol(VIEW).join(' ') + ' then ' + msgCol(exception({ n: 2, time: '01:00:01', msg: 'ValueError: bad', frames: [B + 's/baz.py(9) Run', B + 's/qux.py(10) Go'] })).join(' '));
    ok('a description holding both kinds splits into each, every one ending at its END line or the next block',
        mixed.length === 4 && J(mixed.map((b) => L.isTrace(L._fingerprint(b).sig))) === '[false,true,true,false]' && !/STACKTRACE/.test(mixed[0]) && /STACKTRACE END$/.test(mixed[1].trim()), J(mixed.map((b) => b.slice(0, 20))));
    const bare = L._fingerprint('Traced at: ' + msgCol(DATA).slice(-5).join(' '));
    ok('a stack pasted without its first line is a stacktrace\'s, with no message', L.isTrace(bare.sig) && bare.msg === '' && !L.isCut(bare.sig), bare.sig);
    const samples = [LOG, code, flat, raw, msgCol(LOCK).join(' '), msgCol(VIEW).join('\n'), 'Traced at: ' + msgCol(DATA).slice(-5).join(' '), cutExc.concat(LOCK).join(' '), 'no exception here'];
    ok('the worker\'s copy splits and reads every sample exactly as the tab\'s does',
        samples.every((s) => J(L._splitBlocks(s).map(L._fingerprint)) === J(W.split(s).map(W.fp))),
        samples.filter((s) => J(L._splitBlocks(s).map(L._fingerprint)) !== J(W.split(s).map(W.fp))).map((s) => s.slice(0, 40)).join(' | '));

    // ================= the defect index =================
    const recs = [
        { key: 'EDR-1', project: 'EDR', status: 'Open', created: '2026-10-01T00:00:00.000+0000', description: 'Steps. ' + code },
        { key: 'EDR-2', project: 'EDR', status: 'Open', created: '2026-10-02T00:00:00.000+0000', description: msgCol(VIEW).join('\n') },
        { key: 'EDR-3', project: 'EDR', status: 'Open', created: '2026-10-03T00:00:00.000+0000', description: msgCol(LOCK).join('\n') },
        { key: 'EDR-4', project: 'EDR', status: 'Closed', resolution: 'Fixed', created: '2026-10-04T00:00:00.000+0000', description: msgCol(LOCK3).join('\n') },
        { key: 'EDR-5', project: 'EDR', status: 'Open', created: '2026-10-05T00:00:00.000+0000', description: msgCol(exception({ n: 5, time: '11:23:16', msg: MSG_LOCK, frames: LOCK_F })).join('\n') },
        { key: 'EDR-6', project: 'EDR', status: 'Open', created: '2026-10-06T00:00:00.000+0000', description: flat },
        { key: 'EDR-7', project: 'EDR', status: 'Open', created: '2026-10-07T00:00:00.000+0000', description: msgCol(exception({ n: 6, time: '03:00:00', msg: 'KeyError: 7', frames: [B + 'k/a.py(1) A', B + 'k/b.py(2) B'] })).join('\n') + '\n' + msgCol(LOCK2).join('\n') },
        { key: 'EDR-8', project: 'EDR', status: 'Open', created: '2026-09-01T00:00:00.000+0000', description: msgCol(LOCK).join('\n') + '\nand again:\n' + msgCol(LOCK).join('\n') },
        { key: 'EBR-1', project: 'EBR', status: 'Open', description: code }
    ];
    JiTA.db.allDefects = () => Promise.resolve(recs);
    const log0 = console.log;
    console.log = () => {};
    const idx = await L.ensure();
    console.log = log0;
    const tk = L._traceKey;
    ok('a stacktrace with its stack is filed like an exception, under its stack and its site', idx.sigMap[fData.sig] && idx.sigMap[fData.sig].members.map((m) => m.key).join() === 'EDR-1' &&
        idx.crashMap[fLock.crashSig].members.map((m) => m.key).join() === 'EDR-4,EDR-3,EDR-8', J(Object.keys(idx.sigMap)));
    ok('...and under its message, with every stacktrace of it, newest first, a defect that pastes it twice once', idx.traceMsg[tk(fLock.sig)].map((m) => m.key).join() === 'EDR-7,EDR-4,EDR-3,EDR-8' &&
        idx.traceMsg[tk(fData.sig)].map((m) => m.key).join() === 'EDR-1', J(idx.traceMsg[tk(fLock.sig)].map((m) => m.key)));
    ok('one cut off before its stack only under its message, and among the cut ones', !idx.sigMap[fView.sig] && idx.traceCut[tk(fView.sig)].map((m) => m.key).join() === 'EDR-2' &&
        idx.traceMsg[tk(fView.sig)].map((m) => m.key).join() === 'EDR-2' && J(idx.keyToCut['EDR-2']) === J([fView.sig]) && !idx.keyToSigs['EDR-2'], J(idx.keyToCut));
    ok('...a bug report\'s description is not mined', !Object.keys(idx.traceMsg).some((k) => idx.traceMsg[k].some((m) => m.key === 'EBR-1')));
    const widx = W.build(recs);
    ok('the worker builds the same index, field for field', J(widx) === J(idx), J(widx).length + ' vs ' + J(idx).length);

    // ================= what a log points at =================
    const at = (sig, c) => { const h = L._pointAt(idx, sig, c); return h ? h.key + ':' + h.by : 'none'; };
    const site = L._fingerprint(trace({ n: 9, time: '05:00:00', msg: MSG_LOCK, frames: [B + 'x/other.py(1) Elsewhere'].concat(LOCK_F.slice(-2)) }).join('\n'));
    const viewWhole = L._fingerprint(trace({ n: 9, time: '05:00:00', msg: MSG_VIEW, frames: HUD }).join('\n'));
    const dataCut = L._fingerprint(trace({ n: 9, time: '05:00:00', msg: MSG_DATA, dump: ['x'] }).join('\n'));
    ok('the same stack points at its defect', at(fData.sig) === 'EDR-1:stack' && at(fLock.sig) === 'EDR-3:stack' && at(fData.sig, fData.crashSig) === 'EDR-1:stack');
    ok('...the same site only at the newest with that site', at(site.sig) === 'EDR-4:site' && at(site.sig, site.crashSig) === 'EDR-4:site', at(site.sig));
    ok('one cut off before its stack at the newest stacktrace of its message', at(fView.sig) === 'EDR-2:message' && at(dataCut.sig) === 'EDR-1:message', at(dataCut.sig));
    ok('...and one with a stack at a cut one of its message, the only way to compare them', at(viewWhole.sig) === 'EDR-2:message', at(viewWhole.sig));
    ok('...but a whole one at none of its message whose stack differs: both stacks known, they are two', at(fLock2.sig) === 'EDR-7:stack' &&
        L._pointAt(idx, L._fingerprint(trace({ n: 9, time: '05:00:00', msg: MSG_LOCK, frames: [B + 'q/a.py(1) X', B + 'q/b.py(2) Y'] }).join('\n')).sig) === null);
    ok('an exception points only at exceptions, a stacktrace only at stacktraces', at(asExc.sig) === 'EDR-5:stack' && at(fLock.sig) !== 'EDR-5:stack' &&
        L._traceMates(idx, asExc.sig).length === 0);
    ok('...a run-on message from a description is filed apart, so the log\'s stack points past it, at the older one', idx.sigMap[fFlat.sig].members[0].key === 'EDR-6' &&
        at(fData.sig) === 'EDR-1:stack' && idx.traceMsg[tk(fData.sig)].every((mm) => mm.key !== 'EDR-6'));
    ok('the worker points every one of them at the same defect', [fData, fView, fLock, fLock2, site, viewWhole, dataCut, asExc].every((f) => J(W.point(f.sig)) === J(L._pointAt(idx, f.sig)) &&
        J(W.point(f.sig, f.crashSig)) === J(L._pointAt(idx, f.sig, f.crashSig))));

    // ================= the lookups, tab and worker =================
    const D = await L._defectsLocal([fData.sig, fView.sig, site.sig, asExc.sig, fLock2.sig]);
    ok('the defect each one points at, for the profile', J(D) === J({ [fData.sig]: 'EDR-1', [fView.sig]: 'EDR-2', [site.sig]: 'EDR-4', [asExc.sig]: 'EDR-5', [fLock2.sig]: 'EDR-7' }), J(D));
    ok('...the worker\'s the same', J(W.defects([fData.sig, fView.sig, site.sig, asExc.sig, fLock2.sig])) === J(D));
    let H = await L._holdingLocal([fData.sig, fView.sig, site.sig]);
    ok('every defect holding one, for the ranking: st-exact, st-msg, st-site', H['EDR-1'].kind === 'st-exact' && H['EDR-2'].kind === 'st-msg' && H['EDR-3'].kind === 'st-site' &&
        H['EDR-4'].kind === 'st-site' && H['EDR-8'].kind === 'st-site' && Object.keys(H).length === 5, J(H));
    ok('...each naming the stacktrace it holds', J(H['EDR-1'].hits) === J([{ sig: fData.sig, kind: 'st-exact' }]) && J(H['EDR-2'].hits) === J([{ sig: fView.sig, kind: 'st-msg' }]) &&
        J(H['EDR-4'].hits) === J([{ sig: site.sig, kind: 'st-site' }]), J(H));
    ok('...the worker\'s the same', J(W.holding([fData.sig, fView.sig, site.sig])) === J(H), J(W.holding([fData.sig, fView.sig, site.sig])));
    const k7 = L._fingerprint(msgCol(exception({ n: 6, time: '03:00:00', msg: 'KeyError: 7', frames: [B + 'k/a.py(1) A', B + 'k/b.py(2) B'] })).join('\n'));
    const k7site = L._fingerprint(msgCol(exception({ n: 6, time: '03:00:00', msg: 'KeyError: 7', frames: [B + 'k/z.py(1) Z', B + 'k/a.py(1) A', B + 'k/b.py(2) B'] })).join('\n'));
    H = await L._holdingLocal([fLock2.sig, k7.sig]);
    ok('a defect held both ways shows the exception at the same level', H['EDR-7'].kind === 'exact' &&
        J(H['EDR-7'].hits) === J([{ sig: k7.sig, kind: 'exact' }, { sig: fLock2.sig, kind: 'st-exact' }]), J(H));
    H = await L._holdingLocal([k7site.sig, fLock2.sig]);
    ok('...but the better level first: the same stacktrace over the same crash site', H['EDR-7'].kind === 'st-exact' &&
        J(H['EDR-7'].hits) === J([{ sig: fLock2.sig, kind: 'st-exact' }, { sig: k7site.sig, kind: 'site' }]), J(H));
    ok('...and the worker agrees on both', J(W.holding([fLock2.sig, k7.sig])) === J(await L._holdingLocal([fLock2.sig, k7.sig])) &&
        J(W.holding([k7site.sig, fLock2.sig])) === J(H));
    const so = await L._sigsOfLocal('EDR-2');
    ok('a defect\'s own stacktraces, a cut one apart', so.sigs.length === 0 && J(so.cuts) === J([fView.sig]) && J(W.sigsOf('EDR-2')) === J(so), J(so));
    const m = await L._matchTextLocal(LOG);
    ok('a raw log\'s known stacktraces: the same stack exactly, twice; a cut one loosely; the unknown way not at all',
        J(Object.keys(m).sort()) === J(['EDR-1', 'EDR-2', 'EDR-7']) && m['EDR-1'].count === 2 && !m['EDR-1'].loose && m['EDR-2'].loose && !m['EDR-7'].loose && m['EDR-2'].msg === MSG_VIEW, J(m));
    ok('...the worker finds the same', J(W.match(LOG)) === J(m), J(W.match(LOG)));

    // ================= the log parser's marks =================
    function El(tag) {
        const n = { tagName: tag, kids: [], attrs: {}, title: '', className: '', style: {}, parentNode: null };
        const has = (x) => n.className.split(' ').indexOf(x) >= 0;
        n.classList = { add: (...c) => { c.forEach((x) => { if (!has(x)) { n.className = (n.className + ' ' + x).trim(); } }); }, remove: (...c) => { n.className = n.className.split(' ').filter((x) => x && c.indexOf(x) < 0).join(' '); }, contains: has };
        n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
        n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
        n.removeAttribute = (k) => { delete n.attrs[k]; if (k === 'title') { n.title = ''; } };
        n.insertBefore = (c, ref) => { const i = ref ? n.kids.indexOf(ref) : -1; n.kids.splice(i < 0 ? n.kids.length : i, 0, c); c.parentNode = n; return c; };
        n.removeChild = (c) => { n.kids = n.kids.filter((k) => k !== c); c.parentNode = null; return c; };
        Object.defineProperty(n, 'firstChild', { get: () => n.kids[0] || null });
        Object.defineProperty(n, 'lastElementChild', { get: () => { for (let i = n.kids.length - 1; i >= 0; i--) { if (n.kids[i].tagName) { return n.kids[i]; } } return null; } });
        Object.defineProperty(n, 'textContent', { get: () => n.kids.map((k) => (k.tagName ? k.textContent : k.text)).join(''), set: (v) => { n.kids = [{ text: String(v) }]; } });
        n.querySelectorAll = (sel) => { const out = []; (function walk(x) { x.kids.forEach((k) => { if (k.tagName === 'A' && sel === 'a.jita-sig-link') { out.push(k); } if (k.tagName) { walk(k); } }); })(n); return out; };
        return n;
    }
    // A rendered row: time, facility, type and message cells, as ParseLogs draws one.
    const rowOf = (l) => { const p = l.split('\t'), tr = El('TR'); const c = p.length >= 4 ? [p[0], p[1], p[2], p.slice(3).join('\t')] : ['', '', '', l];
        c.forEach((t) => { const td = El('TD'); td.kids.push({ text: t }); td.parentNode = tr; tr.kids.push(td); }); tr.cells = tr.kids; return tr; };
    const SITE_LOG = trace({ n: 9, time: '05:00:00', msg: MSG_LOCK, frames: [B + 'x/other.py(1) Elsewhere'].concat(LOCK_F.slice(-2)), end: true });
    // After its END line, under the same columns, a line that names a frame: it is no part of the stacktrace.
    const rows = LOG.split('\n').concat(SITE_LOG, [col('05:00:00', 'client::general', 'error') + B + 'x/after.py(1) After']).map(rowOf);
    let found = null;
    global.document = { getElementById: (id) => (id === 'tableContent' ? {} : null), querySelectorAll: (sel) => (sel === '#tableContent tbody tr' ? rows : []), createElement: (t) => El(String(t).toUpperCase()) };
    L.renderPanel = (f) => { found = f; };
    await L.applyToTable();
    const head = (re) => rows.find((r) => re.test(r.lastElementChild.textContent));
    const links = (r) => r.querySelectorAll('a.jita-sig-link').map((a) => a.textContent).join();
    const rData = head(/STACKTRACE #95/), rView = head(/STACKTRACE #106/), rSite = head(/STACKTRACE #9 /), rData2 = head(/STACKTRACE #7 /);
    ok('the parser marks a known stacktrace on its first row, by its defect', links(rData) === '[EDR-1]' && rData.classList.contains('sig-hit') &&
        rData.lastElementChild.title === 'Known stacktrace · EDR-1', links(rData) + ' / ' + rData.lastElementChild.title);
    ok('...one cut off before its stack loosely, and says why', links(rView) === '[~EDR-2]' && rView.classList.contains('sig-hit-loose') &&
        rView.lastElementChild.title === 'Possibly related (same message, stack cut off) · EDR-2', rView.lastElementChild.title);
    ok('...one at the same site only, as the same trace site', links(rSite) === '[~EDR-4]' && rSite.lastElementChild.title === 'Possibly related (same trace site) · EDR-4', rSite.lastElementChild.title);
    const after = rows[rows.indexOf(rData) + DATA.length];
    ok('...its block ends where the log moves on: the next facility\'s line is a line of its own', /InitSlots/.test(after.lastElementChild.textContent) && after.getAttribute('data-jita-sig') === '0' &&
        rows.slice(rows.indexOf(rData) + 1, rows.indexOf(rData) + DATA.length).every((r) => r.getAttribute('data-jita-sig') === '0'));
    ok('...and the panel counts each defect', found && found['EDR-1'].count === 2 && found['EDR-2'].loose === true && found['EDR-4'].loose === true && found['EDR-7'].count === 1 && links(rData2) === '[EDR-1]', J(Object.keys(found || {})));
    L.rematch();
    await flush();
    ok('a re-match leaves one mark each, its hover written again', links(rData) === '[EDR-1]' && links(rView) === '[~EDR-2]' && rView.lastElementChild.title === 'Possibly related (same message, stack cut off) · EDR-2');
    L._index = { sigMap: {}, crashMap: {}, keyToSigs: {}, keyToCrash: {}, traceMsg: {}, traceCut: {}, keyToCut: {} };
    L.rematch();
    await flush();
    ok('...and when nothing matches any more, each mark and its hover go, the stacktraces\' too', links(rData) === '' && links(rView) === '' && links(rSite) === '' &&
        rData.lastElementChild.title === '' && rView.lastElementChild.title === '' && rSite.lastElementChild.title === '', rView.lastElementChild.title);
    L._index = idx;

    // ================= the profile's readings =================
    const ex = P.logExceptions(LOG + '\n' + exception({ n: 8, time: '22:00:00', msg: 'KeyError: 2', frames: [B + 'a/foo.py(1) OnClick', B + 'a/bar.py(2) Load'] }).join('\n'));
    ok('a log\'s reading holds its stacktraces too, each once, a cut one by its message', J(ex.map((e) => e.sig)) === J([fData.sig, fView.sig, fLock2.sig, 'keyerror: 2|foo.py:onclick>bar.py:load']) &&
        ex[0].msg === MSG_DATA, J(ex.map((e) => e.sig.slice(0, 40))));
    let texts = [], bytes = [];
    P._fetchLog = (u) => { texts.push(u); return Promise.resolve(LOG); };
    P._fetchBytes = (u) => { bytes.push(u); return Promise.resolve(new ArrayBuffer(8)); };
    const realUnzip = P.unzip;
    let unzipped = [];
    P.unzip = (b, want) => { unzipped.push(want.join()); return Promise.resolve({ 'logs.txt': LOG }); };
    let meta = {};
    JiTA.db.getMeta = (k) => Promise.resolve(k in meta ? meta[k] : null);
    JiTA.db.setMeta = (k, v) => { meta[k] = v; return Promise.resolve(); };
    const att = (name, size) => ({ filename: name, size: size || 100, content: 'https://jira/att/' + name });
    const issue = { key: 'EBR-21', fields: { attachment: [att('logs.txt', 500), att('igbr.zip', 900)] } };
    let rec = await P._readFiles(issue, null, false);
    ok('a reading made now says how its logs were read (lv)', rec.logs && rec.lv === P.LOG_V && rec.exc.some((e) => e.sig === fData.sig) && meta['rp:EBR-21'].lv === P.LOG_V, J(rec).slice(0, 120));
    const many = [];
    for (let i = 0; i < P.MAX_EXC + 5; i++) { many.push(trace({ n: i, time: '06:00:00', msg: 'Trace number ' + String.fromCharCode(97 + (i % 26)) + i, frames: HUD }).join('\n')); }
    many.push(exception({ n: 99, time: '07:00:00', msg: 'KeyError: 2', frames: [B + 'a/foo.py(1) OnClick', B + 'a/bar.py(2) Load'] }).join('\n'));
    P._fetchLog = () => Promise.resolve(many.join('\n'));
    rec = await P._readFiles({ key: 'EBR-22', fields: { attachment: [att('logs.txt')] } }, null, false);
    ok('a log full of stacktraces keeps ' + P.MAX_EXC + ' of them, and still its exceptions', rec.exc.filter((e) => L.isTrace(e.sig)).length === P.MAX_EXC &&
        rec.exc.filter((e) => !L.isTrace(e.sig)).length === 1, rec.exc.length);
    let nth = 0;
    P._fetchLog = () => Promise.resolve(nth++ === 0 ? many.slice(0, -1).join('\n') : many.slice(-1)[0]);
    rec = await P._readFiles({ key: 'EBR-24', fields: { attachment: [att('logs.txt', 10), att('other_log.txt', 20)] } }, null, false);
    ok('...as does a second log, after a first full of stacktraces', nth === 2 && rec.exc.filter((e) => L.isTrace(e.sig)).length === P.MAX_EXC &&
        rec.exc.filter((e) => !L.isTrace(e.sig)).length === 1, nth + ' / ' + rec.exc.length);
    P._fetchLog = (u) => { texts.push(u); return Promise.resolve(LOG); };
    // Read before stacktraces were: its logs again, and only them.
    texts = []; bytes = [];
    const old = { v: P.V, key: 'EBR-21', logs: true, hasLog: true, exc: [{ sig: 'keyerror: 2|foo.py:onclick>bar.py:load', msg: 'KeyError: 2' }], logSig: P._logSig(issue.fields.attachment),
        build: 1, zip: true, hasZip: true, wer: true, crashes: [{ module: 'x.dll', code: '' }] };
    ok('the profile reads a reading from before stacktraces again', P._needs(old, true, issue.fields.attachment) && P._needs(old, false, issue.fields.attachment) &&
        !P._needs(Object.assign({}, old, { lv: P.LOG_V }), true, issue.fields.attachment));
    rec = await P._readFiles(issue, old, true);
    ok('...its logs, now with their stacktraces; the zip part as it was, not downloaded again', texts.length === 1 && bytes.length === 0 && rec.lv === P.LOG_V &&
        rec.exc.some((e) => e.sig === fView.sig) && !rec.exc.some((e) => e.msg === 'KeyError: 2' && !/foo/.test(e.sig)) && rec.zip && rec.wer && rec.crashes.length === 1, J(rec).slice(0, 160));
    // A log that came out of the zip: the report has no log of its own.
    const zIssue = { key: 'EBR-23', fields: { attachment: [att('igbr.zip', 900)] } };
    const zOld = { v: P.V, key: 'EBR-23', logs: true, hasLog: true, exc: [{ sig: 'keyerror: 2|foo.py:onclick>bar.py:load', msg: 'KeyError: 2' }], logSig: '', zip: true, hasZip: true, wer: true };
    texts = []; bytes = []; unzipped = [];
    ok('one whose log came out of its zip needs reading only where the zip is read', P._needs(zOld, true, zIssue.fields.attachment) && !P._needs(zOld, false, zIssue.fields.attachment) &&
        P._logsCurrent(zOld, zIssue.fields.attachment, false) && !P._logsCurrent(zOld, zIssue.fields.attachment, true));
    rec = await P._readFiles(zIssue, zOld, false);
    ok('...left as it is there, nothing downloaded', texts.length === 0 && bytes.length === 0 && rec.exc.length === 1 && rec.lv === undefined, J(rec).slice(0, 120));
    rec = await P._readFiles(zIssue, zOld, true);
    ok('...and with the zip, the zip read again, its log with it', bytes.length === 1 && /logs\.txt/.test(unzipped.join()) && rec.lv === P.LOG_V && rec.zip === true &&
        rec.exc.some((e) => e.sig === fData.sig), unzipped.join(' / ') + ' ' + J(rec).slice(0, 120));
    P.unzip = realUnzip;
    // The profile's own build reads such a reading again, igbr.zip switched off or not.
    const realGm = global.gmGet;
    global.gmGet = (k, d) => (k === P.ZIP_KEY ? false : d);
    P._reports = () => Promise.resolve({ issues: [{ key: 'EBR-31', fields: { attachment: [att('logs.txt', 500)] } }], total: 1 });
    JiTA.db.getDefect = () => Promise.resolve(null);
    meta['rp:EBR-31'] = { v: P.V, key: 'EBR-31', logs: true, hasLog: true, exc: [], logSig: 'logs.txt:500', zip: false };
    texts = [];
    const built = await P.build('EDR-31', null, () => true);
    global.gmGet = realGm;
    ok('the profile\'s build reads a report\'s own logs again when they were read before stacktraces, the zip switched off', texts.length === 1 && meta['rp:EBR-31'].lv === P.LOG_V &&
        built && built.views[0].exc.some((ee) => ee.sig === fData.sig), texts.join() + ' ' + J(meta['rp:EBR-31']).slice(0, 100));

    // ================= the profile's words =================
    const tip = P._sigTip(fData.sig, MSG_DATA);
    ok('a stacktrace\'s hover says it is one, then its stack', tip.split('\n')[0] === 'Stacktrace: ' + MSG_DATA && /Stack, innermost last:\n {4}__init__\.py: callwrapper/.test(tip), tip);
    ok('...one cut off before its stack says that instead', /^Stacktrace: .*\n\nStack: cut off in the log, as the client cuts a stacktrace at 6400 characters$/.test(P._sigTip(fView.sig, MSG_VIEW)), P._sigTip(fView.sig, MSG_VIEW));
    ok('...with no message as written, the signature\'s, without its tag', P._sigTip(fView.sig).split('\n')[0] === 'Stacktrace: ' + MSG_VIEW.toLowerCase());
    ok('...an exception\'s as it was', P._sigTip('keyerror: 2|a.py:f>b.py:g', 'KeyError: 2') === 'KeyError: 2\n\nStack, innermost last:\n    a.py: f\n    b.py: g');
    ok('stacks of one message labelled apart, one cut off as such', J(P._pathLabels([['a.py:x', 'c.py:z'], ['b.py:y', 'c.py:z'], []])) === J(['a.py:x > …', 'b.py:y > …', '(stack cut off)']),
        J(P._pathLabels([['a.py:x', 'c.py:z'], ['b.py:y', 'c.py:z'], []])));
    ok('...and as before without one', J(P._pathLabels([['a.py:x', 'c.py:z'], ['b.py:y', 'c.py:z']])) === J(['a.py:x > …', 'b.py:y > …']));
    const view = (key, exc) => ({ key, created: '2026-10-01T00:00:00.000+0000', lang: 'English', hw: null, logRead: true, exc, crashRead: null, crashes: [] });
    const T = { sig: fData.sig, msg: MSG_DATA };
    const sm = P.summarise([1, 2, 3, 4, 5].map((i) => view('EBR-' + i, [T])).concat([view('EBR-6', [{ sig: 'keyerror: 2|a.py:f>b.py:g', msg: 'KeyError: 2' }])]), null);
    ok('the profile counts a stacktrace as it counts an exception, and says what an outlier lacks', sm.domExc && sm.domExc.sig === fData.sig &&
        sm.outliers.length === 1 && /its log lacks the stacktrace 5 of 6 logs share/.test(sm.outliers[0].why.join()), J(sm.outliers));
    const sg = P.summarise([view('EBR-1', [T, { sig: fView.sig, msg: MSG_VIEW }]), view('EBR-2', [T, { sig: fView.sig, msg: MSG_VIEW }])], null);
    ok('...grouped by its message, a cut one under its own', sg.excGroups.length === 2 && sg.excGroups.every((g) => L.isTrace(g.key)), J(sg.excGroups.map((g) => g.key)));

    // ================= the exception search =================
    const d1 = X._fps('Steps. ' + code + ' and ' + msgCol(VIEW).join('\n'));
    ok('a description gives its stacktraces, a cut one too', J(d1.map((e) => e.sig)) === J([fData.sig, fView.sig]) && d1.every((e) => !('open' in e)), J(d1));
    const d2 = X._fps('Steps. ' + flat);
    ok('...one whose lines Jira joined says it may run on', d2.length === 1 && d2[0].open === true && d2[0].sig === fFlat.sig);
    ok('...and a description of neither kind gives none', X._fps('just words, Traced at nothing').length === 0);
    const ts = X.targets(d2, null, null, null, null);
    ok('a target from it is open', ts.length === 1 && ts[0].open === true && ts[0].desc === true);
    const tp = X.targets(null, null, null, null, { typed: [], pasted: [{ sig: fFlat.sig, msg: fFlat.msg, open: true }], n: 0 });
    ok('...and so is one pasted so', tp.length === 1 && tp[0].open === true && tp[0].own === true && !tp[0].desc);
    ok('...while one that is not stays as it is', X.targets(d1, null, null, null, null).every((t) => !t.open));
    const e = (f, msg) => X._exc(f.sig, msg === undefined ? f.msg : msg);
    ok('a stacktrace as matching needs it: its message without the tag, and no frames when cut', e(fData).st === true && e(fData).m === MSG_DATA.toLowerCase() &&
        e(fView).fr === '' && e(fView).m === MSG_VIEW.toLowerCase() && e(asExc).st === false && e(asExc).m === MSG_LOCK.toLowerCase());
    const rep = (key, list) => X._entry({ key, fields: {} }, { exc: list.map((f) => ({ sig: f.sig, msg: f.msg })) }, {});
    const t0 = (f, extra) => Object.assign({ sig: f.sig, crash: L._crashOf(f.sig), msg: f.msg }, extra || {});
    const hit = (r, t) => { const h = X.match(r, [t])[0]; return !h ? 'none' : (h.exact ? 'exact' : (h.bare ? 'bare' : 'site')); };
    ok('a stacktrace is found by its stack', hit(rep('EBR-1', [fData2]), t0(fData)) === 'exact');
    ok('...at its site, loosely', hit(rep('EBR-2', [site]), t0(fLock)) === 'site');
    ok('...one cut off before its stack by its message, loosely', hit(rep('EBR-3', [dataCut]), t0(fData)) === 'bare' && hit(rep('EBR-4', [viewWhole]), t0(fView)) === 'bare' &&
        hit(rep('EBR-5', [fView]), t0(fView)) === 'bare');
    ok('...and with no message as written to go by, by the signature\'s', hit(rep('EBR-26', [{ sig: fView.sig }]), t0(dataCut)) === 'none' &&
        hit(rep('EBR-27', [{ sig: dataCut.sig }]), t0(fData)) === 'bare');
    ok('...but not by another message, nor as written another', hit(rep('EBR-6', [fView]), t0(dataCut)) === 'none' &&
        hit(rep('EBR-7', [L._fingerprint(trace({ n: 1, time: '01:00:00', msg: MSG_DATA.replace('redraw', 'Redraw now'), dump: ['x'] }).join('\n'))]), t0(fData)) === 'none');
    const n1 = numbered(1000000000001), n2 = numbered(1000000000002);
    ok('...and looked for as written, numbers and all, as an exception is', hit(rep('EBR-8', [n2]), t0(n1)) === 'none' && hit(rep('EBR-9', [n1]), t0(n1)) === 'exact');
    ok('an exception never finds a stacktrace, nor one the other, even with the same message and stack', hit(rep('EBR-10', [fLock]), t0(asExc)) === 'none' &&
        hit(rep('EBR-11', [asExc]), t0(fLock)) === 'none' && hit(rep('EBR-12', [fLock]), X._withPattern(t0(asExc), '*')) === 'none');
    const typed = X._typed({ id: 'typed:1', text: MSG_LOCK });
    ok('a typed message finds a stacktrace of it, at any stack', hit(rep('EBR-13', [fLock2]), typed) === 'site' && X.match(rep('EBR-13', [fLock2]), [typed])[0].t.typed);
    const edited = X._withPattern(t0(fData), '_DetectAndFixMissingHudModules found missing modules in spaceUI *');
    ok('an edited stacktrace is found by its edit at its stack, and in a cut one by its edit alone', hit(rep('EBR-14', [fData2]), edited) === 'exact' &&
        hit(rep('EBR-15', [fView]), edited) === 'bare' && hit(rep('EBR-16', [L._fingerprint(trace({ n: 2, time: '01:00:00', msg: MSG_DATA, frames: LOCK_F }).join('\n'))]), edited) === 'none');
    const open = t0(fFlat, { open: true });
    ok('a run-on stacktrace from a description is found at its frames, by the start of its message', hit(rep('EBR-17', [fData2]), open) === 'exact' && hit(rep('EBR-18', [dataCut]), open) === 'bare');
    ok('...not at another stack, nor by another message', hit(rep('EBR-19', [L._fingerprint(trace({ n: 2, time: '01:00:00', msg: MSG_DATA, frames: LOCK_F }).join('\n'))]), open) === 'none' &&
        hit(rep('EBR-20', [L._fingerprint(trace({ n: 2, time: '01:00:00', msg: MSG_VIEW, frames: HUD }).join('\n'))]), open) === 'none');
    ok('...where an unopened one with that message would not have been found at all', hit(rep('EBR-21', [fData2]), t0(fFlat)) === 'none');
    const shortRun = L._fingerprint(msgCol(trace({ n: 6, time: '01:00:00', msg: MSG_LOCK, dump: ['', 'one short line after it'], frames: LOCK_F })).join(' '));
    ok('...a short one too, by the start of its message, though it is no message cut short', shortRun.open && shortRun.msg.length < X.MSG_CUT &&
        shortRun.msg !== MSG_LOCK && hit(rep('EBR-28', [fLock]), t0(shortRun, { open: true })) === 'exact', shortRun.msg);
    const lockCut = L._fingerprint(trace({ n: 4, time: '01:00:00', msg: MSG_LOCK, dump: ['x'] }).join('\n'));
    ok('a report holding a stacktrace both at its site and cut off says the better: its site', hit(rep('EBR-22', [lockCut, site]), t0(fLock)) === 'site' &&
        hit(rep('EBR-23', [site, lockCut]), t0(fLock)) === 'site' && hit(rep('EBR-24', [lockCut, fLock2, fData2]), t0(fLock)) === 'bare');
    ok('...and its stack over both', hit(rep('EBR-25', [lockCut, site, fLock]), t0(fLock)) === 'exact');
    // the box below the list
    const st = { added: { typed: [], pasted: [], n: 0 }, targets: [], on: {}, addMsg: { textContent: '' }, node: null, key: 'EDR-1' };
    const box = (v) => ({ value: v });
    X._addOwn(st, box(msgCol(LOCK).join('\n')));
    ok('a stacktrace pasted into the box is looked for at its stack, ticked', st.added.pasted.length === 1 && st.added.pasted[0].sig === fLock.sig && st.on[fLock.sig] === true, J(st.added.pasted));
    X._addOwn(st, box(LOCK2.join('\n')));
    ok('...so is one pasted with its log columns', st.added.pasted.length === 2 && st.added.pasted[1].sig === fLock2.sig);
    X._addOwn(st, box('Traced at:\n' + msgCol(DATA).slice(-5).join('\n')));
    ok('...but a stack without the line with its message is refused, and says what to paste', st.added.pasted.length === 2 && /from EXCEPTION # or STACKTRACE # on/.test(st.addMsg.textContent),
        st.addMsg.textContent);
    st.added = { typed: [], pasted: [], n: 0 }; st.on = {};
    X._addOwn(st, box(msgCol(LOCK).join('\n') + '\n' + msgCol(VIEW).join('\n')));
    ok('...and two pasted at once are each looked for as itself', J(st.added.pasted.map((p) => p.sig)) === J([fLock.sig, fView.sig]), J(st.added.pasted.map((p) => p.sig)));
    ok('an edit starts from the message as written; without one, the signature\'s, without its tag', X._editText({ sig: fView.sig, msg: '' }) === MSG_VIEW.toLowerCase() &&
        X._editText({ sig: 'keyerror: 2|a.py:f', msg: '' }) === 'keyerror: 2');

    // ================= the ranking boost =================
    // EDR-2's attached reports share its cut stacktrace too: counted once.
    JiTA.profile._last = { 'EDR-2': { summary: { excGroups: [{ msg: MSG_VIEW, paths: [{ sig: fView.sig, count: 2 }] }] } } };
    const sigsOf = { 'EDR-1': { sigs: [fData.sig], crashes: [fData.crashSig], cuts: [] }, 'EDR-2': { sigs: [], crashes: [], cuts: [fView.sig] },
        'EDR-9': { sigs: [], crashes: [], cuts: [fView.sig] } };
    L.sigsOf = (k) => Promise.resolve(sigsOf[k] || { sigs: [], crashes: [], cuts: [] });
    const ds1 = await R._defectSigs('EDR-1'), ds2 = await R._defectSigs('EDR-2'), ds9 = await R._defectSigs('EDR-9');
    ok('a defect\'s stacktraces, by stack and by message; a cut one by its message only, once', ds1.sigs[fData.sig] && ds1.traces[tk(fData.sig)] && ds1.n === 1 &&
        !ds2.sigs[fView.sig] && ds2.cuts[tk(fView.sig)] && ds2.traces[tk(fView.sig)] && ds2.n === 1, J([ds1, ds2]));
    ok('...a cut one pasted in its description counts with no report sharing it', ds9.cuts[tk(fView.sig)] && ds9.n === 1 && R._kind([viewWhole.sig], ds9) === 'st-msg', J(ds9));
    ok('a report\'s log holding the same stacktrace raises it: st-exact', R._kind([fData2.sig], ds1) === 'st-exact');
    ok('...the same site: st-site', R._kind([L._fingerprint(trace({ n: 2, time: '01:00:00', msg: MSG_DATA, frames: [B + 'z/a.py(1) Z'].concat(HUD.slice(-2)) }).join('\n')).sig], ds1) === 'st-site');
    ok('...one cut off, by its message: st-msg, both ways', R._kind([dataCut.sig], ds1) === 'st-msg' && R._kind([viewWhole.sig], ds2) === 'st-msg' && R._kind([fView.sig], ds2) === 'st-msg');
    ok('...none of another message', R._kind([fView.sig], ds1) === null && R._kind([fData.sig], ds2) === null);
    const ds7 = { sigs: { [k7.sig]: true, [fLock2.sig]: true }, crashes: { [k7.crashSig]: true, [fLock2.crashSig]: true }, traces: {}, cuts: {}, n: 2 };
    ok('...the best kind of all it holds: the level first, then an exception over a stacktrace', R._kind([fLock2.sig, k7.sig], ds7) === 'exact' && R._kind([k7site.sig, fLock2.sig], ds7) === 'st-exact');
    ok('every kind raises by its factor, a stacktrace as much as an exception', R.KINDS.every((k) => typeof R.FACTOR[k] === 'number' && R.BADGE[k]) &&
        R.FACTOR['st-exact'] === R.FACTOR.exact && R.FACTOR['st-site'] === R.FACTOR.site && R.FACTOR['st-msg'] === R.FACTOR.site && J(R.KINDS) === J(['exact', 'st-exact', 'site', 'st-site', 'st-msg']));
    const r = { score: 1, rrf: 1, pct: 50 };
    JiTA.rank._boostRow(r, 'st-msg');
    ok('...and the row notes it', r.pct === Math.round(50 * R.FACTOR['st-msg']) && r.excHit === 'st-msg', J(r));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'stacktrace checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
