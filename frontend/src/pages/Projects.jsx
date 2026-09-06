import { useState, useEffect, useCallback } from 'react'
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  exportProjects,
  subscribeToSupabase,
  getCategories,
  getCategory,
  getAllTeamsForCategory,
} from '../api'
import { INITIAL_DATA } from '../seedData'
import AssignedModal from '../components/AssignedModal'
import CategoryModal from '../components/CategoryModal'

function calc5DaysPrior(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() - 5)
  return d.toISOString().split('T')[0]
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

const COLS = [
  { key: 'id', label: '#', align: 'center' },
  { key: 'jobCard', label: 'Job Card No', align: 'left' },
  { key: 'contract', label: 'Contract No', align: 'left' },
  { key: 'serviceOrder', label: 'Service Order', align: 'left' },
  { key: 'project', label: 'Project Code', align: 'left' },
  { key: 'location', label: 'Location', align: 'center' },
  { key: 'desc', label: 'Description', align: 'left' },
  { key: 'unit', label: 'Unit', align: 'center' },
  { key: 'qty', label: 'Qty', align: 'center' },
  { key: 'mobDate', label: 'Mob Date (-5d)', align: 'center' },
  { key: 'expStart', label: 'Exp Start', align: 'center' },
  { key: 'expEnd', label: 'Exp End', align: 'center' },
  { key: 'actStart', label: 'Act Start', align: 'center' },
  { key: 'actEnd', label: 'Act End', align: 'center' },
  { key: 'assignedTo', label: 'Assigned To', align: 'left' },
  { key: 'team', label: 'Assigned Teams', align: 'left' },
  { key: 'remarks', label: 'Remarks', align: 'left' },
  { key: 'status', label: 'Status', align: 'center' },
  { key: 'assignedEmps', label: 'Assigned Employees', align: 'center' },
]

function getInitialProjects() {
  const todayStr = new Date().toISOString().split('T')[0]
  return (INITIAL_DATA.projects || []).map(p => {
    const s = p.actStart || p.expStart
    const actEnd = (p.actEnd || '').trim()
    let status = 'Pending'
    if (p.status === 'Completed' || (actEnd && actEnd < todayStr)) {
      status = 'Completed'
    } else if (s) {
      status = 'Active'
    }
    const computedMob = p.mobDate || calc5DaysPrior(s)
    return {
      ...p,
      status,
      mobDateComputed: computedMob,
      assignedHeadcount: status === 'Active' ? 11 : 0,
    }
  })
}

