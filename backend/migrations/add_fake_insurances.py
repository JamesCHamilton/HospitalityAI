from models import Insurance, Base
from config.db import SessionLocal

def add_fake_insurances():
    """
    Adds a short set of representative fake insurances to the DB,
    with some basic real-world-inspired characteristics.
    """
    session = SessionLocal()

    # Define fake insurance plans (can be extended/modified)
    fake_insurances = [
        {
            # BCBS example
            "insurance_id": "FAKE_BCBS_HMO_001",
            "insurance_name": "BlueCross HMO Silver",
            "insurer": "Blue Cross Blue Shield",
            "plan_type": "HMO",
            "network_size": "medium",
            "covered_specialties": ["internal medicine", "family medicine", "pediatrics", "general surgery", "cardiology"],
            "general_covered_icd10": ["I10", "E11.9", "J02.9"],
            "general_covered_cpt": ["99213", "99395", "93000"],
            "import_id": "fake_import_bcbs_hmo_silver"
        },
        {
            # United example
            "insurance_id": "FAKE_UNITED_PPO_002",
            "insurance_name": "United PPO Platinum",
            "insurer": "UnitedHealthcare",
            "plan_type": "PPO",
            "network_size": "large",
            "covered_specialties": ["cardiology", "orthopedics", "dermatology", "obstetrics & gynecology"],
            "general_covered_icd10": ["M54.5", "I25.10", "E78.5"],
            "general_covered_cpt": ["99214", "73030", "71046"],
            "import_id": "fake_import_uhc_ppo_platinum"
        },
        {
            # Aetna sample
            "insurance_id": "FAKE_AETNA_EPO_003",
            "insurance_name": "Aetna EPO Gold",
            "insurer": "Aetna",
            "plan_type": "EPO",
            "network_size": "medium",
            "covered_specialties": ["neurology", "endocrinology", "gastroenterology"],
            "general_covered_icd10": ["G40.909", "E03.9", "K21.9"],
            "general_covered_cpt": ["99215", "84443", "97530"],
            "import_id": "fake_import_aetna_epo_gold"
        },
        {
            # Medicaid NY
            "insurance_id": "FAKE_MEDICAID_NY_004",
            "insurance_name": "NY State Medicaid",
            "insurer": "Medicaid",
            "plan_type": "Medicaid",
            "network_size": "large",
            "covered_specialties": [
                "internal medicine", "family medicine", "obstetrics & gynecology",
                "pediatrics", "psychiatry", "general surgery"
            ],
            "general_covered_icd10": ["Z00.00", "F33.1"],
            "general_covered_cpt": ["99385", "90837"],
            "import_id": "fake_import_medicaid_ny"
        },
        {
            # Oscar sample
            "insurance_id": "FAKE_OSCAR_HMO_005",
            "insurance_name": "Oscar Classic HMO",
            "insurer": "Oscar",
            "plan_type": "HMO",
            "network_size": "small",
            "covered_specialties": ["general practice", "dermatology", "ophthalmology"],
            "general_covered_icd10": ["L98.9", "H10.9"],
            "general_covered_cpt": ["99212", "92002"],
            "import_id": "fake_import_oscar_hmo_classic"
        },
        {
            # Empire BlueCross BlueShield example
            "insurance_id": "FAKE_EMPIRE_POS_006",
            "insurance_name": "Empire POS Flexible",
            "insurer": "Empire BlueCross BlueShield",
            "plan_type": "POS",
            "network_size": "medium",
            "covered_specialties": ["internal medicine", "emergency medicine", "urology", "oncology"],
            "general_covered_icd10": ["C34.90", "N40.1", "R07.9"],
            "general_covered_cpt": ["99203", "99284", "51798"],
            "import_id": "fake_import_empire_pos_flexible"
        },
        {
            # Cigna example
            "insurance_id": "FAKE_CIGNA_OAP_007",
            "insurance_name": "Cigna Open Access Plus",
            "insurer": "Cigna",
            "plan_type": "OAP",
            "network_size": "large",
            "covered_specialties": ["rheumatology", "hematology", "gastroenterology"],
            "general_covered_icd10": ["K50.90", "D50.9", "M06.9"],
            "general_covered_cpt": ["88305", "45378", "80050"],
            "import_id": "fake_import_cigna_oap"
        },
        {
            # Humana sample
            "insurance_id": "FAKE_HUMANA_HMO_008",
            "insurance_name": "Humana Essential HMO",
            "insurer": "Humana",
            "plan_type": "HMO",
            "network_size": "medium",
            "covered_specialties": ["internal medicine", "allergy & immunology", "pulmonology"],
            "general_covered_icd10": ["J45.909", "D80.1", "R06.02"],
            "general_covered_cpt": ["99204", "95004", "94010"],
            "import_id": "fake_import_humana_hmo_essential"
        },
        {
            # Medicare sample
            "insurance_id": "FAKE_MEDICARE_009",
            "insurance_name": "Original Medicare",
            "insurer": "Medicare",
            "plan_type": "Medicare",
            "network_size": "national",
            "covered_specialties": [
                "internal medicine", "family medicine", "orthopedics", "cardiology",
                "neurology", "general surgery", "endocrinology", "infectious disease"
            ],
            "general_covered_icd10": ["I10", "E11.9", "B20", "M16.11"],
            "general_covered_cpt": ["99213", "27447", "80061", "87086"],
            "import_id": "fake_import_medicare"
        },
        {
            # Fidelis Care NY
            "insurance_id": "FAKE_FIDELIS_NY_010",
            "insurance_name": "Fidelis Care Essential Plan",
            "insurer": "Fidelis Care",
            "plan_type": "HMO",
            "network_size": "large",
            "covered_specialties": [
                "family medicine", "psychiatry", "pediatrics", "gastroenterology"
            ],
            "general_covered_icd10": ["F41.1", "Z00.129", "K58.9"],
            "general_covered_cpt": ["90834", "99494", "44388"],
            "import_id": "fake_import_fidelis_ny_essential"
        }
    ]

    for fi in fake_insurances:
        # Check for existing by import_id to avoid duplication if run multiple times
        existing = session.query(Insurance).filter_by(insurance_id=fi["insurance_id"]).first()
        if not existing:
            insurance = Insurance(
                insurance_id=fi["insurance_id"],
                insurance_name=fi["insurance_name"],
                insurer=fi["insurer"],
                plan_type=fi["plan_type"],
                network_size=fi.get("network_size"),
                covered_specialties=fi.get("covered_specialties"),
                general_covered_icd10=fi.get("general_covered_icd10"),
                general_covered_cpt=fi.get("general_covered_cpt"),
            )
            # Store custom import_id as an extra attribute, attach as Python attribute
            # If the schema changes and includes import_id in Insurance, add as a column
            insurance.import_id = fi["import_id"]
            session.add(insurance)

    session.commit()
    session.close()

if __name__ == "__main__":
    add_fake_insurances()
