const express = require("express");
const pool = require("../db/database");

const router = express.Router();

router.get("/stats", async (req, res) => {
    try {
        const ambulanceResult = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'Available') AS available,
                COUNT(*) FILTER (WHERE status = 'Busy') AS busy
            FROM ambulances
        `);

        const hospitalResult = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'Available') AS available,
                COUNT(*) FILTER (WHERE status = 'Full') AS full
            FROM hospitals
        `);

        const emergencyResult = await pool.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'Active') AS active
            FROM emergencies
        `);

        res.json({
            ambulances: ambulanceResult.rows[0],
            hospitals: hospitalResult.rows[0],
            emergencies: emergencyResult.rows[0]
        });

    } catch (error) {
        console.error("Dashboard stats error:", error.message);

        res.status(500).json({
            error: "Failed to fetch dashboard statistics"
        });
    }
});

module.exports = router;