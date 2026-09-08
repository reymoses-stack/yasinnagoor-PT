import { useState, useEffect, useCallback } from 'react'
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  exportEmployees,
  subscribeToSupabase,
  getCategories,
  getAllTeamsForCategory,
  getAllSystemTeams,
} from '../api'
import { INITIAL_DATA } from '../seedData'

const COLS = [
  { key: 'id', label: 'S.No.', align: 'center' },
  { key: 'empId', label: 'EMP ID', align: 'center' },
  { key: 'nameEn', label: 'NAME (EN)', align: 'left' },
  { key: 'nameAr', label: 'NAME (AR)', align: 'left' },
  { key: 'jobCat', label: 'DESIGNATION', align: 'left' },
  { key: 'team', label: 'TEAM', align: 'center' },
  { key: 'project', label: 'CATEGORY / PROJECT', align: 'left' },
  { key: 'vehicleType', label: 'VEHICLE TYPE', align: 'center' },
  { key: 'plate', label: 'PLATE NO', align: 'center' },
  { key: 'brand', label: 'BRAND', align: 'center' },
  { key: 'secExpiry', label: 'SEC EXPIRY', align: 'center' },
  { key: 'vehicleStatus', label: 'VEHICLE STATUS', align: 'center' },
  { key: 'gatePass', label: 'GATE PASS', align: 'center' },
  { key: 'toolsBox', label: 'TOOLS BOX', align: 'center' },
]

const EMPTY = {
  empId: '',
  nameEn: '',
  nameAr: '',
  project: '',
  team: '-',
  jobCat: '',
  vehicleType: '-',
  plate: '-',
  brand: '-',
  secExpiry: '-',
  vehicleStatus: 'N/A',
  gatePass: 'N/A',
  toolsBox: '-',
}

let translateTimer = null

