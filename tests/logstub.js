// logstub.js - JiTA.log, JiTA.warn and JiTA.error for a harness's own stub of JiTA (since v3.53.1 the script logs through
// them, so Copy diagnostics keeps its console lines). Each passes its arguments on to console.log, .warn or .error,
// looked up when called, so a harness that swaps console.log to catch a line still catches it.
//   require('./logstub')(JiTA)  -> JiTA, with the three added
module.exports = function logstub(J) {
    ['log', 'warn', 'error'].forEach((level) => {
        J[level] = function () { return console[level].apply(console, arguments); };
    });
    return J;
};
