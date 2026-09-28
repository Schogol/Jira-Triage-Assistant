// Evaluates the REAL JiTA.leadduty object literal out of JiTA.user.js and exercises the pure,
// deterministic parts: the PRNG, both assignment algorithms, and the coverage-window sizing.
const fs = require('fs');
const path = (process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'));
const src = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const start = src.indexOf('JiTA.leadduty = {');
const endMark = '\n    _noop: null\n};';
const end = src.indexOf(endMark, start);
if (start < 0 || end < 0) { throw new Error('could not slice JiTA.leadduty out of the file'); }
const body = src.slice(start, end + endMark.length);

// JiTA.conf comes along for the ride: the page-body renderer escapes every value through JiTA.conf.esc,
// and a bad escape would break the WHOLE page write, not one cell.
const confStart = src.indexOf('JiTA.conf = {');
const confEnd = src.indexOf('/* ---- ISD Lead duties', confStart);
if (confStart < 0 || confEnd < 0) { throw new Error('could not slice JiTA.conf out of the file'); }
const confBody = src.slice(confStart, confEnd);

global.gmGet = (k, d) => d;
global.gmSet = () => {};
global.JiTA = {
    HOST: 'https://example.invalid',
    credits: {
        LEADS: { schogol: true, solnichka: true, lookuptable: true }, OLD_DOMAIN: 'ccpgames.com',
        AUTOMATION_ID: '557058:f58131cb-b67d-43c7-b30d-6b58d40bd077', AUTOMATION_EMAIL: 'workato@ccpgames.com'
    },
    dlog: () => {}, db: {}, link: {}, sync: {}, util: {}, PAGE_SIZE: 100, PAGE_DELAY_MS: 250, MAX_RETRIES: 5
};
eval(confBody);
eval(body);
const L = global.JiTA.leadduty;

let failures = 0;
function ok(name, cond, extra) {
    if (cond) { console.log('  PASS  ' + name); }
    else { failures++; console.log('  FAIL  ' + name + (extra ? ('  -> ' + extra) : '')); }
}

// ---------------------------------------------------------------- PRNG
console.log('\nPRNG determinism');
const keys = Array.from({ length: 200 }, (_, i) => 'EBR-' + (1000 + i)).sort();
const a = L._shuffle(keys, 'jita-leadduty-qc|v1|2026-08');
const b = L._shuffle(keys, 'jita-leadduty-qc|v1|2026-08');
const c = L._shuffle(keys, 'jita-leadduty-qc|v1|2026-09');
ok('same seed -> identical order', JSON.stringify(a) === JSON.stringify(b));
ok('adjacent months -> different order', JSON.stringify(a) !== JSON.stringify(c));
ok('shuffle is a permutation', JSON.stringify(a.slice().sort()) === JSON.stringify(keys));
const moved = a.filter((k, i) => k !== keys[i]).length;
ok('adjacent-month seeds avalanche (>90% of positions move)', moved > keys.length * 0.9, moved + '/' + keys.length);

// ---------------------------------------------------------------- wiki sizing
console.log('\nWiki sizing (cover the whole section within the window)');
const roster = L.ROSTER();
ok('roster is sorted and stable', JSON.stringify(roster) === JSON.stringify(roster.slice().sort()));
const WIN = L.coverageMonths(), EYES = L.eyes();
[[430, 3], [12, 3], [2, 3], [1, 3], [5000, 3], [37, 4]].forEach(([n, l]) => {
    const per = L.wiki.perLead(n, l);
    ok('pool ' + n + ', ' + l + ' leads -> ' + per + '/lead gives ' + n + ' pages ' + EYES + ' readings in ' + WIN + ' months',
        per * l * WIN >= n * EYES);
});
ok('perLead never drops to zero', L.wiki.perLead(1, 3) >= 1);

// ---------------------------------------------------------------- wiki assignment
console.log('\nWiki assignment');
function mkPool(n) { return { pages: Array.from({ length: n }, (_, i) => ({ id: String(100000 + i), title: 'Page ' + i })) }; }
const pool = mkPool(430);
const per = L.wiki.perLead(pool.pages.length, roster.length);
const q0 = L.wiki.buildQueue(pool, { lastReviewed: {} });
const as1 = L.wiki.computeAssign(q0, roster, per, '2026-09', {});
const as1b = L.wiki.computeAssign(q0, roster, per, '2026-09', {});
ok('deterministic across calls', JSON.stringify(as1) === JSON.stringify(as1b));
const all = roster.reduce((acc, h) => acc.concat(as1[h]), []);
ok('every lead gets exactly ' + per, roster.every(h => as1[h].length === per));
ok('assignments are disjoint', new Set(all).size === all.length);
const as2 = L.wiki.computeAssign(q0, roster, per, '2026-10', {});
ok('rotation shifts who gets the head of the queue', as1[roster[0]][0] !== as2[roster[0]][0]);

// Four eyes, the part that has to hold every single month: nobody is ever handed a page they read last.
console.log('\nFour-eyes constraint');
ok('per-Lead count doubles for two eyes', per === Math.ceil(430 * EYES / (WIN * 3)), String(per));
const prior = {};
pool.pages.forEach((p, i) => { prior[p.id] = roster[i % roster.length]; });
const fresh = L.wiki.computeAssign(q0, roster, per, '2026-09', prior);
ok('never assigned to the Lead who read it last',
    roster.every(h => fresh[h].every(id => prior[id] !== h)));
ok('and the month is still filled', roster.every(h => fresh[h].length === per),
    roster.map(h => h + ':' + fresh[h].length).join(' '));
// A single-Lead roster cannot satisfy the rule; assigning nothing would be worse than one pair of eyes.
const solo = ['schogol'], soloPrior = {};
pool.pages.forEach(p => { soloPrior[p.id] = 'schogol'; });
const soloAsg = L.wiki.computeAssign(q0, solo, 5, '2026-09', soloPrior);
ok('a one-Lead roster waives the rule rather than stalling', soloAsg.schogol.length === 5);

// eyesIn is what "covered" means: reviews INSIDE the window only, so an aged-out pair does not count.
const nowStamp = L._today();
const oldStamp = (Number(nowStamp.slice(0, 4)) - Math.ceil(WIN / 12) - 1) + nowStamp.slice(4);
ok('no reviews -> 0 eyes', L.wiki.eyesIn({}, 'x') === 0);
ok('one recent review -> 1 eye', L.wiki.eyesIn({ lastReviewed: { x: nowStamp } }, 'x') === 1);
ok('two recent reviews -> 2 eyes',
    L.wiki.eyesIn({ lastReviewed: { x: nowStamp }, prevReviewed: { x: nowStamp } }, 'x') === 2);
ok('a pair read before the window counts for nothing now',
    L.wiki.eyesIn({ lastReviewed: { x: oldStamp }, prevReviewed: { x: oldStamp } }, 'x') === 0);
ok('a recent review over an ancient one -> 1 eye',
    L.wiki.eyesIn({ lastReviewed: { x: nowStamp }, prevReviewed: { x: oldStamp } }, 'x') === 1);
console.log('\nWiki ' + WIN + '-month coverage simulation (430 pages, 3 leads, four eyes)');
// Mirrors markReviewed exactly, including its refusal to count a repeat by the SAME Lead as a second pair.
const led = { lastReviewed: {}, prevReviewed: {}, reviewedBy: {} };
const reviewers = {};   // id -> Set of distinct Leads who read it during the window
let ym = '2026-01', breaches = 0;
for (let month = 0; month < WIN; month++) {
    const queue = L.wiki.buildQueue(pool, led);
    const asg = L.wiki.computeAssign(queue, roster, per, ym, led.reviewedBy);
    const seen = new Set();
    roster.forEach(h => asg[h].forEach(id => {
        if (seen.has(id)) { failures++; console.log('  FAIL  duplicate assignment in ' + ym + ': ' + id); }
        if (led.reviewedBy[id] === h) { breaches++; }
        seen.add(id);
        if (led.lastReviewed[id] && led.reviewedBy[id] !== h) { led.prevReviewed[id] = led.lastReviewed[id]; }
        led.lastReviewed[id] = ym + '-15';
        led.reviewedBy[id] = h;
        (reviewers[id] = reviewers[id] || new Set()).add(h);
    }));
    const p = L._ymParts(ym);
    ym = p.m === 12 ? (p.y + 1) + '-01' : p.y + '-' + String(p.m + 1).padStart(2, '0');
}
ok('nobody ever re-read their own page back to back', breaches === 0, breaches + ' breaches');
const unread = pool.pages.filter(pg => !led.lastReviewed[pg.id]).length;
ok('every page reviewed at least once in the window', unread === 0, unread + ' left unread');
const oneEye = pool.pages.filter(pg => (reviewers[pg.id] || new Set()).size < 2).length;
ok('every page read by ' + EYES + ' DIFFERENT leads within ' + WIN + ' months', oneEye === 0, oneEye + ' left on one pair of eyes');
const threePlus = pool.pages.filter(pg => (reviewers[pg.id] || new Set()).size > 2).length;
console.log('  note: ' + per + ' pages per Lead per month; ' + threePlus + ' pages got a third reading (spare capacity)');

// ---------------------------------------------------------------- QC assignment
console.log('\nQC assignment (self-exclusion + quota fill + disjointness)');
const qcPool = Array.from({ length: 400 }, (_, i) => (i % 2 ? 'EBR-' : 'EO-') + (2000 + i)).sort();
// Leads author most of the pool - the case that breaks a naive "take the first N I didn't author".
const excl = {};
roster.forEach((h, i) => {
    excl[h] = {};
    qcPool.forEach((k, j) => { if (j % roster.length === i && j % 4 !== 0) { excl[h][k] = true; } });
});
const quota = 10;
const r1 = L.qc.computeAssign(qcPool, roster, quota, excl, '2026-08');
const r2 = L.qc.computeAssign(qcPool, roster, quota, excl, '2026-08');
ok('deterministic across calls', JSON.stringify(r1) === JSON.stringify(r2));
ok('every lead reaches quota (' + quota + ')', roster.every(h => r1[h].length === quota),
    roster.map(h => h + ':' + r1[h].length).join(' '));
ok('nobody is given their own work', roster.every(h => r1[h].every(k => !excl[h][k])));
const flatAll = roster.reduce((acc, h) => acc.concat(r1[h]), []);
ok('assignments are disjoint', new Set(flatAll).size === flatAll.length);

// A lead who authored nearly everything should degrade gracefully, not crash or over-assign.
const hog = roster[0];
const excl2 = {};
roster.forEach(h => { excl2[h] = {}; });
qcPool.forEach((k, j) => { if (j < qcPool.length - 3) { excl2[hog][k] = true; } });
const r3 = L.qc.computeAssign(qcPool, roster, quota, excl2, '2026-08');
ok('near-total author gets only what is available, no crash', r3[hog].length <= 3,
    hog + ' got ' + r3[hog].length);
ok('the other leads still reach quota', roster.slice(1).every(h => r3[h].length === quota));

// The defect floor. ISD files far more reports than defects, so a proportional draw would hand most
// Leads none at all - these assert the floor is met whenever the month produced enough defects, and
// degrades honestly when it did not.
console.log('\nQC defect floor');
const MIN = L.qcMinDefects();
const isDef = k => !/^EBR-/.test(k);
const nDef = m => roster.reduce((acc, h) => Object.assign(acc, { [h]: m[h].filter(isDef).length }), {});
const noExcl = () => roster.reduce((a, h) => Object.assign(a, { [h]: {} }), {});
function issuePool(reports, defects) {
    const out = [];
    for (let i = 0; i < reports; i++) { out.push('EBR-' + (10000 + i)); }
    for (let j = 0; j < defects; j++) { out.push('EO-' + (500 + j)); }
    return out.sort();
}
ok('floor is the configured 2', MIN === 2, String(MIN));
// The real shape of the month: hundreds of reports, a handful of defects.
const lop = L.qc.computeAssign(issuePool(400, 12), roster, quota, noExcl(), '2026-08');
const lopDef = nDef(lop);
ok('every lead gets the defect floor from a report-heavy pool', roster.every(h => lopDef[h] >= MIN),
    roster.map(h => h + ':' + lopDef[h]).join(' '));
ok('and still reaches quota', roster.every(h => lop[h].length === quota),
    roster.map(h => h + ':' + lop[h].length).join(' '));
ok('the rest is made up of reports, not more defects', roster.every(h => lopDef[h] <= MIN),
    roster.map(h => h + ':' + lopDef[h]).join(' '));
const lopFlat = roster.reduce((acc, h) => acc.concat(lop[h]), []);
ok('still disjoint', new Set(lopFlat).size === lopFlat.length);
ok('deterministic', JSON.stringify(L.qc.computeAssign(issuePool(400, 12), roster, quota, noExcl(), '2026-08')) === JSON.stringify(lop));
// Not enough defects to go round: share what exists rather than under-filling the month.
const thin = L.qc.computeAssign(issuePool(400, 2), roster, quota, noExcl(), '2026-08');
const thinDef = nDef(thin);
ok('a two-defect month shares them out instead of failing',
    roster.reduce((n, h) => n + thinDef[h], 0) === 2 && roster.every(h => thinDef[h] <= 1),
    roster.map(h => h + ':' + thinDef[h]).join(' '));
ok('and every lead still reaches quota on reports', roster.every(h => thin[h].length === quota));
// No defects at all: the floor must not stall the pass.
const none = L.qc.computeAssign(issuePool(400, 0), roster, quota, noExcl(), '2026-08');
ok('a month with no defects still fills every lead', roster.every(h => none[h].length === quota),
    roster.map(h => h + ':' + none[h].length).join(' '));
// A Lead who created the only defects must not be handed them back.
const defExcl = noExcl();
issuePool(0, 12).forEach(k => { defExcl[roster[0]][k] = true; });
const own = L.qc.computeAssign(issuePool(400, 12), roster, quota, defExcl, '2026-08');
ok('self-exclusion still wins over the defect floor', own[roster[0]].every(k => !defExcl[roster[0]][k]));
ok('and that lead is still filled to quota', own[roster[0]].length === quota, String(own[roster[0]].length));
// A pool smaller than the floor, and a quota of 1: the floor clamps, it never over-assigns.
const tiny = L.qc.computeAssign(issuePool(1, 1), roster, 1, noExcl(), '2026-08');
ok('quota 1 is never exceeded by the floor', roster.every(h => tiny[h].length <= 1),
    roster.map(h => h + ':' + tiny[h].length).join(' '));

// ---------------------------------------------------------------- subtree exclusions
console.log('\nExcluded subtrees');
ok('both excluded roots are configured', !!L.EXCLUDE_PAGES['199756496'] && !!L.EXCLUDE_PAGES['199762273']);
// root 199758317 -> [A(excluded), B(kept)]; A has a child and a grandchild, B has a child.
const tree = { pages: [
    { id: '199756496', title: 'Training Session Reports', parentId: '199758317', depth: 1 },
    { id: 'a1', title: 'TSR child',        parentId: '199756496', depth: 2 },
    { id: 'a2', title: 'TSR grandchild',   parentId: 'a1',        depth: 3 },
    { id: '199762273', title: 'ECAID - Lead Section', parentId: '199758317', depth: 1 },
    { id: 'c1', title: 'Lead Section child', parentId: '199762273', depth: 2 },
    { id: 'b1', title: 'Normal page',      parentId: '199758317', depth: 1 },
    { id: 'b2', title: 'Normal child',     parentId: 'b1',        depth: 2 }
], fetchedAt: Date.now(), rootId: '199758317', truncated: false };
const filtered = L.pool._applyExclusions(tree);
const keptIds = filtered.pages.map(p => p.id).sort();
ok('excluded roots and all descendants dropped', JSON.stringify(keptIds) === JSON.stringify(['b1', 'b2']), keptIds.join(','));
ok('counts reported', filtered.rawCount === 7 && filtered.excludedCount === 5,
    'raw=' + filtered.rawCount + ' excluded=' + filtered.excludedCount);
ok('cache record is not mutated', tree.pages.length === 7);
// A page added under an excluded branch later must be excluded with no list change.
tree.pages.push({ id: 'a3', title: 'Added later', parentId: 'a2', depth: 4 });
ok('a page added under an excluded branch is excluded automatically',
    L.pool._applyExclusions(tree).pages.map(p => p.id).indexOf('a3') < 0);
// A broken parent chain must not hang.
const broken = { pages: [{ id: 'x', title: 'orphan', parentId: 'missing', depth: 1 }], fetchedAt: 0, rootId: 'r', truncated: false };
ok('orphaned parentId does not hang or throw', L.pool._applyExclusions(broken).pages.length === 1);
const cyc = { pages: [{ id: 'p', parentId: 'q', title: 'p', depth: 1 }, { id: 'q', parentId: 'p', title: 'q', depth: 1 }], fetchedAt: 0, rootId: 'r', truncated: false };
ok('a parent cycle terminates via the hop cap', L.pool._applyExclusions(cyc).pages.length === 2);

console.log('\nReal-world sizing (270 crawled)');
const realKept = 270 - 38;   // illustrative exclusion count
ok('270 crawled -> ' + L.wiki.perLead(270, 3) + '/lead covers it in ' + WIN + ' months', L.wiki.perLead(270, 3) * 3 * WIN >= 270 * EYES);
console.log('  note: ' + L.wiki.perLead(270, 3) + ' pages per Lead per month before exclusions, '
    + L.wiki.perLead(realKept, 3) + ' if ~38 pages sit in the two excluded branches'
    + ' (' + EYES + ' readings each within ' + WIN + ' months)');

// ---------------------------------------------------------------- month helpers
console.log('\nUTC month helpers');
ok('_prevYm rolls the year', L._prevYm('2026-01') === '2025-12');
ok('_prevYm normal case', L._prevYm('2026-09') === '2026-08');
ok('_bounds is half-open across a year end', JSON.stringify(L._bounds('2026-12')) === JSON.stringify({ start: '2026-12-01', end: '2027-01-01' }));
ok('_bounds normal month', JSON.stringify(L._bounds('2026-09')) === JSON.stringify({ start: '2026-09-01', end: '2026-10-01' }));
ok('_ym is UTC', L._ym(new Date(Date.UTC(2026, 0, 1, 0, 30))) === '2026-01');
ok('_monthIndex increments by 1 per month', L._monthIndex('2026-02') - L._monthIndex('2026-01') === 1);

// ---------------------------------------------------------------- page id parsing
console.log('\nPage id parsing');
ok('bare id', L._pageId('123456789') === '123456789');
ok('space URL', L._pageId('https://x.atlassian.net/wiki/spaces/ISD/pages/123456789/Some+Title') === '123456789');
ok('legacy viewpage URL', L._pageId('https://x.atlassian.net/wiki/pages/viewpage.action?pageId=987654321') === '987654321');
ok('garbage rejected', L._pageId('not a page') === '');
ok('empty rejected', L._pageId('') === '');

// ---------------------------------------------------------------- ledger pruning
console.log('\nLedger month pruning');
const big = { v: 1, months: {}, done: {} };
for (let i = 1; i <= 10; i++) { const k = '2026-' + String(i).padStart(2, '0'); big.months[k] = { x: i }; big.done[k] = { y: i }; }
L._prune(big);
ok('months pruned to KEEP_MONTHS', Object.keys(big.months).length === L.KEEP_MONTHS);
ok('oldest months dropped, newest kept', !big.months['2026-01'] && !!big.months['2026-10']);

console.log('\nFollow-up flags');
const iso = ms => new Date(Date.now() - ms).toISOString();
const DAY = 86400000;
const withFlags = {
    v: 1, months: {}, done: {},
    flags: {
        'EBR-1': { by: 'schogol', at: iso(400 * DAY), note: 'ancient but still open' },
        'EBR-2': { by: 'solnichka', at: iso(300 * DAY), resolvedBy: 'schogol', resolvedAt: iso(290 * DAY) },
        'EBR-3': { by: 'lookuptable', at: iso(2 * DAY), resolvedBy: 'schogol', resolvedAt: iso(1 * DAY) }
    }
};
L._prune(withFlags);
ok('an OPEN flag is never pruned, however old', !!withFlags.flags['EBR-1']);
ok('a long-resolved flag ages out', !withFlags.flags['EBR-2']);
ok('a recently-resolved flag is kept', !!withFlags.flags['EBR-3']);
const openList = L.qc.openFlags(withFlags);
ok('openFlags returns only the unresolved ones', openList.length === 1 && openList[0].key === 'EBR-1',
    openList.map(o => o.key).join(','));
ok('openFlags tolerates a ledger with no flags map', L.qc.openFlags({ v: 1 }).length === 0);
ok('openFlags tolerates a null ledger', L.qc.openFlags(null).length === 0);

// Follow-ups are worked per PERSON, not per issue: one note covering everything a Bug Hunter got wrong
// this month, ready to paste. These check the grouping and the generated message.
console.log('\nFollow-ups grouped per bug hunter');
L._me = { accountId: 'x', handle: 'schogol', displayName: 'ISD Schogol', isLead: true };
const grouped = {
    v: 1, months: {}, done: {},
    flags: {
        'EBR-1': { by: 'schogol', at: iso(3 * DAY), ym: '2026-08', kind: 'report', actor: 'ISD Tulwar',
                   summary: 'Closed with no reply', note: 'Trashed, but the player deserved an answer' },
        'EBR-2': { by: 'solnichka', at: iso(2 * DAY), ym: '2026-08', kind: 'report', actor: 'ISD Tulwar',
                   summary: 'Attached to the wrong defect', note: 'The linked defect is a different bug' },
        'EO-9':  { by: 'schogol', at: iso(1 * DAY), ym: '2026-08', kind: 'defect', actor: 'ISD Nomad',
                   summary: 'No repro steps', note: 'Filed with nothing a developer can act on' },
        'EBR-7': { by: 'schogol', at: iso(5 * DAY), ym: '2026-07', kind: 'report', note: 'Old flag, no handler recorded' },
        'EBR-8': { by: 'schogol', at: iso(9 * DAY), ym: '2026-07', kind: 'report', actor: 'ISD Tulwar',
                   resolvedBy: 'schogol', resolvedAt: iso(1 * DAY), note: 'already dealt with' }
    }
};
const groups = L.qc.groupFlags(grouped);
ok('one group per person', groups.length === 3, groups.map(g => g.name + ':' + g.entries.length).join(' '));
ok('busiest person first', groups[0].name === 'ISD Tulwar' && groups[0].entries.length === 2);
ok('a resolved flag is not chased again', groups[0].entries.every(e => e.key !== 'EBR-8'));
ok('a flag with no recorded handler still surfaces, in its own bucket',
    groups.some(g => !g.known && g.entries.length === 1 && g.entries[0].key === 'EBR-7'));
ok('grouping tolerates a ledger with no flags', L.qc.groupFlags({ v: 1 }).length === 0);

const msg = L.qc.followUpText(groups[0]);
ok('the message greets the right person', msg.indexOf('Hey ISD Tulwar,') === 0, msg.slice(0, 40));
ok('it lists every open issue for them', msg.indexOf('EBR-1') !== -1 && msg.indexOf('EBR-2') !== -1);
ok('it carries each summary and reason', msg.indexOf('Closed with no reply') !== -1
    && msg.indexOf('The linked defect is a different bug') !== -1);
ok('it does not mention anyone else\'s issues', msg.indexOf('EO-9') === -1 && msg.indexOf('EBR-8') === -1);
ok('it is signed by the Lead sending it', msg.trim().slice(-11) === 'ISD Schogol', JSON.stringify(msg.slice(-20)));
ok('plural wording for several issues', msg.indexOf('these ones need') !== -1);
ok('it calls them bug reports when that is all they are', msg.indexOf('the bug reports you handled') !== -1);
const defMsg = L.qc.followUpText(groups.filter(g => g.name === 'ISD Nomad')[0]);
ok('a single defect gets singular wording and the right noun',
    defMsg.indexOf('one of them needs') !== -1 && defMsg.indexOf('the defects you created') !== -1);
const anonMsg = L.qc.followUpText(groups.filter(g => !g.known)[0]);
ok('an unknown handler is greeted neutrally, not by the placeholder label',
    anonMsg.indexOf('Hey there,') === 0, anonMsg.slice(0, 30));
ok('a flag with no reason says so rather than leaving a blank line',
    L.qc.followUpText({ name: 'X', known: true, entries: [{ key: 'EBR-5', flag: { kind: 'report' } }] })
        .indexOf('(no reason was recorded)') !== -1);
ok('no em dashes anywhere in the message', !/[\u2013\u2014]/.test(msg));

console.log('\nStorage-format escaping (a page title with XML metacharacters)');
const esc = global.JiTA.conf.esc;
ok('ampersand escaped', esc('Ships & Modules') === 'Ships &amp; Modules');
ok('angle brackets escaped', esc('<script>') === '&lt;script&gt;');
ok('quotes escaped', esc('He said "hi" & it\'s fine') === 'He said &quot;hi&quot; &amp; it&#39;s fine');
ok('null / undefined render empty', esc(null) === '' && esc(undefined) === '');

// Who handled the item. The changelog is stubbed, so this exercises the SELECTION rules: last transition
// into a QC status wins, the automation account is re-credited to the assignee at that moment, and a
// defect never costs a request at all.
console.log('\nQC actor resolution');
const AUTO = { accountId: global.JiTA.credits.AUTOMATION_ID, displayName: 'Automation for Jira' };
let changelogCalls = 0;
const histories = {
    'EBR-10': [
        { created: '2026-08-02T10:00:00.000Z', author: { displayName: 'ISD Tulwar' }, items: [{ field: 'status', toString: 'Attached' }] }
    ],
    // Attached, re-opened, then Closed by someone else: the decision that stuck is the Close.
    'EBR-11': [
        { created: '2026-08-02T10:00:00.000Z', author: { displayName: 'ISD Tulwar' }, items: [{ field: 'status', toString: 'Attached' }] },
        { created: '2026-08-03T10:00:00.000Z', author: { displayName: 'ISD Tulwar' }, items: [{ field: 'status', toString: 'Open' }] },
        { created: '2026-08-04T10:00:00.000Z', author: { displayName: 'ISD Nomad' }, items: [{ field: 'status', toString: 'Closed' }] }
    ],
    // CCP's convert-to-support rule acts as the automation account: credit the assignee at that moment.
    'EBR-12': [
        { created: '2026-08-01T09:00:00.000Z', author: { displayName: 'ISD Nomad' }, items: [{ field: 'assignee', toString: 'ISD Nomad' }] },
        { created: '2026-08-02T09:00:00.000Z', author: AUTO, items: [{ field: 'status', toString: 'Closed' }] },
        { created: '2026-08-09T09:00:00.000Z', author: { displayName: 'ISD Later' }, items: [{ field: 'assignee', toString: 'ISD Later' }] }
    ],
    'EBR-13': [{ created: '2026-08-02T10:00:00.000Z', author: AUTO, items: [{ field: 'status', toString: 'Attached' }] }],
    'EBR-14': [{ created: '2026-08-02T10:00:00.000Z', author: { displayName: 'ISD Tulwar' }, items: [{ field: 'summary', toString: 'x' }] }],
    'EBR-15': null   // the changelog read fails
};
L._changelog = function (key) {
    changelogCalls++;
    return histories[key] ? Promise.resolve(histories[key]) : Promise.reject(new Error('HTTP 404'));
};
const actorTests = Promise.all([
    L.qc.actor({ key: 'EBR-10', kind: 'report' }),
    L.qc.actor({ key: 'EBR-11', kind: 'report' }),
    L.qc.actor({ key: 'EBR-12', kind: 'report' }),
    L.qc.actor({ key: 'EBR-13', kind: 'report' }),
    L.qc.actor({ key: 'EBR-14', kind: 'report' }),
    L.qc.actor({ key: 'EBR-15', kind: 'report' }),
    L.qc.actor({ key: 'EDR-1', kind: 'defect', reporterName: 'ISD Schogol' }),
    L.qc.actor({ key: 'EDR-2', kind: 'defect' }),
    L.qc.actor({ key: 'EBR-99', kind: 'report', actor: 'ISD Cached' }),
    L.qc.actor(null)
]).then(r => {
    ok('single transition -> its author', r[0] === 'ISD Tulwar', r[0]);
    ok('re-opened then re-closed -> the LAST decision', r[1] === 'ISD Nomad', r[1]);
    ok('automation is re-credited to the assignee at that time', r[2] === 'ISD Nomad', r[2]);
    ok('automation with no assignee -> "automation", not a blank', r[3] === 'automation', r[3]);
    ok('no status transition -> empty, not a crash', r[4] === '', JSON.stringify(r[4]));
    ok('a failed changelog read resolves empty rather than rejecting', r[5] === '', JSON.stringify(r[5]));
    ok('a defect uses its reporter', r[6] === 'ISD Schogol', r[6]);
    ok('a defect with no reporter -> empty', r[7] === '', JSON.stringify(r[7]));
    ok('an item that already carries an actor is returned as-is', r[8] === 'ISD Cached', r[8]);
    ok('a missing item resolves empty', r[9] === '', JSON.stringify(r[9]));
    const before = changelogCalls;
    return L.qc.actor({ key: 'EBR-10', kind: 'report' }).then(again => {
        ok('a second lookup is served from cache (no extra request)', changelogCalls === before && again === 'ISD Tulwar');
        ok('a defect never reads a changelog', changelogCalls === 6, changelogCalls + ' reads for 6 reports');
    });
});

actorTests.then(() => {
    console.log('\n' + (failures ? (failures + ' FAILURE(S)') : 'All checks passed.'));
    process.exit(failures ? 1 : 0);
});
