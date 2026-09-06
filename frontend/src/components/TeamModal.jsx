import { useEffect, useRef, useCallback } from 'react'
import './AssignedModal.css'

export default function TeamModal({ teamData, onClose }) {
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

  if (!teamData) return null

  const isNeed = e =>
    e.empId === 'Need' || (e.nameEn || '').trim().toLowerCase().startsWith('need')

  const employees = (teamData.employees || []).slice().sort((a, b) => {
    const isNeedA = isNeed(a)
    const isNeedB = isNeed(b)
    if (isNeedA !== isNeedB) return isNeedA ? 1 : -1
    const nameA = (a.nameEn || '').trim().toLowerCase()
    const nameB = (b.nameEn || '').trim().toLowerCase()
    return nameA.localeCompare(nameB)
  })

  const isDeployed = teamData.status === 'Deployed'

  return (
    <div className="am-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="am-modal" style={{ maxWidth: '900px' }}>
        <div className="am-header">
          <div>
            <div className="am-title">
              👥 {teamData.team ? `Team ${teamData.team} Workforce Roster` : `${teamData.category} Roster`}
            </div>
            <div className="am-subtitle">
              Category: <strong>{teamData.category}</strong>
              {teamData.team ? ` • Team ${teamData.team}` : ''}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div className="am-badge">
              {teamData.totalSlots ?? employees.length} Staff
            </div>
          </div>
          <button className="am-close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="am-body">
          <div className="am-status-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <span
              className={`am-status-badge ${isDeployed ? 'active' : 'pending'}`}
            >
              {isDeployed ? '🚀 Deployed' : '🏢 In Office / Standby'}
            </span>

            {isDeployed && teamData.activeJob && (
              <span
                style={{
                  fontSize: '12px',
                  color: '#1a6fc4',
                  fontWeight: 700,
                  background: 'rgba(26, 111, 196, 0.08)',
                  padding: '2px 9px',
                  borderRadius: '8px',
                }}
              >
                Active Project: {teamData.activeJob}
              </span>
            )}
          </div>

          {employees.length === 0 ? (
            <div className="am-empty">
              No employee records assigned to this team.
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
                    <th>Job Category / Designation</th>
                    <th>Vehicle</th>
                    <th>Gate Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e, i) => {
                    return (
                      <tr key={e.id || `${e.empId}-${i}`}>
                        <td>{i + 1}</td>
                        <td>
                          <code
                            className="emp-code"
                            style={{
                              background: 'rgba(26, 111, 196, 0.1)',
                              color: '#1a6fc4',
                              fontWeight: 700,
                            }}
                          >
                            {e.empId}
                          </code>
                        </td>
                        <td className="name-en">
                          <strong>{e.nameEn}</strong>
                        </td>
                        <td className="name-ar" dir="rtl">
                          {e.nameAr || '—'}
                        </td>
                        <td className="center">
                          <strong style={{ color: '#1a6fc4' }}>
                            {e.team ? `Team ${e.team}` : '—'}
                          </strong>
                        </td>
                        <td>{e.jobCat || '—'}</td>
                        <td>
                          {e.vehicleType && e.vehicleType !== '-'
                            ? e.vehicleType
                            : '—'}
                        </td>
                        <td>
                          <span
                            className={
                              e.gatePass === 'Yes'
                                ? 'gp-yes'
                                : e.gatePass === 'No'
                                ? 'gp-no'
                                : 'gp-n/a'
                            }
                          >
                            {e.gatePass || '—'}
                          </span>
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
