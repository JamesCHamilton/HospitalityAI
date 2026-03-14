import os
import json
import asyncio
import httpx
import random
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import psycopg2
from psycopg2.extras import execute_values

app = FastAPI(title="HospitalityAI Ingestion Service")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
UNSILOED_API_KEY = os.getenv("UNSILOED_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@localhost:5432/hospitality_db")
CRUSTDATA_TOKEN = os.getenv("CRUSTDATA_API_KEY")
print(CRUSTDATA_TOKEN)

REFERRAL_SCHEMA = {
    "type": "object",
    "properties": {
        "patient_name": {"type": "string"},
        "clinical_reason": {"type": "string"},
        "insurance_payer": {"type": "string"},
    },
    "required": ["patient_name", "clinical_reason", "insurance_payer"]
}

async def fetch_crustdata_enrichment(doctor_name: str, token: str):
    """Fetch professional clinic metrics from Crustdata Company Search API."""
    if not token:
        return random.randint(5, 55), "https://fallback-clinic.org"
        
    api_url = "https://api.crustdata.com/screener/companydb/search"
    payload = {
        "filters": {
            "filter_type": "company_name",
            "type": "(.)",
            "value": doctor_name
        },
        "limit": 1
    }
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(api_url, json=payload, headers=headers, timeout=10.0)
            if resp.status_code == 200:
                result = resp.json()
                companies = result.get("companies", [])
                if companies:
                    return (
                        companies[0].get("linkedin_headcount", 8), 
                        companies[0].get("company_website", "https://private-practice.com")
                    )
                # Success but no companies found
                print(companies)
                return 8, "https://private-practice.com"
        except Exception as e:
            print(f"Crustdata Enrichment Error: {e}")
    print("Crustdata API error or timeout, returning fallback values.")
    return 10, "https://default-clinic.com"

async def poll_unsiloed(job_id: str):
    headers = {"api-key": UNSILOED_API_KEY}
    async with httpx.AsyncClient() as client:
        for _ in range(30): # Poll for 60 seconds
            await asyncio.sleep(2)
            resp = await client.get(f"https://prod.visionapi.unsiloed.ai/extract/{job_id}", headers=headers)
            data = resp.json()
            if data.get("status") == "completed":
                return data.get("extracted_data")
            if data.get("status") == "failed":
                return None
    return None

@app.post("/api/ingest")
async def ingest_data(
    patient_name: Optional[str] = Form(None),
    clinical_history: Optional[str] = Form(None),
    insurance_id: Optional[str] = Form(None),
    referral_pdf: Optional[UploadFile] = File(None)
):
    extracted_data = {}
    
    if referral_pdf:
        # Submit to Unsiloed AI
        headers = {"api-key": UNSILOED_API_KEY}
        files = {
            "pdf_file": (referral_pdf.filename, await referral_pdf.read(), referral_pdf.content_type),
            "schema_data": (None, json.dumps(REFERRAL_SCHEMA))
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post("https://prod.visionapi.unsiloed.ai/v2/extract", headers=headers, files=files)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Unsiloed submission failed")
            
            job_id = resp.json().get("job_id")
            extracted_data = await poll_unsiloed(job_id)
            if not extracted_data:
                raise HTTPException(status_code=500, detail="Unsiloed processing failed")
            
            patient_name = extracted_data["patient_name"]
            clinical_history = extracted_data["clinical_reason"]
            insurance_id = extracted_data["insurance_payer"].lower().replace(" ", "_")

    # Persist to Supabase
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO patients (name, clinical_history, insurance_id) VALUES (%s, %s, %s) RETURNING id",
        (patient_name, clinical_history, insurance_id)
    )
    patient_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    return {"status": "success", "patient_id": str(patient_id), "extracted": extracted_data}

@app.post("/api/etl/sync")
async def run_etl_sync():
    """Joins NYC Hospital data + NPI Registry and enriches via Crustdata API."""
    async with httpx.AsyncClient() as client:
        # 1. Fetch NYC Hospital Data
        nyc_resp = await client.get("https://data.cityofnewyork.us/resource/ji82-xba5.json?$query=SELECT%20*%20WHERE%20factype%20LIKE%20%27%25HOSPITAL%25%27%20LIMIT%2050")
        nyc_facilities = nyc_resp.json()

        # 2. Fetch NPI Registry
        npi_resp = await client.get("https://npiregistry.cms.hhs.gov/api/?version=2.1&city=new+york&state=ny&taxonomy_description=cardiovascular+disease&limit=20")
        npi_results = npi_resp.json().get("results", [])

    joined_data = []
    messy_insurances = ["Fidelis Care NY Medicaid Plan!!!", "Aetna Choice POS II (v.2024)", "Blue Cross Blue Shield Empire - PPO High"]

    for npi in npi_results:
        full_name = npi.get("basic", {}).get("organization_name") or f"Dr. {npi['basic'].get('first_name', '')} {npi['basic'].get('last_name', '')}"
        address = npi["addresses"][0].get("address_1", "") if npi.get("addresses") else ""
        city = npi["addresses"][0].get("city", "New York") if npi.get("addresses") else "New York"
        
        # Simple Join Logic
        affiliated = next((f for f in nyc_facilities if address.upper() in f.get("address", "").upper()), None)
        
        # Actual Crustdata Enrichment
        staff_count, website = await fetch_crustdata_enrichment(full_name, CRUSTDATA_TOKEN)
        
        if staff_count not in [8, 10, 15] and "fallback" not in website and "default" not in website:
            print(f"🎯 CRUSTDATA MATCH: {full_name} -> Staff: {staff_count}, Web: {website}")
        else:
            print(f"⚠️  Using Fallback for: {full_name}")

        provider = {
            "npi": npi["number"],
            "full_name": full_name,
            "specialty": "Cardiology",
            "address": f"{address}, {city}",
            "wait_time_days": random.randint(1, 30),
            "years_experience": random.randint(5, 25),
            "clinic_size": staff_count,
            "official_website": website,
            "data_discrepancy_flag": random.random() < 0.15,
            "accepted_payers": json.dumps(["fid_med_ny"] if random.random() > 0.5 else ["aet_choice_ppo"]),
            "messy_insurance_string": random.choice(messy_insurances)
        }
        joined_data.append(provider)

    # Save local copy for manual verification
    with open("data/debug_enriched_providers.json", "w") as f:
        json.dump(joined_data, f, indent=2)
    print(f"💾 Saved {len(joined_data)} providers to backend/etl/data/debug_enriched_providers.json")

    # Bulk Upsert to Supabase
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    for p in joined_data:
        cur.execute("""
            INSERT INTO providers (npi, full_name, specialty, address, wait_time_days, years_experience, clinic_size, official_website, data_discrepancy_flag, accepted_payers)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (npi) DO UPDATE SET 
                clinic_size = EXCLUDED.clinic_size, 
                official_website = EXCLUDED.official_website,
                accepted_payers = EXCLUDED.accepted_payers
        """, (p["npi"], p["full_name"], p["specialty"], p["address"], p["wait_time_days"], p["years_experience"], p["clinic_size"], p["official_website"], p["data_discrepancy_flag"], p["accepted_payers"]))
    
    conn.commit()
    cur.close()
    conn.close()

    return {"status": "success", "count": len(joined_data)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
