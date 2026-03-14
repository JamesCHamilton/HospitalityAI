import requests
from models import Provider, SpecialtyTaxonomy, Base
from config.db import SessionLocal

def import_npis_from_npi_registry():
    url = "https://npiregistry.cms.hhs.gov/api/?version=2.1&city=new+york&state=ny&limit=200"
    session = SessionLocal()

    response = requests.get(url)
    data = response.json()

    for item in data.get("results", []):
        npi_number = str(item.get("number"))

        # Create a unique import_id for deduplication: could use e.g., NPI + source, or just npi
        # This assumes the import_id in Provider is used to deduplicate providers from import sources.
        import_id = f"npi_registry__{npi_number}"

        # Get provider name, prefer organization_name, fallback to authorized_official_name
        basic = item.get("basic", {})
        provider_name = basic.get("organization_name")
        if not provider_name:
            first = basic.get("authorized_official_first_name", "")
            last = basic.get("authorized_official_last_name", "")
            provider_name = f"{first} {last}".strip() or "N/A"

        # Get address with address_purpose == LOCATION
        address = None
        for addr in item.get("addresses", []):
            if addr.get("address_purpose", "").upper() == "LOCATION":
                address = addr
                break

        address_str = None
        zip_code = None
        if address:
            address1 = address.get("address_1", "")
            address2 = address.get("address_2") or ""
            city = address.get("city", "")
            state = address.get("state", "")
            postal = address.get("postal_code", "")
            zip_digits = ''.join([c for c in (postal or "") if c.isdigit()])
            zip_code = int(zip_digits[:5]) if len(zip_digits) >= 5 else None
            parts = [address1]
            if address2:
                parts.append(address2)
            if city:
                parts.append(city)
            if state:
                parts.append(state)
            if postal:
                parts.append(postal)
            address_str = ", ".join(parts)
        else:
            address_str = ""
            zip_code = None

        specialty_taxonomy_codes = []
        for tx in item.get("taxonomies", []):
            if "code" in tx:
                specialty_taxonomy_codes.append(tx["code"])

        # Deduplicate using import_id, not just NPI
        provider = session.query(Provider).filter_by(import_id=import_id).first()
        if not provider:
            provider = Provider(
                npi=npi_number,
                provider_name=provider_name,
                address=address_str,
                zip_code=zip_code,
                import_id=import_id,
            )
            session.add(provider)
        else:
            provider.provider_name = provider_name
            provider.address = address_str
            provider.zip_code = zip_code[:5]

        # Set SpecialtyTaxonomies relationship (replace existing set)
        provider.specialty_taxonomies = []
        for code in specialty_taxonomy_codes:
            specialty = session.query(SpecialtyTaxonomy).filter_by(taxonomy_code=code.strip()).first()
            if specialty:
                provider.specialty_taxonomies.append(specialty)

    session.commit()
    session.close()


if __name__ == "__main__":
    import_npis_from_npi_registry()
