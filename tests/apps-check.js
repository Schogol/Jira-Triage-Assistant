// Eval the real JiTA.leadduty.apps and drive it against captured VMS markup. The third lead duty reads a
// THIRD-PARTY page nobody here controls, so the parser is deliberately keyed on the LINK TARGETS
// (/admin/applications/<stage>/ECAID) rather than column positions - and the thing that actually matters is
// that a page it cannot read NEVER comes back as zero. A false zero reads exactly like "nothing to do", and
// an applicant waits.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const s = src.indexOf('JiTA.leadduty.apps = {');
const em = '\n    _noop: null\n};';
const e = src.indexOf(em, s);
if (s < 0 || e < 0) { throw new Error('could not slice JiTA.leadduty.apps'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

const meta = {};
global.JiTA = {
    leadduty: {},
    db: {
        getMeta: (k) => Promise.resolve(Object.prototype.hasOwnProperty.call(meta, k) ? meta[k] : null),
        setMeta: (k, v) => { meta[k] = v; return Promise.resolve(); }
    }
};
eval(src.slice(s, e + em.length));
const A = global.JiTA.leadduty.apps;

// The ECAID row exactly as the live dashboard renders it (pasted from Schogol's browser, 2026-09-20), plus
// a second team's row - the parser must not read CCL's numbers for ECAID.
const ECAID_ROW = `<tr>
                        <td>ECAID</td>
                        <td class="text-right"><a href="/admin/applications/new/ECAID">7</a></td>
                        <td class="text-right"><a href="/admin/applications/parttwo/ECAID">4</a></td>
                        <td class="text-right"><a href="/admin/applications/bgc/ECAID">3</a></td>
                        <td class="text-right"><a href="/admin/applications/nda/ECAID">8</a></td>
                        <td class="text-right">198</td>
                        <td class="text-right">220</td>
                    </tr>`;
const CCL_ROW = ECAID_ROW.replace(/ECAID/g, 'CCL').replace('>7<', '>9<').replace('>4<', '>2<');
const page = (rows) => '<html><body><h4>Unresolved applications</h4><table><tbody>' + rows + '</tbody></table></body></html>';
const DASH = page(CCL_ROW + ECAID_ROW);

(async () => {
    // ---- the happy path ----
    const r = A._parse(DASH, 'https://volunteers.eveonline.com/Admin', 200);
    ok('the ECAID row parses', r.ok === true, JSON.stringify(r));
    ok('new applications are read', r.fresh === 7, String(r.fresh));
    ok('returned questionnaires are read', r.second === 4, String(r.second));
    ok('the total is only what is waiting on us', r.total === 11, String(r.total));
    // Background checks (3), NDA signed (8), waiting on player (198) and the row total (220) are all
    // deliberately out - Schogol's call. A leak would show up as a total that is not 11.
    ok('the other columns never leak in', r.total !== 220 && r.total !== 198 && r.total !== 22);
    ok('another team\'s row is not read as ours', r.fresh !== 9 && r.second !== 2);

    // The page is third-party: columns can be reordered or added under us at any time. The hrefs name the
    // stage, so position is irrelevant - this is the whole reason the parser is keyed on them.
    const shuffled = page(ECAID_ROW
        .replace('<td class="text-right"><a href="/admin/applications/new/ECAID">7</a></td>', '@@NEW@@')
        .replace('<td class="text-right"><a href="/admin/applications/parttwo/ECAID">4</a></td>', '@@TWO@@')
        .replace('@@TWO@@', '<td class="text-right"><a href="/admin/applications/new/ECAID">7</a></td>')
        .replace('@@NEW@@', '<td class="text-right">NEW COLUMN</td><td class="text-right"><a href="/admin/applications/parttwo/ECAID">4</a></td>'));
    const r2 = A._parse(shuffled, '', 200);
    ok('a reordered / widened table still parses', r2.ok && r2.fresh === 7 && r2.second === 4, JSON.stringify(r2));

    // An empty queue is a real, readable answer - it must come back ok with 0, not as a failure.
    const empty = A._parse(page(ECAID_ROW.replace('>7<', '>0<').replace('>4<', '>0<')), '', 200);
    ok('a genuinely empty queue reads as zero, not as an error', empty.ok === true && empty.total === 0, JSON.stringify(empty));

    // ---- everything that must NOT become a zero ----
    const login = A._parse('<html>sign in</html>', 'https://login.eveonline.com/oauth/authorize?x=1', 200);
    ok('an SSO redirect is a login prompt, never a count', login.ok === false && login.reason === 'login', JSON.stringify(login));
    ok('...and carries no number at all', login.total === undefined && login.fresh === undefined);
    ok('a 403 is a login prompt too', A._parse('', '', 403).reason === 'login');
    ok('a 500 is a network failure, not a login prompt', A._parse('', '', 500).reason === 'net');
    const spa = A._parse('<html><body><div id="app"></div></body></html>', '', 200);
    ok('an unrenderable / empty page is unreadable, not zero', spa.ok === false && spa.reason === 'unreadable', JSON.stringify(spa));
    const norow = A._parse(page(CCL_ROW), '', 200);
    ok('the dashboard without an ECAID row is flagged, not zero', norow.ok === false && norow.reason === 'norow', JSON.stringify(norow));
    // Half a row is the nastiest case: the first stage parses and the second does not. Reporting the half
    // we got would silently drop every returned questionnaire.
    const half = A._parse(page(ECAID_ROW.replace(/<td class="text-right"><a href="\/admin\/applications\/parttwo\/ECAID">4<\/a><\/td>/, '')), '', 200);
    ok('a partially readable row is rejected outright', half.ok === false, JSON.stringify(half));

    // ---- the wording ----
    ok('the line names both stages', A.line(r) === '7 new applications, 4 returned questionnaires', A.line(r));
    ok('a single item is singular', A.line({ ok: true, fresh: 1, second: 0, total: 1 }) === '1 new application');
    ok('an empty queue says so plainly', /nothing waiting on ECAID/.test(A.line(empty)), A.line(empty));
    ok('a login failure tells you to log in', /log in to VMS/.test(A.line(login)), A.line(login));
    ok('an unreadable page tells you to open it', /open it to check/.test(A.line(spa)), A.line(spa));
    ok('nothing cached yet says so, rather than zero', /not been checked yet/.test(A.line(null)), A.line(null));

    // ---- caching + the stale fallback ----
    let fetched = 0, next = { ok: true, fresh: 7, second: 4, total: 11 };
    A._fetch = () => { fetched++; return Promise.resolve(JSON.parse(JSON.stringify(next))); };

    const a1 = await A.refresh(false);
    ok('the first read fetches', fetched === 1 && a1.total === 11, fetched + ' fetches');
    await A.refresh(false);
    ok('a read inside the TTL is served from cache', fetched === 1, fetched + ' fetches');
    await A.refresh(true);
    ok('force refetches', fetched === 2, fetched + ' fetches');

    // A blip must not make the number vanish - keep the last GOOD one, clearly labelled stale.
    next = { ok: false, reason: 'net' };
    const bad = await A.refresh(true);
    ok('a failed refresh does not report a count', bad.ok === false);
    ok('...but the last good numbers are kept', !!bad.last && bad.last.total === 11, JSON.stringify(bad.last));
    ok('...and the line says when they were last seen', /last seen: 11 waiting/.test(A.line(bad)), A.line(bad));

    // A failure on a cold cache has nothing to fall back on, and must still not invent a number.
    delete meta[A.CACHE_KEY];
    const cold = await A.refresh(true);
    ok('a failure with no history stays silent about numbers', cold.ok === false && !cold.last && cold.total === undefined,
        JSON.stringify(cold));

    // ---- the queue itself: list rows and one application's answers -----------------------------------
    // Fixtures are SYNTHETIC. The live pages carry real applicants' answers to personal questions, and a
    // test fixture is the last place that should end up - the shape is what needs pinning, not the content.
    // The commented-out avatar div is REAL and is kept verbatim: it is the entire reason every name in the
    // queue rendered as "--> Makthrraaa" on the first browser run. Stripping tags before comments eats the
    // "<!--" and the "</div>" and leaves the "-->" stranded in the text. A fixture that tidies this away is
    // a fixture that cannot catch it.
    const row = (name, guid, state, applied, updated) => `<tr role="row" class="odd">
                    <td>
                        <!--<div class="circular" style="background: url(//image.eveonline.com/Character/1_32.jpg) 50% 50% no-repeat; float:left;"></div>-->
                        <div class="roundImage"><img src="//image.eveonline.com/Character/1_32.jpg"></div>&nbsp;
${name}
                    </td>
                    <td class="selectable state-new"><span class="state">${state}</span></td>
                    <td class="selectable sorting_1">${applied}</td>
                    <td class="selectable">${updated}</td>
                    <td class="selectable">ECAID</td>
                    <td><a class="btn btn-default table-embed" href="/Admin/Application/${guid}">Review</a></td>
                </tr>`;
    const G1 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', G2 = '11111111-2222-3333-4444-555555555555';
    const listPage = (rows) => '<html><body><h1>Applications</h1><table role="grid"><thead><tr><th>APPLICANT</th>' +
        '<th>STATE</th></tr></thead><tbody>' + rows + '</tbody></table></body></html>';
    const LIST = listPage(row('Testchar Alpha', G1, 'New', '2026-09-05 10:19', '2026-09-06 11:20') +
                          row('Testchar Beta', G2, 'New', '2017-03-05 12:34', '2017-03-17 19:53'));

    const L1 = A._parseList({ body: LIST, finalUrl: '', status: 200 }, A.STAGES[0]);
    ok('the list parses both rows', L1.ok && L1.items.length === 2, JSON.stringify(L1).slice(0, 160));
    ok('the application id is the GUID from the Review link', L1.items[0].id === G1, L1.items[0].id);
    ok('the name survives the avatar markup', L1.items[0].name === 'Testchar Alpha', JSON.stringify(L1.items[0].name));
    ok('...with no comment terminator left stranded in it',
        L1.items.every((i) => i.name.indexOf('--') === -1 && i.name.indexOf('>') === -1),
        JSON.stringify(L1.items.map((i) => i.name)));
    ok('a commented-out element contributes no text at all',
        A._text('<!--<div class="circular" style="x"></div>--> Name') === 'Name',
        JSON.stringify(A._text('<!--<div class="circular" style="x"></div>--> Name')));
    ok('the state is read from its own span', L1.items[0].state === 'New', L1.items[0].state);
    ok('applied and updated are told apart', L1.items[0].applied === '2026-09-05 10:19' && L1.items[0].updated === '2026-09-06 11:20',
        JSON.stringify([L1.items[0].applied, L1.items[0].updated]));
    ok('the detail URL is built from the id', L1.items[0].url.slice(-36) === G1, L1.items[0].url);
    ok('the header row is not read as an application', L1.items.every((i) => i.id && i.name !== 'APPLICANT'));

    ok('an applications page with nobody waiting is a real empty answer',
        (() => { const r = A._parseList({ body: listPage(''), finalUrl: '', status: 200 }, A.STAGES[0]); return r.ok && r.items.length === 0; })());
    ok('a page that is not the applications page is unreadable, not empty',
        A._parseList({ body: '<html><body>Hello</body></html>', finalUrl: '', status: 200 }, A.STAGES[0]).reason === 'unreadable');
    ok('an SSO redirect on the list is a login prompt',
        A._parseList({ body: '', finalUrl: 'https://login.eveonline.com/oauth/authorize', status: 200 }, A.STAGES[0]).reason === 'login');

    // Both stages are fetched and merged, oldest first - whoever has waited longest is the one to answer next.
    A._get = (url) => Promise.resolve({
        body: /\/new\//.test(url) ? listPage(row('Testchar Alpha', G1, 'New', '2026-09-05 10:19', '2026-09-05 10:19'))
                                  : listPage(row('Testchar Beta', G2, 'Second questionaire', '2017-03-05 12:34', '2017-03-17 19:53')),
        finalUrl: url, status: 200
    });
    const merged = await A.list();
    ok('both stages are merged into one queue', merged.ok && merged.items.length === 2, JSON.stringify(merged).slice(0, 120));
    ok('...oldest first', merged.items[0].id === G2, merged.items.map((i) => i.applied).join(' | '));
    ok('...each tagged with the stage it came from',
        merged.items[0].stage === 'second' && merged.items[1].stage === 'fresh',
        merged.items.map((i) => i.stage).join(','));

    // One stage failing while the other works still hides applications - that has to be visible, and if
    // BOTH fail it must not read as an empty queue.
    A._get = (url) => Promise.resolve(/\/new\//.test(url)
        ? { body: listPage(row('Testchar Alpha', G1, 'New', '2026-09-05 10:19', '2026-09-05 10:19')), finalUrl: url, status: 200 }
        : { failed: true, reason: 'net' });
    const partial = await A.list();
    ok('a half-read queue is flagged as partial', partial.ok && partial.partial === true && partial.items.length === 1,
        JSON.stringify(partial).slice(0, 120));
    A._get = () => Promise.resolve({ failed: true, reason: 'net' });
    const none = await A.list();
    ok('a wholly unreadable queue is a failure, not an empty list', none.ok === false, JSON.stringify(none));

    // ---- one application ----
    const DETAIL = `<div class="panel-body"><dl>
        <dt><p>Question one?</p></dt>
        <dd class="application-answer"><p>Answer one.</p></dd>
        <dt><p>Two &amp; a half?</p></dt>
        <dd class="application-answer"><p>Para one.</p>

<p>Para two.</p></dd>
        <dt><p>Question one?</p></dt>
        <dd class="application-answer"><p>Asked again years later.</p></dd>
    </dl></div>`;
    A._get = (url) => Promise.resolve({ body: DETAIL, finalUrl: url, status: 200 });
    const d = await A.detail(G1);
    ok('the questions and answers pair up', d.ok && d.qa.length === 3, JSON.stringify(d).slice(0, 140));
    ok('entities are decoded', d.qa[1].q === 'Two & a half?', d.qa[1].q);
    ok('paragraph breaks in a long answer survive', d.qa[1].a === 'Para one.\n\nPara two.', JSON.stringify(d.qa[1].a));
    // A re-applicant's page carries the old questionnaire AND the new one, so the same question appears
    // twice with different answers. Both are kept, in document order - deduplicating would hide an answer.
    ok('a repeated question keeps both answers', d.qa[0].q === d.qa[2].q && d.qa[0].a !== d.qa[2].a,
        JSON.stringify([d.qa[0].a, d.qa[2].a]));

    A._get = (url) => Promise.resolve({ body: '<html><body>nothing here</body></html>', finalUrl: url, status: 200 });
    ok('an unreadable application says so rather than showing nothing',
        (await A.detail(G1)).reason === 'unreadable');
    A._get = (url) => Promise.resolve({ body: '', finalUrl: 'https://login.eveonline.com/oauth/authorize', status: 200 });
    ok('an expired session on an application is a login prompt', (await A.detail(G1)).reason === 'login');

    // ---- the count and the list must not disagree ----
    // Schogol acted on one application in VMS: the live list came back with 10, the tab kept saying 11 from
    // the hour-old dashboard cache, and the two sat next to each other on screen.
    meta[A.CACHE_KEY] = { ok: true, at: Date.now(), fresh: 7, second: 4, total: 11 };
    const adopted = await A.adopt({ ok: true, items: [
        { id: 'a', stage: 'fresh' }, { id: 'b', stage: 'fresh' }, { id: 'c', stage: 'second' }
    ] });
    ok('a live list refreshes the cached count', adopted && adopted.total === 3, JSON.stringify(adopted));
    ok('...broken down by stage', adopted.fresh === 2 && adopted.second === 1, JSON.stringify(adopted));
    ok('...and it is what the chip and the tab now read', (await A.read()).total === 3, JSON.stringify(await A.read()));

    // A half-read queue would UNDERSTATE the count - the one direction this must never move in.
    meta[A.CACHE_KEY] = { ok: true, at: Date.now(), fresh: 7, second: 4, total: 11 };
    ok('a partial list is never adopted',
        (await A.adopt({ ok: true, partial: true, items: [{ id: 'a', stage: 'fresh' }] })) === null &&
        (await A.read()).total === 11, JSON.stringify(await A.read()));
    ok('a failed list is never adopted',
        (await A.adopt({ ok: false, reason: 'login' })) === null && (await A.read()).total === 11);

    // ---- how long somebody has been waiting ----
    const days = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 16).replace('T', ' ');
    ok('today reads as today', A.age(days(0)) === 'today', A.age(days(0)));
    ok('a fortnight reads in days', A.age(days(14)) === '14d', A.age(days(14)));
    ok('a year reads in months', A.age(days(365)) === '12mo', A.age(days(365)));
    ok('a 2017 application reads in years', A.age('2017-03-05 12:34') === String(Math.round((Date.now() - Date.parse('2017-03-05T12:34Z')) / 86400000 / 365)) + 'y',
        A.age('2017-03-05 12:34'));
    ok('an unparseable date reads as nothing, not as "today"', A.age('') === '' && A.age('soon') === '');

    // ---- acting on an application --------------------------------------------------------------------
    // The dangerous half. Everything here exists to make two things impossible: acting on a transition the
    // page no longer offers, and reporting a refusal as if it had worked.
    const CSRF = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const detailPage = (o) => `<html><body class="x" data-csrf="${o.csrf === undefined ? CSRF : o.csrf}">
  <div class="application-controls" data-applicationid="${o.id === undefined ? G1 : o.id}">
    ${o.accept === false ? '' : '<a class="btn btn-primary btn-block" data-loading-text="Processing..." data-state="' + (o.state || 'New') + '" data-toggle="tooltip" href="/Admin/applications" id="btn-approve">Proceed to PartTwo</a>'}
    ${o.reset === false ? '' : '<a class="btn btn-warning btn-block" href="/Admin/applications" id="btn-reset">Reset application</a>'}
    ${o.decline === false ? '' : '<a class="btn btn-danger btn-block" href="/Admin/applications" id="btn-decline">Decline</a>'}
  </div>
  ${o.panels === undefined
        ? '<div class="panel-body"><dl><dt><p>Q?</p></dt><dd class="application-answer"><p>A</p></dd></dl></div>'
        : o.panels}
  ${o.noteBtn === false ? '' : '<button type="button" class="btn btn-primary" title="Write a new note" data-character="' + (o.character || 'Testchar Alpha') + '" data-characterid="455270852" data-toggle="modal" data-target="#add-note-modal"><i class="fa fa-pencil"></i> Add note</button>'}
  ${o.noteModal === false ? '' : `<div class="modal fade note-modal-add" id="add-note-modal" tabindex="-1" role="dialog"><div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-body">
    <form class="form-horizontal form-note-add"><input type="hidden" class="note-modal-charactername">
    <textarea class="form-control note-modal-comment" name="comment" id="note-modal-comment" rows="6"></textarea>
    <select class="form-control note-modal-viewstate">${(o.states || ['Developers', 'Volunteers', 'Public']).map((s) => '<option value="' + s + '">' + s + '</option>').join('')}</select>
    <button type="submit" class="btn btn-primary">Submit</button></form></div></div></div></div>`}
</body></html>`;

    A._get = (url) => Promise.resolve({ body: detailPage({}), finalUrl: url, status: 200 });
    const insp = await A.inspect(G1);
    ok('the CSRF token is lifted from <body data-csrf>', insp.ok && insp.token === CSRF, JSON.stringify(insp).slice(0, 100));
    ok('the application id comes from the controls', insp.appId === G1, insp.appId);
    ok('all three controls are found', Object.keys(insp.actions).sort().join(',') === 'accept,decline,reset',
        Object.keys(insp.actions).join(','));
    ok('the accept button carries its label and state',
        insp.actions.accept.label === 'Proceed to PartTwo' && insp.actions.accept.state === 'New',
        JSON.stringify(insp.actions.accept));

    A._get = (url) => Promise.resolve({ body: detailPage({ accept: false, reset: false }), finalUrl: url, status: 200 });
    const only = await A.inspect(G1);
    ok('a control the page does not render is not offered',
        Object.keys(only.actions).join(',') === 'decline', Object.keys(only.actions).join(','));

    A._get = (url) => Promise.resolve({ body: '<html><body>no controls</body></html>', finalUrl: url, status: 200 });
    ok('a page without the token or the id refuses to act', (await A.inspect(G1)).reason === 'noform');
    ok('...and says what to do instead', /act on it in VMS/.test(A.line({ ok: false, reason: 'noform' })),
        A.line({ ok: false, reason: 'noform' }));

    // ---- the payloads, captured rather than sent ----
    let sent = null;
    A._post = (service, method, payload) => { sent = { service: service, method: method, payload: payload }; return Promise.resolve({ ok: true, message: 'Done.' }); };
    A._get = (url) => Promise.resolve({ body: detailPage({}), finalUrl: url, status: 200 });

    await A.act(G1, 'accept');
    ok('an action goes to ApplicationService', sent.service === 'ApplicationService', sent.service);
    ok('accept posts ApplicationAccept with the live state', sent.method === 'ApplicationAccept' &&
        sent.payload.state === 'New' && sent.payload.applicationId === G1 && sent.payload.token === CSRF,
        JSON.stringify(sent));
    await A.act(G1, 'decline');
    ok('decline posts ApplicationDecline and DOES notify the applicant', sent.method === 'ApplicationDecline' &&
        sent.payload.sendMessage === true && sent.payload.reset === false, JSON.stringify(sent.payload));
    await A.act(G1, 'reset');
    ok('reset posts ApplicationDecline and does NOT notify them', sent.method === 'ApplicationDecline' &&
        sent.payload.sendMessage === false && sent.payload.reset === true, JSON.stringify(sent.payload));

    // The queue was listed minutes ago; somebody else may have handled this one since. Acting on a button
    // that is no longer there could mean a completely different transition.
    sent = null;
    A._get = (url) => Promise.resolve({ body: detailPage({ accept: false }), finalUrl: url, status: 200 });
    const gone = await A.act(G1, 'accept');
    ok('an action VMS no longer offers is refused', gone.ok === false && gone.reason === 'gone', JSON.stringify(gone));
    ok('...and nothing is sent', sent === null);

    sent = null;
    A._get = (url) => Promise.resolve({ body: detailPage({ id: G2 }), finalUrl: url, status: 200 });
    const wrong = await A.act(G1, 'accept');
    ok('a page for a different application is refused', wrong.ok === false && wrong.reason === 'mismatch', JSON.stringify(wrong));
    ok('...and nothing is sent for that either', sent === null);

    sent = null;
    A._get = (url) => Promise.resolve({ body: '', finalUrl: 'https://login.eveonline.com/oauth/authorize', status: 200 });
    const expired = await A.act(G1, 'accept');
    ok('an expired session refuses instead of posting', expired.ok === false && expired.reason === 'login' && sent === null,
        JSON.stringify(expired));

    // ---- reading the answer ----
    // The service returns HTTP 200 with Success:false when it REFUSES. Treating 200 as success would drop
    // the application out of the queue while VMS still holds it.
    ok('an explicit Success is a success',
        A._postResult({ status: 200, responseText: '{"d":{"Success":true,"Message":"Moved on."}}' }).ok === true);
    const refused = A._postResult({ status: 200, responseText: '{"d":{"Success":false,"Message":"Not allowed."}}' });
    ok('HTTP 200 with Success:false is a FAILURE', refused.ok === false && refused.reason === 'refused', JSON.stringify(refused));
    ok('...carrying the reason VMS gave', refused.message === 'Not allowed.', refused.message);
    const junk = A._postResult({ status: 200, responseText: 'not json' });
    ok('an unreadable answer is never a success', junk.ok === false && junk.reason === 'unreadable', JSON.stringify(junk));
    ok('...and says the application may or may not have changed', /may or may not/.test(junk.message), junk.message);
    ok('a 403 reads as a login failure', A._postResult({ status: 403, responseText: '' }).reason === 'login');
    ok('a 500 reads as a network failure', A._postResult({ status: 500, responseText: '' }).reason === 'net');
    ok('a dropped request is never a success', A._postResult(null).ok === false);

    // ---- notes on the account ------------------------------------------------------------------------
    // The most decision-relevant thing on the page, and on the site it sits BELOW a long questionnaire.
    // Structure captured from the live page; the bodies are synthetic.
    const note = (author, when, body) => `<li>
        <div class="roundImage"><img src="https://imageserver.eveonline.com/Character/1_64.jpg" title="${author}"></div>
        <div class="noteText">
            <div>${body}</div>
            <span class="date sub-text">By <a href="/admin/users/${author.replace(/ /g, '+')}">${author}</a> on ${when}</span>
        </div>
    </li>`;
    const notesBlock = (lis) => `<div class="panel panel-default"><div class="panel-heading"><h4 class="panel-title">Notes on account</h4></div>
        <div id="listofnotes" class="panel-collapse in"><div class="panel-body">
        <ul class="list-unstyled" id="notesList">${lis}</ul></div></div></div>`;

    const N = A._parseNotes(notesBlock(
        note('GM Testperson', '2025-07-02 13:22', '<p>Flagged during the background check.</p>') +
        note('CCP Testdev', '2025-05-07 09:38', '<p>First paragraph.</p>\n\n<p>Second paragraph.</p>')));
    ok('both notes are read', N.length === 2, JSON.stringify(N));
    ok('the note body comes through', N[0].text === 'Flagged during the background check.', JSON.stringify(N[0].text));
    ok('the author is read from the byline link', N[0].by === 'GM Testperson', N[0].by);
    ok('the date is read from the byline', N[0].at === '2025-07-02 13:22', N[0].at);
    ok('document order is kept (VMS renders newest first)', N[0].by === 'GM Testperson' && N[1].by === 'CCP Testdev');
    // A multi-paragraph note must survive whole: stopping at the first </div> would silently truncate it,
    // and a note is exactly the place where the second paragraph carries the caveat.
    ok('a multi-paragraph note is not truncated', N[1].text === 'First paragraph.\n\nSecond paragraph.', JSON.stringify(N[1].text));
    ok('the byline never leaks into the note text', N.every((n) => n.text.indexOf('By ') === -1 && n.text.indexOf('2025-') === -1),
        JSON.stringify(N.map((n) => n.text)));

    ok('an account with no notes yields an empty list, not a failure',
        (() => { const r = A._parseNotes(notesBlock('')); return Array.isArray(r) && r.length === 0; })());
    ok('a page with no notes block yields an empty list too',
        (() => { const r = A._parseNotes('<html><body>nothing</body></html>'); return Array.isArray(r) && r.length === 0; })());

    // Notes ride along on the same fetch as the answers, so reading an application never costs a second request.
    A._get = (url) => Promise.resolve({
        body: detailPage({}).replace('</body>', notesBlock(note('GM Testperson', '2025-07-02 13:22', '<p>Body.</p>')) + '</body>'),
        finalUrl: url, status: 200
    });
    const withNotes = await A.detail(G1);
    ok('detail returns the notes alongside the answers',
        withNotes.ok && withNotes.notes.length === 1 && withNotes.qa.length === 1, JSON.stringify(withNotes).slice(0, 140));

    // ---- the two questionnaires ----------------------------------------------------------------------
    // A part-two application carries BOTH sets. They are split on the accordion structure VMS renders -
    // one panel each, titled by its own <h4 class="panel-title"> - and deliberately never on the questions
    // themselves, because the questions are the one thing here certain to change.
    const qa1 = (n) => Array.from({ length: n }, (_, i) =>
        `<dt><p>Part one question ${i + 1}?</p></dt><dd class="application-answer"><p>One answer ${i + 1}</p></dd>`).join('');
    const qa2 = (n) => Array.from({ length: n }, (_, i) =>
        `<dt><p>Part two question ${i + 1}?</p></dt><dd class="application-answer"><p>Two answer ${i + 1}</p></dd>`).join('');
    // The real accordion, structure verbatim from the live page.
    const accordion = (panels) => `<div class="col-md-9"><div class="panel-group" id="accordion">` + panels.map((p, i) =>
        `<div class="panel panel-default"><div class="panel-heading" role="tab"><h4 class="panel-title">
            <a role="button" data-toggle="collapse" data-parent="#accordion" href="#collapse${i}">${p.title}</a></h4></div>
        <div id="collapse${i}" class="panel-collapse collapse${i === 0 ? ' in' : ''}"><div class="panel-body">
        <dl>${p.body}</dl></div></div></div>`).join('') + `</div></div>`;

    const both = A._parseSections(accordion([
        { title: 'Application', body: qa1(13) }, { title: 'Application part 2', body: qa2(7) }]));
    ok('the two questionnaires come back as two sections', both.length === 2, JSON.stringify(both.map((s) => s.title)));
    ok('each carries the panel heading as its title',
        both[0].title === 'Application' && both[1].title === 'Application part 2', JSON.stringify(both.map((s) => s.title)));
    ok('the questions land in the right one',
        both[0].qa.length === 13 && both[1].qa.length === 7, both.map((s) => s.qa.length).join('/'));
    ok('no question crosses the boundary',
        both[0].qa.every((p) => /Part one/.test(p.q)) && both[1].qa.every((p) => /Part two/.test(p.q)));
    ok('document order is kept within a section', both[1].qa[0].q === 'Part two question 1?' &&
        both[1].qa[6].q === 'Part two question 7?', both[1].qa[0].q);

    // The whole point of splitting on STRUCTURE: none of this needs a code change here.
    const renamed = A._parseSections(accordion([
        { title: 'Initial questions', body: qa1(2) }, { title: 'Second questionnaire', body: qa2(3) }]));
    ok('a renamed questionnaire relabels its own tab',
        renamed.map((s) => s.title).join(' | ') === 'Initial questions | Second questionnaire', JSON.stringify(renamed.map((s) => s.title)));
    const three = A._parseSections(accordion([
        { title: 'Application', body: qa1(2) }, { title: 'Application part 2', body: qa2(2) },
        { title: 'Application part 3', body: qa1(1) }]));
    ok('a THIRD questionnaire would simply appear as a third section', three.length === 3, String(three.length));
    ok('a single questionnaire yields one section, so the UI shows no tab strip',
        A._parseSections(accordion([{ title: 'Application', body: qa1(4) }])).length === 1);

    // A panel with no answers in it is not a questionnaire. The notes panel is exactly that.
    const withNotesPanel = A._parseSections(accordion([{ title: 'Application', body: qa1(3) }]) +
        notesBlock(note('GM Testperson', '2025-07-02 13:22', '<p>Body.</p>')));
    ok('the notes panel is never mistaken for a questionnaire',
        withNotesPanel.length === 1 && withNotesPanel[0].title === 'Application',
        JSON.stringify(withNotesPanel.map((s) => s.title)));

    // Readability outranks the tabs: a page whose headings moved must still show its answers.
    const noHeads = A._parseSections('<div class="panel-body"><dl>' + qa1(5) + '</dl></div>');
    ok('a page with no panel headings still yields the answers, as one set',
        noHeads.length === 1 && noHeads[0].qa.length === 5, JSON.stringify(noHeads.map((s) => s.qa.length)));
    ok('a page with no answers at all yields nothing rather than an empty tab',
        A._parseSections('<html><body>nothing here</body></html>').length === 0);

    A._get = (url) => Promise.resolve({
        body: detailPage({ panels: accordion([{ title: 'Application', body: qa1(13) }, { title: 'Application part 2', body: qa2(7) }]) }),
        finalUrl: url, status: 200
    });
    const split = await A.detail(G1);
    ok('detail returns the sections', split.ok && split.sections.length === 2, JSON.stringify(split.sections && split.sections.length));
    ok('...and a flat qa across all of them, so the count is still the whole application',
        split.qa.length === 20, String(split.qa.length));
    ok('the flat list keeps both sets in document order',
        split.qa[0].q === 'Part one question 1?' && split.qa[13].q === 'Part two question 1?', split.qa[13].q);

    // ---- writing a note ------------------------------------------------------------------------------
    // A note is keyed on the CHARACTER NAME, so it lands on the account, not the application. Everything
    // below exists to make two things impossible: writing on the wrong person, and sending an internal
    // note out at a visibility the page never offered.
    const T = A._parseNoteTarget(detailPage({}));
    ok('the note subject is read from the page\'s own Add-note control', T && T.name === 'Testchar Alpha', JSON.stringify(T));
    ok('the visibilities come from the modal, in its order',
        T && T.states.join(',') === 'Developers,Volunteers,Public', T && T.states.join(','));
    ok('a visibility VMS adds later is picked up without a code change',
        A._parseNoteTarget(detailPage({ states: ['Developers', 'Leads', 'Public'] })).states.join(',') === 'Developers,Leads,Public');
    ok('a button with no modal still yields the known three as a fallback',
        A._parseNoteTarget(detailPage({ noteModal: false })).states.length === 3);
    ok('a page with no Add-note button offers no composer at all',
        A._parseNoteTarget(detailPage({ noteBtn: false })) === null);
    ok('...and a name with an entity in it is decoded, not sent raw',
        A._parseNoteTarget(detailPage({ character: 'Test &amp; Co' })).name === 'Test & Co',
        A._parseNoteTarget(detailPage({ character: 'Test &amp; Co' })).name);
    // A new note starts on Public, the widest level, so everyone who reads the account sees it (Schogol's call,
    // 2026-09-28; it used to start on Volunteers) - not on VMS's own first option, Developers.
    ok('a new note starts on Public', A.noteDefaultState(['Developers', 'Volunteers', 'Public']) === 'Public',
        A.noteDefaultState(['Developers', 'Volunteers', 'Public']));
    ok('...even when VMS lists it somewhere else', A.noteDefaultState(['Public', 'Developers', 'Volunteers']) === 'Public',
        A.noteDefaultState(['Public', 'Developers', 'Volunteers']));
    ok('a page without Public starts on the widest level it offers',
        A.noteDefaultState(['Developers', 'Volunteers']) === 'Volunteers', A.noteDefaultState(['Developers', 'Volunteers']));
    ok('...so a renamed widest level is still the one picked',
        A.noteDefaultState(['Developers', 'Volunteers', 'Everyone']) === 'Everyone', A.noteDefaultState(['Developers', 'Volunteers', 'Everyone']));
    ok('a page offering a single level starts on it', A.noteDefaultState(['Developers']) === 'Developers');
    ok('an empty list degrades to the configured default, never to undefined',
        A.noteDefaultState([]) === 'Public' && A.noteDefaultState(null) === 'Public');
    ok('detail carries the note target alongside the notes', !!withNotes.note && withNotes.note.name === 'Testchar Alpha');
    ok('inspect carries it too, so the post can re-verify it', (await A.inspect(G1)).note.name === 'Testchar Alpha');

    sent = null;
    A._get = (url) => Promise.resolve({ body: detailPage({}), finalUrl: url, status: 200 });
    const added = await A.addNote(G1, '  Flagged in the background check.  ', 'Developers');
    ok('a note goes to AdministratorService, NOT ApplicationService', sent.service === 'AdministratorService', sent.service);
    ok('...as NoteAdd', sent.method === 'NoteAdd', sent.method);
    ok('it is addressed to the character, not the application',
        sent.payload.characterName === 'Testchar Alpha' && sent.payload.applicationId === undefined, JSON.stringify(sent.payload));
    ok('the live CSRF token is used', sent.payload.token === CSRF);
    ok('the text is trimmed but otherwise sent verbatim', sent.payload.content === 'Flagged in the background check.',
        JSON.stringify(sent.payload.content));
    ok('the chosen visibility is sent', sent.payload.viewState === 'Developers', sent.payload.viewState);
    ok('the result names who it landed on', added.ok && added.name === 'Testchar Alpha', JSON.stringify(added));

    sent = null;
    const blank = await A.addNote(G1, '   ', 'Developers');
    ok('an empty note is refused before any request', blank.ok === false && blank.reason === 'empty' && sent === null,
        JSON.stringify(blank));

    sent = null;
    const badVis = await A.addNote(G1, 'text', 'Everyone');
    ok('a visibility the page never offered is refused', badVis.ok === false && badVis.reason === 'visibility',
        JSON.stringify(badVis));
    ok('...and nothing is sent, so it cannot leak out Public', sent === null);

    sent = null;
    A._get = (url) => Promise.resolve({ body: detailPage({ noteBtn: false }), finalUrl: url, status: 200 });
    const noCtl = await A.addNote(G1, 'text', 'Developers');
    ok('an application VMS offers no note control on is refused', noCtl.ok === false && noCtl.reason === 'gone' && sent === null,
        JSON.stringify(noCtl));

    sent = null;
    A._get = (url) => Promise.resolve({ body: detailPage({ id: G2, character: 'Somebody Else' }), finalUrl: url, status: 200 });
    const wrongOne = await A.addNote(G1, 'text', 'Developers');
    ok('a page for a different application never gets a note', wrongOne.ok === false && wrongOne.reason === 'mismatch' && sent === null,
        JSON.stringify(wrongOne));

    sent = null;
    A._get = (url) => Promise.resolve({ body: '', finalUrl: 'https://login.eveonline.com/oauth/authorize', status: 200 });
    const noSession = await A.addNote(G1, 'text', 'Developers');
    ok('an expired session refuses instead of posting a note',
        noSession.ok === false && noSession.reason === 'login' && sent === null, JSON.stringify(noSession));

    // A note the service refused must never read as written - the Lead would walk away believing it is there.
    A._get = (url) => Promise.resolve({ body: detailPage({}), finalUrl: url, status: 200 });
    A._post = () => Promise.resolve(A._postResult({ status: 200, responseText: '{"d":{"Success":false,"Message":"Nope."}}' }));
    const refusedNote = await A.addNote(G1, 'text', 'Developers');
    ok('a refused note is a failure, not a success', refusedNote.ok === false && refusedNote.reason === 'refused',
        JSON.stringify(refusedNote));
    ok('...and carries no name, since nothing landed on anybody', refusedNote.name === undefined);

    // ---- entities: every one, in one pass ----
    // An answer read "espa&#241;ol": only six named entities were ever decoded, and none of the numeric ones
    // VMS uses for anything beyond ASCII. Decoding them one after another also decoded twice.
    const TX = (x) => A._text(x);
    ok('a decimal entity is decoded (the answer that read "espa&#241;ol")', TX('espa&#241;ol') === 'español', TX('espa&#241;ol'));
    ok('...and a hex one, in either case', TX('espa&#xF1;ol') === 'español' && TX('espa&#XF1;ol') === 'español', TX('espa&#xF1;ol'));
    ok('Cyrillic escaped as numbers comes back readable',
        TX('&#1055;&#1088;&#1080;&#1074;&#1077;&#1090;') === 'Привет', TX('&#1055;&#1088;&#1080;&#1074;&#1077;&#1090;'));
    ok('a character beyond the basic plane survives', TX('&#128512;') === String.fromCodePoint(0x1F600), TX('&#128512;'));
    ok('each entity is decoded once: an applicant who typed "&lt;" still reads "&lt;"',
        TX('&amp;lt;b&amp;gt;') === '&lt;b&gt;', TX('&amp;lt;b&amp;gt;'));
    ok('a decoded "<" is text, never markup', TX('&lt;b&gt;bold&lt;/b&gt;') === '<b>bold</b>', TX('&lt;b&gt;bold&lt;/b&gt;'));
    ok('the named ones match in any case, as HTML allows', TX('R&AMP;D &QUOT;x&QUOT;') === 'R&D "x"', TX('R&AMP;D &QUOT;x&QUOT;'));
    ok('a numeric nbsp reads like the named one, and collapses with it', TX('a&#160;&nbsp;b') === 'a b', JSON.stringify(TX('a&#160;&nbsp;b')));
    ok('the apostrophe forms that worked before still do', TX('O&#39;Neil &#039;x&apos;') === "O'Neil 'x'", TX('O&#39;Neil &#039;x&apos;'));
    ok('a number that is no character is left exactly as written',
        TX('&#0; &#xD800; &#1114112;') === '&#0; &#xD800; &#1114112;', TX('&#0; &#xD800; &#1114112;'));
    ok('text that only looks like an entity is untouched', TX('Q&A & more; a&b;c') === 'Q&A & more; a&b;c', TX('Q&A & more; a&b;c'));
    ok('an unknown name outside a browser is left as written, never dropped', TX('caf&eacute;') === 'caf&eacute;', TX('caf&eacute;'));
    global.document = { createElement: () => ({ set innerHTML(v) { this._v = v === '&eacute;' ? 'é' : v; }, get value() { return this._v; } }) };
    ok('...and in a browser, any named entity is resolved by the browser', TX('caf&eacute;') === 'café', TX('caf&eacute;'));
    delete global.document;

    A._get = (url) => Promise.resolve({ body: '<dl><dt><p>Which languages?</p></dt><dd class="application-answer"><p>espa&#241;ol, &#1088;&#1091;&#1089;&#1089;&#1082;&#1080;&#1081;</p></dd></dl>', finalUrl: url, status: 200 });
    const lang = await A.detail(G1);
    ok('an answer carrying numeric entities reads as it was written',
        lang.ok && lang.qa[0].a === 'español, русский', JSON.stringify(lang.qa && lang.qa[0]));
    ok('...and so does a character name, which a note is posted against',
        A._parseNoteTarget(detailPage({ character: 'Te&#241;o' })).name === 'Teño', A._parseNoteTarget(detailPage({ character: 'Te&#241;o' })).name);

    console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'VMS application checks passed.'));
    process.exit(fail ? 1 : 0);
})();
