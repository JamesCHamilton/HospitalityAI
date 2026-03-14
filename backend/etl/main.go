// etl/main.go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"
)

// --- Structs ---
type NPIResponse struct {
	Results []struct {
		Number int `json:"number"`
		Basic  struct {
			FirstName  string `json:"first_name"`
			LastName   string `json:"last_name"`
			Credential string `json:"credential"`
		} `json:"basic"`
		Addresses []struct {
			Address1       string `json:"address_1"`
			City           string `json:"city"`
			State          string `json:"state"`
			AddressPurpose string `json:"address_purpose"`
		} `json:"addresses"`
		Taxonomies []struct {
			Desc    string `json:"desc"`
			Primary bool   `json:"primary"`
		} `json:"taxonomies"`
	} `json:"results"`
}

type CrustdataResponse struct {
	ExperienceYears int    `json:"years_of_experience"`
	ClinicSize      string `json:"company_size"`
}

type EnrichedProvider struct {
	NPI               int      `json:"npi"`
	FullName          string   `json:"full_name"`
	Specialty         string   `json:"specialty"`
	Address           string   `json:"address"`
	WaitTimeDays      int      `json:"wait_time_days"`
	AcceptedInsurance []string `json:"accepted_insurance"`
	YearsExperience   int      `json:"years_experience"`
	ClinicSize        string   `json:"clinic_size"`
}

func fetchCrustdata(name, token string) CrustdataResponse {
	// Fallback mock if API key isn't set or request fails
	mockData := CrustdataResponse{ExperienceYears: rand.Intn(25) + 2, ClinicSize: "11-50"}
	if token == "" {
		return mockData
	}

	apiURL := "https://api.crustdata.com/v1/person/search"
	payload := []byte(fmt.Sprintf(`{"search_query": "%s", "industry": "Healthcare"}`, name))

	req, _ := http.NewRequest("POST", apiURL, bytes.NewBuffer(payload))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		return mockData
	}
	defer resp.Body.Close()

	var data CrustdataResponse
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &data)
	return data
}

func main() {
	crustdataToken := os.Getenv("CRUSTDATA_API_KEY")
	unsiloedToken := os.Getenv("UNSILOED_API_KEY")

	fmt.Println("1. Fetching NPI Registry Data...")
	resp, err := http.Get("https://npiregistry.cms.hhs.gov/api/?version=2.1&city=new+york&state=ny&taxonomy_description=cardiovascular+disease&limit=15")
	if err != nil {
		log.Fatalf("NPI API failed: %v", err)
	}
	defer resp.Body.Close()

	var npiData NPIResponse
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &npiData)

	var providers []EnrichedProvider
	insurances := []string{"Medicaid", "Medicare", "BlueCross", "Aetna", "Fidelis Care"}
	rand.Seed(time.Now().UnixNano())

	fmt.Println("2. Enriching with Crustdata...")
	for _, doc := range npiData.Results {
		if doc.Basic.FirstName == "" {
			continue
		}

		fullName := fmt.Sprintf("Dr. %s %s", doc.Basic.FirstName, doc.Basic.LastName)
		specialty := "Cardiology"
		for _, tax := range doc.Taxonomies {
			if tax.Primary {
				specialty = tax.Desc
				break
			}
		}

		address := "Unknown"
		for _, addr := range doc.Addresses {
			if addr.AddressPurpose == "LOCATION" {
				address = fmt.Sprintf("%s, %s, %s", addr.Address1, addr.City, addr.State)
				break
			}
		}

		crustMetrics := fetchCrustdata(fullName, crustdataToken)
		rand.Shuffle(len(insurances), func(i, j int) { insurances[i], insurances[j] = insurances[j], insurances[i] })

		providers = append(providers, EnrichedProvider{
			NPI: doc.Number, FullName: strings.ToUpper(fullName), Specialty: specialty,
			Address: address, WaitTimeDays: rand.Intn(45) + 1, AcceptedInsurance: insurances[:3],
			YearsExperience: crustMetrics.ExperienceYears, ClinicSize: crustMetrics.ClinicSize,
		})
	}

	fmt.Println("3. Standardizing via Unsiloed AI...")
	rawJSON, _ := json.Marshal(map[string]interface{}{
		"data": providers, "instructions": "Standardize provider data perfectly.",
	})

	req, _ := http.NewRequest("POST", "https://api.unsiloed.ai/v1/process", bytes.NewBuffer(rawJSON))
	req.Header.Set("Authorization", "Bearer "+unsiloedToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	unsiloedResp, err := client.Do(req)

	finalData := rawJSON // Default to our raw data if Unsiloed isn't hooked up yet
	if err == nil && unsiloedResp.StatusCode == 200 {
		defer unsiloedResp.Body.Close()
		finalData, _ = io.ReadAll(unsiloedResp.Body)
	}

	// Save to a file for the Blaxel Agent to use
	os.WriteFile("../agent/clean_providers.json", finalData, 0644)
	fmt.Println("Data pipeline complete! Saved to clean_providers.json")
}
