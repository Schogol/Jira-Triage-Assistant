// Render the ledger page body from synthetic ledgers and assert the output is well-formed storage format.
const fs = require('fs');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const cs = src.indexOf('JiTA.conf = {'), ce = src.indexOf('/* ---- ISD Lead duties', cs);
const ls = src.indexOf('JiTA.leadduty = {'), em = '\n    _noop: null\n};', le = src.indexOf(em, ls);
global.gmGet = (k, d) => d; global.gmSet = () => {};
global.JiTA = { HOST: 'https://x.atlassian.net',
  credits: { LEADS: { schogol: 1, solnichka: 1, lookuptable: 1 } },
  dlog: () => {}, db: {}, link: {}, sync: {}, util: {}, PAGE_SIZE: 100, PAGE_DELAY_MS: 250, MAX_RETRIES: 5 };
eval(src.slice(cs, ce)); eval(src.slice(ls, le + em.length));
const L = global.JiTA.leadduty, ym = L._ym(), pym = L._prevYm();

// 999001 is assigned but the pool now EXCLUDES it (the live bug: a newsletter under a folder inside the
// Lead Section). 777002 is assigned and simply GONE - not in the pool, excluded by nothing.
const pool = { fetchedAt: Date.now(), rootId: '1', truncated: false, rawCount: 5, excludedCount: 1,
  excludedIds: { '999001': true }, pages: [
  { id: '11', title: 'Ships & Modules <intro>' }, { id: '12', title: "It's fine" },
  { id: '13', title: 'Third page' }, { id: '14', title: 'Fourth' } ] };
const wiki = { v: 1,
  lastReviewed: { '11': '2026-09-01', '12': '2025-01-04' }, reviewedBy: { '11': 'schogol', '12': 'solnichka' },
  months: { [ym]: { roster: ['lookuptable','schogol','solnichka'], perLead: 1,
    assign: { schogol: ['11'], solnichka: ['12', '777002'], lookuptable: ['13', '999001'] },
    createdAt: '2026-09-01T08:00:00.000Z', createdBy: 'schogol' } },
  done: { [ym]: { '11': { by: 'schogol', at: '2026-09-04T11:02:00.000Z' },
                  '13': { by: 'lookuptable', at: '2026-09-05T09:00:00.000Z', skipped: true } } } };
const qc = { v: 1,
  months: { [pym]: { roster: ['lookuptable','schogol','solnichka'], quota: 2, poolSize: 431,
    assign: { schogol: ['EBR-1','EO-2'], solnichka: ['EBR-3','EBR-4'], lookuptable: ['EBR-5','EBR-6'] },
    createdAt: '2026-09-01T08:00:00.000Z', createdBy: 'schogol' } },
  done: { [pym]: { 'EBR-1': { by: 'schogol', at: '2026-09-02T10:00:00.000Z', verdict: 'ok', actor: 'ISD Tulwar' },
                   'EBR-3': { by: 'solnichka', at: '2026-09-03T10:00:00.000Z', verdict: 'flag', actor: 'ISD N<omad> & co' } } },
  flags: { 'EBR-3': { by: 'solnichka', at: '2026-09-03T10:00:00.000Z', ym: pym, kind: 'report', actor: 'ISD N<omad> & co',
                      summary: 'Closed with no reply', note: 'Trashed but the player <deserved> an answer & a link' } } };

