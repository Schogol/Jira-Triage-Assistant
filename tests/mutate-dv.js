const fs = require('fs');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8');
const muts = [
  ['crumb row by any reach', 'CRUMB_REACH: 60,', 'CRUMB_REACH: 0,'],
  ['placing from an empty box', 'if (!h.isConnected || r.width < 1 || r.height < 1) { return; }', '/* mutated */'],
  ['no skeleton stand-in', 'if (!host && D._mounted) { host = D._standIn(); }', '/* mutated */'],
  ['fixed z-index again', 'return Math.max(0, z);', 'return 99;'],
  ['quote-blind ORDER BY split', "if (c === '\"' || c === \"'\") { q = c; continue; }", '/* mutated */'],
  ['host not sticky', 'if (h && h.isConnected && (!bc || h.contains(bc))) { return h; }', '/* mutated */'],
  ['stale page answers accepted', "var p = D._post('/rest/api/3/search/jql', body).then(function (d) {\n            if (gen !== D._gen) { return; }", "var p = D._post('/rest/api/3/search/jql', body).then(function (d) {\n            if (false) { return; }"],
  ['URL pulls the highlight back mid-step', "if (D._stepTimer) { return; }   // mid-step", "if (false) { return; }   // mid-step"],
  ['no in-flight guard', 'if (D._loading) { return D._loading; }', '/* mutated */'],
  ['no router fallback', 'location.assign(path);   // the router ignored us: an ordinary page load it is', '/* mutated */'],
  ['arrows steal from inputs', "if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) { return false; }", '/* mutated */']
];
const { execSync } = require('child_process');
let allRed = true;
muts.forEach(([name, a, b]) => {
  const norm = src.replace(/\r\n/g, '\n');
  if (norm.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
  fs.writeFileSync('mut.js', norm.replace(a, b));
  let out = '', crashed = false;
  try { out = execSync('node dv-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mut.js' }), encoding: 'utf8' }); }
  catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
  const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
  const red = crashed || /^RED/m.test(out) || /harness crashed/.test(out);
  if (!red) { allRed = false; }
  console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing)' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '') : ''));
});
fs.unlinkSync('mut.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
