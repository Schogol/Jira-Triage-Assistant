// cardfoot-check.js - the cards' footer (v3.47.0): one row of symbols (unicode text CSS colours, never emoji) and the date
// at its right, in place of the status line, the exception line and the Created line. Evals the real card helpers,
// JiTA.ui._row, the exception mark, the trend badge and the dates against a recording jQuery stand-in, and checks the
// stylesheets that put the footer at the bottom of the card in both themes.
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const once = (head, from) => {
    const s = src.indexOf(head, from || 0);
    if (s < 0 || src.indexOf(head, s + 1) >= 0 && !from) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return s;
};
const member = (head, from) => { const s = once(head, from); return src.slice(s, src.indexOf('\n    },', s) + 7); };
const line = (head, from) => { const s = once(head, from); return src.slice(s, src.indexOf('\n', s) + 1); };
const object = (head) => { const s = once(head); return src.slice(s, src.indexOf(' },\n', s) + 4); };   // a property over several lines, ending " },"

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// ---- a jQuery stand-in that records classes, attributes, text, children and handlers ----
function El(html) {
    const m = /class="([^"]*)"/.exec(html || ''), tag = (/^<(\w+)/.exec(html || '') || [])[1] || '';
    const e = { tag: tag, cls: m ? m[1].split(/\s+/).filter(Boolean) : [], txt: '', attrs: {}, kids: [], on: {}, parent: null };
    e.addClass = (c) => { String(c || '').split(/\s+/).filter(Boolean).forEach((x) => { if (e.cls.indexOf(x) < 0) { e.cls.push(x); } }); return e; };
    e.attr = (k, v) => { if (v === undefined) { return e.attrs[k]; } e.attrs[k] = v; return e; };
    e.text = (t) => { if (t === undefined) { return e.txt + e.kids.map((k) => k.text()).join(''); } e.txt = String(t); return e; };
    e.on = (ev, fn) => { e.on[ev] = fn; return e; };
    e.appendTo = (p) => { e.parent = p; p.kids.push(e); return e; };
    e.has = (c) => e.cls.indexOf(c) >= 0;
    return e;
}
global.$ = (h) => El(h);
const all = (e) => [e].concat(...e.kids.map(all));
const find = (e, c) => all(e).filter((k) => k.has(c));

// ---- the real code ----
let tips = [];
global.JiTA = { util: {}, ui: {}, profile: {}, logsig: {} };
Object.assign(JiTA.util, eval('({' + member('    isResolved: function (status, resolution) {') + member('    isClosedStatus: function (status) {') +
    src.slice(once('    fmtDate: function (iso) {'), src.indexOf('\n    }\n};', once('    fmtDate: function (iso) {'))) + '\n    }' + '})'));   // fmtDate and shortDate, the last members
const UI_AT = once('\nJiTA.ui = {');
Object.assign(JiTA.ui, eval('({' + line('    SYM: {') + line('    PROGRESS_RE: ') + member('    _mark: function (cls, glyph, title, count) {') + object('    STATUS_CAT: {') + member('    _statusCat: function (r) {') +
    member('    _meta: function (r) {') + member('    _foot: function (r, opts) {') + member('    _row: function (r, target, action, opts) {') + '})'));
JiTA.ui._showTip = (r, el, meta) => { tips.push(meta); };
JiTA.ui._hideTip = () => {};
const T_AT = once('\nJiTA.trend = {');
JiTA.trend = eval('({' + line('    WINDOW_DAYS: ', T_AT) + line('    BASE_DAYS: ', T_AT) + line('    MIN: ', T_AT) + line('    AFTER_FIX_MIN: ', T_AT) + line('    STALE_MS: ', T_AT) +
    line('    V: ', T_AT) + line('    LABEL: ', T_AT) + line('    usual: function (base) {', T_AT) + member('    countFor: function (key) {', T_AT) + member('    badge: function (key) {', T_AT) + '_data: null })');
const R_AT = once('\nJiTA.repexc = {');
JiTA.repexc = eval('({' + src.slice(once('    BADGE: {', R_AT), src.indexOf('\n    },', once('    BADGE: {', R_AT)) + 7) + member('    badge: function (kind, html, hits) {', R_AT) +
    member('    tip: function (kind, hits) {', R_AT) + '})');
const U = JiTA.ui, S = U.SYM, NOW = new Date('2026-11-01T12:00:00Z');

