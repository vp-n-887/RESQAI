const express = require("express");
const pool = require("../db/database");
const {
    getDatabaseDiagnosticCode,
    isDatabaseConnectionError
} = require("../services/databaseError");

function createDashboardRouter({ database = pool } = {}) {
    const router = express.Router();

    router.get("/stats", async (req, res) => {
        try {
            const result = await database.query(`
                WITH ambulance_stats AS (
                    SELECT
                        COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE status = 'Available') AS available,
                        COUNT(*) FILTER (WHERE status = 'Busy') AS busy
                    FROM ambulances
                ),
                hospital_stats AS (
                    SELECT
                        COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE status = 'Available') AS available,
                        COUNT(*) FILTER (WHERE status = 'Full') AS full
                    FROM hospitals
                ),
                emergency_stats AS (
                    SELECT
                        COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE status = 'Active') AS active
                    FROM emergencies
                )
                SELECT
                    ambulance_stats.total AS ambulance_total,
                    ambulance_stats.available AS ambulance_available,
                    ambulance_stats.busy AS ambulance_busy,
                    hospital_stats.total AS hospital_total,
                    hospital_stats.available AS hospital_available,
                    hospital_stats.full AS hospital_full,
                    emergency_stats.total AS emergency_total,
                    emergency_stats.active AS emergency_active
                FROM ambulance_stats
                CROSS JOIN hospital_stats
                CROSS JOIN emergency_stats
            `);

            const stats = result.rows[0];

            return res.json({
                ambulances: {
                    total: stats.ambulance_total,
                    available: stats.ambulance_available,
                    busy: stats.ambulance_busy
                },
                hospitals: {
                    total: stats.hospital_total,
                    available: stats.hospital_available,
                    full: stats.hospital_full
                },
                emergencies: {
                    total: stats.emergency_total,
                    active: stats.emergency_active
                }
            });
        } catch (error) {
            const unavailable = isDatabaseConnectionError(error);
            const code = unavailable ? "DATABASE_UNAVAILABLE" : "DASHBOARD_STATS_FAILED";
            console.error(
                "Dashboard stats failed:",
                code,
                getDatabaseDiagnosticCode(error)
            );

            return res.status(unavailable ? 503 : 500).json({
                error: unavailable
                    ? "Database is temporarily unavailable. Please retry."
                    : "Failed to fetch dashboard statistics",
                code
            });
        }
    });

    return router;
}

module.exports = createDashboardRouter();
module.exports.createDashboardRouter = createDashboardRouter;