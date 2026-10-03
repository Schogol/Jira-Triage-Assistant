// mutate-logsig.js - breaks each guard that keeps a parsed log's defect badges current (v3.38.12) and requires
// logsig-check to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'logsig-check.js';
const muts = [
    [H, 'a re-match keeps the old badges', '            for (var k = 0; k < links.length; k++) { links[k].parentNode.removeChild(links[k]); }\n', ''],
    [H, 'a re-match keeps the old highlight', "            r.classList.remove('sig-hit', 'sig-hit-loose');\n", ''],
    [H, 'a re-match keeps the old tooltip', "            if (cell && /^(Known exception|Possibly related \\(same crash site\\)) · /.test(cell.title || '')) { cell.removeAttribute('title'); }\n", ''],
    [H, 'a re-match clears any tooltip', "            if (cell && /^(Known exception|Possibly related \\(same crash site\\)) · /.test(cell.title || '')) { cell.removeAttribute('title'); }",
        "            if (cell) { cell.removeAttribute('title'); }"],
    [H, 'the badge is not classed', "                    a.className = 'jita-sig-link';\n", ''],
    [H, 'the cell is rebuilt for the badge', '                    cell.insertBefore(a, cell.firstChild);', '                    cell.textContent = a.textContent + cell.textContent;']
];
let allRed = true;
muts.forEach(([h, name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR ' + (src.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
    fs.writeFileSync('mutb.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node ' + h, { env: Object.assign({}, process.env, { JITA_SRC: 'mutb.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + h.replace('-check.js', '') + '  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
        (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
});
if (fs.existsSync('mutb.js')) { fs.unlinkSync('mutb.js'); }
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
