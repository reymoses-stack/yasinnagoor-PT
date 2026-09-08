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
  checkDateOverlap,
  getBusyTeamsForCategoryAndDates,
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

const COLS = [
  { key: 'id', label: 'S.No.', align: 'center' },
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
  if (!d || d === '-' || d === '—') return '—'
  const str = String(d).trim()
  if (!str) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [yyyy, mm, dd] = str.split('-')
    return `${dd}-${mm}-${yyyy}`
  }
  try {
    const dt = new Date(str)
    if (isNaN(dt.getTime())) return str
    const dd = String(dt.getDate()).padStart(2, '0')
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const yyyy = dt.getFullYear()
    return `${dd}-${mm}-${yyyy}`
  } catch {
    return str
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

    if (sort.col === 'id') {
      const numA = Number(a.id)
      const numB = Number(b.id)
      if (!isNaN(numA) && !isNaN(numB)) {
        return sort.dir === 'asc' ? numA - numB : numB - numA
      }
      return sort.dir === 'asc'
        ? String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true, sensitivity: 'base' })
        : String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true, sensitivity: 'base' })
    } else if (sort.col === 'startDate') {
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
      return sort.dir === 'asc' ? +va - +vb : +vb - +va
    }

    const strA = String(va)
    const strB = String(vb)
    return sort.dir === 'asc'
      ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' })
      : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' })
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
    const s = (p.actStart || p.expStart || '').trim()
    const e = (p.actEnd || p.expEnd || '').trim()
    const { busyMap, overlappingProjects, available, isOverlapped } =
      getBusyTeamsForCategoryAndDates(cat, p.id, s, e, rows)

    const explicit = (p.team || '')
      .split(',')
      .map(t => t.replace(/team/i, '').trim().toUpperCase())
      .filter(Boolean)

    let initialTeams = []
    if (explicit.length > 0) {
      // Always preserve user's assigned team(s) when opening edit modal
      initialTeams = explicit
    } else if (p.assignedTeams && p.assignedTeams.length > 0) {
      initialTeams = p.assignedTeams
    } else if (s && available.length > 0) {
      const isFirst = Object.keys(busyMap).length === 0
      initialTeams = isFirst ? available : [available[0]]
    }

    const currentMob = p.mobDate || (s ? calc5DaysPrior(s) : '')

    setForm({
      jobCard: p.jobCard || '',
      contract: p.contract || '',
      serviceOrder: p.serviceOrder || '',
      project: p.project || '',
      desc: p.desc || '',
      unit: p.unit ?? '',
      qty: p.qty ?? p.productQty ?? 0,
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

  const handleDateChange = (field, val) => {
    const isStart = field === 'actStart' || field === 'expStart'
    const newMob = isStart ? calc5DaysPrior(val) : null

    const updatedForm = {
      ...form,
      [field]: val,
      ...(newMob !== null ? { mobDate: newMob } : {}),
    }

    const cat = getCategory(updatedForm.project)
    const s = (updatedForm.actStart || updatedForm.expStart || '').trim()
    const e = (updatedForm.actEnd || updatedForm.expEnd || '').trim()

    const { busyMap, available, isOverlapped } =
      getBusyTeamsForCategoryAndDates(cat, editId, s, e, rows)

    // If no teams were selected yet, auto-suggest the first free team
    let nextTeams = selectedTeams
    if (selectedTeams.length === 0 && s && available.length > 0) {
      const isFirst = Object.keys(busyMap).length === 0
      nextTeams = isFirst ? available : [available[0]]
    }

    updatedForm.team = nextTeams.join(', ')
    setSelectedTeams(nextTeams)
    setForm(updatedForm)
  }

  const handleProjectChange = val => {
    const updatedForm = { ...form, project: val }
    const cat = getCategory(val)
    const s = (updatedForm.actStart || updatedForm.expStart || '').trim()
    const e = (updatedForm.actEnd || updatedForm.expEnd || '').trim()

    const { busyMap, available, isOverlapped } =
      getBusyTeamsForCategoryAndDates(cat, editId, s, e, rows)

    let nextTeams = selectedTeams.filter(t => getAllTeamsForCategory(cat).includes(t))
    if (nextTeams.length === 0 && s && available.length > 0) {
      const isFirst = Object.keys(busyMap).length === 0
      nextTeams = isFirst ? available : [available[0]]
    }

    updatedForm.team = nextTeams.join(', ')
    setSelectedTeams(nextTeams)
    setForm(updatedForm)
  }

  const autoSuggestTeam = () => {
    const cat = getCategory(form.project)
    const s = (form.actStart || form.expStart || '').trim()
    const e = (form.actEnd || form.expEnd || '').trim()
    const { busyMap, available } = getBusyTeamsForCategoryAndDates(cat, editId, s, e, rows)
    if (available.length > 0) {
      const isFirst = Object.keys(busyMap).length === 0
      const suggested = isFirst ? available : [available[0]]
      setSelectedTeams(suggested)
      setForm(f => ({ ...f, team: suggested.join(', ') }))
    } else {
      setSelectedTeams([])
      setForm(f => ({ ...f, team: '' }))
    }
  }

  const toggleTeamSelection = t => {
    const next = selectedTeams.includes(t)
      ? selectedTeams.filter(x => x !== t)
      : [...selectedTeams, t].sort()
    setSelectedTeams(next)
    setForm(f => ({ ...f, team: next.join(', ') }))
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
  const allCategoryTeams = getAllTeamsForCategory(currentCategory)
  const formStartDate = (form.actStart || form.expStart || '').trim()
  const formEndDate = (form.actEnd || form.expEnd || '').trim()
  const {
    busyMap: busyTeamsMap,
    overlappingProjects,
    available: availableTeamsForEditing,
    isOverlapped,
  } = getBusyTeamsForCategoryAndDates(currentCategory, editId, formStartDate, formEndDate, rows)
  const isFirstProjectInCategory =
    !isOverlapped &&
    Boolean(formStartDate) &&
    Object.keys(busyTeamsMap).length === 0 &&
    availableTeamsForEditing.length > 0

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

      <div className="table-scroll-hint">
        <span>↔ Swipe horizontally to view all project columns</span>
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
                  ) : p.isOverlapped ? (
                    <span
                      title={
                        p.overlapConflicts && p.overlapConflicts.length > 0
                          ? `⚠️ Dates Overlapped: Dates overlap with active project(s) ${p.overlapConflicts.map(c => `${c.jobCard} (${fmtDate(c.startDate)} to ${fmtDate(c.endDate)})`).join(', ')}. All category teams in use.`
                          : '⚠️ Project dates overlap with another active project. No teams available.'
                      }
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: '#fff1f2',
                        color: '#be123c',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: '1px solid #fecdd3',
                        cursor: 'help',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ⚠️ Dates Overlapped
                    </span>
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
                  border: isOverlapped
                    ? '1.5px solid #ef4444'
                    : '1px solid rgba(26, 111, 196, 0.25)',
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
                  {isOverlapped ? (
                    <span
                      style={{
                        fontSize: '11px',
                        background: '#fee2e2',
                        color: '#991b1b',
                        padding: '2px 9px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        border: '1px solid #fecdd3',
                      }}
                    >
                      ⚠️ Dates Overlapped (No Team Assigned)
                    </span>
                  ) : isFirstProjectInCategory ? (
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
                        background: '#f8fafc',
                        color: '#475569',
                        padding: '2px 9px',
                        borderRadius: '12px',
                        fontWeight: 600,
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      💡 Editable Team Selection (Click any team to assign/change)
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11.5px',
                      color: '#64748b',
                    }}
                  >
                    Click any team below to assign or change. Free teams are suggested; in-use teams show current project overlap.
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={autoSuggestTeam}
                      title="Automatically find and assign the best free available team"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: '1px solid #93c5fd',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>⚡</span> Auto-Assign Free Team
                    </button>
                    {selectedTeams.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTeams([])
                          setForm(f => ({ ...f, team: '' }))
                        }}
                        title="Clear team selection"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 500,
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          color: '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Overlap Schedule Info */}
                {overlappingProjects.length > 0 && (
                  <div
                    style={{
                      padding: '8px 12px',
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      borderRadius: '8px',
                      color: '#9f1239',
                      fontSize: '11.5px',
                      marginBottom: '10px',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>📅 Active Projects in this Date Window ({fmtDate(formStartDate)} to {fmtDate(formEndDate)}):</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                      {overlappingProjects.map(op => (
                        <li key={op.id}>
                          <strong>{op.jobCard}</strong> ({fmtDate(op.startDate)} to {fmtDate(op.endDate)}) — {op.teams.map(t => `Team ${t}`).join(', ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginTop: '6px',
                  }}
                >
                  {allCategoryTeams.length === 0 ? (
                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#f8fafc',
                        border: '1.5px dashed #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#64748b',
                        width: '100%',
                      }}
                    >
                      ℹ️ No teams are configured for category <strong>{currentCategory}</strong>. (You can configure teams via Category Settings).
                    </div>
                  ) : (
                    allCategoryTeams.map(t => {
                      const isSelected = selectedTeams.includes(t)
                      const busyEntry = busyTeamsMap[t]
                      const isBusy = Boolean(busyEntry)
                      const busyJobCard = typeof busyEntry === 'object' ? busyEntry.jobCard : busyEntry
                      const busyDatesStr = typeof busyEntry === 'object' && busyEntry.startDate ? `${fmtDate(busyEntry.startDate)} to ${fmtDate(busyEntry.endDate)}` : ''

                      let border = '1.5px solid #cbd5e1'
                      let bg = '#ffffff'
                      let color = '#1e293b'
                      let boxShadow = '0 1px 3px rgba(0, 0, 0, 0.04)'

                      if (isSelected) {
                        if (isBusy) {
                          border = '2px solid #d97706'
                          bg = '#fffbeb'
                          color = '#92400e'
                          boxShadow = '0 2px 8px rgba(217, 119, 6, 0.2)'
                        } else {
                          border = '2px solid #1a6fc4'
                          bg = '#eff6ff'
                          color = '#1e40af'
                          boxShadow = '0 2px 8px rgba(26, 111, 196, 0.15)'
                        }
                      } else if (isBusy) {
                        border = '1.5px dashed #fca5a5'
                        bg = '#fff8f8'
                        color = '#64748b'
                      }

                      return (
                        <div
                          key={t}
                          onClick={() => toggleTeamSelection(t)}
                          title={isBusy ? `Team ${t} is currently in use on ${busyJobCard} (${busyDatesStr}). Click to assign or override.` : `Team ${t} is free. Click to assign.`}
                          style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            gap: '4px',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.18s ease',
                            border,
                            background: bg,
                            color,
                            boxShadow,
                            minWidth: '135px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                style={{
                                  cursor: 'pointer',
                                  width: '15px',
                                  height: '15px',
                                  accentColor: isBusy ? '#d97706' : '#1a6fc4',
                                }}
                              />
                              <span style={{ fontWeight: isSelected ? 700 : 600, fontSize: '13px' }}>
                                Team {t}
                              </span>
                            </div>
                            {isSelected && (
                              <span style={{ fontSize: '10px', fontWeight: 700, color: isBusy ? '#d97706' : '#1a6fc4' }}>
                                ✓ Selected
                              </span>
                            )}
                          </div>

                          <div style={{ marginTop: '2px' }}>
                            {isBusy ? (
                              <span
                                style={{
                                  fontSize: '10px',
                                  background: '#fee2e2',
                                  color: '#991b1b',
                                  padding: '1px 6px',
                                  borderRadius: '6px',
                                  fontWeight: 600,
                                  display: 'inline-block',
                                }}
                              >
                                ⚠️ In Use: {busyJobCard}
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '10px',
                                  background: '#dcfce7',
                                  color: '#166534',
                                  padding: '1px 6px',
                                  borderRadius: '6px',
                                  fontWeight: 600,
                                  display: 'inline-block',
                                }}
                              >
                                ✓ Free &amp; Available
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
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
                    {selectedTeams.some(t => busyTeamsMap[t]) && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: '#b45309', fontWeight: 500 }}>
                        ⚠️ Notice: One or more selected teams overlap with another project schedule. Saving will assign this team as requested.
                      </div>
                    )}
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
                      handleDateChange('expStart', e.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Expected End Date</label>
                  <input
                    type="date"
                    value={form.expEnd || ''}
                    onChange={e =>
                      handleDateChange('expEnd', e.target.value)
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
                      handleDateChange('actStart', e.target.value)
                    }
                  />
                </div>

                <div className="form-group">
                  <label>Actual End Date</label>
                  <input
                    type="date"
                    value={form.actEnd || ''}
                    onChange={e =>
                      handleDateChange('actEnd', e.target.value)
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
