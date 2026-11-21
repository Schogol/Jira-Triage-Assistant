// creditdefects-check.js - how the ISD credits count a member's defects (v3.51.4). Evals the real worker functions
// (sliced from jitaWorkerBody) against stubbed searches and changelogs:
//  - a defect counts in every space (no project in the query), Defects Created leaves out Duplicate, Defects Resolved
//    counts Fixed, Done and Released
//  - a defect its own reporter closed earns nothing, created or resolved, whatever the resolution: the resolution it has
//    now decides, so one FC reopened and closed again counts; a member's old and new accounts are one reporter
//  - only closed defects have their history read, each once for both counts
// monthly_report.py counts the same way (PARITY in JiTA.credits).
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
    const s = src.indexOf(from), e = src.indexOf(to, s);
    if (s < 0 || e < 0 || src.indexOf(from, s + 1) >= 0) { throw new Error('could not slice from ' + from.trim().slice(0, 60)); }
    return src.slice(s, e);
};
const fn = (name) => cut('\n    function ' + name + '(', '\n    }\n') + '\n    }\n';

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const J = (x) => JSON.stringify(x);

// ---- fixtures: an issue as the search answers it, and a changelog entry ----
const issue = (key, rep, resolution, extra) => ({ key: key, fields: Object.assign({ reporter: { accountId: rep }, project: { key: key.split('-')[0] },
    resolution: resolution ? { name: resolution } : null, issuelinks: [] }, extra || {}) });
const set = (by, to, at) => ({ author: { accountId: by }, created: at, items: [{ field: 'resolution', fieldId: 'resolution', from: null, to: to ? '1' : null, toString: to || null }] });

let searches = [], reads = [], answers = {}, logs = {};
const W = new Function('crc', 'crFetchIssues', 'crAllHistories',
    cut('    function crAccList(', '\n') + '\n' + fn('crParallel') + fn('crResolvedBy') + fn('crSelfClosed') + fn('crDefectsCreated') + fn('crDefectsResolved') +
    '\nreturn { resolvedBy: crResolvedBy, created: crDefectsCreated, resolved: crDefectsResolved };')(
    { EBR: 'EBR', RESOLUTIONS: 'Fixed, Done, Released', CONCURRENCY: 4, DEDUP_LINK_TYPES: { Cloners: true }, PROJECT_RANK: { EO: 0, PLAT: 1, EDR: 2 } },
    (jql, fields) => { searches.push({ jql: jql, fields: fields }); return Promise.resolve((/resolved >=/.test(jql) ? answers.resolved : answers.created) || []); },
    (key) => { reads.push(key); return Promise.resolve(logs[key] || []); });

const B = { start: '2026-11-01', end: '2026-12-01' };
const ACCT = { 'A-ANN': 'Ann', 'A-ANN-OLD': 'Ann', 'A-BOB': 'Bob' };
const fresh = () => ({ Ann: { created: 0, resolved: 0 }, Bob: { created: 0, resolved: 0 } });
const count = async (seen) => {
    const rows = fresh();
    seen = seen || {};
    await W.created(['A-ANN', 'A-ANN-OLD', 'A-BOB'], B, ACCT, rows, seen);
    await W.resolved(['A-ANN', 'A-ANN-OLD', 'A-BOB'], B, ACCT, rows, seen);
    return rows;
};

