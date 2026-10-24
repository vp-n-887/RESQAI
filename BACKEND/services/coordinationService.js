const { findBestAmbulance } = require("./ambulanceService");
const { findBestHospital } = require("./hospitalService");

async function coordinateEmergency(emergency, client) {

    if (!client) {
        throw new Error("A transaction client is required for emergency coordination");
    }

    const ambulance = await findBestAmbulance(emergency, client);
    const hospital = await findBestHospital(emergency, client);

    const assignmentResult = await client.query(
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

    if (assignmentResult.rowCount !== 1) {
        throw new Error("Emergency assignment could not be created");
    }

    const ambulanceResult = await client.query(
        `
        UPDATE ambulances
        SET status = 'Busy'
        WHERE id = $1 AND status = 'Available'
        RETURNING id
        `,
        [ambulance.id]
    );

    if (ambulanceResult.rowCount !== 1) {
        const error = new Error("Ambulance availability changed during reservation");
        error.code = "AMBULANCE_RESERVATION_LOST";
        throw error;
    }

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