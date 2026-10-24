const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const {
    listEmergencies,
    parseEmergencyListQuery
} = require("../services/emergencyService");
const {
    listAmbulances,
    updateAmbulance
} = require("../services/ambulanceService");
const {
    listHospitals,
    normalizeHospitalUpdates,
    updateHospital
} = require("../services/hospitalService");
const { createAmbulanceRouter } = require("../routes/ambulanceRoutes");
const { createHospitalRouter } = require("../routes/hospitalRoutes");

async function requestJson(router, path, options = {}) {
    const app = express();
    app.use(express.json());
    app.use(router);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
            method: options.method || "GET",
            headers: options.body ? { "Content-Type": "application/json" } : {},
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        return { status: response.status, body: await response.json() };
    } finally {
        await new Promise((resolve, reject) =>
            server.close(error => error ? reject(error) : resolve())
        );
    }
}

test("emergency list joins real assignment details and represents unassigned resources as null", async () => {
    let queryText;
    let queryValues;
    const db = {
        async query(sql, values) {
            queryText = sql;
            queryValues = values;
            return {
                rows: [
                    {
                        id: 41,
                        emergency_type: "Road Accident",
                        location: "Tambaram",
                        status: "Active",
                        assignment_id: 8,
                        assignment_status: "Assigned",
                        ambulance_id: 2,
                        ambulance_vehicle_number: "TN01AB1002",
                        ambulance_status: "Busy",
                        hospital_id: 4,
                        hospital_name: "ABC Hospital",
                        hospital_location: "Tambaram"
                    },
                    {
                        id: 42,
                        emergency_type: "Medical Emergency",
                        location: "Adyar",
                        status: "Active",
                        assignment_id: null,
                        ambulance_id: null,
                        hospital_id: null
                    }
                ]
            };
        }
    };

    const rows = await listEmergencies({ search: "Tambaram" }, db);
    assert.match(queryText, /LEFT JOIN assignments/);
    assert.match(queryText, /LEFT JOIN ambulances/);
    assert.match(queryText, /LEFT JOIN hospitals/);
    assert.match(queryText, /<> ALL/);
    assert.deepEqual(queryValues, [["resolved", "completed"], "%Tambaram%"]);
    assert.equal(rows[0].ambulance.vehicle_number, "TN01AB1002");
    assert.equal(rows[0].hospital.name, "ABC Hospital");
    assert.equal(rows[1].assignment, null);
    assert.equal(rows[1].ambulance, null);
    assert.equal(rows[1].hospital, null);
});

