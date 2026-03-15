from sqlalchemy import Column, DateTime, String, Integer, Boolean, ForeignKey, Table, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import uuid

Base = declarative_base()

# Association table for many-to-many between providers and insurances
provider_insurance = Table(
    'provider_insurance',
    Base.metadata,
    Column('provider_npi', String, ForeignKey('providers.npi'), primary_key=True),
    Column('insurance_id', String, ForeignKey('insurance.insurance_id'), primary_key=True)
)

class Insurance(Base):
    __tablename__ = 'insurance'
    insurance_id = Column(String, primary_key=True)  # "BCBS_HMO_010"
    insurance_name = Column(String, nullable=False)  # "BlueCross HMO Silver"
    insurer = Column(String, nullable=False)         # "Blue Cross Blue Shield"
    plan_type = Column(String)                       # "HMO"
    network_size = Column(String)                    # "medium"
    covered_specialties = Column(JSONB)              # ["cardiology", ...]
    general_covered_icd10 = Column(JSONB)            # ["I20.0", ...]
    general_covered_cpt = Column(JSONB)              # ["93000", ...]

    # Relationships
    providers = relationship(
        "Provider",
        secondary=provider_insurance,
        back_populates="insurances"
    )

# Association table for many-to-many between providers and specialty taxonomies
provider_specialty_taxonomy = Table(
    'provider_specialty_taxonomy',
    Base.metadata,
    Column('provider_npi', String, ForeignKey('providers.npi'), primary_key=True),
    Column('taxonomy_code', String, ForeignKey('specialty_taxonomies.taxonomy_code'), primary_key=True)
)

class SpecialtyTaxonomy(Base):
    __tablename__ = 'specialty_taxonomies'
    taxonomy_code = Column(String, primary_key=True)  # "208D00000X"
    medicare_specialty_code = Column(String)          # "01"
    provider_type_description = Column(String)        # "Physician/General Practice"
    taxonomy_type = Column(String)                    # e.g., "Allopathic & Osteopathic Physicians"
    import_id = Column(String, index=True, unique=True)  # For deduplication when scraping/importing

    # Relationships
    providers = relationship(
        "Provider",
        secondary=provider_specialty_taxonomy,
        back_populates="specialty_taxonomies"
    )

class Provider(Base):
    __tablename__ = 'providers'
    npi = Column(String, primary_key=True)               # "1763920019"
    provider_name = Column(String, nullable=False)       # "Dr. Olivia Rodriguez"
    # specialty field deprecated in favor of many-to-many taxonomy
    address = Column(String)
    zip_code = Column(Integer)                            # "10001"
    latitude = Column(Integer)   # "40.7484"
    longitude = Column(Integer)  # "-73.9857"
    wait_time_days = Column(Integer)
    years_experience = Column(Integer)
    clinic_size = Column(Integer)
    official_website = Column(String)
    data_discrepancy_flag = Column(Boolean, default=False)
    import_id = Column(String, index=True, unique=True)  # For deduplication when scraping/importing
    # Relationships
    insurances = relationship(
        "Insurance",
        secondary=provider_insurance,
        back_populates="providers"
    )
    specialty_taxonomies = relationship(
        "SpecialtyTaxonomy",
        secondary=provider_specialty_taxonomy,
        back_populates="providers"
    )

import uuid

class Patient(Base):
    __tablename__ = "patients"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    clinical_history = Column(String)
    # insurance_id = Column(String, ForeignKey("insurance.insurance_id"))
    
    # Relationships
    # insurance = relationship("Insurance", backref="patients")
    claims = relationship("Claim", back_populates="patient")


from sqlalchemy.sql import func

class Claim(Base):
    __tablename__ = "claims"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id = Column(UUID(as_uuid=True), ForeignKey("patients.id"))
    provider_npi = Column(String, ForeignKey("providers.npi"))
    clinical_description = Column(String)
    status_reasoning = Column(String)
    cpt_codes = Column(JSONB)  # List of ICD-10 or other codes
    diagnosis_codes = Column(JSONB)  # List of ICD-10 or other codes
    status = Column(String)  # e.g., "approved", "denied", "in progress", etc.
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    
    # Relationships
    patient = relationship("Patient", back_populates="claims")
    provider = relationship("Provider", foreign_keys=[provider_npi])
    # claim_queue = relationship("ClaimQueue", back_populates="claim", uselist=False)
    priority_score = Column(Integer)




# class ClaimQueue(Base):
#     __tablename__ = "claim_queue"
#     id = Column(String, primary_key=True)
#     claim_id = Column(String, ForeignKey("claims.claim_id"))
#     provider_id = Column(String, ForeignKey("providers.npi"))
#     priority_score = Column(Integer)

#     # Relationships
#     claim = relationship("Claim", back_populates="claim_queue")
#     provider = relationship("Provider", backref="claim_queues")
