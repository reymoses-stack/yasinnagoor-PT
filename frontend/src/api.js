// API client for Pioneer Technical Dashboard with Dual-Mode Support (Backend API + Vercel/Netlify Standalone LocalStorage Client)
import * as XLSX from 'xlsx'
import {
  getStoredProjects,
  saveStoredProjects,
  getStoredEmployees,
  saveStoredEmployees,
  resetStoredData,
  createBackupPayload,
  downloadBackupJSON,
  importBackupJSON,
} from './storage'

const ENV_API = import.meta.env?.VITE_API_URL || ''
const BASE = ENV_API ? `${ENV_API}/api` : '/api'
const BACKEND_DIRECT = 'http://localhost:8080/api'

const CATEGORY_MAP = {
  Demi: 'DEMI',
  EXJ: 'Expansion Joint',
  EDG: 'EDG',
  COA: 'COA',
  'Oil Spill': 'Oil Spill',
  'Oill Spill': 'Oil Spill',
  'Oil': 'Oil Spill',
  'Oill': 'Oil Spill',
}

function getCategory(code) {
  if (!code) return 'All'
  const trimmed = code.trim()
  return CATEGORY_MAP[trimmed] || trimmed || 'All'
}

function calc5DaysPrior(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() - 5)
  return d.toISOString().split('T')[0]
}

