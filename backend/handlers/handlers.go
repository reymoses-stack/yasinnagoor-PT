package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"pioneer-dashboard/models"
)

// ---------- In-memory store ----------
var (
	mu        sync.RWMutex
	projects  []*models.Project
	employees []*models.Employee
	nextPrjID int
	nextEmpID int
)

func Init() {
	projects = models.SeedProjects()
	employees = models.SeedEmployees()
	nextPrjID = len(projects) + 1
	nextEmpID = len(employees) + 1
}

// calcMobDate returns date 5 days before startDate (YYYY-MM-DD)
func calcMobDate(startDateStr string) string {
	startDateStr = strings.TrimSpace(startDateStr)
	if startDateStr == "" {
		return ""
	}
	t, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		return ""
	}
	return t.AddDate(0, 0, -5).Format("2006-01-02")
}

// getCategoryTeams returns sorted unique team names in alphabetical order
func getCategoryTeams(cat string, allEmps []*models.Employee) []string {
	teamSet := make(map[string]bool)
	for _, e := range allEmps {
		eCat := models.GetCategory(e.Project)
		if cat == "All" || eCat == cat || e.Project == cat {
			t := strings.TrimSpace(e.Team)
			if t != "" && t != "-" {
				teamSet[t] = true
			}
		}
	}
	var teams []string
	for t := range teamSet {
		teams = append(teams, t)
	}
	sort.Strings(teams)
	if len(teams) == 0 {
		switch cat {
		case "Expansion Joint":
			teams = []string{"A", "B", "C", "D", "E"}
		case "EDG":
			teams = []string{"F", "G", "M"}
		case "DEMI":
			teams = []string{"I", "K"}
		case "COA":
			teams = []string{"H"}
		case "Oil Spill":
			teams = []string{"A"}
		default:
			if cat != "All" {
				teams = []string{"A"}
			}
		}
	}
	return teams
}

// getTeamEmployees returns all employees (including Needs) in a given category and team
func getTeamEmployees(cat, team string, allEmps []*models.Employee) []*models.Employee {
	var emps []*models.Employee
	for _, e := range allEmps {
		eCat := models.GetCategory(e.Project)
		if (cat == "All" || eCat == cat || e.Project == cat) && strings.TrimSpace(e.Team) == strings.TrimSpace(team) {
			emps = append(emps, e)
		}
	}
	sort.SliceStable(emps, func(i, j int) bool {
		return emps[i].ID < emps[j].ID
	})
	return emps
}

