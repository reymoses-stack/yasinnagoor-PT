import { useState, useEffect, useCallback } from 'react'
import {
  getDashboard,
  exportDashboard,
  computeDashboardFromData,
  subscribeToSupabase,
  getCategories,
  getCategory,
  getAllTeamsForCategory,
} from '../api'
import { INITIAL_DATA } from '../seedData'
import AssignedModal from '../components/AssignedModal'
import TeamModal from '../components/TeamModal'
import KpiDetailModal from '../components/KpiDetailModal'
import CategoryModal from '../components/CategoryModal'

const categoryColors = {
  DEMI: '#1a6fc4',
  'Expansion Joint': '#6c5ce7',
  EDG: '#28a745',
  COA: '#e08c00',
  'Oil Spill': '#00b894',
  All: '#00b894',
}

function calc5DaysPrior(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() - 5)
  return d.toISOString().split('T')[0]
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return d
    return dt.toISOString().split('T')[0]
  } catch {
    return d
  }
}

function getBusyTeamsForCategory(category, excludeId, projectList = []) {
  const busyMap = {}
  const allCat = getAllTeamsForCategory(category, projectList)

  const otherProjects = (projectList || []).filter(
    other =>
      other.id !== excludeId &&
      (other.status === 'Active' || other.actStart || other.expStart || other.team) &&
      (other.category || getCategory(other.project)) === category
  )

  if (otherProjects.length > 0) {
    const firstOther = otherProjects[0]

    otherProjects.forEach(p => {
      const explicit = (p.team || '')
        .split(',')
        .map(t => t.replace(/team/i, '').trim())
        .filter(Boolean)

      if (p === firstOther) {
        // The first project in this category is the primary absorber (allocated all teams initially).
        // If it was manually set to a smaller subset, lock that subset.
        if (explicit.length > 0 && explicit.length < allCat.length) {
          explicit.forEach(t => {
            busyMap[t] = p.jobCard || `Project #${p.id}`
          })
        } else {
          // Otherwise, it only locks its primary base team (Team A)!
          // All helper teams (Team B, Team C, Team D, Team E) stay AVAILABLE for subsequent projects!
          const baseTeam = allCat[0] || 'A'
          busyMap[baseTeam] = p.jobCard || `Project #${p.id}`
        }
      } else {
        // Subsequent projects lock their chosen teams
        if (explicit.length > 0) {
          explicit.forEach(t => {
            busyMap[t] = p.jobCard || `Project #${p.id}`
          })
        } else if (p.assignedTeams && p.assignedTeams.length > 0) {
          p.assignedTeams.forEach(t => {
            busyMap[t] = p.jobCard || `Project #${p.id}`
          })
        }
      }
    })
  }
  return busyMap
}

const fallback = computeDashboardFromData(
  INITIAL_DATA.projects,
  INITIAL_DATA.employees
)

const EMPTY_PROJECT = {
  jobCard: '',
  contract: '',
  serviceOrder: '',
  project: '',
  desc: '',
  unit: '',
  qty: '',
  location: '',
  mobDate: '',
  expStart: '',
  expEnd: '',
  actStart: '',
  actEnd: '',
  assignedTo: '',
  team: '',
  remarks: '',
}

// DEFINED COLUMNS WITH EXPLICIT ALIGNMENTS FOR PERFECT VERTICAL & HORIZONTAL LAYOUT
const COLS = [
  { key: 'id', label: '#', align: 'center' },
  { key: 'jobCard', label: 'Job Card No', align: 'left' },
  { key: 'contract', label: 'Contract No', align: 'left' },
  { key: 'serviceOrder', label: 'Service Order', align: 'left' },
  { key: 'project', label: 'Project Code', align: 'left' },
  { key: 'category', label: 'Category', align: 'left' },
  { key: 'location', label: 'Location', align: 'center' },
  { key: 'desc', label: 'Description', align: 'left' },
  { key: 'unit', label: 'Unit', align: 'center' },
  { key: 'productQty', label: 'Qty', align: 'center' },
  { key: 'mobDate', label: 'Mob Date (-5d)', align: 'center' },
  { key: 'expStart', label: 'Exp Start', align: 'center' },
  { key: 'expEnd', label: 'Exp End', align: 'center' },
  { key: 'actStart', label: 'Act Start', align: 'center' },
  { key: 'actEnd', label: 'Act End', align: 'center' },
  { key: 'assignedTo', label: 'Assigned To', align: 'left' },
  { key: 'assignedTeams', label: 'Assigned Teams', align: 'left' },
  { key: 'remarks', label: 'Remarks', align: 'left' },
  { key: 'status', label: 'Status', align: 'center' },
  { key: 'assignedHeadcount', label: 'Headcount Slots', align: 'center' },
  { key: 'assignedEmps', label: 'Assigned Roster', align: 'center' },
]

