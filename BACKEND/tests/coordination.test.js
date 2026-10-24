const { before, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");

process.env.DATABASE_URL = "";
process.env.DB_USER = "test";
process.env.DB_HOST = "localhost";
process.env.DB_NAME = "test";
process.env.DB_PASSWORD = "test";

let createEmergencyRouter;
let coordinateEmergency;
let findBestAmbulance;
let findBestHospital;
let importer;
let pool;

before(() => {
    createEmergencyRouter = require("../routes/emergencyRoutes").createEmergencyRouter;
    coordinateEmergency = require("../services/coordinationService").coordinateEmergency;
    findBestAmbulance = require("../services/ambulanceService").findBestAmbulance;
    findBestHospital = require("../services/hospitalService").findBestHospital;
    importer = require("../scripts/importCsvToSupabase");
    pool = require("../db/database");
});

const emergencyInput = {
    emergency_type: "Road Accident",
    location: "Tambaram",
    latitude: 12.925,
    longitude: 80.11,
    patient_count: 2,
    description: "Two injured",
    priority: "High"
};

function createFakePool(options = {}) {
    const events = [];
    const availableAmbulances = options.ambulances || [{
        id: 1,
        vehicle_number: "TN01AB1001",
        latitude: "12.9249",
        longitude: "80.1",
        ambulance_type: "Advanced",
        status: "Available"
    }];
    const hospitalRows = options.hospitals === undefined ? [{
        id: 1,
        name: "ABC Hospital",
        latitude: "12.9249",
        longitude: "80.127",
        trauma_care: "Yes",
        icu_available: "Yes",
        available_beds: 5,
        status: "Available"
    }] : options.hospitals;
    const lockedIds = new Set();
    const state = {
        emergencies: [],
        assignments: [],
        ambulanceStatus: Object.fromEntries(
            availableAmbulances.map(ambulance => [ambulance.id, ambulance.status])
        )
    };
    let transactionSnapshot;
    const releaseCalls = [];

    const client = {
        async query(sql, values = []) {
            const normalized = sql.trim().replace(/\s+/g, " ");
            events.push({ sql: normalized, values });

            if (normalized === "BEGIN") {
                transactionSnapshot = structuredClone(state);
                return { rowCount: 0, rows: [] };
            }
            if (normalized === "COMMIT") {
                transactionSnapshot = undefined;
                return { rowCount: 0, rows: [] };
            }
            if (normalized === "ROLLBACK") {
                if (options.rollbackFailure) {
                    const error = new Error("simulated rollback failure");
                    error.code = "ROLLBACK_FAILED";
                    throw error;
                }
                Object.assign(state, transactionSnapshot);
                transactionSnapshot = undefined;
                return { rowCount: 0, rows: [] };
            }
            if (normalized.startsWith("INSERT INTO emergencies")) {
                const emergency = { ...emergencyInput, ...Object.fromEntries(
                    ["emergency_type", "location", "latitude", "longitude",
                        "patient_count", "description", "priority", "status"]
                        .map((field, index) => [field, values[index]])
                ), id: 10 };
                state.emergencies.push(emergency);
                return {
                    rowCount: 1,
                    rows: [emergency]
                };
            }
            if (normalized.includes("FROM ambulances") &&
                normalized.includes("FOR UPDATE SKIP LOCKED")) {
                const [id] = values;
                if (options.lockedAmbulanceIds?.includes(id) || lockedIds.has(id)) {
                    return { rowCount: 0, rows: [] };
                }
                const row = availableAmbulances.find(
                    ambulance => ambulance.id === id && ambulance.status === "Available"
                );
                if (!row) {
                    return { rowCount: 0, rows: [] };
                }
                lockedIds.add(id);
                return { rowCount: 1, rows: [row] };
            }
            if (normalized.includes("FROM ambulances")) {
                return { rowCount: availableAmbulances.length, rows: availableAmbulances };
            }
            if (normalized.includes("FROM hospitals")) {
                return { rowCount: hospitalRows.length, rows: hospitalRows };
            }
            if (normalized.startsWith("INSERT INTO assignments")) {
                if (options.assignmentFailure) {
                    throw new Error("simulated database detail must not reach the client");
                }
                const assignment = {
                    id: 20,
                    emergency_id: values[0],
                    ambulance_id: values[1],
                    hospital_id: values[2],
                    ambulance_eta: values[3],
                    hospital_eta: values[4],
                    status: values[5]
                };
                state.assignments.push(assignment);
                return {
                    rowCount: 1,
                    rows: [assignment]
                };
            }
            if (normalized.startsWith("UPDATE ambulances")) {
                if (options.statusUpdateFailure) {
                    return { rowCount: 0, rows: [] };
                }
                state.ambulanceStatus[values[0]] = "Busy";
                return { rowCount: 1, rows: [{ id: values[0] }] };
            }
            throw new Error(`Unexpected fake query: ${normalized}`);
        },
        release(error) {
            events.push({ sql: "RELEASE" });
            releaseCalls.push(error);
        }
    };

    return {
        events,
        state,
        releaseCalls,
        client,
        pool: {
            async connect() {
                events.push({ sql: "CONNECT" });
                return client;
            }
        }
    };
}

async function postEmergency(database, coordinate = coordinateEmergency) {
    const app = express();
    app.use(express.json());
    app.use(createEmergencyRouter({ database, coordinate }));

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(emergencyInput)
        });
        return {
            status: response.status,
            body: await response.json()
        };
    } finally {
        await new Promise((resolve, reject) =>
            server.close(error => error ? reject(error) : resolve())
        );
    }
}

