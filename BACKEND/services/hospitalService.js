const pool = require("../db/database");

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

async function findBestHospital(emergency) {

    const result = await pool.query(`
        SELECT *
        FROM hospitals
        WHERE status = 'Available'
        AND available_beds > 0
    `);

    if (result.rows.length === 0) {
        throw new Error("No suitable hospitals available");
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
    findBestHospital
};