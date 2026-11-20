// crosstab-check.js - what one tab does that the other tabs must hear (review 2026-11-20: exccore-logic-2, drift-own-1,
// boost-logic-1). A sync and the background reading of the open reports' logs each run in one tab, while every tab keeps
// copies of its own as long as it is open: the exception signatures a parsed log is matched by (JiTA.logsig), the
// exception boost's readings and answers (JiTA.repexc), its keyword fallbacks (JiTA.rank). Those went stale in every other
// tab until it was reloaded. Checked here, against the real code: a sync run that changed the defects tells the other tabs
// (JiTA.sync._tellChanged), and a tab that hears it builds its signatures again and matches an open log again; a reading
// stored in one tab is told to the others in batches (JiTA.repexc.readStored), and they drop their copy; a pass that ends
// redraws an open defect in every tab; a cached reading with nothing to go by is looked up again after a while, for tabs
// on an older build that tell nobody.
const S = require('./source');
const src = S.load();

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const J = JSON.stringify;
const flush = () => new Promise((r) => setTimeout(r, 0));

let gm = {}, renders = 0, rematches = 0, recs = [], meta = {}, metaReads = 0, now = 1e12;
global.gmSet = (k, v) => { gm[k] = v; };
global.gmGet = (k, d) => (Object.prototype.hasOwnProperty.call(gm, k) ? gm[k] : d);
global.document = { getElementById: () => null, querySelectorAll: () => [] };
const realNow = Date.now;
Date.now = () => now;
global.JiTA = {
    sched: { tabId: 'tabB' },
    rank: {},
    ui: { currentKey: null, scheduleRender: () => { renders++; }, _isReportsKey: (k) => /^(EDR|EO|PLAT)-/.test(k) },
    profile: { CACHE_PREFIX: 'rp:', V: 3, _usable: (r) => ((r && r.v === 3) ? r : null) },
    db: { allDefects: () => Promise.resolve(recs.slice()), getMeta: (k) => { metaReads++; return Promise.resolve(k in meta ? meta[k] : null); } },
    excnoise: { isIgnored: () => false },
    log() {}, dlog() {}, caught() {}
};
(0, eval)(S.top(src, 'JiTA.logsig'));
(0, eval)(S.top(src, 'JiTA.repexc'));
JiTA.sync = (0, eval)(S.members(src, 'JiTA.sync', ['CHANGED_KEY', '_tellChanged', 'heardChanged']));
const L = JiTA.logsig, R = JiTA.repexc, Y = JiTA.sync;
const realRematch = L.rematch;
L.rematch = () => { rematches++; };

const dump = (n, msg, frames) => ['EXCEPTION #' + n + ' logged at  10/10/2026 22:10:48 : Unhandled exception', 'Formatted exception info: ' + msg, 'Caught at:']
    .concat(frames).concat(['EXCEPTION END']).join(' ');
const FA = ['/eve/client/script/ui/a.py(11) Alpha', '/eve/client/script/ui/b.py(22) Beta', '/eve/client/script/ui/c.py(33) Gamma'];
const FB = ['/eve/client/script/ui/d.py(44) Delta', '/eve/client/script/ui/e.py(55) Epsilon', '/eve/client/script/ui/f.py(66) Zeta'];
const defect = (key, msg, frames) => ({ key: key, project: 'EDR', status: 'Open', created: '2026-10-01T00:00:00.000+0000', description: dump(1, msg, frames) });

