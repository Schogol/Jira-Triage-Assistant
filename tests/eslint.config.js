// eslint.config.js - the lint rules for JiTA.user.js (ci-static.js --only lint runs them). Only rules that find bugs:
// a name that is not defined anywhere, one defined and never used, a key or case written twice, code that can never
// run, comparisons that are always false. No style rules; the script's style is its own.
//
// The globals are the browser's, the shared worker's and Tampermonkey's that the script uses. A new one goes here, so
// a misspelt name still fails.
'use strict';
const g = (names) => names.reduce((o, n) => { o[n] = 'readonly'; return o; }, {});
const BROWSER = ['document', 'window', 'navigator', 'location', 'history', 'console', 'setTimeout', 'clearTimeout', 'setInterval',
    'clearInterval', 'confirm', 'alert', 'prompt', 'sessionStorage', 'localStorage', 'indexedDB', 'fetch', 'URL', 'Blob', 'Response', 'TextDecoder',
    'TextEncoder', 'MutationObserver', 'ResizeObserver', 'CustomEvent', 'PopStateEvent', 'ClipboardItem', 'DecompressionStream', 'BroadcastChannel',
    'Worker', 'SharedWorker', 'createImageBitmap', 'getComputedStyle', 'requestAnimationFrame', 'performance'];
const WORKER = ['self'];   // jitaWorkerBody runs as a shared worker
const TAMPERMONKEY = ['GM_addStyle', 'GM_getValue', 'GM_setValue', 'GM_addValueChangeListener', 'GM_xmlhttpRequest', 'GM_registerMenuCommand',
    'GM_unregisterMenuCommand', 'GM_info', 'GM_getResourceText'];   // jQuery's $ the script declares itself (/* global $ */)

module.exports = [{
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: Object.assign(g(BROWSER), g(WORKER), g(TAMPERMONKEY)) },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
        'no-undef': 'error',
        'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }],
        'no-redeclare': 'error',
        'no-dupe-keys': 'error',
        'no-dupe-args': 'error',
        'no-duplicate-case': 'error',
        'no-dupe-else-if': 'error',
        'no-unreachable': 'error',
        'no-fallthrough': 'error',
        'no-self-assign': 'error',
        'no-self-compare': 'error',
        'use-isnan': 'error',
        'valid-typeof': 'error',
        'no-func-assign': 'error',
        'no-const-assign': 'error',
        'no-ex-assign': 'error',
        'no-unsafe-finally': 'error',
        'no-unsafe-negation': 'error',
        'no-sparse-arrays': 'error',
        'no-compare-neg-zero': 'error',
        'no-loss-of-precision': 'error',
        'no-global-assign': 'error',
        'no-shadow-restricted-names': 'error',
        'no-cond-assign': ['error', 'except-parens'],
        'no-empty-character-class': 'error',
        'no-invalid-regexp': 'error',
        'no-obj-calls': 'error',
        'no-unsafe-optional-chaining': 'error',
        'no-unused-labels': 'error',
        'no-useless-backreference': 'error',
        'getter-return': 'error',
        'no-setter-return': 'error'
    }
}];