test("successful coordination commits emergency, assignment, and ambulance update", async () => {
    const fake = createFakePool();
    const response = await postEmergency(fake.pool);

    assert.equal(response.status, 201);
    assert.equal(response.body.data.emergency.id, 10);
    assert.equal(response.body.data.assignment.emergency_id, 10);
    assert.ok(fake.events.some(event => event.sql === "COMMIT"));
    assert.ok(!fake.events.some(event => event.sql === "ROLLBACK"));
    assert.ok(fake.events.some(event => event.sql.startsWith("UPDATE ambulances")));
    assert.equal(fake.events.at(-1).sql, "RELEASE");
    assert.equal(fake.releaseCalls.length, 1);
    assert.equal(fake.releaseCalls[0], undefined);
    assert.match(
        fake.events.find(event => event.sql.includes("FOR UPDATE SKIP LOCKED")).sql,
        /FOR UPDATE SKIP LOCKED/
    );
    assert.match(
        fake.events.find(event => event.sql.startsWith("UPDATE ambulances")).sql,
        /status = 'Available'/
    );
});

test("failure after emergency insertion rolls back and releases the client once", async () => {
    const fake = createFakePool();
    const coordinationError = new Error("coordination failed after emergency creation");
    const response = await postEmergency(fake.pool, async () => {
        throw coordinationError;
    });

    assert.equal(response.status, 500);
    assert.deepEqual(fake.state.emergencies, []);
    assert.deepEqual(fake.state.assignments, []);
    assert.equal(fake.state.ambulanceStatus[1], "Available");
    assert.ok(fake.events.some(event => event.sql === "ROLLBACK"));
    assert.ok(!fake.events.some(event => event.sql === "COMMIT"));
    assert.equal(fake.releaseCalls.length, 1);
    assert.equal(fake.releaseCalls[0], undefined);
});

test("no available ambulance rolls back the new emergency", async () => {
    const fake = createFakePool({ ambulances: [] });
    const response = await postEmergency(fake.pool);

    assert.equal(response.status, 503);
    assert.match(response.body.error, /No available ambulance/);
    assert.ok(fake.events.some(event => event.sql === "ROLLBACK"));
    assert.ok(!fake.events.some(event => event.sql.startsWith("INSERT INTO assignments")));
    assert.deepEqual(fake.state.emergencies, []);
    assert.equal(fake.releaseCalls.length, 1);
});

test("no suitable hospital rolls back without creating an assignment", async () => {
    const fake = createFakePool({ hospitals: [] });
    const response = await postEmergency(fake.pool);

    assert.equal(response.status, 503);
    assert.match(response.body.error, /No suitable hospital/);
    assert.ok(fake.events.some(event => event.sql === "ROLLBACK"));
    assert.ok(!fake.events.some(event => event.sql.startsWith("INSERT INTO assignments")));
    assert.deepEqual(fake.state.emergencies, []);
    assert.equal(fake.releaseCalls.length, 1);
});

test("assignment insert failure rolls back and does not expose SQL details", async () => {
    const fake = createFakePool({ assignmentFailure: true });
    const response = await postEmergency(fake.pool);

    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Failed to coordinate emergency. Please try again.");
    assert.ok(!JSON.stringify(response.body).includes("simulated database detail"));
    assert.ok(fake.events.some(event => event.sql === "ROLLBACK"));
    assert.ok(!fake.events.some(event => event.sql === "COMMIT"));
    assert.deepEqual(fake.state.emergencies, []);
    assert.deepEqual(fake.state.assignments, []);
    assert.equal(fake.state.ambulanceStatus[1], "Available");
    assert.equal(fake.releaseCalls.length, 1);
});

test("ambulance status update failure rolls back the assignment", async () => {
    const fake = createFakePool({ statusUpdateFailure: true });
    const response = await postEmergency(fake.pool);

    assert.equal(response.status, 409);
    assert.match(response.body.error, /availability changed/);
    assert.ok(fake.events.some(event => event.sql === "ROLLBACK"));
    assert.ok(!fake.events.some(event => event.sql === "COMMIT"));
    assert.deepEqual(fake.state.emergencies, []);
    assert.deepEqual(fake.state.assignments, []);
    assert.equal(fake.state.ambulanceStatus[1], "Available");
    assert.equal(fake.releaseCalls.length, 1);
});

