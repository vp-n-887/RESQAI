const express = require("express");
const {
    listHospitals,
    updateHospital
} = require("../services/hospitalService");

function createHospitalRouter({
    list = listHospitals,
    update = updateHospital
} = {}) {
    const router = express.Router();

    router.get("/", async (req, res) => {
        try {
            const records = await list();
            return res.json({ data: records });
        } catch (error) {
            console.error("Hospital list failed:", error.code || "INTERNAL_ERROR");
            return res.status(500).json({
                error: "Failed to retrieve hospitals.",
                code: "HOSPITAL_LIST_FAILED"
            });
        }
    });

    router.patch("/:id", async (req, res) => {
        try {
            const record = await update(req.params.id, req.body);
            return res.json({ data: record });
        } catch (error) {
            const status = error.status || 500;
            console.error("Hospital update failed:", error.code || "INTERNAL_ERROR");
            return res.status(status).json({
                error: status === 500 ? "Failed to update hospital." : error.message,
                code: error.code || "HOSPITAL_UPDATE_FAILED"
            });
        }
    });

    return router;
}

module.exports = createHospitalRouter();
module.exports.createHospitalRouter = createHospitalRouter;
