from typing import List, Annotated
from dataclasses import dataclass
from sqlalchemy.orm import Session
from agents import function_tool, RunContextWrapper
from models import Claim
from config.db import get_db

@dataclass
class AgentContext:
    db: Session
    patient_id: str
    provider_id: str
    cpt_codes: List[str]
    clinical_summary:str
    icd10_codes: List[str]
    specialty_taxonomy_codes: List[str]

@function_tool
def record_provider_decision(
    ctx: RunContextWrapper[AgentContext],
    approved: Annotated[bool, "Whether the provider is suitable for the patient"],
    reason: Annotated[str, "Detailed medical/administrative justification for the decision"],
):
    """Store the final approval or rejection decision."""

    print("hello from finalize score")
    c = ctx.context
    try:
        new_claim = Claim(
            patient_id=c.patient_id,
            provider_npi=c.provider_id,
            status_reasoning=reason,
            status="approved" if approved else "denied",
            cpt_codes=c.cpt_codes,
            diagnosis_codes=c.icd10_codes,
            clinical_description = c.clinical_summary
            # specialty_taxonomy_codes=c.specialty_taxonomy_codes,
            # description=f"Decision reason: {reason}"
        )
        print('updated table')
        c.db.add(new_claim)
        c.db.commit()
        c.db.refresh(new_claim)
    except Exception as e:
        print(f"Error recording provider decision: {e}")
        c.db.rollback()
        raise
    return {"claim_id": new_claim.claim_id, "status": new_claim.status}

@function_tool
def create_priority_score(
    ctx: RunContextWrapper[AgentContext],
    priority_score: Annotated[float, "A score from 0.0 to 1.0 indicating suitability"],
    reason: Annotated[str, "Reasoning behind the assigned priority score"],
):
    """Store the clinical priority score."""
    print("hello from create priority score")
    c = ctx.context
    new_claim = Claim(
        patient_id=c.patient_id,
        provider_npi=c.provider_id,
        priority_score=priority_score,
        status_reasoning=reason,
        cpt_codes=c.cpt_codes,
        diagnosis_codes=c.icd10_codes,
        clinical_description = c.clinical_summary,
        # specialty_taxonomy_codes=c.specialty_taxonomy_codes,
        status="pending",
    )
    c.db.add(new_claim)
    c.db.commit()
    c.db.refresh(new_claim)
    return {"claim_id": new_claim.claim_id, "priority_score": priority_score}