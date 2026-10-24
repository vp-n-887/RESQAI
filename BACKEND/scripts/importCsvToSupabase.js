const fs = require("node:fs");
const path = require("node:path");
const csv = require("csv-parser");

const DATA_DIRECTORY = path.resolve(__dirname, "..", "DATA");
const DATASETS = [
    {
        table: "ambulances",
        file: "resqai_ambulances.csv",
        columns: [
            "id", "vehicle_number", "location", "latitude", "longitude",
            "status", "ambulance_type", "equipment"
        ],
        required: [
            "id", "vehicle_number", "location", "latitude", "longitude",
            "status", "ambulance_type"
        ],
        numeric: ["id", "latitude", "longitude"],
        canonical: {
            status: ["Available", "Busy"],
            ambulance_type: ["Basic", "Advanced"]
        },
        naturalKey: "vehicle_number"
    },
    {
        table: "hospitals",
        file: "resqai_hospitals.csv",
        columns: [
            "id", "name", "location", "latitude", "longitude", "trauma_care",
            "icu_available", "available_beds", "specialties", "status"
        ],
        required: [
            "id", "name", "location", "latitude", "longitude",
            "available_beds", "status"
        ],
        numeric: ["id", "latitude", "longitude", "available_beds"],
        canonical: {
            status: ["Available", "Full"],
            trauma_care: ["Yes", "No"],
            icu_available: ["Yes", "No"]
        },
        naturalKey: "name"
    },
    {
        table: "emergencies",
        file: "resqai_emergencies.csv",
        columns: [
            "id", "emergency_type", "location", "latitude", "longitude",
            "patient_count", "description", "priority", "status"
        ],
        required: [
            "id", "emergency_type", "location", "latitude", "longitude",
            "patient_count", "description", "priority", "status"
        ],
        numeric: ["id", "latitude", "longitude", "patient_count"],
        canonical: {
            priority: ["Critical", "High", "Medium", "Low"],
            status: ["Active", "Resolved"]
        }
    }
];

function normalizeRow(row, dataset, lineNumber) {
    const normalized = {};

    for (const column of dataset.columns) {
        const value = row[column] === undefined ? "" : String(row[column]).trim();
        if (value === "") {
            if (dataset.required.includes(column)) {
                throw new Error(`line ${lineNumber}: missing ${column}`);
            }
            normalized[column] = null;
            continue;
        }

        if (dataset.numeric.includes(column)) {
            const number = Number(value);
            if (!Number.isFinite(number)) {
                throw new Error(`line ${lineNumber}: invalid ${column}`);
            }
            if (column === "id" && (!Number.isInteger(number) || number < 1)) {
                throw new Error(`line ${lineNumber}: invalid ${column}`);
            }
            if (column === "available_beds" &&
                (!Number.isInteger(number) || number < 0)) {
                throw new Error(`line ${lineNumber}: invalid ${column}`);
            }
            if (column === "patient_count" &&
                (!Number.isInteger(number) || number < 1)) {
                throw new Error(`line ${lineNumber}: invalid ${column}`);
            }
            if ((column === "latitude" && (number < -90 || number > 90)) ||
                (column === "longitude" && (number < -180 || number > 180))) {
                throw new Error(`line ${lineNumber}: invalid ${column}`);
            }
            normalized[column] = number;
        } else {
            const acceptedValues = dataset.canonical?.[column];
            if (acceptedValues) {
                const canonicalValue = acceptedValues.find(
                    accepted => accepted.toLowerCase() === value.toLowerCase()
                );
                if (!canonicalValue) {
                    throw new Error(`line ${lineNumber}: invalid ${column}`);
                }
                normalized[column] = canonicalValue;
            } else {
                normalized[column] = value;
            }
        }
    }

    return normalized;
}

async function readCsvDataset(dataset) {
    const filePath = path.join(DATA_DIRECTORY, dataset.file);
    const rows = [];
    const errors = [];
    let headers;
    let lineNumber = 1;

    const parser = fs.createReadStream(filePath).pipe(csv());
    for await (const row of parser) {
        lineNumber += 1;
        if (!headers) {
            headers = Object.keys(row);
            const missing = dataset.columns.filter(column => !headers.includes(column));
            const unexpected = headers.filter(column => !dataset.columns.includes(column));
            if (missing.length > 0 || unexpected.length > 0) {
                throw new Error(
                    `${dataset.file} headers do not match expected columns`
                );
            }
        }

        try {
            rows.push(normalizeRow(row, dataset, lineNumber));
        } catch (error) {
            errors.push(error.message);
        }
    }

    if (!headers) {
        throw new Error(`${dataset.file} contains no CSV header`);
    }

    return { rows, errors, rowsRead: lineNumber - 1 };
}

function sameValue(left, right, column, dataset) {
    if (left == null || right == null) {
        return left == null && right == null;
    }
    if (dataset.numeric.includes(column)) {
        return Number(left) === Number(right);
    }
    return String(left) === String(right);
}

