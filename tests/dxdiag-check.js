// dxdiag-check.js - the dxdiag and PDM Quick Info (v3.38.18). Evals the real requirements / dxdiag block (from
// "var _MiB" to the dxdiag overlay markup) against sample files:
//  - WER entries are classified by event name: a RADAR_PRE_LEAK report or a hang of exefile.exe is not an EVE
//    client crash, a hang gets its own amber line, a BEX crash shows its exception code from P8
//  - a dxdiag without a WER section says the crash history is unknown instead of a green all-clear
//  - dotted (15.08.2023), ISO (2023-08-15) and dashed dates are read; the file's own dates settle D/M against M/D
//  - a PDM without an OS block "could not be evaluated" instead of failing the minimum requirements
const fs = require('fs');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const from = src.indexOf('\nvar _MiB = 1048576'), to = src.indexOf('\n// Floating Div for the dxdiag.txt file');
if (from < 0 || to < from) { throw new Error('could not slice the requirements / dxdiag block'); }
global.css = '';
let out = null;
global.$ = (sel) => ({ html: (h) => { if (sel === '#dxdiag') { out = h; } }, text: () => {} });
(0, eval)(src.slice(from + 1, to));

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const day = (d) => (d ? d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() : String(d));

// ---- WER classification ----
const kind = (name, p1) => dxWerKind({ name: name, p: { P1: p1 } });
ok('a client crash is an EVE crash (control)', kind('APPCRASH', 'exefile.exe') === 'eve' && kind('BEX64', 'exefile.exe') === 'eve');
ok('a memory-leak report for the client is not a crash', kind('RADAR_PRE_LEAK_64', 'exefile.exe') === null, kind('RADAR_PRE_LEAK_64', 'exefile.exe'));
ok('a hang of the client is a hang, not a crash', kind('AppHangB1', 'exefile.exe') === 'evehang', kind('AppHangB1', 'exefile.exe'));
ok('another program hanging is left out', kind('AppHangB1', 'chrome.exe') === null, kind('AppHangB1', 'chrome.exe'));
ok('another program crashing is an app crash (control)', kind('APPCRASH', 'chrome.exe') === 'app' && kind('CLR20r3', 'tool.exe') === 'app');
ok('blue screens and live kernel events are system crashes (control)', kind('BlueScreen', '124') === 'kernel' && kind('LiveKernelEvent', '141') === 'kernel');
ok('an update failure is left out', kind('WindowsUpdateFailure3', '10.0.26100') === null);

// ---- dates ----
ok('a dotted date is day.month.year', day(dxParseDate('15.08.2023 02:00:00')) === '2023-8-15', day(dxParseDate('15.08.2023 02:00:00')));
ok('an ISO date is read', day(dxParseDate('2023-08-15')) === '2023-8-15', day(dxParseDate('2023-08-15')));
ok('a dashed US date is read', day(dxParseDate('8-15-2023')) === '2023-8-15', day(dxParseDate('8-15-2023')));
ok('a US slash date is month/day (control)', day(dxParseDate('8/15/2023')) === '2023-8-15' && day(dxParseDate('3/8/2023')) === '2023-3-8');
ok('a slash date with a "month" over 12 is day/month (control)', day(dxParseDate('15/8/2023')) === '2023-8-15');
ok('a file written day/month reads an ambiguous date that way', day(dxParseDate('3/8/2023', 'dm')) === '2023-8-3', day(dxParseDate('3/8/2023', 'dm')));
ok('a date that does not exist is no date', dxParseDate('31.02.2023') === null && dxParseDate('Unknown') === null, day(dxParseDate('31.02.2023')));
ok('the order of the file\'s dates is found from any unambiguous one', dxDateOrder('Time of this report: 24/09/2025, 14:22:01\nDriver Date/Size: 3/8/2023 02:00:00, 1 bytes') === 'dm' &&
    dxDateOrder('Time of this report: 9/24/2025, 14:22:01') === 'md' && dxDateOrder('Driver Date/Size: 3/8/2023 02:00:00') === null);

// ---- a sample dxdiag ----
const SYS = [
    '------------------', 'System Information', '------------------',
    '      Time of this report: 24/09/2025, 14:22:01',
    '         Operating System: Windows 11 Pro 64-bit (10.0, Build 26100)',
    '                Processor: Intel(R) Core(TM) i9-13900K',
    '                   Memory: 32768MB RAM'].join('\n');
const GPU = (date) => ['---------------', 'Display Devices', '---------------',
    '           Card name: NVIDIA GeForce RTX 4080',
    '      Driver Version: 32.0.15.6094',
    '    Driver Date/Size: ' + date + ', 1234 bytes'].join('\n');
