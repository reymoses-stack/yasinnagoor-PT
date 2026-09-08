// Pioneer Technical Resource Management System API Client
import XLSX from 'xlsx-js-style'
import { INITIAL_DATA } from './seedData.js'
import { supabase } from './supabase.js'

export const DEFAULT_CATEGORIES = [
  {
    code: 'Expansion Joint',
    name: 'Expansion Joint',
    category: 'Expansion Joint',
    aliases: ['EXJ', 'Expansion Joint'],
    color: '#6c5ce7',
    teams: ['A', 'B', 'C', 'D', 'E'],
    description: 'Expansion Joint Replacement & Maintenance',
  },
  {
    code: 'DEMI',
    name: 'DEMI',
    category: 'DEMI',
    aliases: ['Demi'],
    color: '#1a6fc4',
    teams: ['I', 'K'],
    description: 'Demineralization & Water Treatment System',
  },
  {
    code: 'EDG',
    name: 'EDG',
    category: 'EDG',
    aliases: ['EDG'],
    color: '#28a745',
    teams: ['F', 'G', 'M'],
    description: 'Emergency Diesel Generator Servicing',
  },
  {
    code: 'COA',
    name: 'COA',
    category: 'COA',
    aliases: ['COA'],
    color: '#e08c00',
    teams: ['H'],
    description: 'Coal & Ash Handling Operations',
  },
  {
    code: 'Oil Spill',
    name: 'Oil Spill',
    category: 'Oil Spill',
    aliases: ['Oil Spill', 'Oil spill', 'OIL SPILL'],
    color: '#00b894',
    teams: [],
    description: 'Emergency Oil Spill & Environmental Cleanup',
  },
]

const STORAGE_KEY_CATEGORIES = 'pt_local_categories_v2'

export function getCategories() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CATEGORIES)
      if (stored) {
        let parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          let modified = false
          parsed = parsed.map(c => {
            if (
              c.code === 'Oil Spill' ||
              c.name === 'Oil Spill' ||
              c.category === 'Oil Spill' ||
              (c.aliases || []).some(a => String(a).toLowerCase() === 'oil spill')
            ) {
              if (c.category !== 'Oil Spill' || c.name !== 'Oil Spill' || c.code !== 'Oil Spill') {
                modified = true
                return {
                  ...c,
                  code: 'Oil Spill',
                  name: 'Oil Spill',
                  category: 'Oil Spill',
                  aliases: ['Oil Spill', 'Oil spill', 'OIL SPILL'],
                  teams: Array.isArray(c.teams) ? c.teams : [],
                }
              }
            }
            return c
          })
          if (modified) {
            localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(parsed))
          }
          return parsed
        }
      }
    } catch (e) {
      console.warn('Could not read categories from localStorage', e)
    }
  }
  const initial = DEFAULT_CATEGORIES.map(c => ({ ...c, teams: [...c.teams] }))
  saveCategories(initial)
  return initial
}

export function saveCategories(cats) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(cats))
      window.dispatchEvent(new CustomEvent('pt_categories_updated', { detail: cats }))
      window.dispatchEvent(new CustomEvent('pt_data_updated'))
    } catch (e) {
      console.warn('Could not write categories to localStorage', e)
    }
  }
}

export function getAllSystemTeams() {
  const teamSet = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'M'])
  try {
    const cats = getCategories()
    cats.forEach(c => {
      (c.teams || []).forEach(t => {
        if (t && t !== '-') teamSet.add(String(t).replace(/team/i, '').trim().toUpperCase())
      })
    })
    const emps = getStoredEmployees()
    emps.forEach(e => {
      const t = (e.team || '').replace(/team/i, '').trim().toUpperCase()
      if (t && t !== '-') teamSet.add(t)
    })
  } catch {}
  return Array.from(teamSet).sort()
}

export function addCategory({ code, name, category, color, teams, description }) {
  const cats = getCategories()
  const cleanCode = (code || name || '').trim()
  const cleanName = (name || code || '').trim()
  const cleanCat = (category || cleanName || cleanCode).trim()
  const cleanColor = color || '#1a6fc4'
  const cleanTeams = Array.isArray(teams)
    ? Array.from(new Set(teams.map(t => String(t).replace(/team/i, '').trim().toUpperCase()).filter(Boolean))).sort()
    : []

  const existingIdx = cats.findIndex(
    c => c.code.toLowerCase() === cleanCode.toLowerCase() ||
         c.name.toLowerCase() === cleanName.toLowerCase() ||
         c.category.toLowerCase() === cleanCat.toLowerCase()
  )

  const newCat = {
    code: cleanCode,
    name: cleanName,
    category: cleanCat,
    aliases: Array.from(new Set([cleanCode, cleanName, cleanCat])),
    color: cleanColor,
    teams: cleanTeams,
    description: description || '',
  }

  if (existingIdx >= 0) {
    cats[existingIdx] = { ...cats[existingIdx], ...newCat }
  } else {
    cats.push(newCat)
  }

  saveCategories(cats)
  return newCat
}

export function addTeamToCategory(catIdentifier, teamName) {
  const cats = getCategories()
  const t = String(teamName).replace(/team/i, '').trim().toUpperCase()
  if (!t) return false

  const cat = cats.find(
    c => c.code.toLowerCase() === String(catIdentifier).toLowerCase() ||
         c.name.toLowerCase() === String(catIdentifier).toLowerCase() ||
         c.category.toLowerCase() === String(catIdentifier).toLowerCase() ||
         (c.aliases || []).some(a => a.toLowerCase() === String(catIdentifier).toLowerCase())
  )

  if (cat) {
    if (!cat.teams.includes(t)) {
      cat.teams.push(t)
      cat.teams.sort()
      saveCategories(cats)
      return true
    }
  }
  return false
}

export function updateCategoryTeams(catIdentifier, teamsArray) {
  const cats = getCategories()
  const cleanTeams = Array.isArray(teamsArray)
    ? Array.from(new Set(teamsArray.map(t => String(t).replace(/team/i, '').trim().toUpperCase()).filter(Boolean))).sort()
    : []

  const cat = cats.find(
    c => c.code.toLowerCase() === String(catIdentifier).toLowerCase() ||
         c.name.toLowerCase() === String(catIdentifier).toLowerCase() ||
         c.category.toLowerCase() === String(catIdentifier).toLowerCase() ||
         (c.aliases || []).some(a => a.toLowerCase() === String(catIdentifier).toLowerCase())
  )

  if (cat) {
    cat.teams = cleanTeams
    saveCategories(cats)
    return true
  }
  return false
}

export function getCategory(code) {
  if (!code) return 'All'
  const raw = String(code).trim()
  const cats = getCategories()
  const found = cats.find(
    c => c.code.toLowerCase() === raw.toLowerCase() ||
         c.name.toLowerCase() === raw.toLowerCase() ||
         c.category.toLowerCase() === raw.toLowerCase() ||
         (c.aliases || []).some(a => a.toLowerCase() === raw.toLowerCase())
  )
  if (found) return found.category || found.name || found.code
  return raw
}

export function getAllTeamsForCategory(category) {
  const normCat = getCategory(category)
  const cats = getCategories()
  const found = cats.find(
    c => c.category.toLowerCase() === normCat.toLowerCase() ||
         c.name.toLowerCase() === normCat.toLowerCase() ||
         c.code.toLowerCase() === normCat.toLowerCase()
  )
  if (found && Array.isArray(found.teams)) {
    return [...found.teams].sort()
  }
  return []
}

export function calc5DaysPrior(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() - 5)
  return d.toISOString().split('T')[0]
}

export function checkDateOverlap(s1, e1, s2, e2) {
  if (!s1 || !s2) return false
  const end1 = (e1 || '').trim() || '9999-12-31'
  const end2 = (e2 || '').trim() || '9999-12-31'
  const start1 = (s1 || '').trim()
  const start2 = (s2 || '').trim()
  return start1 <= end2 && start2 <= end1
}

