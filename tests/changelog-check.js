// changelog-check.js - the changelog (v3.38.0, two tabs since v3.39.0). The list has to match the release: its
// newest entry IS the version in the @version header (so no version can ship without an entry), versions only ever
// go down, the history reaches back to the first version, and every entry is well-formed: what it added under
// `features`, what it fixed under `fixes`. The "What's new" pill follows what this browser has been shown, and only
// an update that brings a feature puts it up: it names those updates, is gone once they are seen or dismissed, and a
// browser that never saw the changelog is shown just the newest entry. The list opens on the tab with something new.
// Evals the real JiTA.changelog against small stubs, with the real version comparator.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const hv = /^\/\/ @version\s+(\S+)/m.exec(src);
const em = '\n    _noop: null\n};';
const cs = src.indexOf('\nJiTA.changelog = {'), ce = src.indexOf(em, cs);
const vs = src.indexOf('\n    _verCmp: function (a, b) {'), ve = src.indexOf('\n    },', vs) + 7;
if (!hv || cs < 0 || ce < 0 || vs < 0 || ve < 7) { throw new Error('could not slice the header / JiTA.changelog / _verCmp'); }

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- stubs: GM storage, a DOM just big enough for the pill, and the stacking hook ----
const gm = {};
global.gmGet = (k, d) => (k in gm ? gm[k] : d);
global.gmSet = (k, v) => { gm[k] = v; };
global.JITA_IS_FORGE_FRAME = false;
global.JITA_PILL_Z = 250;
let stacked = 0;
global.jitaStackPills = () => { stacked++; };
const byId = {};
function node(tag) {
    return {
        tag: tag, style: {}, attrs: {}, children: [], parentNode: null, listeners: {}, textContent: '', title: '',
        set id(v) { this._id = v; }, get id() { return this._id; },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) { byId[c.id] = c; } return c; },
        removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; if (byId[c.id] === c) { delete byId[c.id]; } return c; },
        addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
        querySelector(sel) { const m = /data-cl="([^"]+)"/.exec(sel); return this.children.find((c) => m && c.attrs['data-cl'] === m[1]) || null; }
    };
}
const body = node('body');
global.document = { body: body, documentElement: body, getElementById: (id) => byId[id] || null, createElement: node };
global.JiTA = { worker: eval('({' + src.slice(vs, ve) + '})') };
eval(src.slice(cs + 1, ce + em.length));
const C = JiTA.changelog, E = C.ENTRIES, cmp = JiTA.worker._verCmp;

// ---- the data ----
ok('the changelog has the whole history', E.length > 100, String(E.length));
ok('its newest entry is the version being released', E[0] && E[0].v === hv[1], (E[0] && E[0].v) + ' vs @version ' + hv[1]);
ok('versions only go down, with no repeats', E.every((e, i) => i === 0 || cmp(E[i - 1].v, e.v) > 0),
    E.map((e) => e.v).filter((v, i) => i > 0 && cmp(E[i - 1].v, v) <= 0).join(', '));
ok('every version is major.minor or major.minor.patch', E.every((e) => /^\d+\.\d+(\.\d+)?$/.test(e.v)), E.filter((e) => !/^\d+\.\d+(\.\d+)?$/.test(e.v)).map((e) => e.v).join(', '));
const realDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) { return false; } const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return t.getUTCDate() === +m[3] && t.getUTCMonth() === +m[2] - 1; };
ok('every date is a real YYYY-MM-DD date', E.every((e) => realDate(e.date)), E.filter((e) => !realDate(e.date)).map((e) => e.v + ' ' + e.date).join(', '));
ok('dates never go forward as the versions go back', E.every((e, i) => i === 0 || E[i - 1].date >= e.date),
    E.filter((e, i) => i > 0 && E[i - 1].date < e.date).map((e) => e.v).join(', '));
