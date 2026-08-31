import { useState, useEffect, useCallback } from 'react'
import {
  getDashboard,
  updateProject,
  deleteProject,
  exportDashboard,
  resetStoredData,
} from '../api'
import { getStoredProjects, getStoredEmployees } from '../storage'
import AssignedModal from '../components/AssignedModal'

const categoryColors = {
  DEMI: '#1a6fc4',
  'Expansion Joint': '#6c5ce7',
  EDG: '#28a745',
  COA: '#e08c00',
  'Oil Spill': '#00b894',
  'Oil': '#00b894',
  All: '#00b894',
}

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

// Auto-calculate date 5 days before given date
function calc5DaysPrior(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() - 5)
  return d.toISOString().split('T')[0]
}

// Client fallback helper for initial render (all 85 positions including Needs)
function computeFallbackData() {
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
    .reduce((s, p) => s + p.assignedHeadcount, 0)
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

const fallback = computeFallbackData()

const EMPTY_PROJECT = {
  jobCard: '',
  contract: '',
  serviceOrder: '',
  project: '',
  desc: '',
  unit: '',
  qty: 0,
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

function fmtDate(d) {
  if (!d || d === '-') return '—'
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

// DEFINED COLUMNS WITH EXPLICIT ALIGNMENTS FOR PERFECT VERTICAL & HORIZONTAL LAYOUT
const COLS = [
  { key: 'id', label: 'S/NO', align: 'center' },
  { key: 'jobCard', label: 'Job Card No', align: 'left' },
  { key: 'project', label: 'Project Code', align: 'left' },
  { key: 'location', label: 'Location', align: 'center' },
  { key: 'desc', label: 'Description', align: 'left' },
  { key: 'category', label: 'Category', align: 'left' },
  { key: 'productQty', label: 'Product Qty', align: 'center' },
  { key: 'mobDate', label: 'Mob Date (-5d)', align: 'center' },
  { key: 'startDate', label: 'Start Date', align: 'center' },
  { key: 'endDate', label: 'End Date', align: 'center' },
  { key: 'status', label: 'Status', align: 'center' },
  { key: 'assignedTeams', label: 'Assigned Teams', align: 'left' },
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
  const [showForm, setShowForm] = useState(false)
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
    const handleStorageUpdate = () => load()
    window.addEventListener('pt_storage_updated', handleStorageUpdate)
    return () => window.removeEventListener('pt_storage_updated', handleStorageUpdate)
  }, [load])

  // ROBUST COLUMN SORTING
  const sorted = [...board].sort((a, b) => {
    if (!sort.col) return 0
    let va = a[sort.col]
    let vb = b[sort.col]

    if (sort.col === 'productQty') {
      va = a.productQty ?? a.qty ?? 0
      vb = b.productQty ?? b.qty ?? 0
    } else if (sort.col === 'mobDate') {
      va = a.mobDateComputed || a.mobDate || ''
      vb = b.mobDateComputed || b.mobDate || ''
    } else if (sort.col === 'startDate') {
      va = a.startDate || a.actStart || a.expStart || ''
      vb = b.startDate || b.actStart || b.expStart || ''
    } else if (sort.col === 'endDate') {
      va = a.endDate || a.actEnd || a.expEnd || ''
      vb = b.endDate || b.actEnd || b.expEnd || ''
    } else if (sort.col === 'assignedTeams') {
      va = (a.assignedTeams || []).join(', ')
      vb = (b.assignedTeams || []).join(', ')
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

  // OPEN EDIT MODAL WITH AUTOMATIC TEAM AVAILABILITY DETECTION
  const openEdit = p => {
    const explicit = (p.team || '')
      .split(',')
      .map(t => t.replace(/team/i, '').trim())
      .filter(Boolean)

    const cat = p.category || getCategory(p.project)

    // Find which teams are occupied by OTHER active projects in this category
    const busyOnOthers = new Set()
    const otherActive = board.filter(
      other =>
        other.id !== p.id &&
        other.status === 'Active' &&
        (other.category || getCategory(other.project)) === cat
    )

    const allTeams = p.allCategoryTeams || []

    if (otherActive.length > 0) {
      const firstActiveOther = otherActive[0]
      otherActive.forEach(other => {
        const explicitOther = (other.team || '')
          .split(',')
          .map(t => t.replace(/team/i, '').trim())
          .filter(Boolean)

        if (other === firstActiveOther) {
          // If the primary absorber project explicitly selected a specific subset, lock that subset
          if (explicitOther.length > 0 && explicitOther.length < allTeams.length) {
            explicitOther.forEach(t => busyOnOthers.add(t))
          } else {
            // Otherwise, lock ONLY its base team (e.g. Team A) so helper teams (B, C, D, E) remain available!
            const baseTeam = allTeams[0] || 'A'
            busyOnOthers.add(baseTeam)
          }
        } else {
          // Other active projects lock their explicitly chosen or assigned team
          const assigned = explicitOther.length > 0 ? explicitOther : (other.assignedTeams || [])
          assigned.forEach(t => busyOnOthers.add(t))
        }
      })
    }

    const available = allTeams.filter(t => !busyOnOthers.has(t)).sort()

    // Determine initial teams:
    let initialTeams = []
    if (explicit.length > 0) {
      initialTeams = explicit.filter(t => !busyOnOthers.has(t))
    } else if (p.status === 'Active' && p.assignedTeams && p.assignedTeams.length > 0) {
      if (otherActive.length === 0) {
        initialTeams = p.assignedTeams
      } else {
        initialTeams = p.assignedTeams.filter(t => !busyOnOthers.has(t))
      }
    } else if (available.length > 0) {
      // 1st project in category gets ALL available teams checked by default
      initialTeams = otherActive.length === 0 ? available : [available[0]]
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

      // If start date is provided and no team is selected, auto-assign next available team
      if (
        selectedTeams.length === 0 &&
        (updated.actStart || updated.expStart)
      ) {
        const cat =
          currentEditingProject?.category || getCategory(updated.project)
        const busy = new Set()
        const otherActive = board.filter(
          other =>
            other.id !== editId &&
            other.status === 'Active' &&
            (other.category || getCategory(other.project)) === cat
        )
        const all = currentEditingProject?.allCategoryTeams || []

        if (otherActive.length > 0) {
          const firstActiveOther = otherActive[0]
          otherActive.forEach(other => {
            const explicit = (other.team || '')
              .split(',')
              .map(t => t.replace(/team/i, '').trim())
              .filter(Boolean)
            if (other === firstActiveOther) {
              if (explicit.length > 0 && explicit.length < all.length) {
                explicit.forEach(t => busy.add(t))
              } else {
                const baseTeam = all[0] || 'A'
                busy.add(baseTeam)
              }
            } else {
              const assigned = explicit.length > 0 ? explicit : (other.assignedTeams || [])
              assigned.forEach(t => busy.add(t))
            }
          })
        }

        const avail = all.filter(t => !busy.has(t)).sort()
        if (avail.length > 0) {
          const defaultTeams = otherActive.length === 0 ? avail : [avail[0]]
          setSelectedTeams(defaultTeams)
          updated.team = defaultTeams.join(', ')
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

  const busyTeamsMap = {}
  if (currentEditingProject) {
    const cat = currentEditingProject.category || getCategory(currentEditingProject.project)
    const otherActive = board.filter(
      p =>
        p.id !== editId &&
        p.status === 'Active' &&
        (p.category || getCategory(p.project)) === cat
    )

    if (otherActive.length > 0) {
      const firstActiveOther = otherActive[0]
      const allCat = currentEditingProject.allCategoryTeams || []

      otherActive.forEach(p => {
        const explicit = (p.team || '')
          .split(',')
          .map(t => t.replace(/team/i, '').trim())
          .filter(Boolean)

        if (p === firstActiveOther) {
          if (explicit.length > 0 && explicit.length < allCat.length) {
            explicit.forEach(t => {
              busyTeamsMap[t] = p.jobCard
            })
          } else {
            const baseTeam = allCat[0] || 'A'
            busyTeamsMap[baseTeam] = p.jobCard
          }
        } else {
          const assigned = explicit.length > 0 ? explicit : (p.assignedTeams || [])
          assigned.forEach(t => {
            busyTeamsMap[t] = p.jobCard
          })
        }
      })
    }
  }

  const sortedAllTeams = currentEditingProject
    ? [...(currentEditingProject.allCategoryTeams || [])].sort()
    : []
  const availableTeamsForEditing = sortedAllTeams.filter(
    t => !busyTeamsMap[t]
  )
  const firstAvailableTeam = availableTeamsForEditing[0]

  const kpiCards = [
    {
      label: 'Active Projects',
      value: kpis.active,
      icon: '✅',
      cls: 'c-green',
      sub: 'With start date',
    },
    {
      label: 'Pending Projects',
      value: kpis.pending,
      icon: '⏳',
      cls: 'c-amber',
      sub: 'Awaiting scheduling',
    },
    {
      label: 'Deployed Slots',
      value: kpis.deployed,
      icon: '👤',
      cls: 'c-blue',
      sub: 'Committed to active jobs',
    },
    {
      label: 'Total Workforce',
      value: kpis.total,
      icon: '👷',
      cls: 'c-purple',
      sub: 'Team slots (incl. Needs)',
    },
    {
      label: 'Idle / Available',
      value: kpis.idle,
      icon: '💤',
      cls: 'c-teal',
      sub: 'In office / Standby',
    },
    {
      label: 'Shortfall Alerts',
      value: kpis.shortfalls,
      icon: '⚠️',
      cls: kpis.shortfalls > 0 ? 'c-red' : 'c-green',
      sub: 'Projects with 0 staff',
    },
  ]

  return (
    <div className="page">
      {/* 6-Card KPI Grid (Perfect 6-Column Alignment) */}
      <div className="kpi-grid">
        {kpiCards.map(k => (
          <div key={k.label} className={`kpi-card ${k.cls}`}>
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* EXECUTIVE CATEGORY WORKFORCE COMMAND CENTER (FULL WIDTH STRIPS) */}
      <div className="section">
        <div className="section-header">
          <div>
            <h2>Category Workforce Pool &amp; Team Deployment Status</h2>
            <div className="subtitle">
              Live deployment tracking across all 5 workforce categories ({kpis.total} Total Positions • {kpis.deployed} On-Site • {kpis.idle} Office Standby)
            </div>
          </div>
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
                <div className="pool-strip-left">
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
                          {tc.actualStaff} Staff • {tc.needSlots} Needs
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
            <button className="btn-export" onClick={() => exportDashboard(board, kpis)}>
              ⬇ Export to Excel
            </button>
            {onOpenBackup && (
              <button
                className="btn-export"
                style={{ background: '#0f172a', borderColor: '#334155' }}
                onClick={onOpenBackup}
                title="Backup & Restore Data (JSON)"
              >
                💾 Backup &amp; Sync
              </button>
            )}
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
                <th className="th-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 1} className="empty-state">
                    No projects found
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id}>
                    <td className="td-center">{p.id}</td>
                    <td className="td-left">
                      <code className="job-code">{p.jobCard}</code>
                    </td>
                    <td className="td-left">
                      <strong style={{ color: '#1a6fc4' }}>
                        {p.project || '—'}
                      </strong>
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
                    <td className="td-center">{fmtDate(p.startDate)}</td>
                    <td className="td-center">{fmtDate(p.endDate)}</td>
                    <td className="td-center">
                      <span
                        className={`badge badge-${p.status?.toLowerCase()}`}
                      >
                        {p.status}
                      </span>
                    </td>
                    {/* Assigned Teams Pills (Alphabetical) */}
                    <td className="td-left">
                      {p.status === 'Active' &&
                      p.assignedTeams &&
                      p.assignedTeams.length > 0 ? (
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
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    {/* Assigned Headcount Slots */}
                    <td className="td-center">
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            p.status === 'Active'
                              ? p.assignedHeadcount > 0
                                ? '#1a6fc4'
                                : '#e53e3e'
                              : '#8a96aa',
                        }}
                      >
                        {p.status === 'Active'
                          ? `${p.assignedHeadcount} slots`
                          : '—'}
                      </span>
                    </td>
                    {/* View Assigned Employees Button */}
                    <td className="td-center">
                      {p.status === 'Active' && p.assignedHeadcount > 0 ? (
                        <button
                          className="btn-assigned"
                          onClick={() =>
                            setAssigned({
                              id: p.id,
                              name: `${p.jobCard} · ${p.project} (${p.category}) - Teams: ${[
                                ...p.assignedTeams,
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
                    <td className="td-center action-col">
                      <button
                        className="btn-icon"
                        onClick={() => openEdit(p)}
                        title="Edit Project & Assign Teams"
                      >
                        ✏️
                      </button>
                      <button
                        className="btn-icon del"
                        onClick={() => delProject(p.id)}
                        title="Delete Project"
                      >
                        🗑
                      </button>
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
                  ? '✅ Active Project — Start date populated. 1 team auto-assigned in alphabetical order.'
                  : '📅 Pending Project — Input Start date below to auto-populate Mobilization Date (-5d) and claim next available team.'}
              </div>

              {/* AUTOMATIC TEAM SELECTION SECTION (ONLY AVAILABLE TEAMS IN ALPHABETICAL ORDER) */}
              <div
                style={{
                  marginTop: '1.2rem',
                  padding: '1rem',
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid rgba(26, 111, 196, 0.25)',
                  borderRadius: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.6rem',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div>
                    <strong
                      style={{
                        fontSize: '13.5px',
                        color: '#1a365d',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      👥 Team Allocation ({currentEditingProject.category})
                    </strong>
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: '#64748b',
                        display: 'block',
                        marginTop: '2px',
                      }}
                    >
                      Select team(s) to assign to this project. Check the box for any available team.
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginTop: '0.6rem',
                  }}
                >
                  {/* Render Available Teams as Checkbox Cards */}
                  {availableTeamsForEditing.map(t => {
                    const isSelected = selectedTeams.includes(t)
                    const isNextDefault = t === firstAvailableTeam

                    return (
                      <label
                        key={t}
                        onClick={() => toggleTeamSelection(t)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 16px',
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
                          fontSize: '13px',
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
                            width: '16px',
                            height: '16px',
                            accentColor: '#1a6fc4',
                          }}
                        />
                        <span>Team {t}</span>
                        {isNextDefault && isSelected && selectedTeams.length === 1 && (
                          <span
                            style={{
                              fontSize: '10px',
                              background: '#dbeafe',
                              color: '#1d4ed8',
                              padding: '1px 6px',
                              borderRadius: '8px',
                              fontWeight: 700,
                            }}
                          >
                            Default
                          </span>
                        )}
                      </label>
                    )
                  })}

                  {/* Render Occupied / Locked Teams */}
                  {Object.entries(busyTeamsMap).map(([t, jobCard]) => (
                    <div
                      key={t}
                      title={`Team ${t} is deployed on active project ${jobCard}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        borderRadius: '10px',
                        cursor: 'not-allowed',
                        userSelect: 'none',
                        border: '1.5px dashed #cbd5e1',
                        background: '#f8fafc',
                        color: '#94a3b8',
                        fontSize: '13px',
                        opacity: 0.8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        disabled
                        style={{
                          cursor: 'not-allowed',
                          width: '16px',
                          height: '16px',
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
                    }}
                  >
                    ✓ Selected for this project:{' '}
                    {[...selectedTeams].sort().map(t => `Team ${t}`).join(', ')}
                  </div>
                )}
              </div>

              {/* Form Grid */}
              <div className="form-grid" style={{ marginTop: '1.2rem' }}>
                {[
                  ['Job Card No', 'jobCard'],
                  ['Contract No', 'contract'],
                  ['Service Order No', 'serviceOrder'],
                  ['Project Code (e.g. EXJ, Demi, EDG, COA)', 'project'],
                  ['Location (e.g. SPP, SSPP, JSPP, DPP)', 'location'],
                  ['Unit #', 'unit'],
                ].map(([lbl, key]) => (
                  <div key={key} className="form-group">
                    <label>{lbl}</label>
                    <input
                      value={form[key] || ''}
                      onChange={e =>
                        setForm(f => ({ ...f, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))}

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
    </div>
  )
}
