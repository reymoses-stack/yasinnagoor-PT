import { INITIAL_DATA } from './seedData'

const KEY_PROJECTS = 'pt_projects_v2'
const KEY_EMPLOYEES = 'pt_employees_v2'

export function getStoredProjects() {
  try {
    const raw = localStorage.getItem(KEY_PROJECTS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.error('Failed to read projects from localStorage', e)
  }
  const initial = INITIAL_DATA.projects || []
  saveStoredProjects(initial, false)
  return initial
}

export function saveStoredProjects(projects, notify = true) {
  try {
    localStorage.setItem(KEY_PROJECTS, JSON.stringify(projects))
    if (notify && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pt_storage_updated', { detail: { type: 'projects' } }))
    }
  } catch (e) {
    console.error('Failed to save projects to localStorage', e)
  }
}

export function getStoredEmployees() {
  try {
    const raw = localStorage.getItem(KEY_EMPLOYEES)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.error('Failed to read employees from localStorage', e)
  }
  const initial = INITIAL_DATA.employees || []
  saveStoredEmployees(initial, false)
  return initial
}

export function saveStoredEmployees(employees, notify = true) {
  try {
    localStorage.setItem(KEY_EMPLOYEES, JSON.stringify(employees))
    if (notify && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pt_storage_updated', { detail: { type: 'employees' } }))
    }
  } catch (e) {
    console.error('Failed to save employees to localStorage', e)
  }
}

// Generate Backup JSON Object
export function createBackupPayload() {
  const prjs = getStoredProjects()
  const emps = getStoredEmployees()
  const now = new Date()

  return {
    appName: 'Pioneer Technical Resource Management',
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

// Download Backup File (.json)
export function downloadBackupJSON() {
  const payload = createBackupPayload()
  const jsonStr = JSON.stringify(payload, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const dateTag = new Date().toISOString().split('T')[0]
  const timeTag = new Date().toTimeString().split(' ')[0].replace(/:/g, '-')
  const filename = `Pioneer_Data_Backup_${dateTag}_${timeTag}.json`

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

// Validate and Import Backup JSON Data
export function importBackupJSON(parsedData) {
  if (!parsedData || typeof parsedData !== 'object') {
    throw new Error('Invalid JSON format: Content must be a valid JSON object.')
  }

  let projectsToSave = null
  let employeesToSave = null

  // Support direct object with projects & employees
  if (Array.isArray(parsedData.projects)) {
    projectsToSave = parsedData.projects
  } else if (Array.isArray(parsedData)) {
    // If raw array of projects
    projectsToSave = parsedData
  }

  if (Array.isArray(parsedData.employees)) {
    employeesToSave = parsedData.employees
  }

  if (!projectsToSave && !employeesToSave) {
    throw new Error('No valid "projects" or "employees" data found in the imported file.')
  }

  if (projectsToSave) {
    saveStoredProjects(projectsToSave, false)
  }
  if (employeesToSave) {
    saveStoredEmployees(employeesToSave, false)
  }

  // Notify all components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_storage_updated', {
      detail: {
        type: 'all',
        projectsCount: projectsToSave ? projectsToSave.length : null,
        employeesCount: employeesToSave ? employeesToSave.length : null,
      },
    }))
  }

  return {
    success: true,
    projectsImported: projectsToSave ? projectsToSave.length : 0,
    employeesImported: employeesToSave ? employeesToSave.length : 0,
    exportedAt: parsedData.exportedAt || parsedData.formattedDate || 'Custom Backup',
  }
}

export function resetStoredData() {
  saveStoredProjects(INITIAL_DATA.projects || [], false)
  saveStoredEmployees(INITIAL_DATA.employees || [], false)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pt_storage_updated', { detail: { type: 'reset' } }))
  }
}

