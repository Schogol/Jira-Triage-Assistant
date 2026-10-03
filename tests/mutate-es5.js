// mutate-es5.js - breaks the "page code is ES5" rule in a copy of the script and requires ci-static to go red: a let
// at the start of a statement, a const one, and a let in a for head, each put into the page code. Two controls must
// pass: the script as it is, and a let inside jitaWorkerBody (the module worker may use it). A control that fails
// fails the suite, since a red below would then prove nothing.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const TMP = 'mut.js';

// Page code: the first statement of jitaRunParserWhenLoaded. Worker code: the first line inside jitaWorkerBody.
const PAGE = '\nfunction jitaRunParserWhenLoaded(setFlag) {\n';
const WORKER = '\nfunction jitaWorkerBody(cfg) {\n';
const at = (anchor, line) => (t) => {
    if (t.split(anchor).length !== 2) { throw new Error('ANCHOR'); }
    return t.replace(anchor, () => anchor + line + '\n');
};
const cases = [
    ['a let at the start of a statement', at(PAGE, '    let jitaProbe = 1;')],
    ['a const at the start of a statement', at(PAGE, '    const jitaProbe = 1;')],
    ['a let in a for head', at(PAGE, '    for (let p = 0; p < 1; p++) { /* probe */ }')]
];
const controls = [
    ['the script as it is', (t) => t],
    ['a let inside jitaWorkerBody', at(WORKER, '    let jitaProbe = 1;')]
];

function run(text) {
    fs.writeFileSync(path.join(__dirname, TMP), text);
    let out = '';
    try { out = execFileSync(process.execPath, ['ci-static.js'], { cwd: __dirname, encoding: 'utf8', env: Object.assign({}, process.env, { JITA_SRC: TMP }) }); }
    catch (e) { out = e.stdout || ''; }
    return out.split('\n').filter((l) => /^  FAIL  the page code declares with var/.test(l));
}

let allRed = true;
try {
    controls.forEach(([name, f]) => {
        let text;
        try { text = f(src); } catch (e) { console.log('ANCHOR control: ' + name); allRed = false; return; }
        const fails = run(text);
        if (fails.length) { allRed = false; }
        console.log('CONTROL ' + (fails.length ? 'FAILED  ' : 'ok  ') + name + (fails.length ? ' fails the ES5 check' : ' passes the ES5 check'));
    });
    cases.forEach(([name, f]) => {
        let text;
        try { text = f(src); } catch (e) { console.log('ANCHOR ' + name); allRed = false; return; }
        const fails = run(text);
        if (!fails.length) { allRed = false; }
        console.log((fails.length ? 'RED   ' : 'GREEN ') + 'es5  ' + name + '  (' + fails.length + ')');
    });
} finally {
    if (fs.existsSync(path.join(__dirname, TMP))) { fs.unlinkSync(path.join(__dirname, TMP)); }
}
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
