import os
import json
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import openai
from dotenv import load_dotenv
from fastapi import APIRouter, Body
from agents import Agent, Runner
from tools import (
    AgentContext,
    record_provider_decision,
    create_priority_score,
)


# Load .env file if present for local dev environments
load_dotenv()

from unsiloed_sdk import UnsiloedClient

#Future bonus, if claim that the agent marked as auto approved or denied is reopened then the feed that back into ai with reason why its decision was wrong and if claim is closed then feed into AI saying it did good job.
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

# @app.post("/api/handoff")
# async def handle_handoff(req: HandoffRequest):
#     conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
#     cur = conn.cursor()
    
#     # 1. Get Provider Info
#     cur.execute("SELECT * FROM providers WHERE npi = %s", (req.providerNpi,))
#     provider = cur.fetchone()
#     if not provider:
#         raise HTTPException(status_code=404, detail="Provider not found")
    
#     # 2. Get or Create Patient
#     cur.execute("SELECT id FROM patients WHERE name = %s LIMIT 1", (req.patientName,))
#     patient = cur.fetchone()
#     patient_id = patient['id'] if patient else None
    
#     if not patient_id:
#         cur.execute("INSERT INTO patients (name, clinical_history, insurance_id) VALUES (%s, %s, %s) RETURNING id",
#                     (req.patientName, req.patientContext, req.patientPlanId.lower()))
#         patient_id = cur.fetchone()['id']

#     # 3. AI Adjudication & Rules Engine
#     safety_context = "Warning: Data Inconsistent - Prioritize Manual Review." if provider['data_discrepancy_flag'] else "Data Verified."
    
#     system_prompt = f"""You are a Senior Insurance Adjudicator Reasoning Engine. 
#     Safety Status: {safety_context}
    
#     Adjudication Criteria:
#     1. Network Adequacy: Verify if the provider accepts the patient's plan ({req.patientPlanId}).
#     2. Step Therapy: Check if the clinical context ({req.patientContext}) suggests a procedure that requires previous conservative steps (e.g., PT before MRI/Surgery).
#     3. Medical Necessity: Evaluate if the specialist match is medically appropriate for the reported symptoms.
#     4. Urgency Score: Assign a priority_score (0-100) based on clinical risk.

#     Decision Logic:
#     - AUTO-APPROVED: Confidence > 85% AND In-Network AND No Step Therapy violations.
#     - DENIED: Clear violation of plan rules or medically inappropriate.
#     - MANUAL_REVIEW: Confidence < 85% OR Ambiguous clinical data OR Data Inconsistency flag is True.

#     Return JSON with: priority_score, confidence_score, status (AUTO-APPROVED, DENIED, MANUAL_REVIEW), decision_reason, fhir_blob, efax_payload."""
    
#     prompt = f"Patient: {req.patientName}, Plan: {req.patientPlanId}, Context: {req.patientContext}, Provider: {provider['full_name']}, Accepted Payers: {provider['accepted_payers']}"
    
#     response = client.chat.completions.create(
#         model="gpt-4o",
#         messages=[
#             {"role": "system", "content": system_prompt},
#             {"role": "user", "content": prompt}
#         ],
#         response_format={"type": "json_object"}
#     )
    
#     auth_data = json.loads(response.choices[0].message.content)
#     # The AI now determines the status based on the rules provided in the system prompt
#     status = auth_data.get('status', 'MANUAL_REVIEW')
    
#     # Overwrite status if safety flag is high but AI missed it
#     if provider['data_discrepancy_flag'] and status == 'AUTO-APPROVED':
#         status = 'MANUAL_REVIEW'
#         auth_data['decision_reason'] += " (Flagged for manual review due to data discrepancy)"

#     # 4. Save Authorization (The Claim)
#     cur.execute("""
#         INSERT INTO authorizations (patient_id, provider_id, priority_score, status, fhir_blob, efax_payload, decision_reason, confidence_score)
#         VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
#         RETURNING id
#     """, (
#         patient_id, req.providerNpi, auth_data['priority_score'], status, 
#         json.dumps(auth_data['fhir_blob']), auth_data['efax_payload'], 
#         auth_data['decision_reason'], auth_data['confidence_score']
#     ))
    
#     auth_id = cur.fetchone()['id']
#     conn.commit()
#     cur.close()
#     conn.close()

#     auth_data["id"] = str(auth_id)
#     auth_data["status"] = status
#     auth_data["patient_name"] = req.patientName
#     return auth_data



from fastapi import Depends
from sqlalchemy.orm import Session, joinedload
from models import Claim, Provider, Patient
from config.db import get_db