// ================= the dates =================
ok('a date this year reads "12 Jun"', JiTA.util.shortDate('2026-06-12T10:00:00.000+0000', NOW) === '12 Jun', JiTA.util.shortDate('2026-06-12T10:00:00.000+0000', NOW));
ok('...one before it "06 Mar 25"', JiTA.util.shortDate('2025-03-06T10:00:00.000+0000', NOW) === '06 Mar 25', JiTA.util.shortDate('2025-03-06T10:00:00.000+0000', NOW));
ok('...and none, or a broken one, nothing', ['', null, undefined, 'not a date'].every((x) => JiTA.util.shortDate(x, NOW) === ''));
const LATER = new Date('2031-05-01T12:00:00Z');
ok('"this year" is the one it is given: in 2031 a 2031 date drops its year, a 2026 one keeps it', JiTA.util.shortDate('2031-02-01T10:00:00.000+0000', LATER) === '01 Feb' &&
    JiTA.util.shortDate('2026-06-12T10:00:00.000+0000', LATER) === '12 Jun 26', JiTA.util.shortDate('2031-02-01T10:00:00.000+0000', LATER));
ok('no date is no longer 01 Jan 1970', JiTA.util.fmtDate(null) === '' && JiTA.util.fmtDate(undefined) === '' && JiTA.util.fmtDate('') === '' && JiTA.util.fmtDate(0) === '');
ok('...while a real one still reads in full (control)', JiTA.util.fmtDate('2025-03-06T10:00:00.000+0000') === '06 Mar 2025');

// ================= the status dot =================
const cat = (key, status, resolution) => U._statusCat({ key: key, status: status, resolution: resolution });
ok('a bug report reopened with its old resolution is open: green', cat('EBR-1', 'Open', 'Duplicate') === 'todo');
ok('...an attached or closed one done: red', cat('EBR-1', 'Attached', null) === 'done' && cat('EBR-1', 'Closed', 'Done') === 'done');
ok('...one being worked on yellow, an open one green', cat('EDR-1', 'In Progress', null) === 'prog' && cat('EDR-1', 'Ready for QA', null) === 'prog' && cat('EDR-1', 'Open', null) === 'todo');
const JIRA = { Attached: 'done', Closed: 'done', Rejected: 'done', 'In Porting': 'prog', 'In Progress': 'prog', 'In Test': 'prog', 'Live Testing': 'prog',
    'Ready for Deployment': 'prog', 'Ready for Review': 'prog', 'Ready for Test': 'prog', Blocked: 'todo', Open: 'todo', Refined: 'todo', Unrefined: 'todo' };
ok('every status Jira lists takes its own category: closed red, in progress yellow, open green', Object.keys(JIRA).every((s) => cat('EDR-1', s, null) === JIRA[s] && cat('EBR-1', s, null) === JIRA[s]),
    Object.keys(JIRA).filter((s) => cat('EDR-1', s, null) !== JIRA[s]).join(', '));
ok('...whatever resolution it kept: a reopened defect is open, one waiting for deployment in progress', cat('EDR-1', 'Open', 'Fixed') === 'todo' && cat('EDR-1', 'Ready for Deployment', 'Fixed') === 'prog' &&
    cat('EDR-1', 'Closed', 'Fixed') === 'done');
ok('...in any case, with spaces around it', cat('EDR-1', 'IN TEST', null) === 'prog' && cat('EDR-1', ' In Test ', null) === 'prog');
ok('a status Jira does not list goes by the older rules: a defect\'s resolution, a closed or a working word', cat('EDR-1', 'Waiting', 'Fixed') === 'done' && cat('EDR-1', 'Verifying', null) === 'prog' &&
    cat('EDR-1', 'Waiting', null) === 'todo' && cat('EBR-1', 'Waiting', 'Duplicate') === 'todo' && cat('EBR-1', 'Cancelled', null) === 'done' && cat('EDR-1', 'constructor', null) === 'todo');

// ================= the footer =================
const foot = (r, opts) => U._foot(r, opts);
const kinds = (f) => f.kids.map((k) => (k.has('jita-foot-st') ? 'status' : k.has('jita-foot-date') ? 'date' : k.has('jita-hot') ? 'hot' : k.cls.filter((c) => /^jita-mark-|^exact$|^site$/.test(c)).join('+')));
JiTA.trend._data = { v: JiTA.trend.V, at: Date.now(), defects: { 'EDR-9': { recent: [1, 2, 3, 4, 5, 6, 7, 8, 9] } } };
let f = foot({ key: 'EDR-9', status: 'Closed', resolution: 'Fixed', excHit: 'exact', staleNote: 'fixed 2y before report', created: '2025-03-06T10:00:00.000+0000' });
ok('the footer: the status, the exception match, trending, fixed long before, then the date', JSON.stringify(kinds(f)) === JSON.stringify(['status', 'exact', 'hot', 'jita-mark-stale', 'date']), JSON.stringify(kinds(f)));
const st = f.kids[0];
ok('a resolved defect shows its resolution by a red dot, the whole status in its hover', st.has('done') && find(st, 'jita-foot-dot')[0].text() === S.status &&
    find(st, 'jita-foot-lbl')[0].text() === 'Fixed' && st.attr('title') === 'Closed · Fixed', st.text() + ' / ' + st.attr('title'));
