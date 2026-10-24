const pool = require("../db/database");
const ApiError = require("./apiError");

const AMBULANCE_UPDATE_FIELDS = new Set([
    "vehicle_number",
    "location",
    "latitude",
    "longitude",
    "ambulance_type",
    "equipment"
]);

function parseCoordinate(value, field, minimum, maximum) {
    if ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")) {
        throw new ApiError(400, "INVALID_COORDINATE", `${field} must be a valid number.`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
        throw new ApiError(
            400,
            "INVALID_COORDINATE",
            `${field} must be between ${minimum} and ${maximum}.`
        );
    }
    return number;
}

function normalizeAmbulanceUpdates(updates) {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        throw new ApiError(400, "INVALID_BODY", "Provide ambulance fields to update.");
    }

    const fields = Object.keys(updates);
    if (fields.length === 0 || fields.some(field => !AMBULANCE_UPDATE_FIELDS.has(field))) {
        throw new ApiError(400, "INVALID_FIELDS", "One or more ambulance fields are not supported.");
    }

    const normalized = {};
    for (const field of fields) {
        const value = updates[field];
        if (field === "latitude") {
            normalized[field] = parseCoordinate(value, field, -90, 90);
        } else if (field === "longitude") {
            normalized[field] = parseCoordinate(value, field, -180, 180);
        } else if (field === "ambulance_type") {
            if (!["Basic", "Advanced"].includes(value)) {
                throw new ApiError(400, "INVALID_AMBULANCE_TYPE", "Ambulance type must be Basic or Advanced.");
            }
            normalized[field] = value;
        } else if (field === "equipment") {
            if (typeof value !== "string") {
                throw new ApiError(400, "INVALID_EQUIPMENT", "Equipment must be text.");
            }
            normalized[field] = value.trim();
        } else {
            if (typeof value !== "string" || value.trim() === "") {
                throw new ApiError(400, "INVALID_FIELD", `${field} must be a non-empty string.`);
            }
            const trimmed = value.trim();
            const maximumLength = field === "vehicle_number" ? 20 : 100;
            if (trimmed.length > maximumLength) {
                throw new ApiError(
                    400,
                    "INVALID_FIELD",
                    `${field} must be ${maximumLength} characters or fewer.`
                );
            }
            normalized[field] = trimmed;
        }
    }
    return normalized;
}

async function listAmbulances(db = pool) {
    const result = await db.query("SELECT * FROM ambulances ORDER BY id");
    return result.rows;
}

function parseRecordId(id, label = "ambulance") {
    if (!/^[1-9]\d*$/.test(String(id))) {
        throw new ApiError(400, "INVALID_ID", `A valid ${label} ID is required.`);
    }
    const value = Number(id);
    if (!Number.isSafeInteger(value)) {
        throw new ApiError(400, "INVALID_ID", `A valid ${label} ID is required.`);
    }
    return value;
}

async function updateAmbulance(id, updates, db = pool) {
    const recordId = parseRecordId(id);
    const normalized = normalizeAmbulanceUpdates(updates);
    const fields = Object.keys(normalized);
    const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
    const values = fields.map(field => normalized[field]);

    values.push(recordId);
    const result = await db.query(
        `UPDATE ambulances SET ${assignments.join(", ")}
         WHERE id = $${values.length} RETURNING *`,
        values
    );

    if (result.rowCount !== 1) {
        throw new ApiError(404, "AMBULANCE_NOT_FOUND", "Ambulance was not found.");
    }
    return result.rows[0];
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

async function findBestAmbulance(emergency, db = pool) {
    const attemptedIds = new Set();

    while (true) {
        const result = await db.query(`
            SELECT *
            FROM ambulances
            WHERE status = 'Available'
        `);

        const available = result.rows.filter(
            ambulance => !attemptedIds.has(ambulance.id)
        );
        if (available.length === 0) {
            const error = new Error("No available ambulances");
            error.code = "NO_AVAILABLE_AMBULANCE";
            throw error;
        }

        const requiresAdvanced =
            emergency.priority === "Critical" ||
            emergency.description.toLowerCase().includes("unconscious");

        let ambulances = available;

        if (requiresAdvanced) {
            const advanced = ambulances.filter(
                ambulance => ambulance.ambulance_type === "Advanced"
            );

            if (advanced.length > 0) {
                ambulances = advanced;
            }
        }

        const scored = ambulances.map(ambulance => {
            const distance = calculateDistance(
                emergency.latitude,
                emergency.longitude,
                Number(ambulance.latitude),
                Number(ambulance.longitude)
            );

            return {
                ...ambulance,
                distance: Number(distance.toFixed(2)),
                eta: Math.ceil(distance * 3)
            };
        });

        scored.sort((a, b) => a.distance - b.distance);

        const candidate = scored[0];
        const reservation = await db.query(
            `
            SELECT *
            FROM ambulances
            WHERE id = $1 AND status = 'Available'
            FOR UPDATE SKIP LOCKED
            `,
            [candidate.id]
        );

        if (reservation.rowCount === 1) {
            return {
                ...reservation.rows[0],
                distance: candidate.distance,
                eta: candidate.eta
            };
        }

        attemptedIds.add(candidate.id);
    }
}

module.exports = {
    findBestAmbulance,
    listAmbulances,
    normalizeAmbulanceUpdates,
    parseRecordId,
    updateAmbulance
};