@app.get("/pending")
def get_pending_claims(db: Session = Depends(get_db)):
    """
    Get the claims queue sorted by priority_score descending.
    Result includes claim id, provider id, priority score, status, plus optionally claim/ provider details.
    """
    # Join ClaimQueue with Claim so that we get data from both in each row ("like a view")
    pending = (
        db.query(ClaimQueue, Claim)
        .join(Claim, ClaimQueue.claim_id == Claim.id)
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

@app.get("/pending-with-claim")
def get_pending_claims_with_details(db: Session = Depends(get_db)):
    """
    Get all claims with status 'pending', sorted by descending priority_score (no queue),
    joining provider, patient, and provider's insurance(s).
    """
    from models import Claim, Provider, Patient, Insurance

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

from fastapi import Query
from sqlalchemy.orm import Session
from fastapi import Depends
from models import Claim, Patient
from config.db import get_db

# app = APIapp()

@app.get("/claims/by-provider/{provider_id}")
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
            "claim_id": claim.id,
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

@app.get("/claims/by-patient/{patient_id}")
def get_claims_by_patient(
    patient_id: str,
    status: str = Query(None, description="Filter claims by status"),
    db: Session = Depends(get_db)
):
    """
    Return claims for a given patient_id, with each claim including joined provider data.
    Optionally filtered by status.
    """
    from models import Provider  # Local import in case Provider isn't already imported
    query = db.query(Claim, Provider).join(Provider, Claim.provider_npi == Provider.npi).filter(Claim.patient_id == patient_id)
    if status:
        query = query.filter(Claim.status == status)
    records = query.all()

    results = []
    for claim, provider in records:
        claim_dict = {
            "claim_id": claim.id,
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


from fastapi import HTTPException, Path, Body, Depends
from sqlalchemy.orm import Session
from models import Claim
from config.db import get_db


@app.post("/claims/{claim_id}/approve")
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
    return {"claim_id": claim.id, "status": claim.status}


@app.post("/claims/{claim_id}/disapprove")
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
    return {"claim_id": claim.id, "status": claim.status, "denial_reason": reason}



from fastapi import File, UploadFile, Form
from typing import List, Optional
import tempfile
import os

from models import Provider, Insurance, SpecialtyTaxonomy
# from agent.tools import tools  # if you want to use tool helpers

# Dummy function for "unsoiled" clinical data extraction.
# In production, replace with actual model/service call.
def unsoiled_extract_summary(file_path: Optional[str], json_data: dict) -> dict:
    """
    Use Unsoiled or LLM or OCR/extraction pipeline to generate
    an overview from file and supplemental JSON data.
    Here we simulate the output format.
    """
    schema = {
        "type": "object",
        "properties": {
            "clinical_summary": {
                "type": "string",
                "description": "A natural language summary of the clinical note, suitable for clinician review."
            },
            "cpt_codes": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of relevant CPT codes found in the clinical note"
            },
            "icd10_codes": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of ICD-10 diagnosis codes referenced in the note"
            },
            "specialty_taxonomy_codes": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Array of provider specialty taxonomy codes mentioned or inferred from the clinical context. Eunsure it exists or find any closest taxonomy code to the clinical description"
            }
        },
        "required": ["clinical_summary", "cpt_codes", "icd10_codes", "specialty_taxonomy_codes"],
        "additionalProperties": False
    }

    with UnsiloedClient(api_key=os.environ.get("UNSILOED_API_KEY")) as client:
        # Extract and wait for completion
        result = client.extract_and_wait(
            file=file_path,
            schema=schema
        )

    # # Access extracted data with confidence scores
    # print(f"Title: {result.result['title']['value']}")
    # print(f"Confidence: {result.result['title']['score']:.2%}")
    # Example extraction, for demo:
    return {
        "clinical_summary": result.result.get("clinical_summary", "Clinical summary goes here."),
        "cpt_codes": result.result.get("cpt_codes", []),
        "icd10_codes": result.result.get("icd10_codes", []),
        "specialty_taxonomy_codes": result.result.get("specialty_taxonomy_codes", [])
    }