const dt = f.kids[f.kids.length - 1];
ok('...the date last, short, with the full date in its hover', dt.has('jita-foot-date') && /^\d\d \w{3}( \d\d)?$/.test(dt.text()) && dt.attr('title') === 'Created 06 Mar 2025', dt.text() + ' / ' + dt.attr('title'));
ok('every symbol says what it means in its hover', f.kids.every((k) => typeof k.attr('title') === 'string' && k.attr('title').length > 3), f.kids.map((k) => k.attr('title')).join(' | '));
ok('trending: ▲ and the count, saying how many reports', f.kids[2].text() === '▲9' && /^9 bug reports filed in the last 14 days/.test(f.kids[2].attr('title')), f.kids[2].text());
ok('fixed long before the report: ◷, saying how long, and that it ranks lower', f.kids[3].text() === '◷' && f.kids[3].attr('title') === 'Fixed 2y before report, so it ranks lower', f.kids[3].attr('title'));
const ex = foot({ key: 'EDR-1', status: 'Open', excHit: 'exact' }).kids[1], lo = foot({ key: 'EDR-1', status: 'Open', excHit: 'st-msg' }).kids[1];
ok('the same stack ≡, a looser match ≈: two symbols, two styles', ex.text() === '≡' && ex.has('exact') && lo.text() === '≈' && lo.has('site') && /^Same stacktrace message in log\n/.test(lo.attr('title')),
    ex.text() + ' ' + lo.text());
f = foot({ key: 'EDR-9', status: 'Open', trend: 'up', base: 6, afterFix: 2, created: '2026-10-01T10:00:00.000+0000' }, { score: '9 in 14d' });
ok('a trending row: no ▲ (its count says it), its trend and the reports filed after the fix', JSON.stringify(kinds(f)) === JSON.stringify(['status', 'jita-mark-up', 'jita-mark-warn', 'date']), JSON.stringify(kinds(f)));
ok('...the trend ↑ saying what is usual, the warning ⚠ as text with its count', f.kids[1].text() === '↑' && f.kids[1].attr('title') === 'Rising: usually about 3 per 14 days' &&
    f.kids[2].text() === '⚠\uFE0E2' && /^2 filed after this defect was resolved/.test(f.kids[2].attr('title')), f.kids[1].attr('title') + ' / ' + f.kids[2].text());
const tr = (t) => foot({ key: 'EDR-9', trend: t, base: 60 }, { score: '9 in 14d' }).kids[0];
ok('...steady →, falling ↓, new ★, each with its own words', tr('steady').text() === '→' && /^Steady: usually about 30/.test(tr('steady').attr('title')) && tr('down').text() === '↓' &&
    /^Falling/.test(tr('down').attr('title')) && tr('new').text() === '★' && tr('new').attr('title') === 'New: none in the 28 days before');