(async () => {
    // ================= the queries =================
    answers = {};
    await count();
    const cq = searches[0], rq = searches[1];
    ok('Defects Created: any defect a member reported in the month, in every space (no project in the query)',
        /^issuetype = Defect AND reporter in \("A-ANN", "A-ANN-OLD", "A-BOB"\) AND created >= "2026-11-01" AND created < "2026-12-01"/.test(cq.jql) && !/project/.test(cq.jql), cq.jql);
    ok('...leaving out Duplicate', / AND \(resolution is EMPTY OR resolution != Duplicate\)$/.test(cq.jql), cq.jql);
    ok('Defects Resolved: Fixed, Done or Released in the month, in every space', /^issuetype = Defect AND reporter in \(/.test(rq.jql) &&
        /AND resolution in \(Fixed, Done, Released\) AND resolved >= "2026-11-01" AND resolved < "2026-12-01"$/.test(rq.jql) && !/project/.test(rq.jql), rq.jql);
    ok('...both asking for the resolution, which says whether a history is worth reading', cq.fields.indexOf('resolution') >= 0 && rq.fields.indexOf('resolution') >= 0, J([cq.fields, rq.fields]));
    ok('...and the resolved one for the links the clones are told apart by', rq.fields.indexOf('issuelinks') >= 0 && rq.fields.indexOf('project') >= 0, J(rq.fields));

    // ================= who closed it =================
    ok('the resolution was set by whoever made the last change to it', W.resolvedBy([set('A-ANN', "Won't Do", '1'), set('A-FC', null, '2'), set('A-FC', 'Fixed', '3')]) === 'A-FC');
    ok('...none when it was taken off again', W.resolvedBy([set('A-ANN', 'Done', '1'), set('A-FC', null, '2')]) === null);
    ok('...none when it never changed (set as the defect was created)', W.resolvedBy([{ author: { accountId: 'A-ANN' }, items: [{ field: 'summary', to: 'x' }] }]) === null);
    ok('...a change known only by its field id counts', W.resolvedBy([{ author: { accountId: 'A-ANN' }, items: [{ fieldId: 'resolution', toString: 'Done' }] }]) === 'A-ANN');

    // ================= the counts =================
    searches = []; reads = [];
    answers = {
        created: [issue('EDR-1', 'A-ANN', "Won't Do"), issue('EDR-2', 'A-ANN', 'Done'), issue('EDR-3', 'A-ANN', null), issue('EO-4', 'A-BOB', "Won't Do"),
            issue('XYZ-5', 'A-BOB', null), issue('EDR-6', 'A-ANN-OLD', 'Cannot Reproduce'), issue('EDR-7', 'A-BOB', 'Fixed')],
        resolved: [issue('EDR-2', 'A-ANN', 'Done'), issue('EDR-7', 'A-BOB', 'Fixed'), issue('EDR-8', 'A-BOB', 'Done')]
    };
    logs = {
        'EDR-1': [set('A-ANN', "Won't Do", '1')],                                  // taken back by its reporter
        'EDR-2': [set('A-ANN', 'Done', '1')],                                      // closed as Done by its reporter
        'EO-4': [set('A-FC', "Won't Do", '1')],                                    // FC decided
        'EDR-6': [set('A-ANN', 'Cannot Reproduce', '1')],                          // reported from the old account, closed from the new
        'EDR-7': [set('A-BOB', "Won't Do", '1'), set('A-FC', null, '2'), set('A-FC', 'Fixed', '3')],   // reopened and fixed by FC
        'EDR-8': [set('A-ANN', 'Done', '1')]                                       // another member closed it
    };
    let rows = await count();
    ok('a defect its own reporter closed is not counted as created, whatever the resolution (Won\'t Do, Done, Cannot Reproduce)', rows.Ann.created === 1, J(rows));
    ok('...nor as resolved, though Done counts otherwise', rows.Ann.resolved === 0, J(rows));
    ok('one FC closed, one still open, and one in another space count as created', rows.Bob.created === 3, J(rows));
    ok('...and one its reporter took back, but FC reopened and fixed, counts as created and as resolved; so does one another member closed', rows.Bob.resolved === 2, J(rows));
    ok('only closed defects have their history read, each once for both counts', J(reads.slice().sort()) === J(['EDR-1', 'EDR-2', 'EDR-6', 'EDR-7', 'EDR-8', 'EO-4']), J(reads));

    // reported from a member's old account, closed from their new one
    const keep = { answers: answers, logs: logs };
    answers = { created: [issue('EDR-6', 'A-ANN-OLD', 'Cannot Reproduce')], resolved: [] };
    rows = await count();
    ok('a member\'s old and new accounts are one reporter: reported from the old, closed from the new, it is taken back', rows.Ann.created === 0, J(rows));
    answers = { created: [issue('EDR-6', 'A-BOB', 'Cannot Reproduce')], resolved: [] };
    rows = await count();
    ok('...while one another member closed still counts for its reporter', rows.Bob.created === 1, J(rows));
    answers = keep.answers; logs = keep.logs;

    // the same counts without a shared record (each count reads for itself)
    reads = [];
    rows = fresh();
    await W.created(['A-ANN', 'A-BOB'], B, ACCT, rows);
    await W.resolved(['A-ANN', 'A-BOB'], B, ACCT, rows);
    ok('...a count with no record of the run reads for itself', rows.Ann.created === 1 && rows.Bob.resolved === 2, J(rows));

    // clones: the copy left once a self-closed one is out
    reads = [];
    const linked = (key, rep, res, other) => issue(key, rep, res, { issuelinks: [{ type: { name: 'Cloners' }, outwardIssue: { key: other } }] });
    answers = { created: [], resolved: [linked('EO-10', 'A-ANN', 'Done', 'EDR-11'), linked('EDR-11', 'A-BOB', 'Fixed', 'EO-10'), linked('EO-12', 'A-BOB', 'Fixed', 'EDR-13'), linked('EDR-13', 'A-ANN', 'Fixed', 'EO-12')] };
    logs = { 'EO-10': [set('A-ANN', 'Done', '1')], 'EDR-11': [set('A-FC', 'Fixed', '1')], 'EO-12': [set('A-FC', 'Fixed', '1')], 'EDR-13': [set('A-FC', 'Fixed', '1')] };
    rows = await count();
    ok('clones still count once, for the EO copy\'s reporter; one taken back by its reporter leaves its twin to count', rows.Ann.resolved === 0 && rows.Bob.resolved === 2, J(rows));

    // ================= wiring =================
    ['crComputeMonth', 'crComputeSelf'].forEach((name) => {
        const body = fn(name);
        ok(name + ' shares one record of the histories read between both counts', /var seen = \{\};/.test(body) &&
            /crDefectsCreated\([^)]*, seen\)/.test(body) && /crDefectsResolved\([^)]*, seen\)/.test(body));
    });
    const head = cut('JiTA.credits = {', '\n    PAGE_SIZE:');
    ok('the credits name no projects any more (defects count in every space)', !/PROJECTS:/.test(head) && src.indexOf('PROJECTS: C.PROJECTS') < 0);

    // ================= reports attached: your own count and the full one agree =================
    // An attach the automation made while Xena had the report, moved out of Attached since and given to Yuri: the full
    // count credits it by its assignee then (crEffectiveActioner); the self count asked for the automation's attaches by
    // the assignee now and missed it (review 2026-11-20 drift-own-3).
    {
        const at = (d) => '2026-11-' + d + 'T10:00:00.000+0000';
        const st = (by, from, to, d) => ({ author: { accountId: by }, created: at(d), items: [{ field: 'status', fromString: from, toString: to }] });
        const as = (to, d) => ({ author: { accountId: 'A-LEAD' }, created: at(d), items: [{ field: 'assignee', from: null, to: to }] });
        const HIST = {
            'EBR-1': [as('A-X', '02'), st('AUTO', 'Open', 'Attached', '03'), st('A-DEV', 'Attached', 'Open', '04'), st('AUTO', 'Open', 'Attached', '05'), as('A-Y', '06')],
            'EBR-2': [st('A-X', 'Open', 'Attached', '07')],
            'EBR-3': [as('A-X', '02'), st('AUTO', 'Open', 'Attached', '08')],
            'EBR-4': [as('A-Y', '02'), st('AUTO', 'Open', 'Attached', '03'), st('A-DEV', 'Attached', 'Open', '04'), as('A-X', '05'), as('A-Z', '06'), st('AUTO', 'Open', 'Attached', '07')]
        };
        // Each search as Jira would answer it for that month, by its JQL; any other answers nothing, and is noted.
        const unscripted = [];
        const keysFor = (jql) => {
            const ks = (arr) => arr.reduce((o, k) => { o[k] = true; return o; }, {});
            if (/assignee WAS IN \("A-X"\)/.test(jql)) { return ks(['EBR-1', 'EBR-4']); }        // the automation's, moved out, Xena's at some point
            if (/BY "AUTO".*AND assignee in \("A-X"\)$/.test(jql)) { return ks(['EBR-3']); }       // the automation's, Xena's now
            if (/BY "AUTO".*AND assignee in \("A-Y"\)$/.test(jql)) { return ks(['EBR-1']); }       // ...Yuri's now
            if (/CHANGED TO "Attached" BY "A-X"/.test(jql)) { return ks(['EBR-2']); }
            if (/CHANGED TO "Attached" BY "A-Y"/.test(jql)) { return ks([]); }
            if (/^project = EBR AND status CHANGED FROM "Attached" DURING \([^)]*\)$/.test(jql)) { return ks(['EBR-1', 'EBR-4']); }   // moved out this month
            unscripted.push(jql);
            return {};
        };
        const crc = { EBR: 'EBR', ATTACHED_STATUS: 'Attached', OPEN_STATUS: 'Open', CLOSED_STATUS: 'Closed', CONVERT_COMMENT: 'converted', AUTOMATION_ID: 'AUTO',
            AUTOMATION_EMAIL: 'automation@x', CONCURRENCY: 4, CRAWL_DELAY_MS: 0 };
        const A = new Function('crc', 'crAllKeys', 'crCount', 'crAllHistories', 'crTick', 'crProgress', 'crSleep',
            cut('    function crAccList(', '\n') + '\n' + fn('crParallel') + fn('crSerial') + fn('crIsAutomation') + fn('crAssigneeAt') + fn('crEffectiveActioner') +
            fn('crReportsActioned') + fn('crReportsActionedSelf') + '\nreturn { full: crReportsActioned, self: crReportsActionedSelf };')(
            crc, (jql) => Promise.resolve(keysFor(jql)), () => Promise.resolve(0), (k) => Promise.resolve(HIST[k] || []), () => {}, () => {}, () => Promise.resolve());
        const B2 = { start: '2026-11-01', end: '2026-12-01' };
        const rows = { Xena: { attached: 0 }, Yuri: { attached: 0 } };
        await A.full({ Xena: ['A-X'], Yuri: ['A-Y'] }, B2, rows, { 'A-X': 'Xena', 'A-Y': 'Yuri' });
        const mine = await A.self(['A-X'], B2);
        ok('(the full count credits Xena the attach the automation made for her, though Yuri has the report now)', rows.Xena.attached === 3 && rows.Yuri.attached === 0, J(rows));
        ok('your own count of reports attached is the full count\'s: an automation attach moved out and reassigned since is yours too', mine.attached === rows.Xena.attached,
            mine.attached + ' vs ' + rows.Xena.attached);
        ok('...while one made for someone else, though it was yours later in the month, is not (control)', mine.attached === 3, String(mine.attached));
        ok('...every search made is one the month answers (control)', unscripted.length === 0, unscripted.join(' | '));
    }

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'credit defect checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