@app.post("/match_providers")
async def match_providers(
    file: Optional[UploadFile] = File(None, description="PDF or image of clinical document"),
    json_data: Optional[str] = Form(None, description="Raw JSON with insurance names, CPT codes, taxonomy codes"),
    db: Session = Depends(get_db)
):
    """
    Accepts an uploaded document (image/pdf) and supplemental JSON describing insurances/CPT/specialty,
    runs 'unsoiled' (LLM/OCR pipeline, mocked here) to extract clinical/integration fields,
    then matches and returns the top 20 most compatible providers.
    """
    import json

    # Save uploaded file if present
    temp_file_path = None
    print("checking file", file)
    if file:
        print("has file", file.filename)
        suffix = os.path.splitext(file.filename)[-1] if file.filename else ".bin"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_file_path = tmp.name
            content = await file.read()
            tmp.write(content)

    try:
        # Parse the supplemental data
        structured_json = json.loads(json_data) if json_data else {}

        # --- 1. Run "Unsoiled" pipeline / summary LLM/OCR step (mocked here) ---
        summary_result = unsoiled_extract_summary(temp_file_path, structured_json)
        print('summary results', summary_result)
        # Extract insurance_names, cpt_codes, taxonomy_codes according to referenced schema
        insurance_names = summary_result.get("insurance_names", [])
        # CPT codes: value is under 'cpt_codes' > 'value', which may be None or a list
        cpt_codes_result = summary_result.get("cpt_codes", {})
        cpt_codes = cpt_codes_result.get("value", []) if cpt_codes_result else []
        if cpt_codes is None:
            cpt_codes = []
        # Specialty taxonomy codes: value is under 'specialty_taxonomy_codes' > 'value'
        taxonomy_result = summary_result.get("specialty_taxonomy_codes", {})
        taxonomy_codes = taxonomy_result.get("value", []) if taxonomy_result else []
        if taxonomy_codes is None:
            taxonomy_codes = []

        # --- 2. Query DB to find matching providers ---
        # Filter by insurance (join), CPT, and specialty taxonomy codes
        query = db.query(Provider)\
            .join(Provider.insurances)\
            .join(Provider.specialty_taxonomies)

        filters = []
        # if insurance_names:
        #     filters.append(Insurance.insurance_name.in_(insurance_names))
        if taxonomy_codes:
            filters.append(SpecialtyTaxonomy.taxonomy_code.in_(taxonomy_codes))
        # CPT logic: not all providers have CPT, so just report in results?

        if filters:
            query = query.filter(*filters)

        query = query.distinct().limit(50)

        providers = query.all()
        print("Query results",providers)

        # Compose the result for each provider
        provider_results = []
        for p in providers:
            provider_results.append({
                "npi": p.npi,
                "provider_name": p.provider_name,
                "address": p.address,
                "zip_code": p.zip_code,
                "insurances": [
                    {
                        "insurance_id": ins.insurance_id,
                        "insurance_name": ins.insurance_name,
                        "insurer": ins.insurer,
                        "plan_type": ins.plan_type,
                    } for ins in p.insurances
                ],
                "specialty_taxonomies": [
                    {
                        "taxonomy_code": tx.taxonomy_code,
                        "type": tx.taxonomy_type,
                        "desc": tx.provider_type_description
                    } for tx in p.specialty_taxonomies
                ],
                "wait_time_days": p.wait_time_days,
                "years_experience": p.years_experience,
                "clinic_size": p.clinic_size,
                "official_website": p.official_website,
            })

       
        # Use OpenAI agent to rank/suggest top 20 providers based on user insurance and full clinical context
        # Compose system and user prompts for GPT
        system_prompt = (
            "You are an expert healthcare provider recommendation engine. " 
            "Given a patient's insurance, clinical context, and retrieved provider information, select the 20 most appropriate providers. "
            "You must only select providers that accept the patient insurance. Rank by clinical appropriateness and relevance to the patient's case, and justify each rank in a 'reason' field. "
            "Your JSON response format: "
            "{ \"suggestions\": [ "
            "  { \"id\": <provider_id>, \"npi\": <npi>, \"provider_name\": <name>, \"reason\": <justification>, \"insurances\": [...], \"specialty_taxonomies\": [...], \"match_score\": <score between 0 and 1, higher is better> }, ... "
            "], "
            "\"criteria_summary\": <short (2-3 sentences) explanation explaining how you determined ranking and fit> "
            "}"
        )

        user_prompt = (
            f"PATIENT Information: {json.dumps(json_data)}\n"
            f"CLINICAL DOCUMENTS: {json.dumps(summary_result)}\n"
            f"RAW_PROVIDERS: {json.dumps(provider_results)}\n"
            "Please answer in the specified JSON format with exactly 20 suggestions."
        )

        try:
            completion = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"}
            )
            ai_output = completion.choices[0].message.content
            print("Ai result",ai_output)
            ai_result = json.loads(ai_output)
        except Exception as e:
            # If there's any failure in LLM, fall back to first 20 providers with generic reasons
            ai_result = {
                "suggestions": [
                    dict(
                        p,
                        reason="Automatically selected provider from query results. LLM scoring unavailable."
                    ) for p in provider_results[:20]
                ],
                "criteria_summary": "Fallback to default provider order. LLM scoring not available."
            }

        # Compose the final result including the AI suggestions/rankings
        return {
            # "summary": summary_result["overview"],
            "criteria": {
                # "insurance_names": insurance_names,
                "cpt_codes": cpt_codes,
                "specialty_taxonomy_codes": taxonomy_codes,
                

            },
            "patient_summary": {k: v["value"] if isinstance(v, dict) and "value" in v else v for k, v in summary_result.items()},

            # "top_matches": provider_results,
            "top_matches": ai_result.get("suggestions", []),
            "llm_criteria_summary": ai_result.get("criteria_summary", ""),
        }
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)