ok('the history starts at the first version, 1.1 in May 2023', E[E.length - 1].v === '1.1' && E[E.length - 1].date === '2023-05-10', JSON.stringify(E[E.length - 1]));
ok('the rename to JiTA is in the list, so the older part is marked where it starts', E.some((e) => e.v === C.RENAME_V));
const KINDS = ['features', 'fixes'];
const lists = (e) => KINDS.filter((k) => k in e).map((k) => e[k]);
const allItems = (e) => [].concat.apply([], lists(e).filter(Array.isArray));
ok('every entry says something, under features or fixes', E.every((e) => lists(e).length > 0 && lists(e).every((l) => Array.isArray(l) && l.length > 0) &&
    allItems(e).every((t) => typeof t === 'string' && t.trim().length > 0)),
    E.filter((e) => !lists(e).length || !lists(e).every((l) => Array.isArray(l) && l.length > 0)).map((e) => e.v).join(', '));
ok('no entry carries anything else (the old single items list is gone)', E.every((e) => Object.keys(e).every((k) => ['v', 'date'].concat(KINDS).indexOf(k) >= 0)),
    E.filter((e) => Object.keys(e).some((k) => ['v', 'date'].concat(KINDS).indexOf(k) < 0)).map((e) => e.v + ' ' + Object.keys(e).join('/')).join(', '));
const dash = E.filter((e) => allItems(e).some((t) => /[\u2013\u2014]/.test(t)));
ok('no en or em dashes', !dash.length, dash.map((e) => e.v).join(', '));
const long = E.filter((e) => allItems(e).some((t) => t.length > 240));
ok('items stay short enough to read at a glance', !long.length, long.map((e) => e.v).join(', '));
ok('both tabs have a history', E.some((e) => e.features) && E.some((e) => e.fixes));

// ---- what counts as new, and what warrants the pill (on a history of our own, so the real one can grow) ----
C.ENTRIES = [
    { v: '9.2.1', date: '2030-01-05', fixes: ['fix three'] },
    { v: '9.2.0', date: '2030-01-04', features: ['feature two'], fixes: ['fix two'] },
    { v: '9.1.1', date: '2030-01-03', fixes: ['fix one'] },
    { v: '9.1.0', date: '2030-01-02', features: ['feature one'] },
    { v: '2.0', date: '2020-01-01', features: ['the old name'] }
];
C.RENAME_V = '3.0.0';
const vers = (l) => l.map((e) => e.v).join(',');
ok('a browser that never saw the changelog is shown just the newest entry', vers(C.unseen()) === '9.2.1', vers(C.unseen()));
ok('...which only fixes things, so no pill', !C.shouldShow());
gm[C.SEEN_KEY] = '9.1.0';
ok('after a few updates, exactly the newer entries are new', vers(C.unseen()) === '9.2.1,9.2.0,9.1.1', vers(C.unseen()));
ok('...the pill comes up for the one that brings a feature', C.shouldShow() && vers(C.unseenFeatures()) === '9.2.0', vers(C.unseenFeatures()));
ok('...and names it, not the fix-only ones around it', C.label(C.unseenFeatures()) === '📝 What\'s new in v9.2.0', C.label(C.unseenFeatures()));
gm[C.SEEN_KEY] = '9.0.0';
ok('two updates with features are counted as two', C.label(C.unseenFeatures()) === '📝 What\'s new: 2 updates', C.label(C.unseenFeatures()));
gm[C.SEEN_KEY] = '9.2.0';
ok('an update that only fixes things brings no pill', C.unseen().length === 1 && !C.shouldShow());
gm[C.SEEN_KEY] = '9.2.1';
ok('nothing is new once the newest has been seen', C.unseen().length === 0 && !C.shouldShow());
gm[C.SEEN_KEY] = '99.0.0';
ok('a browser ahead of this build (a downgrade) sees nothing new', C.unseen().length === 0);
gm[C.SEEN_KEY] = '9.0.0';
global.JITA_IS_FORGE_FRAME = true;
ok('never inside the Zendesk frame', !C.shouldShow());
global.JITA_IS_FORGE_FRAME = false;
ok('dates read the way the rest of JiTA shows them', C._date('2026-09-29') === '29 Sep 2026' && C._date('2023-05-10') === '10 May 2023' && C._date('2026-09-05') === '05 Sep 2026', C._date('2026-09-29') + ' / ' + C._date('2023-05-10') + ' / ' + C._date('2026-09-05'));

