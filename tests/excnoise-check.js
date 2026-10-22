// excnoise-check.js - exceptions that don't count (v3.46.0): UserErrors (messages the game shows the player), ones the user
// ignores (their message at any stack) and ones common in the open reports' logs, as the background reader counts them.
// They raise no match, point at no defect and make no pattern, and are listed apart. Evals the real JiTA.excnoise, the
// logsig index and lookups (tab and worker, which must agree), the log scan's merge and its display filter, the parser's
// marks, the ranking boost, the defect profile's summary, the exception search's targets and add box, and the
// background reader's count, against stubs.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const once = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return s;
};
const member = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n    },', s) + 7); };
const line = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n', s) + 1); };
const block = (head, end) => { const s = once(head); return src.slice(s, src.indexOf(end, s) + end.length); };
const lsMember = (head) => { const at = once('\nJiTA.logsig = {'), s = src.indexOf(head, at); return src.slice(s, src.indexOf('\n    },', s) + 7); };
const uiMember = (head) => { const at = once('\nJiTA.ui = {'), s = src.indexOf(head, at); return src.slice(s, src.indexOf('\n    },', s) + 7); };

let fail = 0;
const ok = (n, c, x) => { process.stdout.write((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || '')) + '\n'); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 20; i++) { await new Promise((r) => setImmediate(r)); } };
const J = (x) => JSON.stringify(x);

// ---- the real code, over GM and meta stubs ----
let gm = {}, gmSets = [];
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? JSON.parse(JSON.stringify(gm[k])) : d);
global.gmSet = (k, v) => { gm[k] = JSON.parse(JSON.stringify(v)); gmSets.push(k); };
global.flagOn = () => true;
global.GM_addStyle = () => {};
global.confirm = () => true;
global.JITA_NO_JIRA_UI = false;
let meta = {}, metaReads = 0, metaSets = [];
global.JiTA = { HOST: 'https://jira', EBR_SCOPE: 'project = EBR AND statusCategory != Done', PAGE_SIZE: 100, util: {}, logsig: {}, ocr: {}, db: {}, sync: {}, ui: {}, menu: {},
    hidden: { isHidden: () => false }, worker: { usable: () => false }, rank: {} };
JiTA.db.getMeta = (k) => { metaReads++; return Promise.resolve(Object.prototype.hasOwnProperty.call(meta, k) ? meta[k] : null); };
JiTA.db.setMeta = (k, v) => { meta[k] = v; metaSets.push(k); return Promise.resolve(); };
Object.assign(JiTA.util, eval('({' + member('    toPlainText: function (d) {') + member('    isResolved: function (status, resolution) {') + member('    isClosedStatus: function (status) {') + member('    hash: function (str) {') +
    member('    isGmTeam: function (v) {') + member('    teamId: function (v) {') + member('    jqlSince: function (iso, now) {') + '})'));
JiTA.util.fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : '');
JiTA.util.delay = () => Promise.resolve();
JiTA.ocr._langFromLabels = () => null;
const L = JiTA.logsig;
Object.assign(L, eval('({' + line('    MIN_FRAMES: ') + line('    CRASH_FRAMES: ') + line('    TRACE: ') + line('    OPEN_CUT: ') + line('    isTrace: function (sig) {') +
    line('    isCut: function (sig) {') + line('    _traceKey: function (sig) {') + line('    _msgKey: function (sig) {') + line('    isUserError: function (sig) {') +
    member('    _splitBlocks: function (text) {') + member('    _fingerprint: function (text) {') + lsMember('    ensure: function () {') + member('    applyToTable: function () {') +
    member('    rematch: function () {') + member('    _logBlocks: function (text) {') + member('    _matchTextLocal: function (text) {') + member('    _defectsLocal: function (sigs) {') +
    member('    _holdingLocal: function (sigs) {') + member('    _sigsOfLocal: function (key) {') + member('    _crashOf: function (sig) {') + member('    _traceMates: function (idx, sig) {') +
    member('    _pointAt: function (idx, sig, crashSig) {') + member('    defectsForSigs: function (sigs) {') + member('    holding: function (sigs) {') + member('    sigsOf: function (key) {') + '})'));
L._index = null; L._dirty = true; L._building = null;
eval(block('JiTA.excnoise = {', '\n};\n'));
eval(block('JiTA.profile = {', '\n    _noop: null\n};\n'));
eval(block('JiTA.excfind = {', '\n    _noop: null\n};\n'));
(0, eval)(block('JiTA.repexc = {', '\n    _noop: null\n};\n'));
(0, eval)(block('JiTA.logread = {', '\n    _noop: null\n};\n'));
Object.assign(JiTA.ui, eval('({' + uiMember('    _counting: function (found) {') + uiMember('    _scanIssueLog: function (key) {') + '})'));
const reread = () => { JiTA.excnoise._freqRead = Date.now() - JiTA.excnoise.LOAD_MS - 1; return JiTA.excnoise.load(); };
const N = JiTA.excnoise, P = JiTA.profile, X = JiTA.excfind, R = JiTA.repexc, LR = JiTA.logread;
// The worker's copies, from jitaWorkerBody itself.
const W = new Function('isClosedStatus', 'isGmTeam', 'tokenize', 'effectiveText', 'cfg',
    'var vecCache = null, kwCache = null, logsigCache = null;\n' + line('    var LG_MIN = 2') + line('    var LG_TRACE = ') +
    src.slice(once('    // ---- logsig: exception-signature mining'), once('\n    // One load at a time')) +
    src.slice(once('    function buildIndexes(recs) {'), once('    // Cosine == dot product')) +
    '\nreturn { isUserError: lgIsUserError, match: lgMatch, holding: lgHolding, build: function (r) { buildIndexes(r); return logsigCache; } };')(
    () => false, () => false, (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean), (r) => (r.summary || '') + ' ' + (r.description || ''), { MODEL_VERSION: 'm' });

