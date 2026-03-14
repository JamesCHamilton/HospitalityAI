import csv
from models import SpecialtyTaxonomy, Base
from sqlalchemy.orm import sessionmaker
from config.db import get_db
from sqlalchemy import create_engine

from config.db import SessionLocal

def import_specialty_taxonomies(csv_path):
    """
    Read the taxonomy-dataset.csv and populate the specialty_taxonomies table.
    """
    session = SessionLocal()

    with open(csv_path, newline='', encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            # Remove leading/trailing whitespace from values, (some codes in csv have trailing spaces)
            print(row, "thing")
            taxonomy_code = row['PROVIDER TAXONOMY CODE'].strip()
            medicare_specialty_code = row['MEDICARE SPECIALTY CODE'].strip()
            provider_type_description = row['MEDICARE PROVIDER/SUPPLIER TYPE DESCRIPTION'].strip()
            taxonomy_type = row['PROVIDER TAXONOMY DESCRIPTION:  TYPE, CLASSIFICATION, SPECIALIZATION'].strip()

            import_id = f"{medicare_specialty_code}_{taxonomy_code}"

            exists = session.query(SpecialtyTaxonomy).filter_by(import_id=import_id).first()
            if not exists:
                specialty = SpecialtyTaxonomy(
                    taxonomy_code=taxonomy_code,
                    medicare_specialty_code=medicare_specialty_code,
                    provider_type_description=provider_type_description,
                    taxonomy_type=taxonomy_type,
                    import_id=import_id,
                )
                session.add(specialty)

        session.commit()
    session.close()


# Usage: run this script from the 'backend' directory with:
# python migrations/import_taxonomies.py
import_specialty_taxonomies('data/taxonomy-dataset.csv')