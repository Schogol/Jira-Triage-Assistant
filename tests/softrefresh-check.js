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
let session = {}, sessionThrows = false;
global.sessionStorage = {
    getItem: (k) => { if (sessionThrows) { throw new Error('SecurityError'); } return k in session ? session[k] : null; },
    setItem: (k, v) => { if (sessionThrows) { throw new Error('SecurityError'); } session[k] = String(v); },
    removeItem: (k) => { delete session[k]; }
};
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
ok('as shipped: the event Jira hears, 8 seconds looked at every quarter second, 15 for the issue before to give way, 30 for one still loading',
    JITA_REFRESH_EVENT === 'legacy_refreshIssuePage' && JITA_REFRESH_MS === 8000 && JITA_REFRESH_STEP_MS === 250 && JITA_NAV_MS === 15000 && JITA_NAV_GIVEUP_MS === 30000,
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
let ends = [];
const open = (key, noDone) => { pushed = []; pops = []; loc.loads = []; timers = []; session = {}; ends = []; jitaOpenIssue(key, noDone ? undefined : (how) => { ends.push(how + '@' + loc.loads.length); }); };
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-77');
ok('an issue is opened in-app: its URL pushed and Jira\'s router told with a popstate on the window', J(pushed) === J(['/browse/EDR-77']) && pops.length === 1 &&
    pops[0].type === 'popstate' && pops[0].state === null && !loc.loads.length, J(pushed) + ' ' + J(pops));
advance(6000);
ok('Jira keeps the issue before on screen while the new one loads: 6 seconds of that is no ignored switch', !loc.loads.length && timers.length === 1 && !ends.length, J(loc.loads));
onScreen = 'EDR-77';   // loaded: the router took it
advance(60000);
ok('...the new one there, nothing more, and the caller told it is shown', !loc.loads.length && !timers.length && J(ends) === J(['shown@0']), J(loc.loads) + ' ' + J(ends));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-76', true);
onScreen = 'EDR-76';
advance(2000);
ok('...a caller that asks for no word is told nothing, and nothing breaks', !loc.loads.length && !timers.length);
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
let checks = 0;
const crumbOf = global.jitaCurrentKey;
global.jitaCurrentKey = () => { checks++; return onScreen; };
open('EDR-78');
checks = 0;
advance(5000);
global.jitaCurrentKey = crumbOf;
ok('...looked at once a second', checks === 5, String(checks));
advance(9999);
ok('the issue before still there after almost 15 seconds: still no page load', !loc.loads.length);
advance(1000);
ok('...after 15, the switch is taken as ignored: an ordinary page load of the issue', J(loc.loads) === J(['/browse/EDR-78']), J(loc.loads));
ok('...the caller told so before the page load', J(ends) === J(['load@0']), J(ends));
const note = JSON.parse(session[JITA_NAV_NOTE_KEY] || 'null');
ok('...noting why for after the page load', !!note && note.key === 'EDR-78' && note.on === 'EBR-1' && note.waited >= 15000 && typeof note.at === 'number', J(note));
const said = [], log0 = console.log;
console.log = (...a) => { said.push(a.join(' ')); };
jitaNavSaid();
console.log = log0;
ok('...which the page load says in the console, once', said.length === 1 && said[0] === '[JiTA] EDR-78 was loaded the ordinary way: 15 s after it was opened in-app, the page still showed EBR-1.' &&
    !(JITA_NAV_NOTE_KEY in session), J(said));
said.length = 0;
console.log = (...a) => { said.push(a.join(' ')); };
jitaNavSaid();
session[JITA_NAV_NOTE_KEY] = JSON.stringify({ key: 'EDR-1', on: 'EBR-1', waited: 15000, at: now - 3 * 60 * 1000 });
jitaNavSaid();
session[JITA_NAV_NOTE_KEY] = 'not json';
jitaNavSaid();
console.log = log0;
ok('...and nothing without a note, for an old one, or for one that cannot be read', said.length === 0 && !(JITA_NAV_NOTE_KEY in session), J(said));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-79');
onScreen = '';   // no breadcrumb at all: still loading
advance(25000);
ok('an issue still loading is waited for, not taken for an ignored switch', !loc.loads.length && timers.length === 1, J(loc.loads));
onScreen = 'EDR-79';
advance(60000);
ok('...and once it is there, nothing more', !loc.loads.length && !timers.length, J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-80');
onScreen = '';
advance(28000);
ok('one still loading after almost 30 seconds...', !loc.loads.length);
advance(2000);
ok('...gets the page load, its note saying it had not loaded', J(loc.loads) === J(['/browse/EDR-80']) && JSON.parse(session[JITA_NAV_NOTE_KEY]).on === '', J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-83');
sessionThrows = true;
advance(16000);
sessionThrows = false;
ok('a note that cannot be kept does not stop the page load', J(loc.loads) === J(['/browse/EDR-83']), J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
open('EDR-81');
loc.pathname = '/browse/EBR-5';   // the user went somewhere else meanwhile
advance(60000);
ok('the user gone somewhere else meanwhile: no page load, the caller told they went away', !loc.loads.length && !timers.length && J(ends) === J(['away@0']), J(loc.loads) + ' ' + J(ends));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1';
pushed = []; pops = []; loc.loads = []; timers = [];
jitaOpenIssue('EDR-84', () => { throw new Error('the caller broke'); });
advance(16000);
ok('a caller whose word throws does not stop the switch', J(loc.loads) === J(['/browse/EDR-84']), J(loc.loads));
onScreen = 'EBR-1'; loc.pathname = '/browse/EBR-1'; pushThrows = true;
open('EDR-82');
ok('a browser refusing the pushed URL gets the page load at once, and no popstate', J(loc.loads) === J(['/browse/EDR-82']) && !pops.length && !timers.length, J(loc.loads));
ok('...the caller told so before it', J(ends) === J(['load@0']), J(ends));
pushThrows = false;
open('X/1');
ok('the key goes into the URL encoded', J(pushed) === J(['/browse/X%2F1']), J(pushed));

// ================= the note is said after the page load =================
const bs = src.indexOf('// ---- Jira boot: watch the DOM'), bdb = src.indexOf('if (!window.indexedDB) { return; }', bs);
ok('the Jira boot says the note at once, before what needs the database', bs > 0 && bdb > bs && src.slice(bs, bdb).indexOf('try { jitaNavSaid(); }') > 0);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'soft refresh checks passed.'));
process.exit(fail ? 1 : 0);
