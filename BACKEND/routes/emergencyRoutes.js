const express = require("express");
const pool = require("../db/database");
const { coordinateEmergency } = require("../services/coordinationService");
const { listEmergencies, parseEmergencyListQuery } = require("../services/emergencyService");
const {
    getDatabaseDiagnosticCode,
    isDatabaseConnectionError
} = require("../services/databaseError");

function createEmergencyRouter({
    database = pool,
    coordinate = coordinateEmergency,
    list = listEmergencies
} = {}) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        try {
            const filters = parseEmergencyListQuery(req.query);
            const records = await list(filters, database);
            return res.json({ data: records });
        } catch (error) {
            const unavailable = isDatabaseConnectionError(error);
            const code = unavailable
                ? "DATABASE_UNAVAILABLE"
                : error.code || "EMERGENCY_LIST_FAILED";
            console.error(
                "Emergency list failed:",
                code,
                getDatabaseDiagnosticCode(error)
            );
            return res.status(unavailable ? 503 : error.status || 500).json({
                error: unavailable
                    ? "Database is temporarily unavailable. Please retry."
                    : error.message && error.status
                        ? error.message
                        : "Failed to retrieve emergencies.",
                code
            });
        }
    });

    router.post("/", async (req, res) => {
        const {
            emergency_type,
            location,
            latitude,
            longitude,
            patient_count,
            description,
            priority
        } = req.body;

        if (
            !emergency_type ||
            !location ||
            latitude === undefined ||
            longitude === undefined ||
            !patient_count ||
            !description
        ) {
            return res.status(400).json({
                error: "Missing emergency information"
            });
        }

        let client;
        let commitSucceeded = false;
        let clientReleaseError;
        let response;

        try {
            client = await database.connect();
            await client.query("BEGIN");

            const emergencyResult = await client.query(
                `
                INSERT INTO emergencies
                (
                    emergency_type,
                    location,
                    latitude,
                    longitude,
                    patient_count,
                    description,
                    priority,
                    status
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING *
                `,
                [
                    emergency_type,
                    location,
                    latitude,
                    longitude,
                    patient_count,
                    description,
                    priority || "Medium",
                    "Active"
                ]
            );

            if (emergencyResult.rowCount !== 1) {
                throw new Error("Emergency could not be created");
            }

            const result = await coordinate(emergencyResult.rows[0], client);
            await client.query("COMMIT");
            commitSucceeded = true;

            response = {
                status: 201,
                body: {
                    message: "Emergency coordinated successfully",
                    data: result
                }
            };
        } catch (error) {
            if (client && !commitSucceeded) {
                try {
                    await client.query("ROLLBACK");
                } catch (rollbackError) {
                    clientReleaseError = rollbackError;
                    console.error(
                        "Emergency rollback failed:",
                        rollbackError.code || "UNKNOWN"
                    );
                }
            }

            const messages = {
                NO_AVAILABLE_AMBULANCE: {
                    status: 503,
                    message: "No available ambulance can be assigned right now."
                },
                NO_SUITABLE_HOSPITAL: {
                    status: 503,
                    message: "No suitable hospital is currently available."
                },
                AMBULANCE_RESERVATION_LOST: {
                    status: 409,
                    message: "Ambulance availability changed; please retry."
                }
            };
            const failure = messages[error.code] || {
                status: 500,
                message: "Failed to coordinate emergency. Please try again."
            };
            const unavailable = isDatabaseConnectionError(error);
            const status = unavailable ? 503 : failure.status;
            const message = unavailable
                ? "Database is temporarily unavailable. Please retry."
                : failure.message;
            if (unavailable) {
                if (!clientReleaseError) {
                    clientReleaseError = error;
                }
            }

            console.error(
                "Emergency coordination failed:",
                unavailable ? "DATABASE_UNAVAILABLE" : "COORDINATION_FAILED",
                getDatabaseDiagnosticCode(error)
            );
            response = {
                status,
                body: {
                    error: message,
                    details: message,
                    code: unavailable
                        ? "DATABASE_UNAVAILABLE"
                        : error.code || "COORDINATION_FAILED"
                }
            };
        } finally {
            if (client) {
                client.release(clientReleaseError);
            }
        }

        return res.status(response.status).json(response.body);
    });

    return router;
}

module.exports = createEmergencyRouter();
module.exports.createEmergencyRouter = createEmergencyRouter;