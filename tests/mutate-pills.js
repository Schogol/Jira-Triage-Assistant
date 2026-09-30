const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
  ['pills back at 9000', 'var JITA_PILL_Z = 250;', 'var JITA_PILL_Z = 9000;'],
  ['in-flow menus count', "if (r.width > 0 && r.height > 0 && jitaFloats(found[i])) { layers.push(r); }", "if (r.width > 0 && r.height > 0) { layers.push(r); }"],
  ['own UI counts', "if (found[i].closest('[id^=\"jita\"], #gpanel, .jdv-pop, #jdv-bar, #jdv-col, #jdv-rail')) { continue; }   // our own UI", '/* mutated */'],
  ['any layer hides', 'hit = l.left < pr.right && l.right > pr.left && l.top < pr.bottom && l.bottom > pr.top;', 'hit = true;'],
  ['never comes back', "if (pills[i].style.visibility !== want) { pills[i].style.visibility = want; }", "if (hit) { pills[i].style.visibility = want; }"],
  ['no frame throttle', 'if (jitaPillCheck) { return; }', '/* mutated */'],
  // ---- stacking (v3.38.0) ----
  ['a missing pill is not skipped', "        if (!p) { continue; }\n        p.style.bottom", "        p.style.bottom"],
  ['a fixed step instead of the pill height', 'bottom += (p.offsetHeight || 26) + 14;', 'bottom += 40;'],
  ['the stack starts in the corner', 'var bottom = 16;', 'var bottom = 0;'],
  ['the stack in the wrong order', "var JITA_PILL_STACK = ['jita-credits-badge', 'jita-leadduty-chip', 'jita-changelog-pill'];", "var JITA_PILL_STACK = ['jita-leadduty-chip', 'jita-credits-badge', 'jita-changelog-pill'];"],
  ["the what's new pill does not step aside", "var JITA_PILL_IDS = ['jita-credits-badge', 'jita-leadduty-chip', 'jita-changelog-pill', 'jita-credits-progress'];", "var JITA_PILL_IDS = ['jita-credits-badge', 'jita-leadduty-chip', 'jita-credits-progress'];"]
];
let allRed = true;
muts.forEach(([name, a, b]) => {
  if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
  fs.writeFileSync('mutp.js', src.replace(a, b));
  let out = '', crashed = false;
  try { out = execSync('node pills-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutp.js' }), encoding: 'utf8' }); }
  catch (e) { out = e.stdout || ''; crashed = !/^(RED|GREEN)/m.test(out); }
  const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
  const red = crashed || /^RED/m.test(out);
  if (!red) { allRed = false; }
  console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing)');
});
fs.unlinkSync('mutp.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
