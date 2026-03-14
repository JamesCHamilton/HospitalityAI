import os
import json
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import openai

app = FastAPI(title="HospitalityAI Reasoning Engine")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://user:password@localhost:5432/hospitality_db")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = openai.OpenAI(api_key=OPENAI_API_KEY)

BEST_FIT_DEFINITION = """
Ranked Criteria for Best Fit:
1. Insurance Acceptance: Provider MUST accept the patient's specific insurance plan. This is a non-negotiable requirement.
2. Clinical Specialization: The provider's specialty must be an exact match for the patient's primary clinical need (e.g., a Cardiologist for chest pain).
3. Location & Accessibility: Favor providers located in the same borough (NYC) or with the shortest geographical distance.
4. Operational Efficiency: Prioritize providers with shorter wait times (wait_time_days) and stable clinic staff counts.
5. Data Reliability: Favor providers where data_discrepancy_flag is False. If True, lower the match score and add a warning.
"""

class HandoffRequest(BaseModel):
    patientContext: str
    patientName: str
    patientPlanId: str
    providerNpi: int

@app.post("/api/match")
async def match_providers(request: Request):
    body = await request.json()
    patient_context = body.get("patientContext")
    
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    cur.execute("SELECT * FROM providers")
    providers = cur.fetchall()
    cur.close()
    cur.close()
    conn.close()

    system_prompt = f"You are a healthcare matching specialist. {BEST_FIT_DEFINITION} Analyze the patient context against the providers and return the top 3 matches as a JSON object with a 'matches' array."
    prompt = f"Patient Context: {patient_context}\nProviders: {json.dumps(providers)}"

    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    return json.loads(response.choices[0].message.content)

@app.post("/api/handoff")
async def handle_handoff(req: HandoffRequest):
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    
    # 1. Get Provider Info
    cur.execute("SELECT * FROM providers WHERE npi = %s", (req.providerNpi,))
    provider = cur.fetchone()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    # 2. Get or Create Patient
    cur.execute("SELECT id FROM patients WHERE name = %s LIMIT 1", (req.patientName,))
    patient = cur.fetchone()
    patient_id = patient['id'] if patient else None
    
    if not patient_id:
        cur.execute("INSERT INTO patients (name, clinical_history, insurance_id) VALUES (%s, %s, %s) RETURNING id",
                    (req.patientName, req.patientContext, req.patientPlanId.lower()))
        patient_id = cur.fetchone()['id']

    # 3. AI Adjudication & Rules Engine
    safety_context = "Warning: Data Inconsistent - Prioritize Manual Review." if provider['data_discrepancy_flag'] else "Data Verified."
    
    system_prompt = f"""You are a Senior Insurance Adjudicator Reasoning Engine. 
    Safety Status: {safety_context}
    
    Adjudication Criteria:
    1. Network Adequacy: Verify if the provider accepts the patient's plan ({req.patientPlanId}).
    2. Step Therapy: Check if the clinical context ({req.patientContext}) suggests a procedure that requires previous conservative steps (e.g., PT before MRI/Surgery).
    3. Medical Necessity: Evaluate if the specialist match is medically appropriate for the reported symptoms.
    4. Urgency Score: Assign a priority_score (0-100) based on clinical risk.

    Decision Logic:
    - AUTO-APPROVED: Confidence > 85% AND In-Network AND No Step Therapy violations.
    - DENIED: Clear violation of plan rules or medically inappropriate.
    - MANUAL_REVIEW: Confidence < 85% OR Ambiguous clinical data OR Data Inconsistency flag is True.

    Return JSON with: priority_score, confidence_score, status (AUTO-APPROVED, DENIED, MANUAL_REVIEW), decision_reason, fhir_blob, efax_payload."""
    
    prompt = f"Patient: {req.patientName}, Plan: {req.patientPlanId}, Context: {req.patientContext}, Provider: {provider['full_name']}, Accepted Payers: {provider['accepted_payers']}"
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    
    auth_data = json.loads(response.choices[0].message.content)
    # The AI now determines the status based on the rules provided in the system prompt
    status = auth_data.get('status', 'MANUAL_REVIEW')
    
    # Overwrite status if safety flag is high but AI missed it
    if provider['data_discrepancy_flag'] and status == 'AUTO-APPROVED':
        status = 'MANUAL_REVIEW'
        auth_data['decision_reason'] += " (Flagged for manual review due to data discrepancy)"

    # 4. Save Authorization (The Claim)
    cur.execute("""
        INSERT INTO authorizations (patient_id, provider_id, priority_score, status, fhir_blob, efax_payload, decision_reason, confidence_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (
        patient_id, req.providerNpi, auth_data['priority_score'], status, 
        json.dumps(auth_data['fhir_blob']), auth_data['efax_payload'], 
        auth_data['decision_reason'], auth_data['confidence_score']
    ))
    
    auth_id = cur.fetchone()['id']
    conn.commit()
    cur.close()
    conn.close()

    auth_data["id"] = str(auth_id)
    auth_data["status"] = status
    auth_data["patient_name"] = req.patientName
    return auth_data

@app.get("/api/queue")
async def get_queue():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    cur = conn.cursor()
    cur.execute("""
        SELECT a.*, p.name as patient_name 
        FROM authorizations a 
        JOIN patients p ON a.patient_id = p.id 
        ORDER BY a.priority_score DESC
    """)
    queue = cur.fetchall()
    cur.close()
    conn.close()
    return queue

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
