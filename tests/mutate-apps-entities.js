// mutate-apps-entities.js - breaks each guard of the VMS entity decoder (v3.33.1: JiTA.leadduty.apps._entities)
// in turn and requires apps-check.js to go red. A crashed harness counts as red.
const fs = require('fs');
const { execSync } = require('child_process');
const src = fs.readFileSync((process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js')), 'utf8').replace(/\r\n/g, '\n');
const muts = [
    ['entities never decoded', 'return JiTA.leadduty.apps._entities(s)', 'return s'],
    ['decoded before tags are stripped', "            .replace(/<[^>]*>/g, '');\n        // Entities only AFTER", "            ;\n        s = JiTA.leadduty.apps._entities(s).replace(/<[^>]*>/g, '');\n        // Entities only AFTER"],
    ['hex read as decimal', "var hex = body.charAt(1) === 'x' || body.charAt(1) === 'X';", 'var hex = false;'],
    ['upper-case hex missed', "var hex = body.charAt(1) === 'x' || body.charAt(1) === 'X';", "var hex = body.charAt(1) === 'x';"],
    ['no range guard', 'if (!(n > 0) || n > 0x10FFFF || (n >= 0xD800 && n <= 0xDFFF)) { return m; }', 'if (!(n > 0)) { return m; }'],
    ['lone surrogates decoded', ' || (n >= 0xD800 && n <= 0xDFFF)) { return m; }', ') { return m; }'],
    ['nbsp kept as U+00A0', "return n === 0xA0 ? ' ' : String.fromCodePoint(n);", 'return String.fromCodePoint(n);'],
    ['BMP only', "return n === 0xA0 ? ' ' : String.fromCodePoint(n);", "return n === 0xA0 ? ' ' : String.fromCharCode(n);"],
    ['named lookup case-sensitive', 'var named = A._ENT[body.toLowerCase()];', 'var named = A._ENT[body];'],
    ['unknown name dropped', 'return named != null ? named : A._named(m);', "return named != null ? named : '';"],
    ['browser never asked', 'return named != null ? named : A._named(m);', 'return named != null ? named : m;'],
    ['no browser: throws', '        } catch (e) { return m; }\n    },\n', '        } catch (e) { throw e; }\n    },\n'],
    // The note composer's starting visibility (v3.37.0: Public, the widest), which apps-check also covers.
    ['notes start on Volunteers again', "NOTE_DEFAULT_STATE: 'Public',", "NOTE_DEFAULT_STATE: 'Volunteers',"],
    ['without Public, the narrowest level is picked', 'return list.length ? list[list.length - 1] : A.NOTE_DEFAULT_STATE;', 'return list.length ? list[0] : A.NOTE_DEFAULT_STATE;'],
    ['an empty list yields nothing', 'return list.length ? list[list.length - 1] : A.NOTE_DEFAULT_STATE;', 'return list[list.length - 1];']
];
let allRed = true;
muts.forEach(([name, a, b]) => {
    if (src.split(a).length !== 2) { console.log('ANCHOR MISSING: ' + name); allRed = false; return; }
    fs.writeFileSync('mutt.js', src.replace(a, () => b));
    let out = '', crashed = false;
    try { out = execSync('node apps-check.js', { env: Object.assign({}, process.env, { JITA_SRC: 'mutt.js' }), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout || ''; crashed = !/FAILURE|passed/.test(out); }
    const fails = out.split('\n').filter((l) => /^  FAIL  /.test(l));
    const red = crashed || fails.length > 0 || /FAILURE/.test(out);
    if (!red) { allRed = false; }
    console.log((red ? 'RED   ' : 'GREEN ') + name + '  (' + fails.length + ' failing' + (crashed ? ', crashed' : '') + ')' + (fails[0] ? '  e.g.' + fails[0].replace(/^  FAIL /, '').slice(0, 110) : ''));
});
fs.unlinkSync('mutt.js');
console.log(allRed ? '\nevery mutation caught' : '\nSOME MUTATION SURVIVED');
