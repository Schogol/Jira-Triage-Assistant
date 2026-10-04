// profile-check.js - the defect profile (v3.41.0): what the bug reports attached to a defect have in common, and the
// reports that do not fit, in a Defect Profile card of its own. Evals the real JiTA.profile, the dxdiag / PDMData parsers, JiTA.logsig._logBlocks /
// _fingerprint and JiTA.ocr's language labels against stubs, with real zips built here (node zlib).
const fs = require('fs'), zlib = require('zlib');
const src = fs.readFileSync(process.env.JITA_SRC || require('path').join(__dirname, '..', 'JiTA.user.js'), 'utf8').replace(/\r\n/g, '\n');
const once = (head) => {
    const s = src.indexOf(head);
    if (s < 0 || src.indexOf(head, s + 1) >= 0) { throw new Error('could not slice ' + head.trim().slice(0, 60)); }
    return s;
};
const member = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n    },', s) + 7); };
const line = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n', s) + 1); };
const fn = (head) => { const s = once(head); return src.slice(s, src.indexOf('\n}\n', s) + 3); };
const block = (head, end) => { const s = once(head); return src.slice(s, src.indexOf(end, s) + end.length); };

let fail = 0;
const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '  -> ' + (x || ''))); if (!c) fail++; };
const flush = async () => { for (let i = 0; i < 20; i++) { await new Promise((r) => setImmediate(r)); } };

// ---- the real parsers, the real profile ----
let store = {}, meta = {}, metaSets = [];
global.gmGet = (k, d) => (k in store ? store[k] : d);
global.gmSet = (k, v) => { store[k] = v; };
const flags = {};
global.flagOn = (n) => flags[n] !== false;
(0, eval)([fn('function pdmGpus(machine) {'), fn('function pdmGpuName(gpu) {'), fn('function pdmBestGpu(machine) {'), fn('function convertTextToObject(text) {'),
    block('var DX_BUGCHECK = {', '\n};\n'), block('var DX_EXCEPTION = {', '\n};\n'), fn('function dxBugcheckName(hex) {'), fn('function dxExceptionName(hex) {'),
    fn('function parseWER(text) {'), line('var DX_APP_CRASH = '), fn('function dxWerKind(e) {'), fn('function dxCrashCode(e) {'), fn('function dxFirst(text, label) {'),
    fn('function dxParseDate(s, order) {'), fn('function dxDateOrder(text) {'), fn('function dxNvidiaDriver(ver) {'), fn('function dxGpus(text, order) {')
].join('\n') + '\nObject.assign(global, { pdmBestGpu, pdmGpuName, convertTextToObject, parseWER, dxWerKind, dxCrashCode, dxExceptionName, dxFirst, dxDateOrder, dxGpus });');
global.JiTA = { HOST: 'https://jira', util: {}, logsig: {}, ocr: {}, db: {}, sync: {}, ui: {}, menu: {}, triage: {} };
Object.assign(JiTA.util, eval('({' + member('    toPlainText: function (d) {') + member('    isResolved: function (status, resolution) {') + '})'));
JiTA.util.fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : '');
Object.assign(JiTA.logsig, eval('({' + line('    MIN_FRAMES: ') + line('    CRASH_FRAMES: ') + member('    _fingerprint: function (text) {') + member('    _logBlocks: function (text) {') + '})'));
Object.assign(JiTA.ocr, eval('({' + block('    LANGS: [', '\n    ],\n') + member('    _langFromLabels: function (labels) {') + '})'));
JiTA.db.getMeta = (k) => Promise.resolve(k in meta ? meta[k] : null);
JiTA.db.setMeta = (k, v) => { metaSets.push(k); meta[k] = v; return Promise.resolve(); };
eval(block('JiTA.profile = {', '\n    _noop: null\n};\n'));
const P = JiTA.profile;

// ---- a zip, built here: [{ name, data (Buffer), method 0 | 8, flags }] -> ArrayBuffer ----
function zip(entries) {
    const parts = [], central = [];
    let off = 0;
    entries.forEach((e) => {
        const nb = Buffer.from(e.name, 'utf8'), comp = e.method === 8 ? zlib.deflateRawSync(e.data) : e.data;
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.flags || 0, 6); lh.writeUInt16LE(e.method, 8);
        lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(nb.length, 26);
        parts.push(lh, nb, comp);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.flags || 0, 8); ch.writeUInt16LE(e.method, 10);
        ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
        central.push(ch, nb);
        off += 30 + nb.length + comp.length;
    });
    const cd = Buffer.concat(central), eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
    return Uint8Array.from(Buffer.concat(parts.concat([cd, eocd]))).buffer;
}
const utf16 = (s) => Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(s, 'utf16le')]);

// ---- sample files ----
const CI = 'Trinity platform: dx11\nProcess: x64\nOS: 10.0, build: 26100, \nVideo Card: NVIDIA GeForce RTX 3060 Ti (Driver: 32.0.16.1714, Released: 9-17-2026)\n' +
    'Is Optimus: No\nIs AMD Dynamic Switchable: No\nCPU: AMD64 Family 25 Model 33 Stepping 2, AuthenticAMD @ 3.40 GHz (16 CPUs)\nMemory: 32681 MB (5359 MB available)';
const ciWith = (o) => 'Trinity platform: ' + (o.platform || 'dx12') + ' Process: x64 OS: 10.0, build: ' + (o.build || 26100) + ', Video Card: ' + (o.gpu || 'AMD Radeon RX 7900 XT') +
    ' (Driver: 31.0.24033.1003, Released: 8-1-2026) Is Optimus: ' + (o.optimus || 'No') + ' Is AMD Dynamic Switchable: No CPU: ' + (o.cpu || 'AMD64 Family 25 Model 97 Stepping 2, AuthenticAMD') +
    ' @ 4.20 GHz (16 CPUs) Memory: 32681 MB (12000 MB available)';
const exBlock = (msg, frames) => ['EXCEPTION #1 logged at 10/03/2026 14:02:00', 'Formatted exception info: ' + msg, 'Caught at:']
    .concat(frames.map((f) => '/eve/client/script/' + f)).concat(['EXCEPTION END']).map((m) => '14:02:00\tGeneral\terror\t' + m).join('\n');
const LOG_A = '14:01:41\t::General\tnotice\tEVE Client version 24.01 build 3569502 started 10/03/2026 14:01:41\n' +
    exBlock('KeyError: 2', ['ui/foo.py(123) OnClick', 'ui/bar.py(45) Load']) + '\n14:02:01\tGeneral\tnotice\tsomething else\n' +
    exBlock('KeyError: 2', ['ui/foo.py(130) OnClick', 'ui/bar.py(46) Load']) + '\n' + exBlock('ValueError: bad', ['sys/baz.py(9) Run', 'sys/qux.py(10) Go']) + '\n' +
    exBlock('TypeError: lone frame', ['sys/one.py(1) Only']);
const DXDIAG = '------------------\nSystem Information\n------------------\n      Operating System: Windows 11 Pro 64-bit (10.0, Build 26100) (26100.ge_release.240331-1435)\n' +
    '---------------\nDisplay Devices\n---------------\n           Card name: NVIDIA GeForce RTX 3060 Ti\n        Driver Version: 32.0.15.6094\n' +
    '      Driver Date/Size: 9/17/2026 2:00:00 AM, 812736 bytes\n   Hybrid Graphics GPU: Not Supported\n' +
    'Windows Error Reporting:\n+++ WER0 +++:\nFault bucket 123, type 5\nEvent Name: APPCRASH\nResponse: Not available\nCab Id: 0\n\nProblem signature:\n' +
    'P1: exefile.exe\nP2: 24.1.0.3569502\nP3: 00000000\nP4: nvwgf2umx.dll\nP5: 32.0.15.6094\nP6: 00000000\nP7: c0000005\nP8: 0000000000abcdef\n' +
    '+++ WER1 +++:\nFault bucket 0, type 0\nEvent Name: BlueScreen\nResponse: Not available\nCab Id: 0\n\nProblem signature:\nP1: 124\nP2: 0\n';
