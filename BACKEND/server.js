const express = require("express");
const cors = require("cors");
require("dotenv").config();

const emergencyRoutes = require("./routes/emergencyRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "RESQAI Backend is running 🚑"
    });
});

app.use("/api/emergencies", emergencyRoutes);
app.use("/api/dashboard", dashboardRoutes);

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`🚑 RESQAI Backend running on port ${PORT}`);
});