(async () => {
    // ================= a sync tells the other tabs =================
    Y._tellChanged(true, false);
    ok('a sync that changed the defects tells the other tabs, saying which tab it was', J(gm.jitaStoreChanged) === J({ at: now, tab: 'tabB', defects: true, ebr: false }), J(gm.jitaStoreChanged));
    Y._tellChanged(false, true);
    ok('...one that changed the bug reports says so', gm.jitaStoreChanged.ebr === true && gm.jitaStoreChanged.defects === false);

    // ================= a tab that hears it =================
    recs = [defect('EDR-1', 'KeyError: 2', FA)];
    let idx = await L.ensure();
    ok('(this tab built its own exception signatures)', Object.keys(idx.keyToSigs).join() === 'EDR-1');
    recs.push(defect('EDR-900', "AttributeError: 'NoneType' object has no attribute 'typeID'", FB));
    idx = await L.ensure();
    ok('(...and, hearing nothing, goes on using them: the new defect is not in them)', !idx.keyToSigs['EDR-900']);
    R._report = { 'EBR-1': Promise.resolve({ 'EDR-1': { kind: 'exact', hits: [] } }) };
    JiTA.rank._dirty = false; JiTA.rank._dirtyEbr = false;
    Y.heardChanged({ at: now, tab: 'tabA', defects: true, ebr: false });
    idx = await L.ensure();
    ok('another tab\'s defect sync: this tab builds its signatures again, with the new defect', !!idx.keyToSigs['EDR-900'] && !!idx.keyToSigs['EDR-1'], J(Object.keys(idx.keyToSigs)));
    ok('...matches a parsed log on screen again at once', rematches === 1, String(rematches));
    ok('...drops its exception-boost answers, which came from the old defects', !Object.keys(R._report).length);
    ok('...and its defect keyword fallback, not the bug reports\'', JiTA.rank._dirty === true && JiTA.rank._dirtyEbr === false);
    JiTA.rank._dirty = false; L._dirty = false; rematches = 0;
    R._report = { 'EBR-1': Promise.resolve({}) };
    Y.heardChanged({ at: now, tab: 'tabA', defects: false, ebr: true });
    ok('another tab\'s bug report sync: only the bug report keyword fallback goes', JiTA.rank._dirtyEbr === true && !JiTA.rank._dirty && !L._dirty &&
        rematches === 0 && !!R._report['EBR-1']);
    JiTA.rank._dirtyEbr = false;
    Y.heardChanged({ at: now, tab: 'tabB', defects: true, ebr: true });
    ok('what this tab told itself is not heard again', !JiTA.rank._dirty && !JiTA.rank._dirtyEbr && !L._dirty && rematches === 0);
    Y.heardChanged(null);
    ok('...nor a value that is not there', !L._dirty);

    // rematch, the real one: with no parsed log open it does nothing, with one it matches the table again.
    let applied = 0;
    const realApply = L.applyToTable;
    L.applyToTable = () => { applied++; return Promise.resolve(); };
    L.rematch = realRematch;
    Y.heardChanged({ at: now, tab: 'tabA', defects: true });
    ok('(with no parsed log open, nothing is matched)', applied === 0);
    global.document = { getElementById: (id) => (id === 'tableContent' ? {} : null), querySelectorAll: () => [] };
    Y.heardChanged({ at: now, tab: 'tabA', defects: true });
    ok('(...with one, it is matched again)', applied === 1);
    global.document = { getElementById: () => null, querySelectorAll: () => [] };
    L.applyToTable = realApply;
    L.rematch = () => { rematches++; };

    // ================= readings stored in one tab =================
    gm = {};
    const timers = [];
    const realSet = global.setTimeout, realClear = global.clearTimeout;
    global.setTimeout = (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; };
    global.clearTimeout = () => {};
    R._reads = { 'EBR-1': { at: now, empty: false, p: Promise.resolve(['x']) } }; R._report = { 'EBR-1': 1 }; R._msgs = { 'EBR-1': {} };
    R.readStored('EBR-1');
    ok('a reading stored here is forgotten here', !R._reads['EBR-1'] && !R._report['EBR-1'] && !R._msgs['EBR-1']);
    ok('...and told to the other tabs a few seconds later, not at once', !('jitaReadingsStored' in gm) && timers.length === 1 && timers[0].ms === R.TELL_MS);
    R.readStored('EBR-2'); R.readStored('EBR-1');
    ok('...in one batch, each report once', timers.length === 1 && J(R._untold) === J(['EBR-1', 'EBR-2']));
    timers[0].fn();
    ok('the batch names the reports and the tab', J(gm.jitaReadingsStored) === J({ at: now, tab: 'tabB', keys: ['EBR-1', 'EBR-2'], done: false }), J(gm.jitaReadingsStored));
    ok('...and is emptied', !R._untold.length && !R._tellT);
    delete gm.jitaReadingsStored;
    R._tellReads(false);
    ok('nothing stored since: nothing told', !('jitaReadingsStored' in gm));
    R._tellReads(true);
    ok('a pass that ended is told, with nothing stored since too', J(gm.jitaReadingsStored) === J({ at: now, tab: 'tabB', keys: [], done: true }), J(gm.jitaReadingsStored));
    for (let i = 0; i <= R.TELL_MAX; i++) { R.readStored('EBR-' + (1000 + i)); }
    R._tellReads(true);
    ok('more than the batch can name: the other tabs are told to drop every reading', gm.jitaReadingsStored.keys === null && gm.jitaReadingsStored.done === true);
    global.setTimeout = realSet; global.clearTimeout = realClear;

    // ================= a tab that hears it =================
    const cached = () => ({ 'EBR-1': { at: now, empty: false, p: Promise.resolve([]) }, 'EBR-2': { at: now, empty: false, p: Promise.resolve([]) } });
    R._reads = cached(); R._report = { 'EBR-1': 1, 'EBR-2': 2 }; R._msgs = { 'EBR-1': {}, 'EBR-2': {} };
    renders = 0; JiTA.ui.currentKey = 'EDR-5';
    R.readsHeard({ at: now, tab: 'tabA', keys: ['EBR-1'], done: false });
    ok('another tab stored a reading: this tab drops its copy of it, and keeps the rest', !R._reads['EBR-1'] && !R._report['EBR-1'] && !R._msgs['EBR-1'] &&
        !!R._reads['EBR-2'] && !!R._report['EBR-2'] && !!R._msgs['EBR-2']);
    ok('...and draws nothing again while the pass goes on', renders === 0);
    R.readsHeard({ at: now, tab: 'tabA', keys: [], done: true });
    ok('the pass ended: a defect on screen ranks its reports again', renders === 1);
    JiTA.ui.currentKey = 'EBR-5';
    R.readsHeard({ at: now, tab: 'tabA', keys: [], done: true });
    ok('...a bug report does not (its own log is scanned)', renders === 1);
    R._reads = cached(); R._report = { 'EBR-1': 1 }; R._msgs = { 'EBR-1': {} };
    R.readsHeard({ at: now, tab: 'tabA', keys: null, done: false });
    ok('too many to name: every reading and answer this tab cached goes', !Object.keys(R._reads).length && !Object.keys(R._report).length && !Object.keys(R._msgs).length);
    R._reads = cached();
    R.readsHeard({ at: now, tab: 'tabB', keys: ['EBR-1'], done: true });
    ok('what this tab told is not heard again', !!R._reads['EBR-1'] && renders === 1);
    R.readsHeard(null);
    ok('...nor a value that is not there', !!R._reads['EBR-1']);

    // ================= a reading with nothing to go by is looked up again =================
    R._reads = {}; meta = {}; metaReads = 0;
    ok('(no reading yet: nothing to go by)', (await R._reading('EBR-7')) === null && metaReads === 1);
    await R._reading('EBR-7');
    ok('...asked again within a few minutes: the cached answer', metaReads === 1);
    meta['rp:EBR-7'] = { v: 3, logs: true, hasLog: true, exc: [{ sig: 'keyerror: 2|a.py:alpha>b.py:beta' }] };
    now += R.EMPTY_MS;
    ok('...after EMPTY_MS it is looked up again, and the reading another tab (an older build) stored is found', J(await R._reading('EBR-7')) === J(['keyerror: 2|a.py:alpha>b.py:beta']) && metaReads === 2);
    now += 10 * R.EMPTY_MS;
    await R._reading('EBR-7');
    ok('a reading with exceptions is kept for the session', metaReads === 2);
    meta['rp:EBR-8'] = { v: 3, logs: true, hasLog: true, exc: [] };
    await R._reading('EBR-8');
    now += R.EMPTY_MS;
    await R._reading('EBR-8');
    ok('a reading of a log with no exceptions is looked up again too (the log may have been read again since)', metaReads === 4, String(metaReads));
    meta['rp:EBR-9'] = { v: 3, logs: true, exc: [{ sig: 'a|b:c>d:e' }] };
    ok('a reading with exceptions but no hasLog (an older reader) has a log all the same', J(await R._reading('EBR-9')) === J(['a|b:c>d:e']));
    meta['rp:EBR-10'] = { v: 3, logs: true, exc: [] };
    ok('...one with neither is nothing to go by', (await R._reading('EBR-10')) === null);
    let fails = 0;
    JiTA.db.getMeta = () => { fails++; return Promise.reject(new Error('closed')); };
    R._reads = {};
    ok('a store that cannot be read: nothing to go by', (await R._reading('EBR-11')) === null && R._reads['EBR-11'].empty === true);
    now += R.EMPTY_MS;
    await R._reading('EBR-11');
    ok('...and it is tried again later', fails === 2);

    // ================= the code that tells, and the listeners =================
    const run = S.member(src, 'JiTA.sync', '_run');
    ok('a sync run that changed something tells the other tabs once it ends, which dataset it was', run.indexOf('function settled() { if (changed > 0) { JiTA.sync._invalidateWorker(); JiTA.sync._tellChanged(!opts.isEbr, !!opts.isEbr); } }') >= 0);
    const dup = S.top(src, 'JiTA.dupfind');
    ok('the duplicate finder\'s ghost delete marks this tab\'s signatures and tells the other tabs', /JiTA\.logsig\._dirty = true;[^\n]*\n[^\n]*\n\s*JiTA\.sync\._tellChanged\(true, false\);/.test(dup));
    const rf = S.member(src, 'JiTA.profile', '_readNow');
    ok('a stored reading is told', /var stored = function \(\) \{ JiTA\.repexc\.readStored\(issue\.key\); return rec; \};/.test(rf));
    const pass = S.member(src, 'JiTA.logread', 'pass');
    ok('a pass that read something tells the other tabs it ended', /if \(read\) \{\n\s*JiTA\.log\([^\n]*\n\s*JiTA\.repexc\._tellReads\(true\);/.test(pass));
    const boot = src.slice(src.indexOf('// ---- Jira boot:'));
    ok('every Jira tab listens for both, and only to other tabs', /GM_addValueChangeListener\(JiTA\.sync\.CHANGED_KEY, function \(name, oldV, newV, remote\) \{\n\s*if \(remote\) \{ try \{ JiTA\.sync\.heardChanged\(newV\); \} catch \(e\) \{ JiTA\.caught\('sync\.heardChanged', e\); \} \}/.test(boot) &&
        /GM_addValueChangeListener\(JiTA\.repexc\.READ_KEY, function \(name, oldV, newV, remote\) \{\n\s*if \(remote\) \{ try \{ JiTA\.repexc\.readsHeard\(newV\); \} catch \(e\) \{ JiTA\.caught\('repexc\.readsHeard', e\); \} \}/.test(boot));

    Date.now = realNow;
    console.log(fail ? ('\n' + fail + ' FAILURE(S)') : '\ncross-tab checks passed.');
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
