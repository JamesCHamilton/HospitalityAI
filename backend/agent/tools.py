from openai import tools

from backend.models import Claim
from datetime import datetime

@tools.tool("approve_or_deny_claim", description="Instantly approve or deny a claim by claim_id.")
def approve_or_deny_claim(claim_id: str, decision: str, db_session) -> dict:
    """
    Instantly approve or deny a claim in the database.
    Args:
        claim_id (str): The ID of the claim to update.
        decision (str): Either 'approve' or 'deny'.
        db_session: SQLAlchemy session.
    Returns:
        dict: The updated claim details or error message.
    """
    claim = db_session.query(Claim).filter_by(claim_id=claim_id).first()
    if not claim:
        return {"error": "Claim not found"}
    if decision.lower() == "approve":
        claim.status = "approved"
    elif decision.lower() in ["deny", "denied", "disapprove"]:
        claim.status = "denied"
    else:
        return {"error": "Decision must be 'approve' or 'deny'"}
    claim.updated_at = datetime.utcnow()
    db_session.commit()
    db_session.refresh(claim)
    return {
        "claim_id": claim.claim_id,
        "status": claim.status,
        "updated_at": claim.updated_at.isoformat()
    }

@tools.tool("generate_priority_score", description="Update the claim's priority_score and set claim to pending. Pass the priority_score from the AI agent in the params.")
def generate_priority_score(claim_id: str, priority_score: int, description: str, db_session) -> dict:
    """
    Set a claim's priority score (generated externally, e.g. by an AI agent) and update its status to 'pending'.
    Args:
        claim_id (str): The ID of the claim.
        priority_score (int): Priority score determined by AI (1-100).
        description (str): Claim description or additional info to store.
        db_session: SQLAlchemy session.
    Returns:
        dict: Updated claim with new priority score and status.
    """
    claim = db_session.query(Claim).filter_by(claim_id=claim_id).first()
    if not claim:
        return {"error": "Claim not found"}
    # Clamp score between 1 and 100 for safety
    priority_score = max(1, min(int(priority_score), 100))
    claim.priority_score = priority_score
    claim.status = "pending"
    if description:
        claim.description = f"{description.strip()}\n\n[Priority evaluated by AI]"
    claim.updated_at = datetime.utcnow()
    db_session.commit()
    db_session.refresh(claim)
    return {
        "claim_id": claim.claim_id,
        "priority_score": claim.priority_score,
        "status": claim.status,
        "description": claim.description,
        "updated_at": claim.updated_at.isoformat()
    }