export default function Dashboard({ onOpenBackup }) {
  const [kpis, setKpis] = useState(fallback.kpis)
  const [pools, setPools] = useState(fallback.pools)
  const [board, setBoard] = useState(fallback.projects)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [sort, setSort] = useState({ col: 'id', dir: 'asc' })
  const [assigned, setAssigned] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [kpiModalType, setKpiModalType] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [form, setForm] = useState(EMPTY_PROJECT)
  const [editId, setEditId] = useState(null)
  const [selectedTeams, setSelectedTeams] = useState([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getDashboard()
      .then(d => {
        if (d?.kpis) setKpis(d.kpis)
        if (d?.pools?.length) setPools(d.pools)
        if (d?.projects?.length) setBoard(d.projects)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToSupabase(() => load())
    const handleDataUpdate = () => load()
    window.addEventListener('pt_data_updated', handleDataUpdate)
    window.addEventListener('pt_categories_updated', handleDataUpdate)
    return () => {
      unsubscribe()
      window.removeEventListener('pt_data_updated', handleDataUpdate)
      window.removeEventListener('pt_categories_updated', handleDataUpdate)
    }
  }, [load])

  // ROBUST COLUMN SORTING
  const sorted = [...board].sort((a, b) => {
    if (!sort.col) return 0
    let va = a[sort.col]
    let vb = b[sort.col]

    if (sort.col === 'productQty' || sort.col === 'qty') {
      va = a.productQty ?? a.qty ?? 0
      vb = b.productQty ?? b.qty ?? 0
    } else if (sort.col === 'mobDate') {
      va = a.mobDateComputed || a.mobDate || ''
      vb = b.mobDateComputed || b.mobDate || ''
    } else if (sort.col === 'expStart') {
      va = a.expStart || ''
      vb = b.expStart || ''
    } else if (sort.col === 'expEnd') {
      va = a.expEnd || ''
      vb = b.expEnd || ''
    } else if (sort.col === 'actStart') {
      va = a.actStart || ''
      vb = b.actStart || ''
    } else if (sort.col === 'actEnd') {
      va = a.actEnd || ''
      vb = b.actEnd || ''
    } else if (sort.col === 'assignedTeams' || sort.col === 'team') {
      va = (a.assignedTeams || []).join(', ') || a.team || ''
      vb = (b.assignedTeams || []).join(', ') || b.team || ''
    } else if (sort.col === 'assignedHeadcount') {
      va = a.assignedHeadcount ?? 0
      vb = b.assignedHeadcount ?? 0
    }

    if (va === undefined || va === null) va = ''
    if (vb === undefined || vb === null) vb = ''

    if (typeof va === 'number' && typeof vb === 'number') {
      return sort.dir === 'asc' ? va - vb : vb - va
    }

    const strA = String(va).toLowerCase()
    const strB = String(vb).toLowerCase()
    return sort.dir === 'asc'
      ? strA.localeCompare(strB)
      : strB.localeCompare(strA)
  })

  const filtered = sorted.filter(
    p =>
      (!filterStatus || p.status === filterStatus) &&
      (!filterCat || p.category === filterCat)
  )

  const cats = [...new Set(board.map(p => p.category))].filter(Boolean).sort()

  const toggleSort = col =>
    setSort(s =>
      s.col === col
        ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    )

  const sortArrow = col =>
    sort.col === col ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'

  // OPEN EDIT MODAL WITH DYNAMIC TEAM AVAILABILITY & BUSY DETECTION
  const openEdit = p => {
    const cat = p.category || getCategory(p.project)
    const allTeams = getAllTeamsForCategory(cat, board)
    const busyMap = getBusyTeamsForCategory(cat, p.id, board)
    const available = allTeams.filter(t => !busyMap[t]).sort()

    const explicit = (p.team || '')
      .split(',')
      .map(t => t.replace(/team/i, '').trim())
      .filter(Boolean)

    let initialTeams = []
    if (explicit.length > 0) {
      initialTeams = explicit.filter(t => !busyMap[t])
      if (initialTeams.length === 0) initialTeams = explicit
    } else if (p.status === 'Active' && p.assignedTeams && p.assignedTeams.length > 0) {
      initialTeams = p.assignedTeams.filter(t => !busyMap[t])
    } else if (available.length > 0) {
      const isFirst = Object.keys(busyMap).length === 0
      initialTeams = isFirst ? available : [available[0]]
    }

    const s = p.actStart || p.expStart || ''
    const currentMob = p.mobDate || calc5DaysPrior(s)

    setForm({
      jobCard: p.jobCard || '',
      contract: p.contract || '',
      serviceOrder: p.serviceOrder || '',
      project: p.project || '',
      desc: p.desc || '',
      unit: p.unit ?? '',
      qty: p.qty ?? 0,
      location: p.location || '',
      mobDate: currentMob,
      expStart: p.expStart || '',
      expEnd: p.expEnd || '',
      actStart: p.actStart || '',
      actEnd: p.actEnd || '',
      assignedTo: p.assignedTo || '',
      team: initialTeams.join(', '),
      remarks: p.remarks || '',
    })
    setSelectedTeams(initialTeams)
    setEditId(p.id)
    setShowForm(true)
  }

  const handleStartDateChange = (field, val) => {
    const newMob = calc5DaysPrior(val)
    setForm(f => {
      const updated = {
        ...f,
        [field]: val,
        mobDate: newMob || f.mobDate,
      }

      const cat = getCategory(updated.project)
      const allTeams = getAllTeamsForCategory(cat, board)
      const busyMap = getBusyTeamsForCategory(cat, editId, board)
      const available = allTeams.filter(t => !busyMap[t]).sort()

      if (val && available.length > 0) {
        const isFirst = Object.keys(busyMap).length === 0
        if (isFirst) {
          setSelectedTeams(available)
          updated.team = available.join(', ')
        } else if (selectedTeams.length === 0) {
          const defaultChoice = [available[0]]
          setSelectedTeams(defaultChoice)
          updated.team = defaultChoice.join(', ')
        }
      }
      return updated
    })
  }

  const handleProjectChange = val => {
    setForm(f => {
      const updated = { ...f, project: val }
      const cat = getCategory(val)
      const allTeams = getAllTeamsForCategory(cat, board)
      const busyMap = getBusyTeamsForCategory(cat, editId, board)
      const available = allTeams.filter(t => !busyMap[t]).sort()

      if (updated.expStart || updated.actStart) {
        const isFirst = Object.keys(busyMap).length === 0
        if (isFirst) {
          setSelectedTeams(available)
          updated.team = available.join(', ')
        } else {
          const stillValid = selectedTeams.filter(t => available.includes(t))
          const newChoice = stillValid.length > 0 ? stillValid : (available.length > 0 ? [available[0]] : [])
          setSelectedTeams(newChoice)
          updated.team = newChoice.join(', ')
        }
      }
      return updated
    })
  }

  const toggleTeamSelection = teamName => {
    setSelectedTeams(prev => {
      const next = prev.includes(teamName)
        ? prev.filter(t => t !== teamName)
        : [...prev, teamName].sort()
      setForm(f => ({ ...f, team: next.join(', ') }))
      return next
    })
  }

  const saveForm = async () => {
    setSaving(true)
    const payload = {
      ...form,
      team: selectedTeams.join(', '),
    }
    try {
      if (editId) await updateProject(editId, payload)
      setShowForm(false)
      load()
    } catch {
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const delProject = async id => {
    if (!confirm('Delete this project?')) return
    try {
      await deleteProject(id)
      load()
    } catch {
      setBoard(b => b.filter(p => p.id !== id))
    }
  }

  const currentEditingProject = board.find(p => p.id === editId)
  const isEditingActive = Boolean(
    (form.actStart || form.expStart) && (form.actEnd || form.expEnd)
  )

  const currentCategory = getCategory(form.project || currentEditingProject?.project)
  const allCategoryTeams = getAllTeamsForCategory(currentCategory, board)
  const busyTeamsMap = getBusyTeamsForCategory(currentCategory, editId, board)
  const availableTeamsForEditing = allCategoryTeams.filter(t => !busyTeamsMap[t])
  const isFirstProjectInCategory = Object.keys(busyTeamsMap).length === 0

  const kpiCards = [
    {
      type: 'active',
      label: 'Active Projects',
      value: kpis.active ?? 0,
      icon: '✅',
      cls: 'c-green',
      sub: 'With start dates',
    },
    {
      type: 'pending',
      label: 'Pending Projects',
      value: kpis.pending ?? 0,
      icon: '⏳',
      cls: 'c-amber',
      sub: 'Awaiting scheduling',
    },
    {
      type: 'completed',
      label: 'Completed Projects',
      value: kpis.completed ?? 0,
      icon: '🏁',
      cls: 'c-indigo',
      sub: 'Actual end date passed',
    },
    {
      type: 'deployed',
      label: 'Deployed Slots',
      value: kpis.deployed ?? 0,
      icon: '👤',
      cls: 'c-blue',
      sub: 'Committed to active jobs',
    },
    {
      type: 'total',
      label: 'Total Workforce',
      value: kpis.total ?? 0,
      icon: '👷',
      cls: 'c-purple',
      sub: 'Team slots',
    },
    {
      type: 'idle',
      label: 'Idle / Available',
      value: kpis.idle ?? 0,
      icon: '💤',
      cls: 'c-teal',
      sub: 'In office / Standby',
    },
    {
      type: 'shortfalls',
      label: 'Shortfall Alerts',
      value: kpis.shortfalls ?? 0,
      icon: '⚠️',
      cls: (kpis.shortfalls || 0) > 0 ? 'c-red' : 'c-green',
      sub: 'Projects with 0 staff',
    },
  ]

  return (
    <div className="page">
      {/* Top Right Action Bar */}
      <div className="dashboard-top-bar">
        <button
          className="btn-export"
          onClick={() => exportDashboard(board, kpis, pools)}
          title="Export complete Dashboard summary, pools, and project table to Excel"
        >
          ⬇ Export to Excel
        </button>
      </div>

      {/* 7-Card KPI Grid (Clickable Cards that open detail popups) */}
      <div className="kpi-grid">
        {kpiCards.map(k => (
          <div
            key={k.label}
            className={`kpi-card ${k.cls}`}
            onClick={() => setKpiModalType(k.type)}
            style={{ cursor: 'pointer' }}
            title={`Click to view ${k.label} details popup`}
          >
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">
              {k.sub} <span style={{ opacity: 0.7, marginLeft: '3px' }}>↗</span>
            </div>
          </div>
        ))}
      </div>

      {/* EXECUTIVE CATEGORY WORKFORCE COMMAND CENTER (FULL WIDTH STRIPS) */}
      <div className="section">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2>Category Workforce Pool &amp; Team Deployment Status</h2>
            <div className="subtitle">
              Live deployment tracking across all {pools.length} workforce categories ({kpis.total} Total Positions • {kpis.deployed} On-Site • {kpis.idle} Office Standby)
            </div>
          </div>
          <button
            type="button"
            className="btn-action"
            onClick={() => setShowCategoryModal(true)}
            title="Manage categories, add new project codes, and assign teams"
            style={{
              fontSize: '12.5px',
              padding: '0.45rem 0.95rem',
              background: 'rgba(26, 111, 196, 0.08)',
              color: 'var(--blue)',
              borderColor: 'rgba(26, 111, 196, 0.3)',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              borderRadius: '8px',
            }}
          >
            <span>🏷️</span>
            <span>Manage Categories &amp; Teams</span>
          </button>
        </div>

        <div className="pool-command-center">
          {pools.map(p => {
            const col = categoryColors[p.category] || '#1a6fc4'
            const depPct =
              p.totalPool > 0
                ? Math.round((p.committed / p.totalPool) * 100)
                : 0
            const standbyPct = 100 - depPct

            // Find next standby team in alphabetical order
            const nextStandby = (p.teamCards || []).find(
              tc => tc.status !== 'Deployed'
            )?.name

            return (
              <div key={p.category} className="pool-strip-card">
                {/* Left Column: Category Identity, Slots, Metrics & Bar */}
                <div
                  className="pool-strip-left"
                  onClick={() =>
                    setSelectedTeam({
                      category: p.category,
                      team: '',
                      status: '',
                      activeJob: '',
                      totalSlots: p.totalPool,
                      actualStaff: (p.employees || []).filter(
                        e => e.empId !== 'Need' && !(e.nameEn || '').toLowerCase().startsWith('need')
                      ).length,
                      needSlots: (p.employees || []).filter(
                        e => e.empId === 'Need' || (e.nameEn || '').toLowerCase().startsWith('need')
                      ).length,
                      employees: p.employees || [],
                    })
                  }
                  style={{ cursor: 'pointer' }}
                  title={`Click to view all ${p.category} employees (${p.totalPool} Slots)`}
                >
                  <div className="pool-strip-cat-header">
                    <div className="pool-strip-cat-name" style={{ color: col }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: col,
                          display: 'inline-block',
                          boxShadow: `0 0 8px ${col}88`,
                        }}
                      />
                      <span>{p.category}</span>
                    </div>
                    <span className="pool-strip-cat-slots">
                      {p.totalPool} Slots
                    </span>
                  </div>

                  <div className="pool-strip-counts">
                    <div className="pool-count-chip deployed">
                      <span className="count-chip-label">🚀 Deployed</span>
                      <span className="count-chip-val">
                        <strong>{p.committed}</strong> <small>({p.committedTeams?.length || 0}T)</small>
                      </span>
                    </div>
                    <div className="pool-count-chip standby">
                      <span className="count-chip-label">🏢 Standby</span>
                      <span className="count-chip-val">
                        <strong>{p.available}</strong> <small>({p.availableTeams?.length || 0}T)</small>
                      </span>
                    </div>
                  </div>

                  <div className="pool-strip-bar">
                    <div
                      className="pool-strip-bar-deployed"
                      style={{ width: `${depPct}%`, background: col }}
                    />
                    <div
                      className="pool-strip-bar-standby"
                      style={{ width: `${standbyPct}%` }}
                    />
                  </div>
                </div>

                {/* Right Column: Alphabetical Teams Fleet Shelf */}
                <div className="pool-strip-right">
                  {(p.teamCards || []).map(tc => {
                    const isDep = tc.status === 'Deployed'
                    const isNextReady = !isDep && tc.name === nextStandby

                    return (
                      <div
                        key={tc.name}
                        className={`pool-fleet-tile ${
                          isDep ? 'deployed' : 'standby'
                        }`}
                        onClick={() =>
                          setSelectedTeam({
                            category: p.category,
                            team: tc.name,
                            status: tc.status,
                            activeJob: tc.activeJob,
                            totalSlots: tc.totalSlots,
                            actualStaff: tc.actualStaff,
                            needSlots: tc.needSlots,
                            employees: tc.employees || [],
                          })
                        }
                        style={{ cursor: 'pointer' }}
                        title={`Click to view Team ${tc.name} employee roster (${p.category})`}
                      >
                        <div className="fleet-tile-top">
                          <span className="fleet-tile-name">
                            Team {tc.name}
                          </span>
                          <span className="fleet-tile-slots">
                            {tc.totalSlots} Slots
                          </span>
                        </div>

                        <div className="fleet-tile-composition">
                          {tc.actualStaff} Staff
                        </div>

                        <div
                          className={`fleet-tile-status ${
                            isDep ? 'deployed' : 'standby'
                          }`}
                        >
                          {isDep ? (
                            <span>🚀 {tc.activeJob}</span>
                          ) : isNextReady ? (
                            <span style={{ color: '#15803d' }}>
                              ⚡ Next Ready (Office)
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>
                              🏢 In Office
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Project Assignment Board */}
      <div className="section">
        <div className="section-header">
          <div>
            <h2>Project Assignment Board</h2>
            <div className="subtitle">
              {filtered.length} of {board.length} projects displayed
            </div>
          </div>
          <div className="btn-row">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
            >
              <option value="">All Categories</option>
              {cats.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                {COLS.map(c => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key)}
                    className={`th-${c.align || 'left'} ${
                      sort.col === c.key ? 'sort-active' : ''
                    }`}
                    title={`Click to sort by ${c.label}`}
                  >
                    {c.label}
                    <span className="sort-icon">{sortArrow(c.key)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="empty-state">
                    No projects found
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id}>
                    <td className="td-center">{p.id}</td>
                    <td className="td-left">
                      <code className="job-code">
                        {p.jobCard}
                      </code>
                    </td>
                    <td className="td-left">{p.contract || '—'}</td>
                    <td className="td-left">{p.serviceOrder || '—'}</td>
                    <td className="td-left">
                      <strong style={{ color: '#1a6fc4' }}>
                        {p.project || '—'}
                      </strong>
                    </td>
                    <td className="td-left">
                      <span
                        style={{
                          fontWeight: 600,
                          color: categoryColors[p.category] || '#1a1f2e',
                        }}
                      >
                        {p.category}
                      </span>
                    </td>
                    <td className="td-center">
                      <span
                        style={{
                          fontWeight: 600,
                          padding: '2px 8px',
                          background: 'rgba(26, 111, 196, 0.08)',
                          borderRadius: '6px',
                          color: '#1a6fc4',
                          fontSize: '11.5px',
                        }}
                      >
                        {p.location || '—'}
                      </span>
                    </td>
                    <td className="td-left desc-cell">{p.desc || '—'}</td>
                    <td className="td-center">{p.unit || '—'}</td>
                    <td className="td-center bold">
                      <span
                        title="Deliverables / Product Quantity"
                        style={{
                          padding: '2px 8px',
                          background: '#f1f5f9',
                          borderRadius: '6px',
                        }}
                      >
                        {p.productQty ?? p.qty ?? 0}
                      </span>
                    </td>
                    {/* Mobilization Date (Auto -5d) */}
                    <td className="td-center">
                      <span
                        style={{
                          fontSize: '12px',
                          color: p.mobDateComputed ? '#1a6fc4' : '#8a96aa',
                          fontWeight: p.mobDateComputed ? 600 : 400,
                        }}
                      >
                        {fmtDate(p.mobDateComputed || p.mobDate)}
                      </span>
                    </td>
                    <td className="td-center">{fmtDate(p.expStart)}</td>
                    <td className="td-center">{fmtDate(p.expEnd)}</td>
                    <td className="td-center">{fmtDate(p.actStart)}</td>
                    <td className="td-center">{fmtDate(p.actEnd)}</td>
                    <td className="td-left">{p.assignedTo || '—'}</td>
                    {/* Assigned Teams Pills (Alphabetical) */}
                    <td className="td-left">
                      {p.assignedTeams && p.assignedTeams.length > 0 ? (
                        <div
                          style={{
                            display: 'flex',
                            gap: '4px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {[...p.assignedTeams].sort().map(t => (
                            <span
                              key={t}
                              style={{
                                padding: '2px 7px',
                                borderRadius: '12px',
                                background:
                                  categoryColors[p.category] || '#1a6fc4',
                                color: '#ffffff',
                                fontSize: '10.5px',
                                fontWeight: 700,
                              }}
                            >
                              Team {t}
                            </span>
                          ))}
                        </div>
                      ) : p.team ? (
                        <span
                          style={{
                            padding: '2px 7px',
                            borderRadius: '12px',
                            background: '#eff6ff',
                            color: '#1a6fc4',
                            fontSize: '11px',
                            fontWeight: 700,
                            border: '1px solid #bfdbfe',
                          }}
                        >
                          Team {p.team.replace(/team/i, '').trim()}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="td-left">{p.remarks || '—'}</td>
                    <td className="td-center">
                      <span
                        className={`badge badge-${p.status?.toLowerCase()}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    {/* Assigned Headcount Slots */}
                    <td className="td-center">
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            p.assignedHeadcount > 0 ? '#1a6fc4' : '#8a96aa',
                        }}
                      >
                        {p.assignedHeadcount > 0
                          ? `${p.assignedHeadcount} slots`
                          : '—'}
                      </span>
                    </td>
                    {/* View Assigned Employees Button */}
                    <td className="td-center">
                      {p.assignedHeadcount > 0 ? (
                        <button
                          className="btn-assigned"
                          onClick={() =>
                            setAssigned({
                              id: p.id,
                              name: `${p.jobCard} · ${p.project} (${p.category}) - Teams: ${[
                                ...(p.assignedTeams || []),
                              ]
                                .sort()
                                .join(', ')}`,
                            })
                          }
                          title="Click to view full roster"
                        >
                          👥 {p.assignedHeadcount} Roster (View)
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Project & Team Allocation Modal */}
      {showForm && currentEditingProject && (
        <div className="modal-overlay open">
          <div className="glass-modal">
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  Edit Project: {form.jobCard || currentEditingProject.jobCard}
                </h3>
                <span
                  style={{
                    fontSize: '12px',
                    color: categoryColors[currentEditingProject.category],
                    fontWeight: 600,
                  }}
                >
                  Category: {currentEditingProject.category}
                </span>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowForm(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div
                className={`date-info-banner ${
                  isEditingActive ? 'banner-active' : 'banner-pending'
                }`}
              >
                {isEditingActive
                  ? '✅ Active Project — Start & End dates populated. 1 team auto-assigned in alphabetical order.'
                  : '📅 Pending Project — Input Start & End dates below to auto-populate Mobilization Date (-5d) and claim next available team.'}
              </div>

              {/* Dynamic Team Allocation Banner & Checkbox Grid */}
              <div
                style={{
                  marginTop: '1rem',
                  marginBottom: '1.2rem',
                  padding: '0.9rem 1.1rem',
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid rgba(26, 111, 196, 0.25)',
                  borderRadius: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <strong
                    style={{
                      fontSize: '13.5px',
                      color: '#1a365d',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    👥 Team Allocation ({currentCategory})
                  </strong>
                  {isFirstProjectInCategory ? (
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#dcfce7',
                        color: '#15803d',
                        padding: '2px 9px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      🌟 1st Project (All teams auto-assigned on Start Date)
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '2px 9px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        border: '1px solid #bfdbfe',
                      }}
                    >
                      📌 Manual Team Selection (Busy teams locked 🔒)
                    </span>
                  )}
                </div>

                <span
                  style={{
                    fontSize: '11.5px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '10px',
                  }}
                >
                  {isFirstProjectInCategory
                    ? 'Entering Expected Start Date will automatically assign all available teams to this initial project.'
                    : 'Select team(s) to assign to this project by checking the box. Already busy teams are locked.'}
                </span>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginTop: '6px',
                  }}
                >
                  {/* Render Available Teams as Checkbox Cards */}
                  {availableTeamsForEditing.map(t => {
                    const isSelected = selectedTeams.includes(t)

                    return (
                      <label
                        key={t}
                        onClick={() => toggleTeamSelection(t)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 14px',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'all 0.18s ease',
                          border: isSelected
                            ? '2px solid #1a6fc4'
                            : '1.5px solid #cbd5e1',
                          background: isSelected
                            ? '#eff6ff'
                            : '#ffffff',
                          color: isSelected
                            ? '#1e40af'
                            : '#1e293b',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '12.5px',
                          boxShadow: isSelected
                            ? '0 2px 8px rgba(26, 111, 196, 0.15)'
                            : '0 1px 3px rgba(0, 0, 0, 0.04)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{
                            cursor: 'pointer',
                            width: '15px',
                            height: '15px',
                            accentColor: '#1a6fc4',
                          }}
                        />
                        <span>Team {t}</span>
                      </label>
                    )
                  })}

                  {/* Render Occupied / Locked Teams */}
                  {Object.entries(busyTeamsMap).map(([t, jobCard]) => (
                    <div
                      key={t}
                      title={`Team ${t} is busy and locked on active project ${jobCard}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 14px',
                        borderRadius: '10px',
                        cursor: 'not-allowed',
                        userSelect: 'none',
                        border: '1.5px dashed #cbd5e1',
                        background: '#f8fafc',
                        color: '#94a3b8',
                        fontSize: '12.5px',
                        opacity: 0.85,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        disabled
                        style={{
                          cursor: 'not-allowed',
                          width: '15px',
                          height: '15px',
                        }}
                      />
                      <span>🔒 Team {t}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          padding: '1px 6px',
                          borderRadius: '8px',
                          fontWeight: 600,
                        }}
                      >
                        Busy ({jobCard})
                      </span>
                    </div>
                  ))}
                </div>

                {selectedTeams.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.8rem',
                      fontSize: '12px',
                      color: '#15803d',
                      fontWeight: 600,
                      background: '#f0fdf4',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    ✓ Assigned to this project:{' '}
                    {[...selectedTeams].sort().map(t => `Team ${t}`).join(', ')}
                  </div>
                )}
              </div>

              {/* Form Grid */}
              <div className="form-grid" style={{ marginTop: '1.2rem' }}>
                <div className="form-group">
                  <label>Job Card No</label>
                  <input
                    value={form.jobCard || ''}
                    onChange={e => setForm(f => ({ ...f, jobCard: e.target.value }))}
                    placeholder="e.g. JC-2026-001"
                  />
                </div>

                <div className="form-group">
                  <label>Contract No</label>
                  <input
                    value={form.contract || ''}
                    onChange={e => setForm(f => ({ ...f, contract: e.target.value }))}
                    placeholder="e.g. 4400020478"
                  />
                </div>

                <div className="form-group">
                  <label>Service Order No</label>
                  <input
                    value={form.serviceOrder || ''}
                    onChange={e => setForm(f => ({ ...f, serviceOrder: e.target.value }))}
                    placeholder="e.g. 8501520961"
                  />
                </div>

                {/* Project Code & Category Dropdown with Auto Team Identification */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                    <label style={{ margin: 0 }}>Project Code / Category *</label>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--blue)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      + Add New Category
                    </button>
                  </div>
                  <select
                    value={form.project || ''}
                    onChange={e => handleProjectChange(e.target.value)}
                    required
                    style={{
                      padding: '0.52rem 0.8rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(200, 210, 230, 0.8)',
                      fontSize: '13px',
                      background: '#ffffff',
                      color: 'var(--text)',
                      fontWeight: 600,
                    }}
                  >
                    <option value="" disabled>-- Select Project Code / Category --</option>
                    {getCategories().map(c => {
                      const val = c.code || c.name || c.category
                      return (
                        <option key={val} value={val}>
                          {c.name || val} ({c.code}) — {c.teams?.length || 0} Teams
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div className="form-group">
                  <label>Location (e.g. SPP, SSPP, JSPP, DPP)</label>
                  <input
                    value={form.location || ''}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. SPP"
                  />
                </div>

                <div className="form-group">
                  <label>Unit #</label>
                  <input
                    value={form.unit || ''}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="e.g. 1"
                  />
                </div>

                <div className="form-group">
                  <label>Product Deliverable Quantity</label>
                  <input
                    type="number"
                    value={form.qty || 0}
                    onChange={e =>
                      setForm(f => ({ ...f, qty: +e.target.value }))
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Assigned To</label>
                  <input
                    value={form.assignedTo || ''}
                    onChange={e =>
                      setForm(f => ({ ...f, assignedTo: e.target.value }))
                    }
                  />
                </div>

                {/* DATES WITH AUTO MOBILIZATION POPULATION */}
                <div className="form-group">
                  <label>
                    Mobilization Date{' '}
                    <span
                      style={{
                        color: '#1a6fc4',
                        fontWeight: 700,
                        fontSize: '10.5px',
                      }}
                    >
                      (Auto -5 days before start)
                    </span>
                  </label>
                  <input
                    type="date"
                    value={form.mobDate || ''}
                    onChange={e =>
                      setForm(f => ({ ...f, mobDate: e.target.value }))
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Expected Start Date</label>
                  <input
                    type="date"
                    value={form.expStart || ''}
                    onChange={e =>
                      handleStartDateChange('expStart', e.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Expected End Date</label>
                  <input
                    type="date"
                    value={form.expEnd || ''}
                    onChange={e =>
                      setForm(f => ({ ...f, expEnd: e.target.value }))
                    }
                  />
                </div>

                <div className="form-group">
                  <label>
                    Actual Start Date{' '}
                    <span
                      style={{
                        color: '#28a745',
                        fontWeight: 700,
                        fontSize: '10.5px',
                      }}
                    >
                      (Auto updates Mob Date)
                    </span>
                  </label>
                  <input
                    type="date"
                    value={form.actStart || ''}
                    onChange={e =>
                      handleStartDateChange('actStart', e.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Actual End Date</label>
                  <input
                    type="date"
                    value={form.actEnd || ''}
                    onChange={e =>
                      setForm(f => ({ ...f, actEnd: e.target.value }))
                    }
                  />
                </div>

                <div className="form-group full">
                  <label>Description</label>
                  <textarea
                    rows={2}
                    value={form.desc || ''}
                    onChange={e =>
                      setForm(f => ({ ...f, desc: e.target.value }))
                    }
                  />
                </div>

                <div className="form-group full">
                  <label>Remarks</label>
                  <input
                    value={form.remarks || ''}
                    onChange={e =>
                      setForm(f => ({ ...f, remarks: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={saveForm}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assigned Employees Popup Modal */}
      {assigned && (
        <AssignedModal
          projectId={assigned.id}
          projectName={assigned.name}
          onClose={() => setAssigned(null)}
        />
      )}

      {/* Specific Team Employee Details Modal */}
      {selectedTeam && (
        <TeamModal
          teamData={selectedTeam}
          onClose={() => setSelectedTeam(null)}
        />
      )}

      {/* KPI Detail Cards Popup Modal */}
      {kpiModalType && (
        <KpiDetailModal
          type={kpiModalType}
          kpis={kpis}
          projects={board}
          pools={pools}
          onClose={() => setKpiModalType(null)}
          onOpenRoster={assignedInfo => {
            setKpiModalType(null)
            setAssigned(assignedInfo)
          }}
        />
      )}

      {/* Project Code & Category Manager Modal */}
      {showCategoryModal && (
        <CategoryModal
          onClose={() => setShowCategoryModal(false)}
          onCategoryCreated={newCat => {
            handleProjectChange(newCat.code || newCat.name)
            setShowCategoryModal(false)
          }}
        />
      )}
    </div>
  )
}