export function getBusyTeamsForCategoryAndDates(category, excludeId, startDate, endDate, projectList = []) {
  const busyMap = {}
  const overlappingProjects = []
  const allCat = getAllTeamsForCategory(category)
  if (!allCat || allCat.length === 0) {
    return { busyMap, overlappingProjects, available: [], isOverlapped: false }
  }

  const s = (startDate || '').trim()
  const e = (endDate || '').trim()

  // If no start date is provided (pending project or clearing dates), no overlap exists and all category teams are available
  if (!s) {
    return { busyMap, overlappingProjects, available: allCat, isOverlapped: false }
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const otherProjects = (projectList || []).filter(other => {
    if (other.id === excludeId) return false
    const otherCat = other.category || getCategory(other.project)
    if (otherCat !== category) return false
    const otherEnd = (other.actEnd || '').trim()
    const isCompleted = other.status === 'Completed' || (otherEnd && otherEnd < todayStr)
    if (isCompleted) return false
    const otherStart = (other.actStart || other.expStart || '').trim()
    return Boolean(otherStart || other.status === 'Active' || other.team)
  })

  // Sort other active projects chronologically by start date
  const sortedOthers = [...otherProjects].sort((a, b) => {
    const sa = (a.actStart || a.expStart || '9999-12-31').trim()
    const sb = (b.actStart || b.expStart || '9999-12-31').trim()
    if (sa !== sb) return sa.localeCompare(sb)
    return (a.id || 0) - (b.id || 0)
  })

  const claimedTeams = new Set()

  sortedOthers.forEach(other => {
    const oStart = (other.actStart || other.expStart || '').trim()
    const oEnd = (other.actEnd || other.expEnd || '').trim()

    if (oStart && checkDateOverlap(s, e, oStart, oEnd)) {
      const explicit = (other.team || '')
        .split(',')
        .map(t => t.replace(/team/i, '').trim().toUpperCase())
        .filter(Boolean)
        .filter(t => allCat.includes(t))

      let assigned = []
      if (explicit.length === 1 && !claimedTeams.has(explicit[0])) {
        // If other project had 1 specific explicit team assigned that is still available
        assigned = explicit
      } else if (explicit.length > 1) {
        // If other project had multiple teams (e.g. holding whole category pool because it was alone),
        // it claims 1 base team in concurrent overlap, releasing the rest for other projects!
        const freeFromExplicit = explicit.filter(t => !claimedTeams.has(t))
        assigned = freeFromExplicit.length > 0 ? [freeFromExplicit[0]] : []
      } else {
        // In a shared concurrent window, each active project claims 1 team in alphabetical order
        const freeForOther = allCat.filter(t => !claimedTeams.has(t))
        assigned = freeForOther.length > 0 ? [freeForOther[0]] : []
      }

      if (assigned.length > 0) {
        overlappingProjects.push({
          id: other.id,
          jobCard: other.jobCard || `Project #${other.id}`,
          startDate: oStart,
          endDate: oEnd,
          teams: assigned,
        })
        assigned.forEach(t => {
          claimedTeams.add(t)
          busyMap[t] = {
            jobCard: other.jobCard || `Project #${other.id}`,
            startDate: oStart,
            endDate: oEnd,
            id: other.id,
          }
        })
      }
    }
  })

  const available = allCat.filter(t => !busyMap[t]).sort()
  const isOverlapped = Boolean(s && overlappingProjects.length > 0 && available.length === 0)

  return { busyMap, overlappingProjects, available, isOverlapped, allTeams: allCat }
}

// Client-side LocalStorage Persistence Keys
const STORAGE_KEY_PROJECTS = 'pt_local_projects'
const STORAGE_KEY_EMPLOYEES = 'pt_local_employees'

function getStoredProjects() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PROJECTS)
      if (stored) return JSON.parse(stored)
    } catch (e) {
      console.warn('Could not read projects from localStorage', e)
    }
  }
  const initial = (INITIAL_DATA.projects || []).map(p => ({ ...p }))
  saveStoredProjects(initial)
  return initial
}

function saveStoredProjects(data) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(data))
    } catch (e) {
      console.warn('Could not write projects to localStorage', e)
    }
  }
}

function getStoredEmployees() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_EMPLOYEES)
      if (stored) return JSON.parse(stored)
    } catch (e) {
      console.warn('Could not read employees from localStorage', e)
    }
  }
  const initial = (INITIAL_DATA.employees || [])
    .filter(e => e.empId !== 'Need' && !(e.nameEn || '').toLowerCase().startsWith('need'))
    .map(e => ({ ...e }))
  saveStoredEmployees(initial)
  return initial
}

function saveStoredEmployees(data) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_EMPLOYEES, JSON.stringify(data))
    } catch (e) {
      console.warn('Could not write employees to localStorage', e)
    }
  }
}

// Client-side in-memory active state backed by localStorage
let fallbackProjects = getStoredProjects()
let fallbackEmployees = getStoredEmployees()

// Helper: Normalize DB Project row to UI Model
function mapProjectRow(p) {
  if (!p) return null
  const jc = p.job_card || p.jobCard || ''
  const prj = jc === 'JC-2026-008' ? 'Oil Spill' : (p.project || '')
  return {
    id: p.id,
    jobCard: jc,
    contract: p.contract || '',
    serviceOrder: p.service_order || p.serviceOrder || '',
    project: prj,
    desc: p.desc || '',
    unit: p.unit ?? '',
    qty: p.qty ?? p.productQty ?? 0,
    location: p.location || '',
    mobDate: p.mob_date || p.mobDate || '',
    expStart: p.exp_start || p.expStart || '',
    expEnd: p.exp_end || p.expEnd || '',
    actStart: p.act_start || p.actStart || '',
    actEnd: p.act_end || p.actEnd || '',
    assignedTo: p.assigned_to || p.assignedTo || '',
    team: p.team || '',
    remarks: p.remarks || '',
  }
}

// Helper: Normalize UI Model to DB Project row
function mapProjectToDb(p) {
  const s = p.actStart || p.expStart || ''
  const jc = p.jobCard || p.job_card || ''
  const prj = jc === 'JC-2026-008' ? 'Oil Spill' : (p.project || '')
  return {
    id: String(p.id),
    job_card: jc,
    contract: p.contract || '',
    service_order: p.serviceOrder || p.service_order || '',
    project: prj,
    desc: p.desc || '',
    unit: p.unit ?? '',
    qty: Number(p.qty ?? p.productQty ?? 0),
    location: p.location || '',
    mob_date: p.mobDate || p.mob_date || (s ? calc5DaysPrior(s) : ''),
    exp_start: p.expStart || p.exp_start || '',
    exp_end: p.expEnd || p.exp_end || '',
    act_start: p.actStart || p.act_start || '',
    act_end: p.actEnd || p.act_end || '',
    assigned_to: p.assignedTo || p.assigned_to || '',
    team: p.team || '',
    remarks: p.remarks || '',
  }
}

// Helper: Normalize DB Employee row to UI Model
function mapEmployeeRow(e) {
  if (!e) return null
  return {
    id: e.id,
    empId: e.emp_id || e.empId || '',
    nameEn: e.name_en || e.nameEn || '',
    nameAr: e.name_ar || e.nameAr || '',
    project: e.project || '',
    team: e.team || '',
    jobCat: e.job_cat || e.jobCat || '',
    vehicleType: e.vehicle_type || e.vehicleType || '-',
    plate: e.plate || '-',
    brand: e.brand || '-',
    secExpiry: e.sec_expiry || e.secExpiry || '-',
    vehicleStatus: e.vehicle_status || e.vehicleStatus || 'N/A',
    gatePass: e.gate_pass || e.gatePass || 'N/A',
    toolsBox: e.tools_box || e.toolsBox || '-',
  }
}

// Helper: Normalize UI Model to DB Employee row
function mapEmployeeToDb(e) {
  return {
    id: String(e.id),
    name: e.nameEn || e.name || '',
    emp_id: e.empId || e.emp_id || '',
    name_en: e.nameEn || e.name_en || '',
    name_ar: e.nameAr || e.name_ar || '',
    project: e.project || '',
    team: e.team || '',
    job_cat: e.jobCat || e.job_cat || '',
    vehicle_type: e.vehicleType || e.vehicle_type || '-',
    plate: e.plate || '-',
    brand: e.brand || '-',
    sec_expiry: e.secExpiry || e.sec_expiry || '-',
    vehicle_status: e.vehicleStatus || e.vehicle_status || 'N/A',
    gate_pass: e.gatePass || e.gate_pass || 'N/A',
    tools_box: e.toolsBox || e.tools_box || '-',
  }
}

