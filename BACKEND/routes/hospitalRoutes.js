const express = require("express");
const {
    listHospitals,
    updateHospital
} = require("../services/hospitalService");
const {
    getDatabaseDiagnosticCode,
    isDatabaseConnectionError
} = require("../services/databaseError");

function createHospitalRouter({
    list = listHospitals,
    update = updateHospital
} = {}) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        try {
            const records = await list();
            return res.json({ data: records });
        } catch (error) {
            const unavailable = isDatabaseConnectionError(error);
            const code = unavailable ? "DATABASE_UNAVAILABLE" : "HOSPITAL_LIST_FAILED";
            console.error(
                "Hospital list failed:",
                code,
                getDatabaseDiagnosticCode(error)
            );
            return res.status(unavailable ? 503 : 500).json({
                error: unavailable
                    ? "Database is temporarily unavailable. Please retry."
                    : "Failed to retrieve hospitals.",
                code
            });
        }
    });

    router.patch("/:id", async (req, res) => {
        try {
            const record = await update(req.params.id, req.body);
            return res.json({ data: record });
        } catch (error) {
            const unavailable = isDatabaseConnectionError(error);
            const status = unavailable ? 503 : error.status || 500;
            const code = unavailable
                ? "DATABASE_UNAVAILABLE"
                : error.code || "HOSPITAL_UPDATE_FAILED";
            console.error(
                "Hospital update failed:",
                code,
                getDatabaseDiagnosticCode(error)
            );
            return res.status(status).json({
                error: unavailable
                    ? "Database is temporarily unavailable. Please retry."
                    : status === 500 ? "Failed to update hospital." : error.message,
                code
            });
        }
    });

    return router;
}

module.exports = createHospitalRouter();
module.exports.createHospitalRouter = createHospitalRouter;