// parseTeamList parses comma/space separated team names into a clean alphabetical slice
func parseTeamList(teamStr string) []string {
	if strings.TrimSpace(teamStr) == "" {
		return nil
	}
	raw := strings.Split(teamStr, ",")
	var out []string
	seen := make(map[string]bool)
	for _, r := range raw {
		t := strings.TrimSpace(r)
		t = strings.TrimPrefix(t, "Team ")
		t = strings.TrimPrefix(t, "team ")
		t = strings.TrimSpace(t)
		if t != "" && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	sort.Strings(out)
	return out
}

// computeAllProjects computes Live Board data with Dynamic Helper Absorption:
// - The 1st active project in a category holds its base team (Team A) PLUS all remaining idle teams in that category.
// - When subsequent projects start in that category (P2, P3, etc.), they peel off the next available team (P2 takes Team B, P3 takes Team C), while Project 1 retains Team A plus any remaining unpeeled teams.
func computeAllProjects(prjs []*models.Project, emps []*models.Employee) []models.ProjectDetail {
	// 1. Group active projects by category in chronological / appearance order
	catActiveProjects := make(map[string][]*models.Project)
	for _, p := range prjs {
		if p.Status() == "Active" {
			cat := models.GetCategory(p.Project)
			catActiveProjects[cat] = append(catActiveProjects[cat], p)
		}
	}

	// 2. Pre-calculate assigned teams for each active project
	projectAssignedTeams := make(map[int][]string)
	usedTeams := make(map[string]map[string]string) // category -> team -> jobCard
	for _, cat := range []string{"DEMI", "Expansion Joint", "EDG", "COA", "Oil Spill", "All"} {
		usedTeams[cat] = make(map[string]string)
	}

	for cat, activeList := range catActiveProjects {
		allCatTeams := getCategoryTeams(cat, emps)
		if len(allCatTeams) == 0 || len(activeList) == 0 {
			continue
		}

		if len(activeList) == 1 {
			p1 := activeList[0]
			explicit := parseTeamList(p1.Team)
			if len(explicit) > 0 {
				projectAssignedTeams[p1.ID] = explicit
				for _, t := range explicit {
					usedTeams[cat][t] = p1.JobCard
				}
			} else {
				// 1st project holds ALL teams in category so remaining workers never sit idle
				projectAssignedTeams[p1.ID] = allCatTeams
				for _, t := range allCatTeams {
					usedTeams[cat][t] = p1.JobCard
				}
			}
		} else {
			// Multiple active projects in same category:
			// Pass 1: Assign 1 team to each subsequent project (P2 takes Team B, P3 takes Team C, etc.)
			p1 := activeList[0]
			claimedBySubsequent := make(map[string]bool)

			for i := 1; i < len(activeList); i++ {
				pi := activeList[i]
				explicit := parseTeamList(pi.Team)
				if len(explicit) > 0 {
					projectAssignedTeams[pi.ID] = explicit
					for _, t := range explicit {
						claimedBySubsequent[t] = true
						usedTeams[cat][t] = pi.JobCard
					}
				} else {
					// Auto-pick the next available team starting from index 1 (Team B, C, D...)
					var chosenTeam string
					for teamIdx := 1; teamIdx < len(allCatTeams); teamIdx++ {
						tCandidate := allCatTeams[teamIdx]
						if !claimedBySubsequent[tCandidate] {
							chosenTeam = tCandidate
							break
						}
					}
					if chosenTeam == "" {
						for _, tCandidate := range allCatTeams {
							if !claimedBySubsequent[tCandidate] {
								chosenTeam = tCandidate
								break
							}
						}
					}

					if chosenTeam != "" {
						claimedBySubsequent[chosenTeam] = true
						projectAssignedTeams[pi.ID] = []string{chosenTeam}
						usedTeams[cat][chosenTeam] = pi.JobCard
					}
				}
			}

			// Pass 2: Project 1 (the first started project) holds Team A + ALL remaining unpeeled teams!
			explicit1 := parseTeamList(p1.Team)
			if len(explicit1) > 0 {
				var p1Teams []string
				for _, t := range explicit1 {
					if !claimedBySubsequent[t] {
						p1Teams = append(p1Teams, t)
						usedTeams[cat][t] = p1.JobCard
					}
				}
				projectAssignedTeams[p1.ID] = p1Teams
			} else {
				var p1Teams []string
				for _, t := range allCatTeams {
					if !claimedBySubsequent[t] {
						p1Teams = append(p1Teams, t)
						usedTeams[cat][t] = p1.JobCard
					}
				}
				projectAssignedTeams[p1.ID] = p1Teams
			}
		}
	}

	// 3. Build details for each project
	details := make([]models.ProjectDetail, 0, len(prjs))
	for _, p := range prjs {
		cat := models.GetCategory(p.Project)
		status := p.Status()
		allCatTeams := getCategoryTeams(cat, emps)

		computedMob := p.MobDate
		if strings.TrimSpace(computedMob) == "" {
			computedMob = calcMobDate(p.EffectiveStart())
		}

		assigned := projectAssignedTeams[p.ID]
		sort.Strings(assigned)

		var assignedEmps []*models.Employee
		if status == "Active" {
			for _, t := range assigned {
				tEmps := getTeamEmployees(cat, t, emps)
				assignedEmps = append(assignedEmps, tEmps...)
			}
		}

		// Available teams in category
		var availableAfter []string
		for _, t := range allCatTeams {
			if usedTeams[cat][t] == "" {
				availableAfter = append(availableAfter, t)
			}
		}

		details = append(details, models.ProjectDetail{
			Project:           *p,
			Category:          cat,
			Status:            status,
			StartDate:         p.EffectiveStart(),
			EndDate:           p.EffectiveEnd(),
			MobDateComputed:   computedMob,
			AssignedTeams:     assigned,
			AvailableTeams:    availableAfter,
			AllCategoryTeams:  allCatTeams,
			AssignedHeadcount: len(assignedEmps),
			AssignedEmps:      assignedEmps,
			ProductQty:        p.Qty,
		})
	}
	return details
}

func computeKPIs(prjs []*models.Project, emps []*models.Employee) (models.DashboardKPIs, []models.PoolCategoryStatus) {
	details := computeAllProjects(prjs, emps)

	var active, pending, deployed, shortfalls int
	total := len(emps) // 85 total positions

	for _, d := range details {
		if d.Status == "Active" {
			active++
			deployed += d.AssignedHeadcount
			if d.AssignedHeadcount == 0 {
				shortfalls++
			}
		} else {
			pending++
		}
	}

	categories := []string{"Expansion Joint", "EDG", "DEMI", "COA", "Oil Spill", "All"}
	poolStats := make([]models.PoolCategoryStatus, 0, len(categories))

	for _, cat := range categories {
		allTeams := getCategoryTeams(cat, emps) // Alphabetical
		totalStaff := 0
		for _, t := range allTeams {
			totalStaff += len(getTeamEmployees(cat, t, emps))
		}

		// Track which team is deployed on which job card
		deployedTeamJob := make(map[string]string)
		for _, d := range details {
			if d.Status == "Active" && (cat == "All" || d.Category == cat) {
				for _, t := range d.AssignedTeams {
					if deployedTeamJob[t] == "" {
						deployedTeamJob[t] = d.JobCard
					}
				}
			}
		}

		var teamCards []models.TeamCardInfo
		var committedTeamsList []string
		var availableTeamsList []string
		committedStaff := 0

		for _, t := range allTeams {
			tEmps := getTeamEmployees(cat, t, emps)
			tot := len(tEmps)
			actual := 0
			needs := 0
			for _, e := range tEmps {
				if e.IsNeed() {
					needs++
				} else {
					actual++
				}
			}

			activeJob := deployedTeamJob[t]
			status := "Office / Standby"
			if activeJob != "" {
				status = "Deployed"
				committedTeamsList = append(committedTeamsList, t)
				committedStaff += tot
			} else {
				availableTeamsList = append(availableTeamsList, t)
			}

			teamCards = append(teamCards, models.TeamCardInfo{
				Name:        t,
				TotalSlots:  tot,
				ActualStaff: actual,
				NeedSlots:   needs,
				Status:      status,
				ActiveJob:   activeJob,
			})
		}

		poolStats = append(poolStats, models.PoolCategoryStatus{
			Category:       cat,
			TotalPool:      totalStaff,
			TotalTeams:     allTeams,
			CommittedTeams: committedTeamsList,
			AvailableTeams: availableTeamsList,
			Committed:      committedStaff,
			Available:      totalStaff - committedStaff,
			TeamCards:      teamCards,
		})
	}

	kpi := models.DashboardKPIs{
		Active:     active,
		Pending:    pending,
		Deployed:   deployed,
		Total:      total,
		Idle:       total - deployed,
		Shortfalls: shortfalls,
		UpdatedAt:  time.Now(),
	}

	return kpi, poolStats
}

// ---------- PROJECT handlers ----------

func ListProjects(c *gin.Context) {
	mu.RLock()
	defer mu.RUnlock()
	details := computeAllProjects(projects, employees)

	col := c.Query("sort")
	dir := c.Query("dir")
	if col != "" {
		sort.Slice(details, func(i, j int) bool {
			var a, b string
			switch col {
			case "id":
				a, b = strconv.Itoa(details[i].ID), strconv.Itoa(details[j].ID)
			case "jobCard":
				a, b = details[i].JobCard, details[j].JobCard
			case "project":
				a, b = details[i].Project.Project, details[j].Project.Project
			case "status":
				a, b = details[i].Status, details[j].Status
			case "location":
				a, b = details[i].Location, details[j].Location
			case "qty", "productQty":
				a, b = strconv.Itoa(details[i].Qty), strconv.Itoa(details[j].Qty)
			case "category":
				a, b = details[i].Category, details[j].Category
			case "mobDate":
				a, b = details[i].MobDateComputed, details[j].MobDateComputed
			case "startDate":
				a, b = details[i].StartDate, details[j].StartDate
			case "endDate":
				a, b = details[i].EndDate, details[j].EndDate
			case "assignedHeadcount":
				a, b = strconv.Itoa(details[i].AssignedHeadcount), strconv.Itoa(details[j].AssignedHeadcount)
			default:
				a, b = details[i].JobCard, details[j].JobCard
			}
			if dir == "desc" {
				return a > b
			}
			return a < b
		})
	}
	c.JSON(http.StatusOK, gin.H{"data": details, "total": len(details)})
}

func GetProject(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	mu.RLock()
	defer mu.RUnlock()
	details := computeAllProjects(projects, employees)
	for _, d := range details {
		if d.ID == id {
			c.JSON(http.StatusOK, d)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
}

func CreateProject(c *gin.Context) {
	var p models.Project
	if err := c.ShouldBindJSON(&p); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Auto calculate mobilization date 5 days before start date if empty
	if strings.TrimSpace(p.MobDate) == "" && p.EffectiveStart() != "" {
		p.MobDate = calcMobDate(p.EffectiveStart())
	}
	mu.Lock()
	p.ID = nextPrjID
	nextPrjID++
	projects = append(projects, &p)
	mu.Unlock()

	mu.RLock()
	defer mu.RUnlock()
	details := computeAllProjects(projects, employees)
	for _, d := range details {
		if d.ID == p.ID {
			c.JSON(http.StatusCreated, d)
			return
		}
	}
	c.JSON(http.StatusCreated, p)
}

func UpdateProject(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var body models.Project
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	mu.Lock()
	defer mu.Unlock()
	for i, p := range projects {
		if p.ID == id {
			if body.JobCard != "" {
				p.JobCard = body.JobCard
			}
			if body.Contract != "" {
				p.Contract = body.Contract
			}
			if body.ServiceOrder != "" {
				p.ServiceOrder = body.ServiceOrder
			}
			if body.Project != "" {
				p.Project = body.Project
			}
			if body.Desc != "" {
				p.Desc = body.Desc
			}
			if body.Unit != "" {
				p.Unit = body.Unit
			}
			if body.Qty != 0 {
				p.Qty = body.Qty
			}
			if body.Location != "" {
				p.Location = body.Location
			}
			p.ExpStart = body.ExpStart
			p.ExpEnd = body.ExpEnd
			p.ActStart = body.ActStart
			p.ActEnd = body.ActEnd
			if body.AssignedTo != "" {
				p.AssignedTo = body.AssignedTo
			}
			p.Team = body.Team
			if body.Remarks != "" {
				p.Remarks = body.Remarks
			}
			if strings.TrimSpace(body.MobDate) != "" {
				p.MobDate = body.MobDate
			} else if p.EffectiveStart() != "" {
				p.MobDate = calcMobDate(p.EffectiveStart())
			}

			projects[i] = p

			details := computeAllProjects(projects, employees)
			for _, d := range details {
				if d.ID == id {
					c.JSON(http.StatusOK, d)
					return
				}
			}
			c.JSON(http.StatusOK, p)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
}

func DeleteProject(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	mu.Lock()
	defer mu.Unlock()
	for i, p := range projects {
		if p.ID == id {
			projects = append(projects[:i], projects[i+1:]...)
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
}

// GET /api/projects/:id/assigned
func GetAssignedEmployees(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	mu.RLock()
	defer mu.RUnlock()
	details := computeAllProjects(projects, employees)
	for _, d := range details {
		if d.ID == id {
			c.JSON(http.StatusOK, gin.H{
				"project":       d.Project,
				"status":        d.Status,
				"category":      d.Category,
				"assignedTeams": d.AssignedTeams,
				"assigned":      d.AssignedEmps,
				"total":         len(d.AssignedEmps),
			})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
}

// GET /api/dashboard
func GetDashboard(c *gin.Context) {
	mu.RLock()
	defer mu.RUnlock()
	kpis, pools := computeKPIs(projects, employees)
	details := computeAllProjects(projects, employees)
	c.JSON(http.StatusOK, gin.H{
		"kpis":     kpis,
		"pools":    pools,
		"projects": details,
	})
}

// ---------- EMPLOYEE handlers ----------

func ListEmployees(c *gin.Context) {
	mu.RLock()
	defer mu.RUnlock()

	search := strings.ToLower(strings.TrimSpace(c.Query("search")))
	project := strings.TrimSpace(c.Query("project"))
	empType := strings.TrimSpace(c.Query("type"))
	sortCol := strings.TrimSpace(c.Query("sort"))
	dir := strings.TrimSpace(c.Query("dir"))

	out := make([]*models.Employee, 0)
	for _, e := range employees {
		if search != "" {
			if !strings.Contains(strings.ToLower(e.NameEn), search) &&
				!strings.Contains(strings.ToLower(e.EmpID), search) &&
				!strings.Contains(strings.ToLower(e.JobCat), search) &&
				!strings.Contains(strings.ToLower(e.Team), search) {
				continue
			}
		}
		if project != "" && e.Project != project {
			continue
		}
		if empType == "actual" && e.IsNeed() {
			continue
		}
		if empType == "need" && !e.IsNeed() {
			continue
		}
		out = append(out, e)
	}

	if sortCol != "" {
		sort.Slice(out, func(i, j int) bool {
			var a, b string
			switch sortCol {
			case "id":
				a, b = strconv.Itoa(out[i].ID), strconv.Itoa(out[j].ID)
			case "empId":
				a, b = out[i].EmpID, out[j].EmpID
			case "nameEn":
				a, b = out[i].NameEn, out[j].NameEn
			case "nameAr":
				a, b = out[i].NameAr, out[j].NameAr
			case "project":
				a, b = out[i].Project, out[j].Project
			case "team":
				a, b = out[i].Team, out[j].Team
			case "jobCat":
				a, b = out[i].JobCat, out[j].JobCat
			case "vehicleType":
				a, b = out[i].VehicleType, out[j].VehicleType
			case "plate":
				a, b = out[i].Plate, out[j].Plate
			case "brand":
				a, b = out[i].Brand, out[j].Brand
			case "secExpiry":
				a, b = out[i].SecExpiry, out[j].SecExpiry
			case "vehicleStatus":
				a, b = out[i].VehicleStatus, out[j].VehicleStatus
			case "gatePass":
				a, b = out[i].GatePass, out[j].GatePass
			case "toolsBox":
				a, b = out[i].ToolsBox, out[j].ToolsBox
			default:
				a, b = out[i].NameEn, out[j].NameEn
			}
			if dir == "desc" {
				return a > b
			}
			return a < b
		})
	}

	c.JSON(http.StatusOK, gin.H{"data": out, "total": len(out)})
}

func CreateEmployee(c *gin.Context) {
	var e models.Employee
	if err := c.ShouldBindJSON(&e); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mu.Lock()
	e.ID = nextEmpID
	nextEmpID++
	employees = append(employees, &e)
	mu.Unlock()
	c.JSON(http.StatusCreated, e)
}

func UpdateEmployee(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var body models.Employee
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for i, e := range employees {
		if e.ID == id {
			body.ID = id
			employees[i] = &body
			c.JSON(http.StatusOK, body)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
}

func DeleteEmployee(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	mu.Lock()
	defer mu.Unlock()
	for i, e := range employees {
		if e.ID == id {
			employees = append(employees[:i], employees[i+1:]...)
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
}

// ==========================================
//  EXCEL EXPORT HANDLERS (DASHBOARD-MATCHING THEME)
// ==========================================

// GET /api/export/dashboard - Generates an Excel workbook looking identical to the Dashboard UI
func ExportDashboard(c *gin.Context) {
	mu.RLock()
	kpis, pools := computeKPIs(projects, employees)
	details := computeAllProjects(projects, employees)
	mu.RUnlock()

	f := excelize.NewFile()
	sheet := "Dashboard"
	f.SetSheetName("Sheet1", sheet)

	f.SetSheetView(sheet, 0, &excelize.ViewOptions{ShowGridLines: boolPtr(true)})

	// 1. BRANDING HEADER
	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 16, Color: "#FFFFFF", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#1A365D"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1},
	})
	subTitleStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 10, Color: "#E2E8F0", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#2A4365"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1},
	})

	f.MergeCell(sheet, "A1", "Q1")
	f.SetCellValue(sheet, "A1", "PIONEER TECHNICAL — PROJECT ASSIGNMENT DASHBOARD")
	f.SetCellStyle(sheet, "A1", "Q1", titleStyle)
	f.SetRowHeight(sheet, 1, 32)

	f.MergeCell(sheet, "A2", "Q2")
	f.SetCellValue(sheet, "A2", fmt.Sprintf("Website: www.pg-tgc.com   |   Report Generated: %s   |   Total Headcount Slots: %d", time.Now().Format("02 Jan 2006 15:04"), kpis.Total))
	f.SetCellStyle(sheet, "A2", "Q2", subTitleStyle)
	f.SetRowHeight(sheet, 2, 20)

	// 2. KPI SUMMARY CARDS (Rows 4-6)
	kpiConfigs := []struct {
		Label    string
		Value    int
		Sub      string
		BgColor  string
		TxtColor string
		Border   string
		ColStart int
		ColEnd   int
	}{
		{"ACTIVE PROJECTS", kpis.Active, "With start date", "#E6F4EA", "#137333", "#A8DAB5", 1, 2},
		{"PENDING PROJECTS", kpis.Pending, "Awaiting scheduling", "#FEF7E0", "#B06000", "#FDD663", 3, 4},
		{"DEPLOYED SLOTS", kpis.Deployed, "Committed to active", "#E8F0FE", "#1A73E8", "#AECBFA", 5, 7},
		{"TOTAL WORKFORCE", kpis.Total, "Team slots (incl. Needs)", "#F3E8FD", "#8430CE", "#D7AEFB", 8, 10},
		{"IDLE / AVAILABLE", kpis.Idle, "In office / Standby", "#E0F2F1", "#00796B", "#80CBC4", 11, 13},
		{"SHORTFALL ALERTS", kpis.Shortfalls, "Projects with 0 staff", "#FCE8E6", "#C5221F", "#F6AEA9", 14, 17},
	}

	for _, k := range kpiConfigs {
		sCol, _ := excelize.CoordinatesToCellName(k.ColStart, 4)
		eCol, _ := excelize.CoordinatesToCellName(k.ColEnd, 4)
		f.MergeCell(sheet, sCol, eCol)
		f.SetCellValue(sheet, sCol, k.Label)

		sVal, _ := excelize.CoordinatesToCellName(k.ColStart, 5)
		eVal, _ := excelize.CoordinatesToCellName(k.ColEnd, 5)
		f.MergeCell(sheet, sVal, eVal)
		f.SetCellValue(sheet, sVal, k.Value)

		sSub, _ := excelize.CoordinatesToCellName(k.ColStart, 6)
		eSub, _ := excelize.CoordinatesToCellName(k.ColEnd, 6)
		f.MergeCell(sheet, sSub, eSub)
		f.SetCellValue(sheet, sSub, k.Sub)

		headerStyle, _ := f.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Bold: true, Size: 9, Color: k.TxtColor, Family: "Calibri"},
			Fill:      excelize.Fill{Type: "pattern", Color: []string{k.BgColor}, Pattern: 1},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		})
		valStyle, _ := f.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Bold: true, Size: 18, Color: k.TxtColor, Family: "Calibri"},
			Fill:      excelize.Fill{Type: "pattern", Color: []string{k.BgColor}, Pattern: 1},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		})
		subStyle, _ := f.NewStyle(&excelize.Style{
			Font:      &excelize.Font{Italic: true, Size: 8, Color: k.TxtColor, Family: "Calibri"},
			Fill:      excelize.Fill{Type: "pattern", Color: []string{k.BgColor}, Pattern: 1},
			Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
		})

		f.SetCellStyle(sheet, sCol, eCol, headerStyle)
		f.SetCellStyle(sheet, sVal, eVal, valStyle)
		f.SetCellStyle(sheet, sSub, eSub, subStyle)
	}

	f.SetRowHeight(sheet, 4, 18)
	f.SetRowHeight(sheet, 5, 26)
	f.SetRowHeight(sheet, 6, 16)

	// 3. CATEGORY WORKFORCE POOL SECTION (REDESIGNED WITH DETAILED TEAM BREAKDOWN)
	secTitleStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 12, Color: "#1A365D", Family: "Calibri"},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	f.SetCellValue(sheet, "A8", "CATEGORY WORKFORCE POOL & TEAM DEPLOYMENT STATUS")
	f.SetCellStyle(sheet, "A8", "A8", secTitleStyle)
	f.SetRowHeight(sheet, 8, 22)

	poolHeaderStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10, Color: "#FFFFFF", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#2B6CB0"}, Pattern: 1},
		Border:    []excelize.Border{{Type: "all", Color: "#CBD5E0", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})

	poolHeaders := []string{"Category", "Total Headcount (Slots)", "All Teams (Alphabetical)", "Deployed Teams & Job Cards", "In Office / Standby Teams (Next Ready)", "Available Slots"}
	for i, h := range poolHeaders {
		cell, _ := excelize.CoordinatesToCellName(i+1, 9)
		f.SetCellValue(sheet, cell, h)
		f.SetCellStyle(sheet, cell, cell, poolHeaderStyle)
	}
	f.SetRowHeight(sheet, 9, 20)

	poolRowStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 10, Family: "Calibri"},
		Border:    []excelize.Border{{Type: "all", Color: "#E2E8F0", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	poolAvailStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10, Color: "#137333", Family: "Calibri"},
		Border:    []excelize.Border{{Type: "all", Color: "#E2E8F0", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})

	for i, p := range pools {
		r := 10 + i
		var teamChips []string
		for _, tc := range p.TeamCards {
			teamChips = append(teamChips, fmt.Sprintf("Team %s (%d slots)", tc.Name, tc.TotalSlots))
		}
		totalTeamsStr := strings.Join(teamChips, ", ")

		var depList []string
		for _, tc := range p.TeamCards {
			if tc.Status == "Deployed" {
				depList = append(depList, fmt.Sprintf("Team %s [%s]", tc.Name, tc.ActiveJob))
			}
		}
		comTeamsStr := strings.Join(depList, ", ")
		if comTeamsStr == "" {
			comTeamsStr = "—"
		}

		var stList []string
		for _, tc := range p.TeamCards {
			if tc.Status != "Deployed" {
				stList = append(stList, fmt.Sprintf("Team %s", tc.Name))
			}
		}
		availTeamsStr := strings.Join(stList, ", ")
		if availTeamsStr == "" {
			availTeamsStr = "None (All Deployed)"
		}

		f.SetCellValue(sheet, fmt.Sprintf("A%d", r), p.Category)
		f.SetCellValue(sheet, fmt.Sprintf("B%d", r), p.TotalPool)
		f.SetCellValue(sheet, fmt.Sprintf("C%d", r), totalTeamsStr)
		f.SetCellValue(sheet, fmt.Sprintf("D%d", r), fmt.Sprintf("%s (%d slots)", comTeamsStr, p.Committed))
		f.SetCellValue(sheet, fmt.Sprintf("E%d", r), availTeamsStr)
		f.SetCellValue(sheet, fmt.Sprintf("F%d", r), p.Available)

		f.SetCellStyle(sheet, fmt.Sprintf("A%d", r), fmt.Sprintf("E%d", r), poolRowStyle)
		f.SetCellStyle(sheet, fmt.Sprintf("F%d", r), fmt.Sprintf("F%d", r), poolAvailStyle)
		f.SetRowHeight(sheet, r, 20)
	}

	// 4. PROJECT ASSIGNMENT BOARD
	startPrjRow := 16
	f.SetCellValue(sheet, fmt.Sprintf("A%d", startPrjRow), "PROJECT ASSIGNMENT BOARD (18 JOB CARDS)")
	f.SetCellStyle(sheet, fmt.Sprintf("A%d", startPrjRow), fmt.Sprintf("A%d", startPrjRow), secTitleStyle)
	f.SetRowHeight(sheet, startPrjRow, 22)

	boardHeaderRow := startPrjRow + 1
	boardHeaders := []string{
		"S/NO", "Job Card No", "Contract No", "Project Code", "Location", "Description", "Category",
		"Product Qty", "Mobilization Date", "Start Date", "End Date", "Status",
		"Assigned Teams", "Headcount (Slots)", "Assigned Employees Roster",
	}

	boardHeaderStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10, Color: "#FFFFFF", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#1A365D"}, Pattern: 1},
		Border:    []excelize.Border{{Type: "all", Color: "#4A5568", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
	})

	for j, h := range boardHeaders {
		cell, _ := excelize.CoordinatesToCellName(j+1, boardHeaderRow)
		f.SetCellValue(sheet, cell, h)
		f.SetCellStyle(sheet, cell, cell, boardHeaderStyle)
	}
	f.SetRowHeight(sheet, boardHeaderRow, 24)

	cellNormal, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 9, Family: "Calibri"},
		Border:    []excelize.Border{{Type: "all", Color: "#E2E8F0", Style: 1}},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	cellCenter, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Size: 9, Family: "Calibri"},
		Border:    []excelize.Border{{Type: "all", Color: "#E2E8F0", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	cellActiveStatus, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 9, Color: "#137333", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#E6F4EA"}, Pattern: 1},
		Border:    []excelize.Border{{Type: "all", Color: "#A8DAB5", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	cellPendingStatus, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 9, Color: "#B06000", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#FEF7E0"}, Pattern: 1},
		Border:    []excelize.Border{{Type: "all", Color: "#FDD663", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	cellAssignedNum, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 10, Color: "#1A6FC4", Family: "Calibri"},
		Border:    []excelize.Border{{Type: "all", Color: "#E2E8F0", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})

	for i, d := range details {
		r := boardHeaderRow + 1 + i

		rosterNames := make([]string, 0)
		for _, emp := range d.AssignedEmps {
			rosterNames = append(rosterNames, fmt.Sprintf("%s (%s)", emp.NameEn, emp.Team))
		}
		rosterStr := "—"
		if len(rosterNames) > 0 {
			rosterStr = strings.Join(rosterNames, ", ")
		}

		teamsStr := "—"
		if len(d.AssignedTeams) > 0 {
			teamsStr = strings.Join(d.AssignedTeams, ", ")
		}

		vals := []interface{}{
			d.ID, d.JobCard, d.Contract, d.Project.Project, d.Location, d.Desc, d.Category,
			d.ProductQty, d.MobDateComputed, d.StartDate, d.EndDate, d.Status,
			teamsStr, d.AssignedHeadcount, rosterStr,
		}

		for colIdx, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(colIdx+1, r)
			f.SetCellValue(sheet, cell, v)

			switch colIdx {
			case 0, 4, 7, 8, 9, 10, 12:
				f.SetCellStyle(sheet, cell, cell, cellCenter)
			case 11: // Status
				if d.Status == "Active" {
					f.SetCellStyle(sheet, cell, cell, cellActiveStatus)
				} else {
					f.SetCellStyle(sheet, cell, cell, cellPendingStatus)
				}
			case 13: // Staff count
				if d.Status == "Active" && d.AssignedHeadcount > 0 {
					f.SetCellStyle(sheet, cell, cell, cellAssignedNum)
				} else {
					f.SetCellStyle(sheet, cell, cell, cellCenter)
				}
			default:
				f.SetCellStyle(sheet, cell, cell, cellNormal)
			}
		}
		f.SetRowHeight(sheet, r, 20)
	}

	f.SetColWidth(sheet, "A", "A", 6)
	f.SetColWidth(sheet, "B", "B", 15)
	f.SetColWidth(sheet, "C", "C", 14)
	f.SetColWidth(sheet, "D", "D", 14)
	f.SetColWidth(sheet, "E", "E", 14) // Location
	f.SetColWidth(sheet, "F", "F", 38) // Description
	f.SetColWidth(sheet, "G", "G", 18) // Category
	f.SetColWidth(sheet, "H", "H", 12) // Product Qty
	f.SetColWidth(sheet, "I", "I", 16) // Mobilization Date
	f.SetColWidth(sheet, "J", "J", 13) // Start Date
	f.SetColWidth(sheet, "K", "K", 13) // End Date
	f.SetColWidth(sheet, "L", "L", 11) // Status
	f.SetColWidth(sheet, "M", "M", 16) // Assigned Teams
	f.SetColWidth(sheet, "N", "N", 14) // Headcount Slots
	f.SetColWidth(sheet, "O", "O", 50) // Roster

	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", `attachment; filename="Pioneer_Technical_Dashboard.xlsx"`)
	f.Write(c.Writer)
}

func boolPtr(b bool) *bool {
	return &b
}

// GET /api/export/projects
func ExportProjects(c *gin.Context) {
	mu.RLock()
	prjCopy := make([]*models.Project, len(projects))
	copy(prjCopy, projects)
	mu.RUnlock()

	f := excelize.NewFile()
	sheet := "Current Projects"
	f.SetSheetName("Sheet1", sheet)

	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 14, Color: "#FFFFFF", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#1A365D"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1},
	})
	f.MergeCell(sheet, "A1", "R1")
	f.SetCellValue(sheet, "A1", "PIONEER TECHNICAL — CURRENT PROJECTS DIRECTORY")
	f.SetCellStyle(sheet, "A1", "R1", titleStyle)
	f.SetRowHeight(sheet, 1, 28)

	headers := []string{"#", "Job Card", "Contract", "Service Order", "Project", "Location", "Description", "Unit", "Product Qty", "Mob Date", "Exp Start", "Exp End", "Act Start", "Act End", "Assigned To", "Assigned Teams", "Remarks", "Status"}
	styleHeader(f, sheet, headers, 3)
	f.SetRowHeight(sheet, 3, 22)

	for i, p := range prjCopy {
		r := 4 + i
		mob := p.MobDate
		if mob == "" {
			mob = p.EffectiveMobDate()
		}
		vals := []interface{}{p.ID, p.JobCard, p.Contract, p.ServiceOrder, p.Project, p.Location, p.Desc, p.Unit, p.Qty, mob, p.ExpStart, p.ExpEnd, p.ActStart, p.ActEnd, p.AssignedTo, p.Team, p.Remarks, p.Status()}
		for j, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(j+1, r)
			f.SetCellValue(sheet, cell, v)
		}
		styleRow(f, sheet, r, len(headers), i%2 == 0)
	}

	f.SetColWidth(sheet, "A", "A", 5)
	f.SetColWidth(sheet, "B", "B", 16)
	f.SetColWidth(sheet, "G", "G", 40)
	f.SetColWidth(sheet, "O", "O", 22)

	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", `attachment; filename="Pioneer_Projects.xlsx"`)
	f.Write(c.Writer)
}

// GET /api/export/employees
func ExportEmployees(c *gin.Context) {
	mu.RLock()
	empCopy := make([]*models.Employee, len(employees))
	copy(empCopy, employees)
	mu.RUnlock()

	f := excelize.NewFile()
	sheet := "Workforce"
	f.SetSheetName("Sheet1", sheet)

	titleStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 14, Color: "#FFFFFF", Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#1A365D"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "left", Vertical: "center", Indent: 1},
	})
	f.MergeCell(sheet, "A1", "N1")
	f.SetCellValue(sheet, "A1", "PIONEER TECHNICAL — WORKFORCE DIRECTORY")
	f.SetCellStyle(sheet, "A1", "N1", titleStyle)
	f.SetRowHeight(sheet, 1, 28)

	headers := []string{"#", "Emp ID", "Name (English)", "Name (Arabic)", "Project", "Team", "Job Category", "Vehicle Type", "Plate", "Brand", "Sec. Expiry", "Vehicle Status", "Gate Pass", "Tools Box"}
	styleHeader(f, sheet, headers, 3)
	f.SetRowHeight(sheet, 3, 22)

	for i, e := range empCopy {
		r := 4 + i
		vals := []interface{}{e.ID, e.EmpID, e.NameEn, e.NameAr, e.Project, e.Team, e.JobCat, e.VehicleType, e.Plate, e.Brand, e.SecExpiry, e.VehicleStatus, e.GatePass, e.ToolsBox}
		for j, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(j+1, r)
			f.SetCellValue(sheet, cell, v)
		}
		styleRow(f, sheet, r, len(headers), i%2 == 0)
	}

	f.SetColWidth(sheet, "A", "A", 5)
	f.SetColWidth(sheet, "C", "C", 32)
	f.SetColWidth(sheet, "D", "D", 28)
	f.SetColWidth(sheet, "G", "G", 18)

	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", `attachment; filename="Pioneer_Workforce.xlsx"`)
	f.Write(c.Writer)
}

