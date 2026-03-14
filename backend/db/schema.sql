CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS insurance (
    id TEXT PRIMARY KEY, -- name.lower()
    name TEXT NOT NULL,
    carrier TEXT,
    plan_name TEXT
);

CREATE TABLE IF NOT EXISTS provider (
    npi INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    specialty TEXT,
    address TEXT,
    wait_time_days INTEGER,
    years_experience INTEGER,
    clinic_size INTEGER,
    official_website TEXT,
    data_discrepancy_flag BOOLEAN
);

CREATE TABLE IF NOT EXISTS patient (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    context TEXT,
    insurance_id TEXT REFERENCES insurance(id)
);

-- Many-to-many relationship between providers and insurance plans
CREATE TABLE IF NOT EXISTS provider_insurance (
    provider_npi INTEGER REFERENCES provider(npi),
    insurance_id TEXT REFERENCES insurance(id),
    PRIMARY KEY (provider_npi, insurance_id)
);

CREATE TABLE IF NOT EXISTS claim (
    claim_id TEXT PRIMARY KEY,
    patient_id UUID REFERENCES patient(id),
    status TEXT,
    priority_score INTEGER,
    decision_reason TEXT,
    fhir_payload TEXT,
    efax_payload TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
