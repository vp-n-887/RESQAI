const pool = require("../db/database");
const ApiError = require("./apiError");

const COMPLETED_STATUSES = ["resolved", "completed"];

async function listEmergencies({ search = "", status = "", history = false } = {}, db = pool) {
    const conditions = [];
    const values = [];

    values.push(COMPLETED_STATUSES);
    conditions.push(history
        ? `LOWER(COALESCE(e.status, '')) = ANY($${values.length}::text[])`
        : `LOWER(COALESCE(e.status, '')) <> ALL($${values.length}::text[])`);

    if (status) {
        values.push(status);
        conditions.push(`(
            LOWER(e.status) = LOWER($${values.length})
            OR LOWER(asg.status) = LOWER($${values.length})
        )`);
    }

    if (search) {
        values.push(`%${search}%`);
        const parameter = `$${values.length}`;
        conditions.push(`(
            CAST(e.id AS TEXT) ILIKE ${parameter}
            OR e.emergency_type ILIKE ${parameter}
            OR e.location ILIKE ${parameter}
            OR e.description ILIKE ${parameter}
        )`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await db.query(
        `
        SELECT
            e.id,
            e.emergency_type,
            e.location,
            e.latitude,
            e.longitude,
            e.patient_count,
            e.description,
            e.priority,
            e.status,
            e.created_at,
            asg.id AS assignment_id,
            asg.status AS assignment_status,
            asg.ambulance_eta,
            asg.hospital_eta,
            a.id AS ambulance_id,
            a.vehicle_number AS ambulance_vehicle_number,
            a.status AS ambulance_status,
            h.id AS hospital_id,
            h.name AS hospital_name,
            h.location AS hospital_location
        FROM emergencies AS e
        LEFT JOIN assignments AS asg ON asg.emergency_id = e.id
        LEFT JOIN ambulances AS a ON a.id = asg.ambulance_id
        LEFT JOIN hospitals AS h ON h.id = asg.hospital_id
        ${where}
        ORDER BY e.created_at DESC NULLS LAST, e.id DESC
        `,
        values
    );

    return result.rows.map(row => ({
        id: row.id,
        emergency_type: row.emergency_type,
        location: row.location,
        latitude: row.latitude,
        longitude: row.longitude,
        patient_count: row.patient_count,
        description: row.description,
        priority: row.priority,
        status: row.status,
        created_at: row.created_at,
        assignment: row.assignment_id == null ? null : {
            id: row.assignment_id,
            status: row.assignment_status,
            ambulance_eta: row.ambulance_eta,
            hospital_eta: row.hospital_eta
        },
        ambulance: row.ambulance_id == null ? null : {
            id: row.ambulance_id,
            vehicle_number: row.ambulance_vehicle_number,
            status: row.ambulance_status
        },
        hospital: row.hospital_id == null ? null : {
            id: row.hospital_id,
            name: row.hospital_name,
            location: row.hospital_location
        }
    }));
}

function parseEmergencyListQuery(query) {
    if ((query.search !== undefined && typeof query.search !== "string") ||
        (query.status !== undefined && typeof query.status !== "string")) {
        throw new ApiError(400, "INVALID_FILTER", "Search and status filters must be text.");
    }
    const search = query.search?.trim() || "";
    const status = query.status?.trim() || "";
    const rawHistory = query.history;

    if (search.length > 100) {
        throw new ApiError(400, "INVALID_SEARCH", "Search must be 100 characters or fewer.");
    }
    if (status.length > 30) {
        throw new ApiError(400, "INVALID_STATUS", "Status must be 30 characters or fewer.");
    }
    if (rawHistory !== undefined && rawHistory !== "true" && rawHistory !== "false") {
        throw new ApiError(400, "INVALID_HISTORY_FILTER", "History must be true or false.");
    }

    return { search, status, history: rawHistory === "true" };
}

module.exports = {
    listEmergencies,
    parseEmergencyListQuery
};
