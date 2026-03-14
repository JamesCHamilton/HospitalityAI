CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS insurance (
    id TEXT PRIMARY KEY, -- name.lower()
    name TEXT NOT NULL,
    carrier TEXT,
    plan_name TEXT
);

CREATE TABLE IF NOT EXISTS providers (
    npi INTEGER PRIMARY KEY,
    full_name TEXT NOT NULL,
    specialty TEXT,
    address TEXT,
    wait_time_days INTEGER,
    years_experience INTEGER,
    clinic_size INTEGER,
    official_website TEXT,
    accepted_payers JSONB,
    data_discrepancy_flag BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    clinical_history TEXT,
    insurance_id TEXT REFERENCES insurance(id)
);

-- Many-to-many relationship between providers and insurance plans (for internal logic)
CREATE TABLE IF NOT EXISTS provider_insurance (
    provider_npi INTEGER REFERENCES providers(npi),
    insurance_id TEXT REFERENCES insurance(id),
    PRIMARY KEY (provider_npi, insurance_id)
);

CREATE TABLE IF NOT EXISTS authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id),
    provider_id INTEGER REFERENCES providers(npi),
    priority_score INTEGER,
    status TEXT, -- AUTO-APPROVED, MANUAL_REVIEW, DENIED
    fhir_blob JSONB,
    efax_payload TEXT,
    decision_reason TEXT,
    confidence_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
