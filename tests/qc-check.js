// qc-check.js - quality control's write path and its table on the ledger page (v3.36.0). A flag's reason is
// kept with the verdict and shown in the page's Reason column, and a verdict marked by mistake can be taken
// back (Undo) - your own only, withdrawing an open follow-up with it, never one already followed up. Evals the
// real JiTA.conf + JiTA.leadduty against a stubbed Confluence property store and meta store.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
if (cs < 0 || ce < 0 || ls < 0 || le < 0) { throw new Error('could not slice JiTA.conf / JiTA.leadduty'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const meta = {};
global.gmGet = (k, d) => (k === 'leadDutyMe' ? { accountId: 'a', displayName: 'ISD BH Schogol', handle: 'schogol', isLead: true } : d);
global.gmSet = () => {};
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5,
    credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 } },
    dlog: () => {}, link: {}, sync: {}, util: {}, worker: {},
    db: { getMeta: (k) => Promise.resolve(meta[k] == null ? null : JSON.parse(JSON.stringify(meta[k]))),
          setMeta: (k, v) => { meta[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); } }
};
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
const L = global.JiTA.leadduty, R = L.report, Q = L.qc;

// ---- a Confluence property store, versioned like the real thing ----
const props = {};
let writes = 0;
JiTA.conf.getProperty = (p, key) => Promise.resolve(props[key] ? JSON.parse(JSON.stringify(props[key])) : null);
JiTA.conf.saveProperty = (p, key, value, prop) => {
    writes++;
    props[key] = { id: key, key: key, value: JSON.parse(JSON.stringify(value)), version: (prop ? prop.version : 0) + 1 };
    return Promise.resolve(props[key]);
};
let taps = 0;
R.schedule = () => { taps++; };   // a written ledger change republishes the page; count it instead of waiting

const pym = L._prevYm();
const KEY = L.QC_LEDGER_KEY;
function seed() {
    props[KEY] = { id: KEY, key: KEY, version: 1, value: {
        v: 1,
        months: { [pym]: { roster: ['lookuptable', 'schogol', 'solnichka'], quota: 3, poolSize: 12,
            assign: { schogol: ['EBR-1', 'EBR-2', 'EBR-3'], solnichka: ['EBR-9'] } } },
        done: {}, flags: {}
    } };
}
const value = () => props[KEY].value;
const item = (key) => ({ key: key, kind: 'report', summary: 'Summary of ' + key, actor: 'ISD Bob' });

// The Items table as rows of cells, so a column can be read by name.
function itemsTable(html) {
    const at = html.indexOf('<h3>Items</h3>');
    const t = html.slice(html.indexOf('<table>', at), html.indexOf('</table>', at));
    const rows = t.split('<tr>').slice(1).map((r) => (r.match(/<t[hd]>([\s\S]*?)<\/t[hd]>/g) || []).map((c) => c.replace(/^<t[hd]>|<\/t[hd]>$/g, '')));
    return { head: rows[0], body: rows.slice(1) };
}
function cell(tbl, key, col) {
    const i = tbl.head.indexOf(col);
    const row = tbl.body.find((r) => r[0].indexOf('>' + key + '<') >= 0);
    return (row && i >= 0) ? row[i] : undefined;
}

