package models

import (
	"strings"
	"time"
)

// Project mirrors Excel "Current Project" sheet + team-based allocation
type Project struct {
	ID           int    `json:"id"`
	JobCard      string `json:"jobCard"`
	Contract     string `json:"contract"`
	ServiceOrder string `json:"serviceOrder"`
	Project      string `json:"project"`
	Desc         string `json:"desc"`
	Unit         string `json:"unit"`
	Qty          int    `json:"qty"` // Product Quantity (deliverables count)
	Location     string `json:"location"`
	MobDate      string `json:"mobDate"`
	ExpStart     string `json:"expStart"`
	ExpEnd       string `json:"expEnd"`
	ActStart     string `json:"actStart"`
	ActEnd       string `json:"actEnd"`
	AssignedTo   string `json:"assignedTo"`
	Team         string `json:"team"` // Assigned teams comma-separated (e.g. "A, B" or "I")
	Remarks      string `json:"remarks"`
}

// Status computes Active vs Pending - Active when start date is set
func (p *Project) Status() string {
	s := p.EffectiveStart()
	if s != "" {
		return "Active"
	}
	return "Pending"
}

func (p *Project) EffectiveStart() string {
	if strings.TrimSpace(p.ActStart) != "" {
		return strings.TrimSpace(p.ActStart)
	}
	return strings.TrimSpace(p.ExpStart)
}

func (p *Project) EffectiveEnd() string {
	if strings.TrimSpace(p.ActEnd) != "" {
		return strings.TrimSpace(p.ActEnd)
	}
	return strings.TrimSpace(p.ExpEnd)
}

// EffectiveMobDate returns MobDate or auto-computes 5 days before start date
func (p *Project) EffectiveMobDate() string {
	if strings.TrimSpace(p.MobDate) != "" {
		return strings.TrimSpace(p.MobDate)
	}
	s := p.EffectiveStart()
	if s != "" {
		if t, err := time.Parse("2006-01-02", s); err == nil {
			return t.AddDate(0, 0, -5).Format("2006-01-02")
		}
	}
	return ""
}

// Employee mirrors Excel "Data" sheet
type Employee struct {
	ID            int    `json:"id"`
	EmpID         string `json:"empId"`
	NameEn        string `json:"nameEn"`
	NameAr        string `json:"nameAr"`
	Project       string `json:"project"` // Category: DEMI, Expansion Joint, EDG, COA, Oil Spill, All
	Team          string `json:"team"`    // Team: A, B, C, D, E, F, G, H, I, K, M, -
	JobCat        string `json:"jobCat"`
	VehicleType   string `json:"vehicleType"`
	Plate         string `json:"plate"`
	Brand         string `json:"brand"`
	SecExpiry     string `json:"secExpiry"`
	VehicleStatus string `json:"vehicleStatus"`
	GatePass      string `json:"gatePass"`
	ToolsBox      string `json:"toolsBox"`
}

// IsNeed returns true if this row represents an unfilled need / vacant slot
func (e *Employee) IsNeed() bool {
	id := strings.TrimSpace(e.EmpID)
	name := strings.TrimSpace(strings.ToLower(e.NameEn))
	return id == "Need" || name == "needs" || name == "need"
}

// CategoryMap mirrors the Project Code -> Category mapping
var CategoryMap = map[string]string{
	"Demi":        "DEMI",
	"EXJ":         "Expansion Joint",
	"EDG":         "EDG",
	"COA":         "COA",
	"Oil Spill":   "Oil Spill",
	"Oill Spill":  "Oil Spill",
	"Oil":         "Oil Spill",
	"Oill":        "Oil Spill",
}

func GetCategory(code string) string {
	code = strings.TrimSpace(code)
	if cat, ok := CategoryMap[code]; ok {
		return cat
	}
	if code != "" {
		return code
	}
	return "All"
}

// ProjectDetail is Project + computed fields for API response
type ProjectDetail struct {
	Project
	Category          string      `json:"category"`
	Status            string      `json:"status"`
	StartDate         string      `json:"startDate"`
	EndDate           string      `json:"endDate"`
	MobDateComputed   string      `json:"mobDateComputed"`   // Auto 5 days before start
	AssignedTeams     []string    `json:"assignedTeams"`     // Teams actively assigned to this project (e.g. ["A", "B"])
	AvailableTeams    []string    `json:"availableTeams"`    // Teams in category not yet assigned to other active projects (alphabetical)
	AllCategoryTeams  []string    `json:"allCategoryTeams"`  // All teams belonging to this category (alphabetical)
	AssignedHeadcount int         `json:"assignedHeadcount"` // Total slots (staff + needs) in assigned teams
	AssignedEmps      []*Employee `json:"assignedEmps"`      // Employee objects in assigned teams
	ProductQty        int         `json:"productQty"`        // Deliverables quantity
}

// TeamCardInfo gives detailed status for a single team in category pool
type TeamCardInfo struct {
	Name        string `json:"name"`        // "A", "B", etc.
	TotalSlots  int    `json:"totalSlots"`  // Total positions in this team
	ActualStaff int    `json:"actualStaff"` // Permanent named employees
	NeedSlots   int    `json:"needSlots"`   // Vacant / temp positions
	Status      string `json:"status"`      // "Deployed" or "Office / Standby"
	ActiveJob   string `json:"activeJob"`   // Job Card if deployed (e.g. "JC-2026-009"), else ""
}

// PoolCategoryStatus holds workforce pool numbers and rich team cards for each category
type PoolCategoryStatus struct {
	Category       string         `json:"category"`
	TotalPool      int            `json:"totalPool"`
	TotalTeams     []string       `json:"totalTeams"`     // All team names in alphabetical order
	CommittedTeams []string       `json:"committedTeams"` // Deployed team names
	AvailableTeams []string       `json:"availableTeams"` // Standby / Office team names
	Committed      int            `json:"committed"`      // Deployed slots
	Available      int            `json:"available"`      // Standby slots in office
	TeamCards      []TeamCardInfo `json:"teamCards"`      // Rich card data for each team in alphabetical order
}

// DashboardKPIs holds the 6 KPI values
type DashboardKPIs struct {
	Active     int       `json:"active"`
	Pending    int       `json:"pending"`
	Deployed   int       `json:"deployed"`
	Total      int       `json:"total"`
	Idle       int       `json:"idle"`
	Shortfalls int       `json:"shortfalls"`
	UpdatedAt  time.Time `json:"updatedAt"`
}
