const express = require("express");
const {
    listAmbulances,
    updateAmbulance
} = require("../services/ambulanceService");

function createAmbulanceRouter({
    list = listAmbulances,
    update = updateAmbulance
} = {}) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        try {
            const records = await list();
            return res.json({ data: records });
        } catch (error) {
            console.error("Ambulance list failed:", error.code || "INTERNAL_ERROR");
            return res.status(500).json({
                error: "Failed to retrieve ambulances.",
                code: "AMBULANCE_LIST_FAILED"
            });
        }
    });

    router.patch("/:id", async (req, res) => {
        try {
            const record = await update(req.params.id, req.body);
            return res.json({ data: record });
        } catch (error) {
            const status = error.status || 500;
            console.error("Ambulance update failed:", error.code || "INTERNAL_ERROR");
            return res.status(status).json({
                error: status === 500 ? "Failed to update ambulance." : error.message,
                code: error.code || "AMBULANCE_UPDATE_FAILED"
            });
        }
    });

    return router;
}

module.exports = createAmbulanceRouter();
module.exports.createAmbulanceRouter = createAmbulanceRouter;