function recordsMatch(existing, incoming, dataset) {
    return dataset.columns.every(column =>
        sameValue(existing[column], incoming[column], column, dataset)
    );
}

async function findExisting(client, dataset, row) {
    const naturalKeyClause = dataset.naturalKey
        ? ` OR ${dataset.naturalKey} = $2`
        : "";
    const values = dataset.naturalKey
        ? [row.id, row[dataset.naturalKey]]
        : [row.id];
    const columns = dataset.columns.join(", ");
    const result = await client.query(
        `SELECT ${columns} FROM ${dataset.table} WHERE id = $1${naturalKeyClause} LIMIT 2`,
        values
    );
    return result.rows;
}

async function syncIdentity(client, dataset) {
    const sequence = await client.query(
        "SELECT pg_get_serial_sequence($1, 'id') AS sequence_name",
        [`public.${dataset.table}`]
    );

    if (sequence.rows[0].sequence_name) {
        await client.query(
            `SELECT setval($1::regclass, COALESCE(MAX(id), 1), MAX(id) IS NOT NULL)
             FROM public.${dataset.table}`,
            [sequence.rows[0].sequence_name]
        );
    }
}

async function importDataset(client, dataset, dryRun) {
    const parsed = await readCsvDataset(dataset);
    const report = {
        file: dataset.file,
        read: parsed.rowsRead,
        inserted: 0,
        skipped: 0,
        rejected: parsed.errors.length,
        wouldInsert: 0
    };

    for (const message of parsed.errors) {
        console.error(`${dataset.file}: ${message}`);
    }

    const seenIds = new Set();
    const seenNaturalKeys = new Set();

    await client.query("BEGIN");
    try {
        for (const row of parsed.rows) {
            const naturalValue = dataset.naturalKey
                ? String(row[dataset.naturalKey])
                : null;

            if (seenIds.has(row.id) ||
                (naturalValue !== null && seenNaturalKeys.has(naturalValue))) {
                report.rejected += 1;
                console.error(`${dataset.file}: duplicate identifier in CSV (id ${row.id})`);
                continue;
            }
            seenIds.add(row.id);
            if (naturalValue !== null) {
                seenNaturalKeys.add(naturalValue);
            }

            const existing = await findExisting(client, dataset, row);
            if (existing.length > 0) {
                if (existing.length === 1 && recordsMatch(existing[0], row, dataset)) {
                    report.skipped += 1;
                } else {
                    report.rejected += 1;
                    console.error(
                        `${dataset.file}: existing ${dataset.table} record conflicts with CSV id ${row.id}`
                    );
                }
                continue;
            }

            if (dryRun) {
                report.wouldInsert += 1;
                continue;
            }

            const placeholders = dataset.columns.map((_, index) => `$${index + 1}`);
            const values = dataset.columns.map(column => row[column]);
            const inserted = await client.query(
                `INSERT INTO ${dataset.table} (${dataset.columns.join(", ")})
                 VALUES (${placeholders.join(", ")})
                 ON CONFLICT (id) DO NOTHING
                 RETURNING id`,
                values
            );

            if (inserted.rowCount === 1) {
                report.inserted += 1;
            } else {
                const raced = await findExisting(client, dataset, row);
                if (raced.length === 1 && recordsMatch(raced[0], row, dataset)) {
                    report.skipped += 1;
                } else {
                    report.rejected += 1;
                    console.error(
                        `${dataset.file}: conflicting database record for CSV id ${row.id}`
                    );
                }
            }
        }

        if (!dryRun) {
            await syncIdentity(client, dataset);
            await client.query("COMMIT");
        } else {
            await client.query("ROLLBACK");
        }
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch {
            console.error(`${dataset.file}: database rollback failed`);
        }
        throw error;
    }

    return report;
}

async function main() {
    const dryRun = process.argv.includes("--dry-run") ||
        process.argv.includes("--validate-only");
    let database;
    let client;

    try {
        database = require("../db/database");
        client = await database.connect();
        if (dryRun) {
            console.log("CSV validation mode: no database rows will be inserted.");
        }

        let rejectedRows = 0;
        for (const dataset of DATASETS) {
            const report = await importDataset(client, dataset, dryRun);
            rejectedRows += report.rejected;
            console.log(
                `${report.file}: read=${report.read}, inserted=${report.inserted}, ` +
                `skipped=${report.skipped}, rejected=${report.rejected}` +
                (dryRun ? `, would_insert=${report.wouldInsert}` : "")
            );
        }

        if (rejectedRows > 0) {
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(
            "CSV import failed:",
            error.code || "CHECK_BACKEND_ENV_CONFIGURATION"
        );
        process.exitCode = 1;
    } finally {
        if (client) {
            client.release();
        }
        if (database) {
            await database.end();
        }
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DATASETS,
    importDataset,
    normalizeRow,
    readCsvDataset
};