// // Compute dynamic board assignments and pool stats from raw lists
export function computeDashboardFromData(prjs = [], emps = []) {
  const configuredCats = getCategories()
  const catTeams = {}

  // Initialize all configured categories and their defined teams
  configuredCats.forEach(c => {
    const catName = c.category || c.name || c.code
    const validTeams = getAllTeamsForCategory(catName).filter(t => t && t !== '-')
    catTeams[catName] = new Set(validTeams)
  })

  // Add any employee teams ONLY for categories that have teams configured
  emps.forEach(e => {
    const c = getCategory(e.project)
    const t = (e.team || '').replace(/team/i, '').trim().toUpperCase()
    if (c && c !== 'All' && t && t !== '-') {
      const definedTeams = getAllTeamsForCategory(c)
      if (definedTeams.length > 0) {
        if (!catTeams[c]) catTeams[c] = new Set()
        catTeams[c].add(t)
      }
    }
  })

  const todayStr = new Date().toISOString().split('T')[0]

  // 1. Group active and planned projects by category
  const catRelevantProjects = {}
  const explicitReservationsByCat = {}

  Object.keys(catTeams).forEach(cat => {
    explicitReservationsByCat[cat] = new Map()
    catRelevantProjects[cat] = []
  })

  prjs.forEach(p => {
    const cat = getCategory(p.project)
    const s = (p.actStart || p.expStart || '').trim()
    const actEnd = (p.actEnd || '').trim()
    const isCompleted = p.status === 'Completed' || (actEnd && actEnd < todayStr)
    const explicit = (p.team || '')
      .split(',')
      .map(t => t.replace(/team/i, '').trim().toUpperCase())
      .filter(Boolean)

    // Only active (non-completed) projects claim live fleet resources
    if (!isCompleted && (s || explicit.length > 0)) {
      if (!catRelevantProjects[cat]) catRelevantProjects[cat] = []
      catRelevantProjects[cat].push(p)

      if (explicit.length > 0 && explicitReservationsByCat[cat]) {
        explicit.forEach(t => {
          explicitReservationsByCat[cat].set(t, p.id)
        })
      }
    }
  })

  // 2. Pre-calculate assigned teams for active jobs with date overlap checking
  const projectAssignedTeams = {}
  const projectOverlapInfo = {}
  const usedTeams = {}
  Object.keys(catTeams).forEach(cat => {
    usedTeams[cat] = new Map()
  })

  Object.entries(catRelevantProjects).forEach(([cat, activeList]) => {
    const allCatTeams = Array.from(catTeams[cat] || []).sort()
    if (!allCatTeams.length || !activeList.length) {
      activeList.forEach(p => {
        const explicit = (p.team || '')
          .split(',')
          .map(t => t.replace(/team/i, '').trim().toUpperCase())
          .filter(Boolean)
        projectAssignedTeams[p.id] = explicit
        projectOverlapInfo[p.id] = { isOverlapped: false, conflictingProjects: [] }
      })
      return
    }

    // Sort chronologically by start date, keeping earlier projects priority
    const sortedList = [...activeList].sort((a, b) => {
      const sa = (a.actStart || a.expStart || '9999-12-31').trim()
      const sb = (b.actStart || b.expStart || '9999-12-31').trim()
      if (sa !== sb) return sa.localeCompare(sb)
      return (a.id || 0) - (b.id || 0)
    })

    const allocatedTimeline = []

    sortedList.forEach(p => {
      const s = (p.actStart || p.expStart || '').trim()
      const e = (p.actEnd || p.expEnd || '').trim()
      const explicit = (p.team || '')
        .split(',')
        .map(t => t.replace(/team/i, '').trim().toUpperCase())
        .filter(Boolean)

      // Find all overlapping already-allocated projects in this category
      const busyTeamsDuringWindow = new Set()
      const conflictingProjects = []

      allocatedTimeline.forEach(prev => {
        if (checkDateOverlap(s, e, prev.startDate, prev.endDate)) {
          conflictingProjects.push(prev)
          // Each prior overlapping project locks its claimed essential base team(s)
          ;(prev.claimedTeams || []).forEach(t => busyTeamsDuringWindow.add(t))
        }
      })

      const availableTeams = allCatTeams.filter(t => !busyTeamsDuringWindow.has(t))

      if (explicit.length > 0) {
        // User explicitly chose team(s) for this project (manual assignment/override)
        const validExplicit = explicit.filter(t => allCatTeams.includes(t))
        const hasDirectConflict = validExplicit.some(t => busyTeamsDuringWindow.has(t))
        projectAssignedTeams[p.id] = validExplicit
        projectOverlapInfo[p.id] = {
          isOverlapped: false,
          hasConflict: hasDirectConflict,
          conflictingProjects,
        }
        validExplicit.forEach(t => usedTeams[cat]?.set(t, p.jobCard))

        // If it was given all category teams because it was created alone, lock 1 base team so other projects can take remaining teams
        const claimed = (validExplicit.length >= allCatTeams.length) ? [validExplicit[0]] : validExplicit

        // Release these explicit teams from any prior project that was holding multiple teams
        conflictingProjects.forEach(prev => {
          if (projectAssignedTeams[prev.id] && projectAssignedTeams[prev.id].length > 1) {
            projectAssignedTeams[prev.id] = projectAssignedTeams[prev.id].filter(
              t => !validExplicit.includes(t)
            )
          }
        })

        allocatedTimeline.push({
          id: p.id,
          jobCard: p.jobCard || `Project #${p.id}`,
          startDate: s,
          endDate: e,
          claimedTeams: claimed,
          teams: validExplicit,
        })
      } else if (availableTeams.length > 0) {
        if (conflictingProjects.length === 0) {
          // Sole active project running in its window:
          // displays all available teams in category, locks 1 base team
          const chosen = availableTeams
          projectAssignedTeams[p.id] = chosen
          projectOverlapInfo[p.id] = { isOverlapped: false, conflictingProjects: [] }
          chosen.forEach(t => usedTeams[cat]?.set(t, p.jobCard))
          allocatedTimeline.push({
            id: p.id,
            jobCard: p.jobCard || `Project #${p.id}`,
            startDate: s,
            endDate: e,
            claimedTeams: [availableTeams[0]],
            teams: chosen,
          })
        } else {
          // Concurrent project: takes 1 dedicated team in alphabetical order from available pool
          const chosen = [availableTeams[0]]
          projectAssignedTeams[p.id] = chosen
          projectOverlapInfo[p.id] = { isOverlapped: false, conflictingProjects: [] }
          chosen.forEach(t => usedTeams[cat]?.set(t, p.jobCard))

          // Update prior overlapping projects that were alone and holding multiple teams to release this team
          conflictingProjects.forEach(prev => {
            if (projectAssignedTeams[prev.id] && projectAssignedTeams[prev.id].length > 1) {
              projectAssignedTeams[prev.id] = projectAssignedTeams[prev.id].filter(
                t => t !== chosen[0]
              )
            }
          })

          allocatedTimeline.push({
            id: p.id,
            jobCard: p.jobCard || `Project #${p.id}`,
            startDate: s,
            endDate: e,
            claimedTeams: chosen,
            teams: chosen,
          })
        }
      } else {
        // No teams available and no manual team assigned: marked as overlapped
        projectAssignedTeams[p.id] = []
        projectOverlapInfo[p.id] = {
          isOverlapped: true,
          conflictingProjects,
        }
      }
    })
  })

  // 3. Build detailed project rows preserving team assignments for Completed, Active, and Scheduled projects
  const details = prjs.map(p => {
    const cat = getCategory(p.project)
    const s = (p.actStart || p.expStart || '').trim()
    const e = (p.actEnd || p.expEnd || '').trim()
    const actEnd = (p.actEnd || '').trim()

    // Determine Status: Completed vs Active vs Pending
    let status = 'Pending'
    if (p.status === 'Completed' || (actEnd && actEnd < todayStr)) {
      status = 'Completed'
    } else if (s) {
      status = 'Active'
    } else {
      status = 'Pending'
    }

    const computedMob = p.mobDate || calc5DaysPrior(s)
    const allTeams = Array.from(catTeams[cat] || getAllTeamsForCategory(cat)).sort()
    const explicit = (p.team || '')
      .split(',')
      .map(t => t.replace(/team/i, '').trim().toUpperCase())
      .filter(Boolean)

    const isOverlapped = Boolean(projectOverlapInfo[p.id]?.isOverlapped)
    const overlapConflicts = projectOverlapInfo[p.id]?.conflictingProjects || []

    // Preserve assigned teams for Completed and Active projects only if teams exist for category and not overlapped
    let assignedTeams = []
    if (projectAssignedTeams[p.id] !== undefined) {
      assignedTeams = projectAssignedTeams[p.id]
    } else if (!isOverlapped && explicit.length > 0) {
      assignedTeams = explicit
    } else if (!isOverlapped && (status === 'Completed' || status === 'Active') && allTeams.length > 0) {
      // Historical/default assigned team for completed/active projects
      assignedTeams = [allTeams[0]]
    }

    let assignedEmps = []
    if (assignedTeams.length > 0) {
      assignedEmps = emps
        .filter(
          emp =>
            (cat === 'All' || getCategory(emp.project) === cat) &&
            assignedTeams.includes((emp.team || '').replace(/team/i, '').trim().toUpperCase())
        )
        .sort((a, b) => {
          const ta = (a.team || '').replace(/team/i, '').trim().toUpperCase()
          const tb = (b.team || '').replace(/team/i, '').trim().toUpperCase()
          if (ta !== tb) return ta.localeCompare(tb, undefined, { numeric: true })

          const isNeedA = a.empId === 'Need' || (a.nameEn || '').toLowerCase().startsWith('need')
          const isNeedB = b.empId === 'Need' || (b.nameEn || '').toLowerCase().startsWith('need')
          if (isNeedA !== isNeedB) return isNeedA ? 1 : -1

          const na = (a.nameEn || '').trim().toLowerCase()
          const nb = (b.nameEn || '').trim().toLowerCase()
          return na.localeCompare(nb)
        })
    }

    const availAfter = allTeams.filter(t => !usedTeams[cat]?.has(t))

    return {
      ...p,
      category: cat,
      status,
      startDate: s,
      endDate: e,
      mobDateComputed: computedMob,
      assignedTeams,
      availableTeams: availAfter,
      allCategoryTeams: allTeams,
      isOverlapped,
      overlapConflicts,
      assignedHeadcount: assignedEmps.length || (assignedTeams.length > 0 && status !== 'Pending' ? 11 * assignedTeams.length : 0),
      assignedEmps,
      productQty: p.qty ?? 0,
    }
  })

  const activeCount = details.filter(p => p.status === 'Active').length
  const pendingCount = details.filter(p => p.status === 'Pending').length
  const completedCount = details.filter(p => p.status === 'Completed').length
  const deployedCount = details
    .filter(p => p.status === 'Active')
    .reduce((sum, p) => sum + p.assignedHeadcount, 0)
  const totalWorkforce = emps.filter(
    e => (e.project || '').trim().toLowerCase() !== 'all'
  ).length
  const idleCount = Math.max(0, totalWorkforce - deployedCount)
  const shortfallCount = details.filter(
    p => p.status === 'Active' && p.assignedHeadcount === 0
  ).length

  // Build dynamic pool statistics across all categories
  const categoryOrder = configuredCats.map(c => c.category || c.name || c.code)

  const poolStats = categoryOrder.map(cat => {
    const allTeams = Array.from(catTeams[cat] || getAllTeamsForCategory(cat))
      .filter(t => t && t !== '-')
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const catEmps = emps.filter(
      emp => getCategory(emp.project) === cat
    )
    const totalStaff = catEmps.length
    const catConfig = configuredCats.find(
      c => (c.category || c.name || c.code).toLowerCase() === cat.toLowerCase()
    )

    const teamCards = allTeams.map(t => {
      const tEmps = catEmps.filter(
        emp => (emp.team || '').replace(/team/i, '').trim().toUpperCase() === t
      )
      const tot = tEmps.length
      let actual = 0,
        needs = 0
      tEmps.forEach(e => {
        if (
          e.empId === 'Need' ||
          (e.nameEn || '').toLowerCase().startsWith('need')
        ) {
          needs++
        } else {
          actual++
        }
      })

      const activeJob = usedTeams[cat]?.get(t) || ''
      return {
        name: t,
        totalSlots: tot,
        actualStaff: actual,
        needSlots: needs,
        status: activeJob ? 'Deployed' : 'Office / Standby',
        activeJob,
        employees: tEmps,
      }
    })

    const comTeams = teamCards
      .filter(tc => tc.status === 'Deployed')
      .map(tc => tc.name)
    const comStaff = teamCards
      .filter(tc => tc.status === 'Deployed')
      .reduce((sum, tc) => sum + tc.totalSlots, 0)
    const availTeams = teamCards
      .filter(tc => tc.status !== 'Deployed')
      .map(tc => tc.name)

    return {
      category: cat,
      color: catConfig?.color || '#1a6fc4',
      totalPool: totalStaff,
      totalTeams: allTeams,
      committedTeams: comTeams,
      availableTeams: availTeams,
      committed: comStaff,
      available: Math.max(0, totalStaff - comStaff),
      teamCards,
      employees: catEmps,
    }
  })

  return {
    kpis: {
      active: activeCount,
      pending: pendingCount,
      completed: completedCount,
      deployed: deployedCount,
      total: totalWorkforce,
      idle: idleCount,
      shortfalls: shortfallCount,
    },
    pools: poolStats,
    projects: details,
  }
}