// A Mac, as the client writes it (the PDMData trimmed to the fields read, with the client's tabs and no closing braces).
const MAC_CI = 'Trinity platform: metal\nProcess: x64\nOS: 26.6, build: 2, \nVideo Card: Apple M5 Pro (Driver: 0.0.0.0, Released: -)\nIs Optimus: -\n' +
    'Is AMD Dynamic Switchable: -\nCPU: Apple Family 0 Model 0 Stepping 0, Apple Family 0 Model 0 Stepping 0 @ 2.40 GHz (18 CPUs)\nMemory: 49152 MB (24576 MB available)';
const MAC_PDM = '{DATA}\n\t{PROCESS}\n\t\tTIMESTAMP : 2026-09-19 13:05:02\n\n\t{OS}\n\t\tTYPE             : macOS\n\t\tNAME             : Version 26.6.2 (Build 25G83)\n' +
    '\t\tMAJOR_VERSION    : 26\n\t\tBUILD_NUMBER     : 2\n\n\t\t{GRAPHICS_APIS}\n\t\t\tMETAL_SUPPORTED       : YES\n\n\t{MACHINE}\n\t\tTOTAL_MEMORY : 51539607552\n\n' +
    '\t\t{CPU}\n\t\t\tLOGICAL_CORE_COUNT: 18\n\t\t\tBRAND             : Apple M5 Pro\n\t\t\tVENDOR            : Apple\n\n\t\t{MONITORS}\n\t\t\t{MONITOR}\n' +
    '\t\t\t\tREFRESH_RATE       : 120\n\n\t\t{GPUS}\n\t\t\t{GPU}\n\t\t\t\tDESCRIPTION : Apple M5 Pro\n\t\t\t\tVIDEO_MEMORY: 0\n\n\t\t\t\t{DRIVER}\n\t\t\t\t\tDATE   : {EMPTY}\n';
const PDM = '{DATA}\n\t{OS}\n\t\tTYPE: Windows\n\t\tBUILD_NUMBER: 19045\n\t}\n\t{MACHINE}\n\t\tTOTAL_MEMORY: 17179869184\n\t\t{CPU}\n\t\t\tVENDOR: GenuineIntel\n' +
    '\t\t\tLOGICAL_CORE_COUNT: 12\n\t\t}\n\t\t{GPUS}\n\t\t\t{GPU}\n\t\t\t\tNAME: AMD Radeon RX 6700 XT\n\t\t\t\tVIDEO_MEMORY: 12884901888\n\t\t\t}\n\t\t}\n\t}\n}\n';

