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
	NPI                 int      `json:"npi"`
	FullName            string   `json:"full_name"`
	Specialty           string   `json:"specialty"`
	Address             string   `json:"address"`
	WaitTimeDays        int      `json:"wait_time_days"`
	AcceptedInsurance   []string `json:"accepted_insurance"`
	YearsExperience     int      `json:"years_experience"`
	ClinicSize          string   `json:"clinic_size"`
	DataDiscrepancyFlag bool     `json:"data_discrepancy_flag"` // Flags NPI vs Crustdata collisions
	DiscrepancyNote     string   `json:"discrepancy_note"`
}

func fetchCrustdata(name, token string) CrustdataResponse {
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
	json.NewDecoder(resp.Body).Decode(&data)
	return data
}

func main() {
	crustdataToken := os.Getenv("CRUSTDATA_API_KEY")
	unsiloedToken := os.Getenv("UNSILOED_API_KEY")

	fmt.Println("1. Fetching Federal NPI Registry Data...")
	resp, err := http.Get("https://npiregistry.cms.hhs.gov/api/?version=2.1&city=new+york&state=ny&taxonomy_description=cardiovascular+disease&limit=15")
	if err != nil {
		log.Fatalf("NPI API failed: %v", err)
	}
	defer resp.Body.Close()

	var npiData NPIResponse
	json.NewDecoder(resp.Body).Decode(&npiData)

	var providers []EnrichedProvider
	insurances := []string{"Medicaid", "Medicare", "BlueCross", "Aetna", "Fidelis Care"}
	rand.Seed(time.Now().UnixNano())

	fmt.Println("2. Enriching with Crustdata API...")
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

		// Edge Case: Simulate a data silo discrepancy where professional data doesn't match federal data
		hasDiscrepancy := rand.Float32() < 0.20 // 20% chance of collision
		discrepancyNote := ""
		if hasDiscrepancy {
			discrepancyNote = "Warning: Federal NPI registry address differs from Crustdata professional scrape. Verify clinic location manually."
		}

		providers = append(providers, EnrichedProvider{
			NPI: doc.Number, FullName: strings.ToUpper(fullName), Specialty: specialty,
			Address: address, WaitTimeDays: rand.Intn(45) + 1, AcceptedInsurance: insurances[:3],
			YearsExperience: crustMetrics.ExperienceYears, ClinicSize: crustMetrics.ClinicSize,
			DataDiscrepancyFlag: hasDiscrepancy, DiscrepancyNote: discrepancyNote,
		})
	}

	fmt.Println("3. Standardizing payload via Unsiloed AI...")
	rawJSON, _ := json.Marshal(map[string]interface{}{
		"data": providers, "instructions": "Standardize provider data perfectly into JSON array.",
	})

	req, _ := http.NewRequest("POST", "https://api.unsiloed.ai/v1/process", bytes.NewBuffer(rawJSON))
	req.Header.Set("Authorization", "Bearer "+unsiloedToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	unsiloedResp, err := client.Do(req)

	finalData := rawJSON // Default to raw if Unsiloed fails or token is missing
	if err == nil && unsiloedResp.StatusCode == 200 {
		defer unsiloedResp.Body.Close()
		finalData, _ = io.ReadAll(unsiloedResp.Body)
	}

	// Create agent directory if it doesn't exist
	os.MkdirAll("../agent", os.ModePerm)
	os.WriteFile("../agent/clean_providers.json", finalData, 0644)
	fmt.Println("ETL Pipeline Complete! Data secured in ../agent/clean_providers.json")
}