provider_agent = Agent(
    name="Provider Qualification Agent",
    instructions="""
    ### ROLE
    You are a healthcare triage AI.

    ### EVALUATION
    Use the 4 Box Model to guide your reasoning and decision:
    - Box 1 (Clinical Indication): Does the provider's specialty and clinical capabilities fit the patient's presenting problem/need?
    - Box 2 (Insurance): Does the provider accept the patient's insurance and/or specific plan?
    - Box 3 (Operations): Is the provider accessible in terms of wait time, location, and operational capacity?
    - Box 4 (Data/Safety): Are there any flags for data discrepancy or missing/uncertain information?

    ### OBJECTIVE
    Systematically consider each box above. If the provider clearly meets or fails critical requirements in Boxes 1 or 2,
    call 'record_provider_decision' to finalize the status. If further review is needed but the match is promising, call
    'create_priority_score' (range 0.0 - 1.0) based on overall fit (weighing all four boxes) and set the status to pending.

    ONLY ONE TOOL SHOULD BE CALLED IN THIS PROCESS AND THAT ONE TOOL SHOULD ONLY BE CALLED ONCE

    Note: Patient IDs and Provider IDs are handled automatically; you only provide scores and explicit reasoning with reference to each box.
    Example: "Box 1: Provider is a nephrologist, matching need for kidney disease. Box 2: Accepts patient's Medicaid plan. Box 3: Short wait times (<5 days). Box 4: No major data issues."
    """,
    tools=[record_provider_decision, create_priority_score]
)

class ProviderEvaluateRequest(BaseModel):
    patient_id: str
    provider_id: str
    cpt_codes: List[str] = []
    icd10_codes: List[str] = []
    specialty_taxonomy_codes: List[str] = []
    clinical_summary: str
    insurance: str

@app.post("/agent/provider_evaluate")
async def provider_evaluate(
    body: ProviderEvaluateRequest = Body(...),
    db: Session = Depends(get_db),
):
    # 1. Fetch relevant metadata for the AI to "read"
    # Compose a provider_data dict using backend/models.py definitions, extracting fields including insurances as nested objects
    raw_provider_data = db.query(Provider).filter(Provider.npi == body.provider_id)\
        .options(joinedload(Provider.insurances), joinedload(Provider.specialty_taxonomies)).first()

    if not raw_provider_data:
        provider_data = None
    else:
        provider_data = {
            "npi": raw_provider_data.npi,
            "provider_name": raw_provider_data.provider_name,
            "address": raw_provider_data.address,
            "zip_code": raw_provider_data.zip_code,
            "latitude": raw_provider_data.latitude,
            "longitude": raw_provider_data.longitude,
            "wait_time_days": raw_provider_data.wait_time_days,
            "years_experience": raw_provider_data.years_experience,
            "clinic_size": raw_provider_data.clinic_size,
            "official_website": raw_provider_data.official_website,
            "data_discrepancy_flag": raw_provider_data.data_discrepancy_flag,
            "insurances": [
                {
                    "insurance_id": ins.insurance_id,
                    "insurance_name": ins.insurance_name,
                    "insurer": ins.insurer,
                    "plan_type": ins.plan_type,
                    "network_size": ins.network_size,
                    "covered_specialties": ins.covered_specialties,
                    "general_covered_icd10": ins.general_covered_icd10,
                    "general_covered_cpt": ins.general_covered_cpt,
                }
                for ins in raw_provider_data.insurances
            ],
            "specialty_taxonomies": [
                {
                    "taxonomy_code": tax.taxonomy_code,
                    "medicare_specialty_code": tax.medicare_specialty_code,
                    "provider_type_description": tax.provider_type_description,
                    "taxonomy_type": tax.taxonomy_type,
                    "import_id": tax.import_id,
                }
                for tax in raw_provider_data.specialty_taxonomies
            ],
        }

    # print(provider_data)
    # 2. Package the "Config Context" for the tools
    run_context = AgentContext(
        db=db,
        patient_id=body.patient_id,
        provider_id=body.provider_id,
        cpt_codes=body.cpt_codes,
        icd10_codes=body.icd10_codes,
        clinical_summary=body.clinical_summary,
        specialty_taxonomy_codes=body.specialty_taxonomy_codes,
        # provider_data=provider_data
    )

    # 3. Run the Agent
    result = await Runner.run(
        starting_agent=provider_agent,
        input=f"""
        Evaluate this provider match:
        - Patient Clinical Summary: {body.clinical_summary}
        - Patient Insurance: {body.insurance}
        - Provider Data: {provider_data}
        """,
        context=run_context
    )
    
    return result.final_output








if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
