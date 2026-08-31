import { useState, useEffect, useCallback } from 'react'
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  exportProjects,
} from '../api'
import { getStoredProjects } from '../storage'
import AssignedModal from '../components/AssignedModal'

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
  { key: 'mobDate', label: 'Mob Date', align: 'center' },
  { key: 'expStart', label: 'Exp Start', align: 'center' },
  { key: 'expEnd', label: 'Exp End', align: 'center' },
  { key: 'actStart', label: 'Act Start', align: 'center' },
  { key: 'actEnd', label: 'Act End', align: 'center' },
  { key: 'assignedTo', label: 'Assigned To', align: 'left' },
  { key: 'assignedTeams', label: 'Assigned Teams', align: 'left' },
  { key: 'remarks', label: 'Remarks', align: 'left' },
  { key: 'status', label: 'Status', align: 'center' },
  { key: 'assignedEmps', label: 'Assigned Roster', align: 'center' },
]

function getInitialProjects() {
  return (getStoredProjects() || []).map(p => {
    const s = p.actStart || p.expStart
    const status = s ? 'Active' : 'Pending'
    const computedMob = p.mobDate || calc5DaysPrior(s)
    return {
      ...p,
      status,
      mobDateComputed: computedMob,
      assignedHeadcount: status === 'Active' ? 11 : 0,
    }
  })
}