test("rollback failure destroys the client and preserves the original failure response", async () => {
    const fake = createFakePool({ rollbackFailure: true });
    const response = await postEmergency(fake.pool, async () => {
        const error = new Error("original coordination failure");
        error.code = "NO_AVAILABLE_AMBULANCE";
        throw error;
    });

    assert.equal(response.status, 503);
    assert.match(response.body.error, /No available ambulance/);
    assert.equal(fake.releaseCalls.length, 1);
    assert.equal(fake.releaseCalls[0].code, "ROLLBACK_FAILED");
});

test("ambulance ranking retries the next candidate when the top candidate is locked", async () => {
    const candidates = [
        {
            id: 1, vehicle_number: "NEAREST", latitude: 12.925,
            longitude: 80.11, ambulance_type: "Advanced", status: "Available"
        },
        {
            id: 2, vehicle_number: "NEXT", latitude: 12.93,
            longitude: 80.12, ambulance_type: "Advanced", status: "Available"
        }
    ];
    const fake = createFakePool({
        ambulances: candidates,
        lockedAmbulanceIds: [1]
    });

    const selected = await findBestAmbulance(
        { ...emergencyInput, priority: "High" },
        fake.client
    );

    assert.equal(selected.id, 2);
    assert.ok(fake.events.filter(event =>
        event.sql.includes("FOR UPDATE SKIP LOCKED")
    ).length >= 2);
});

test("hospital selection retains trauma preference and distance-based ETA", async () => {
    const fake = createFakePool({
        hospitals: [
            {
                id: 1, name: "Near non-trauma", latitude: 12.925,
                longitude: 80.11, trauma_care: "No", icu_available: "Yes",
                available_beds: 2, status: "Available"
            },
            {
                id: 2, name: "Trauma center", latitude: 12.93,
                longitude: 80.12, trauma_care: "Yes", icu_available: "Yes",
                available_beds: 2, status: "Available"
            }
        ]
    });

    const selected = await findBestHospital(emergencyInput, fake.client);
    assert.equal(selected.id, 2);
    assert.equal(selected.eta, Math.ceil(selected.distance * 3));
});

test("CSV parser preserves quoted commas, reads existing datasets, and validates numbers", async () => {
    const ambulanceCsv = await importer.readCsvDataset(importer.DATASETS[0]);
    const hospitalCsv = await importer.readCsvDataset(importer.DATASETS[1]);
    const emergencyCsv = await importer.readCsvDataset(importer.DATASETS[2]);

    assert.equal(ambulanceCsv.rowsRead, 20);
    assert.equal(hospitalCsv.rowsRead, 15);
    assert.equal(emergencyCsv.rowsRead, 10);
    assert.equal(ambulanceCsv.rows[0].equipment, "Advanced, Ventilator");
    assert.equal(ambulanceCsv.rows[0].latitude, 12.9249);
    assert.throws(
        () => importer.normalizeRow({
            ...ambulanceCsv.rows[0],
            id: "not-a-number"
        }, importer.DATASETS[0], 2),
        /invalid id/
    );
    assert.equal(
        importer.normalizeRow({
            ...ambulanceCsv.rows[0],
            status: "available"
        }, importer.DATASETS[0], 2).status,
        "Available"
    );
    assert.throws(
        () => importer.normalizeRow({
            ...ambulanceCsv.rows[0],
            status: "offline"
        }, importer.DATASETS[0], 2),
        /invalid status/
    );
});

test("re-running the CSV import skips identical existing records", async () => {
    const dataset = importer.DATASETS[0];
    const parsed = await importer.readCsvDataset(dataset);
    const queries = [];
    const client = {
        async query(sql, values = []) {
            const normalized = sql.trim().replace(/\s+/g, " ");
            queries.push(normalized);
            if (normalized === "BEGIN" || normalized === "COMMIT") {
                return { rowCount: 0, rows: [] };
            }
            if (normalized.startsWith("SELECT pg_get_serial_sequence")) {
                return { rowCount: 1, rows: [{ sequence_name: null }] };
            }
            if (normalized.startsWith("SELECT ")) {
                const row = parsed.rows.find(
                    existing => existing.id === Number(values[0]) ||
                        existing.vehicle_number === values[1]
                );
                return { rowCount: 1, rows: [row] };
            }
            throw new Error(`Unexpected fake query: ${normalized}`);
        }
    };

    const report = await importer.importDataset(client, dataset, false);
    assert.equal(report.read, 20);
    assert.equal(report.inserted, 0);
    assert.equal(report.skipped, 20);
    assert.equal(report.rejected, 0);
    assert.ok(!queries.some(query => query.startsWith("INSERT INTO")));
});

test("Supabase connection settings enforce SSL without printing credentials", () => {
    const config = pool.createPoolConfig({
        DATABASE_URL: "postgresql://user:encoded%40password@db.example.supabase.co:5432/postgres",
        DB_POOL_MAX: "7"
    });

    assert.equal(typeof config.ssl, "object");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.max, 7);
    assert.equal(config.connectionString.includes("encoded%40password"), true);
});