func styleHeader(f *excelize.File, sheet string, cols []string, row int) {
	style, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "#FFFFFF", Size: 10, Family: "Calibri"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"#1a6fc4"}, Pattern: 1},
		Border:    []excelize.Border{{Type: "all", Color: "#b8d4f5", Style: 1}},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center", WrapText: true},
	})
	for i, col := range cols {
		cell, _ := excelize.CoordinatesToCellName(i+1, row)
		f.SetCellValue(sheet, cell, col)
		f.SetCellStyle(sheet, cell, cell, style)
	}
}

func styleRow(f *excelize.File, sheet string, rowIdx, colCount int, isOdd bool) {
	color := "#FFFFFF"
	if isOdd {
		color = "#EEF4FC"
	}
	style, _ := f.NewStyle(&excelize.Style{
		Fill:      excelize.Fill{Type: "pattern", Color: []string{color}, Pattern: 1},
		Border:    []excelize.Border{{Type: "all", Color: "#D0DCF0", Style: 1}},
		Alignment: &excelize.Alignment{Vertical: "center", WrapText: true},
		Font:      &excelize.Font{Family: "Calibri", Size: 9},
	})
	start, _ := excelize.CoordinatesToCellName(1, rowIdx)
	end, _ := excelize.CoordinatesToCellName(colCount, rowIdx)
	f.SetCellStyle(sheet, start, end, style)
}