// ----------------------------------------------------
// PROJECTS API (Supabase Cloud + Local Cache)
// ----------------------------------------------------
let isProjectsSeeded = false
export const getProjectsRaw = async (params = {}) => {
  const localList = getStoredProjects()
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('id', { ascending: true })

    if (!error && data) {
      if (data.length === 0 && localList.length > 0) {
        // First load on empty database: push all local projects to Supabase
        const toInsert = localList.map(mapProjectToDb)
        await supabase.from('projects').upsert(toInsert)
        fallbackProjects = localList
      } else {
        const dbIdSet = new Set(data.map(p => String(p.id)))
        const missingFromDb = localList.filter(p => !dbIdSet.has(String(p.id)))

        if (missingFromDb.length > 0) {
          // If browser has extra projects that were entered before Supabase was added, upload them!
          const toUpload = missingFromDb.map(mapProjectToDb)
          supabase.from('projects').upsert(toUpload).then(({ error: upErr }) => {
            if (upErr) console.warn('Supabase local sync notice:', upErr.message)
          })
          const mappedDb = data.map(mapProjectRow).filter(Boolean)
          fallbackProjects = [...mappedDb, ...missingFromDb]
          saveStoredProjects(fallbackProjects)
        } else {
          const mapped = data.map(mapProjectRow).filter(Boolean)
          fallbackProjects = mapped
          saveStoredProjects(fallbackProjects)
        }
      }
    }
  } catch (err) {
    console.warn('Supabase projects fetch notice (using cache):', err)
  }

  let list = fallbackProjects
  if (params.project) {
    list = list.filter(p => p.project === params.project)
  }
  return { data: list }
}

// Explicit 1-Click Sync Local Data to Cloud
export async function syncLocalToCloud() {
  const localPrjs = getStoredProjects()
  const localEmps = getStoredEmployees()

  let pCount = 0
  let eCount = 0

  if (localPrjs.length > 0) {
    const toInsert = localPrjs.map(mapProjectToDb)
    const { error: pErr } = await supabase.from('projects').upsert(toInsert)
    if (!pErr) pCount = localPrjs.length
  }

  if (localEmps.length > 0) {
    const toInsert = localEmps.map(mapEmployeeToDb)
    const { error: eErr } = await supabase.from('employees').upsert(toInsert)
    if (!eErr) eCount = localEmps.length
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'cloud_synced' } }))
  }

  return { projectCount: pCount, employeeCount: eCount }
}

export const getProjects = async (params = {}) => {
  const [prjsRes, empsRes] = await Promise.all([getProjectsRaw(params), getEmployees()])
  const prjs = prjsRes?.data || []
  const emps = empsRes?.data || []
  const computed = computeDashboardFromData(prjs, emps)
  let projectsList = computed.projects || []
  if (params.project) {
    projectsList = projectsList.filter(p => p.project === params.project)
  }
  return { data: projectsList }
}

export const createProject = async body => {
  const newId = fallbackProjects.length > 0 ? Math.max(...fallbackProjects.map(p => Number(p.id) || 0)) + 1 : 1
  const newPrj = { ...body, id: newId }
  fallbackProjects.push(newPrj)
  saveStoredProjects(fallbackProjects)

  try {
    await supabase.from('projects').insert(mapProjectToDb(newPrj))
  } catch (err) {
    console.warn('Supabase create project notice:', err)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'project_created' } }))
  }
  return newPrj
}

export const updateProject = async (id, body) => {
  const numId = Number(id)
  const idx = fallbackProjects.findIndex(p => Number(p.id) === numId || String(p.id) === String(id))
  let updated = { ...body, id: isNaN(numId) ? id : numId }
  if (idx !== -1) {
    fallbackProjects[idx] = { ...fallbackProjects[idx], ...body, id: fallbackProjects[idx].id }
    updated = fallbackProjects[idx]
  } else {
    fallbackProjects.push(updated)
  }
  saveStoredProjects(fallbackProjects)

  try {
    await supabase
      .from('projects')
      .upsert(mapProjectToDb(updated), { onConflict: 'id' })
  } catch (err) {
    console.warn('Supabase update project notice:', err)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'project_updated' } }))
  }
  return updated
}

export const deleteProject = async id => {
  const strId = String(id)
  const numId = Number(id)
  fallbackProjects = fallbackProjects.filter(p => String(p.id) !== strId && Number(p.id) !== numId)
  saveStoredProjects(fallbackProjects)

  try {
    await supabase.from('projects').delete().eq('id', strId)
  } catch (err) {
    console.warn('Supabase delete project notice:', err)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'project_deleted' } }))
  }
  return { success: true }
}

export const getAssigned = async id => {
  const dash = await getDashboard()
  const prj = dash.projects.find(p => p.id === Number(id) || String(p.id) === String(id))
  return {
    data: {
      project: prj,
      status: prj?.status || 'Pending',
      category: prj?.category || '',
      assignedTeams: prj?.assignedTeams || [],
      total: prj?.assignedHeadcount || 0,
      assigned: prj?.assignedEmps || [],
    },
  }
}

