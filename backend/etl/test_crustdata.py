import pytest
import httpx
import respx
import json
from main import fetch_crustdata_enrichment

@pytest.mark.asyncio
@respx.mock
async def test_crustdata_successful_enrichment():
    # Mock a successful API response matching main.py logic
    mock_response = {
        "companies": [
            {
                "company_name": "Mount Sinai Health System",
                "linkedin_headcount": 15000,
                "company_website": "https://www.mountsinai.org"
            }
        ]
    }
    # Match the exact URL used in main.py
    route = respx.post("https://api.crustdata.com/screener/companydb/search").mock(
        return_value=httpx.Response(200, json=mock_response)
    )

    staff_count, website = await fetch_crustdata_enrichment("Dr. Leon Black", "valid-token")
    
    assert route.called
    assert staff_count == 15000
    assert website == "https://www.mountsinai.org"

@pytest.mark.asyncio
@respx.mock
async def test_crustdata_empty_results():
    # Mock an empty response
    respx.post("https://api.crustdata.com/screener/companydb/search").mock(
        return_value=httpx.Response(200, json={"companies": []})
    )

    staff_count, website = await fetch_crustdata_enrichment("Unknown Doctor", "valid-token")
    
    # Should return fallbacks defined in main.py (8 headcount, private-practice website)
    assert staff_count == 8
    assert "private-practice.com" in website

@pytest.mark.asyncio
async def test_crustdata_no_token_fallback():
    # Test fallback when no token is provided (random int between 5-55)
    staff_count, website = await fetch_crustdata_enrichment("Dr. Smith", None)
    
    assert 5 <= staff_count <= 55
    assert "fallback-clinic.org" in website

@pytest.mark.asyncio
@respx.mock
async def test_crustdata_api_error_handling():
    # Mock a 500 error to trigger the exception block in main.py
    respx.post("https://api.crustdata.com/screener/companydb/search").mock(
        return_value=httpx.Response(500)
    )

    staff_count, website = await fetch_crustdata_enrichment("Dr. Error", "valid-token")
    
    # Should return the catch-all fallback (10 headcount, default-clinic website)
    assert staff_count == 10
    assert "default-clinic.com" in website

@pytest.mark.asyncio
@respx.mock
async def test_crustdata_timeout_handling():
    # Mock a timeout to trigger the exception block
    respx.post("https://api.crustdata.com/screener/companydb/search").mock(
        side_effect=httpx.TimeoutException("Timeout")
    )

    staff_count, website = await fetch_crustdata_enrichment("Dr. Slow", "valid-token")
    
    assert staff_count == 10
    assert "default-clinic.com" in website
