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

    # 3. AI Adjudication Logic
    safety = "Warning: Data Inconsistent." if provider['data_discrepancy_flag'] else ""
    system_prompt = f"""Rules: 1. Step Therapy 2. Network Adequacy. {safety}
    Return JSON with: priority_score, confidence_score, decision_reason, fhir_blob, efax_payload."""
    
    prompt = f"Patient: {req.patientContext}, Plan: {req.patientPlanId}, Provider Payers: {provider['accepted_payers']}"
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )
    
    auth_data = json.loads(response.choices[0].message.content)
    status = "AUTO-APPROVED" if auth_data['confidence_score'] > 85 else "MANUAL_REVIEW"
    
    # 4. Save Authorization
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



from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.models import ClaimQueue, Claim, Provider, Patient
from backend.config.db import get_db

router = APIRouter()

@router.get("/pending")
def get_pending_claims(db: Session = Depends(get_db)):
    """
    Get the claims queue sorted by priority_score descending.
    Result includes claim id, provider id, priority score, status, plus optionally claim/ provider details.
    """
    # Join ClaimQueue with Claim so that we get data from both in each row ("like a view")
    pending = (
        db.query(ClaimQueue, Claim)
        .join(Claim, ClaimQueue.claim_id == Claim.claim_id)
        .order_by(ClaimQueue.priority_score.desc())
        .all()
    )
    result = []
    for cq in pending:
        result.append({
            "queue_id": cq.id,
            "claim_id": cq.claim_id,
            "provider_id": cq.provider_id,
            "priority_score": cq.priority_score,
            "status": cq.status,
            # Optional: Uncomment the lines below to show some details about claim/provider
            # "claim": {
            #     "description": cq.claim.description if cq.claim else None,
            #     "diagnosis_codes": cq.claim.diagnosis_codes if cq.claim else None,
            # },
            # "provider": {
            #     "provider_name": cq.provider.provider_name if cq.provider else None,
            # }
        })
    return result

@router.get("/pending-with-claim")
def get_pending_claims_with_details(db: Session = Depends(get_db)):
    """
    Get all claims with status 'pending', sorted by descending priority_score (no queue),
    joining provider, patient, and provider's insurance(s).
    """
    from backend.models import Claim, Provider, Patient, Insurance

    # Only "pending" claims, sort by priority_score desc, join everything needed.
    pending_claims = (
        db.query(Claim, Provider, Patient, Insurance)
        .join(Provider, Claim.provider_npi == Provider.npi)
        .join(Patient, Claim.patient_id == Patient.id)
        .join(Provider.insurances)  # this is many-to-many, will repeat claim for each insurance
        .filter(Claim.status == "pending")
        .order_by(Claim.priority_score.desc())
        .all()
    )

    result = []
    for claim_obj, provider_obj, patient_obj, insurance_obj in pending_claims:
        claim_data = {
            "claim_id": claim_obj.claim_id,
            "priority_score": claim_obj.priority_score,
            "claim_description": claim_obj.description,
            "claim_status": claim_obj.status,
            "diagnosis_codes": claim_obj.diagnosis_codes,
        }
        provider_data = {
            "npi": provider_obj.npi,
            "provider_name": provider_obj.provider_name,
            "provider_address": provider_obj.address,
            # Optionally more fields
            "insurances": [{
                "insurance_id": insurance_obj.insurance_id,
                "insurance_name": insurance_obj.insurance_name,
                "insurer": insurance_obj.insurer,
                "plan_type": insurance_obj.plan_type,
            }]
        }
        patient_data = {
            "id": patient_obj.id,
            "first_name": patient_obj.first_name,
            "last_name": patient_obj.last_name,
            "clinical_history": patient_obj.clinical_history,
            "insurance_id": patient_obj.insurance_id,
        }
        result.append({
            **claim_data,
            "provider": provider_data,
            "patient": patient_data,
        })
    return result

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session
from fastapi import Depends
from backend.models import Claim, Patient
from backend.config.db import get_db

