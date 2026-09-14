const express = require("express");
const pool = require("../db/database");
const { coordinateEmergency } = require("../services/coordinationService");

const router = express.Router();

router.post("/", async (req, res) => {

    try {

        const {
            emergency_type,
            location,
            latitude,
            longitude,
            patient_count,
            description,
            priority
        } = req.body;

        // Basic validation
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

        // Create emergency in database
        const emergencyResult = await pool.query(
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

        const emergency = emergencyResult.rows[0];

        // Coordinate emergency
        const result = await coordinateEmergency(emergency);

        res.status(201).json({
            message: "Emergency coordinated successfully",
            data: result
        });

    } catch (error) {

        console.error("Emergency coordination error:", error.message);

        res.status(500).json({
            error: "Failed to coordinate emergency",
            details: error.message
        });
    }
});

module.exports = router;