// ---- logs as the client writes them ----
const col = (t, type) => t + '\tclient::general\t' + (type || 'warning') + '\t';
const B = '/build/eve/release/V23.02/';
function exc(n, time, msg, frames, type) {
    return ['EXCEPTION #' + n + ' logged at 04/12/2026 ' + time + ' : Unhandled exception in <TaskletExt object at 0xd2251b858>', ' ', 'Formatted exception info: ' + msg, ' ',
        'Common path prefix = ', ' ', 'Thrown at:'].concat(frames).concat(['Stackhash: -1723', 'EXCEPTION END', '']).map((l) => col(time, type) + l);
}
const msgCol = (lines) => lines.map((l) => l.split('\t').slice(3).join('\t'));
const FT = [B + 'carbonui/uilib.py(488) CheckAccelerators', B + 'eve/client/script/ui/eveCommands.py(1144) CmdStopShip', B + 'carbon/common/script/net/moniker.py(400) __call__'];
const FK = [B + 'eve/client/script/ui/inflight/shipHud/groupAllIcon.py(32) OnClick', B + 'eve/client/script/dogma/clientDogmaLocation.py(985) LinkAllWeapons'];
const FO = [B + 'packages/publicGateway/notice/signal_registry.py(40) Run', B + 'packages/careergoals/client/messenger.py(77) RequestAll'];
const THROTTLE = (ms) => exc(96, '20:33:30', "UserError: User error, msg=ThrottleGeneric, dict={'remainingTime': " + ms + 'L}', FT);
const SESSION = exc(97, '20:33:31', "UserError: User error, msg=PerformSessionChangeInProgress, dict={'reason': u'Please wait while station services load'}", FT.slice(1));
const KEYERR = (id) => exc(98, '20:33:37', 'KeyError: ' + id + 'L', FK, 'error');
const TIMEOUT = (frames) => exc(5, '11:30:24', 'TimeoutException', frames || FO, 'error');
const fpOf = (lines) => L._fingerprint(L._logBlocks(lines.join('\n'))[0]);
const fT = fpOf(THROTTLE(6093158)), fT2 = fpOf(THROTTLE(7809155)), fS = fpOf(SESSION), fK = fpOf(KEYERR(1053350297975)), fO = fpOf(TIMEOUT());
const fO2 = fpOf(TIMEOUT([B + 'packages/other/place.py(1) Elsewhere', B + 'packages/other/deeper.py(2) Deeper']));