export default function Workforce({ onOpenBackup }) {
  const [rows, setRows] = useState(() => INITIAL_DATA.employees || [])
  const [categories, setCategories] = useState(() => getCategories())
  const [search, setSearch] = useState('')
  const [fProject, setFProject] = useState('')
  const [fTeam, setFTeam] = useState('')
  const [fType, setFType] = useState('')
  const [sort, setSort] = useState({ col: 'id', dir: 'asc' })
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [translating, setTranslating] = useState(false)

  const load = useCallback(() => {
    getEmployees()
      .then(d => {
        if (d?.data?.length) setRows(d.data)
      })
      .catch(() => {})
    setCategories(getCategories())
  }, [])

  useEffect(() => {
    load()
    const unsubscribe = subscribeToSupabase(() => load())
    const handleDataUpdate = () => {
      load()
      setCategories(getCategories())
    }
    window.addEventListener('pt_data_updated', handleDataUpdate)
    window.addEventListener('pt_categories_updated', handleDataUpdate)
    return () => {
      unsubscribe()
      window.removeEventListener('pt_data_updated', handleDataUpdate)
      window.removeEventListener('pt_categories_updated', handleDataUpdate)
    }
  }, [load])

  // Filter
  const filtered = rows.filter(e => {
    if (fProject && e.project !== fProject) return false
    if (fTeam) {
      const empTeam = (e.team || '').replace(/team/i, '').trim().toUpperCase()
      if (empTeam !== fTeam.toUpperCase()) return false
    }
    const isNeed =
      e.empId === 'Need' || e.nameEn?.toLowerCase().startsWith('need')
    if (fType === 'actual' && isNeed) return false
    if (fType === 'need' && !isNeed) return false
    if (search) {
      const q = search.toLowerCase()
      const matches =
        e.nameEn?.toLowerCase().includes(q) ||
        String(e.empId).toLowerCase().includes(q) ||
        e.jobCat?.toLowerCase().includes(q) ||
        e.team?.toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  })

  // Sort
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

  // Auto translate English Name to Arabic via MyMemory free API
  const handleNameEnChange = val => {
    setForm(f => ({ ...f, nameEn: val }))
    if (!val || val.toLowerCase().startsWith('need')) return

    clearTimeout(translateTimer)
    translateTimer = setTimeout(async () => {
      setTranslating(true)
      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
            val
          )}&langpair=en|ar`
        )
        const json = await res.json()
        const match = json?.responseData?.translatedText
        if (match && !match.toLowerCase().includes('mymemory')) {
          setForm(f => ({ ...f, nameAr: match }))
        }
      } catch (err) {
        console.warn('Translate error:', err)
      } finally {
        setTranslating(false)
      }
    }, 600)
  }

  const handleProjectChange = val => {
    const validTeams = getAllTeamsForCategory(val)
    setForm(f => {
      let nextTeam = f.team
      if (validTeams.length > 0) {
        if (!validTeams.includes(f.team) && f.team !== '-') {
          nextTeam = validTeams[0]
        }
      } else {
        nextTeam = '-'
      }
      return { ...f, project: val, team: nextTeam }
    })
  }

  const openNew = () => {
    const cats = getCategories()
    const initialProject = cats[0]?.category || cats[0]?.name || 'Expansion Joint'
    const initialTeams = getAllTeamsForCategory(initialProject)
    setForm({
      ...EMPTY,
      project: initialProject,
      team: initialTeams.length > 0 ? initialTeams[0] : '-',
    })
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = e => {
    setForm({
      empId: e.empId || '',
      nameEn: e.nameEn || '',
      nameAr: e.nameAr || '',
      project: e.project || '',
      team: e.team || '-',
      jobCat: e.jobCat || '',
      vehicleType: e.vehicleType || '-',
      plate: e.plate || '-',
      brand: e.brand || '-',
      secExpiry: e.secExpiry || '-',
      vehicleStatus: e.vehicleStatus || 'N/A',
      gatePass: e.gatePass || 'N/A',
      toolsBox: e.toolsBox || '-',
    })
    setEditId(e.id)
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (editId) {
        await updateEmployee(editId, form)
      } else {
        await createEmployee(form)
      }
      setShowForm(false)
      load()
    } catch {
      if (editId) {
        setRows(r => r.map(e => (e.id === editId ? { ...e, ...form } : e)))
      } else {
        setRows(r => [...r, { ...form, id: r.length + 1 }])
      }
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const del = async id => {
    if (confirm('Delete employee?')) {
      try {
        await deleteEmployee(id)
        load()
      } catch {
        setRows(r => r.filter(e => e.id !== id))
      }
    }
  }

  const vsClass = s =>
    s === 'Maintained'
      ? 'badge-maintained'
      : s === 'N/A'
      ? 'badge-na'
      : 'badge-not-maintained'

  const projects = [...new Set([...rows.map(e => e.project), ...categories.map(c => c.category || c.name || c.code)].filter(Boolean))].sort()
  const teams = [
    ...new Set(
      rows
        .map(e => (e.team || '').replace(/team/i, '').trim())
        .filter(t => t && t !== '-')
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  // Available categories for dropdown in modal
  const categoryOptions = Array.from(
    new Set([
      ...categories.map(c => c.category || c.name || c.code),
      ...rows.map(e => e.project),
      form.project,
    ])
  ).filter(Boolean)

  // Available teams for selected project/category in modal
  const selectedCatTeams = form.project ? getAllTeamsForCategory(form.project) : []
  const availableFormTeams = Array.from(
    new Set([
      ...(selectedCatTeams.length > 0 ? selectedCatTeams : getAllSystemTeams()),
      form.team && form.team !== '-' ? form.team : null,
    ])
  ).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return (
    <div className="page">
      <div className="section">
        <div className="section-header">
          <div>
            <h2>Workforce Directory</h2>
            <div className="subtitle">
              {filtered.length} of {rows.length} total staff &amp; position slots
            </div>
          </div>
          <div className="btn-row">
            <input
              placeholder="Search name / Emp ID / Job…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ minWidth: '220px' }}
            />
            <select
              value={fProject}
              onChange={e => setFProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={fTeam}
              onChange={e => setFTeam(e.target.value)}
            >
              <option value="">All Teams</option>
              {teams.map(t => (
                <option key={t} value={t}>
                  Team {t}
                </option>
              ))}
            </select>
            <select value={fType} onChange={e => setFType(e.target.value)}>
              <option value="">All Headcount Types</option>
              <option value="actual">Actual Workforce</option>
              <option value="need">Open Positions / Needs</option>
            </select>
            <button className="btn-primary" onClick={openNew}>
              ＋ Add Employee
            </button>
            <button className="btn-export" onClick={() => exportEmployees(rows)}>
              ⬇ Export to Excel
            </button>
          </div>
        </div>

        <div className="table-scroll-hint">
          <span>↔ Swipe horizontally to view all employee columns</span>
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
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length + 1} className="empty-state">
                    No employees found
                  </td>
                </tr>
              ) : (
                sorted.map((e, idx) => {
                  const isNeed =
                    e.empId === 'Need' ||
                    e.nameEn?.toLowerCase().startsWith('need')
                  return (
                    <tr key={e.id}>
                      <td className="td-center">{idx + 1}</td>
                      <td className="td-left">
                        {isNeed ? (
                          <span className="badge badge-need">NEED</span>
                        ) : e.empId === '-' ? (
                          <span className="muted">—</span>
                        ) : (
                          <code className="emp-code">{e.empId}</code>
                        )}
                      </td>
                      <td
                        className="td-left"
                        style={{ fontWeight: isNeed ? 400 : 600 }}
                      >
                        {e.nameEn || '—'}
                      </td>
                      <td
                        className="td-right"
                        dir="rtl"
                        style={{
                          fontSize: '12px',
                          color: '#4a5568',
                        }}
                      >
                        {e.nameAr || '—'}
                      </td>
                      <td className="td-left">
                        <strong>{e.project || '—'}</strong>
                      </td>
                      <td className="td-center bold">{e.team || '—'}</td>
                      <td className="td-left">{e.jobCat || '—'}</td>
                      <td className="td-left">
                        {e.vehicleType !== '-' ? e.vehicleType : '—'}
                      </td>
                      <td className="td-left" style={{ fontSize: '12px' }}>
                        {e.plate !== '-' ? e.plate : '—'}
                      </td>
                      <td className="td-left">
                        {e.brand !== '-' ? e.brand : '—'}
                      </td>
                      <td className="td-center">
                        {e.secExpiry !== '-' ? e.secExpiry : '—'}
                      </td>
                      <td className="td-center">
                        <span className={`badge ${vsClass(e.vehicleStatus)}`}>
                          {e.vehicleStatus}
                        </span>
                      </td>
                      <td className="td-center">{e.gatePass}</td>
                      <td className="td-left">
                        {e.toolsBox !== '-' ? e.toolsBox : '—'}
                      </td>
                      <td className="td-center action-col">
                        <button
                          className="btn-icon"
                          onClick={() => openEdit(e)}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-icon del"
                          onClick={() => del(e.id)}
                          title="Delete"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / New Employee Modal */}
      {showForm && (
        <div className="modal-overlay open">
          <div className="glass-modal">
            <div className="modal-header">
              <h3>{editId ? 'Edit Employee' : 'Add Employee'}</h3>
              <button
                className="modal-close"
                onClick={() => setShowForm(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Emp ID</label>
                  <input
                    value={form.empId}
                    onChange={e =>
                      setForm(f => ({ ...f, empId: e.target.value }))
                    }
                    placeholder="e.g. 20047 or Need"
                  />
                </div>
                <div className="form-group">
                  <label>Project / Category</label>
                  <select
                    value={form.project}
                    onChange={e => handleProjectChange(e.target.value)}
                  >
                    <option value="">-- Select Project / Category --</option>
                    {categoryOptions.map(cat => {
                      const catObj = categories.find(
                        c => c.category === cat || c.name === cat || c.code === cat
                      )
                      const desc = catObj?.description ? ` (${catObj.description})` : ''
                      return (
                        <option key={cat} value={cat}>
                          {cat}{desc}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <div className="form-group">
                  <label>Name (English)</label>
                  <input
                    value={form.nameEn}
                    onChange={e => handleNameEnChange(e.target.value)}
                    placeholder="Type in English — auto translates to Arabic"
                  />
                </div>
                <div className="form-group">
                  <label>
                    Name (Arabic){' '}
                    {translating && (
                      <span
                        style={{
                          color: '#1a6fc4',
                          fontWeight: 400,
                          fontSize: '11px',
                        }}
                      >
                        translating…
                      </span>
                    )}
                  </label>
                  <input
                    value={form.nameAr}
                    onChange={e =>
                      setForm(f => ({ ...f, nameAr: e.target.value }))
                    }
                    dir="rtl"
                    placeholder="Auto translated"
                  />
                </div>
                <div className="form-group">
                  <label>Team</label>
                  <select
                    value={form.team}
                    onChange={e =>
                      setForm(f => ({ ...f, team: e.target.value }))
                    }
                  >
                    <option value="-">— None / Unassigned ( - ) —</option>
                    {availableFormTeams.map(t => (
                      <option key={t} value={t}>
                        Team {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Job Category</label>
                  <input
                    value={form.jobCat}
                    onChange={e =>
                      setForm(f => ({ ...f, jobCat: e.target.value }))
                    }
                    placeholder="e.g. Technical, Driver, Foreman"
                  />
                </div>
                <div className="form-group">
                  <label>Vehicle Type</label>
                  <input
                    value={form.vehicleType}
                    onChange={e =>
                      setForm(f => ({ ...f, vehicleType: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Plate</label>
                  <input
                    value={form.plate}
                    onChange={e =>
                      setForm(f => ({ ...f, plate: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Brand</label>
                  <input
                    value={form.brand}
                    onChange={e =>
                      setForm(f => ({ ...f, brand: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>SEC ID Expiry Date</label>
                  <input
                    value={form.secExpiry}
                    onChange={e =>
                      setForm(f => ({ ...f, secExpiry: e.target.value }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Status Vehicle</label>
                  <select
                    value={form.vehicleStatus}
                    onChange={e =>
                      setForm(f => ({ ...f, vehicleStatus: e.target.value }))
                    }
                  >
                    <option value="N/A">N/A</option>
                    <option value="Maintained">Maintained</option>
                    <option value="Not Maintained">Not Maintained</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Gate Pass</label>
                  <select
                    value={form.gatePass}
                    onChange={e =>
                      setForm(f => ({ ...f, gatePass: e.target.value }))
                    }
                  >
                    <option value="N/A">N/A</option>
                    <option value="Valid">Valid</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
                <div className="form-group full">
                  <label>Tools Box</label>
                  <input
                    value={form.toolsBox}
                    onChange={e =>
                      setForm(f => ({ ...f, toolsBox: e.target.value }))
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
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Employee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
