// Eval the real JiTA.leadduty literal and drive qc.fetchPool / fetchExclusions against stubs. The bug this
// pins: the REPORT half of the quality-control pool had no ISD-membership filter at all, so every EBR that
// anyone (a CCP dev, a GM, an automation) closed last month was sampled as ISD work to grade.
const fs = require('fs');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
if (ls < 0 || le < 0) { throw new Error('could not slice JiTA.leadduty'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const AUTO = 'auto:1';
const meta = {};
global.gmGet = (k, d) => d;
global.gmSet = () => {};
global.JiTA = {
    HOST: 'https://x.atlassian.net', PAGE_SIZE: 100, PAGE_DELAY_MS: 0, MAX_RETRIES: 5,
    credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 }, AUTOMATION_ID: AUTO },
    dlog: () => {}, link: {}, sync: {}, util: {},
    db: {
        getMeta: (k) => Promise.resolve(Object.prototype.hasOwnProperty.call(meta, k) ? meta[k] : null),
        setMeta: (k, v) => { meta[k] = v; return Promise.resolve(); }
    }
};
eval(src.slice(cs, ce));
eval(src.slice(ls, le + em.length));
const L = global.JiTA.leadduty;

// The ISD group: two Leads plus one rank-and-file member. Naum Negru is NOT in it.
const MEMBERS = [
    { accountId: 'acc:solnichka', displayName: 'ISD BH Solnichka' },
    { accountId: 'acc:schogol', displayName: 'ISD BH Schogol' },
    { accountId: 'acc:caranox', displayName: 'ISD Caranox' }
];
// What each account transitioned last month. 'acc:naum' is the outsider the sample must never contain.
const ACTIONED = {
    'acc:solnichka': ['EBR-68309'],
    'acc:schogol': ['EBR-67811', 'EBR-68309'],   // also touched 68309 -> both are excluded from grading it
    'acc:caranox': ['EBR-68320'],
    'acc:naum': ['EBR-61902', 'EBR-67228', 'EBR-55901'],
    [AUTO]: ['EBR-67996', 'EBR-70000']           // converted by CCP's rule; assignee decides whose work it is
};
const ASSIGNEE = { 'EBR-67996': 'acc:caranox', 'EBR-70000': 'acc:naum' };

let searches = [], gets = 0;
function stub() {
    searches = []; gets = 0;
    L._get = (p) => { gets++; return Promise.resolve({ isLast: true, values: MEMBERS.slice() }); };
    L._search = (jql, fields) => {
        searches.push(jql);
        if (/issuetype = Defect/.test(jql)) {
            return Promise.resolve([
                { key: 'EDR-7650', fields: { summary: 'Corps fail to join FW', status: { name: 'Open' }, created: '2026-08-04T00:00:00.000Z', reporter: { accountId: 'acc:duplutp', displayName: 'ISD Duplutp' } } },
                { key: 'EDR-7623', fields: { summary: 'Missing Weekly SP', status: { name: 'Open' }, created: '2026-08-09T00:00:00.000Z', reporter: { accountId: 'acc:schogol', displayName: 'ISD BH Schogol' } } }
            ]);
        }
        const m = /BY "([^"]+)"/.exec(jql);
        const keys = (m && ACTIONED[m[1]]) || [];
        void fields;
        return Promise.resolve(keys.map((k) => ({
            key: k,
            fields: {
                summary: k + ' summary', status: { name: 'Closed' }, created: '2026-08-02T00:00:00.000Z',
                assignee: ASSIGNEE[k] ? { accountId: ASSIGNEE[k], displayName: (MEMBERS.filter((x) => x.accountId === ASSIGNEE[k])[0] || { displayName: 'Naum Negru' }).displayName } : null
            }
        })));
    };
}

(async () => {
    stub();
    const pool = await L.qc.fetchPool('2026-08');
    const has = (k) => Object.prototype.hasOwnProperty.call(pool.byKey, k);

    ok('a report closed by a non-member is NOT sampled', !has('EBR-61902') && !has('EBR-67228') && !has('EBR-55901'),
        Object.keys(pool.byKey).join(' '));
    ok('reports handled by ISD members ARE sampled', has('EBR-67811') && has('EBR-68320') && has('EBR-68309'));
    ok('every EBR search is scoped to one account', searches.filter((j) => /project = EBR/.test(j) && !/ BY "/.test(j)).length === 0,
        searches.filter((j) => /project = EBR/.test(j) && !/ BY "/.test(j))[0]);
    ok('one EBR search per member, plus one for the automation account',
        searches.filter((j) => /project = EBR/.test(j)).length === MEMBERS.length + 1,
        searches.filter((j) => /project = EBR/.test(j)).length + ' searches');

    ok('an automation conversion is credited to its ISD assignee', has('EBR-67996') && pool.byKey['EBR-67996'].actor === 'ISD Caranox');
    ok('an automation conversion for a non-member is dropped', !has('EBR-70000'));

    ok('the handler travels with each report', pool.byKey['EBR-68320'].actor === 'ISD Caranox', pool.byKey['EBR-68320'].actor);
    ok('the displayed handler is stable across Leads (fixed member order)', pool.byKey['EBR-68309'].actor === 'ISD BH Schogol',
        pool.byKey['EBR-68309'].actor);
    ok('every account that touched a report is recorded',
        Object.keys(pool.byKey['EBR-68309'].handlers).sort().join(',') === 'acc:schogol,acc:solnichka');

    ok('the defect half still filters on group membership in JQL',
        searches.filter((j) => /issuetype = Defect/.test(j) && /membersOf\("Contractors ISD ECAID"\)/.test(j)).length === 1);
    ok('a defect carries its reporter as the handler', pool.byKey['EDR-7650'].actor === 'ISD Duplutp');
    ok('the pool keys are canonically sorted', JSON.stringify(pool.keys) === JSON.stringify(pool.keys.slice().sort()));

    // Exclusions now fall out of the pool: no Lead grades a decision they made, at zero request cost.
    const before = searches.length + gets;
    const excl = await L.qc.fetchExclusions(['lookuptable', 'schogol', 'solnichka'],
        { schogol: 'acc:schogol', solnichka: 'acc:solnichka', lookuptable: 'acc:lookuptable' }, pool);
    ok('exclusions cost no extra requests', searches.length + gets === before);
    ok('a Lead is excluded from a report they handled', !!excl.schogol['EBR-67811'] && !excl.solnichka['EBR-67811']);
    ok('BOTH handlers of one report are excluded from it', !!excl.schogol['EBR-68309'] && !!excl.solnichka['EBR-68309']);
    ok('a Lead is excluded from a defect they reported', !!excl.schogol['EDR-7623'] && !excl.solnichka['EDR-7623']);
    ok('a Lead who handled nothing is excluded from nothing', Object.keys(excl.lookuptable).length === 0);

    // The member list is cached, so a second month in the same session costs no group crawl.
    stub();
    await L.qc.fetchPool('2026-07');
    ok('the group member list is cached across months', gets === 0, gets + ' group requests');

    // A group crawl that fails with nothing cached must NOT silently yield an empty (and therefore
    // unfiltered-looking) pool - it has to surface.
    delete meta['leadduty:group'];
    L._get = () => Promise.reject(new Error('HTTP 403'));
    let threw = false;
    try { await L.group.members(true); } catch (e) { threw = true; }
    ok('an unresolvable group surfaces instead of emptying the sample', threw);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'pool checks passed.'));
    process.exit(fail ? 1 : 0);
})();
