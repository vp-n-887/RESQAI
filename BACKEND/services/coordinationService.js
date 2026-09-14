const pool = require("../db/database");
const { findBestAmbulance } = require("./ambulanceService");
const { findBestHospital } = require("./hospitalService");

async function coordinateEmergency(emergency) {

    console.log("🚨 Coordinating emergency...");

    const ambulance = await findBestAmbulance(emergency);

    console.log(`🚑 Ambulance selected: ${ambulance.vehicle_number}`);

    const hospital = await findBestHospital(emergency);

    console.log(`🏥 Hospital selected: ${hospital.name}`);

    const assignmentResult = await pool.query(
        `
        INSERT INTO assignments
        (emergency_id, ambulance_id, hospital_id, ambulance_eta, hospital_eta, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        `,
        [
            emergency.id,
            ambulance.id,
            hospital.id,
            ambulance.eta,
            hospital.eta,
            "Assigned"
        ]
    );

    await pool.query(
        `
        UPDATE ambulances
        SET status = 'Busy'
        WHERE id = $1
        `,
        [ambulance.id]
    );

    return {
        emergency,
        ambulance,
        hospital,
        assignment: assignmentResult.rows[0]
    };
}

module.exports = {
    coordinateEmergency
};