// Compute client-side dashboard details
export function computeClientDashboard() {
  const emps = getStoredEmployees()
  const prjs = getStoredProjects()

  const catTeams = {}
  emps.forEach(e => {
    const c = e.project
    const t = (e.team || '').trim()
    if (!catTeams[c]) catTeams[c] = new Set()
    if (t) catTeams[c].add(t)
  })

  // 1. Group active projects by category (Active when start date is set)
  const catActiveProjects = {}
  prjs.forEach(p => {
    const s = p.actStart || p.expStart || ''
    if (s) {
      const cat = getCategory(p.project)
      if (!catActiveProjects[cat]) catActiveProjects[cat] = []
      catActiveProjects[cat].push(p)
    }
  })

  // 2. Pre-calculate assigned teams
  const projectAssignedTeams = {}
  const usedTeams = {}
  ;['DEMI', 'Expansion Joint', 'EDG', 'COA', 'Oil Spill', 'All'].forEach(cat => {
    usedTeams[cat] = new Map()
  })

  Object.entries(catActiveProjects).forEach(([cat, activeList]) => {
    const allCatTeams = Array.from(catTeams[cat] || []).sort()
    if (!allCatTeams.length || !activeList.length) return

    if (activeList.length === 1) {
      const p1 = activeList[0]
      const explicit = (p1.team || '')
        .split(',')
        .map(t => t.replace(/team/i, '').trim())
        .filter(Boolean)
      if (explicit.length > 0) {
        projectAssignedTeams[p1.id] = explicit
        explicit.forEach(t => usedTeams[cat].set(t, p1.jobCard))
      } else {
        projectAssignedTeams[p1.id] = allCatTeams
        allCatTeams.forEach(t => usedTeams[cat].set(t, p1.jobCard))
      }
    } else {
      const p1 = activeList[0]
      const claimedBySubsequent = new Set()

      for (let i = 1; i < activeList.length; i++) {
        const pi = activeList[i]
        const explicit = (pi.team || '')
          .split(',')
          .map(t => t.replace(/team/i, '').trim())
          .filter(Boolean)
        if (explicit.length > 0) {
          projectAssignedTeams[pi.id] = explicit
          explicit.forEach(t => {
            claimedBySubsequent.add(t)
            usedTeams[cat].set(t, pi.jobCard)
          })
        } else {
          let chosen = ''
          for (let teamIdx = 1; teamIdx < allCatTeams.length; teamIdx++) {
            const tCandidate = allCatTeams[teamIdx]
            if (!claimedBySubsequent.has(tCandidate)) {
              chosen = tCandidate
              break
            }
          }
          if (!chosen) {
            for (const tCandidate of allCatTeams) {
              if (!claimedBySubsequent.has(tCandidate)) {
                chosen = tCandidate
                break
              }
            }
          }
          if (chosen) {
            claimedBySubsequent.add(chosen)
            projectAssignedTeams[pi.id] = [chosen]
            usedTeams[cat].set(chosen, pi.jobCard)
          }
        }
      }

      // P1 gets Team A + ALL remaining unpeeled teams
      const explicit1 = (p1.team || '')
        .split(',')
        .map(t => t.replace(/team/i, '').trim())
        .filter(Boolean)
      if (explicit1.length > 0) {
        const p1Teams = explicit1.filter(t => !claimedBySubsequent.has(t))
        projectAssignedTeams[p1.id] = p1Teams
        p1Teams.forEach(t => usedTeams[cat].set(t, p1.jobCard))
      } else {
        const p1Teams = allCatTeams.filter(t => !claimedBySubsequent.has(t))
        projectAssignedTeams[p1.id] = p1Teams
        p1Teams.forEach(t => usedTeams[cat].set(t, p1.jobCard))
      }
    }
  })

  const details = prjs.map(p => {
    const cat = getCategory(p.project)
    const s = p.actStart || p.expStart || ''
    const e = p.actEnd || p.expEnd || ''
    const status = s ? 'Active' : 'Pending'
    const computedMob = p.mobDate || calc5DaysPrior(s)

    const allTeams = Array.from(catTeams[cat] || []).sort()
    const assignedTeams = projectAssignedTeams[p.id] || []
    let assignedEmps = []

    if (status === 'Active') {
      assignedEmps = emps.filter(
        emp =>
          (cat === 'All' || emp.project === cat) &&
          assignedTeams.includes((emp.team || '').trim())
      )
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
      assignedHeadcount: assignedEmps.length,
      assignedEmps,
      productQty: p.qty ?? 0,
    }
  })

  const activeCount = details.filter(p => p.status === 'Active').length
  const pendingCount = details.filter(p => p.status === 'Pending').length
  const deployedCount = details
    .filter(p => p.status === 'Active')
    .reduce((sum, p) => sum + p.assignedHeadcount, 0)
  const totalWorkforce = emps.length
  const idleCount = totalWorkforce - deployedCount
  const shortfallCount = details.filter(
    p => p.status === 'Active' && p.assignedHeadcount === 0
  ).length

  const poolStats = ['Expansion Joint', 'EDG', 'DEMI', 'COA', 'Oil Spill', 'All'].map(
    cat => {
      const allTeams = Array.from(catTeams[cat] || []).sort()
      const totalStaff = emps.filter(
        emp => cat === 'All' || emp.project === cat
      ).length

      const teamCards = allTeams.map(t => {
        const tEmps = emps.filter(
          emp =>
            (cat === 'All' || emp.project === cat) &&
            (emp.team || '').trim() === t
        )
        const tot = tEmps.length
        let actual = 0,
          needs = 0
        tEmps.forEach(e => {
          if (
            e.empId === 'Need' ||
            (e.nameEn || '').toLowerCase().startsWith('need')
          )
            needs++
          else actual++
        })

        const activeJob =
          (cat === 'All'
            ? usedTeams['Expansion Joint']?.get(t) ||
              usedTeams['EDG']?.get(t) ||
              usedTeams['DEMI']?.get(t) ||
              usedTeams['COA']?.get(t) ||
              usedTeams['All']?.get(t)
            : usedTeams[cat]?.get(t)) || ''
        return {
          name: t,
          totalSlots: tot,
          actualStaff: actual,
          needSlots: needs,
          status: activeJob ? 'Deployed' : 'Office / Standby',
          activeJob,
        }
      })

      const comStaff = teamCards
        .filter(tc => tc.status === 'Deployed')
        .reduce((sum, tc) => sum + tc.totalSlots, 0)
      const comTeams = teamCards
        .filter(tc => tc.status === 'Deployed')
        .map(tc => tc.name)
      const availTeams = teamCards
        .filter(tc => tc.status !== 'Deployed')
        .map(tc => tc.name)

      return {
        category: cat,
        totalPool: totalStaff,
        totalTeams: allTeams,
        committedTeams: comTeams,
        availableTeams: availTeams,
        committed: comStaff,
        available: totalStaff - comStaff,
        teamCards,
      }
    }
  )

  return {
    kpis: {
      active: activeCount,
      pending: pendingCount,
      deployed: deployedCount,
      total: totalWorkforce,
      idle: idleCount,
      shortfalls: shortfallCount,
    },
    pools: poolStats,
    projects: details,
  }
}

