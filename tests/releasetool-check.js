// releasetool-check.js - tests/release.js, which makes a release's version and changelog changes. Run on copies of the
// real JiTA.user.js and CHANGELOG.md, what it writes has to pass changelog-check.js as it stands, every item has to read
// back through the script's own parser (JiTA.changelog.parse) exactly as it was typed, and nothing else in either file
// may change. Each way it refuses leaves both files as they were. JITA_RELEASE names another copy of the tool, as
// mutate-releasetool.js takes it; JITA_SRC and JITA_CHANGELOG name the files it starts from.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
// Today, for the tool and for this check, is today where it is furthest ahead (UTC+14), so the newest real entry,
// dated by its writer's own clock, is never after it. On CI (UTC) a release made just after midnight in Europe carried
// tomorrow's date until UTC midnight, and the tool refused to date a new entry before it ("dated today" failed).
process.env.TZ = 'Pacific/Kiritimati';
const TOOL = path.resolve(process.env.JITA_RELEASE || path.join(__dirname, 'release.js'));
const SRC1 = fs.readFileSync(process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'), 'utf8');
const MD1 = fs.readFileSync(process.env.JITA_CHANGELOG || path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
// The copies start at 7.8.9, whatever the real version: no digit 0, so a bump that forgets to start one at 0 shows.
const REAL = (/^\/\/ @version\s+(\S+)/m.exec(SRC1) || [])[1] || '';
const SRC0 = SRC1.replace(/^(\/\/ @version\s+)\S+/m, '$17.8.9').replace(/^(\/\/ @resource\s+changelog\s+\S+\?v=)\S+/m, '$17.8.9');
const MD0 = MD1.replace('\n## ' + REAL + ' (', '\n## 7.8.9 (');

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };

// The script's own parser, as JiTA reads the file.
const lf = SRC0.replace(/\r\n/g, '\n'), em = '\n    _noop: null\n};';
const cs = lf.indexOf('\nJiTA.changelog = {'), ce = lf.indexOf(em, cs);
if (cs < 0 || ce < 0) { throw new Error('could not slice JiTA.changelog'); }
const J = {};
new Function('JiTA', lf.slice(cs, ce + em.length))(J);
const parse = (t) => J.changelog.parse(t);

const ver = (s) => { const m = /^\/\/ @version\s+(\d+)\.(\d+)\.(\d+)\s*$/m.exec(s); return m ? [+m[1], +m[2], +m[3]] : null; };
const res = (s) => { const m = /^\/\/ @resource\s+changelog\s+\S+\?v=(\S+)\s*$/m.exec(s); return m ? m[1] : null; };
const cur = ver(SRC0);
if (!cur) { throw new Error('no @version in the script'); }
const CUR = cur.join('.');
const LATER = '2099-01-01';   // later than any entry, so a run never trips over the newest entry's date

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jita-release-'));
const T = require(TOOL);
let runs = 0;
// One run on fresh copies: returns the exit status, what it said, and the two files afterwards. The tool runs in this
// process (a node per run made this the slowest breakage suite); the command line itself is checked below, once.
function run(args, opts) {
    opts = opts || {};
    const dir = path.join(tmp, String(++runs));
    fs.mkdirSync(dir);
    const s = path.join(dir, 'JiTA.user.js'), m = path.join(dir, 'CHANGELOG.md');
    fs.writeFileSync(s, opts.src !== undefined ? opts.src : SRC0);
    fs.writeFileSync(m, opts.md !== undefined ? opts.md : MD0);
    let status = 0, said = '';
    try { said = T.release(args, { src: s, md: m }).join('\n') + '\n'; }
    catch (e) { status = 1; said = (e.refused ? 'release.js: ' : 'crashed: ') + e.message + '\n'; }
    return { status: status, out: said, stdout: status ? '' : said, src: fs.readFileSync(s, 'utf8'), md: fs.readFileSync(m, 'utf8'), s: s, m: m };
}
// The same, from the command line, as the tag workflow and a person run it.
function cli(args) {
    const dir = path.join(tmp, String(++runs));
    fs.mkdirSync(dir);
    const s = path.join(dir, 'JiTA.user.js'), m = path.join(dir, 'CHANGELOG.md');
    fs.writeFileSync(s, SRC0);
    fs.writeFileSync(m, MD0);
    const r = spawnSync(process.execPath, [TOOL].concat(args), { env: Object.assign({}, process.env, { JITA_SRC: s, JITA_CHANGELOG: m }), encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', src: fs.readFileSync(s, 'utf8'), md: fs.readFileSync(m, 'utf8') };
}
// changelog-check.js, as it stands, on what a run wrote.
function checkClean(r) {
    const c = spawnSync(process.execPath, [path.join(__dirname, 'changelog-check.js')], { env: Object.assign({}, process.env, { JITA_SRC: r.s, JITA_CHANGELOG: r.m }), encoding: 'utf8' });
    return { ok: c.status === 0, fails: (c.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).join(' | ') + (c.stderr || '').slice(0, 300) };
}
// The lines of a and b that differ, as [index, a line, b line].
function changed(a, b) {
    const x = a.split('\n'), y = b.split('\n'), out = [];
    for (let i = 0; i < Math.max(x.length, y.length); i++) { if (x[i] !== y[i]) { out.push([i, x[i], y[i]]); } }
    return out;
}
const top = (md) => parse(md).entries[0];
const L = (s) => s.replace(/\r\n/g, '\n');   // the content checks read past the line endings, which have checks of their own

// ---- a fix release ----
const TRICKY = 'Settings > About: *starred* _under_ `tick` [box] <b> #12 ~ | & a\\b, still readable';
let r = run(['patch', '--fix', TRICKY, '--fix', '- starts like a list', '--fix', '1. starts like a numbered one', '--fix', '2) and so does this', '--date', LATER]);
const P = [cur[0], cur[1], cur[2] + 1].join('.');
ok('patch raises the last digit', r.status === 0 && ver(r.src) && ver(r.src).join('.') === P, r.out);
ok('...and the changelog @resource asks for the same version', res(r.src) === P, String(res(r.src)));
const d1 = changed(SRC0, r.src);
ok('...changing no other line of the script', d1.length === 2 && /^\/\/ @version/.test(d1[0][2]) && /^\/\/ @resource/.test(d1[1][2]), JSON.stringify(d1.slice(0, 3)).slice(0, 300));
const at = MD0.indexOf('## ' + CUR + ' ('), i1 = r.md.indexOf('## ' + P + ' ('), i2 = r.md.indexOf('## ' + CUR + ' (');
ok('...and only adding its entry to the changelog, right above the newest one', at > 0 && i1 === at && i2 > i1 && r.md.slice(0, i1) + r.md.slice(i2) === MD0, i1 + ' / ' + at + ' / ' + i2);
let c = checkClean(r);
ok('what it wrote passes changelog-check as it is', c.ok, c.fails);
let e = top(r.md);
ok('the entry reads back as typed: version, date, and the items in their order', !!e && e.v === P && e.date === LATER && !e.features &&
    JSON.stringify(e.fixes) === JSON.stringify([TRICKY, '- starts like a list', '1. starts like a numbered one', '2) and so does this']), JSON.stringify(e));
ok('...with every Markdown character and list marker escaped in the file', L(r.md).indexOf('\n- Settings \\> About: \\*starred\\* \\_under\\_ \\`tick\\` \\[box\\] \\<b\\> \\#12 \\~ \\| \\& a\\\\b, still readable\n') >= 0 &&
    L(r.md).indexOf('\n- \\- starts like a list\n') >= 0 && L(r.md).indexOf('\n- 1\\. starts like a numbered one\n') >= 0 && L(r.md).indexOf('\n- 2\\) and so does this\n') >= 0,
    L(r.md).slice(i1, i1 + 400));
ok('...as a fix release: Fixed issues only', L(r.md.slice(i1, i2)).indexOf('## ' + P + ' (' + LATER + ')\n\n### Fixed issues\n\n- ') === 0 && r.md.slice(i1, i2).indexOf('### New features') < 0, JSON.stringify(r.md.slice(i1, i1 + 80)));
ok('it says what it did', /@version \S+ -> \S+/.test(r.stdout) && r.stdout.indexOf(P) >= 0 && /4 fixes/.test(r.stdout), r.stdout);

// ---- a feature release, a major one, a version given as it is ----
r = run(['minor', '--feature', 'A thing users can do.', '--fix', 'A thing that no longer breaks.', '--date', LATER]);
const MI = [cur[0], cur[1] + 1, 0].join('.');
e = top(r.md);
ok('minor raises the middle digit and starts the last at 0', r.status === 0 && ver(r.src).join('.') === MI && res(r.src) === MI, r.out);
ok('...New features first, then Fixed issues, each with its own items', !!e && e.v === MI && JSON.stringify(e.features) === '["A thing users can do."]' && JSON.stringify(e.fixes) === '["A thing that no longer breaks."]' &&
    L(r.md.slice(r.md.indexOf('## ' + MI + ' ('), r.md.indexOf('## ' + CUR + ' ('))) === '## ' + MI + ' (' + LATER + ')\n\n### New features\n\n- A thing users can do.\n\n### Fixed issues\n\n- A thing that no longer breaks.\n\n',
    JSON.stringify(r.md.slice(r.md.indexOf('## ' + MI + ' ('), r.md.indexOf('## ' + MI + ' (') + 160)));
c = checkClean(r);
ok('...and passes changelog-check', c.ok, c.fails);
r = run(['major', '--feature', 'Everything is new.', '--date', LATER]);
const MA = (cur[0] + 1) + '.0.0';
ok('major raises the first digit and starts the others at 0', r.status === 0 && ver(r.src).join('.') === MA && res(r.src) === MA && top(r.md).v === MA && !top(r.md).fixes, r.out);
const GIVEN = [cur[0], cur[1] + 3, 7].join('.');
r = run([GIVEN, '--feature', 'Given as it is.', '--date', LATER]);
ok('a version can be given as it is', r.status === 0 && ver(r.src).join('.') === GIVEN && top(r.md).v === GIVEN, r.out);

// ---- the date ----
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const before = today();
r = run(['patch', '--fix', 'Dated today.']);
const after = today();
ok('with no --date the entry is dated today', r.status === 0 && [before, after].indexOf(top(r.md).date) >= 0, r.out + ' ' + (top(r.md) && top(r.md).date));

// ---- line endings stay as they were ----
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
r = run(['patch', '--fix', 'On a Windows copy.', '--date', LATER], { src: crlf(SRC0), md: crlf(MD0) });
ok('a CRLF copy stays CRLF, both files', r.status === 0 && r.src.indexOf('\n') === r.src.indexOf('\r\n') + 1 && !/[^\r]\n/.test(r.src) && !/[^\r]\n/.test(r.md),
    r.out + ' ' + JSON.stringify(r.md.slice(0, 400).match(/[^\r]\n/)));
r = run(['patch', '--fix', 'On an LF copy.', '--date', LATER], { src: SRC0.replace(/\r\n/g, '\n'), md: MD0.replace(/\r\n/g, '\n') });
ok('an LF copy stays LF, both files', r.status === 0 && r.src.indexOf('\r') < 0 && r.md.indexOf('\r') < 0, r.out);

// ---- --dry and --current ----
r = run(['minor', '--feature', 'Only shown.', '--date', LATER, '--dry']);
ok('--dry shows the entry and writes nothing', r.status === 0 && r.src === SRC0 && r.md === MD0 && r.stdout.indexOf('## ' + MI + ' (' + LATER + ')') >= 0 && r.stdout.indexOf('- Only shown.') >= 0, r.out);
r = run(['--current']);
ok('--current prints the version and writes nothing', r.status === 0 && r.stdout.trim() === CUR && r.src === SRC0 && r.md === MD0, JSON.stringify(r.stdout));

// ---- the command line ----
let k = cli(['--current']);
ok('from the command line, --current prints just the version, as the tag workflow reads it', k.status === 0 && k.stdout === CUR + '\n' && k.stderr === '', JSON.stringify(k));
k = cli(['patch', '--fix', 'From the command line.', '--date', LATER]);
ok('...a release is written and said', k.status === 0 && ver(k.src).join('.') === P && top(k.md).fixes[0] === 'From the command line.' && /@version \S+ -> /.test(k.stdout), k.stdout + k.stderr);
k = cli(['patch', '--feature', 'x']);
ok('...and a refusal exits 1 with its reason, writing nothing', k.status === 1 && /^release\.js: a release with a new feature/.test(k.stderr) && k.src === SRC0 && k.md === MD0, k.status + ' ' + k.stderr);

// ---- what it refuses, leaving both files as they were ----
const DASH = String.fromCharCode(0x2014);
const refusals = [
    ['no way up given', ['--fix', 'x']],
    ['a word it does not know', ['sideways', '--fix', 'x']],
    ['the same version', [CUR, '--fix', 'x']],
    ['a lower version', [cur[2] > 0 ? [cur[0], cur[1], cur[2] - 1].join('.') : '0.0.1', '--fix', 'x']],
    ['a feature in a patch', ['patch', '--feature', 'x']],
    ['a feature in a version given with the same middle digit', [[cur[0], cur[1], cur[2] + 5].join('.'), '--feature', 'x']],
    ['no items', ['patch']],
    ['an empty item', ['patch', '--fix', '']],
    ['an item of spaces', ['patch', '--fix', '   ']],
    ['an item on two lines', ['patch', '--fix', 'one\ntwo']],
    ['an item with a space at an end', ['patch', '--fix', 'trailing ']],
    ['an em dash', ['patch', '--fix', 'a ' + DASH + ' b']],
    ['an en dash', ['patch', '--fix', 'a ' + String.fromCharCode(0x2013) + ' b']],
    ['an item over 240 characters', ['patch', '--fix', 'x'.repeat(241)]],
    ['a date that is no date', ['patch', '--fix', 'x', '--date', '2099-02-30']],
    ['a date in another form', ['patch', '--fix', 'x', '--date', '01.01.2099']],
    ['a date before the newest entry', ['patch', '--fix', 'x', '--date', '2001-01-01']],
    ['an argument it does not know', ['patch', '--fix', 'x', '--fast']],
    ['--fix with nothing after it', ['patch', '--fix']]
];
refusals.forEach(([what, args]) => {
    const q = run(args);
    ok('refuses ' + what + ', saying why, and writes nothing', q.status !== 0 && /^release\.js: /m.test(q.out) && q.src === SRC0 && q.md === MD0, q.status + ' ' + q.out.slice(0, 200));
});
const atMax = run(['patch', '--fix', 'y'.repeat(240), '--date', LATER]);
ok('...but takes an item of exactly 240 characters', atMax.status === 0 && top(atMax.md).fixes[0].length === 240, atMax.out);
const ahead = run(['patch', '--fix', 'x'], { md: MD0.replace(/^## \d+(?:\.\d+)+ /m, '## 99.0.0 ') });
ok('refuses when CHANGELOG.md does not start at the script\'s version', ahead.status !== 0 && /make them agree/.test(ahead.out) && ahead.src === SRC0, ahead.out);
const noRes = run(['patch', '--fix', 'x', '--date', LATER], { src: SRC0.replace(/^\/\/ @resource[^\n]*\n/m, '') });
ok('refuses a script with no changelog @resource line, writing neither file', noRes.status !== 0 && /@resource/.test(noRes.out) && noRes.md === MD0, noRes.out);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'release tool checks passed.'));
process.exit(fail ? 1 : 0);