test("history filtering includes only resolved and completed emergencies", async () => {
    let sql;
    let params;
    await listEmergencies({ history: true, status: "Resolved" }, {
        async query(text, values) {
            sql = text;
            params = values;
            return { rows: [] };
        }
    });
    assert.match(sql, / = ANY\(/);
    assert.match(sql, /LOWER\(asg\.status\) = LOWER\(\$2\)/);
    assert.deepEqual(params, [["resolved", "completed"], "Resolved"]);
});

test("emergency list query rejects malformed filters", () => {
    assert.throws(() => parseEmergencyListQuery({ search: ["x"] }), {
        status: 400,
        code: "INVALID_FILTER"
    });
    assert.throws(() => parseEmergencyListQuery({ history: "yes" }), {
        status: 400,
        code: "INVALID_HISTORY_FILTER"
    });
});

test("ambulance list reads backend records and update persists only allowed fields", async () => {
    let capturedSql;
    let capturedValues;
    const updated = { id: 5, vehicle_number: "TN05", latitude: 13.1, longitude: 80.2 };
    const db = {
        async query(sql, values) {
            capturedSql = sql;
            capturedValues = values;
            return { rowCount: 1, rows: [updated] };
        }
    };

    assert.deepEqual(await listAmbulances({
        async query(sql) {
            assert.equal(sql, "SELECT * FROM ambulances ORDER BY id");
            return { rows: [updated] };
        }
    }), [updated]);
    assert.equal(await updateAmbulance("5", {
        latitude: "13.1",
        longitude: 80.2,
        location: "Guindy"
    }, db), updated);
    assert.match(capturedSql, /UPDATE ambulances SET latitude = \$1, longitude = \$2, location = \$3/);
    assert.match(capturedSql, /WHERE id = \$4 RETURNING \*/);
    assert.deepEqual(capturedValues, [13.1, 80.2, "Guindy", 5]);
    await assert.rejects(
        updateAmbulance(5, { longitude: 181 }, db),
        { status: 400, code: "INVALID_COORDINATE" }
    );
    await assert.rejects(
        updateAmbulance(5, { arbitrary_column: "value" }, db),
        { status: 400, code: "INVALID_FIELDS" }
    );
});

test("ambulance update reports missing IDs and backend errors safely", async () => {
    await assert.rejects(
        updateAmbulance(100, { location: "New location" }, {
            async query() { return { rowCount: 0, rows: [] }; }
        }),
        { status: 404, code: "AMBULANCE_NOT_FOUND" }
    );
    await assert.rejects(
        listAmbulances({ async query() { throw new Error("db down"); } }),
        /db down/
    );
});

test("hospital list and room capacity validation use existing details and constraints", async () => {
    const hospital = { id: 3, name: "City Hospital", total_rooms: 8, available_rooms: 4 };
    assert.deepEqual(await listHospitals({
        async query(sql) {
            assert.equal(sql, "SELECT * FROM hospitals ORDER BY id");
            return { rows: [hospital] };
        }
    }), [hospital]);

    assert.deepEqual(normalizeHospitalUpdates({
        total_rooms: "8",
        available_rooms: "4",
        specialties: "Trauma, General"
    }), {
        total_rooms: 8,
        available_rooms: 4,
        specialties: "Trauma, General"
    });
    for (const update of [
        { total_rooms: -1, available_rooms: 0 },
        { total_rooms: 3, available_rooms: 4 },
        { available_rooms: "2.5" }
    ]) {
        assert.throws(() => normalizeHospitalUpdates(update), { status: 400 });
    }
});

test("hospital edits lock, validate, update, and commit in one transaction", async () => {
    const events = [];
    const updated = { id: 3, name: "Updated Hospital", total_rooms: 9, available_rooms: 5 };
    const client = {
        async query(sql, values) {
            const normalized = sql.trim().replace(/\s+/g, " ");
            events.push(normalized);
            if (normalized === "BEGIN" || normalized === "COMMIT") {
                return { rowCount: 0, rows: [] };
            }
            if (normalized.startsWith("SELECT total_rooms")) {
                assert.match(normalized, /FOR UPDATE/);
                return { rowCount: 1, rows: [{ total_rooms: 8, available_rooms: 4 }] };
            }
            if (normalized.startsWith("UPDATE hospitals")) {
                assert.deepEqual(values, [9, 5, 3]);
                return { rowCount: 1, rows: [updated] };
            }
            throw new Error(`Unexpected SQL: ${normalized}`);
        },
        release() { events.push("RELEASE"); }
    };
    const result = await updateHospital(3, {
        total_rooms: 9,
        available_rooms: 5
    }, { async connect() { return client; } });

    assert.equal(result, updated);
    assert.deepEqual(events, [
        "BEGIN",
        "SELECT total_rooms, available_rooms FROM hospitals WHERE id = $1 FOR UPDATE",
        "UPDATE hospitals SET total_rooms = $1, available_rooms = $2 WHERE id = $3 RETURNING *",
        "COMMIT",
        "RELEASE"
    ]);
});

test("hospital edits reject capacity violations and nonexistent records without updates", async () => {
    const events = [];
    const client = {
        async query(sql) {
            const normalized = sql.trim().replace(/\s+/g, " ");
            events.push(normalized);
            if (normalized === "BEGIN" || normalized === "ROLLBACK") {
                return { rowCount: 0, rows: [] };
            }
            if (normalized.startsWith("SELECT total_rooms")) {
                return { rowCount: 1, rows: [{ total_rooms: 2, available_rooms: 1 }] };
            }
            return { rowCount: 0, rows: [] };
        },
        release() { events.push("RELEASE"); }
    };

    await assert.rejects(
        updateHospital(3, { available_rooms: 3 }, {
            async connect() { return client; }
        }),
        { status: 400, code: "INVALID_ROOM_CAPACITY" }
    );
    assert.ok(events.includes("ROLLBACK"));
    assert.ok(!events.some(sql => sql.startsWith("UPDATE hospitals")));

    const missingClient = {
        async query(sql) {
            const normalized = sql.trim();
            if (normalized === "BEGIN" || normalized === "ROLLBACK") {
                return { rowCount: 0, rows: [] };
            }
            return { rowCount: 0, rows: [] };
        },
        release() {}
    };
    await assert.rejects(
        updateHospital(999, { specialties: "Trauma" }, {
            async connect() { return missingClient; }
        }),
        { status: 404, code: "HOSPITAL_NOT_FOUND" }
    );
});

test("management routes return updated records and structured not-found errors", async () => {
    const ambulanceRouter = createAmbulanceRouter({
        update: async (id, body) => ({ id: Number(id), ...body }),
        list: async () => [{ id: 1, vehicle_number: "TN01" }]
    });
    const ambulanceResponse = await requestJson(ambulanceRouter, "/1", {
        method: "PATCH",
        body: { location: "Adyar" }
    });
    assert.equal(ambulanceResponse.status, 200);
    assert.equal(ambulanceResponse.body.data.location, "Adyar");

    const hospitalRouter = createHospitalRouter({
        update: async () => {
            const error = new Error("Hospital was not found.");
            error.status = 404;
            error.code = "HOSPITAL_NOT_FOUND";
            throw error;
        }
    });
    const hospitalResponse = await requestJson(hospitalRouter, "/999", {
        method: "PATCH",
        body: { specialties: "Trauma" }
    });
    assert.equal(hospitalResponse.status, 404);
    assert.equal(hospitalResponse.body.code, "HOSPITAL_NOT_FOUND");
});

test("management routes conceal database errors from clients", async () => {
    const ambulanceRouter = createAmbulanceRouter({
        list: async () => { throw new Error("private database detail"); },
        update: async () => { throw new Error("private update detail"); }
    });
    const ambulanceList = await requestJson(ambulanceRouter, "/");
    const ambulanceUpdate = await requestJson(ambulanceRouter, "/1", {
        method: "PATCH",
        body: { location: "Adyar" }
    });

    assert.equal(ambulanceList.status, 500);
    assert.equal(ambulanceList.body.error, "Failed to retrieve ambulances.");
    assert.equal(ambulanceUpdate.status, 500);
    assert.equal(ambulanceUpdate.body.error, "Failed to update ambulance.");
    assert.doesNotMatch(JSON.stringify(ambulanceUpdate.body), /private update detail/);

    const hospitalRouter = createHospitalRouter({
        list: async () => { throw new Error("private hospital query detail"); },
        update: async () => { throw new Error("private hospital update detail"); }
    });
    const hospitalList = await requestJson(hospitalRouter, "/");
    const hospitalUpdate = await requestJson(hospitalRouter, "/1", {
        method: "PATCH",
        body: { specialties: "Trauma" }
    });
    assert.equal(hospitalList.status, 500);
    assert.equal(hospitalList.body.error, "Failed to retrieve hospitals.");
    assert.equal(hospitalUpdate.status, 500);
    assert.equal(hospitalUpdate.body.error, "Failed to update hospital.");
    assert.doesNotMatch(JSON.stringify(hospitalUpdate.body), /private hospital update detail/);
});
