const pool = require("../db/database");
const ApiError = require("./apiError");
const { parseRecordId } = require("./ambulanceService");

const HOSPITAL_UPDATE_FIELDS = new Set([
    "name",
    "location",
    "latitude",
    "longitude",
    "trauma_care",
    "icu_available",
    "available_beds",
    "specialties",
    "status",
    "total_rooms",
    "available_rooms"
]);

function parseHospitalInteger(value, field) {
    if ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")) {
        throw new ApiError(400, "INVALID_NUMBER", `${field} must be a non-negative integer.`);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
        throw new ApiError(400, "INVALID_NUMBER", `${field} must be a non-negative integer.`);
    }
    return number;
}

function normalizeHospitalUpdates(updates) {
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        throw new ApiError(400, "INVALID_BODY", "Provide hospital fields to update.");
    }

    const fields = Object.keys(updates);
    if (fields.length === 0 || fields.some(field => !HOSPITAL_UPDATE_FIELDS.has(field))) {
        throw new ApiError(400, "INVALID_FIELDS", "One or more hospital fields are not supported.");
    }

    const normalized = {};
    for (const field of fields) {
        const value = updates[field];
        if (field === "latitude") {
            normalized[field] = parseHospitalCoordinate(value, field, -90, 90);
        } else if (field === "longitude") {
            normalized[field] = parseHospitalCoordinate(value, field, -180, 180);
        } else if (["available_beds", "total_rooms", "available_rooms"].includes(field)) {
            normalized[field] = parseHospitalInteger(value, field);
        } else if (["trauma_care", "icu_available"].includes(field)) {
            if (!["Yes", "No"].includes(value)) {
                throw new ApiError(400, "INVALID_FACILITY", `${field} must be Yes or No.`);
            }
            normalized[field] = value;
        } else if (field === "status") {
            if (!["Available", "Full"].includes(value)) {
                throw new ApiError(400, "INVALID_STATUS", "Status must be Available or Full.");
            }
            normalized[field] = value;
        } else {
            if (typeof value !== "string" || value.trim() === "") {
                throw new ApiError(400, "INVALID_FIELD", `${field} must be a non-empty string.`);
            }
            const trimmed = value.trim();
            const maximumLength = field === "name" ? 150 : 100;
            if (field !== "specialties" && trimmed.length > maximumLength) {
                throw new ApiError(
                    400,
                    "INVALID_FIELD",
                    `${field} must be ${maximumLength} characters or fewer.`
                );
            }
            normalized[field] = trimmed;
        }
    }
    if (normalized.total_rooms !== undefined &&
        normalized.available_rooms !== undefined &&
        normalized.available_rooms > normalized.total_rooms) {
        throw new ApiError(
            400,
            "INVALID_ROOM_CAPACITY",
            "Available rooms cannot exceed total rooms."
        );
    }
    return normalized;
}

function parseHospitalCoordinate(value, field, minimum, maximum) {
    if ((typeof value !== "number" && typeof value !== "string") ||
        (typeof value === "string" && value.trim() === "")) {
        throw new ApiError(400, "INVALID_COORDINATE", `${field} must be a valid number.`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
        throw new ApiError(400, "INVALID_COORDINATE", `${field} must be between ${minimum} and ${maximum}.`);
    }
    return number;
}

async function listHospitals(db = pool) {
    const result = await db.query("SELECT * FROM hospitals ORDER BY id");
    return result.rows;
}

async function updateHospital(id, updates, db = pool) {
    const recordId = parseRecordId(id, "hospital");
    const normalized = normalizeHospitalUpdates(updates);
    const fields = Object.keys(normalized);
    let client;
    let transactionStarted = false;
    let releaseError;

    try {
        client = await db.connect();
        await client.query("BEGIN");
        transactionStarted = true;

        const currentResult = await client.query(
            `SELECT total_rooms, available_rooms
             FROM hospitals WHERE id = $1
             FOR UPDATE`,
            [recordId]
        );
        if (currentResult.rowCount !== 1) {
            throw new ApiError(404, "HOSPITAL_NOT_FOUND", "Hospital was not found.");
        }

        const current = currentResult.rows[0];
        const totalRooms = normalized.total_rooms ?? current.total_rooms;
        const availableRooms = normalized.available_rooms ?? current.available_rooms;
        if ((normalized.total_rooms !== undefined || normalized.available_rooms !== undefined) &&
            (totalRooms == null || availableRooms == null)) {
            throw new ApiError(
                400,
                "ROOM_CAPACITY_REQUIRED",
                "Set both total rooms and available rooms before saving room capacity."
            );
        }
        if (totalRooms != null && availableRooms != null &&
            availableRooms > totalRooms) {
            throw new ApiError(
                400,
                "INVALID_ROOM_CAPACITY",
                "Available rooms cannot exceed total rooms."
            );
        }

        const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
        const values = fields.map(field => normalized[field]);
        values.push(recordId);
        const result = await client.query(
            `UPDATE hospitals SET ${assignments.join(", ")}
             WHERE id = $${values.length} RETURNING *`,
            values
        );
        if (result.rowCount !== 1) {
            throw new ApiError(404, "HOSPITAL_NOT_FOUND", "Hospital was not found.");
        }

        await client.query("COMMIT");
        transactionStarted = false;
        return result.rows[0];
    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                releaseError = rollbackError;
                console.error("Hospital update rollback failed:", rollbackError.code || "UNKNOWN");
            }
        }
        throw error;
    } finally {
        if (client) {
            client.release(releaseError);
        }
    }
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

async function findBestHospital(emergency, db = pool) {

    const result = await db.query(`
        SELECT *
        FROM hospitals
        WHERE status = 'Available'
        AND available_beds > 0
    `);

    if (result.rows.length === 0) {
        const error = new Error("No suitable hospitals available");
        error.code = "NO_SUITABLE_HOSPITAL";
        throw error;
    }

    const requiresTrauma =
        emergency.emergency_type === "Road Accident";

    const requiresICU =
        emergency.priority === "Critical" ||
        emergency.description.toLowerCase().includes("unconscious");

    let hospitals = result.rows;

    if (requiresTrauma) {
        const traumaHospitals = hospitals.filter(
            hospital => hospital.trauma_care === "Yes"
        );

        if (traumaHospitals.length > 0) {
            hospitals = traumaHospitals;
        }
    }

    if (requiresICU) {
        const icuHospitals = hospitals.filter(
            hospital => hospital.icu_available === "Yes"
        );

        if (icuHospitals.length > 0) {
            hospitals = icuHospitals;
        }
    }

    const scored = hospitals.map(hospital => {

        const distance = calculateDistance(
            emergency.latitude,
            emergency.longitude,
            Number(hospital.latitude),
            Number(hospital.longitude)
        );

        return {
            ...hospital,
            distance: Number(distance.toFixed(2)),
            eta: Math.ceil(distance * 3)
        };
    });

    scored.sort((a, b) => a.distance - b.distance);

    return scored[0];
}

module.exports = {
    findBestHospital,
    listHospitals,
    normalizeHospitalUpdates,
    updateHospital
};