const html = L.report.render(wiki, qc, pool);
let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x||''))); if (!c) fail++; };
ok('renders something substantial', html.length > 800, html.length + ' chars');
ok('no raw & left unescaped', !/&(?!amp;|lt;|gt;|quot;|#39;)/.test(html), (html.match(/&(?!amp;|lt;|gt;|quot;|#39;)\S*/)||[])[0]);
ok('the injected <intro> is escaped, not a tag', html.indexOf('&lt;intro&gt;') !== -1 && html.indexOf('<intro>') === -1);
ok('the flag reason is escaped', html.indexOf('&lt;deserved&gt;') !== -1);
ok('tags balance', (() => { const o = (html.match(/<(table|tr|td|th|p|h2|h3|em|strong|a)\b/g)||[]).length,
    c = (html.match(/<\/(table|tr|td|th|p|h2|h3|em|strong|a)>/g)||[]).length; return o === c; })(),
    'open ' + (html.match(/<(table|tr|td|th|p|h2|h3|em|strong|a)\b/g)||[]).length + ' close ' + (html.match(/<\/(table|tr|td|th|p|h2|h3|em|strong|a)>/g)||[]).length);
ok('open follow-up is listed', html.indexOf('Open follow-ups') !== -1 && html.indexOf('EBR-3') !== -1);
ok('wiki section counts done vs total (a Skip counts as handled)', /<strong>2 of 4<\/strong> pages proof-read/.test(html));
ok('skip shows as skipped, not reviewed', html.indexOf('Skipped by lookuptable') !== -1);
// The published page has to agree with the overlay about what is assigned, or it keeps naming work the
// Lead reading it can no longer see. This is the bug Schogol spotted on the live page (2026-09-20).
const wikiSec = html.slice(html.indexOf('<h2>Wiki review'), html.indexOf('<h2>Quality control'));
ok('an excluded page is NOT listed as outstanding work', wikiSec.indexOf('999001') === -1, wikiSec.slice(wikiSec.indexOf('999001') - 80, wikiSec.indexOf('999001') + 40));
ok('...and the page says one dropped out, so the count still adds up',
    /1 page assigned this month turned out to be in an excluded section/.test(wikiSec));
ok('a page that merely VANISHED is still listed (it needs a human Skip)', wikiSec.indexOf('777002') !== -1);
ok('the excluded page is not counted against its Lead either', /<td>lookuptable<\/td><td>1<\/td>/.test(wikiSec));
ok('a pool with no exclusion data lists everything (an outage must not hide work)',
    L.report.render(wiki, qc, { pages: pool.pages, fetchedAt: pool.fetchedAt }).indexOf('999001') !== -1);
ok('QC section counts checked + flagged', /<strong>2 of 6<\/strong> sampled items checked, 1 flagged/.test(html));
ok('coverage counts the never-reviewed pages', html.indexOf('Never reviewed') !== -1);
// Whoever handled the issue shows in BOTH places a Lead looks, and is escaped like every other value.
const flagSec = html.slice(html.indexOf('<h2>Open follow-ups'), html.indexOf('<h2>Wiki review'));
const qcSec = html.slice(html.indexOf('<h2>Quality control'), html.indexOf('<h2>Coverage'));
ok('follow-ups name who handled the issue', flagSec.indexOf('<th>Handled by</th>') !== -1
    && flagSec.indexOf('ISD N&lt;omad&gt; &amp; co') !== -1);
ok('QC items name who handled the issue', qcSec.indexOf('<th>Handled by</th>') !== -1
    && qcSec.indexOf('ISD Tulwar') !== -1 && qcSec.indexOf('ISD N&lt;omad&gt; &amp; co') !== -1);
ok('an unchecked item carries no actor (it is recorded with the verdict)',
    (qcSec.match(/ISD Tulwar/g) || []).length === 1);
const log = html.slice(html.indexOf('<h2>Review log'));
ok('review log holds every pool page', ['Fourth','Third page','It&#39;s fine','Ships &amp; Modules'].every(t => log.indexOf(t) !== -1));
ok('review log is oldest first: never-reviewed, then by date', log.indexOf('Fourth') < log.indexOf("It&#39;s fine") && log.indexOf("It&#39;s fine") < log.indexOf('Ships &amp; Modules'));
// Four eyes has to be legible on the page, not just enforced in the assignment.
ok('the review log carries an eyes column', log.indexOf('<th>Eyes</th>') !== -1 && /<td>0 of 2<\/td>/.test(log));
ok('coverage names the four-eyes target', html.indexOf('Waiting on a second reader') !== -1
    && html.indexOf(L.eyes() + ' different Leads every ' + L.coverageMonths() + ' months') !== -1);
ok('the wiki section explains the rule', html.indexOf('nobody is handed a page they read last time') !== -1);
ok('a missing pool degrades instead of throwing', (() => { try { return L.report.render(wiki, qc, null).length > 100; } catch (e) { return false; } })());
ok('an empty ledger degrades instead of throwing', (() => { try { return L.report.render(null, null, pool).length > 100; } catch (e) { return false; } })());
console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'render checks passed.'));
process.exit(fail ? 1 : 0);