// ---- the two tabs ----
gm[C.SEEN_KEY] = '9.1.0';
const feat = C._rows('features'), fix = C._rows('fixes');
ok('New features lists the versions that added something, with only those items', vers(feat) === '9.2.0,9.1.0,2.0' && feat[0].items.join() === 'feature two', vers(feat) + ' / ' + feat[0].items.join());
ok('Fixed issues lists the versions that fixed something, with only those items', vers(fix) === '9.2.1,9.2.0,9.1.1' && fix[1].items.join() === 'fix two', vers(fix) + ' / ' + fix[1].items.join());
ok('the unseen versions are marked new in each tab', feat.map((r) => r.isNew).join() === 'true,false,false' && fix.map((r) => r.isNew).join() === 'true,true,true');
ok('the versions from before the rename are marked old', feat.map((r) => r.old).join() === 'false,false,true');
ok('each tab counts the unseen updates it has something in', C._newCount('features') === 1 && C._newCount('fixes') === 3, C._newCount('features') + '/' + C._newCount('fixes'));
ok('the list opens on New features when something new is there', C._startTab() === 'features');
gm[C.SEEN_KEY] = '9.2.0';
ok('...and on Fixed issues when only fixes are new', C._startTab() === 'fixes', C._startTab());
gm[C.SEEN_KEY] = '9.2.1';
ok('...and on New features with nothing new (control)', C._startTab() === 'features');

// ---- the list itself: built, opened on the right tab, and counted as seen ----
const made = [];
function $el(html) {
    const el = { html: html, kids: [], cls: {}, attrs: {}, txt: '', handlers: {} };
    const m = /class="([^"]+)"/.exec(html || '');
    if (m) { m[1].split(' ').forEach((c) => { el.cls[c] = true; }); }
    made.push(el);
    const j = {
        el: el,
        appendTo: (p) => { (p.el || p).kids.push(el); return j; },
        text: (v) => { el.txt = v; return j; },
        attr: (k, v) => { if (v === undefined) { return el.attrs[k]; } el.attrs[k] = v; return j; },
        addClass: (c) => { el.cls[c] = true; return j; },
        toggleClass: (c, on) => { el.cls[c] = !!on; return j; },
        children: () => ({ each: (f) => { el.kids.forEach((k) => f.call(k)); } }),
        empty: () => { el.kids = []; return j; },
        scrollTop: () => j,
        on: (ev, sel, f) => { el.handlers[sel] = f; return j; }
    };
    return j;
}
global.$ = (x) => (typeof x === 'string' ? $el(x) : { toggleClass: (c, on) => { x.cls[c] = !!on; }, attr: (k) => x.attrs[k] });
global.GM_addStyle = () => {};
const menu = $el('<div class="menu"></div>');
JiTA.menu = { _openOverlay: () => ({ $menu: menu }) };
gm[C.SEEN_KEY] = '9.2.0';   // only a fix is new
C.openView();
const tabs = made.filter((e) => e.cls['jcl-tab']);
const scroll = made.filter((e) => e.cls['jcl-scroll'])[0];
ok('the list has the two tabs, each saying how much is new in it', tabs.map((e) => e.txt).join(' | ') === 'New features | Fixed issues (1 new)', tabs.map((e) => e.txt).join(' | '));
ok('...opens on Fixed issues when only a fix is new', tabs[1].cls.on === true && tabs[0].cls.on === false && scroll.kids.length === 3, scroll.kids.length + ' entries');
ok('...and opening it counts as seen', gm[C.SEEN_KEY] === '9.2.1', String(gm[C.SEEN_KEY]));
const tabsBar = made.filter((e) => e.cls['jcl-tabs'])[0];
tabsBar.handlers['.jcl-tab'].call(tabs[0]);
ok('clicking New features shows the features, with the older ones under their divider', tabs[0].cls.on === true && scroll.kids.length === 4 && scroll.kids[2].cls['jcl-era'] === true,
    scroll.kids.map((k) => Object.keys(k.cls).join('.')).join(' | '));

