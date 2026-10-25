async function testConnection() {
    let pool;

    try {
        pool = require("./db/database");
        const result = await pool.query("SELECT NOW() AS database_time");
        await pool.query(`
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status = 'Available') AS available,
                   COUNT(*) FILTER (WHERE status = 'Busy') AS busy
            FROM ambulances
        `);
        await pool.query(`
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status = 'Available') AS available,
                   COUNT(*) FILTER (WHERE status = 'Full') AS full
            FROM hospitals
        `);
        await pool.query(`
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status = 'Active') AS active
            FROM emergencies
        `);
        console.log("PostgreSQL connection and dashboard queries verified.");
        console.log("Database time:", result.rows[0].database_time);
    } catch (error) {
        const {
            getDatabaseDiagnosticCode,
            isDatabaseConnectionError
        } = require("./services/databaseError");
        if (isDatabaseConnectionError(error)) {
            console.error(
                "PostgreSQL is unreachable or timed out. Verify database network access, endpoint/port, and SSL configuration.",
                getDatabaseDiagnosticCode(error)
            );
        } else {
            console.error(
                "Database configuration or query failed:",
                getDatabaseDiagnosticCode(error)
            );
        }
        process.exitCode = 1;
    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

testConnection();