ok('...one report after the fix is no warning', !kinds(foot({ key: 'EDR-9', trend: 'up', base: 6, afterFix: 1 })).some((k) => k === 'jita-mark-warn'));
ok('no stale note, no ◷; no date, no date', JSON.stringify(kinds(foot({ key: 'EDR-1', status: 'Open' }))) === JSON.stringify(['status']));
ok('nothing to say: an empty footer, which the stylesheet hides', foot({ key: 'EBR-1' }).kids.length === 0 && /\n\.jita-foot:empty \{ display: none; \}/.test(src));
ok('_foot binds nothing: the sidebar snapshot restores rows without their handlers', !/\.on\(/.test(member('    _foot: function (r, opts) {')));
const emoji = Object.keys(S).filter((k) => Array.from(S[k]).some((ch, i, a) => /\p{Emoji_Presentation}/u.test(ch) || (/\p{Emoji}/u.test(ch) && a[i + 1] !== '\uFE0E')));
ok('no symbol is an emoji: plain text CSS can colour, the one with an emoji form held to text', emoji.length === 0, emoji.join());
ok('...nor is the trending badge or the trending switch', JiTA.trend.badge('EDR-9').text() === '▲9' &&
    src.indexOf("tb.textContent = JiTA.ui.trendMode ? '← Back to similar defects' : JiTA.ui.SYM.hot + ' Trending defects';") >= 0);

// ================= the card =================
tips = [];
const li = U._row({ key: 'EDR-9', pct: 87, status: 'Open', resolution: null, summary: 'Game bag disappears', staleNote: 'fixed 2y before report', note: 'rising',
    excHit: 'exact', created: '2026-06-12T10:00:00.000+0000' }, '_self', () => El('<span class="jita-sd-link">Attach</span>'));
const top = li.kids[0];
ok('a card is its top line, the summary and the footer, in that order', li.kids.length === 3 && top.has('jita-sd-top') && li.kids[1].has('jita-sd-sum') && li.kids[2].has('jita-foot'),
    li.kids.map((k) => k.cls.join('.')).join(' | '));
ok('...the top line holds the key, the % and the control', top.kids[0].tag === 'a' && top.kids[0].text() === 'EDR-9' && top.kids[1].has('jita-sd-score') && top.kids[1].text() === '87%' &&
    top.kids[2].has('jita-sd-link'), top.kids.map((k) => k.text()).join(' | '));
ok('...no status, exception or Created line any more', !all(li).some((k) => k.has('jita-sd-meta') || k.has('jita-sd-exc') || k.has('jita-sd-date')));
li.on.mouseenter.call({});
ok('the hover preview still gets the whole meta line', tips.length === 1 && tips[0] === 'Open · fixed 2y before report · rising', JSON.stringify(tips));
const tli = U._row({ key: 'EDR-9', count: 9, status: 'Open', trend: 'up', base: 6 }, '_self', () => El('<span></span>'), { score: '9 in 14d' });
ok('a trending row\'s top line shows its count, its footer no ▲', tli.kids[0].kids[1].text() === '9 in 14d' && !find(tli, 'jita-hot').length && find(tli, 'jita-mark-up').length === 1);
const rli = U._row({ key: 'EBR-5', status: 'Closed', closed: true, created: '2026-01-02T00:00:00.000+0000' }, '_self', () => El('<span></span>'), { noScore: true });
ok('a reporter-list row: no %, greyed when closed, the date in its footer', !find(rli, 'jita-sd-score').length && rli.has('jita-sd-closed') && find(rli, 'jita-foot-date').length === 1);
ok('_meta is the status, the resolution, the stale note and the trend note, the date left to the footer', U._meta({ status: 'Closed', resolution: 'Fixed', staleNote: 'fixed 2y before report',
    note: 'rising', created: '2026-01-02T00:00:00.000+0000' }) === 'Closed · Fixed · fixed 2y before report · rising', U._meta({ status: 'Closed', resolution: 'Fixed', staleNote: 'fixed 2y before report',
    note: 'rising', created: '2026-01-02T00:00:00.000+0000' }));

// ================= the stylesheets =================
const css = src.slice(once("    css: '\\\n#jita-sd-panel"), once('    injectCss: function () {'));
ok('a card is a flex column, its footer at the bottom by margin-top:auto', /\n#jita-sd-list li \{[^}]*display: flex; flex-direction: column; \}/.test(css) &&
    /\n\.jita-foot \{[^}]*margin-top: auto; padding-top: 4px;/.test(css) && /\n\.jita-foot-date \{[^}]*margin-left: auto;/.test(css));
ok('...its top line keeps its floats', /\n\.jita-sd-top \{ display: flow-root; \}/.test(css));
ok('no rule is left for the meta, exception or date lines', !/\.jita-sd-meta\b|\.jita-sd-exc\b|\.jita-sd-date\b/.test(css));
ok('the sidebar card keeps no strip and pins no date', /\n#jita-side-group #jita-sd-list li \{ padding: 7px 0; border-bottom:/.test(css) && !/position: relative; padding: 7px 0 22px/.test(css));
ok('...its symbols take Jira\'s colours', /#jita-side-group \.jita-mark-up, #jita-side-group \.jita-mark-new, #jita-side-group \.jita-mark-warn \{ color: var\(--ds-icon-warning/.test(css));
ok('the status dot is green while open, yellow in progress, red once closed', /\n\.jita-foot-st\.todo \.jita-foot-dot \{ color: #4caf7d; \}/.test(css) &&
    /\n\.jita-foot-st\.prog \.jita-foot-dot \{ color: #f5cd47; \}/.test(css) && /\n\.jita-foot-st\.done \.jita-foot-dot \{ color: #f87168; \}/.test(css));
ok('...in the sidebar in Jira\'s own green, yellow and red', /\n#jita-side-group \.jita-foot-st\.todo \.jita-foot-dot, [^{]*\{ color: var\(--ds-icon-success,/.test(css) &&
    /\n#jita-side-group \.jita-foot-st\.prog \.jita-foot-dot \{ color: var\(--ds-icon-accent-yellow,/.test(css) && /\n#jita-side-group \.jita-foot-st\.done \.jita-foot-dot \{ color: var\(--ds-icon-danger,/.test(css) &&
    !/\.jita-foot-st\.(todo|done) \.jita-foot-dot, #jita-side-group \.jita-mark\.site/.test(css));
ok('...and an Attach still checking is grey, not link blue', /\n#jita-side-group \.jita-sd-link\.jita-sd-linking \{ color: var\(--ds-text-subtlest/.test(css));

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'card footer checks passed.'));
process.exit(fail ? 1 : 0);