(async () => {
    // ---- the reason travels with the verdict ----
    seed();
    await Q.markChecked('EBR-1', 'flag', pym, '  Wrong   component <b>&  ', item('EBR-1'));
    await Q.markChecked('EBR-2', 'ok', pym, null, item('EBR-2'));
    ok('a flag keeps its reason with the verdict', value().done[pym]['EBR-1'].note === 'Wrong component <b>&', JSON.stringify(value().done[pym]['EBR-1']));
    ok('...and on the follow-up, as before', value().flags['EBR-1'].note === 'Wrong component <b>&');
    ok('a Checked verdict carries no reason', !('note' in value().done[pym]['EBR-2']));

    // ---- the page: a Reason column ----
    let tbl = itemsTable(R._qcSection(value(), pym));
    ok('the Items table has a Reason column', tbl.head.indexOf('Reason') >= 0, JSON.stringify(tbl.head));
    ok('...next to the verdict and the time', tbl.head.join('|') === 'Issue|Assigned to|Handled by|Verdict|When|Reason', tbl.head.join('|'));
    ok('a flagged item shows its reason', cell(tbl, 'EBR-1', 'Reason') === 'Wrong component &lt;b&gt;&amp;', cell(tbl, 'EBR-1', 'Reason'));
    ok('...escaped, so a reason cannot break the page', cell(tbl, 'EBR-1', 'Reason').indexOf('<b>') < 0);
    ok('a checked item shows none', cell(tbl, 'EBR-2', 'Reason') === '', cell(tbl, 'EBR-2', 'Reason'));
    ok('an outstanding item shows none', cell(tbl, 'EBR-3', 'Reason') === '', cell(tbl, 'EBR-3', 'Reason'));
    ok('every row has a cell for every column', tbl.body.every((r) => r.length === tbl.head.length), JSON.stringify(tbl.body.map((r) => r.length)));

    // A verdict recorded before reasons were stored with it: the month's follow-up still has the reason.
    const legacy = JSON.parse(JSON.stringify(value()));
    delete legacy.done[pym]['EBR-1'].note;
    tbl = itemsTable(R._qcSection(legacy, pym));
    ok('an older flag reads its reason from the follow-up', cell(tbl, 'EBR-1', 'Reason') === 'Wrong component &lt;b&gt;&amp;', cell(tbl, 'EBR-1', 'Reason'));
    legacy.flags['EBR-1'].ym = '2020-01';
    tbl = itemsTable(R._qcSection(legacy, pym));
    ok("...but never another month's follow-up", cell(tbl, 'EBR-1', 'Reason') === '(no reason given)', cell(tbl, 'EBR-1', 'Reason'));
    await Q.markChecked('EBR-3', 'flag', pym, '', item('EBR-3'));
    tbl = itemsTable(R._qcSection(value(), pym));
    ok('a flag raised without a reason says so', cell(tbl, 'EBR-3', 'Reason') === '(no reason given)', cell(tbl, 'EBR-3', 'Reason'));

    // ---- Undo ----
    seed();
    await Q.markChecked('EBR-1', 'flag', pym, 'Should have been attached', item('EBR-1'));
    await Q.markChecked('EBR-2', 'ok', pym, null, item('EBR-2'));
    taps = 0;
    let r = await Q.uncheck('EBR-2', pym);
    ok('Undo takes a Checked verdict back', !value().done[pym]['EBR-2'] && r.written, JSON.stringify(value().done[pym]));
    ok('...and the page republishes', taps === 1, String(taps));
    r = await Q.uncheck('EBR-1', pym);
    ok('Undo takes a flag back', !value().done[pym]['EBR-1'] && r.written);
    ok('...withdrawing its open follow-up, reason and all', !value().flags['EBR-1'], JSON.stringify(value().flags));
    await Q.markChecked('EBR-2', 'ok', pym, null, item('EBR-2'));
    ok('an undone item can be judged again', value().done[pym]['EBR-2'] && value().done[pym]['EBR-2'].verdict === 'ok');

    // Another Lead's verdict is theirs.
    value().done[pym]['EBR-9'] = { by: 'solnichka', at: 'x', verdict: 'ok' };
    const w0 = writes; taps = 0;
    r = await Q.uncheck('EBR-9', pym);
    ok("another Lead's verdict is never undone", !!value().done[pym]['EBR-9'] && !r.written && writes === w0 && taps === 0);

    // A follow-up that has been dealt with stays on the record.
    await Q.markChecked('EBR-3', 'flag', pym, 'Wrong status', item('EBR-3'));
    await Q.resolveFlag('EBR-3', 'Talked it through with Bob');
    const w1 = writes;
    r = await Q.uncheck('EBR-3', pym);
    ok('a resolved flag is not undone', !!value().done[pym]['EBR-3'] && !r.written && writes === w1);
    ok('...and its follow-up is kept, outcome included', value().flags['EBR-3'] && value().flags['EBR-3'].outcome === 'Talked it through with Bob');

    // A follow-up from another month belongs to that month.
    value().flags['EBR-7'] = { by: 'schogol', at: 'x', ym: '2020-01', note: 'old', resolvedAt: 'y' };
    value().done[pym]['EBR-7'] = { by: 'schogol', at: 'x', verdict: 'ok' };
    r = await Q.uncheck('EBR-7', pym);
    ok("another month's resolved follow-up does not block Undo", !value().done[pym]['EBR-7'] && r.written);
    ok("...and is not withdrawn by it", value().flags['EBR-7'] && value().flags['EBR-7'].note === 'old');

    const w2 = writes; taps = 0;
    r = await Q.uncheck('EBR-404', pym);
    ok('nothing to take back writes nothing', !r.written && writes === w2 && taps === 0);

    // ---- which rows offer Undo ----
    ok('your own verdict can be undone', Q.undoable({ by: 'schogol', verdict: 'ok' }, null, pym) === true);
    ok('your own open flag can be undone', Q.undoable({ by: 'schogol', verdict: 'flag' }, { ym: pym, note: 'n' }, pym) === true);
    ok('a mark still waiting to reach Confluence can be undone', Q.undoable({ by: 'schogol', at: 'x', local: true }, null, pym) === true);
    ok("another Lead's verdict cannot", Q.undoable({ by: 'solnichka', verdict: 'ok' }, null, pym) === false);
    ok('a resolved flag cannot', Q.undoable({ by: 'schogol', verdict: 'flag' }, { ym: pym, resolvedAt: 'z' }, pym) === false);
    ok("another month's resolved follow-up does not stop it", Q.undoable({ by: 'schogol', verdict: 'ok' }, { ym: '2020-01', resolvedAt: 'z' }, pym) === true);
    ok('nothing judged, nothing to undo', Q.undoable(null, null, pym) === false);

    // ---- the local mirror forgets it too ----
    meta.m = { ym: pym, items: ['A', 'B'], done: { A: 't1', B: 't2' }, pending: ['A'] };
    await L.local.unmark('m', 'A');
    ok('the mirror drops the mark', !meta.m.done.A && meta.m.done.B === 't2', JSON.stringify(meta.m.done));
    ok('...and its queued replay, so it cannot come back', meta.m.pending.length === 0, JSON.stringify(meta.m.pending));
    ok('a missing mirror is left alone', (await L.local.unmark('nope', 'A')) === null && !('nope' in meta));

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'quality control checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', e && e.stack || e); process.exit(2); });
