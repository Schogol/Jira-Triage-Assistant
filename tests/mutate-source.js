// mutate-source.js - breaks tests/source.js one rule at a time, in a copy (mutso.js), and requires source-check.js to go
// red: a string, template, comment or regex read as code, a piece ending a line too early or too late, its comma or
// comment handled wrong, a name found twice or one level too deep, a cached piece from another text. A crashed
// harness counts as red.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const tool = fs.readFileSync(path.join(__dirname, 'source.js'), 'utf8').replace(/\r\n/g, '\n');
const H = 'source-check.js', COPY = 'mutso.js';
const muts = [
    ['a string run on with backslashes is read as code', "const inside = /\\\\$/.test(lines[i - 1]) || st.tpl || st.cmt;", 'const inside = st.tpl || st.cmt;'],
    ['a template string is read as code', "const inside = /\\\\$/.test(lines[i - 1]) || st.tpl || st.cmt;", "const inside = /\\\\$/.test(lines[i - 1]) || st.cmt;"],
    ['a block comment is read as code', "const inside = /\\\\$/.test(lines[i - 1]) || st.tpl || st.cmt;", "const inside = /\\\\$/.test(lines[i - 1]) || st.tpl;"],
    ['a template string never closes', "if (tpl) { if (ch === '`') { tpl = false; prev = '`'; } continue; }", 'if (tpl) { continue; }'],
    ['a block comment never closes', "if (cmt) { if (ch === '*' && line[i + 1] === '/') { cmt = false; i++; } continue; }", 'if (cmt) { continue; }'],
    ['a regex is read as code', "if (ch === '/' && (prev === '' || '(,=:[!&|?{};+'.indexOf(prev) >= 0)) { q = '/'; cls = false; continue; }", ''],
    ['a regex\'s brackets are not read as such', "if (q === '/' && ch === '[') { cls = true; } else if (q === '/' && ch === ']') { cls = false; } else if (ch === q && !cls)", 'if (ch === q)'],
    ['a quoted string is read as code', "if (ch === '\\'' || ch === '\"') { q = ch; continue; }", ''],
    ['an escape is read as the character', "if (ch === '\\\\') { i++; continue; }", ''],
    ['a line comment is read as code', "if (ch === '/' && line[i + 1] === '/') { break; }", ''],
    ['a closing line is left out of its piece', 'end = /^[}\\])]/.test(lines[i].slice(base)) ? i : i - 1;', 'end = i - 1;'],
    ['the next line always joins the piece', 'end = /^[}\\])]/.test(lines[i].slice(base)) ? i : i - 1;', 'end = i;'],
    ['deeper lines end a piece', 'if (!inside && lines[i].trim() && indentOf(lines[i]) <= base) {', 'if (!inside && lines[i].trim()) {'],
    ['a blank line ends a piece', 'if (!inside && lines[i].trim() && indentOf(lines[i]) <= base) {', 'if (!inside && indentOf(lines[i]) <= base) {'],
    ['a piece reaching the end of the text is cut short', 'if (end < 0) { end = lines.length - 1; }', 'if (end < 0) { end = 0; }'],
    ['blank lines after a piece are kept', 'while (end > 0 && !lines[end].trim()) { end--; }', ''],
    ['a member keeps its comma', ".replace(/,(\\s*\\/\\/.*)?$/, '$1')", ''],
    ['a comma before a comment that runs on is kept', 'while (k > 0 && /^\\s*\\/\\//.test(lines[k])) { k--; }', ''],
    ['a member loses its comment with its comma', ".replace(/,(\\s*\\/\\/.*)?$/, '$1')", ".replace(/,(\\s*\\/\\/.*)?$/, '')"],
    ['members are joined with a comma at the end of a line', ".join('\\n,\\n')", ".join(',\\n')"],
    ['a name found twice is taken', 'if (found.length !== 1) {', 'if (!found.length) {'],
    ['a name every object has is taken for one', 'Object.prototype.hasOwnProperty.call(at, name) ? at[name] : []', 'at[name] || []'],
    ['a member is looked for at any depth', '/^    ([\\w$]+): /gm', '/^ +([\\w$]+): /gm'],
    ['a name is taken as a pattern', "const esc = (s) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');", 'const esc = (s) => s;'],
    ['a function is looked for only at the margin', 'const FN = /^ *function ([\\w$]+) ?\\(/gm', 'const FN = /^function ([\\w$]+) ?\\(/gm'],
    ['a function inside another piece is looked for in the whole script', 'const at = within === undefined ? (k.fns || (k.fns = names(src, FN))) : names(within, FN);', 'const at = k.fns || (k.fns = names(src, FN));'],
    ['a function inside another piece is cut from the whole script', 'const text = within === undefined ? src : within;', 'const text = src;'],
    ['a piece of another text is handed out', 'if (seen.src !== src) {', 'if (seen.src === null) {'],
    ['one object\'s members are looked for in another', 'const at = known.mems[obj] || (known.mems[obj] = names(body, ', 'const at = known.mems._ || (known.mems._ = names(body, '],
    ['the script is read with its CRLF line ends', ".replace(/\\r\\n/g, '\\n');\n}", ';\n}'],
    ['JITA_SRC is passed over', "fs.readFileSync(process.env.JITA_SRC || path.join(__dirname, '..', 'JiTA.user.js'), 'utf8')", "fs.readFileSync(path.join(__dirname, '..', 'JiTA.user.js'), 'utf8')"]
];
let allRed = true;
try {
    muts.forEach(([name, a, b]) => {
        if (tool.split(a).length !== 2) { console.log('ANCHOR ' + (tool.split(a).length - 1) + 'x: ' + name); allRed = false; return; }
        fs.writeFileSync(path.join(__dirname, COPY), tool.replace(a, () => b));
        let out = '', crashed = false;
        try { out = execFileSync(process.execPath, [H], { cwd: __dirname, env: Object.assign({}, process.env, { JITA_SOURCE: COPY }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
        catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
        const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
        const red = crashed || fails.length > 0 || /FAILURE/.test(out);
        if (!red) { allRed = false; }
        console.log((red ? 'RED   ' : 'GREEN ') + 'source  ' + name + '  (' + fails.length + (crashed ? ', crashed' : '') + ')' +
            (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 90) : ''));
    });
} finally {
    if (fs.existsSync(path.join(__dirname, COPY))) { fs.unlinkSync(path.join(__dirname, COPY)); }
}
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