const WER = (entries) => 'Windows Error Reporting:\n' + entries.map((e, i) => ['+++ WER' + i + ' +++:', 'Fault bucket 0, type 0', 'Event Name: ' + e[0], 'Response: Not available', '',
    'Problem signature:'].concat(Object.keys(e[1]).map((k) => k + ': ' + e[1][k])).join('\n')).join('\n');
const sample = [SYS, GPU('3/8/2023 02:00:00'), WER([
    ['RADAR_PRE_LEAK_64', { P1: 'exefile.exe', P2: '20.0.0.0' }],
    ['AppHangB1', { P1: 'exefile.exe', P2: '20.0.0.0' }],
    ['BEX64', { P1: 'exefile.exe', P2: '1.0.0.0', P3: '00000000', P4: '_blue.dll', P5: '1.0', P6: '0', P7: '0000000000123456', P8: 'c0000409', P9: '0000000000000007' }],
    ['APPCRASH', { P1: 'chrome.exe', P4: 'chrome.dll', P7: 'c0000005' }]
])].join('\n\n');
renderDxdiag(sample);
ok('one client crash is counted, not the leak report and the hang as well', /1 EVE client crash \(exefile\.exe\)/.test(out), (out.match(/\d+ EVE client crash[^<]*/) || [''])[0]);
ok('...the BEX crash shows its exception code, not its offset', /STACK_BUFFER_OVERRUN in _blue\.dll/.test(out) && !/123456/.test(out), (out.match(/<td style="padding:0; color:#e6e6e6;">[^<]*/) || [''])[0]);
ok('...the hang has its own amber line', /#ffd479;[^>]*>&#9888; 1 EVE client hang \(exefile\.exe stopped responding\)/.test(out), out.slice(0, 200));
ok('...the other program\'s crash is counted on its own (control)', /\+ 1 other app crash in history/.test(out));
ok('...and the driver date is read the way the file writes its dates', /Aug 2023/.test(out), (out.match(/[A-Z][a-z]{2} \d{4}/) || [''])[0]);

renderDxdiag([SYS, GPU('15.08.2023 02:00:00')].join('\n\n'));
ok('a dxdiag without a WER section says the crash history is unknown', /WER section not found - crash history unknown/.test(out) && !/No EVE or system crashes/.test(out), out.slice(0, 160));
ok('...and a dotted driver date gets its date and the amber over-a-year warning', /#ffd479;">[^<]*Aug 2023/.test(out), (out.match(/drv [^<]*/) || [''])[0]);

renderDxdiag([SYS, WER([['APPCRASH', { P1: 'chrome.exe', P4: 'chrome.dll', P7: 'c0000005' }]])].join('\n\n'));
ok('a history with no EVE or system crash says so', /No EVE or system crashes in WER history/.test(out), out.slice(0, 160));
ok('...before the other programs\' crashes', out.indexOf('No EVE or system crashes') < out.indexOf('other app crash'));

renderDxdiag('nothing a dxdiag would contain');
ok('a file with nothing recognisable says it could not be read', /^Could not read dxdiag/.test(out), out.slice(0, 120));

// ---- PDM requirements ----
const GiB = 1073741824;
const MACHINE = { CPU: { VENDOR: 'GenuineIntel', LOGICAL_CORE_COUNT: '16', FREQUENCY_MHZ: '3600' }, TOTAL_MEMORY: String(32 * GiB), GPUS: { GPU: { NAME: 'RTX', VIDEO_MEMORY: String(8 * GiB) } } };
let r = evalRequirements({ DATA: { MACHINE: MACHINE } });
ok('a PDM without an OS block could not be evaluated', r.overall === 'na' && r.rows[0].tier === 'na' && /OS not found/.test(r.rows[0].detail), JSON.stringify(r.rows));
r = evalRequirements({ DATA: { OS: { TYPE: 'Linux' }, MACHINE: MACHINE } });
ok('...an OS EVE does not support still fails, and names it (control)', r.overall === 'fail' && r.rows[0].detail === 'Unsupported OS (Linux)', JSON.stringify(r.rows));
r = evalRequirements({ DATA: { OS: { TYPE: 'Windows', BUILD_NUMBER: '22631', GRAPHICS_APIS: { D3D_HIGHEST_SUPPORT: '12' } }, MACHINE: MACHINE } });
ok('...and a capable Windows PC meets the recommended requirements (control)', r.overall === 'rec', r.overall);

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'dxdiag / PDM checks passed.'));
process.exit(fail ? 1 : 0);