const CATEGORY_TEAMS_DEFAULT = {
  'Expansion Joint': ['A', 'B', 'C', 'D', 'E'],
  'EDG': ['F', 'G', 'M'],
  'DEMI': ['I', 'K'],
  'COA': ['H'],
  'Oil Spill': ['A'],
  'All': ['-'],
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
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [selectedTeams, setSelectedTeams] = useState([])
  const [saving, setSaving] = useState(false)
  const [assigned, setAssigned] = useState(null)

  const load = useCallback(() => {
    getProjects()
      .then(d => {
        if (d?.data?.length) setRows(d.data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const handleStorageUpdate = () => load()
    window.addEventListener('pt_storage_updated', handleStorageUpdate)
    return () => window.removeEventListener('pt_storage_updated', handleStorageUpdate)
  }, [load])

  const sorted = [...rows].sort((a, b) => {
    if (!sort.col) return 0
    let va = a[sort.col] ?? '',
      vb = b[sort.col] ?? ''
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
    const explicit = (p.team || '')
      .split(',')
      .map(t => t.replace(/team/i, '').trim())
      .filter(Boolean)

    const cat = p.category || getCategory(p.project)

    const busyOnOthers = new Set()
    const otherActive = rows.filter(
      other =>
        other.id !== p.id &&
        other.status === 'Active' &&
        (other.category || getCategory(other.project)) === cat
    )

    const allTeams = (p.allCategoryTeams && p.allCategoryTeams.length > 0)
      ? p.allCategoryTeams
      : (CATEGORY_TEAMS_DEFAULT[cat] || ['A'])

    if (otherActive.length > 0) {
      const firstActiveOther = otherActive[0]
      otherActive.forEach(other => {
        const explicitOther = (other.team || '')
          .split(',')
          .map(t => t.replace(/team/i, '').trim())
          .filter(Boolean)

        if (other === firstActiveOther) {
          if (explicitOther.length > 0 && explicitOther.length < allTeams.length) {
            explicitOther.forEach(t => busyOnOthers.add(t))
          } else {
            const baseTeam = allTeams[0] || 'A'
            busyOnOthers.add(baseTeam)
          }
        } else {
          const assigned = explicitOther.length > 0 ? explicitOther : (other.assignedTeams || [])
          assigned.forEach(t => busyOnOthers.add(t))
        }
      })
    }

    let available = allTeams.filter(t => !busyOnOthers.has(t)).sort()
    if (available.length === 0) available = allTeams

    let initialTeams = []
    const hasStart = Boolean(p.actStart || p.expStart)
    if (explicit.length > 0) {
      initialTeams = explicit.filter(t => !busyOnOthers.has(t))
      if (initialTeams.length === 0) initialTeams = explicit
    } else if (p.status === 'Active' && p.assignedTeams && p.assignedTeams.length > 0) {
      if (otherActive.length === 0) {
        initialTeams = p.assignedTeams
      } else {
        initialTeams = p.assignedTeams.filter(t => !busyOnOthers.has(t))
        if (initialTeams.length === 0) initialTeams = [p.assignedTeams[0]]
      }
    } else if (hasStart && available.length > 0) {
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

      const hasAnyStart = Boolean(updated.actStart || updated.expStart)
      if (hasAnyStart) {
        const cat = currentProject?.category || getCategory(updated.project)
        const busy = new Set()
        const otherActive = rows.filter(
          other =>
            other.id !== editId &&
            other.status === 'Active' &&
            (other.category || getCategory(other.project)) === cat
        )
        const all = (currentProject?.allCategoryTeams && currentProject.allCategoryTeams.length > 0)
          ? currentProject.allCategoryTeams
          : (CATEGORY_TEAMS_DEFAULT[cat] || ['A'])

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

        let avail = all.filter(t => !busy.has(t)).sort()
        if (avail.length === 0) avail = all
        const defaultTeams = otherActive.length === 0 ? avail : [avail[0]]
        setSelectedTeams(defaultTeams)
        updated.team = defaultTeams.join(', ')
      } else {
        setSelectedTeams([])
        updated.team = ''
      }
      return updated
    })
  }

  const setTodayStart = () => {
    const today = new Date().toISOString().split('T')[0]
    handleStartDateChange('actStart', today)
  }

  const quickStartProject = async p => {
    const today = new Date().toISOString().split('T')[0]
    const mob = calc5DaysPrior(today)
    const cat = p.category || getCategory(p.project)
    const otherActive = rows.filter(
      o => o.id !== p.id && o.status === 'Active' && (o.category || getCategory(o.project)) === cat
    )
    const all = (p.allCategoryTeams && p.allCategoryTeams.length > 0)
      ? p.allCategoryTeams
      : (CATEGORY_TEAMS_DEFAULT[cat] || ['A'])

    const busy = new Set()
    otherActive.forEach(o => {
      const explicit = (o.team || '').split(',').map(t => t.replace(/team/i, '').trim()).filter(Boolean)
      const assigned = explicit.length > 0 ? explicit : (o.assignedTeams || [])
      assigned.forEach(t => busy.add(t))
    })
    let avail = all.filter(t => !busy.has(t)).sort()
    if (avail.length === 0) avail = all
    const teamToAssign = otherActive.length === 0 ? avail.join(', ') : avail[0]

    const payload = {
      ...p,
      actStart: today,
      mobDate: mob,
      team: p.team || teamToAssign,
    }
    await updateProject(p.id, payload)
    load()
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
    const startDate = form.actStart || form.expStart
    let teamsToSave = selectedTeams
    let mobDateToSave = form.mobDate

    if (startDate && teamsToSave.length === 0) {
      teamsToSave = availableTeamsForEditing.length > 0
        ? [firstAvailableTeam]
        : (allCategoryTeams.length > 0 ? [allCategoryTeams[0]] : ['A'])
    }
    if (startDate && !mobDateToSave) {
      mobDateToSave = calc5DaysPrior(startDate)
    }

    const payload = {
      ...form,
      mobDate: mobDateToSave,
      team: teamsToSave.join(', '),
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

  const currentProject = rows.find(p => p.id === editId)
  const currentCategory = currentProject
    ? currentProject.category || getCategory(currentProject.project)
    : getCategory(form.project)

  const busyTeamsMap = {}
  if (currentProject) {
    const otherActive = rows.filter(
      p =>
        p.id !== editId &&
        p.status === 'Active' &&
        (p.category || getCategory(p.project)) === currentCategory
    )

    if (otherActive.length > 0) {
      const firstActiveOther = otherActive[0]
      const allCat = currentProject.allCategoryTeams || ['A', 'B', 'C', 'D', 'E']

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

  const allCategoryTeams = currentProject?.allCategoryTeams || [
    'A',
    'B',
    'C',
    'D',
    'E',
  ]
  const availableTeamsForEditing = allCategoryTeams.filter(
    t => !busyTeamsMap[t]
  )
  const firstAvailableTeam = availableTeamsForEditing[0]

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2>Current Projects Directory</h2>
          <div className="subtitle">
            {rows.length} total project job cards
          </div>
        </div>
        <div className="btn-row">
          <button className="btn-primary" onClick={openNew}>
            ＋ Add Project
          </button>
          <button className="btn-export" onClick={() => exportProjects(rows)}>
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
                <td className="td-center">
                  {p.expStart ? (
                    fmtDate(p.expStart)
                  ) : p.status === 'Pending' ? (
                    <span
                      onClick={() => openEdit(p)}
                      style={{
                        cursor: 'pointer',
                        fontSize: '11px',
                        color: '#64748b',
                        textDecoration: 'underline dotted',
                      }}
                      title="Click to set expected start date"
                    >
                      + Set Date
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="td-center">{fmtDate(p.expEnd)}</td>
                <td className="td-center">
                  {p.actStart ? (
                    <span style={{ fontWeight: 600, color: '#15803d' }}>
                      {fmtDate(p.actStart)}
                    </span>
                  ) : p.status === 'Pending' ? (
                    <button
                      onClick={() => quickStartProject(p)}
                      style={{
                        padding: '2px 8px',
                        background: '#eff6ff',
                        border: '1px solid #93c5fd',
                        borderRadius: '6px',
                        color: '#1d4ed8',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Click to start this project today"
                    >
                      ▶ Start
                    </button>
                  ) : (
                    '—'
                  )}
                </td>
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
                  ) : (
                    <span className="muted">{p.team || '—'}</span>
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
                  {p.status === 'Active' && p.assignedHeadcount > 0 ? (
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
                  {p.status === 'Pending' && (
                    <button
                      className="btn-icon"
                      onClick={() => quickStartProject(p)}
                      title="Start Project Today (Kick Off)"
                      style={{ background: '#dcfce7', borderColor: '#86efac' }}
                    >
                      🚀
                    </button>
                  )}
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
              {/* Team selection */}
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.8rem',
                  background: 'rgba(255, 255, 255, 0.75)',
                  border: '1px solid rgba(26, 111, 196, 0.2)',
                  borderRadius: '10px',
                }}
              >
                <strong
                  style={{
                    fontSize: '13px',
                    color: '#1a365d',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  👥 Team Allocation ({currentCategory} — Dynamic Team Allocation)
                </strong>
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    display: 'block',
                    marginBottom: '8px',
                  }}
                >
                  Select team(s) to assign to this project. Check the box for any available team.
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
                    const isNextDefault = t === firstAvailableTeam

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
                        {isNextDefault && isSelected && selectedTeams.length === 1 && (
                          <span
                            style={{
                              fontSize: '10px',
                              background: '#dbeafe',
                              color: '#1d4ed8',
                              padding: '1px 5px',
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
                        padding: '7px 14px',
                        borderRadius: '10px',
                        cursor: 'not-allowed',
                        userSelect: 'none',
                        border: '1.5px dashed #cbd5e1',
                        background: '#f8fafc',
                        color: '#94a3b8',
                        fontSize: '12.5px',
                        opacity: 0.8,
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
                    }}
                  >
                    ✓ Selected for this project:{' '}
                    {[...selectedTeams].sort().map(t => `Team ${t}`).join(', ')}
                  </div>
                )}
              </div>

              <div className="form-grid">
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
                      (Auto updates Mob Date &amp; Assigns Team)
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={form.actStart || ''}
                      onChange={e =>
                        handleStartDateChange('actStart', e.target.value)
                      }
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={setTodayStart}
                      style={{
                        padding: '8px 12px',
                        background: '#dcfce7',
                        border: '1px solid #86efac',
                        borderRadius: '8px',
                        color: '#166534',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title="Set today as actual start date to kick off project immediately"
                    >
                      ⚡ Today
                    </button>
                  </div>
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
    </div>
  )
}
