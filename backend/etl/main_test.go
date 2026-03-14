package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestEnrichmentLogic verifies the structure and fallback of the Crustdata simulation
func TestEnrichmentLogic(t *testing.T) {
	staffCount, website := fetchCrustdataEnrichment("Dr. John Doe", "")
	
	if staffCount < 5 || staffCount > 55 {
		t.Errorf("Staff count fallback out of expected range: %d", staffCount)
	}
	
	if !strings.HasPrefix(website, "http") {
		t.Errorf("Website fallback invalid: %s", website)
	}
}

// TestProviderStructJSON verifies the provider serialization matches expected keys
func TestProviderStructJSON(t *testing.T) {
	p := Provider{
		NPI: 123,
		FullName: "Dr. Test",
		ClinicSize: 20,
		DataDiscrepancyFlag: true,
	}
	
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	
	jsonStr := string(data)
	if !strings.Contains(jsonStr, "clinic_staff_count") {
		t.Errorf("JSON missing 'clinic_staff_count' key: %s", jsonStr)
	}
	
	if !strings.Contains(jsonStr, "data_discrepancy_flag") {
		t.Errorf("JSON missing 'data_discrepancy_flag' key: %s", jsonStr)
	}
}

// TestCommonPlans verification
func TestCommonPlans(t *testing.T) {
	if len(CommonPlans) == 0 {
		t.Fatal("CommonPlans list should not be empty")
	}
	
	for _, plan := range CommonPlans {
		if plan.PlanID == "" || plan.Carrier == "" {
			t.Errorf("Insurance plan data incomplete: %+v", plan)
		}
	}
}
