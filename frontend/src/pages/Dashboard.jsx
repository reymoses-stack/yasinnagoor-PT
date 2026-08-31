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
    const c = getCategory(e.project)
    const t = (e.team || '').trim()
    if (!catTeams[c]) catTeams[c] = new Set()
    if (t && t !== '-') catTeams[c].add(t)
  })

  // Baseline team pools for all categories
  if (!catTeams['Expansion Joint'] || catTeams['Expansion Joint'].size === 0) {
    catTeams['Expansion Joint'] = new Set(['A', 'B', 'C', 'D', 'E'])
  }
  if (!catTeams['EDG'] || catTeams['EDG'].size === 0) {
    catTeams['EDG'] = new Set(['F', 'G', 'M'])
  }
  if (!catTeams['DEMI'] || catTeams['DEMI'].size === 0) {
    catTeams['DEMI'] = new Set(['I', 'K'])
  }
  if (!catTeams['COA'] || catTeams['COA'].size === 0) {
    catTeams['COA'] = new Set(['H'])
  }
  if (!catTeams['Oil Spill'] || catTeams['Oil Spill'].size === 0) {
    catTeams['Oil Spill'] = new Set(['A'])
  }

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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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
