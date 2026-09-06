import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import './AssignedModal.css'

const CATEGORY_COLORS = {
  'Expansion Joint': '#6c5ce7',
  DEMI: '#1a6fc4',
  EDG: '#28a745',
  COA: '#e08c00',
  'Oil Spill': '#00b894',
  All: '#00796b',
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

export default function KpiDetailModal({ type, kpis = {}, projects = [], pools = [], onClose, onOpenRoster }) {
  const [search, setSearch] = useState('')
  const overlayRef = useRef()

  const handleOverlayClick = useCallback(
    e => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose]
  )

  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Extract all employees from pools
  const allEmployees = useMemo(() => {
    const list = []
    const seen = new Set()
    pools.forEach(pool => {
      (pool.employees || []).forEach(emp => {
        if (!seen.has(emp.id)) {
          seen.add(emp.id)
          list.push({ ...emp, category: pool.category })
        }
      })
    })
    return list
  }, [pools])

  // Map of active team assignments to project
  const teamJobMap = useMemo(() => {
    const map = {}
    projects.forEach(p => {
      if (p.status === 'Active' && p.assignedTeams) {
        p.assignedTeams.forEach(t => {
          map[`${p.category}_${t}`] = { jobCard: p.jobCard, project: p.project }
        })
      }
    })
    return map
  }, [projects])

  // Determine modal title, icon, and data source
  const config = useMemo(() => {
    const q = search.toLowerCase().trim()

    switch (type) {
      case 'active': {
        const list = projects.filter(p => p.status === 'Active')
        const filtered = list.filter(
          p =>
            !q ||
            (p.jobCard || '').toLowerCase().includes(q) ||
            (p.project || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            (p.location || '').toLowerCase().includes(q) ||
            (p.desc || '').toLowerCase().includes(q)
        )
        return {
          title: 'Active Projects',
          subtitle: 'Projects currently running on-site with deployed teams and active dates',
          icon: '✅',
          badgeText: `${list.length} Active`,
          badgeClass: 'active',
          dataType: 'projects',
          data: filtered,
        }
      }

      case 'pending': {
        const list = projects.filter(p => p.status === 'Pending')
        const filtered = list.filter(
          p =>
            !q ||
            (p.jobCard || '').toLowerCase().includes(q) ||
            (p.project || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            (p.location || '').toLowerCase().includes(q) ||
            (p.desc || '').toLowerCase().includes(q)
        )
        return {
          title: 'Pending Projects',
          subtitle: 'Projects awaiting date scheduling and team allocation',
          icon: '⏳',
          badgeText: `${list.length} Pending`,
          badgeClass: 'pending',
          dataType: 'projects',
          data: filtered,
        }
      }

      case 'completed': {
        const list = projects.filter(p => p.status === 'Completed')
        const filtered = list.filter(
          p =>
            !q ||
            (p.jobCard || '').toLowerCase().includes(q) ||
            (p.project || '').toLowerCase().includes(q) ||
            (p.category || '').toLowerCase().includes(q) ||
            (p.location || '').toLowerCase().includes(q) ||
            (p.desc || '').toLowerCase().includes(q)
        )
        return {
          title: 'Completed Projects',
          subtitle: 'Projects whose actual end dates have passed the current live date',
          icon: '🏁',
          badgeText: `${list.length} Completed`,
          badgeClass: 'completed',
          dataType: 'projects',
          data: filtered,
        }
      }

      case 'deployed': {
        const deployedEmps = []
        projects
          .filter(p => p.status === 'Active')
          .forEach(p => {
            (p.assignedEmps || []).forEach(e => {
              deployedEmps.push({
                ...e,
                assignedJobCard: p.jobCard,
                assignedProject: p.project,
                assignedCategory: p.category,
                startDate: p.startDate,
                endDate: p.endDate,
              })
            })
          })

        const filtered = deployedEmps.filter(
          e =>
            !q ||
            (e.nameEn || '').toLowerCase().includes(q) ||
            (e.empId || '').toLowerCase().includes(q) ||
            (e.assignedJobCard || '').toLowerCase().includes(q) ||
            (e.assignedProject || '').toLowerCase().includes(q) ||
            (e.assignedCategory || '').toLowerCase().includes(q)
        )

        return {
          title: 'Deployed Workforce Slots',
          subtitle: 'Staff & temporary slots currently mobilized on active job sites',
          icon: '👤',
          badgeText: `${deployedEmps.length} Deployed Slots`,
          badgeClass: 'active',
          dataType: 'employees',
          data: filtered,
        }
      }

      case 'total': {
        const filtered = allEmployees.filter(
          e =>
            !q ||
            (e.nameEn || '').toLowerCase().includes(q) ||
            (e.nameAr || '').toLowerCase().includes(q) ||
            (e.empId || '').toLowerCase().includes(q) ||
            (e.category || '').toLowerCase().includes(q) ||
            (e.jobCat || '').toLowerCase().includes(q)
        )
        return {
          title: 'Total Workforce Directory',
          subtitle: 'All headcount positions across the 5 operational categories',
          icon: '👷',
          badgeText: `${allEmployees.length} Total Slots`,
          badgeClass: 'total',
          dataType: 'employees',
          data: filtered,
        }
      }

      case 'idle': {
        // Find employees whose category/team is NOT deployed in active jobs
        const idleEmps = []
        allEmployees.forEach(e => {
          const key = `${e.category}_${e.team}`
          const isDeployed = Boolean(teamJobMap[key])
          if (!isDeployed) {
            idleEmps.push({ ...e, status: 'In Office / Standby' })
          }
        })

        const filtered = idleEmps.filter(
          e =>
            !q ||
            (e.nameEn || '').toLowerCase().includes(q) ||
            (e.nameAr || '').toLowerCase().includes(q) ||
            (e.empId || '').toLowerCase().includes(q) ||
            (e.category || '').toLowerCase().includes(q) ||
            (e.jobCat || '').toLowerCase().includes(q)
        )

        return {
          title: 'Idle / Available Standby Fleet',
          subtitle: 'Personnel stationed in office and available for immediate mobilization',
          icon: '💤',
          badgeText: `${idleEmps.length} Standby Slots`,
          badgeClass: 'idle',
          dataType: 'employees',
          data: filtered,
        }
      }

      case 'shortfalls': {
        const list = projects.filter(p => p.status === 'Active' && p.assignedHeadcount === 0)
        const filtered = list.filter(
          p =>
            !q ||
            (p.jobCard || '').toLowerCase().includes(q) ||
            (p.project || '').toLowerCase().includes(q)
        )
        return {
          title: 'Shortfall Alerts',
          subtitle: 'Active projects that have 0 personnel assigned due to pool constraints',
          icon: '⚠️',
          badgeText: `${list.length} Shortfalls`,
          badgeClass: list.length > 0 ? 'need' : 'active',
          dataType: 'projects',
          data: filtered,
        }
      }

      default:
        return {
          title: 'Details',
          subtitle: '',
          icon: '📋',
          badgeText: '',
          badgeClass: '',
          dataType: 'projects',
          data: [],
        }
    }
  }, [type, projects, allEmployees, teamJobMap, search])

  const isNeed = e =>
    e.empId === 'Need' || (e.nameEn || '').trim().toLowerCase().startsWith('need')

  return (
    <div className="am-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="am-modal" style={{ maxWidth: '980px', width: '95%' }}>
        {/* Header (Windows / macOS Frosted Titlebar) */}
        <div className="am-header" style={{ padding: '1.1rem 1.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>{config.icon}</span>
            <div>
              <div className="am-title" style={{ fontSize: '1.15rem' }}>
                {config.title}
              </div>
              <div className="am-subtitle">{config.subtitle}</div>
            </div>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`am-status-badge ${config.badgeClass}`}>
              {config.badgeText}
            </span>
            <button className="am-close" onClick={onClose} title="Close window">
              ✕
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ padding: '0.75rem 1.4rem 0.25rem', display: 'flex', gap: '10px' }}>
          <input
            type="text"
            placeholder="🔍 Quick search in this list…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              background: '#f8fafc',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Body */}
        <div className="am-body" style={{ padding: '0.8rem 1.4rem 1.4rem' }}>
          {config.data.length === 0 ? (
            <div className="am-empty" style={{ padding: '3rem 1rem' }}>
              No records found matching your selection.
            </div>
          ) : config.dataType === 'projects' ? (
            /* PROJECT CARDS TABLE */
            <div className="am-table-wrapper">
              <table className="am-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Job Card</th>
                    <th>Contract</th>
                    <th>Service Order</th>
                    <th>Project</th>
                    <th>Category</th>
                    <th>Location</th>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Mob Date</th>
                    <th>Exp Dates</th>
                    <th>Act Dates</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                    <th>Assigned Teams</th>
                    <th>Headcount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {config.data.map((p, idx) => (
                    <tr key={p.id}>
                      <td className="center">{idx + 1}</td>
                      <td>
                        <code className="emp-code" style={{ color: '#1a6fc4' }}>
                          {p.jobCard}
                        </code>
                      </td>
                      <td>{p.contract || '—'}</td>
                      <td>{p.serviceOrder || '—'}</td>
                      <td>
                        <strong>{p.project || '—'}</strong>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 600,
                            color: CATEGORY_COLORS[p.category] || '#1a1f2e',
                          }}
                        >
                          {p.category}
                        </span>
                      </td>
                      <td>{p.location || '—'}</td>
                      <td style={{ maxWidth: '180px', whiteSpace: 'normal', fontSize: '11.5px' }}>
                        {p.desc || '—'}
                      </td>
                      <td className="center bold">
                        {p.productQty ?? p.qty ?? 0} {p.unit ? `(${p.unit})` : ''}
                      </td>
                      <td className="center" style={{ fontSize: '11.5px', color: '#1a6fc4', fontWeight: 600 }}>
                        {fmtDate(p.mobDateComputed || p.mobDate)}
                      </td>
                      <td style={{ fontSize: '11px' }}>
                        <div>{fmtDate(p.expStart)}</div>
                        <div style={{ color: '#64748b' }}>to {fmtDate(p.expEnd)}</div>
                      </td>
                      <td style={{ fontSize: '11px' }}>
                        <div>{fmtDate(p.actStart)}</div>
                        <div style={{ color: '#64748b' }}>to {fmtDate(p.actEnd)}</div>
                      </td>
                      <td style={{ fontSize: '12px' }}>{p.assignedTo || '—'}</td>
                      <td className="center">
                        <span className={`badge badge-${p.status?.toLowerCase()}`}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        {p.assignedTeams && p.assignedTeams.length > 0 ? (
                          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                            {[...p.assignedTeams].sort().map(t => (
                              <span
                                key={t}
                                style={{
                                  padding: '1px 6px',
                                  borderRadius: '8px',
                                  background: CATEGORY_COLORS[p.category] || '#1a6fc4',
                                  color: '#fff',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                }}
                              >
                                Team {t}
                              </span>
                            ))}
                          </div>
                        ) : p.team ? (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            Team {p.team}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="center">
                        <strong style={{ color: p.assignedHeadcount > 0 ? '#1a6fc4' : '#e53e3e' }}>
                          {p.assignedHeadcount} slots
                        </strong>
                      </td>
                      <td className="center">
                        {p.assignedHeadcount > 0 ? (
                          <button
                            className="btn-assigned"
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                            onClick={() => {
                              if (onOpenRoster) {
                                onOpenRoster({
                                  id: p.id,
                                  name: `${p.jobCard} · ${p.project} (${p.category})`,
                                })
                              }
                            }}
                          >
                            👥 Roster
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* EMPLOYEE / ROSTER TABLE */
            <div className="am-table-wrapper">
              <table className="am-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Emp ID</th>
                    <th>Name (English)</th>
                    <th>Name (Arabic)</th>
                    <th>Category</th>
                    <th>Team</th>
                    <th>Job Title</th>
                    <th>Slot Type</th>
                    <th>Assignment / Status</th>
                    <th>Vehicle</th>
                  </tr>
                </thead>
                <tbody>
                  {config.data.map((e, idx) => {
                    const need = isNeed(e)
                    return (
                      <tr
                        key={`${e.id}_${idx}`}
                        style={{
                          background: need ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                        }}
                      >
                        <td className="center">{idx + 1}</td>
                        <td>
                          <code
                            className="emp-code"
                            style={{
                              background: need ? '#fef3c7' : 'rgba(26, 111, 196, 0.1)',
                              color: need ? '#b45309' : '#1a6fc4',
                            }}
                          >
                            {e.empId}
                          </code>
                        </td>
                        <td className="name-en">
                          {need ? (
                            <strong style={{ color: '#b45309' }}>Needs (Open Slot)</strong>
                          ) : (
                            e.nameEn
                          )}
                        </td>
                        <td className="name-ar" dir="rtl">
                          {need ? '—' : e.nameAr || '—'}
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 600,
                              color: CATEGORY_COLORS[e.category || e.project] || '#1a1f2e',
                            }}
                          >
                            {e.category || e.project}
                          </span>
                        </td>
                        <td className="center">
                          <strong>Team {e.team || '—'}</strong>
                        </td>
                        <td>{e.jobCat || '—'}</td>
                        <td className="center">
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '10px',
                              background: need ? '#fef3c7' : '#dcfce7',
                              color: need ? '#b45309' : '#15803d',
                            }}
                          >
                            {need ? 'Open Need' : 'Permanent'}
                          </span>
                        </td>
                        <td>
                          {e.assignedJobCard ? (
                            <div>
                              <strong style={{ color: '#1a6fc4' }}>
                                🚀 {e.assignedJobCard}
                              </strong>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                {e.assignedProject}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#15803d', fontWeight: 600 }}>
                              🏢 Standby (Office)
                            </span>
                          )}
                        </td>
                        <td>
                          {e.vehicleType && e.vehicleType !== '-' ? e.vehicleType : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