// ----------------------------------------------------
// EMPLOYEES API (Supabase Cloud + Local Cache)
// ----------------------------------------------------
let isEmployeesSeeded = false
export const getEmployees = async (params = {}) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('id', { ascending: true })

    if (!error && data && data.length > 0) {
      const mapped = data.map(mapEmployeeRow).filter(Boolean)
      fallbackEmployees = mapped
      saveStoredEmployees(fallbackEmployees)
    } else if (!error && data && data.length === 0 && fallbackEmployees.length > 0 && !isEmployeesSeeded) {
      isEmployeesSeeded = true
      const toInsert = fallbackEmployees.map(mapEmployeeToDb)
      supabase.from('employees').insert(toInsert).then(({ error: seedErr }) => {
        if (seedErr) console.warn('Supabase employees initial seed notice:', seedErr.message)
      })
    }
  } catch (err) {
    console.warn('Supabase employees fetch notice (using cache):', err)
  }

  let list = fallbackEmployees
  if (params.search) {
    const q = params.search.toLowerCase()
    list = list.filter(
      e =>
        (e.nameEn || '').toLowerCase().includes(q) ||
        (e.empId || '').toLowerCase().includes(q) ||
        (e.project || '').toLowerCase().includes(q)
    )
  }
  if (params.project) {
    list = list.filter(e => e.project === params.project)
  }
  return { data: list }
}

export const createEmployee = async body => {
  const newId = fallbackEmployees.length > 0 ? Math.max(...fallbackEmployees.map(e => Number(e.id) || 0)) + 1 : 1
  const newEmp = { ...body, id: newId }
  fallbackEmployees.push(newEmp)
  saveStoredEmployees(fallbackEmployees)

  try {
    await supabase.from('employees').insert(mapEmployeeToDb(newEmp))
  } catch (err) {
    console.warn('Supabase create employee notice:', err)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'employee_created' } }))
  }
  return newEmp
}

export const updateEmployee = async (id, body) => {
  const numId = Number(id)
  const idx = fallbackEmployees.findIndex(e => Number(e.id) === numId || String(e.id) === String(id))
  let updated = { ...body, id: isNaN(numId) ? id : numId }
  if (idx !== -1) {
    fallbackEmployees[idx] = { ...fallbackEmployees[idx], ...body, id: fallbackEmployees[idx].id }
    updated = fallbackEmployees[idx]
  } else {
    fallbackEmployees.push(updated)
  }
  saveStoredEmployees(fallbackEmployees)

  try {
    await supabase
      .from('employees')
      .upsert(mapEmployeeToDb(updated), { onConflict: 'id' })
  } catch (err) {
    console.warn('Supabase update employee notice:', err)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'employee_updated' } }))
  }
  return updated
}

export const deleteEmployee = async id => {
  const strId = String(id)
  const numId = Number(id)
  fallbackEmployees = fallbackEmployees.filter(e => String(e.id) !== strId && Number(e.id) !== numId)
  saveStoredEmployees(fallbackEmployees)

  try {
    await supabase.from('employees').delete().eq('id', strId)
  } catch (err) {
    console.warn('Supabase delete employee notice:', err)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'employee_deleted' } }))
  }
  return { success: true }
}

// ----------------------------------------------------
// DASHBOARD API (Realtime Computation)
// ----------------------------------------------------
export const getDashboard = async () => {
  const [prjsRes, empsRes] = await Promise.all([getProjectsRaw(), getEmployees()])
  const prjs = prjsRes?.data || []
  const emps = empsRes?.data || []
  return computeDashboardFromData(prjs, emps)
}

// Realtime Subscriber with Supabase PostgreSQL Channel
export function subscribeToSupabase(callback) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => {
    callback && callback()
  }
  window.addEventListener('pt_data_updated', handler)

  let channel = null
  try {
    channel = supabase
      .channel('pt_cloud_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        () => {
          getProjectsRaw().then(() => {
            callback && callback()
          })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'employees' },
        () => {
          getEmployees().then(() => {
            callback && callback()
          })
        }
      )
      .subscribe()
  } catch (e) {
    console.warn('Supabase realtime listener notice:', e)
  }

  return () => {
    window.removeEventListener('pt_data_updated', handler)
    if (channel) {
      supabase.removeChannel(channel)
    }
  }
}

