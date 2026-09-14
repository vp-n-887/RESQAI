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

async function findBestAmbulance(emergency) {

    const result = await pool.query(`
        SELECT *
        FROM ambulances
        WHERE status = 'Available'
    `);

    if (result.rows.length === 0) {
        throw new Error("No available ambulances");
    }

    const requiresAdvanced =
        emergency.priority === "Critical" ||
        emergency.description.toLowerCase().includes("unconscious");

    let ambulances = result.rows;

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

    return scored[0];
}

module.exports = {
    findBestAmbulance
};