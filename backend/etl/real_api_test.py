import os
import json
import httpx
import asyncio
from dotenv import load_dotenv

load_dotenv()

async def inspect_real_crustdata():
    token = os.getenv("CRUSTDATA_API_KEY")
    if not token:
        print("❌ Error: CRUSTDATA_API_KEY environment variable not set.")
        return

    api_url = "https://api.crustdata.com/screener/companydb/search"
    
    # We'll search for a major hospital system to ensure we get a "rich" response
    payload = {
        "filters": {
            "filter_type": "company_name",
            "type": "(.)",
            "value": "Mount Sinai Health System"
        },
        "limit": 1
    }
    
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json"
    }

    print(f"📡 Calling Crustdata API for: {payload['filters']['value']}...")
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(api_url, json=payload, headers=headers, timeout=15.0)
            
            print(f"Statue Code: {resp.status_code}")
            
            if resp.status_code == 200:
                data = resp.json()
                print("\n📦 RAW JSON RESPONSE STRUCTURE:")
                print(json.dumps(data, indent=2))
                
                # Highlight the fields we are using in main.py
                if data.get("companies"):
                    company = data["companies"][0]
                    print("\n🎯 FIELDS WE EXTRACT:")
                    print(f"-> linkedin_headcount: {company.get('linkedin_headcount')}")
                    print(f"-> company_website: {company.get('company_website')}")
            else:
                print(f"❌ API Error: {resp.text}")
                
        except Exception as e:
            print(f"❌ Request Failed: {e}")

if __name__ == "__main__":
    asyncio.run(inspect_real_crustdata())