// ----------------------------------------------------
// EXCEL EXPORTS (Client SheetJS)
// ----------------------------------------------------
export async function exportDashboardData(projects = [], kpis = {}, pools = []) {
  let prjs = projects || []
  let kp = kpis || {}
  let pl = pools || []

  // Auto-fetch if not fully provided
  if (!prjs.length || !pl.length || !kp.total) {
    try {
      const dash = await getDashboard()
      if (!prjs.length) prjs = dash.projects || []
      if (!kp.total) kp = dash.kpis || {}
      if (!pl.length) pl = dash.pools || []
    } catch { }
  }

  const wb = XLSX.utils.book_new()
  const aoa = []

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  }

  const CAT_THEMES = {
    'Expansion Joint': { bg: 'F3F0FF', color: '6C5CE7', borderColor: '6C5CE7' },
    'DEMI': { bg: 'EBF4FF', color: '1A6FC4', borderColor: '1A6FC4' },
    'EDG': { bg: 'E6F4EA', color: '15803D', borderColor: '15803D' },
    'COA': { bg: 'FEF7E0', color: 'B45309', borderColor: 'D97706' },
    'Oil Spill': { bg: 'E6FFFA', color: '00B894', borderColor: '00B894' },
    'All': { bg: 'E0F2F1', color: '0D9488', borderColor: '0D9488' },
  }
  try {
    getCategories().forEach(c => {
      const catKey = c.category || c.name || c.code
      if (!CAT_THEMES[catKey]) {
        const hex = (c.color || '#1a6fc4').replace('#', '').toUpperCase()
        CAT_THEMES[catKey] = { bg: 'F8FAFC', color: hex, borderColor: hex }
      }
    })
  } catch {}

  // ----------------------------------------------------
  // SECTION 1: TOP 7 KPI CARDS
  // ----------------------------------------------------
  aoa.push([
    'ACTIVE PROJECTS',
    'PENDING PROJECTS',
    'COMPLETED PROJECTS',
    'DEPLOYED SLOTS',
    'TOTAL WORKFORCE',
    'IDLE / AVAILABLE',
    'SHORTFALL ALERTS',
  ])
  aoa.push([
    kp.active ?? 0,
    kp.pending ?? 0,
    kp.completed ?? 0,
    kp.deployed ?? 0,
    kp.total ?? 0,
    kp.idle ?? 0,
    kp.shortfalls ?? 0,
  ])
  aoa.push([
    'With live start dates',
    'Awaiting scheduling',
    'Actual end date passed',
    'Committed to active jobs',
    'Total workforce pool',
    'In office / Standby',
    'Projects with 0 staff',
  ])

  // Blank separator rows
  aoa.push([])
  aoa.push([])

  // ----------------------------------------------------
  // SECTION 2: CATEGORY WORKFORCE POOL & TEAM DEPLOYMENT STATUS (CARD LAYOUT)
  // ----------------------------------------------------
  const sec2TitleRow = aoa.length
  aoa.push([
    'CATEGORY WORKFORCE POOL & TEAM DEPLOYMENT STATUS',
  ])
  aoa.push([
    `Live deployment tracking across all 5 workforce categories (${kp.total ?? 0} Total Positions • ${kp.deployed ?? 0} On-Site • ${kp.idle ?? 0} Office Standby)`,
  ])
  aoa.push([]) // small blank row

  const sec2CatRows = []

  pl.forEach(pool => {
    const nextStandby = (pool.teamCards || []).find(tc => tc.status !== 'Deployed')?.name
    const depTeamsCount = pool.committedTeams?.length || 0
    const stbyTeamsCount = pool.availableTeams?.length || 0

    const catCardText = `● ${pool.category.toUpperCase()} (${pool.totalPool} Slots)\n🚀 DEPLOYED: ${pool.committed} (${depTeamsCount}T)\n🏢 STANDBY: ${pool.available} (${stbyTeamsCount}T)`

    const row = [catCardText]

    ;(pool.teamCards || []).forEach(tc => {
      const isDep = tc.status === 'Deployed'
      const isNextReady = !isDep && tc.name === nextStandby
      const statusLine = isDep
        ? `🚀 ${tc.activeJob}`
        : isNextReady
        ? `⚡ Next Ready (Office)`
        : `🏢 In Office`

      const teamCardText = `Team ${tc.name}  (${tc.totalSlots} Slots)\n${tc.actualStaff} Staff\n${statusLine}`
      row.push(teamCardText)
    })

    sec2CatRows.push({
      rowIndex: aoa.length,
      category: pool.category,
      teamCards: pool.teamCards || [],
      nextStandby,
    })
    aoa.push(row)
    aoa.push([]) // spacing row between category cards
  })

  // Blank separator rows
  aoa.push([])

  // ----------------------------------------------------
  // SECTION 3: PROJECT ASSIGNMENT BOARD (FULL 21 COLUMNS)
  // ----------------------------------------------------
  const sec3TitleRow = aoa.length
  aoa.push([
    'PROJECT ASSIGNMENT BOARD',
  ])
  aoa.push([
    `${prjs.length} of ${prjs.length} projects displayed`,
  ])
  const sec3HeaderRow = aoa.length
  const prjHeaders = [
    '#',
    'JOB CARD NO',
    'CONTRACT NO',
    'SERVICE ORDER',
    'PROJECT CODE',
    'CATEGORY',
    'LOCATION',
    'DESCRIPTION',
    'UNIT',
    'QTY',
    'MOB DATE (-5D)',
    'EXP START',
    'EXP END',
    'ACT START',
    'ACT END',
    'ASSIGNED TO',
    'ASSIGNED TEAMS',
    'REMARKS',
    'STATUS',
    'HEADCOUNT SLOTS',
    'ASSIGNED ROSTER',
  ]
  aoa.push(prjHeaders)

  const numPrjCols = prjHeaders.length // 21
  const sec3DataStart = aoa.length

  prjs.forEach((p, idx) => {
    const rosterStr = (p.assignedEmps && p.assignedEmps.length > 0)
      ? p.assignedEmps.map((e, eIdx) => {
          const isNeed = e.empId === 'Need' || (e.nameEn || '').toLowerCase().startsWith('need')
          const nameEn = isNeed ? 'Open Need (Temporary Slot)' : (e.nameEn || '—')
          const nameAr = (!isNeed && e.nameAr) ? ` (${e.nameAr})` : ''
          const role = e.jobCat ? ` · ${e.jobCat}` : ''
          const slot = isNeed ? ' [Need]' : ' [Perm]'
          const veh = (e.vehicleType && e.vehicleType !== '-') ? ` · Veh: ${e.vehicleType}` : ''
          const plate = (e.plate && e.plate !== '-') ? ` (${e.plate})` : ''
          return `${eIdx + 1}. [${e.empId}] ${nameEn}${nameAr} · Team ${e.team || '—'}${role}${slot}${veh}${plate}`
        }).join('\n')
      : (p.assignedHeadcount > 0 ? `${p.assignedHeadcount} slots` : '—')

    const assignedTeamsStr = (p.assignedTeams && p.assignedTeams.length > 0)
      ? p.assignedTeams.map(t => `Team ${t.replace(/team/i, '').trim()}`).join(', ')
      : (p.isOverlapped ? 'Dates Overlapped (No Team Assigned)' : (p.team ? `Team ${p.team.replace(/team/i, '').trim()}` : '—'))

    aoa.push([
      idx + 1,
      p.jobCard || '',
      p.contract || '',
      p.serviceOrder || '',
      p.project || '',
      p.category || '',
      p.location || '',
      p.desc || '',
      p.unit || '',
      p.productQty ?? p.qty ?? 0,
      p.mobDateComputed || p.mobDate || '',
      p.expStart || '',
      p.expEnd || '',
      p.actStart || '',
      p.actEnd || '',
      p.assignedTo || '',
      assignedTeamsStr,
      p.remarks || '',
      p.status || '',
      p.assignedHeadcount > 0 ? `${p.assignedHeadcount} slots` : '—',
      rosterStr,
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Merges for Dashboard Sheet
  ws['!merges'] = [
    { s: { r: sec2TitleRow, c: 0 }, e: { r: sec2TitleRow, c: numPrjCols - 1 } },
    { s: { r: sec2TitleRow + 1, c: 0 }, e: { r: sec2TitleRow + 1, c: numPrjCols - 1 } },
    { s: { r: sec3TitleRow, c: 0 }, e: { r: sec3TitleRow, c: numPrjCols - 1 } },
    { s: { r: sec3TitleRow + 1, c: 0 }, e: { r: sec3TitleRow + 1, c: numPrjCols - 1 } },
  ]

  // 1. Style Section 1: Top 7 KPI Cards
  const kpiStyles = [
    { bg: 'E6F4EA', color: '137333' }, // Active (Green)
    { bg: 'FEF7E0', color: 'B06000' }, // Pending (Amber)
    { bg: 'EEF2FF', color: '3730A3' }, // Completed (Indigo)
    { bg: 'E8F0FE', color: '1A73E8' }, // Deployed (Blue)
    { bg: 'F3E8FD', color: '8430CE' }, // Total (Purple)
    { bg: 'E0F2F1', color: '00796B' }, // Idle (Teal)
    { bg: kp.shortfalls > 0 ? 'FCE8E6' : 'E6F4EA', color: kp.shortfalls > 0 ? 'C5221F' : '137333' }, // Shortfall (Red/Green)
  ]

  for (let c = 0; c < 7; c++) {
    const refTitle = XLSX.utils.encode_cell({ r: 0, c })
    const refVal = XLSX.utils.encode_cell({ r: 1, c })
    const refSub = XLSX.utils.encode_cell({ r: 2, c })
    const st = kpiStyles[c] || kpiStyles[0]

    if (ws[refTitle]) {
      ws[refTitle].s = {
        fill: { fgColor: { rgb: st.bg } },
        font: { bold: true, color: { rgb: st.color }, sz: 10 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder,
      }
    }
    if (ws[refVal]) {
      ws[refVal].s = {
        fill: { fgColor: { rgb: st.bg } },
        font: { bold: true, color: { rgb: st.color }, sz: 18 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder,
      }
    }
    if (ws[refSub]) {
      ws[refSub].s = {
        fill: { fgColor: { rgb: st.bg } },
        font: { italic: true, color: { rgb: st.color }, sz: 9 },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: thinBorder,
      }
    }
  }

  // 2. Style Section 2: Category Workforce Pool & Team Deployment Status (Card Boxes)
  const sec2TitleRef = XLSX.utils.encode_cell({ r: sec2TitleRow, c: 0 })
  if (ws[sec2TitleRef]) {
    ws[sec2TitleRef].s = {
      fill: { fgColor: { rgb: '1A365D' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11.5 },
      alignment: { vertical: 'center', horizontal: 'left' },
    }
  }
  const sec2SubRef = XLSX.utils.encode_cell({ r: sec2TitleRow + 1, c: 0 })
  if (ws[sec2SubRef]) {
    ws[sec2SubRef].s = {
      fill: { fgColor: { rgb: '1A365D' } },
      font: { bold: true, color: { rgb: 'E2E8F0' }, sz: 9.5 },
      alignment: { vertical: 'center', horizontal: 'left' },
    }
  }

  // Section 2 Category and Team Cards
  sec2CatRows.forEach(catInfo => {
    const r = catInfo.rowIndex
    const theme = CAT_THEMES[catInfo.category] || { bg: 'F8FAFC', color: '1E293B', borderColor: 'CBD5E1' }

    // Col 0: Category Identity Card Box
    const refCat = XLSX.utils.encode_cell({ r, c: 0 })
    if (ws[refCat]) {
      ws[refCat].s = {
        fill: { fgColor: { rgb: theme.bg } },
        font: { sz: 9.5, bold: true, color: { rgb: theme.color } },
        alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
        border: {
          top: { style: 'medium', color: { rgb: theme.borderColor } },
          bottom: { style: 'medium', color: { rgb: theme.borderColor } },
          left: { style: 'medium', color: { rgb: theme.borderColor } },
          right: { style: 'medium', color: { rgb: theme.borderColor } },
        },
      }
    }

    // Col 1..N: Individual Team Cards
    catInfo.teamCards.forEach((tc, tIdx) => {
      const c = tIdx + 1
      const refTeam = XLSX.utils.encode_cell({ r, c })
      if (ws[refTeam]) {
        const isDep = tc.status === 'Deployed'
        const isNextReady = !isDep && tc.name === catInfo.nextStandby

        let cardBg = 'F8FAFC'
        let cardBorderColor = 'CBD5E1'
        let cardTextColor = '334155'

        if (isDep) {
          cardBg = 'EBF4FF'
          cardBorderColor = '93C5FD'
          cardTextColor = '1E40AF'
        } else if (isNextReady) {
          cardBg = 'F0FDF4'
          cardBorderColor = '86EFAC'
          cardTextColor = '15803D'
        }

        ws[refTeam].s = {
          fill: { fgColor: { rgb: cardBg } },
          font: { sz: 9.5, bold: isDep || isNextReady, color: { rgb: cardTextColor } },
          alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
          border: {
            top: { style: 'thin', color: { rgb: cardBorderColor } },
            bottom: { style: 'thin', color: { rgb: cardBorderColor } },
            left: { style: 'thin', color: { rgb: cardBorderColor } },
            right: { style: 'thin', color: { rgb: cardBorderColor } },
          },
        }
      }
    })
  })

  // 3. Style Section 3: Project Assignment Board (Full 21 Columns)
  const sec3TitleRef = XLSX.utils.encode_cell({ r: sec3TitleRow, c: 0 })
  if (ws[sec3TitleRef]) {
    ws[sec3TitleRef].s = {
      fill: { fgColor: { rgb: '1A365D' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11.5 },
      alignment: { vertical: 'center', horizontal: 'left' },
    }
  }
  const sec3SubRef = XLSX.utils.encode_cell({ r: sec3TitleRow + 1, c: 0 })
  if (ws[sec3SubRef]) {
    ws[sec3SubRef].s = {
      fill: { fgColor: { rgb: '1A365D' } },
      font: { bold: true, color: { rgb: 'E2E8F0' }, sz: 9.5 },
      alignment: { vertical: 'center', horizontal: 'left' },
    }
  }

  // Section 3 Column Headers (All 21 Columns)
  for (let c = 0; c < numPrjCols; c++) {
    const ref = XLSX.utils.encode_cell({ r: sec3HeaderRow, c })
    if (ws[ref]) {
      ws[ref].s = {
        fill: { fgColor: { rgb: '1A6FC4' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
        border: thinBorder,
      }
    }
  }

  // Section 3 Data Rows
  for (let i = 0; i < prjs.length; i++) {
    const r = sec3DataStart + i
    const p = prjs[i]
    const rowBg = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
    const catTheme = CAT_THEMES[p.category] || { bg: rowBg, color: '1E293B' }
    const isActive = p.status === 'Active'
    const isCompleted = p.status === 'Completed'

    for (let c = 0; c < numPrjCols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (ws[ref]) {
        // Alignment: Center for IDs, numbers, codes, dates, and status
        const isCenterCol = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, 18, 19].includes(c)
        let cellBg = rowBg
        let cellColor = '1E293B'
        let isBold = false

        if (c === 0) {
          cellColor = '64748B'
        } else if (c === 1) {
          // Job Card No
          isBold = true
          cellColor = '0F172A'
        } else if (c === 4) {
          // Project Code
          cellColor = '1A6FC4'
          isBold = true
        } else if (c === 5) {
          // Category
          cellColor = catTheme.color
          isBold = true
        } else if (c === 16) {
          // Assigned Teams
          isBold = true
          cellColor = '0F172A'
        } else if (c === 18) {
          // Status Badge
          isBold = true
          if (isCompleted) {
            cellBg = 'EEF2FF'
            cellColor = '3730A3'
          } else if (isActive) {
            cellBg = 'DCFCE7'
            cellColor = '15803D'
          } else {
            cellBg = 'FEF3C7'
            cellColor = 'B45309'
          }
        } else if (c === 19) {
          // Headcount Slots
          cellColor = isActive ? '1A6FC4' : (isCompleted ? '4F46E5' : '64748B')
          isBold = true
        }

        ws[ref].s = {
          fill: { fgColor: { rgb: cellBg } },
          font: { sz: c === 20 ? 9 : 9.5, bold: isBold, color: { rgb: cellColor } },
          alignment: {
            vertical: 'center',
            horizontal: isCenterCol ? 'center' : 'left',
            wrapText: [7, 17, 20].includes(c),
          },
          border: thinBorder,
        }
      }
    }
  }

  // Set Row Heights (Padding)
  const rowHeights = [
    { hpt: 24 }, // Row 0: KPI Titles
    { hpt: 30 }, // Row 1: KPI Values
    { hpt: 20 }, // Row 2: KPI Subtitles
    { hpt: 12 }, // Row 3: Blank
    { hpt: 12 }, // Row 4: Blank
    { hpt: 26 }, // Row 5: Section 2 Title
    { hpt: 18 }, // Row 6: Section 2 Subtitle
    { hpt: 10 }, // Row 7: Blank
  ]

  sec2CatRows.forEach(cRow => {
    rowHeights[cRow.rowIndex] = { hpt: 54 } // Card row height
    rowHeights[cRow.rowIndex + 1] = { hpt: 8 } // Spacing row height
  })

  rowHeights[sec3TitleRow] = { hpt: 26 }
  rowHeights[sec3TitleRow + 1] = { hpt: 18 }
  rowHeights[sec3HeaderRow] = { hpt: 28 }
  for (let i = 0; i < prjs.length; i++) {
    const empCount = prjs[i].assignedEmps?.length || 1
    rowHeights[sec3DataStart + i] = { hpt: Math.max(34, Math.min(180, empCount * 18)) }
  }
  ws['!rows'] = rowHeights

  // Set column widths matching all 21 columns
  ws['!cols'] = [
    { wch: 6 },   // Col 0: #
    { wch: 16 },  // Col 1: Job Card No
    { wch: 16 },  // Col 2: Contract No
    { wch: 16 },  // Col 3: Service Order
    { wch: 18 },  // Col 4: Project Code
    { wch: 20 },  // Col 5: Category
    { wch: 18 },  // Col 6: Location
    { wch: 38 },  // Col 7: Description (wrapped)
    { wch: 10 },  // Col 8: Unit
    { wch: 10 },  // Col 9: Qty
    { wch: 16 },  // Col 10: Mob Date (-5d)
    { wch: 14 },  // Col 11: Exp Start
    { wch: 14 },  // Col 12: Exp End
    { wch: 14 },  // Col 13: Act Start
    { wch: 14 },  // Col 14: Act End
    { wch: 18 },  // Col 15: Assigned To
    { wch: 20 },  // Col 16: Assigned Teams
    { wch: 24 },  // Col 17: Remarks (wrapped)
    { wch: 14 },  // Col 18: Status
    { wch: 16 },  // Col 19: Headcount Slots
    { wch: 65 },  // Col 20: Assigned Roster (wrapped)
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Dashboard')
  XLSX.writeFile(wb, 'Pioneer_Technical_Dashboard.xlsx')
}

export async function exportProjectsData(projects = []) {
  const prjs = projects || []
  const wb = XLSX.utils.book_new()
  const formattedNow = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  }

  const aoa = []
  aoa.push(['PIONEER TECHNICAL SERVICES - MASTER PROJECTS REGISTER'])
  aoa.push([`Total Projects: ${prjs.length}  •  Export Date: ${formattedNow}`])
  aoa.push([])

  const headers = [
    'S/NO',
    'JOB CARD NO',
    'CONTRACT NO',
    'SERVICE ORDER',
    'PROJECT CODE',
    'CATEGORY',
    'LOCATION',
    'DESCRIPTION',
    'UNIT',
    'QTY',
    'MOB DATE (-5D)',
    'START DATE',
    'END DATE',
    'ASSIGNED TO',
    'STATUS',
    'ASSIGNED TEAMS',
    'REMARKS',
  ]
  aoa.push(headers)

  const numCols = headers.length
  const todayStr = new Date().toISOString().split('T')[0]

  prjs.forEach((p, idx) => {
    const actEnd = (p.actEnd || '').trim()
    const isCompleted = p.status === 'Completed' || (actEnd && actEnd < todayStr)
    const isActive = !isCompleted && Boolean(p.actStart || p.expStart)
    const status = isCompleted ? 'Completed' : (isActive ? 'Active' : 'Pending')

    aoa.push([
      idx + 1,
      p.jobCard || '',
      p.contract || '',
      p.serviceOrder || '',
      p.project || '',
      p.category || '',
      p.location || '',
      p.desc || '',
      p.unit || '',
      p.qty ?? 0,
      p.mobDate || '',
      p.actStart || p.expStart || '',
      p.actEnd || p.expEnd || '',
      p.assignedTo || '',
      status,
      p.team || '',
      p.remarks || '',
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } },
  ]

  const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws[titleRef]) {
    ws[titleRef].s = {
      fill: { fgColor: { rgb: '1A365D' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 },
      alignment: { vertical: 'center', horizontal: 'center' },
    }
  }
  const subRef = XLSX.utils.encode_cell({ r: 1, c: 0 })
  if (ws[subRef]) {
    ws[subRef].s = {
      fill: { fgColor: { rgb: '2D3748' } },
      font: { italic: true, color: { rgb: 'E2E8F0' }, sz: 9.5 },
      alignment: { vertical: 'center', horizontal: 'center' },
    }
  }

  for (let c = 0; c < numCols; c++) {
    const ref = XLSX.utils.encode_cell({ r: 3, c })
    if (ws[ref]) {
      ws[ref].s = {
        fill: { fgColor: { rgb: '1A6FC4' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
        border: thinBorder,
      }
    }
  }

  for (let r = 4; r < aoa.length; r++) {
    const rowBg = (r - 4) % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
    const statusVal = aoa[r][14]

    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (ws[ref]) {
        const isCenter = [0, 1, 2, 3, 4, 8, 9, 10, 11, 12, 14].includes(c)
        let cellBg = rowBg
        let cellColor = '1E293B'
        let isBold = false

        if (c === 1 || c === 4) {
          isBold = true
          cellColor = '1A6FC4'
        } else if (c === 14) {
          isBold = true
          if (statusVal === 'Completed') {
            cellBg = 'EEF2FF'
            cellColor = '3730A3'
          } else if (statusVal === 'Active') {
            cellBg = 'DCFCE7'
            cellColor = '15803D'
          } else {
            cellBg = 'FEF3C7'
            cellColor = 'B45309'
          }
        }

        ws[ref].s = {
          fill: { fgColor: { rgb: cellBg } },
          font: { sz: 9.5, bold: isBold, color: { rgb: cellColor } },
          alignment: { vertical: 'center', horizontal: isCenter ? 'center' : 'left', wrapText: [7, 16].includes(c) },
          border: thinBorder,
        }
      }
    }
  }

  const rowHeights = [{ hpt: 30 }, { hpt: 20 }, { hpt: 10 }, { hpt: 28 }]
  for (let r = 4; r < aoa.length; r++) {
    rowHeights[r] = { hpt: 24 }
  }
  ws['!rows'] = rowHeights

  ws['!cols'] = [
    { wch: 6 },   // S/NO
    { wch: 16 },  // Job Card
    { wch: 16 },  // Contract
    { wch: 16 },  // Service Order
    { wch: 18 },  // Project Code
    { wch: 20 },  // Category
    { wch: 18 },  // Location
    { wch: 38 },  // Description
    { wch: 10 },  // Unit
    { wch: 10 },  // Qty
    { wch: 16 },  // Mob Date
    { wch: 14 },  // Start Date
    { wch: 14 },  // End Date
    { wch: 18 },  // Assigned To
    { wch: 14 },  // Status
    { wch: 18 },  // Assigned Teams
    { wch: 26 },  // Remarks
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Projects')
  XLSX.writeFile(wb, 'Pioneer_Projects.xlsx')
}

export async function exportEmployeesData(employees = []) {
  const emps = employees || []
  const wb = XLSX.utils.book_new()
  const formattedNow = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  }

  const aoa = []
  aoa.push(['PIONEER TECHNICAL SERVICES - WORKFORCE & FLEET REGISTER'])
  aoa.push([`Total Workforce: ${emps.length}  •  Export Date: ${formattedNow}`])
  aoa.push([])

  const headers = [
    'S/NO',
    'EMP ID',
    'NAME (ENGLISH)',
    'NAME (ARABIC)',
    'JOB TITLE / ROLE',
    'PROJECT / CATEGORY',
    'TEAM',
    'SLOT TYPE',
    'VEHICLE TYPE',
    'PLATE NO',
    'BRAND',
    'SECURITY EXPIRY',
    'VEHICLE MAINTENANCE',
    'GATE PASS',
    'TOOLS BOX',
  ]
  aoa.push(headers)

  const numCols = headers.length

  emps.forEach((e, idx) => {
    const isNeed = e.empId === 'Need' || (e.nameEn || '').toLowerCase().startsWith('need')
    aoa.push([
      idx + 1,
      e.empId || '',
      isNeed ? 'Open Need (Temporary Slot)' : (e.nameEn || ''),
      isNeed ? '—' : (e.nameAr || ''),
      e.jobCat || '—',
      e.project || '',
      e.team ? `Team ${e.team.replace(/team/i, '').trim()}` : '—',
      isNeed ? 'Open Need' : 'Permanent',
      e.vehicleType && e.vehicleType !== '-' ? e.vehicleType : '—',
      e.plate && e.plate !== '-' ? e.plate : '—',
      e.brand && e.brand !== '-' ? e.brand : '—',
      e.secExpiry && e.secExpiry !== '-' ? e.secExpiry : '—',
      e.vehicleStatus && e.vehicleStatus !== '-' ? e.vehicleStatus : 'OK / Ready',
      e.gatePass || 'N/A',
      e.toolsBox || '—',
    ])
  })

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } },
  ]

  const titleRef = XLSX.utils.encode_cell({ r: 0, c: 0 })
  if (ws[titleRef]) {
    ws[titleRef].s = {
      fill: { fgColor: { rgb: '1A365D' } },
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13 },
      alignment: { vertical: 'center', horizontal: 'center' },
    }
  }
  const subRef = XLSX.utils.encode_cell({ r: 1, c: 0 })
  if (ws[subRef]) {
    ws[subRef].s = {
      fill: { fgColor: { rgb: '2D3748' } },
      font: { italic: true, color: { rgb: 'E2E8F0' }, sz: 9.5 },
      alignment: { vertical: 'center', horizontal: 'center' },
    }
  }

  for (let c = 0; c < numCols; c++) {
    const ref = XLSX.utils.encode_cell({ r: 3, c })
    if (ws[ref]) {
      ws[ref].s = {
        fill: { fgColor: { rgb: '1A365D' } },
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
        alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
        border: thinBorder,
      }
    }
  }

  for (let r = 4; r < aoa.length; r++) {
    const rowBg = (r - 4) % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
    const isNeedRow = aoa[r][7] === 'Open Need'

    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (ws[ref]) {
        const isCenter = [0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].includes(c)
        let cellBg = rowBg
        let cellColor = '1E293B'
        let isBold = false

        if (c === 1) {
          isBold = true
          cellColor = '1A6FC4'
        } else if (c === 2 && isNeedRow) {
          cellColor = 'B45309'
          isBold = true
        } else if (c === 7) {
          cellBg = isNeedRow ? 'FEF3C7' : 'DCFCE7'
          cellColor = isNeedRow ? 'B45309' : '15803D'
          isBold = true
        }

        ws[ref].s = {
          fill: { fgColor: { rgb: cellBg } },
          font: { sz: 9.5, bold: isBold, color: { rgb: cellColor } },
          alignment: { vertical: 'center', horizontal: isCenter ? 'center' : 'left' },
          border: thinBorder,
        }
      }
    }
  }

  const rowHeights = [{ hpt: 30 }, { hpt: 20 }, { hpt: 10 }, { hpt: 28 }]
  for (let r = 4; r < aoa.length; r++) {
    rowHeights[r] = { hpt: 22 }
  }
  ws['!rows'] = rowHeights

  ws['!cols'] = [
    { wch: 6 },   // S/NO
    { wch: 12 },  // Emp ID
    { wch: 28 },  // Name EN
    { wch: 22 },  // Name AR
    { wch: 24 },  // Job Title
    { wch: 20 },  // Category
    { wch: 12 },  // Team
    { wch: 16 },  // Slot Type
    { wch: 18 },  // Vehicle Type
    { wch: 14 },  // Plate No
    { wch: 14 },  // Brand
    { wch: 16 },  // Security Expiry
    { wch: 20 },  // Vehicle Maintenance
    { wch: 14 },  // Gate Pass
    { wch: 14 },  // Tools Box
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Workforce')
  XLSX.writeFile(wb, 'Pioneer_Workforce.xlsx')
}

// Backup & Restore payload helpers using Supabase directly
export async function createBackupPayload() {
  const [prjsRes, empsRes] = await Promise.all([getProjects(), getEmployees()])
  const prjs = prjsRes.data || []
  const emps = empsRes.data || []
  const now = new Date()

  return {
    appName: 'Pioneer Technical Resource Management (Supabase Cloud)',
    version: '2.0',
    exportedAt: now.toISOString(),
    formattedDate: now.toLocaleString('en-GB'),
    metadata: {
      totalProjects: prjs.length,
      totalEmployees: emps.length,
      activeProjects: prjs.filter(p => (p.actStart || p.expStart) && (p.actEnd || p.expEnd)).length,
    },
    projects: prjs,
    employees: emps,
  }
}

export async function downloadBackupJSON() {
  const payload = await createBackupPayload()
  const jsonStr = JSON.stringify(payload, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const dateTag = new Date().toISOString().split('T')[0]
  const timeTag = new Date().toTimeString().split(' ')[0].replace(/:/g, '-')
  const filename = `Pioneer_Cloud_Backup_${dateTag}_${timeTag}.json`

  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
  document.body.removeChild(a)
  return { filename, metadata: payload.metadata }
}

export async function importBackupJSON(parsedData) {
  if (!parsedData || typeof parsedData !== 'object') {
    throw new Error('Invalid JSON format: Content must be a valid JSON object.')
  }

  let prjsToImport = Array.isArray(parsedData.projects) ? parsedData.projects : Array.isArray(parsedData) ? parsedData : null
  let empsToImport = Array.isArray(parsedData.employees) ? parsedData.employees : null

  if (!prjsToImport && !empsToImport) {
    throw new Error('No valid projects or employees data found in this backup file.')
  }

  if (prjsToImport) {
    fallbackProjects = prjsToImport
    saveStoredProjects(fallbackProjects)
  }
  if (empsToImport) {
    fallbackEmployees = empsToImport
    saveStoredEmployees(fallbackEmployees)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'imported' } }))
  }

  return {
    success: true,
    projectsImported: prjsToImport ? prjsToImport.length : 0,
    employeesImported: empsToImport ? empsToImport.length : 0,
    exportedAt: parsedData.exportedAt || parsedData.formattedDate || 'Backup',
  }
}

export async function resetStoredData() {
  fallbackProjects = (INITIAL_DATA.projects || []).map(p => ({ ...p }))
  fallbackEmployees = (INITIAL_DATA.employees || [])
    .filter(e => e.empId !== 'Need' && !(e.nameEn || '').toLowerCase().startsWith('need'))
    .map(e => ({ ...e }))
  saveStoredProjects(fallbackProjects)
  saveStoredEmployees(fallbackEmployees)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_data_updated', { detail: { type: 'reset' } }))
  }
}

export const exportDashboard = exportDashboardData
export const exportProjects = exportProjectsData
export const exportEmployees = exportEmployeesData
