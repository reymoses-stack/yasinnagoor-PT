import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Workforce from './pages/Workforce'
import BackupModal from './components/BackupModal'
import './index.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Current Projects' },
  { id: 'workforce', label: 'Workforce' },
]

function getLocalTimeData() {
  const now = new Date()

  // Date formatted: "Mon, 31 Aug 2026"
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  // Time formatted with seconds: "12:24:35 AM"
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })

  // Browser/Internet Local Timezone
  let timeZone = ''
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    timeZone = 'Local'
  }

  // Timezone Offset: e.g. "GMT+5:30"
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hours = Math.floor(Math.abs(offset) / 60)
  const mins = Math.abs(offset) % 60
  const offsetStr = `GMT${sign}${hours}${
    mins > 0 ? `:${mins < 10 ? '0' : ''}${mins}` : ''
  }`

  return { dateStr, timeStr, timeZone, offsetStr }
}

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [timeData, setTimeData] = useState(getLocalTimeData)
  const [showBackup, setShowBackup] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeData(getLocalTimeData())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="app-container">
      {/* Redesigned Dynamic Island Navbar */}
      <nav className="navbar-island">
        <div className="island-inner">
          {/* Left: Official Company Logo & Updated Website Link */}
          <div className="nav-brand">
            <a
              href="https://www.pt-tgc.com/"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}
            >
              <div className="brand-logo-container">
                <img
                  src="/PT_Logo.png"
                  alt="Pioneers Technical Logo"
                  className="brand-logo-img"
                  onError={e => {
                    e.target.onerror = null
                    e.target.src = 'https://pt-tgc.com/wp-content/uploads/2022/03/PT_Logo.png'
                  }}
                />
              </div>
              <div className="brand-details">
                <span className="brand-title">Pioneers Technical</span>
                <span className="brand-url">
                  www.pt-tgc.com ↗
                </span>
              </div>
            </a>
          </div>

          {/* Center: Dynamic Island Navigation Capsule (Without Icons) */}
          <div className="dynamic-island-capsule">
            {TABS.map(t => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                className={`island-tab-btn ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Right: Data Backup & Live Clock Panel */}
          <div className="nav-right-cluster">
            <button
              className="island-backup-btn"
              onClick={() => setShowBackup(true)}
              title="Backup & Restore Data across laptops"
            >
              <span className="backup-icon">💾</span>
              <span className="backup-text">Backup &amp; Sync</span>
            </button>

            <div className="nav-clock-panel">
              <div className="clock-badge">
                <div className="clock-time-row">
                  <span className="live-pulse-dot" title="Live Clock Active" />
                  <span>{timeData.timeStr}</span>
                </div>
                <div className="clock-date-row">
                  <span>{timeData.dateStr}</span>
                  <span>•</span>
                  <span style={{ color: '#1a6fc4', fontWeight: 600 }}>
                    {timeData.timeZone
                      ? timeData.timeZone.split('/').pop().replace(/_/g, ' ')
                      : timeData.offsetStr}{' '}
                    ({timeData.offsetStr})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Pages Container */}
      <main className="main-content">
        {tab === 'dashboard' && <Dashboard onOpenBackup={() => setShowBackup(true)} />}
        {tab === 'projects' && <Projects onOpenBackup={() => setShowBackup(true)} />}
        {tab === 'workforce' && <Workforce onOpenBackup={() => setShowBackup(true)} />}
      </main>

      {/* Backup & Multi-Device Transfer Modal */}
      {showBackup && <BackupModal onClose={() => setShowBackup(false)} />}
    </div>
  )
}