(async () => {
    // ================= UserErrors =================
    ok('a UserError is one by its signature: ThrottleGeneric, a session change in progress', L.isUserError(fT.sig) && L.isUserError(fS.sig) && fT.sig === fT2.sig, fT.sig);
    ok('...its module named or not', L.isUserError("eveexceptions.usererror: user error, msg=x|a.py:f>b.py:g") && L.isUserError('carbon.common.usererror: x|a.py:f>b.py:g'));
    ok('...but not a KeyError, nor another class that only starts or ends alike, nor a stacktrace', !L.isUserError(fK.sig) && !L.isUserError('usererrorwithdetails: x|a.py:f') &&
        !L.isUserError('notausererror: x|a.py:f') && !L.isUserError(L.TRACE + 'usererror: x|a.py:f>b.py:g') && !L.isUserError(null));
    const samples = [fT.sig, fS.sig, fK.sig, "eveexceptions.usererror: user error, msg=x|a.py:f>b.py:g", 'usererrorwithdetails: x|a.py:f', L.TRACE + 'usererror: x|a', null];
    ok('the worker tells them apart the same', samples.every((s) => W.isUserError(s) === L.isUserError(s)));
    ok('a signature\'s message part is what comes before its frames, or the whole of it', L._msgKey(fK.sig) === fK.sig.slice(0, fK.sig.lastIndexOf('|')) && L._msgKey('no bar') === 'no bar' &&
        L._msgKey(L.TRACE + 'm|') === L.TRACE + 'm' && L._msgKey('keyerror: a|b|x.py:f>y.py:g') === 'keyerror: a|b');

    // ================= the rules =================
    ok('a UserError does not count; a KeyError does', N.why(fT.sig) === 'user' && N.counts(fK.sig) && N.why(fK.sig) === '' && !N.counts(fT.sig));
    N.ignore(fO.sig, 'TimeoutException');
    ok('one the user ignores does not count, its message at any stack, and is kept in GM', N.why(fO.sig) === 'ignored' && N.why(fO2.sig) === 'ignored' && gmSets.indexOf(N.IGNORE_KEY) >= 0 &&
        Object.keys(gm[N.IGNORE_KEY]).join() === L._msgKey(fO.sig) && gm[N.IGNORE_KEY][L._msgKey(fO.sig)].msg === 'TimeoutException', J(gm[N.IGNORE_KEY]));
    N.ignore(fK.sig, '  KeyError:\n 1053350297975L  ');
    N._ignored()[N.keyOf(fO.sig)].at = 1; N._ignored()[N.keyOf(fK.sig)].at = 2;
    ok('...listed, the latest first, to count again by its key, each as written on one line', J(N.list().map((x) => x.key)) === J([N.keyOf(fK.sig), N.keyOf(fO.sig)]) &&
        N.list()[0].msg === 'KeyError: 1053350297975L' && N.list()[1].msg === 'TimeoutException', J(N.list()));
    N.unignoreAll();
    ok('Count all again counts every one again, kept in GM', N.list().length === 0 && !N.isIgnored(fO.sig) && !N.isIgnored(fK.sig) && J(gm[N.IGNORE_KEY]) === '{}');
    N.ignore(fO.sig, 'TimeoutException');
    N.ignore(fT.sig, 'UserError: ThrottleGeneric');
    ok('a UserError the user also ignores is told as a UserError first', N.why(fT.sig) === 'user');
    N.unignore(N.keyOf(fT.sig));
    // Common: counted over the open reports' logs.
    meta[N.FREQ_KEY] = { at: Date.now() - 3600e3, n: 100, c: { [fK.sig]: 12 } };
    await reread();
    ok('one in 5% or more of the open reports\' logs, and 10 of them at least, is common', N.why(fK.sig) === 'common' && Math.abs(N.share(fK.sig) - 0.12) < 1e-9 && /12% of the open reports/.test(N.label('common', fK.sig)),
        N.why(fK.sig) + ' ' + N.share(fK.sig));
    meta[N.FREQ_KEY] = { at: Date.now() - 3600e3, n: 1000, c: { [fK.sig]: 12 } };
    await reread();
    ok('...not when that is under 5%', N.why(fK.sig) === '' && N.share(fK.sig) === 0);
    meta[N.FREQ_KEY] = { at: Date.now() - 3600e3, n: 50, c: { [fK.sig]: 9 } };
    await reread();
    ok('...nor when in fewer than 10 logs, however large a share', N.why(fK.sig) === '');
    meta[N.FREQ_KEY] = { at: Date.now() - N.STALE_MS - 1, n: 100, c: { [fK.sig]: 50 } };
    await reread();
    ok('...nor by a count too old to go by (the background reader off)', N.why(fK.sig) === '');
    meta[N.FREQ_KEY] = { at: Date.now() - 3600e3, n: 100, c: { [fK.sig]: 50 } };
    await reread();
    N.countAnyway(fK.sig, true);
    ok('a common one the user counts anyway counts, kept in GM', N.why(fK.sig) === '' && gm[N.COUNT_KEY][fK.sig] > 0 && N.countedAnyway() === 1);
    N.countAnyway([fK.sig], false);
    ok('...and is common again once that is taken back', N.why(fK.sig) === 'common' && N.countedAnyway() === 0 && J(gm[N.COUNT_KEY]) === '{}');
    N.countAnyway([fK.sig, fO.sig], true);
    N.uncountAll();
    ok('...as is every one, all at once', N.why(fK.sig) === 'common' && N.countedAnyway() === 0 && J(gm[N.COUNT_KEY]) === '{}');
    ok('the reasons read as written beside one set apart', N.label('user', fT.sig) === 'UserError: a message the game shows the player' && N.label('ignored', fO.sig) === 'ignored by you' && N.label('', fK.sig) === '');
    ok('Settings says how they stand', /^UserErrors never count · 1 ignored by you · 1 common, counted \d{4}-\d\d-\d\d over 100 open reports' logs\.$/.test(N.summary()), N.summary());

    // ================= loading the count, and what a change does =================
    let resets = 0, rematches = 0, renders = 0, retargets = 0;
    R.reset = ((real) => () => { resets++; real(); })(R.reset);
    L.rematch = () => { rematches++; };
    JiTA.ui.scheduleRender = () => { renders++; };
    JiTA.triage = { _cache: { 'EBR-1': 1 } };
    const reads0 = metaReads;
    await N.load(); await N.load();
    ok('the count is read at most every few minutes', metaReads === reads0);
    const gen0 = N.gen;
    meta[N.FREQ_KEY] = { at: Date.now() - 3600e3, n: 100, c: { [fK.sig]: 50, [fO.sig]: 30 } };
    await reread();
    ok('a count read later that makes more of them common changes what counts: worked out anew, drawn again', N.gen === gen0 + 1 && resets === 1 && rematches === 1 && renders === 1 &&
        J(JiTA.triage._cache) === '{}', J({ gen: N.gen - gen0, resets, rematches, renders }));
    meta[N.FREQ_KEY] = { at: Date.now() - 1000, n: 100, c: { [fK.sig]: 51, [fO.sig]: 31 } };
    await reread();
    ok('...one that changes no one\'s standing changes nothing', N.gen === gen0 + 1 && renders === 1);
    N._freq = null; N._freqRead = 0;
    meta[N.FREQ_KEY] = { at: Date.now() - 1000, n: 100, c: { [fK.sig]: 51 } };
    const r0 = renders;
    await N.load();
    ok('...nor does the first read in a tab: what goes by it waits for it', renders === r0);
    X._st = { tsig: 'x' };
    X._retarget = (st) => { retargets++; st.tsig = 'redone'; };
    N.ignore(fS.sig, 'x');
    ok('ignoring one has the open exception search look again at what it offers', retargets === 1 && X._st.tsig === 'redone' && renders === r0 + 1);
    N.unignore(N.keyOf(fS.sig));
    X._st = null;
    N._ign = null;
    const sawO = N.isIgnored(fO.sig);   // the list read now
    gm[N.IGNORE_KEY] = { [N.keyOf(fK.sig)]: { msg: 'from another tab', at: 1 } };
    ok('the GM lists are read once, until dropped (another tab changed them)', sawO && !N.isIgnored(fK.sig) && N.isIgnored(fO.sig));
    N._drop();
    ok('...after which the other tab\'s ignoring holds here', N.isIgnored(fK.sig) && N.why(fK.sig) === 'ignored');
    gm[N.IGNORE_KEY] = { [N.keyOf(fO.sig)]: { msg: 'TimeoutException', at: 2 } }; N._drop();
    const boot = src.slice(once('// ---- Jira boot:'));
    ok('every tab hears the lists change: dropped at once, and what counts worked out anew when the change came from another tab',
        /\[JiTA\.excnoise\.IGNORE_KEY, JiTA\.excnoise\.COUNT_KEY\]\.forEach\(function \(k\) \{\s*GM_addValueChangeListener\(k, function \(name, oldV, newV, remote\) \{\s*JiTA\.excnoise\._drop\(\);[^\n]*\n\s*if \(remote\) \{ JiTA\.excnoise\._changed\(\); \}/.test(boot));

    // ================= the background reader's count =================
    const t = N.tally();
    for (let i = 0; i < 40; i++) { N.count(t, i < 12 ? [{ sig: fK.sig }, { sig: fO.sig }] : (i < 20 ? [{ sig: fO.sig }] : [])); }
    const tab = N.table(t, 123);
    ok('a pass counts, per signature, in how many reports\' logs it is, keeping those past both thresholds', tab.at === 123 && tab.n === 40 && tab.c[fK.sig] === 12 && tab.c[fO.sig] === 20 &&
        Object.keys(tab.c).length === 2, J({ n: tab.n, c: Object.keys(tab.c).map((s) => tab.c[s]) }));
    const t2 = N.tally();
    for (let i = 0; i < 9; i++) { N.count(t2, [{ sig: fK.sig }]); }
    ok('...not one in fewer than 10, nor keeping its whole signature until then', J(N.table(t2, 1).c) === '{}' && Object.keys(t2.s).length === 0 && Object.keys(t2.h).length === 1);
    const t3 = N.tally();
    for (let i = 0; i < 400; i++) { N.count(t3, i < 12 ? [{ sig: fK.sig }] : []); }
    ok('...nor one in 10 or more that are under 5% of them', J(N.table(t3, 1).c) === '{}' && t3.s[Object.keys(t3.h)[0]] === fK.sig);
    // The pass itself.
    let posted = [], readItems = [];
    JiTA.excfind.SCOPE = 'SCOPE';
    JiTA.sync._apiPost = (path, body) => { posted.push(body); return Promise.resolve({ data: { issues: [1, 2, 3].map((i) => ({ key: 'EBR-' + i, fields: { status: { name: 'Open' }, labels: [], attachment: [] } })), isLast: true } }); };
    const readings = { 'EBR-1': { logs: true, hasLog: true, exc: [{ sig: fK.sig }] }, 'EBR-2': { logs: true, hasLog: true, exc: [{ sig: fK.sig }] }, 'EBR-3': { logs: true, hasLog: false, exc: [] } };
    X._read = (item) => { readItems.push(item.key); return Promise.resolve({ rec: readings[item.key], cached: true }); };
    JiTA.ui._isReportsKey = () => false;
    const log0 = console.log; console.log = () => {};
    const passOf = async () => { posted = []; readItems = []; metaSets = []; await LR.pass(); await flush(); };
    N.COMMON_MIN = 2; N.COMMON_PCT = 0.5;   // three reports here
    meta = { logreadAt: { at: new Date(Date.now() - 3600e3).toISOString(), lv: P.LOG_V } };
    await passOf();
    ok('with no count yet, a pass lists every open report, notes when it began, and leaves the count', posted[0].jql === 'SCOPE ORDER BY created DESC' &&
        meta[N.TRIED_KEY] > 0 && meta[N.FREQ_KEY] && meta[N.FREQ_KEY].n === 2 && meta[N.FREQ_KEY].c[fK.sig] === 2, posted[0] && posted[0].jql + ' ' + J(meta[N.FREQ_KEY]));
    ok('...which this tab goes by at once', N.why(fK.sig) === 'common' && N._freq === meta[N.FREQ_KEY]);
    meta[N.TRIED_KEY] = Date.now() - N.RETRY_MS - 1;
    await passOf();
    ok('a fresh count leaves a pass listing only the reports updated since the last one, and counting nothing', / AND updated >= "/.test(posted[0].jql) && metaSets.indexOf(N.FREQ_KEY) < 0, posted[0].jql);
    meta[N.FREQ_KEY] = { at: Date.now() - N.FREQ_MS - 1, n: 2, c: {} };
    meta[N.TRIED_KEY] = Date.now() - 60e3;
    await passOf();
    ok('an old count is not done again within hours of the last try at it', / AND updated >= "/.test(posted[0].jql) && metaSets.indexOf(N.FREQ_KEY) < 0);
    meta[N.TRIED_KEY] = Date.now() - N.RETRY_MS - 1;
    readings['EBR-2'] = null;   // one that cannot be read
    await passOf();
    ok('...but after that, it is: every report listed, the count left even though one could not be read', posted[0].jql === 'SCOPE ORDER BY created DESC' &&
        metaSets.indexOf(N.FREQ_KEY) >= 0 && meta[N.FREQ_KEY].n === 1, J(meta[N.FREQ_KEY]));
    readings['EBR-2'] = { logs: true, hasLog: true, exc: [{ sig: fK.sig }] };
    meta[N.FREQ_KEY] = { at: Date.now() - N.FREQ_MS - 1, n: 2, c: {} };
    meta[N.TRIED_KEY] = Date.now() - N.RETRY_MS - 1;
    const post0 = JiTA.sync._apiPost;
    JiTA.sync._apiPost = (path, body) => (body.nextPageToken ? Promise.reject(new Error('HTTP 503')) :
        Promise.resolve({ data: { issues: [{ key: 'EBR-1', fields: { status: { name: 'Open' }, labels: [], attachment: [] } }], nextPageToken: 'p2' } }));
    await passOf();
    ok('a pass that could not list every report leaves no count: it would leave out what it missed', metaSets.indexOf(N.FREQ_KEY) < 0 && meta[N.TRIED_KEY] > Date.now() - 60e3 &&
        J(readItems) === J(['EBR-1']), J(metaSets));
    JiTA.sync._apiPost = post0;
    console.log = log0;
    N.COMMON_MIN = 10; N.COMMON_PCT = 0.05;
    N._freq = null; N._freqRead = Date.now();   // nothing common from here on, until set again

    // ================= the index: UserErrors are not indexed =================
    const recs = [
        { key: 'EDR-1', project: 'EDR', status: 'Open', created: '2026-10-01T00:00:00.000+0000', description: msgCol(THROTTLE(1)).join('\n') + '\n' + msgCol(KEYERR(5)).join('\n') },
        { key: 'EDR-2', project: 'EDR', status: 'Open', created: '2026-10-02T00:00:00.000+0000', description: msgCol(TIMEOUT()).join('\n') },
        { key: 'EDR-3', project: 'EDR', status: 'Open', created: '2026-10-03T00:00:00.000+0000', description: msgCol(SESSION).join(' ') }
    ];
    JiTA.db.allDefects = () => Promise.resolve(recs);
    console.log = () => {};
    const idx = await L.ensure();
    console.log = log0;
    ok('a defect\'s pasted UserErrors are not indexed; its KeyError is', !idx.sigMap[fT.sig] && !idx.crashMap[fT.crashSig] && !!idx.sigMap[fK.sig] && !idx.keyToSigs['EDR-3'] &&
        J(idx.keyToSigs['EDR-1']) === J([fK.sig]), J(Object.keys(idx.sigMap)));
    ok('...so nothing points at a defect by one', L._pointAt(idx, fT.sig) === null && L._pointAt(idx, fS.sig) === null && L._pointAt(idx, fK.sig).key === 'EDR-1');
    ok('the worker indexes them alike', J(W.build(recs)) === J(idx));

    // ================= Known defects in attached log =================
    const LOG = [].concat(THROTTLE(1), KEYERR(7), TIMEOUT(), TIMEOUT(), KEYERR(8)).join('\n');
    const m = await L._matchTextLocal(LOG);
    ok('a log\'s defects say which signatures found them, how often, and whether loosely', m['EDR-1'].count === 2 && m['EDR-1'].sigs[fK.sig].n === 2 && m['EDR-1'].sigs[fK.sig].loose === false &&
        m['EDR-2'].sigs[fO.sig].n === 2 && !m['EDR-1'].sigs[fT.sig], J(m));
    ok('...the worker\'s the same', J(W.match(LOG)) === J(m), J(W.match(LOG)));
    gm[N.IGNORE_KEY] = { [N.keyOf(fO.sig)]: { msg: 'TimeoutException', at: 2 } }; N._drop();
    let shown = JiTA.ui._counting(m);
    ok('the list leaves out a defect found only by what the user ignores', J(Object.keys(shown).sort()) === J(['EDR-1']) && shown['EDR-1'].count === 2, J(Object.keys(shown)));
    const mixed = { 'EDR-9': { defect: 'EDR-9', count: 5, msg: 'x', loose: false, sigs: { [fO.sig]: { n: 4, loose: false }, [fK.sig]: { n: 1, loose: true } } } };
    shown = JiTA.ui._counting(mixed);
    ok('...and one found partly by it shows the rest: its count and "~" worked out again', shown['EDR-9'].count === 1 && shown['EDR-9'].loose === true, J(shown));
    shown = JiTA.ui._counting({ 'EDR-8': { defect: 'EDR-8', count: 3, msg: 'x', loose: false } });
    ok('...while one that names no signatures (an older worker) stays as it is', shown['EDR-8'].count === 3);
    // The scan of several logs merges them.
    let texts = { 'https://jira/a': 'A', 'https://jira/b': 'B' }, answers = {};
    global.$ = { ajax: () => { const d = { done(f) { setImmediate(() => f({ fields: { attachment: [{ filename: 'logs.txt', content: 'https://jira/a' }, { filename: 'other_log.txt', content: 'https://jira/b' }] } })); return d; }, fail() { return d; } }; return d; } };
    JiTA.ui._fetchText = (u) => Promise.resolve(texts[u]);
    JiTA.ui._logExc = {};
    const saveMatch = L.matchText, saveLogExc = P.logExceptions;
    P.logExceptions = () => [];
    L.matchText = (txt) => Promise.resolve(answers[txt]);
    answers = { A: { 'EDR-1': { defect: 'EDR-1', count: 1, msg: 'k', loose: true, sigs: { [fK.sig]: { n: 1, loose: true } } } },
        B: { 'EDR-1': { defect: 'EDR-1', count: 2, msg: 'k', loose: false, sigs: { [fK.sig]: { n: 1, loose: false }, [fO.sig]: { n: 1, loose: false } } } } };
    console.log = () => {};
    let merged = await JiTA.ui._scanIssueLog('EBR-50');
    ok('a report with two logs merges what found each defect in both', merged['EDR-1'].count === 3 && merged['EDR-1'].sigs[fK.sig].n === 2 && merged['EDR-1'].sigs[fK.sig].loose === false &&
        merged['EDR-1'].sigs[fO.sig].n === 1, J(merged));
    answers.B = { 'EDR-1': { defect: 'EDR-1', count: 2, msg: 'k', loose: false } };
    merged = await JiTA.ui._scanIssueLog('EBR-51');
    console.log = log0;
    ok('...and one log\'s result without them (an older worker) leaves the entry as it came', merged['EDR-1'].sigs === null && JiTA.ui._counting(merged)['EDR-1'].count === 3, J(merged));
    L.matchText = saveMatch; P.logExceptions = saveLogExc;
    const uiSrc = src.slice(once('\nJiTA.ui = {'));
    ok('the panel shows the list worked out so', /var found = JiTA\.ui\._counting\(scanned\);/.test(uiSrc.slice(uiSrc.indexOf('    renderLogLink: function (key, background) {'))));

    // ================= the parser's marks =================
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
    const rowOf = (l) => { const p = l.split('\t'), tr = El('TR'); [p[0], p[1], p[2], p.slice(3).join('\t')].forEach((x) => { const td = El('TD'); td.kids.push({ text: x }); tr.kids.push(td); }); tr.cells = tr.kids; return tr; };
    const rows = LOG.split('\n').map(rowOf);
    global.document = { getElementById: (id) => (id === 'tableContent' ? {} : null), querySelectorAll: (sel) => (sel === '#tableContent tbody tr' ? rows : []), createElement: (tg) => El(String(tg).toUpperCase()) };
    let found = null;
    L.renderPanel = (f) => { found = f; };
    await L.applyToTable();
    const marks = rows.map((r) => r.querySelectorAll('a.jita-sig-link').map((a) => a.textContent).join()).filter(Boolean);
    ok('the parser marks a log\'s KeyErrors, not what the user ignores, nor a UserError', J(marks) === J(['[EDR-1]', '[EDR-1]']) && J(Object.keys(found)) === J(['EDR-1']), J(marks));

    // ================= the ranking boost =================
    meta = { 'rp:EBR-1': { v: P.V, logs: true, exc: [{ sig: fT.sig }, { sig: fO.sig }] }, 'rp:EBR-2': { v: P.V, logs: true, exc: [{ sig: fT.sig }, { sig: fK.sig }] } };
    R._reads = {}; R._report = {};
    let asked = [];
    L.holding = (sigs) => { asked.push(sigs.slice()); return Promise.resolve(sigs.length ? { 'EDR-1': 'exact' } : {}); };
    await R.forReport('EBR-1');
    ok('a bug report whose log holds only a UserError and an ignored exception asks no defect', asked.length === 0, J(asked));
    await R.forReport('EBR-2');
    ok('...one that also holds a KeyError asks about the KeyError alone', J(asked) === J([[fK.sig]]), J(asked));
    L.sigsOf = () => Promise.resolve({ sigs: [fK.sig, fO.sig], crashes: [fK.crashSig, fO.crashSig], cuts: [] });
    P._last = { 'EDR-1': { summary: { excGroups: [{ msg: 'u', paths: [{ sig: fT.sig, count: 5 }] }, { msg: 'k', paths: [{ sig: fK.sig, count: 3 }] }] } } };
    const ds = await R._defectSigs('EDR-1');
    ok('a defect\'s exceptions are those that count: no UserError from its reports, none ignored from its description, nor their crash sites',
        ds.n === 1 && ds.sigs[fK.sig] && !ds.sigs[fT.sig] && !ds.sigs[fO.sig] && !ds.crashes[fO.crashSig] && ds.crashes[fK.crashSig], J(ds));
    meta['rp:EBR-3'] = { v: P.V, logs: true, exc: [{ sig: fO2.sig }] };
    meta['rp:EBR-4'] = { v: P.V, logs: true, exc: [{ sig: fK.sig }] };
    L.sigsOf = () => Promise.resolve({ sigs: [fO2.sig, fK.sig], crashes: [], cuts: [] });
    P._last = {};
    R._reads = {};
    const boost = await R.forDefect('EDR-2')(['EBR-3', 'EBR-4']);
    ok('...and a candidate report raises only by an exception that counts', J(boost) === J({ 'EBR-4': 'exact' }), J(boost));
    const fK2 = fpOf(exc(99, '20:33:40', 'KeyError: 1053350297975L', [B + 'eve/client/script/ui/shared/outer.py(5) Outer'].concat(FK), 'error'));
    meta['rp:EBR-5'] = { v: P.V, logs: true, exc: [{ sig: fK2.sig }] };
    L.sigsOf = () => Promise.resolve({ sigs: [fK.sig], crashes: [], cuts: [] });
    R._reads = {};
    const boost2 = await R.forDefect('EDR-1')(['EBR-5']);
    ok('(a KeyError at another stack, at the crash site of one of the defect\'s, raises it)', fK2.sig !== fK.sig && fK2.crashSig === fK.crashSig && J(boost2) === J({ 'EBR-5': 'site' }), J(boost2));
    N._freq = { at: Date.now(), n: 100, c: { [fK2.sig]: 50 } };
    R._reads = {};
    const boost3 = await R.forDefect('EDR-1')(['EBR-5']);
    ok('...but not once it is common, though the defect\'s own is not', J(boost3) === '{}' && N.counts(fK.sig), J(boost3));
    N._freq = null;
    // A count of the common ones not yet read in this tab is waited for, on both sides.
    const slow = { resolve: null }, getMeta0 = JiTA.db.getMeta;
    JiTA.db.getMeta = (k) => (k === N.FREQ_KEY ? new Promise((r) => { slow.resolve = () => r({ at: Date.now(), n: 100, c: { [fK.sig]: 50 } }); }) : getMeta0(k));
    N._freq = null; N._freqRead = 0;
    R._reads = {}; R._report = {}; asked = [];
    const lateRep = R.forReport('EBR-2');
    await flush();
    ok('(a bug report\'s boost waits while the count is read)', asked.length === 0 && typeof slow.resolve === 'function');
    if (slow.resolve) { slow.resolve(); }
    await lateRep;
    ok('a bug report waits for the count of the common ones: its KeyError, common, asks about nothing', asked.length === 0, J(asked));
    N._freq = null; N._freqRead = 0; slow.resolve = null;
    L.sigsOf = () => Promise.resolve({ sigs: [fK.sig], crashes: [], cuts: [] });
    const lateDs = R._defectSigs('EDR-1');
    await flush();
    if (slow.resolve) { slow.resolve(); }
    const ds2 = await lateDs;
    ok('...and so does a defect: its KeyError, common, is none of its exceptions', ds2.n === 0 && !ds2.sigs[fK.sig], J(ds2));
    JiTA.db.getMeta = getMeta0;
    N._freq = null; N._freqRead = Date.now();

    // ================= the defect profile =================
    const view = (key, exc) => ({ key, created: '2026-10-01T00:00:00.000+0000', lang: 'English', hw: null, logRead: true, exc, crashRead: null, crashes: [] });
    const vs = [1, 2, 3, 4, 5, 6].map((i) => view('EBR-' + i, [{ sig: fT.sig, msg: 'UserError: ThrottleGeneric' }, { sig: fO.sig, msg: 'TimeoutException' }].concat(i <= 2 ? [{ sig: fK.sig, msg: 'KeyError: 7' }] : [])));
    let sm = P.summarise(vs, null, null, N.why);
    ok('the profile leaves what does not count out of the pattern: the KeyError 2 logs share is all it counts', sm.exc.length === 1 && sm.exc[0].sig === fK.sig && !sm.domExc &&
        sm.excGroups.length === 1 && sm.excGroups[0].paths[0].sig === fK.sig, J(sm.exc.map((e) => e.sig.slice(0, 30))));
    ok('...and lists the rest apart, each group with why', sm.leftExc.length === 2 && J(sm.leftExc.map((g) => g.why).sort()) === J(['ignored', 'user']) && sm.leftExc.every((g) => g.count === 6),
        J(sm.leftExc.map((g) => [g.key.slice(0, 20), g.why])));
    sm = P.summarise(vs, null, (sig) => (sig === fT.sig ? 'EDR-9' : ''), N.why);
    ok('...one whose defect is hidden as hidden, not twice', sm.hiddenExc.length === 1 && sm.hiddenExc[0].defects[0] === 'EDR-9' && sm.leftExc.length === 1 && sm.leftExc[0].why === 'ignored');
    sm = P.summarise(vs, null);
    ok('...and without the rules, as before: everything counts', sm.exc.length === 3 && sm.leftExc.length === 0 && !!sm.domExc);
    // A state kept from a build is summarised again once what counts changes; one made by hand is not.
    const kept = { key: 'EDR-5', total: 6, views: vs, summary: P.summarise(vs, null, null, N.why), defect: null, hiddenOf: () => '', gen: N.gen };
    const before = kept.summary;
    P._fresh(kept);
    ok('a kept state summarised by the rules as they stand is drawn as it is', kept.summary === before);
    N.unignore(N.keyOf(fO.sig));
    P._fresh(kept);
    ok('...and summarised again once what counts changed: the TimeoutException counts again', kept.summary !== before && kept.gen === N.gen && kept.summary.exc.some((e) => e.sig === fO.sig) &&
        J(kept.summary.leftExc.map((g) => g.why)) === J(['user']));
    const byHand = { key: 'EDR-6', total: 1, views: vs, summary: { mark: 1 } };
    P._fresh(byHand);
    ok('...while one made by hand keeps its summary', byHand.summary.mark === 1);
    ok('build keeps what that takes, and reads what counts before its first state', /defect: defect, hiddenOf: hiddenOf, gen: JiTA\.excnoise\.gen \};/.test(src) &&
        /JiTA\.db\.getDefect\(key\)\.then\(null, function \(\) \{ return null; \}\), JiTA\.excnoise\.load\(\)\]\)/.test(src) && /summary: P\.summarise\(views, defect, hiddenOf, JiTA\.excnoise\.why\)/.test(src));
    N.ignore(fO.sig, 'TimeoutException');

    // ================= the exception search =================
    const smx = { withLog: 6, excGroups: [{ msg: 'KeyError: 7', paths: [{ sig: fK.sig, count: 2 }] }], leftExc: [{ msg: 'UserError: ThrottleGeneric', why: 'user', paths: [{ sig: fT.sig, count: 6 }] }] };
    let ts = X.targets([{ sig: fO.sig, msg: 'TimeoutException' }], smx, null, null, null);
    ok('the search offers the shared ones that do not count too, each saying why; the rest say nothing', J(ts.map((x) => [x.sig === fK.sig ? 'K' : (x.sig === fT.sig ? 'T' : 'O'), x.left || ''])) ===
        J([['O', 'ignored'], ['K', ''], ['T', 'user']]), J(ts.map((x) => x.left)));
    N.unignore(N.keyOf(fO.sig));
    ts = X.targets([{ sig: fO.sig, msg: 'TimeoutException' }], smx, null, null, null);
    ok('...by the rules as they stand, not as the profile last summarised them', !ts[0].left);
    ok('a target set apart is drawn again when that changes', /\(st\.on\[t\.sig\] \? '\+' : '-'\) \+ \(t\.left \|\| ''\); \}\)\.join\('\\n'\)/.test(src));
    const st = { added: { typed: [], pasted: [], n: 0 }, targets: [], on: {}, addMsg: { textContent: '' }, node: null, key: 'EDR-1' };
    X._retarget = () => {};
    X._addOwn(st, { value: 'STACKTRACE #95 _DetectAndFixMissingHudModules found missing modules*' });
    ok('a stacktrace\'s first line typed alone is looked for by its message, at any stack', st.added.typed.length === 1 && st.added.typed[0].text === '_DetectAndFixMissingHudModules found missing modules*' &&
        st.on[st.added.typed[0].id] === true, J(st.added.typed));
    X._addOwn(st, { value: '20:32:52\tclient::general\terror\tSTACKTRACE #102 Spam guard tripped' });
    ok('...with its log columns as well', st.added.typed.length === 2 && st.added.typed[1].text === 'Spam guard tripped', J(st.added.typed));
    X._addOwn(st, { value: 'STACKTRACE #95' });
    ok('...but the count alone is refused, saying what to paste', st.added.typed.length === 2 && /from EXCEPTION # or STACKTRACE # on/.test(st.addMsg.textContent), st.addMsg.textContent);
    st.addMsg.textContent = '';
    X._addOwn(st, { value: 'STACKTRACE #95 logged at 04/12/2026 20:32:52 :' });
    ok('...as is a header whose message is empty, not looked for as "logged at"', st.added.typed.length === 2 && /from EXCEPTION # or STACKTRACE # on/.test(st.addMsg.textContent), J(st.added.typed));
    X._addOwn(st, { value: 'STACKTRACE #95 logged at 04/12/2026 20:32:52 : Spam guard tripped again' });
    ok('...while the header as logged is the stacktrace cut off there: looked for by its message', st.added.typed.length === 2 && st.added.pasted.length === 1 &&
        st.added.pasted[0].msg === 'Spam guard tripped again' && L.isCut(st.added.pasted[0].sig) && st.on[st.added.pasted[0].sig] === true, J(st.added.pasted));
    X._addOwn(st, { value: 'STACKTRACE #95 ' + msgCol(KEYERR(1)).slice(7).join('\n') });
    ok('...and one with a stack is not read as a message', st.added.typed.length === 2);
    X._addOwn(st, { value: 'stacktrace #95 logged at 04/12/2026 20:32:52 : spam guard tripped' });
    ok('a header typed in lower case is read the same: its message, at any stack', st.added.typed.length === 3 && st.added.typed[2].text === 'spam guard tripped', J(st.added.typed));

    // ================= what else leaves ignored ones out =================
    let clusters = [{ sig: fO.sig, label: 'TimeoutException', members: [{ key: 'EDR-1', status: 'Open' }, { key: 'EDR-2', status: 'Open' }] },
        { sig: fK.sig, label: 'KeyError', members: [{ key: 'EDR-3', status: 'Open' }, { key: 'EDR-4', status: 'Open' }] }];
    N.ignore(fO.sig, 'TimeoutException');
    JiTA.logsig.clusters = () => Promise.resolve(clusters);
    JiTA.dupfind = eval('({' + member('    _excPairs: function () {') + '})');
    const pairs = await JiTA.dupfind._excPairs();
    ok('the duplicate finder pairs no defects by an exception the user ignores', J(pairs.map((p) => p.a + '|' + p.b)) === J(['EDR-3|EDR-4']), J(pairs));
    ok('nor does the Exception clusters overview list one', /clusters = \(clusters \|\| \[\]\)\.filter\(function \(c\) \{ return !JiTA\.excnoise\.isIgnored\(c\.sig\); \}\);/.test(src));
    const menuSrc = src.slice(once('\nJiTA.menu = {'));
    ok('Settings counts them again, each or all, and takes back the common ones counted anyway', /noise\.unignoreAll\(\); refreshMenu\(\);/.test(menuSrc) &&
        /noise\.unignore\(x\.key\); refreshMenu\(\);/.test(menuSrc) && /noise\.uncountAll\(\); refreshMenu\(\);/.test(menuSrc));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'exceptions that do not count checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