const EMPTY = {
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

export default function Projects({ onOpenBackup }) {
  const [rows, setRows] = useState(getInitialProjects)
  const [sort, setSort] = useState({ col: null, dir: 'asc' })
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [selectedTeams, setSelectedTeams] = useState([])
  const [saving, setSaving] = useState(false)
  const [assigned, setAssigned] = useState(null)

  const load = useCallback(() => {
    getProjects()
      .then(d => {
        if (d?.data && Array.isArray(d.data)) {
          setRows(d.data)
        }
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

  const filtered = rows.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (p.jobCard || '').toLowerCase().includes(q) ||
        (p.contract || '').toLowerCase().includes(q) ||
        (p.serviceOrder || '').toLowerCase().includes(q) ||
        (p.project || '').toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q) ||
        (p.desc || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (!sort.col) return 0
    let va = a[sort.col] ?? ''
    let vb = b[sort.col] ?? ''

    if (sort.col === 'startDate') {
      va = a.actStart || a.expStart || ''
      vb = b.actStart || b.expStart || ''
    } else if (sort.col === 'endDate') {
      va = a.actEnd || a.expEnd || ''
      vb = b.actEnd || b.expEnd || ''
    } else if (sort.col === 'mobDate') {
      va = a.mobDateComputed || a.mobDate || ''
      vb = b.mobDateComputed || b.mobDate || ''
    } else if (sort.col === 'qty') {
      va = a.productQty ?? a.qty ?? 0
      vb = b.productQty ?? b.qty ?? 0
    }

    if (!isNaN(+va) && !isNaN(+vb) && va !== '' && vb !== '') {
      va = +va
      vb = +vb
    } else {
      va = String(va).toLowerCase()
      vb = String(vb).toLowerCase()
    }
    return va < vb
      ? sort.dir === 'asc'
        ? -1
        : 1
      : va > vb
      ? sort.dir === 'asc'
        ? 1
        : -1
      : 0
  })

  const toggleSort = col =>
    setSort(s =>
      s.col === col
        ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    )
  const arrow = col =>
    sort.col === col ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''

  const openNew = () => {
    setForm(EMPTY)
    setEditId(null)
    setSelectedTeams([])
    setShowForm(true)
  }

  const openEdit = p => {
    const cat = p.category || getCategory(p.project)
    const allTeams = getAllTeamsForCategory(cat, rows)
    const busyMap = getBusyTeamsForCategory(cat, p.id, rows)
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
      const allTeams = getAllTeamsForCategory(cat, rows)
      const busyMap = getBusyTeamsForCategory(cat, editId, rows)
      const available = allTeams.filter(t => !busyMap[t]).sort()

      if (val && available.length > 0) {
        const isFirst = Object.keys(busyMap).length === 0
        if (isFirst) {
          // 1st project in category gets ALL available teams auto-assigned
          setSelectedTeams(available)
          updated.team = available.join(', ')
        } else if (selectedTeams.length === 0) {
          // Subsequent project gets 1st available team by default if not yet selected
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
      const allTeams = getAllTeamsForCategory(cat, rows)
      const busyMap = getBusyTeamsForCategory(cat, editId, rows)
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

  const toggleTeamSelection = t => {
    setSelectedTeams(prev => {
      const next = prev.includes(t)
        ? prev.filter(x => x !== t)
        : [...prev, t].sort()
      setForm(f => ({ ...f, team: next.join(', ') }))
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    const payload = {
      ...form,
      team: selectedTeams.join(', '),
    }
    try {
      if (editId) {
        await updateProject(editId, payload)
      } else {
        await createProject(payload)
      }
      setShowForm(false)
      load()
    } catch {
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const del = async id => {
    if (!confirm('Delete this project?')) return
    try {
      await deleteProject(id)
      load()
    } catch {
      setRows(r => r.filter(p => p.id !== id))
    }
  }

  const currentCategory = getCategory(form.project)
  const allCategoryTeams = getAllTeamsForCategory(currentCategory, rows)
  const busyTeamsMap = getBusyTeamsForCategory(currentCategory, editId, rows)
  const availableTeamsForEditing = allCategoryTeams.filter(t => !busyTeamsMap[t])
  const isFirstProjectInCategory = Object.keys(busyTeamsMap).length === 0

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2>Current Projects Directory</h2>
          <div className="subtitle">
            {rows.length} total project job cards
          </div>
        </div>
        <div className="btn-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <input
            type="text"
            placeholder="🔍 Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '0.45rem 0.8rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              background: '#f8fafc',
            }}
          />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{
              padding: '0.45rem 0.8rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              background: '#f8fafc',
            }}
          >
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
          </select>
          <button
            type="button"
            className="btn-action"
            onClick={() => setShowCategoryModal(true)}
            title="Manage categories, add new project codes, and assign teams"
            style={{
              fontSize: '12.5px',
              padding: '0.45rem 0.85rem',
              background: 'rgba(26, 111, 196, 0.08)',
              color: 'var(--blue)',
              borderColor: 'rgba(26, 111, 196, 0.3)',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              borderRadius: '8px',
            }}
          >
            <span>🏷️</span>
            <span>Manage Categories</span>
          </button>
          <button className="btn-primary" onClick={openNew}>
            ＋ Add Project
          </button>
          <button className="btn-export" onClick={() => exportProjects(rows)}>
            ⬇ Export to Excel
          </button>
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
                    sort.col === c.key ? 'sort-' + sort.dir : ''
                  }`}
                >
                  {c.label}
                  <span className="sort-icon">{arrow(c.key)}</span>
                </th>
              ))}
              <th className="th-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id}>
                <td className="td-center">{p.id}</td>
                <td className="td-left">
                  <code className="job-code">{p.jobCard}</code>
                </td>
                <td className="td-left">{p.contract || '—'}</td>
                <td className="td-left">{p.serviceOrder || '—'}</td>
                <td className="td-left">
                  <strong style={{ color: '#1a6fc4' }}>
                    {p.project || '—'}
                  </strong>
                </td>
                <td className="td-center">
                  <span
                    style={{
                      fontWeight: 600,
                      padding: '2px 6px',
                      background: 'rgba(26, 111, 196, 0.08)',
                      borderRadius: '4px',
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
                  {p.productQty ?? p.qty ?? 0}
                </td>
                <td className="td-center">
                  <span
                    style={{
                      fontSize: '12px',
                      color: '#1a6fc4',
                      fontWeight: 600,
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
                <td className="td-left">
                  {p.assignedTeams && p.assignedTeams.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        gap: '3px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {[...p.assignedTeams].sort().map(t => (
                        <span
                          key={t}
                          style={{
                            padding: '1px 6px',
                            borderRadius: '10px',
                            background: '#1a6fc4',
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
                        borderRadius: '10px',
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
                <td className="td-center">
                  {p.assignedHeadcount > 0 ? (
                    <button
                      className="btn-assigned"
                      onClick={() =>
                        setAssigned({
                          id: p.id,
                          name: `${p.jobCard} · ${p.project} (${p.category})`,
                        })
                      }
                      title="Click to view full employee assignment popup"
                    >
                      👥 {p.assignedHeadcount} Employees (View)
                    </button>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="td-center action-col">
                  <button
                    className="btn-icon"
                    onClick={() => openEdit(p)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    className="btn-icon del"
                    onClick={() => del(p.id)}
                    title="Delete"
                  >
                    🗑
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay open">
          <div
            className="glass-modal"
            style={{ maxWidth: '800px', width: '92%' }}
          >
            <div className="modal-header">
              <h3>{editId ? 'Edit Project' : 'Add New Project'}</h3>
              <button
                className="modal-close"
                onClick={() => setShowForm(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {/* Dynamic Team Allocation Banner & Checkbox Grid */}
              <div
                style={{
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

              <div className="form-grid">
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

                {/* Project Code & Category Dropdown */}
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

                {/* MOBILIZATION DATE AUTO POPULATED */}
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
                onClick={save}
                disabled={saving}
              >
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Project'}
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