async function req(path, opts = {}) {
  try {
    const res = await fetch(BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    })
    if (res.ok) return await res.json()
  } catch {
    // try direct localhost if in local dev
  }

  if (!ENV_API && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    try {
      const resDirect = await fetch(BACKEND_DIRECT + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      })
      if (resDirect.ok) return await resDirect.json()
    } catch {
      // Fall through to client-side fallback
    }
  }

  throw new Error(`API request failed: ${path}`)
}

// Dashboard API (with LocalStorage Fallback)
export const getDashboard = async () => {
  try {
    return await req('/dashboard')
  } catch {
    return computeClientDashboard()
  }
}

// Projects API (with LocalStorage Fallback)
export const getProjects = async (params = {}) => {
  try {
    return await req('/projects?' + new URLSearchParams(params))
  } catch {
    const prjs = getStoredProjects()
    return { data: prjs }
  }
}

export const createProject = async body => {
  try {
    return await req('/projects', { method: 'POST', body: JSON.stringify(body) })
  } catch {
    const prjs = getStoredProjects()
    const newId = prjs.length > 0 ? Math.max(...prjs.map(p => p.id || 0)) + 1 : 1
    const newPrj = { ...body, id: newId }
    if (!newPrj.mobDate && (newPrj.actStart || newPrj.expStart)) {
      newPrj.mobDate = calc5DaysPrior(newPrj.actStart || newPrj.expStart)
    }
    prjs.push(newPrj)
    saveStoredProjects(prjs)
    return newPrj
  }
}

