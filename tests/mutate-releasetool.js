// mutate-releasetool.js - breaks tests/release.js one rule at a time, in a copy (mutrt.js), and requires
// releasetool-check.js to go red: an escape left out, a version raised the wrong way, a refusal dropped, the line endings
// or the entry's place lost, --dry writing after all. A crashed harness counts as red.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const tool = fs.readFileSync(path.join(__dirname, 'release.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'releasetool-check.js', COPY = 'mutrt.js';
const muts = [
    ['an ampersand is not escaped', "const ACTIVE = '\\\\`*_[]<>#~|&';", "const ACTIVE = '\\\\`*_[]<>#~|';"],
    ['a backslash is not escaped', "const ACTIVE = '\\\\`*_[]<>#~|&';", "const ACTIVE = '`*_[]<>#~|&';"],
    ['a leading dash or plus is not escaped', ".replace(/^[-+]/, (m) => '\\\\' + m)", ''],
    ['a leading number marker is not escaped', ".replace(/^(\\d+)([.)])/, (m, n, mark) => n + '\\\\' + mark)", ''],
    ['the @resource keeps its old ?v=', '.replace(RESOURCES_RE, (m, head) => head + v)', ''],
    ['only the changelog @resource gets the new ?v=', '.replace(RESOURCES_RE, (m, head) => head + v)', '.replace(RESOURCE_RE, (m, head) => head + v)'],
    ['patch raises the middle digit', "if (bump === 'patch') { next = [cur[0], cur[1], cur[2] + 1]; }", "if (bump === 'patch') { next = [cur[0], cur[1] + 1, cur[2]]; }"],
    ['minor keeps the last digit', "else if (bump === 'minor') { next = [cur[0], cur[1] + 1, 0]; }", "else if (bump === 'minor') { next = [cur[0], cur[1] + 1, cur[2]]; }"],
    ['major keeps the middle digit', "else if (bump === 'major') { next = [cur[0] + 1, 0, 0]; }", "else if (bump === 'major') { next = [cur[0] + 1, cur[1], 0]; }"],
    ['an unknown word counts as patch', "else { stop('say how the version goes up", "else { next = [cur[0], cur[1], cur[2] + 1]; } if (0) { stop('say how the version goes up"],
    ['the same version is taken', 'if (cmp(next, cur) <= 0) {', 'if (cmp(next, cur) < 0) {'],
    ['a feature in a patch is taken', 'if (features.length && next[0] === cur[0] && next[1] === cur[1]) {', 'if (false) {'],
    ['no items is taken', "if (!features.length && !fixes.length) { stop('a release needs at least one --feature or --fix item'); }", ''],
    ['an empty item is taken', "if (!t.trim()) { stop('an item is empty'); }", ''],
    ['an item on two lines is taken', 'if (/[\\r\\n]/.test(t)) {', 'if (/\\r/.test(t)) {'],
    ['a space at an end is taken', "if (t !== t.trim()) { stop('an item starts or ends with a space: ' + show); }", ''],
    ['a dash is taken', "if (t.split('').some((ch) => DASHES.indexOf(ch) >= 0)) {", 'if (false) {'],
    ['an item over 240 characters is taken', 'if (t.length > MAX) {', 'if (t.length > MAX + 1) {'],
    ['an item of exactly 240 characters is refused', 'if (t.length > MAX) {', 'if (t.length >= MAX) {'],
    ['a date that is no date is taken', 'if (!realDate(date)) {', 'if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {'],
    ['a date before the newest entry is taken', "if (date < top[2]) {", 'if (false) {'],
    ['a changelog behind or ahead of the script is taken', "if (top[1] !== cur.join('.')) {", 'if (false) {'],
    ['an unknown argument is passed over', "            stop('unknown argument: ' + a);\n", ''],
    ['--fix with nothing after it takes nothing', "if (i + 1 >= argv.length) { stop(a + ' needs the text of the item after it'); }", ''],
    ['a script with no @resource is written anyway', "if (!RESOURCE_RE.test(src)) { stop(path.basename(SRC) + ' has no \"// @resource changelog ...?v=\" line'); }", ''],
    ['the entry goes at the end of the file', 'const mdOut = md.slice(0, top.index) + entry + md.slice(top.index);', 'const mdOut = md + entry;'],
    ['the fixes come before the features',
        "if (features.length) { lines.push('### New features', ''); features.forEach((t) => lines.push('- ' + escape(t))); lines.push(''); }\n    if (fixes.length) { lines.push('### Fixed issues', ''); fixes.forEach((t) => lines.push('- ' + escape(t))); lines.push(''); }",
        "if (fixes.length) { lines.push('### Fixed issues', ''); fixes.forEach((t) => lines.push('- ' + escape(t))); lines.push(''); }\n    if (features.length) { lines.push('### New features', ''); features.forEach((t) => lines.push('- ' + escape(t))); lines.push(''); }"],
    ['a CRLF changelog gets LF lines', "const eol = md.indexOf('\\r\\n') >= 0 ? '\\r\\n' : '\\n';", "const eol = '\\n';"],
    ['--dry writes after all', 'if (dry) {', 'if (dry && false) {'],
    ['no --date dates it a day off', "date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());", "date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate() > 27 ? d.getDate() - 1 : d.getDate() + 1);"],
    ['--current prints the next version', "if (current) { return [cur.join('.')]; }", "if (current) { return [[cur[0], cur[1], cur[2] + 1].join('.')]; }"],
    ['the command line exits 0 on a refusal', '        process.exit(1);\n', '        process.exit(0);\n'],
    ['the command line prints nothing', '    said.forEach((l) => console.log(l));\n', ''],
    ['the command line writes the refusal to stdout', "        console.error('release.js: ' + e.message);", "        console.log('release.js: ' + e.message);"],
    ['a refusal is left unmarked', 'const e = new Error(msg); e.refused = true; throw e;', 'throw new Error(msg);']
];
let allRed = true;
try {
    muts.forEach(([name, a, b]) => {
        if (tool.split(a).length !== 2) { console.log('ANCHOR ' + (tool.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
        fs.writeFileSync(path.join(__dirname, COPY), tool.replace(a, () => b));
        let out = '', crashed = false;
        try { out = execFileSync(process.execPath, [H], { cwd: __dirname, env: Object.assign({}, process.env, { JITA_RELEASE: COPY }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
        catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
        const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
        const red = crashed || fails.length > 0 || /FAILURE/.test(out);
        if (!red) { allRed = false; }
        console.log((red ? 'RED   ' : 'GREEN ') + 'releasetool  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
            (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
    });
} finally {
    if (fs.existsSync(path.join(__dirname, COPY))) { fs.unlinkSync(path.join(__dirname, COPY)); }
}
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
