// changelog-check.js - the changelog (v3.38.0). The list has to match the release: its newest entry IS the
// version in the @version header (so no version can ship without an entry), versions only ever go down, the
// history reaches back to the first version, and every entry is well-formed. And the "What's new" pill follows
// what this browser has been shown: it names the unseen entries, is gone once they are seen or dismissed, and a
// browser that never saw the changelog is shown just the newest entry. Evals the real JiTA.changelog against
// small stubs, with the real version comparator.
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
ok('every entry says something', E.every((e) => Array.isArray(e.items) && e.items.length > 0 && e.items.every((t) => typeof t === 'string' && t.trim().length > 0)),
    E.filter((e) => !Array.isArray(e.items) || !e.items.length).map((e) => e.v).join(', '));
ok('no entry carries more than it should', E.every((e) => Object.keys(e).sort().join(',') === 'date,items,v'), E.filter((e) => Object.keys(e).sort().join(',') !== 'date,items,v').map((e) => e.v).join(', '));
const dash = E.filter((e) => e.items.some((t) => /[\u2013\u2014]/.test(t)));
ok('no en or em dashes', !dash.length, dash.map((e) => e.v).join(', '));
const long = E.filter((e) => e.items.some((t) => t.length > 240));
ok('items stay short enough to read at a glance', !long.length, long.map((e) => e.v).join(', '));

// ---- which entries count as new ----
ok('a browser that never saw the changelog is shown just the newest entry', C.unseen().length === 1 && C.unseen()[0].v === E[0].v);
ok('...named in the pill', C.label(C.unseen()) === '📝 What\'s new in v' + E[0].v, C.label(C.unseen()));
gm[C.SEEN_KEY] = E[3].v;
ok('after a few updates, exactly the newer entries are new', C.unseen().map((e) => e.v).join(',') === E.slice(0, 3).map((e) => e.v).join(','), C.unseen().map((e) => e.v).join(','));
ok('...and the pill counts them', C.label(C.unseen()) === '📝 What\'s new: 3 updates', C.label(C.unseen()));
gm[C.SEEN_KEY] = E[0].v;
ok('nothing is new once the newest has been seen', C.unseen().length === 0 && !C.shouldShow());
gm[C.SEEN_KEY] = '99.0.0';
ok('a browser ahead of this build (a downgrade) sees nothing new', C.unseen().length === 0);
delete gm[C.SEEN_KEY];
global.JITA_IS_FORGE_FRAME = true;
ok('never inside the Zendesk frame', !C.shouldShow());
global.JITA_IS_FORGE_FRAME = false;
ok('dates read the way the rest of JiTA shows them', C._date('2026-09-29') === '29 Sep 2026' && C._date('2023-05-10') === '10 May 2023' && C._date('2026-09-05') === '05 Sep 2026', C._date('2026-09-29') + ' / ' + C._date('2023-05-10') + ' / ' + C._date('2026-09-05'));

// ---- the pill ----
stacked = 0;
C.mount();
let el = byId[C.PILL_ID];
ok('an unseen update puts the pill up', !!el && el.parentNode === body);
ok('...saying what is new', !!el && el.children[0].textContent === '📝 What\'s new in v' + E[0].v, el && el.children[0].textContent);
ok('...and restacks the corner', stacked === 1, String(stacked));
C.mount();
ok('mounting again does not add a second pill', body.children.filter((c) => c.id === C.PILL_ID).length === 1);
const x = el.children[1];
let stopped = false;
x.listeners.click[0]({ stopPropagation: () => { stopped = true; } });
ok('its x dismisses the update', gm[C.SEEN_KEY] === E[0].v, String(gm[C.SEEN_KEY]));
ok('...takes the pill away', !byId[C.PILL_ID]);
ok('...without also opening the list behind it', stopped);
C.mount();
ok('a dismissed update does not come back', !byId[C.PILL_ID]);

delete gm[C.SEEN_KEY];
C.mount();
el = byId[C.PILL_ID];
let opened = 0;
C.openView = () => { opened++; C.markSeen(); };
el.listeners.click[0]();
ok('clicking the pill opens the list', opened === 1);
ok('...which counts as seen, so the pill is gone', !byId[C.PILL_ID] && gm[C.SEEN_KEY] === E[0].v);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'changelog checks passed.'));
process.exit(fail ? 1 : 0);
