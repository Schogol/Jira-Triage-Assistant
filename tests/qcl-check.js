// qcl-check.js - the quality-control ledger kept in parts (v3.53.5, JiTA.leadduty.qcl). One Confluence property holds
// 32 KB, and six QC months with their verdicts came to 28 KB, so every QC write was refused. Now each month's verdicts
// and the follow-ups have properties of their own, while the frozen samples stay where they were (QC_LEDGER_KEY), so a
// tab on an older build never freezes a month again. Checked here: the one value the parts make, a ledger from before
// the parts moved into them (and an older build's later writes moved on the next read), the write order, a part
// another Lead changed meanwhile, a month no longer kept losing its verdicts property, dry runs, the key listing for
// Clear ledger, and the sizes. Evals the real JiTA.conf + JiTA.leadduty against a stubbed, versioned property store.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
global.JITA_SH = require('./source').shared(src);   // jitaShared, the page's run of it (JiTA.leadduty._handles is its handles)
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
if (cs < 0 || ce < 0 || ls < 0 || le < 0) { throw new Error('could not slice JiTA.conf / JiTA.leadduty'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const meta = {}, gm = {}, logs = [];
global.gmGet = (k, d) => (k === 'leadDutyMe' ? { accountId: 'a', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true } : (k in gm ? gm[k] : d));
global.gmSet = () => {};
global.window = { console: console };
global.setTimeout = (f) => setImmediate(f);   // the conflict back-off, without the wait
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5,
    credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 } },
    dlog: () => {}, link: {}, sync: {}, util: {}, worker: {},
    log: function () { logs.push([].slice.call(arguments).join(' ')); },
    db: { getMeta: (k) => Promise.resolve(meta[k] == null ? null : JSON.parse(JSON.stringify(meta[k]))),
          setMeta: (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); } }
};
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
const L = global.JiTA.leadduty, Q = L.qcl;
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---- a Confluence property store, versioned like the real thing: a write over a stale version is a 409 ----
let props = {}, saves = [], deletes = [], failSave = {}, raceSave = {}, nextId = 1;
const conflict = () => { const e = new Error('HTTP 409'); e.status = 409; return e; };
JiTA.conf.getProperty = (p, key) => Promise.resolve(props[key] ? clone(props[key]) : null);
JiTA.conf.saveProperty = (p, key, value, prop) => {
    if (failSave[key]) { failSave[key]--; return Promise.reject(Object.assign(new Error('HTTP 503'), { status: 503 })); }
    if (raceSave[key]) { const f = raceSave[key]; delete raceSave[key]; f(); }   // another Lead writes first
    const have = props[key];
    if ((have ? have.version : 0) !== (prop ? prop.version : 0)) { return Promise.reject(conflict()); }
    saves.push(key);
    props[key] = { id: have ? have.id : 'id' + (nextId++), key: key, value: clone(value), version: (prop ? prop.version : 0) + 1 };
    return Promise.resolve(clone(props[key]));
};
JiTA.conf.deleteProperty = (p, id) => {
    deletes.push(id);
    Object.keys(props).forEach((k) => { if (props[k].id === id) { delete props[k]; } });
    return Promise.resolve();
};
// Another Lead's write: straight into the store, a new version.
const put = (key, value) => { const have = props[key]; props[key] = { id: have ? have.id : 'id' + (nextId++), key: key, value: clone(value), version: (have ? have.version : 0) + 1 }; };
const reset = () => { props = {}; saves = []; deletes = []; failSave = {}; raceSave = {}; logs.length = 0; delete gm[L.DRY_KEY]; };

const KEY = L.QC_LEDGER_KEY, FK = L.QC_FLAGS_KEY;
const pym = L._prevYm(), ym2 = (() => { const d = new Date(Date.UTC(+pym.slice(0, 4), +pym.slice(5, 7) - 2, 1)); return d.toISOString().slice(0, 7); })();
const MK = Q.monthKey(pym), MK2 = Q.monthKey(ym2);
const now = () => new Date().toISOString();
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();   // recent: _prune drops follow-ups resolved over KEEP_MONTHS ago
const sample = (ym) => ({ roster: ['lookuptable', 'schogol', 'solnichka'], quota: 3, poolSize: 12, assign: { schogol: ['EBR-1', 'EBR-2', 'EBR-3'], solnichka: ['EBR-9'] }, at: ym + '-02T08:00:00Z' });
const verdict = (v, at) => ({ verdict: v, by: 'schogol', at: at || now() });
const flag = (ym, at, extra) => Object.assign({ ym: ym, by: 'schogol', actor: 'ISD Bob', at: at || now(), note: 'Wrong component' }, extra || {});
const freeze = (ym) => (v) => { v = v || { v: 1, months: {}, done: {}, flags: {} }; v.months = v.months || {}; if (v.months[ym]) { return null; } v.months[ym] = sample(ym); return v; };
const mark = (ym, key, vd) => (v) => { v.done[ym] = v.done[ym] || {}; v.done[ym][key] = vd; return v; };

