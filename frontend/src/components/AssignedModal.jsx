import { useState, useEffect, useRef, useCallback } from 'react'
import { getAssigned } from '../api'
import './AssignedModal.css'

export default function AssignedModal({ projectId, projectName, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const overlayRef = useRef()

  useEffect(() => {
    setLoading(true)
    getAssigned(projectId)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [projectId])

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

  const isNeed = e =>
    e.empId === 'Need' || (e.nameEn || '').trim().toLowerCase().startsWith('need')

  return (
    <div className="am-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="am-modal" style={{ maxWidth: '850px' }}>
        <div className="am-header">
          <div>
            <div className="am-title">👥 Assigned Team Roster</div>
            <div className="am-subtitle">{projectName}</div>
          </div>
          {data && (
            <div className="am-badge">
              {data.total} Total Slots{' '}
              {data.assignedTeams?.length > 0 &&
                `(${data.assignedTeams.map(t => `Team ${t}`).join(', ')})`}
            </div>
          )}
          <button className="am-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="am-body">
          {loading && (
            <div className="am-center">
              <div className="am-spinner" />
              <p>Loading assigned team roster…</p>
            </div>
          )}
          {error && <div className="am-center am-error">⚠ {error}</div>}
          {data && !loading && (
            <>
              <div className="am-status-row">
                <span
                  className={`am-status-badge ${
                    data.status === 'Active' ? 'active' : 'pending'
                  }`}
                >
                  {data.status}
                </span>
                <span className="am-project-name">
                  {data.project?.project} · {data.category}
                </span>
                {data.assignedTeams && data.assignedTeams.length > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '12px',
                      color: '#1a6fc4',
                      fontWeight: 600,
                    }}
                  >
                    Teams Deployed:{' '}
                    {data.assignedTeams.map(t => `Team ${t}`).join(', ')}
                  </span>
                )}
              </div>

              {!data.assigned || data.assigned.length === 0 ? (
                <div className="am-empty">
                  This project is <strong>Pending</strong>. Set start &amp; end
                  dates to activate and assign teams.
                </div>
              ) : (
                <div className="am-table-wrapper">
                  <table className="am-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Emp ID</th>
                        <th>Name (English)</th>
                        <th>Name (Arabic)</th>
                        <th>Team</th>
                        <th>Job Category</th>
                        <th>Slot Type</th>
                        <th>Vehicle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.assigned.map((e, i) => {
                        const need = isNeed(e)
                        return (
                          <tr
                            key={e.id}
                            style={{
                              background: need
                                ? 'rgba(245, 158, 11, 0.06)'
                                : 'transparent',
                            }}
                          >
                            <td>{i + 1}</td>
                            <td>
                              <code
                                className="emp-code"
                                style={{
                                  background: need
                                    ? '#fef3c7'
                                    : 'rgba(26, 111, 196, 0.1)',
                                  color: need ? '#b45309' : '#1a6fc4',
                                }}
                              >
                                {e.empId}
                              </code>
                            </td>
                            <td className="name-en">
                              {need ? (
                                <strong style={{ color: '#b45309' }}>
                                  Needs (Open / Temp Slot)
                                </strong>
                              ) : (
                                e.nameEn
                              )}
                            </td>
                            <td className="name-ar" dir="rtl">
                              {need ? '—' : e.nameAr}
                            </td>
                            <td className="center">
                              <strong style={{ color: '#1a6fc4' }}>
                                Team {e.team}
                              </strong>
                            </td>
                            <td>{e.jobCat || '—'}</td>
                            <td className="center">
                              {need ? (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: '#fef3c7',
                                    color: '#b45309',
                                  }}
                                >
                                  Open Need
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: '#dcfce7',
                                    color: '#15803d',
                                  }}
                                >
                                  Permanent
                                </span>
                              )}
                            </td>
                            <td>
                              {e.vehicleType && e.vehicleType !== '-'
                                ? e.vehicleType
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