router = APIRouter()

@router.get("/claims/by-provider/{provider_id}")
def get_claims_by_provider(
    provider_id: str,
    status: str = Query(None, description="Filter claims by status"),
    db: Session = Depends(get_db)
):
    """
    Return claims for a given provider_id, with each claim including joined patient data.
    Optionally filtered by status.
    """
    query = db.query(Claim, Patient).join(Patient, Claim.patient_id == Patient.id).filter(Claim.provider_npi == provider_id)
    if status:
        query = query.filter(Claim.status == status)
    records = query.all()

    results = []
    for claim, patient in records:
        claim_dict = {
            "claim_id": claim.claim_id,
            "patient_id": claim.patient_id,
            "provider_npi": claim.provider_npi,
            "description": claim.description,
            "diagnosis_codes": claim.diagnosis_codes,
            "status": claim.status,
            "patient": {
                "id": patient.id,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "clinical_history": patient.clinical_history,
                "insurance_id": patient.insurance_id,
            },
        }
        results.append(claim_dict)
    return results

@router.get("/claims/by-patient/{patient_id}")
def get_claims_by_patient(
    patient_id: str,
    status: str = Query(None, description="Filter claims by status"),
    db: Session = Depends(get_db)
):
    """
    Return claims for a given patient_id, with each claim including joined provider data.
    Optionally filtered by status.
    """
    from backend.models import Provider  # Local import in case Provider isn't already imported
    query = db.query(Claim, Provider).join(Provider, Claim.provider_npi == Provider.npi).filter(Claim.patient_id == patient_id)
    if status:
        query = query.filter(Claim.status == status)
    records = query.all()

    results = []
    for claim, provider in records:
        claim_dict = {
            "claim_id": claim.claim_id,
            "patient_id": claim.patient_id,
            "provider_npi": claim.provider_npi,
            "description": claim.description,
            "diagnosis_codes": claim.diagnosis_codes,
            "status": claim.status,
            "provider": {
                "npi": provider.npi,
                "provider_name": provider.provider_name,
                "address": provider.address,
                "zip_code": provider.zip_code,
                "latitude": provider.latitude,
                "longitude": provider.longitude,
                "wait_time_days": provider.wait_time_days,
                "years_experience": provider.years_experience,
                "clinic_size": provider.clinic_size,
                "official_website": provider.official_website,
                "data_discrepancy_flag": provider.data_discrepancy_flag,
                "import_id": provider.import_id,
            },
        }
        results.append(claim_dict)
    return results


from fastapi import APIRouter, HTTPException, Path, Body, Depends
from sqlalchemy.orm import Session
from backend.models import Claim
from backend.config.db import get_db

router = APIRouter()

@router.post("/claims/{claim_id}/approve")
def approve_claim(
    claim_id: str = Path(..., description="The ID of the claim to approve"),
    db: Session = Depends(get_db)
):
    """
    Set the status of a claim to 'approved'.
    """
    claim = db.query(Claim).filter_by(claim_id=claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim.status = "approved"
    db.commit()
    db.refresh(claim)
    return {"claim_id": claim.claim_id, "status": claim.status}


@router.post("/claims/{claim_id}/disapprove")
def disapprove_claim(
    claim_id: str = Path(..., description="The ID of the claim to disapprove"),
    reason: str = Body(None, description="Optional reason for disapproval"),
    db: Session = Depends(get_db)
):
    """
    Set the status of a claim to 'denied' (disapproved).
    """
    claim = db.query(Claim).filter_by(claim_id=claim_id).first()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    claim.status = "denied"
    if reason:
        claim.description = (claim.description or "") + f"\nDenial reason: {reason}"
    db.commit()
    db.refresh(claim)
    return {"claim_id": claim.claim_id, "status": claim.status, "denial_reason": reason}












if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