// ---- the pill ----
gm[C.SEEN_KEY] = '9.1.1';   // 9.2.0 (a feature) and 9.2.1 (a fix) unseen
stacked = 0;
C.mount();
let el = byId[C.PILL_ID];
ok('an unseen feature puts the pill up', !!el && el.parentNode === body);
ok('...saying what is new', !!el && el.children[0].textContent === '📝 What\'s new in v9.2.0', el && el.children[0].textContent);
ok('...and restacks the corner', stacked === 1, String(stacked));
C.mount();
ok('mounting again does not add a second pill', body.children.filter((c) => c.id === C.PILL_ID).length === 1);
const x = el.children[1];
let stopped = false;
x.listeners.click[0]({ stopPropagation: () => { stopped = true; } });
ok('its x dismisses the update', gm[C.SEEN_KEY] === '9.2.1', String(gm[C.SEEN_KEY]));
ok('...takes the pill away', !byId[C.PILL_ID]);
ok('...without also opening the list behind it', stopped);
C.mount();
ok('a dismissed update does not come back', !byId[C.PILL_ID]);
gm[C.SEEN_KEY] = '9.2.0';
C.mount();
ok('an unseen fix alone puts no pill up', !byId[C.PILL_ID]);

gm[C.SEEN_KEY] = '9.1.1';
C.mount();
el = byId[C.PILL_ID];
let opened = 0;
const realOpen = C.openView;
C.openView = () => { opened++; C.markSeen(); };
el.listeners.click[0]();
ok('clicking the pill opens the list', opened === 1);
ok('...which counts as seen, so the pill is gone', !byId[C.PILL_ID] && gm[C.SEEN_KEY] === '9.2.1');
C.openView = realOpen;

// ---- the pill comes back (v3.38.5) ----
// It used to get one attempt, 2.5 s after the page loaded: a pill the page took away, or one never put up because
// the boot stopped early, stayed gone while the list still showed the update as new. ensure() puts it up whenever it
// should be up and is not, and start() looks three times; the Jira pages' DOM observer calls ensure() as well.
gm[C.SEEN_KEY] = '9.0.0';   // two feature updates unseen
C.remove();
C._armed = false;
C.ensure();
ok('ensure() does nothing before start() has let the page settle', !byId[C.PILL_ID]);
const timers = [], realSetTimeout = global.setTimeout;
let listening = 0;
global.GM_addValueChangeListener = () => { listening++; };
C._watching = false;
global.setTimeout = (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; };
try { C.start(); } finally { global.setTimeout = realSetTimeout; }
ok('start() looks three times over the first half minute', timers.map((q) => q.ms).join(',') === '2500,10000,30000', timers.map((q) => q.ms).join(','));
ok('...and listens for the update being seen in another tab', listening === 1, String(listening));
timers[0].fn();
el = byId[C.PILL_ID];
ok('its first look puts the pill up, counting both feature updates', !!el && el.children[0].textContent === '📝 What\'s new: 2 updates', el && el.children[0].textContent);
body.removeChild(el);
C.ensure();
ok('a pill the page took away is put back', !!byId[C.PILL_ID] && body.children.filter((c) => c.id === C.PILL_ID).length === 1);
stacked = 0;
C.ensure(); timers[1].fn(); timers[2].fn();
ok('a pill that is up is left alone: no second one, nothing redrawn', body.children.filter((c) => c.id === C.PILL_ID).length === 1 && stacked === 0, String(stacked));
C.markSeen();
C.ensure();
ok('once the update is seen, ensure() leaves it down', !byId[C.PILL_ID]);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'changelog checks passed.'));
process.exit(fail ? 1 : 0);