export const updateProject = async (id, body) => {
  try {
    return await req(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  } catch {
    const prjs = getStoredProjects()
    const idx = prjs.findIndex(p => p.id === Number(id))
    if (idx !== -1) {
      prjs[idx] = { ...prjs[idx], ...body, id: Number(id) }
      if (!prjs[idx].mobDate && (prjs[idx].actStart || prjs[idx].expStart)) {
        prjs[idx].mobDate = calc5DaysPrior(prjs[idx].actStart || prjs[idx].expStart)
      }
      saveStoredProjects(prjs)
      return prjs[idx]
    }
    return body
  }
}

export const deleteProject = async id => {
  try {
    return await req(`/projects/${id}`, { method: 'DELETE' })
  } catch {
    let prjs = getStoredProjects()
    prjs = prjs.filter(p => p.id !== Number(id))
    saveStoredProjects(prjs)
    return { success: true }
  }
}

export const getAssigned = async id => {
  try {
    return await req(`/projects/${id}/assigned`)
  } catch {
    const dash = computeClientDashboard()
    const prj = dash.projects.find(p => p.id === Number(id))
    return {
      project: prj,
      status: prj?.status || 'Pending',
      category: prj?.category || '',
      assignedTeams: prj?.assignedTeams || [],
      assigned: prj?.assignedEmps || [],
      total: prj?.assignedHeadcount || 0,
      data: prj?.assignedEmps || [],
    }
  }
}

// Employees API (with LocalStorage Fallback)
export const getEmployees = async (params = {}) => {
  try {
    return await req('/employees?' + new URLSearchParams(params))
  } catch {
    let emps = getStoredEmployees()
    if (params.search) {
      const q = params.search.toLowerCase()
      emps = emps.filter(
        e =>
          (e.nameEn || '').toLowerCase().includes(q) ||
          (e.empId || '').toLowerCase().includes(q) ||
          (e.project || '').toLowerCase().includes(q)
      )
    }
    if (params.project) {
      emps = emps.filter(e => e.project === params.project)
    }
    return { data: emps }
  }
}

export const createEmployee = async body => {
  try {
    return await req('/employees', { method: 'POST', body: JSON.stringify(body) })
  } catch {
    const emps = getStoredEmployees()
    const newId = emps.length > 0 ? Math.max(...emps.map(e => e.id || 0)) + 1 : 1
    const newEmp = { ...body, id: newId }
    emps.push(newEmp)
    saveStoredEmployees(emps)
    return newEmp
  }
}

export const updateEmployee = async (id, body) => {
  try {
    return await req(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  } catch {
    const emps = getStoredEmployees()
    const idx = emps.findIndex(e => e.id === Number(id))
    if (idx !== -1) {
      emps[idx] = { ...emps[idx], ...body, id: Number(id) }
      saveStoredEmployees(emps)
      return emps[idx]
    }
    return body
  }
}

export const deleteEmployee = async id => {
  try {
    return await req(`/employees/${id}`, { method: 'DELETE' })
  } catch {
    let emps = getStoredEmployees()
    emps = emps.filter(e => e.id !== Number(id))
    saveStoredEmployees(emps)
    return { success: true }
  }
}

// Reliable Excel Export (Backend Blob or Client SheetJS Fallback)
export async function exportDashboardData(projects = [], kpis = {}) {
  try {
    let res = await fetch(BASE + '/export/dashboard')
    if (!res.ok && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      res = await fetch(BACKEND_DIRECT + '/export/dashboard')
    }
    if (res.ok) {
      const blob = await res.blob()
      downloadBlob(blob, 'Pioneer_Technical_Dashboard.xlsx')
      return
    }
  } catch {
    // Client-side fallback
  }

  const rows = (projects || []).map((p, idx) => ({
    'S/NO': idx + 1,
    'Job Card No': p.jobCard || '',
    'Contract No': p.contract || '',
    'Service Order': p.serviceOrder || '',
    'Project Code': p.project || '',
    'Location': p.location || '',
    'Description': p.desc || '',
    'Category': p.category || '',
    'Product Qty': p.productQty ?? p.qty ?? 0,
    'Mob Date (-5d)': p.mobDateComputed || p.mobDate || '',
    'Start Date': p.startDate || p.actStart || p.expStart || '',
    'End Date': p.endDate || p.actEnd || p.expEnd || '',
    'Status': p.status || '',
    'Assigned Teams': (p.assignedTeams || []).join(', '),
    'Headcount Slots': p.assignedHeadcount ?? 0,
    'Assigned Engineer': p.assignedTo || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Live Board')
  XLSX.writeFile(wb, 'Pioneer_Technical_Dashboard.xlsx')
}

export async function exportProjectsData(projects = []) {
  try {
    let res = await fetch(BASE + '/export/projects')
    if (!res.ok && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      res = await fetch(BACKEND_DIRECT + '/export/projects')
    }
    if (res.ok) {
      const blob = await res.blob()
      downloadBlob(blob, 'Pioneer_Projects.xlsx')
      return
    }
  } catch {
    // Client-side fallback
  }

  const rows = (projects || []).map((p, idx) => ({
    'S/NO': idx + 1,
    'Job Card No': p.jobCard || '',
    'Project Code': p.project || '',
    'Location': p.location || '',
    'Description': p.desc || '',
    'Unit': p.unit || '',
    'Product Qty': p.qty ?? 0,
    'Mob Date': p.mobDate || '',
    'Actual Start': p.actStart || '',
    'Actual End': p.actEnd || '',
    'Status': (p.actStart || p.expStart) ? 'Active' : 'Pending',
    'Assigned Engineer': p.assignedTo || '',
    'Teams': p.team || '',
    'Remarks': p.remarks || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Projects')
  XLSX.writeFile(wb, 'Pioneer_Projects.xlsx')
}

export async function exportEmployeesData(employees = []) {
  try {
    let res = await fetch(BASE + '/export/employees')
    if (!res.ok && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      res = await fetch(BACKEND_DIRECT + '/export/employees')
    }
    if (res.ok) {
      const blob = await res.blob()
      downloadBlob(blob, 'Pioneer_Workforce.xlsx')
      return
    }
  } catch {
    // Client-side fallback
  }

  const rows = (employees || []).map((e, idx) => ({
    'S/NO': idx + 1,
    'Emp ID': e.empId || '',
    'Name (EN)': e.nameEn || '',
    'Name (AR)': e.nameAr || '',
    'Job Title': e.jobTitle || '',
    'Category / Project': e.project || '',
    'Team': e.team || '',
    'Location': e.location || '',
    'Maintenance Status': e.status || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Workforce')
  XLSX.writeFile(wb, 'Pioneer_Workforce.xlsx')
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

export {
  resetStoredData,
  createBackupPayload,
  downloadBackupJSON,
  importBackupJSON,
}
export const exportDashboard = exportDashboardData
export const exportProjects = exportProjectsData
export const exportEmployees = exportEmployeesData