(async () => {
    // ================= Computer Info =================
    let hw = P.parseComputerInfo(CI);
    ok('the real sample: renderer, OS, GPU and driver', hw.platform === 'dx11' && hw.os === 'Windows 11' && hw.osBuild === 26100 && hw.gpu === 'NVIDIA GeForce RTX 3060 Ti' &&
        hw.gpuVendor === 'NVIDIA' && hw.driver === '32.0.16.1714' && hw.driverDate === '2026-09-17', JSON.stringify(hw));
    ok('...switchable graphics, CPU and memory', hw.hybrid === false && hw.cpuVendor === 'AMD' && hw.cpuGen === 'AMD Zen 3' && hw.threads === 16 && hw.ghz === 3.4 &&
        hw.ramGB === 32 && hw.freeGB === 5.2, JSON.stringify(hw));
    const flat = P.parseComputerInfo('Reproduction Steps: undock Computer Info: ' + CI.replace(/\n/g, ' '));
    ok('the same block flattened to one line, after other text, reads the same', JSON.stringify(flat) === JSON.stringify(hw), JSON.stringify(flat));
    hw = P.parseComputerInfo(ciWith({ gpu: 'Intel(R) UHD Graphics 770', optimus: 'Yes', cpu: 'Intel64 Family 6 Model 183 Stepping 1, GenuineIntel', build: 19045 }));
    ok('Optimus means switchable graphics; Windows 10 by build; Intel GPU', hw.hybrid === true && hw.os === 'Windows 10' && hw.gpuVendor === 'Intel', JSON.stringify(hw));
    ok('Family 6 Model 183 GenuineIntel is Raptor Lake', hw.cpuGen === 'Intel 13th/14th gen (Raptor Lake)', hw.cpuGen);
    ok('an Intel CPU the table does not name still counts, as "Intel (other)"', P._cpuGen('Intel64 Family 6 Model 165 Stepping 5, GenuineIntel') === 'Intel (other)');
    ok('AMD families: Zen 4 from model 96, Zen 5, Zen / Zen 2', P._cpuGen('AMD64 Family 25 Model 97, AuthenticAMD') === 'AMD Zen 4' &&
        P._cpuGen('AMD64 Family 26 Model 68, AuthenticAMD') === 'AMD Zen 5' && P._cpuGen('AMD64 Family 23 Model 113, AuthenticAMD') === 'AMD Zen / Zen 2');
    ok('a GPU without a driver part is read up to the next label', P.parseComputerInfo('Video Card: AMD Radeon RX 580 Is Optimus: No CPU: x').gpu === 'AMD Radeon RX 580');
    hw = P.parseComputerInfo(MAC_CI.replace(/\n/g, ' '));
    ok('a Mac: Metal, macOS by its major version, and its build is no Windows build', hw.platform === 'metal' && hw.os === 'macOS 26' && hw.osBuild === undefined, JSON.stringify(hw));
    ok('...the Apple GPU without the driver part, which names no driver', hw.gpu === 'Apple M5 Pro' && hw.gpuVendor === 'Apple' && hw.driver === undefined &&
        hw.driverDate === undefined, JSON.stringify(hw));
    ok('...no switchable graphics either way; an Apple CPU of the GPU\'s generation; memory', hw.hybrid === undefined && hw.cpuVendor === 'Apple' && hw.cpuGen === 'Apple M5' &&
        hw.threads === 18 && hw.ghz === 2.4 && hw.ramGB === 48 && hw.freeGB === 24, JSON.stringify(hw));
    ok('a PC whose driver part has no date keeps its driver', P.parseComputerInfo('Video Card: AMD Radeon RX 580 (Driver: 31.0.1, Released: -) Is Optimus: No').driver === '31.0.1');
    ok('no Computer Info, no hardware', P.parseComputerInfo('The undock button does nothing.') === null);
    ok('a description without the block lets another field that has it speak', P.parseComputerInfo(P._issueText({ description: 'plain', customfield_1: CI })).gpu === 'NVIDIA GeForce RTX 3060 Ti');

    // ================= logs =================
    const b = P.parseBuild(LOG_A);
    ok('the client build from a log\'s first lines', b && b.version === '24.01' && b.build === 3569502, JSON.stringify(b));
    ok('...none in a log without it', P.parseBuild('14:00:00\tGeneral\tnotice\thello') === null);
    const ex = P.logExceptions(LOG_A);
    ok('a log\'s exceptions are fingerprinted; the same one twice (other line numbers) counts once', ex.length === 2 && /keyerror: 2/.test(ex[0].sig) && ex[0].msg === 'KeyError: 2', JSON.stringify(ex));
    ok('...and a block with too few stack frames does not count', !ex.some((e) => /lone frame/i.test(e.msg)));

    // ================= the zip =================
    const zbuf = zip([{ name: 'igbr/DxDiag.txt', data: utf16(DXDIAG), method: 8 }, { name: 'PDMData.txt', data: Buffer.from(PDM), method: 0 },
        { name: 'secret/logs.txt', data: Buffer.from('x'), method: 8, flags: 1 }, { name: 'prefs.ini', data: Buffer.from('a=b'), method: 8 }]);
    let files = await P.unzip(zbuf, ['dxdiag.txt', 'pdmdata.txt', 'logs.txt']);
    ok('the wanted files are found by name in any folder, any case', Object.keys(files).sort().join() === 'dxdiag.txt,pdmdata.txt', Object.keys(files).join());
    ok('...a deflated UTF-16 dxdiag reads as text', files['dxdiag.txt'] === DXDIAG, String(files['dxdiag.txt']).slice(0, 40));
    ok('...a stored file reads as is', files['pdmdata.txt'] === PDM);
    ok('...an encrypted entry and an unwanted one are left alone', !('logs.txt' in files) && !('prefs.ini' in files));
    const u16plain = zip([{ name: 'dxdiag.txt', data: Buffer.from(DXDIAG, 'utf16le'), method: 8 }]);
    files = await P.unzip(u16plain, ['dxdiag.txt']);
    ok('UTF-16 without a byte-order mark is still recognised', files['dxdiag.txt'] === DXDIAG);
    files = await P.unzip(Uint8Array.from(Buffer.from('not a zip at all, just bytes')).buffer, ['dxdiag.txt']);
    ok('something that is not a zip gives nothing', Object.keys(files).length === 0);
    files = await P.unzip(zbuf, ['dxdiag.txt', 'pdmdata.txt'], 1000);
    ok('an entry that unpacks to more than the cap is left packed; a smaller one is read', !('dxdiag.txt' in files) && files['pdmdata.txt'] === PDM, Object.keys(files).join());

    // ================= dxdiag and PDMData =================
    const dx = P.readDxdiag(DXDIAG);
    ok('dxdiag: the EVE client crash and the module it happened in', dx.wer === true && dx.crashes.length === 1 && dx.crashes[0].module === 'nvwgf2umx.dll' &&
        dx.crashes[0].code === 'ACCESS_VIOLATION', JSON.stringify(dx.crashes));
    ok('...the system crash is counted apart', dx.kernel === 1, dx.kernel);
    ok('...and the hardware, for a report without Computer Info', dx.hw && dx.hw.gpu === 'NVIDIA GeForce RTX 3060 Ti' && dx.hw.gpuVendor === 'NVIDIA' && dx.hw.os === 'Windows 11' &&
        dx.hw.osBuild === 26100, JSON.stringify(dx.hw));
    ok('a dxdiag without a crash history section says so (not an empty history)', P.readDxdiag('      Operating System: Windows 10 Home 64-bit (10.0, Build 19045)').wer === false);
    const pdm = P.readPdm(PDM);
    ok('PDMData: GPU, OS, CPU vendor, threads and memory', pdm && pdm.gpu === 'AMD Radeon RX 6700 XT' && pdm.gpuVendor === 'AMD' && pdm.os === 'Windows 10' && pdm.osBuild === 19045 &&
        pdm.cpuVendor === 'Intel' && pdm.threads === 12 && pdm.ramGB === 16, JSON.stringify(pdm));

    const macPdm = P.readPdm(MAC_PDM);
    ok('PDMData of a Mac: macOS by its major version, the Apple chip as GPU and CPU generation', macPdm && macPdm.os === 'macOS 26' && macPdm.osBuild === undefined &&
        macPdm.gpu === 'Apple M5 Pro' && macPdm.gpuVendor === 'Apple' && macPdm.cpuVendor === 'Apple' && macPdm.cpuGen === 'Apple M5' && macPdm.threads === 18 && macPdm.ramGB === 48,
        JSON.stringify(macPdm));

    // ================= reading a report's files =================
    // ================= logs in Windows' own code page =================
    // cp1251 by hand: А..я are 0xC0..0xFF. A Russian Windows writes its socket errors so, inside a UTF-8 log.
    const cp1251 = (s) => Buffer.from(Array.from(s).map((ch) => { const c = ch.charCodeAt(0); return c >= 0x410 && c <= 0x44F ? c - 0x410 + 0xC0 : c; }));
    const RU = 'Попытка установить соединение была безуспешной';
    const mixed = Buffer.concat([Buffer.from('05:05:04\t::General\tnotice\tEVE Client version 24.01 build 3503375 started\n'),
        Buffer.from('05:05:05\tchat\terror\terror: [Errno 10060] '), cp1251(RU), Buffer.from(": 'connect operation system fail'\n"),
        Buffer.from('05:05:06\tchat\tnotice\tПилот Иванов вошёл в канал\n', 'utf8')]);
    let dec = P._decodeLog(Uint8Array.from(mixed));
    ok('a line in Windows\' Cyrillic code page reads as Cyrillic, with no hint', dec.indexOf('[Errno 10060] ' + RU + ": 'connect") >= 0 && dec.indexOf('�') < 0, dec.split('\n')[1]);
    ok('...while the UTF-8 lines around it stay UTF-8, Cyrillic included', dec.indexOf('EVE Client version 24.01 build 3503375') >= 0 && dec.indexOf('Пилот Иванов вошёл в канал') >= 0, dec);
    const fr = Buffer.concat([Buffer.from('a\tb\terror\terror: [Errno 10061] Aucune connexion n\'a pu '), Buffer.from([0xEA]), Buffer.from('tre '), Buffer.from([0xE9]), Buffer.from('tablie\n')]);
    ok('...a Western one reads as Western', P._decodeLog(Uint8Array.from(fr)).indexOf('Aucune connexion n\'a pu être établie') >= 0, P._decodeLog(Uint8Array.from(fr)));
    const zh = Buffer.concat([Buffer.from('x\ty\terror\terror: [Errno 10060] '), Buffer.from([0xC1, 0xAC, 0xBD, 0xD3]), Buffer.from('\n')]);
    ok('...and one in a Chinese client\'s code page by its language label', P._decodeLog(Uint8Array.from(zh), 'chi_sim').indexOf('[Errno 10060] 连接') >= 0, P._decodeLog(Uint8Array.from(zh), 'chi_sim'));
    ok('a Russian client\'s label settles the code page; no label, the bytes do', P._codepage(Uint8Array.from(fr), [0, fr.length], 'rus') === 'windows-1251' &&
        P._codepage(Uint8Array.from(fr), [0, fr.length]) === 'windows-1252' && P._codepage(Uint8Array.from(mixed), [0, mixed.length]) === 'windows-1251');
    ok('a log that is UTF-8 throughout is read as it is', P._decodeLog(Uint8Array.from(Buffer.from(LOG_A + '\nПилот', 'utf8'))) === LOG_A + '\nПилот');
    P._fetchBytes = () => Promise.resolve(Uint8Array.from(mixed).buffer);
    dec = await P._fetchLog('https://jira/att/logs.txt');
    ok('a log is fetched as bytes and read so', dec.indexOf(RU) >= 0, dec);
    files = await P.unzip(zip([{ name: 'logs.txt', data: zh, method: 8 }]), ['logs.txt'], 0, 'chi_sim');
    ok('...so is the log inside the zip, by the same language label', files['logs.txt'].indexOf('连接') >= 0, files['logs.txt']);

    let texts = [], bytes = [], hints = [];
    let textAnswer = () => Promise.resolve(LOG_A), byteAnswer = () => Promise.resolve(zbuf);
    P._fetchLog = (u, h) => { texts.push(u); hints.push(h); return textAnswer(u); };
    P._fetchBytes = (u) => { bytes.push(u); return byteAnswer(u); };
    const att = (name, size) => ({ filename: name, size: size || 1000, content: 'https://jira/att/' + name });
    let issue = { key: 'EBR-1', fields: { attachment: [att('other_log.txt', 3000), att('logs.txt', 2000), att('screenshot.png'), att('mods.zip', 100), att('igbr.zip', 5000)] } };
    let rec = await P._readFiles(issue, null, true);
    ok('logs.txt is read first, the other log too', texts.join() === 'https://jira/att/logs.txt,https://jira/att/other_log.txt', texts.join());
    ok('...igbr.zip is read, the zip a player added is not', bytes.join() === 'https://jira/att/igbr.zip', bytes.join());
    ok('...the reading has the build, the exceptions, the crash history and the hardware', rec.logs && rec.hasLog && rec.build === 3569502 && rec.exc.length === 2 &&
        rec.zip && rec.wer && rec.crashes[0].module === 'nvwgf2umx.dll' && rec.dxHw && rec.pdmHw && rec.pdmHw.gpuVendor === 'AMD', JSON.stringify(rec).slice(0, 200));
    ok('...and it is cached for the report', metaSets.indexOf('rp:EBR-1') >= 0 && meta['rp:EBR-1'] && meta['rp:EBR-1'].v === P.V);
    hints = [];
    await P._readFiles({ key: 'EBR-11', fields: { labels: ['Russian'], attachment: [att('logs.txt')] } }, null, false);
    ok('the report\'s client language goes with its logs, for their code page', hints.join() === 'rus', hints.join());

    texts = []; bytes = [];
    rec = await P._readFiles(issue, null, false);
    ok('with igbr.zip switched off the zip is not downloaded', bytes.length === 0 && rec.zip === false && rec.logs === true, bytes.join());
    texts = []; bytes = [];
    rec = await P._readFiles(issue, rec, true);
    ok('switched back on, a cached reading only adds the zip', texts.length === 0 && bytes.length === 1 && rec.zip === true && rec.wer === true, texts.join() + ' / ' + bytes.join());

    texts = []; bytes = [];
    textAnswer = (u) => (/other_log/.test(u) ? Promise.reject(new Error('timeout')) : Promise.resolve(LOG_A));
    rec = await P._readFiles(issue, null, true);
    ok('a log download that fails leaves the logs unread, to be read again next time', rec.logs === false && rec.zip === true, JSON.stringify({ logs: rec.logs, zip: rec.zip }));
    ok('...and nothing the logs read before it said is kept', !rec.exc && !rec.build && !rec.hasLog, JSON.stringify(rec).slice(0, 150));
    let inFlight = 0, maxInFlight = 0;
    textAnswer = () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); return new Promise((r) => setImmediate(() => { inFlight--; r(LOG_A); })); };
    texts = []; bytes = [];
    rec = await P._readFiles({ key: 'EBR-6', fields: { attachment: [att('logs.txt'), att('a_log.txt'), att('b_log.txt')] } }, null, false);
    ok('a report\'s logs are downloaded one at a time, each read before the next comes', texts.length === 3 && maxInFlight === 1 && rec.logs && rec.hasLog && rec.exc.length === 2,
        texts.length + ' fetched, ' + maxInFlight + ' at once');
    textAnswer = () => Promise.resolve(LOG_A);
    texts = []; bytes = [];
    byteAnswer = () => Promise.reject(new Error('HTTP 503'));
    rec = await P._readFiles(issue, null, true);
    ok('...so does a failed zip download', rec.zip === false && rec.logs === true);
    byteAnswer = () => Promise.resolve(zbuf);
    texts = []; bytes = [];
    rec = await P._readFiles({ key: 'EBR-2', fields: { attachment: [att('logs.txt', 99 * 1024 * 1024), att('igbr.zip', 99 * 1024 * 1024)] } }, null, true);
    ok('files over the size caps are skipped for good, not downloaded', texts.length === 0 && bytes.length === 0 && rec.logs === true && rec.zip === true && rec.skippedLogs && rec.skippedZip,
        JSON.stringify(rec));
    texts = []; bytes = [];
    rec = await P._readFiles({ key: 'EBR-5', fields: { attachment: [att('logs.txt'), att('mods.zip'), att('igbr_old.zip')] } }, null, true);
    ok('a report without igbr.zip downloads no other zip', bytes.length === 0 && rec.zip === true && rec.hasZip === false, bytes.join());
    const zLog = zip([{ name: 'logs.txt', data: Buffer.from(LOG_A), method: 8 }]);
    byteAnswer = () => Promise.resolve(zLog);
    const realUnzip = P.unzip;
    let unzipped = [];
    P.unzip = (b, w, m) => { unzipped.push(w.join() + ' max ' + m); return realUnzip.call(P, b, w, m); };
    rec = await P._readFiles({ key: 'EBR-3', fields: { attachment: [att('igbr.zip')] } }, null, true);
    ok('a report with no log attached uses the log inside its zip', rec.hasLog === true && rec.build === 3569502 && rec.exc.length === 2, JSON.stringify(rec).slice(0, 150));
    rec = await P._readFiles({ key: 'EBR-7', fields: { attachment: [att('logs.txt'), att('igbr.zip')] } }, null, true);
    ok('...while one with its own log leaves the zip\'s packed; every entry is capped at ' + (P.MAX_LOG_BYTES / 1048576) + ' MB unpacked',
        unzipped.join(' / ') === 'dxdiag.txt,pdmdata.txt,logs.txt max ' + P.MAX_LOG_BYTES + ' / dxdiag.txt,pdmdata.txt max ' + P.MAX_LOG_BYTES, unzipped.join(' / '));
    P.unzip = realUnzip;
    const gbkParts = exBlock('KeyError: @@', ['ui/foo.py(1) OnClick', 'ui/bar.py(2) Load']).split('@@');
    byteAnswer = () => Promise.resolve(zip([{ name: 'logs.txt', data: Buffer.concat([Buffer.from(gbkParts[0]), Buffer.from([0xC1, 0xAC, 0xBD, 0xD3]), Buffer.from(gbkParts[1])]), method: 8 }]));
    rec = await P._readFiles({ key: 'EBR-12', fields: { labels: ['Chinese'], attachment: [att('igbr.zip')] } }, null, true);
    ok('the log inside the zip is read in the code page of the report\'s client language', rec.exc && rec.exc[0] && rec.exc[0].msg === 'KeyError: 连接', JSON.stringify(rec.exc));
    byteAnswer = () => Promise.resolve(zip([{ name: 'logs.txt', data: Buffer.from(LOG_A), method: 8 }, { name: 'PDMData.txt', data: Buffer.from(MAC_PDM), method: 8 },
        { name: 'prefs.ini', data: Buffer.from('a=b'), method: 8 }]));
    rec = await P._readFiles({ key: 'EBR-4', fields: { attachment: [att('igbr.zip')] } }, null, true);
    const macView = P.view({ key: 'EBR-4', fields: { description: 'plain' } }, rec);
    ok('a Mac\'s zip: its hardware from PDMData, its log, and no crash history to count', macView.hw && macView.hw.os === 'macOS 26' && macView.hwFrom === 'PDMData.txt' &&
        macView.logRead === true && macView.build === 3569502 && macView.crashRead === false, JSON.stringify(macView));
    byteAnswer = () => Promise.resolve(zbuf);

    // ================= one report as the profile sees it =================
    let v = P.view({ key: 'EBR-9', fields: { description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: CI }] }] }, labels: ['Russian'], created: '2026-10-01T10:00:00.000+0000' } },
        { v: 1, logs: true, hasLog: true, exc: [{ sig: 's1', msg: 'm' }], zip: true, wer: true, crashes: [], dxHw: { gpu: 'X', gpuVendor: 'AMD' } });
    ok('Computer Info in the description wins over the zip\'s hardware', v.hw.gpu === 'NVIDIA GeForce RTX 3060 Ti' && v.hwFrom === 'Computer Info', JSON.stringify(v.hw));
    ok('...the language comes from its label', v.lang === 'Russian');
    ok('...what its files said is read', v.logRead === true && v.exc.length === 1 && v.crashRead === true);
    v = P.view({ key: 'EBR-8', fields: { description: 'plain' } }, { v: 1, logs: false, zip: true, wer: false, dxHw: { gpu: 'X', gpuVendor: 'AMD' }, pdmHw: { gpu: 'Y' } });
    ok('without Computer Info the dxdiag hardware is used, and it says so', v.hw.gpu === 'X' && v.hwFrom === 'dxdiag.txt', JSON.stringify(v));
    ok('...a report with no label counts as English; unread logs and a zip with no crash history are told apart', v.lang === 'English' && v.logRead === null && v.crashRead === false);

    // ================= the profile =================
    const mk = (key, o) => ({ key, created: o.created || '2026-09-20T00:00:00.000+0000', lang: o.lang || 'English', hw: o.hw === undefined ? { gpuVendor: o.vendor || 'AMD', os: o.os || 'Windows 11', platform: 'dx12' } : o.hw,
        build: o.build || null, version: o.build ? '24.01' : null, logRead: o.logRead === undefined ? true : o.logRead, exc: o.exc || [], crashRead: o.crashRead === undefined ? null : o.crashRead, crashes: o.crashes || [] });
    const X = { sig: 'sx', msg: 'KeyError: 2' }, Y = { sig: 'sy', msg: 'ValueError' };
    let views = [mk('EBR-1', { exc: [X], build: 3561000, created: '2026-09-01T00:00:00.000+0000' }), mk('EBR-2', { exc: [X, Y] }), mk('EBR-3', { exc: [X] }), mk('EBR-4', { exc: [X], build: 3569502 }),
        mk('EBR-5', { exc: [Y], vendor: 'NVIDIA', created: '2026-10-02T00:00:00.000+0000' }), mk('EBR-6', { logRead: null, hw: null, lang: 'Russian' })];
    let sm = P.summarise(views, { status: 'Closed', resolution: 'Fixed', resolutiondate: '2026-09-15T00:00:00.000+0000' });
    let gv = sm.dims.filter((d) => d.id === 'gpuVendor')[0];
    ok('a value 4 of 5 reports share is the pattern; a report with no hardware counts for neither side', gv.dominant === 'AMD' && gv.domCount === 4 && gv.known === 5, JSON.stringify(gv));
    ok('the exception 4 of 5 read logs share is the pattern; one in only 2 is still listed', sm.domExc && sm.domExc.sig === 'sx' && sm.domExc.count === 4 && sm.withLog === 5 &&
        sm.exc.length === 2 && sm.exc[1].sig === 'sy', JSON.stringify(sm.exc));
    const o5 = sm.outliers.filter((o) => o.key === 'EBR-5')[0];
    ok('the report that differs is an outlier, with why: its GPU and its log', sm.outliers.length === 1 && o5 && o5.why.length === 2 && o5.why[0] === 'GPU vendor NVIDIA, while 4 of 5 have AMD' &&
        /lacks the exception 4 of 5 logs share/.test(o5.why[1]), JSON.stringify(sm.outliers));
    ok('builds, dates and reports filed after the fix', sm.builds.min === 3561000 && sm.builds.max === 3569502 && sm.first === '2026-09-01T00:00:00.000+0000' &&
        sm.last === '2026-10-02T00:00:00.000+0000' && sm.afterFix === 5 && sm.fixedAt, JSON.stringify(sm.builds) + ' ' + sm.afterFix);
    ok('language is counted but never makes an outlier', sm.dims.some((d) => d.id === 'lang' && d.dominant === 'English') && !sm.outliers.some((o) => o.why.some((w) => /^Language/.test(w))));
    ok('a defect reopened since its fix counts no report as after the fix', P.summarise(views, { status: 'Reopened', resolution: null, resolutiondate: '2026-09-15T00:00:00.000+0000' }).afterFix === 0);
    sm = P.summarise(views.slice(0, 4).concat([views[4]]).filter((x, i) => i !== 0), null);
    gv = sm.dims.filter((d) => d.id === 'gpuVendor')[0];
    ok('fewer than ' + P.MIN_N + ' reports make no pattern and no outlier', gv.known === 4 && !gv.dominant && !sm.domExc && sm.outliers.length === 0 && sm.afterFix === 0, JSON.stringify(gv));
    // the same message through two call stacks
    const A1 = { sig: 'runtimeerror: failed|a.py:run>b.py:<module>>c.py:find', msg: 'RuntimeError: failed' }, A2 = { sig: 'runtimeerror: failed|z.py:other>c.py:find', msg: 'RuntimeError: failed' };
    ok('a signature parts into its message and its frames, "<module>" included', JSON.stringify(P._sigParts(A1.sig)) ===
        JSON.stringify({ msg: 'runtimeerror: failed', frames: ['a.py:run', 'b.py:<module>', 'c.py:find'] }), JSON.stringify(P._sigParts(A1.sig)));
    ok('call stacks are labelled by where they differ, up to the frames they share', P._pathLabels([P._sigParts(A1.sig).frames, P._sigParts(A2.sig).frames]).join(' | ') ===
        'a.py:run > b.py:<module> > … | z.py:other > …', P._pathLabels([P._sigParts(A1.sig).frames, P._sigParts(A2.sig).frames]).join(' | '));
    const grouped = [1, 2, 3, 4].map((i) => mk('EBR-' + i, { exc: [A1] })).concat([mk('EBR-5', { exc: [A2] })]);
    sm = P.summarise(grouped, null);
    ok('the same message by two call stacks is one row, each report counted once, its stacks below it', sm.excGroups.length === 1 && sm.excGroups[0].count === 5 &&
        sm.excGroups[0].msg === 'RuntimeError: failed' && sm.excGroups[0].paths.map((p) => p.count).join() === '4,1', JSON.stringify(sm.excGroups));
    ok('...and the report that reaches it the other way is no outlier', sm.domExc && sm.domExc.sig === A1.sig && sm.outliers.length === 0, JSON.stringify(sm.outliers));
    const groupedState = { key: 'EDR-8', total: 5, views: grouped, summary: sm, pending: 0, done: true, zip: true };
    views = [1, 2, 3, 4, 5].map((i) => mk('EBR-' + i, { crashRead: true, crashes: i === 5 ? [{ module: 'd3d11.dll', code: 'X' }] : [{ module: 'nvwgf2umx.dll', code: 'ACCESS_VIOLATION' }, { module: 'nvwgf2umx.dll', code: 'ACCESS_VIOLATION' }] }))
        .concat([mk('EBR-6', { crashRead: true, crashes: [] }), mk('EBR-7', { crashRead: null }), mk('EBR-8', { crashRead: false })]);
    sm = P.summarise(views, null);
    ok('crash modules count each report once; a history not read, or a dxdiag without one, does not count', sm.withWer === 6 && sm.crashes[0].module === 'nvwgf2umx.dll' && sm.crashes[0].count === 4, JSON.stringify(sm.crashes));
    ok('...4 of 6 is not the pattern yet (under ' + P.DOMINANT * 100 + '%)', !sm.domCrash);
    views[5] = mk('EBR-6', { crashRead: true, crashes: [{ module: 'nvwgf2umx.dll', code: 'A' }] });
    sm = P.summarise(views, null);
    ok('...5 of 6 is, and the history without it is an outlier, while one with no history read is not', sm.domCrash && sm.outliers.length === 1 && sm.outliers[0].key === 'EBR-5' &&
        /no crash in nvwgf2umx\.dll, which 5 of 6 crash histories show/.test(sm.outliers[0].why[0]), JSON.stringify(sm.outliers));

    // ================= the reports of a defect =================
    let posts = [];
    JiTA.sync._apiPost = (path, body) => { posts.push([path, body]); return Promise.resolve(/approximate/.test(path) ? { data: { count: 40 } } : { data: { issues: [{ key: 'EBR-1' }] } }); };
    let rp = await P._reports('EDR-7');
    ok('one search for the latest reports linked to the defect, newest first', posts[0][1].jql === 'issue in linkedIssues("EDR-7") AND project = EBR ORDER BY created DESC' &&
        posts[0][1].maxResults === P.MAX_REPORTS && posts[0][1].fields.indexOf('attachment') >= 0 && posts[0][1].fields.indexOf('*navigable') >= 0, JSON.stringify(posts[0][1]));
    ok('...and a count of all of them', posts[1][0] === '/rest/api/3/search/approximate-count' && rp.total === 40 && rp.issues.length === 1, JSON.stringify(rp));

    // ================= building =================
    const issues = [1, 2, 3, 4, 5, 6].map((i) => ({ key: 'EBR-' + i, fields: { description: ciWith({}), created: '2026-09-2' + i + 'T00:00:00.000+0000', attachment: [] } }));
    P._reports = () => Promise.resolve({ issues: issues, total: 30 });
    JiTA.db.getDefect = () => Promise.resolve({ status: 'Open' });
    meta = { 'rp:EBR-1': { v: P.V, logs: true, hasLog: false, zip: true, wer: false }, 'rp:EBR-2': { v: P.V - 1, logs: true, zip: true } };
    let reads = [], hold = [];
    P._readFiles = (iss, r, z) => {
        reads.push(iss.key + (r ? '+cached' : '') + (z ? '+zip' : ''));
        return new Promise((res) => { hold.push(() => { const rec = { v: P.V, key: iss.key, logs: true, hasLog: true, exc: [], zip: z }; meta['rp:' + iss.key] = rec; res(rec); }); });
    };
    let states = [], still = true;
    const done = P.build('EDR-7', (s) => { states.push(s); }, () => still);
    await flush();
    ok('what the descriptions and cached readings say is shown at once', states.length === 1 && states[0].total === 30 && states[0].views.length === 6 && states[0].pending === 5 &&
        states[0].summary.dims.some((d) => d.id === 'gpuVendor'), JSON.stringify(states.map((s) => s.pending)));
    ok('a report read before is not read again; one cached by an older build is; ' + P.CONCURRENCY + ' at a time', reads.join() === 'EBR-2+zip,EBR-3+zip,EBR-4+zip', reads.join());
    let second = 0;
    P.build('EDR-7', () => { second++; });
    still = false;
    hold.shift()();
    await flush();
    ok('a second caller listens in to the same build', second === 1, second);
    hold.forEach((h) => h());
    await flush();
    await Promise.race([done, new Promise((r) => setTimeout(r, 2000))]);   // a build that starts reads after the defect was left never ends here
    ok('every finished read updates the profile', states.length === 4 && states.map((s) => s.pending).join() === '5,4,3,2', states.map((s) => s.pending).join());
    ok('...leaving the defect lets the started reads finish but starts no new one, and the profile is not marked done', reads.length === 3 && !states[3].done, reads.join() + ' ' + states[3].done);
    still = true; reads = []; states = [];
    P._readFiles = (iss, r, z) => { reads.push(iss.key); return Promise.resolve({ v: P.V, key: iss.key, logs: true, hasLog: false, zip: z }); };
    await P.build('EDR-7', (s) => { states.push(s); }, () => true);
    ok('...the next visit carries on with the reports still unread, and finishes', reads.join() === 'EBR-5,EBR-6' && states[states.length - 1].done && states[states.length - 1].pending === 0,
        reads.join() + ' ' + states.map((s) => s.pending).join());
    reads = [];
    store[P.ZIP_KEY] = false;
    meta = {};
    P._readFiles = (iss, r, z) => { reads.push(iss.key + (z ? '+zip' : '')); return Promise.resolve({ v: P.V, key: iss.key, logs: true, hasLog: false, zip: false }); };
    states = [];
    await P.build('EDR-8', (s) => { states.push(s); }, () => true);
    ok('with igbr.zip switched off no zip is read', reads.length === 6 && reads.every((r) => !/\+zip/.test(r)) && states[states.length - 1].zip === false && states[states.length - 1].done, reads.join());
    delete store[P.ZIP_KEY];
    P._reports = () => Promise.resolve({ issues: [], total: 0 });
    states = [];
    await P.build('EDR-9', (s) => { states.push(s); }, () => true);
    ok('a defect with no reports is announced once, empty', states.length === 1 && states[0].total === 0 && states[0].done, states.length);
    const lastBefore = P._last;
    P._last = {};
    for (let i = 1; i <= P.KEEP + 1; i++) { P._keep('EDR-' + i, { i: i }); }
    ok('only the ' + P.KEEP + ' defects looked at last stay in memory', Object.keys(P._last).length === P.KEEP && !('EDR-1' in P._last) &&
        P._last['EDR-' + (P.KEEP + 1)].i === P.KEEP + 1, Object.keys(P._last).join());
    P._keep('EDR-2', { i: 'again' });
    P._keep('EDR-99', {});
    ok('...a defect looked at again counts as recent', P._last['EDR-2'] && P._last['EDR-2'].i === 'again' && !('EDR-3' in P._last), Object.keys(P._last).join());
    P._last = lastBefore;

    // ================= the panel section =================
    let made = [];
    function El(html) {
        const cls = ((/class="([^"]*)"/.exec(html || '') || [])[1] || '').split(/\s+/).filter(Boolean), e = { cls, txt: '', kids: [], attrs: {}, on: {} };
        const j = {
            e, length: 1,
            text: (t) => { if (t === undefined) { return e.txt + e.kids.map((k) => k.text()).join(''); } e.txt = String(t); return j; },
            addClass: (c) => { if (c) { c.split(' ').forEach((x) => { if (x && e.cls.indexOf(x) < 0) { e.cls.push(x); } }); } return j; },
            removeClass: (c) => { e.cls = e.cls.filter((x) => x !== c); return j; },
            toggleClass: (c, on) => (on ? j.addClass(c) : j.removeClass(c)),
            hasClass: (c) => e.cls.indexOf(c) >= 0,
            attr: (k, val) => { e.attrs[k] = val; return j; },
            appendTo: (p) => { p.e.kids.push(j); return j; },
            append: (c) => { e.kids.push(c); return j; },
            empty: () => { e.kids = []; e.txt = ''; return j; },
            on: (ev, f) => { e.on[ev] = f; return j; },
            find: () => j,
            children: () => ({ eq: (i) => e.kids[i] || El('') })
        };
        made.push(j);
        return j;
    }
    // The page: the floating panel first; the sidebar's own card further down.
    let sideMode = false, groupEl = null, inserted = [], built = [];
    const sideEl = { parentNode: { insertBefore: (n, ref) => { inserted.push(ref); groupEl = n; } }, nextSibling: 'BELOW-TRIAGE' };   // the Triage Assistant card
    global.document = { getElementById: (id) => (id === 'jita-side-group' ? (sideMode ? sideEl : null) : (id === P.GROUP_ID ? groupEl : null)) };
    JiTA.ui.mode = () => (sideMode ? 'sidebar' : 'floating');
    JiTA.ui._buildSideGroup = (o) => { built.push(o); return { id: o.id, style: {}, parentNode: { removeChild: () => { groupEl = null; } } }; };
    const box = El('<div id="jita-sd-profile"></div>');
    global.$ = (x) => (x === '#jita-sd-profile' ? box : El(x));
    JiTA.ui.currentKey = 'EDR-7';
    JiTA.ui._fitVertical = () => {};
    const full = [1, 2, 3, 4, 5].map((i) => mk('EBR-' + i, { exc: [X], build: 3560000 + i, crashRead: true, crashes: [{ module: 'nvwgf2umx.dll', code: 'ACCESS_VIOLATION' }] }))
        .concat([mk('EBR-6', { vendor: 'NVIDIA', exc: [Y], crashRead: true, crashes: [] })]);
    const st = { key: 'EDR-7', total: 30, views: full, summary: P.summarise(full, { status: 'Closed', resolution: 'Fixed', resolutiondate: '2026-09-10T00:00:00.000+0000' }), pending: 2, done: false, zip: true };
    P._paint('EDR-7', st);
    const txt = box.text();
    ok('the section opens with how many reports there are and how many are read', box.hasClass('has-hits') && /^Attached reports: 30 \(latest 6\)/.test(txt) && /reading files, 2 left/.test(txt), txt.slice(0, 80));
    ok('...a pattern is a highlighted chip', made.some((m) => m.hasClass('strong') && /^GPU vendor: AMD 5\/6$/.test(m.e.txt)), made.filter((m) => m.hasClass('jp-chip')).map((m) => m.e.txt).join(' | '));
    ok('...so are the shared exception and the crash module', /Exception in 5\/6 logs: KeyError: 2/.test(txt) && /Crash in nvwgf2umx\.dll 5\/6/.test(txt), txt);
    ok('...the outlier is listed in it, with why', /1 outlier: reports that do not fit the pattern/.test(txt) && /EBR-6GPU vendor NVIDIA, while 5 of 6 have AMD/.test(txt), txt);
    ok('...then builds, dates, reports after the fix, outliers and the way in', /builds 3560001 to 3560005/.test(txt) && /6 after the fix/.test(txt) && /1 outlier/.test(txt) &&
        made.some((m) => m.hasClass('jp-open') && typeof m.e.on.click === 'function'), txt);
    const two = [mk('EBR-1', { exc: [X] }), mk('EBR-2', { exc: [Y] })];
    P._paint('EDR-7', { key: 'EDR-7', total: 2, views: two, summary: P.summarise(two, null), pending: 0, done: true, zip: true });
    ok('too few reports, with nothing shared, say so instead of showing an empty row', /Too few reports for a pattern yet\./.test(box.text()), box.text());
    P._paint('EDR-7', { key: 'EDR-7', total: 2, views: full.slice(0, 2), summary: P.summarise(full.slice(0, 2), null), pending: 0, done: true, zip: true });
    ok('...while something 2 reports share is still shown, unhighlighted, below a pattern\'s minimum', /Exception in 2\/2 logs/.test(box.text()) &&
        !made.some((m) => m.hasClass('strong') && /Exception in 2\/2/.test(m.e.txt)), box.text());
    P._paint('EDR-7', { key: 'EDR-7', total: 0, views: [], summary: P.summarise([], null), pending: 0, done: true });
    ok('a defect without reports shows no section', !box.hasClass('has-hits') && box.text() === '');
    JiTA.ui.currentKey = 'EDR-1';
    P._paint('EDR-7', st);
    ok('a profile for an issue no longer on screen is not painted', box.text() === '');
    JiTA.ui.currentKey = 'EDR-7';
    const many = [];
    for (let i = 1; i <= 30; i++) { many.push(mk('EBR-' + i, { vendor: i > 24 ? 'NVIDIA' : 'AMD' })); }
    P._paint('EDR-7', { key: 'EDR-7', total: 30, views: many, summary: P.summarise(many, null), pending: 0, done: true, zip: true });
    ok('more outliers than the card lists are left to the full profile', made.filter((m) => m.hasClass('jp-out')).length >= P.SHOW_OUTLIERS &&
        /and 1 more in the full profile/.test(box.text()), box.text().slice(-120));
    ok('in the floating panel the profile stays a section of it: no card', built.length === 0 && groupEl === null);

    // ================= the Defect Profile card =================
    sideMode = true;
    P._paint('EDR-7', { key: 'EDR-7', total: 0, views: [], summary: P.summarise([], null), pending: 0, done: true });
    ok('in the sidebar a defect without reports gets no card', built.length === 0 && groupEl === null);
    P._paint('EDR-7', st);
    ok('in the sidebar the profile gets a card of its own, Defect Profile, right above the Triage Assistant', built.length === 1 && built[0].id === 'jita-profile-group' &&
        built[0].title === 'Defect Profile' && built[0].body === '<div id="jita-sd-profile"></div>' && built[0].collapseKey === P.COLLAPSE_KEY &&
        inserted.length === 1 && inserted[0] === sideEl && groupEl.style.display === '' && /^Attached reports: 30/.test(box.text()), JSON.stringify(built) + ' ' + inserted.map((r) => (r === sideEl ? 'TRIAGE' : r)).join());
    P._paint('EDR-7', st);
    ok('...built once, however often it is painted', built.length === 1 && inserted.length === 1);
    P._paint('EDR-7', { key: 'EDR-7', total: 0, views: [], summary: P.summarise([], null), pending: 0, done: true });
    ok('...hidden while the defect has no reports', groupEl.style.display === 'none');
    P.clear();
    ok('leaving the defect takes the card away', groupEl === null && !box.hasClass('has-hits'));
    P._last['EDR-7'] = st;
    P.reensure();
    ok('a card Jira wiped comes back at once, painted from the last state', built.length === 2 && groupEl && groupEl.style.display === '' && /^Attached reports: 30/.test(box.text()));
    P.reensure();
    ok('...and only while it is missing', built.length === 2);
    groupEl = null;
    P._last['EDR-7'] = { key: 'EDR-7', total: 0, views: [], summary: P.summarise([], null), pending: 0, done: true };
    const realPaint = P._paint;
    let painted = 0;
    P._paint = function () { painted++; return realPaint.apply(P, arguments); };
    P.reensure();
    P._paint = realPaint;
    ok('...a defect without reports gets none back, and is not even repainted', built.length === 2 && groupEl === null && painted === 0, painted);

    // ================= switched off in Settings > Features =================
    P._last['EDR-7'] = st;
    flags.defectProfile = false;
    P._paint('EDR-7', st);
    painted = 0;
    P._paint = function () { painted++; return realPaint.apply(P, arguments); };
    P.reensure();
    P._paint = realPaint;
    ok('switched off, the profile paints no card and puts none back, not even trying', built.length === 2 && groupEl === null && painted === 0, painted);
    const realBuild = P.build;
    let builds = 0, stillFn = null;
    P.build = (k, on, still) => { builds++; stillFn = still; return new Promise(() => {}); };
    P.renderSection('EDR-7', true);
    ok('...and a defect page neither builds nor reads anything for it', builds === 0 && groupEl === null);
    flags.defectProfile = true;
    P.renderSection('EDR-7', true);
    flags.defectProfile = false;
    ok('switched off while its reports are read, no new read starts', builds === 1 && stillFn() === false);
    flags.defectProfile = true;
    ok('...switched on again, they carry on', stillFn() === true);
    P.build = realBuild;
    P.clear();
    sideMode = false;

    // ================= the full profile =================
    let overlay = null;
    JiTA.menu._openOverlay = () => { overlay = El('<div></div>'); return { $menu: overlay, $overlay: El(''), close() {} }; };
    let threw = null;
    P._last['EDR-7'] = st;
    try { P.openView('EDR-7'); } catch (e) { threw = e; }
    const otxt = overlay ? overlay.text() : '';
    ok('the full profile opens', !threw && overlay && overlay.hasClass('jita-profile-view'), String(threw && threw.stack));
    ok('...with every section, the outlier and its reason, and a row per report', /Hardware and language/.test(otxt) && /Exceptions shared by 2 or more logs/.test(otxt) &&
        /EVE client crashes/.test(otxt) && /EBR-6/.test(otxt) && /GPU vendor NVIDIA, while 5 of 6 have AMD/.test(otxt) && /no crash in nvwgf2umx\.dll/.test(otxt), otxt.slice(0, 300));
    P._last['EDR-8'] = groupedState;
    P.openView('EDR-8');
    const gtxt = overlay.text();
    ok('...a message reached two ways is one row, with its call stacks below it', (gtxt.match(/RuntimeError: failed/g) || []).length === 1 && /5\/5RuntimeError: failed/.test(gtxt) &&
        /4\/5via a\.py:run > b\.py:<module> > …/.test(gtxt) && /1\/5via z\.py:other > …/.test(gtxt), gtxt.slice(0, 400));
    const hover = (txt) => made.filter((m) => m.hasClass('jpv-count') && m.e.txt === txt).map((m) => m.e.attrs.title).join(' | ');
    ok('hovering a count lists the reports behind it: the message, and each call stack', hover('5/5') === '5 reports: EBR-1, EBR-2, EBR-3, EBR-4, EBR-5' &&
        hover('4/5') === '4 reports: EBR-1, EBR-2, EBR-3, EBR-4' && hover('1/5') === '1 report: EBR-5', hover('5/5') + ' || ' + hover('4/5') + ' || ' + hover('1/5'));
    made = [];
    P.openView('EDR-7');
    const vhover = made.filter((m) => m.hasClass('jpv-val') && /^NVIDIA 1\/6$/.test(m.e.txt)).map((m) => m.e.attrs.title).join();
    const crow = made.filter((m) => m.hasClass('jpv-row') && m.e.kids.length === 2 && /^nvwgf2umx\.dll/.test(m.e.kids[1].e.txt))[0];
    const chover = crow ? crow.e.kids[0].e.attrs.title : '';
    ok('...so does a hardware value, and a crash module', vhover === '1 report: EBR-6' && chover === '5 reports: EBR-1, EBR-2, EBR-3, EBR-4, EBR-5', vhover + ' || ' + chover);

    // ================= wiring =================
    ok('renderReports draws the section on a defect', member('    renderReports: function (key, background) {').indexOf('JiTA.profile.renderSection(key, background);') >= 0);
    ok('the views that are not a defect\'s clear it', ['    render: function (key, background) {', '    renderReporterReports: function (key) {', '    renderSimilarReports: function (key, background) {', '    renderTrending: function (key, background) {']
        .every((h) => member(h).indexOf('JiTA.profile.clear();') >= 0));
    ok('the profile left the Triage Assistant card; the floating panel keeps it as a section', member('    _sidebarBodyHtml: function () {').indexOf('jita-sd-profile') < 0 &&
        member('    _ensureFloating: function () {').indexOf('<div id="jita-sd-profile"></div>') >= 0);
    const sbg = member('    _buildSideGroup: function (o) {');
    ok('both cards come from one builder, which names, fills and remembers each by what it is given', sbg.indexOf('Triage Assistant') < 0 &&
        sbg.indexOf('titleEl.textContent = o.title;') >= 0 && sbg.indexOf('.textContent = o.title;') !== sbg.lastIndexOf('.textContent = o.title;') &&
        sbg.indexOf('freshBody.innerHTML = o.body;') >= 0 && sbg.indexOf('gmSet(o.collapseKey, isColl);') >= 0 && sbg.indexOf('gmGet(o.collapseKey, false)') >= 0 &&
        member('    _ensureSidebar: function () {').indexOf("_buildSideGroup({ id: 'jita-side-group', title: 'Triage Assistant'") >= 0);
    ok('the Triage Assistant card, rebuilt, keeps the profile card right above it', member('    _ensureSidebar: function () {').indexOf("group.parentNode.insertBefore(pg, group);") >= 0);
    ok('the page observer puts a wiped card back', member('    _reensureFast: function () {').indexOf('JiTA.profile.reensure();') >= 0);
    ok('switching to the floating panel, or turning the Triage Assistant off, takes the card too', member('    toggleStyle: function () {').indexOf('#jita-profile-group') >= 0 &&
        member('    _ensurePanel: function () {').indexOf('#jita-profile-group') >= 0 && block('JiTA.menu = {', '\n};\n').indexOf("$('#jita-side-group, #jita-profile-group').remove();") >= 0);
    const menuSrc = block('JiTA.menu = {', '\n};\n');
    ok('Settings has the igbr.zip switch, on by default', menuSrc.indexOf('gmSet(JiTA.profile.ZIP_KEY, !JiTA.profile.zipOn());') >= 0 && P.zipOn() === true);
    const flagSrc = eval('(function () { ' + line('var savedVariables = ') + line('var FLAG = ') + ' return { savedVariables: savedVariables, FLAG: FLAG }; })()');
    ok('the defect profile is a feature of its own, on by default like every feature', flagSrc.FLAG.defectProfile === 8 && flagSrc.savedVariables[8][0] === 'defectProfile' &&
        flagSrc.savedVariables[8][1] === '', JSON.stringify(flagSrc.savedVariables[8]));
    const featStart = menuSrc.indexOf("JiTA.menu._toggleRow('Defect profile', 8,"), subStart = menuSrc.indexOf("if (flagOn('defectProfile')) {", featStart);
    const zipAt = menuSrc.indexOf('gmSet(JiTA.profile.ZIP_KEY, !JiTA.profile.zipOn());');
    ok('Settings > Features has it, with Read igbr.zip under it, shown only while it is on', featStart > 0 && subStart > featStart && zipAt > subStart &&
        menuSrc.indexOf('padding-left:18px', subStart) < zipAt && menuSrc.indexOf('gmSet(JiTA.profile.ZIP_KEY', zipAt + 1) < 0 &&
        menuSrc.slice(featStart, zipAt).indexOf("$feat.append($zipRow);") < 0 && menuSrc.indexOf("$feat.append($zipRow);", zipAt) > 0);
    ok('...and switching it off takes the card away, on draws it for the defect on screen', menuSrc.indexOf("if (!flagOn('defectProfile')) { JiTA.profile.clear(); return; }") > featStart &&
        menuSrc.indexOf('JiTA.profile.renderSection(k, true);') > featStart);

    console.log('\n' + (fail ? 'FAILURE: ' + fail + ' check(s) failed' : 'profile checks passed.'));
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