(async () => {
    // ---- nothing written yet ----
    reset();
    let r = await Q.read([pym]);
    ok('with no part written the ledger reads as null, as ledger.read gives a property not written', r.value === null, JSON.stringify(r.value));
    ok('...and every part at version 0', JSON.stringify(r.parts) === JSON.stringify({ legacy: 0, flags: 0, months: { [pym]: 0 } }), JSON.stringify(r.parts));
    ok('a month key takes only [a-z0-9_]', /^[a-z0-9_]+$/.test(MK) && MK === L.QC_MONTH_PREFIX + pym.replace('-', '_'), MK);
    ok('...and is none of the other two keys', MK !== KEY && MK !== FK && FK !== KEY && MK.indexOf(KEY) === 0);

    // ---- freezing a month writes the months, and only the months ----
    let w = await Q.mutate([pym], freeze(pym));
    ok('a frozen month is written to the months property', props[KEY] && props[KEY].value.months[pym] && saves.join() === KEY, saves.join());
    ok('...with no verdicts or follow-ups property for nothing', !props[MK] && !props[FK]);
    ok('...and the result says written, with the new version', w.written === true && w.parts.legacy === props[KEY].version, JSON.stringify(w.parts));
    saves = [];
    w = await Q.mutate([pym], freeze(pym));
    ok('a change fn declines writes nothing', w.written === false && saves.length === 0 && w.value.months[pym], saves.join());

    // ---- a verdict goes to its month, a follow-up to the follow-ups ----
    saves = [];
    w = await Q.mutate([pym], mark(pym, 'EBR-1', verdict('ok')));
    ok('a verdict is written to its month\'s property only', saves.join() === MK && props[MK].value.verdicts['EBR-1'].verdict === 'ok', saves.join());
    ok('...which names its month', props[MK].value.ym === pym && props[MK].value.v === 1);
    ok('...and leaves the months property as it was', props[KEY].version === 1);
    ok('...the verdicts are not stored as `done` (which _prune would keep to KEEP_MONTHS keys)', !('done' in props[MK].value) && !('months' in props[MK].value) && !('flags' in props[MK].value));
    saves = [];
    w = await Q.mutate([pym], (v) => { mark(pym, 'EBR-2', verdict('flag'))(v); v.flags['EBR-2'] = flag(pym); return v; });
    ok('a flag writes the follow-ups first, then the verdicts', saves.join() === FK + ',' + MK, saves.join());
    ok('...so a write that stops between the two leaves the verdict out, and running it again finishes it', props[FK].value.flags['EBR-2'] && props[MK].value.verdicts['EBR-2']);
    ok('the result carries each part\'s new version', w.parts.flags === props[FK].version && w.parts.months[pym] === props[MK].version && w.parts.legacy === props[KEY].version, JSON.stringify(w.parts));
    r = await Q.read([pym]);
    ok('read gives the one value the parts make', r.value.months[pym].quota === 3 && r.value.done[pym]['EBR-1'].verdict === 'ok' && r.value.done[pym]['EBR-2'].verdict === 'flag' && r.value.flags['EBR-2'].note === 'Wrong component', JSON.stringify(r.value));
    r = await Q.read([]);
    ok('read for no month still gives the follow-ups and the months', r.value.flags['EBR-2'] && r.value.months[pym] && JSON.stringify(r.value.done) === '{}', JSON.stringify(r.value));
    let threw = null;
    await Q.mutate([], mark(pym, 'EBR-3', verdict('ok'))).catch((e) => { threw = e; });
    ok('a change to verdicts of a month not read is refused, not written blind', threw && /without being read/.test(threw.message) && !props[MK].value.verdicts['EBR-3'], threw && threw.message);

    // ---- the ledger from before the parts: moved into them on the first read ----
    reset();
    const T2 = ago(11).replace(/Z$/, '1Z'), RES = ago(2);
    props[KEY] = { id: 'legacy', key: KEY, version: 7, value: {
        v: 1, months: { [ym2]: sample(ym2), [pym]: sample(pym) },
        done: { [ym2]: { 'EBR-7': verdict('ok', ago(12)) }, [pym]: { 'EBR-1': verdict('ok', ago(11)), 'EBR-2': verdict('flag', T2) } },
        flags: { 'EBR-2': flag(pym, T2) }
    } };
    const before = clone(props[KEY].value);
    r = await Q.read([pym]);
    ok('the first read moves the follow-ups into their own property', props[FK] && JSON.stringify(props[FK].value.flags) === JSON.stringify(before.flags), JSON.stringify(props[FK] && props[FK].value));
    ok('...and every month\'s verdicts into theirs, the month not asked for as well', props[MK] && props[MK2] &&
        JSON.stringify(props[MK].value.verdicts) === JSON.stringify(before.done[pym]) && JSON.stringify(props[MK2].value.verdicts) === JSON.stringify(before.done[ym2]));
    ok('...taking them out of the old property', JSON.stringify(props[KEY].value.flags) === '{}' &&
        Object.keys(props[KEY].value.done).every((ym) => !Object.keys(props[KEY].value.done[ym]).length), JSON.stringify(props[KEY].value));
    ok('...where the months stay, so an older build never freezes a month again', JSON.stringify(props[KEY].value.months) === JSON.stringify(before.months));
    ok('what is read is what the old ledger said', JSON.stringify(r.value.done[pym]) === JSON.stringify(before.done[pym]) && JSON.stringify(r.value.flags) === JSON.stringify(before.flags) &&
        JSON.stringify(r.value.months) === JSON.stringify(before.months), JSON.stringify(r.value));
    ok('...with the versions of the parts as they are now', r.parts.legacy === props[KEY].version && r.parts.flags === props[FK].version && r.parts.months[pym] === props[MK].version, JSON.stringify(r.parts));
    saves = [];
    await Q.read([pym]);
    ok('once moved, a read writes nothing', saves.length === 0, saves.join());

    // ---- an older build still writing into the old property ----
    const old = clone(props[KEY].value);
    old.done[pym]['EBR-3'] = verdict('flag', ago(10));
    old.flags['EBR-3'] = flag(pym, ago(10));
    put(KEY, old);
    r = await Q.read([pym]);
    ok('a verdict and a follow-up an older build wrote later are moved on the next read', props[MK].value.verdicts['EBR-3'] && props[FK].value.flags['EBR-3'] &&
        !props[KEY].value.done[pym]['EBR-3'] && !props[KEY].value.flags['EBR-3'], JSON.stringify(props[KEY].value));
    ok('...and read with the rest', r.value.done[pym]['EBR-3'] && r.value.done[pym]['EBR-1'] && r.value.flags['EBR-3'] && r.value.flags['EBR-2']);
    const old1 = clone(props[KEY].value);
    old1.done[pym]['EBR-12'] = verdict('ok', ago(3));
    put(KEY, old1);
    await Q.read([]);
    ok('...a Checked verdict alone (no follow-up) as well, even by a read for no month', props[MK].value.verdicts['EBR-12'] && !props[KEY].value.done[pym]['EBR-12'], JSON.stringify(props[KEY].value.done));
    await Q.mutate([pym], (v) => { delete v.done[pym]['EBR-3']; delete v.flags['EBR-3']; return v; });
    r = await Q.read([pym]);
    ok('an Undo after the move stays undone (nothing left behind to bring it back)', !r.value.done[pym]['EBR-3'] && !r.value.flags['EBR-3'], JSON.stringify(r.value.done[pym]));

    // The newer one wins: a follow-up an older build resolved, and one it holds in an older state.
    const old2 = clone(props[KEY].value);
    old2.flags['EBR-2'] = flag(pym, T2, { resolvedAt: RES, resolvedBy: 'solnichka' });
    put(KEY, old2);
    await Q.read([]);
    ok('a follow-up an older build resolved is resolved in the parts too (the newer one wins)', props[FK].value.flags['EBR-2'].resolvedAt === RES, JSON.stringify(props[FK].value.flags['EBR-2']));
    const old3 = clone(props[KEY].value);
    old3.flags['EBR-2'] = flag(pym, T2);
    put(KEY, old3);
    r = await Q.read([]);
    ok('...and an older copy of it never undoes that', props[FK].value.flags['EBR-2'].resolvedAt === RES && r.value.flags['EBR-2'].resolvedAt, JSON.stringify(props[FK].value.flags['EBR-2']));
    ok('...though it is still taken out of the old property', !props[KEY].value.flags['EBR-2'], JSON.stringify(props[KEY].value.flags));
    ok('Q._fold: missing ones are added, newer ones replace, older ones do not', JSON.stringify(Q._fold({ a: { at: '2' }, b: { at: '5' } }, { a: { at: '3' }, b: { at: '4' }, c: { at: '1' } })) ===
        JSON.stringify({ a: { at: '3' }, b: { at: '5' }, c: { at: '1' } }));

    // A move that fails (the follow-ups property cannot be written): the read still works, and shows everything.
    const old4 = clone(props[KEY].value);
    old4.done[pym]['EBR-4'] = verdict('ok', ago(9));
    old4.flags['EBR-4'] = flag(pym, ago(9));
    put(KEY, old4);
    failSave[FK] = 99;
    r = await Q.read([pym]);
    ok('a move that fails does not fail the read', r.value && r.value.done[pym]['EBR-1'], JSON.stringify(r.value));
    ok('...which still shows what the older build wrote, folded in', r.value.done[pym]['EBR-4'] && r.value.flags['EBR-4'] && r.value.flags['EBR-2'].resolvedAt, JSON.stringify(r.value.flags));
    ok('...nothing is taken out of the old property', props[KEY].value.flags['EBR-4'] && props[KEY].value.done[pym]['EBR-4']);
    ok('...and the failure is logged, not swallowed', logs.some((l) => /could not move the QC verdicts/.test(l)), logs.join(' | '));
    failSave = {};
    await Q.read([pym]);
    ok('the next read moves it', props[FK].value.flags['EBR-4'] && props[MK].value.verdicts['EBR-4'] && !props[KEY].value.flags['EBR-4'] && !props[KEY].value.done[pym]['EBR-4']);

    // An older build resolves a follow-up in the old property while it is being moved: that change must stay there.
    const old5 = clone(props[KEY].value);
    old5.flags['EBR-11'] = flag(pym, ago(5));
    put(KEY, old5);
    raceSave[KEY] = () => { const v = clone(props[KEY].value); v.flags['EBR-11'].resolvedAt = ago(1); v.flags['EBR-11'].resolvedBy = 'solnichka'; put(KEY, v); };
    r = await Q.read([]);
    ok('a follow-up an older build changed during the move is left in the old property', props[KEY].value.flags['EBR-11'] && props[KEY].value.flags['EBR-11'].resolvedAt, JSON.stringify(props[KEY].value.flags));
    ok('...and read as it is now', r.value.flags['EBR-11'].resolvedAt, JSON.stringify(r.value.flags['EBR-11']));
    await Q.read([]);
    ok('...the next read moves that too', props[FK].value.flags['EBR-11'].resolvedAt && !props[KEY].value.flags['EBR-11'], JSON.stringify(props[FK].value.flags['EBR-11']));

    // ---- another Lead changed a part meanwhile ----
    let calls = 0;
    saves = [];
    w = await Q.mutate([pym], (v) => {
        if (++calls === 1) { const mv = clone(props[MK].value); mv.verdicts['EBR-9'] = verdict('ok'); put(MK, mv); }   // solnichka's verdict lands first
        return mark(pym, 'EBR-5', verdict('ok'))(v);
    });
    ok('a part another Lead changed meanwhile runs the change again on the fresh value', calls === 2, String(calls));
    ok('...so both verdicts are kept', props[MK].value.verdicts['EBR-9'] && props[MK].value.verdicts['EBR-5'], JSON.stringify(Object.keys(props[MK].value.verdicts)));
    ok('...and the result is the fresh value', w.written && w.value.done[pym]['EBR-9'] && w.parts.months[pym] === props[MK].version);
    calls = 0;
    raceSave[MK] = () => { const mv = clone(props[MK].value); mv.verdicts['EBR-8'] = verdict('ok'); put(MK, mv); };
    await Q.mutate([pym], (v) => { calls++; return mark(pym, 'EBR-6', verdict('ok'))(v); });
    ok('a write over a version another Lead moved on (409) runs the change again too', calls === 2 && props[MK].value.verdicts['EBR-8'] && props[MK].value.verdicts['EBR-6'], calls + ' / ' + JSON.stringify(Object.keys(props[MK].value.verdicts)));
    threw = null;
    failSave[MK] = 1;
    await Q.mutate([pym], mark(pym, 'EBR-10', verdict('ok'))).catch((e) => { threw = e; });
    ok('any other failure is not retried, it is thrown', threw && threw.status === 503 && !props[MK].value.verdicts['EBR-10'], threw && threw.message);
    failSave = {};

    // ---- a month no longer kept ----
    reset();
    const months = {};
    for (let i = 0; i < L.KEEP_MONTHS; i++) {
        const d = new Date(Date.UTC(2026, i, 1)).toISOString().slice(0, 7);
        months[d] = sample(d);
        put(Q.monthKey(d), { v: 1, ym: d, verdicts: { ['EBR-' + i]: verdict('ok') } });
    }
    put(KEY, { v: 1, months: months, done: {}, flags: {} });
    const oldest = Object.keys(months).sort()[0], oldestId = props[Q.monthKey(oldest)].id;
    w = await Q.mutate(['2026-07'], freeze('2026-07'));
    ok('the oldest month leaves the months when a new one is frozen (KEEP_MONTHS, unchanged)', Object.keys(props[KEY].value.months).length === L.KEEP_MONTHS && !props[KEY].value.months[oldest] && props[KEY].value.months['2026-07'] && L.KEEP_MONTHS === 6, JSON.stringify(Object.keys(props[KEY].value.months)));
    ok('...and its verdicts property is deleted with it', deletes.join() === oldestId && !props[Q.monthKey(oldest)], deletes.join());
    ok('...the other months\' verdicts are left alone', Object.keys(months).sort().slice(1).every((d) => props[Q.monthKey(d)]));
    deletes = [];
    const refuse = JiTA.conf.deleteProperty;
    JiTA.conf.deleteProperty = () => Promise.reject(new Error('HTTP 403'));
    put(Q.monthKey('2026-02'), { v: 1, ym: '2026-02', verdicts: {} });
    w = await Q.mutate(['2026-08'], freeze('2026-08'));
    ok('a delete that is refused does not fail the write', w.written && props[KEY].value.months['2026-08'] && !props[KEY].value.months['2026-02']);
    ok('...and is logged', logs.some((l) => /could not delete the QC verdicts of 2026-02/.test(l)), logs.join(' | '));
    JiTA.conf.deleteProperty = refuse;

    // ---- dry run: nothing is written, nothing moved, nothing deleted ----
    reset();
    props[KEY] = { id: 'legacy', key: KEY, version: 3, value: { v: 1, months: { [pym]: sample(pym) }, done: { [pym]: { 'EBR-1': verdict('ok') } }, flags: { 'EBR-1': flag(pym) } } };
    gm[L.DRY_KEY] = true;
    const quiet = console.log;
    let shown = 0;
    console.log = (...a) => { if (/DRY RUN/.test(String(a[0]))) { shown++; } else { quiet.apply(console, a); } };
    r = await Q.read([pym]);
    w = await Q.mutate([pym], (v) => { mark(pym, 'EBR-2', verdict('flag'))(v); v.flags['EBR-2'] = flag(pym); return v; });
    console.log = quiet;
    ok('in a dry run a read moves nothing', !props[FK] && !props[MK] && props[KEY].version === 3 && props[KEY].value.flags['EBR-1']);
    ok('...but still shows what the old property holds', r.value.done[pym]['EBR-1'] && r.value.flags['EBR-1']);
    ok('...and a change writes nothing, saying dry', saves.length === 0 && w.dry === true && w.written === false, saves.join() + ' / ' + JSON.stringify(w));
    ok('...each part it would write shown in the console', shown === 2, String(shown));
    reset();
    gm[L.DRY_KEY] = true;
    const six = {};
    for (let i = 0; i < L.KEEP_MONTHS; i++) { const d = new Date(Date.UTC(2026, i, 1)).toISOString().slice(0, 7); six[d] = sample(d); put(Q.monthKey(d), { v: 1, ym: d, verdicts: {} }); }
    put(KEY, { v: 1, months: six, done: {}, flags: {} });
    console.log = (...a) => { if (!/DRY RUN/.test(String(a[0]))) { quiet.apply(console, a); } };
    w = await Q.mutate(['2026-07'], freeze('2026-07'));
    console.log = quiet;
    ok('...nor deletes the verdicts of a month it would no longer keep', deletes.length === 0 && props[Q.monthKey('2026-01')] && w.dry === true, deletes.join());
    delete gm[L.DRY_KEY];

    // ---- 'all': every month, for Show ledger ----
    reset();
    put(KEY, { v: 1, months: { [pym]: sample(pym) }, done: { [ym2]: {} }, flags: {} });
    put(MK2, { v: 1, ym: ym2, verdicts: { 'EBR-7': verdict('ok') } });
    r = await Q.read('all');
    ok("read('all') gives every month the old property names", JSON.stringify(Object.keys(r.value.done).sort()) === JSON.stringify([ym2, pym].sort()) && r.value.done[ym2]['EBR-7'], JSON.stringify(r.value.done));

    // ---- the key listing Clear ledger deletes by ----
    const pagesSeen = [];
    JiTA.conf._ajax = (method, path) => {
        pagesSeen.push(method + ' ' + path);
        if (path.indexOf('cursor=2') < 0) {
            return Promise.resolve({ data: { results: [{ key: MK }, { key: L.LEDGER_KEY }, { key: KEY }, { key: 'jita_leadduty_snooze_v1' }], _links: { next: '/wiki/api/v2/pages/' + L.ledgerPage() + '/properties?limit=250&cursor=2' } }, xhr: null });
        }
        return Promise.resolve({ data: { results: [{ key: FK }, { key: MK2 }, { key: 'jita_leadduty_qcx' }], _links: {} }, xhr: { getResponseHeader: () => null } });
    };
    const keys = await Q.keys();
    ok('keys() lists every QC property on the ledger page, over every page of the listing', JSON.stringify(keys) === JSON.stringify([KEY, FK, MK, MK2].sort()), JSON.stringify(keys));
    ok('...and none of the others', keys.indexOf(L.LEDGER_KEY) < 0 && keys.indexOf('jita_leadduty_qcx') < 0);
    ok('...reading the ledger page\'s properties', pagesSeen.length === 2 && pagesSeen[0] === 'GET /wiki/api/v2/pages/' + L.ledgerPage() + '/properties?limit=' + JiTA.conf.PAGE_LIMIT, pagesSeen.join(' | '));

    // ---- the sizes: six months with three Leads, under the cap in every part ----
    reset();
    let single = { v: 1, months: {}, done: {}, flags: {} };
    for (let i = 0; i < L.KEEP_MONTHS; i++) {
        const d = new Date(Date.UTC(2026, i, 1)).toISOString().slice(0, 7), items = [];
        for (let j = 0; j < 30; j++) { items.push('EBR-' + (100000 + i * 100 + j)); }
        await Q.mutate([d], freeze(d));
        const big = { roster: ['lookuptable', 'schogol', 'solnichka'], quota: 10, poolSize: 400, at: d + '-02T08:00:00.000Z',
            assign: { lookuptable: items.slice(0, 10), schogol: items.slice(10, 20), solnichka: items.slice(20) }, actors: {} };
        items.forEach((k) => { big.actors[k] = 'ISD Bug Hunter ' + k.slice(-3); });
        await Q.mutate([d], (v) => { v.months[d] = big; return v; });
        await Q.mutate([d], (v) => {
            items.forEach((k, j) => {
                v.done[d] = v.done[d] || {};
                v.done[d][k] = { verdict: j % 5 ? 'ok' : 'flag', by: 'solnichka', at: d + '-1' + (j % 10) + 'T12:34:56.789Z', actor: 'ISD Bug Hunter ' + k.slice(-3), note: j % 5 ? undefined : 'Wrong component, see the log' };
                if (!(j % 5)) { v.flags[k] = { ym: d, by: 'solnichka', actor: 'ISD Bug Hunter ' + k.slice(-3), at: d + '-1' + (j % 10) + 'T12:34:56.789Z', note: 'Wrong component, see the log' }; }
            });
            return v;
        });
        single.months[d] = big;
    }
    r = await Q.read('all');
    single.done = r.value.done; single.flags = r.value.flags;
    const sizes = Object.keys(props).map((k) => [k, JSON.stringify(props[k].value).length]);
    ok('six full months would not fit one property (why the ledger is in parts)', JSON.stringify(single).length > L.MAX_PROP_BYTES, String(JSON.stringify(single).length));
    ok('...in parts every one is well under the cap', sizes.every((s) => s[1] < L.MAX_PROP_BYTES * 0.75), JSON.stringify(sizes));
    ok('...all six months kept, their verdicts read back whole', Object.keys(r.value.done).length === 6 && Object.keys(r.value.done).every((d) => Object.keys(r.value.done[d]).length === 30), JSON.stringify(Object.keys(r.value.done)));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'QC ledger parts checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
