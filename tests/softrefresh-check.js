// softrefresh-check.js - the issue on screen shown without a reload (v3.51.1). Jira's issue view is told to read the issue
// again by the DOM event its own comment box fires after a write (jitaRefreshIssueView), the page is watched for the
// write with the caller's fallback when it never shows (jitaShowWritten), the status lozenge is read (jitaStatusText), and
// an issue is opened in-app the way a link in Jira opens one, with a page load when the router ignores it (jitaOpenIssue).
// Evals the real helpers against a fake document, clock and location.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const hs = src.indexOf('\nvar JITA_REFRESH_EVENT = '), he = src.indexOf('\n}\n', src.indexOf('\nfunction jitaOpenIssue(', hs)) + 3;
if (hs < 0 || he < 3) { throw new Error('could not slice the refresh helpers'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const J = (x) => JSON.stringify(x);

// ---- a fake clock ----
let now = 1000, timers = [], seq = 0;
Date.now = () => now;
global.setTimeout = (fn, ms) => { timers.push({ id: ++seq, at: now + (ms || 0), fn }); return seq; };
function advance(ms) {   // runs each timer due within ms, in time order
    const end = now + ms;
    for (;;) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const t = timers[0];
        if (!t || t.at > end) { break; }
        timers.shift(); now = t.at; t.fn();
    }
    now = end;
}

// ---- the page: a document that hears events, the issue on screen, its status lozenge, the location and history ----
let events = [], dispatchThrows = false, onScreen = 'EBR-1', status = 'Open', pushed = [], pops = [], pushThrows = false;
global.CustomEvent = function (type, init) { this.type = type; this.init = init; this.detail = init && init.detail !== undefined ? init.detail : null; };
global.PopStateEvent = function (type, init) { this.type = type; this.state = init ? init.state : undefined; };
global.document = { dispatchEvent: (e) => { if (dispatchThrows) { throw new Error('dispatch refused'); } events.push(e); return true; } };
global.jitaCurrentKey = () => onScreen;
global.SELECTORS = { STATUS_FIELD_WRAP: 'status-wrap' };
global.$ = (sel) => ({ find: (s) => ({ first: () => ({ text: () => (sel === 'status-wrap' && s === 'button' && status !== null ? '\n  ' + status + ' ' : '') }) }) });
$.trim = (s) => String(s == null ? '' : s).trim();
const loc = { pathname: '/browse/EBR-1', loads: [] };
Object.defineProperty(loc, 'href', { get: () => loc.pathname, set: (v) => { loc.loads.push(v); } });
global.window = { location: loc, dispatchEvent: (e) => { pops.push(e); return true; } };
global.history = { pushState: (state, title, url) => { if (pushThrows) { throw new Error('SecurityError'); } pushed.push(url); loc.pathname = url; } };
(0, eval)(src.slice(hs, he));

// ================= telling Jira =================
jitaRefreshIssueView();
ok('Jira\'s issue view is told to read the issue again: the event its own comment box fires, on the document', events.length === 1 && events[0].type === 'legacy_refreshIssuePage', J(events));
ok('...with no detail, nor even an init: an object from a Firefox sandbox is one the page cannot read', events[0].detail === null && events[0].init === undefined, J(events[0]));
dispatchThrows = true;
let threw = false;
try { jitaRefreshIssueView(); } catch (e) { threw = true; }
ok('a dispatch that throws is the caller\'s fallback\'s business, not an error', !threw);
dispatchThrows = false;
ok('as shipped: the event Jira hears, 8 seconds looked at every quarter second, 4 seconds for the router, 30 for an issue still loading',
    JITA_REFRESH_EVENT === 'legacy_refreshIssuePage' && JITA_REFRESH_MS === 8000 && JITA_REFRESH_STEP_MS === 250 && JITA_NAV_MS === 4000 && JITA_NAV_GIVEUP_MS === 30000,
    J([JITA_REFRESH_EVENT, JITA_REFRESH_MS, JITA_REFRESH_STEP_MS, JITA_NAV_MS, JITA_NAV_GIVEUP_MS]));

// ================= watching for the write =================
let missed = 0, looks = 0, eventsAtFirstLook = -1;
events = []; timers = [];
jitaShowWritten('EBR-1', () => { if (eventsAtFirstLook < 0) { eventsAtFirstLook = events.length; } looks++; return true; }, () => { missed++; });
ok('a write Jira shows at once: told first, then looked at, and nothing more', events.length === 1 && eventsAtFirstLook === 1 && looks === 1 && !timers.length, looks + ' ' + timers.length);
advance(20000);
ok('...its fallback never runs', missed === 0);
looks = 0;
const shownAt = now + 1000;
jitaShowWritten('EBR-1', () => { looks++; return now >= shownAt; }, () => { missed++; });
advance(20000);
ok('a write Jira shows a second later: looked at every quarter second until then, no fallback', looks === 5 && missed === 0 && !timers.length, looks + ' looks, ' + missed);
const t0 = now;
jitaShowWritten('EBR-1', () => false, () => { missed++; });
advance(7999);
ok('a write Jira never shows: the fallback waits the whole 8 seconds', missed === 0, String(missed));
advance(1);
ok('...then runs, once', missed === 1 && now - t0 === 8000 && !timers.length, missed + ' ' + (now - t0));
advance(20000);
ok('...and only once', missed === 1);
missed = 0;
jitaShowWritten('EBR-1', () => false, () => { missed++; });
advance(1000);
onScreen = 'EBR-2';   // the user opened another issue meanwhile
advance(20000);
ok('...but not once another issue is on screen, and the looking stops', missed === 0 && !timers.length, missed + ' ' + timers.length);
onScreen = 'EBR-1';

// ================= the status lozenge =================
status = 'Attached';
ok('the status of the issue on screen as its lozenge reads, trimmed', jitaStatusText() === 'Attached', J(jitaStatusText()));
status = null;
ok('...none when the page shows no lozenge', jitaStatusText() === '');
status = 'Open';

// ================= opening an issue in-app =================
const open = (key) => { pushed = []; pops = []; loc.loads = []; timers = []; jitaOpenIssue(key); };
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-77');
ok('an issue is opened in-app: its URL pushed and Jira\'s router told with a popstate on the window', J(pushed) === J(['/browse/EDR-77']) && pops.length === 1 &&
    pops[0].type === 'popstate' && pops[0].state === null && !loc.loads.length, J(pushed) + ' ' + J(pops));
onScreen = 'EDR-77';   // the router took it
advance(60000);
ok('...the router taking it, nothing more', !loc.loads.length && !timers.length, J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-78');
advance(3999);
ok('the router ignoring it: nothing for 4 seconds', !loc.loads.length);
advance(1);
ok('...then an ordinary page load of the issue', J(loc.loads) === J(['/browse/EDR-78']), J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-79');
onScreen = '';   // Jira's skeleton: the issue is still loading
advance(25000);
ok('an issue still loading is waited for, not taken for an ignored switch', !loc.loads.length && timers.length === 1, J(loc.loads));
onScreen = 'EDR-79';
advance(60000);
ok('...and once it is there, nothing more', !loc.loads.length && !timers.length, J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-80');
onScreen = '';
advance(29999);
ok('one still loading after 30 seconds...', !loc.loads.length);
advance(1);
ok('...gets the page load', J(loc.loads) === J(['/browse/EDR-80']), J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-81');
loc.pathname = '/browse/EBR-5';   // the user went somewhere else meanwhile
advance(60000);
ok('the user gone somewhere else meanwhile: no page load', !loc.loads.length && !timers.length, J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1'; pushThrows = true;
open('EDR-82');
ok('a browser refusing the pushed URL gets the page load at once, and no popstate', J(loc.loads) === J(['/browse/EDR-82']) && !pops.length && !timers.length, J(loc.loads));
pushThrows = false;
open('X/1');
ok('the key goes into the URL encoded', J(pushed) === J(['/browse/X%2F1']), J(pushed));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'soft refresh checks passed.'));
process.exit(fail ? 1 : 0);
