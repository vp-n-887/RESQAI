
const path = require("node:path");
const fs = require("node:fs");
const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(__dirname, "..", ".env"),
    quiet: true
});

const CA_CERT_PATH = path.resolve(
    __dirname,
    "..",
    "certs",
    "prod-ca-2021.crt"
);

function createPoolConfig(env = process.env) {
    const connectionString = env.DATABASE_URL;

    const poolOptions = {
        max: Number(env.DB_POOL_MAX) || 10,
        idleTimeoutMillis: Number(env.DB_IDLE_TIMEOUT_MS) || 30000,
        connectionTimeoutMillis:
            Number(env.DB_CONNECTION_TIMEOUT_MS) || 10000
    };

    const isSupabase = (host) =>
        host.endsWith(".supabase.co") ||
        host.endsWith(".pooler.supabase.com");

    let host;

    if (connectionString) {
        try {
            host = new URL(connectionString).hostname;
        } catch {
            throw new Error(
                "DATABASE_URL must be a valid PostgreSQL URL"
            );
        }
    } else {
        host = env.DB_HOST || "";
    }

    const useSSL = isSupabase(host) || env.DB_SSL === "true";

    const ssl = useSSL
        ? {
            ca: fs.readFileSync(CA_CERT_PATH, "utf8"),
            rejectUnauthorized: true
        }
        : false;

    if (connectionString) {
        return {
            ...poolOptions,
            connectionString,
            ssl
        };
    }

    const required = [
        "DB_USER",
        "DB_HOST",
        "DB_NAME",
        "DB_PASSWORD"
    ];

    const missing = required.filter((key) => !env[key]);

    if (missing.length) {
        throw new Error(
            `Missing database settings: ${missing.join(", ")}`
        );
    }

    return {
        ...poolOptions,
        user: env.DB_USER,
        host: env.DB_HOST,
        database: env.DB_NAME,
        password: env.DB_PASSWORD,
        port: Number(env.DB_PORT) || 5432,
        ssl
    };
}

const pool = new Pool(createPoolConfig());

pool.on("error", (error) => {
    console.error(
        "Unexpected PostgreSQL pool error:",
        error.code || "UNKNOWN"
    );
});

module.exports = pool;
module.exports.createPoolConfig = createPoolConfig;
