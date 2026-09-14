const pool = require("./db/database");

async function testConnection() {
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("✅ PostgreSQL connected!");
        console.log("Database time:", result.rows[0]);
    } catch (error) {
        console.error("❌ Database connection failed:");
        console.error(error.message);
    } finally {
        await pool.end();
    }
}

testConnection();