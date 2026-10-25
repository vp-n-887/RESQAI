const CONNECTION_ERROR_CODES = new Set([
    "08000",
    "08001",
    "08003",
    "08006",
    "57P01",
    "57P02",
    "57P03",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EAI_AGAIN",
    "ENOTFOUND",
    "EAI_NONAME"
]);

function isDatabaseConnectionError(error) {
    const code = String(error?.code || "");
    if (CONNECTION_ERROR_CODES.has(code) || code.startsWith("08")) {
        return true;
    }

    return /connection terminated due to connection timeout|connection timeout|timeout exceeded when trying to connect|connect etimedout|timeout expired|connection refused|connection reset|connection terminated unexpectedly/i
        .test(error?.message || "");
}

function getDatabaseDiagnosticCode(error) {
    if (typeof error?.code === "string" && error.code) {
        return error.code;
    }
    if (isDatabaseConnectionError(error)) {
        if (/timeout/i.test(error?.message || "")) {
            return "CONNECTION_TIMEOUT";
        }
        if (/refused/i.test(error?.message || "")) {
            return "CONNECTION_REFUSED";
        }
        return "CONNECTION_FAILURE";
    }
    return error?.name || "UNKNOWN";
}

module.exports = {
    getDatabaseDiagnosticCode,
    isDatabaseConnectionError
};
