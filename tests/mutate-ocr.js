// mutate-ocr.js - breaks the screenshot-translation focus-lock opt-out and requires ocr-check to go red.
// A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'ocr-check.js';
const muts = [
    [H, 'the layer is not marked', "        L.setAttribute('data-no-focus-lock', 'true');\n", ''],
    [H, 'a look-alike attribute', "L.setAttribute('data-no-focus-lock', 'true');", "L.setAttribute('data-focus-lock', 'true');"],
    [H, 'the card goes straight onto the page', "        O._layer.appendChild(c);\n        O._card = c;", "        document.body.appendChild(c);\n        O._card = c;"],
    [H, 'only the hint is marked', "        L.setAttribute('data-no-focus-lock', 'true');\n", "        L.querySelector('.jita-ocr-hint').setAttribute('data-no-focus-lock', 'true');\n"]
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutt.js')) { fs.unlinkSync('mutt.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
