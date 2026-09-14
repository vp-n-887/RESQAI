CREATE TABLE IF NOT EXISTS ambulances (
    id INTEGER PRIMARY KEY,
    vehicle_number VARCHAR(20) NOT NULL,
    location VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    status VARCHAR(20) NOT NULL,
    ambulance_type VARCHAR(20) NOT NULL,
    equipment TEXT
);

CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    location VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    trauma_care VARCHAR(10),
    icu_available VARCHAR(10),
    available_beds INTEGER,
    specialties TEXT,
    status VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS emergencies (
    id INTEGER PRIMARY KEY,
    emergency_type VARCHAR(50) NOT NULL,
    location VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    patient_count INTEGER,
    description TEXT,
    priority VARCHAR(20),
    status VARCHAR(20)
);