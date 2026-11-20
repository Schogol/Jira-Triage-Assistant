// mutate-lint.js - writes each kind of mistake the lint rules are there for into a copy of the script (mutl.js), one at a
// time, and requires ci-static.js --only lint to go red: a name misspelt, a variable left behind unused, one declared
// twice, an object key written twice, code after a return, a typeof compared with a misspelt type.
//
// The unbroken script runs first: a red below proves nothing when the script fails anyway. With no ESLint to run (no npx
// or no network) the anchors are still checked and it says SKIP; CI sets JITA_LINT_REQUIRED=1, so the check fails there
// instead, and so does this.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const COPY = path.join(__dirname, 'mutl.js');
const muts = [
    ['a global name misspelt', "try { text = (typeof GM_getResourceText === 'function' && GM_getResourceText(C.RESOURCE)) || ''; }",
        "try { text = (typeof GM_getResourceText === 'function' && GM_getResourceTxt(C.RESOURCE)) || ''; }"],
    ['a counter left behind unused', '        var stored = 0, changed = 0;\n', '        var stored = 0, changed = 0, pages = 0;\n'],
    ['a variable declared twice', '        var stored = 0, changed = 0;\n', '        var stored = 0, changed = 0;\n        var stored = 0;\n'],
    ['an object key written twice', '    DATA_VERSION: 3,', '    DATA_VERSION: 3, DATA_VERSION: 4,'],
    ['code after a return', '        return !!rec && (has(rec.labels, JiTA.LEFT_OUT.labels) || has(rec.components, JiTA.LEFT_OUT.components));\n',
        '        return !!rec && (has(rec.labels, JiTA.LEFT_OUT.labels) || has(rec.components, JiTA.LEFT_OUT.components));\n        rec = null;\n'],
    ['a typeof compared with a misspelt type', "try { text = (typeof GM_getResourceText === 'function' &&", "try { text = (typeof GM_getResourceText === 'fucntion' &&"]
];
function check(text) {
    fs.writeFileSync(COPY, text);
    let out = '';
    try { out = execFileSync(process.execPath, ['ci-static.js', '--only', 'lint'], { cwd: __dirname, env: Object.assign({}, process.env, { JITA_SRC: COPY }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    return { out: out, fails: fails, detail: (out.split('\n').filter((l) => /^ {10}JiTA\.user\.js:\d+/.test(l))[0] || '').trim(), skip: (/^  SKIP  (.*)$/m.exec(out) || [])[1] };
}
let allRed = true;
try {
    const anchored = muts.filter(([name, a]) => {
        if (src.split(a).length === 2) { return true; }
        console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name);
        allRed = false;
        return false;
    });
    const control = check(src);
    if (control.skip) {
        console.log('SKIP  ' + control.skip + ': no breakage made' + (allRed ? ' (every anchor is there)' : ''));
        process.exitCode = allRed ? 0 : 1;
    } else if (control.fails.length) {
        console.log('CONTROL the unbroken script fails the lint rules, so no breakage would prove anything:\n' + control.out);
        allRed = false;
    } else {
        anchored.forEach(([name, a, b]) => {
            const r = check(src.replace(a, () => b));
            if (!r.fails.length) { allRed = false; }
            console.log((r.fails.length ? 'RED   ' : 'GREEN ') + 'lint  ' + name + '  (' + r.fails.length + ')' + (r.detail ? '  e.g. ' + r.detail.slice(0, 100) : ''));
        });
    }
} finally {
    if (fs.existsSync(COPY)) { fs.unlinkSync(COPY); }
}
if (process.exitCode === undefined) { console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED'); }
