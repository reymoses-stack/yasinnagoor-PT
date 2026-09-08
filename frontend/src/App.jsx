import { useState, useEffect } from 'react'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Workforce from './pages/Workforce'
import Login from './pages/Login'
import BackupModal from './components/BackupModal'
import { useAuth } from './context/AuthContext'
import './index.css'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Current Projects' },
  { id: 'workforce', label: 'Workforce' },
]

function getLocalTimeData() {
  const now = new Date()

  // Full date formatted: "Tue, 08 Sep 2026"
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  // Short date formatted: "08 Sep"
  const dateShort = now.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })

  // Day of week: "Tue"
  const dayName = now.toLocaleDateString('en-GB', {
    weekday: 'short',
  })

  // Time formatted with seconds in 24-hour format: "23:34:51"
  const timeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Browser/Internet Local Timezone
  let timeZone = ''
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    timeZone = 'Local'
  }

  const tzShort = timeZone ? timeZone.split('/').pop().replace(/_/g, ' ') : 'Local'

  // Timezone Offset: e.g. "GMT+5:30"
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hours = Math.floor(Math.abs(offset) / 60)
  const mins = Math.abs(offset) % 60
  const offsetStr = `GMT${sign}${hours}${
    mins > 0 ? `:${mins < 10 ? '0' : ''}${mins}` : ''
  }`

  return { dateStr, dateShort, dayName, timeStr, timeZone, tzShort, offsetStr }
}

export default function App() {
  const { user, isAuthenticated, loading, signOut } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [timeData, setTimeData] = useState(getLocalTimeData)
  const [showBackup, setShowBackup] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeData(getLocalTimeData())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="app-loading-screen">
        <div className="app-loading-box">
          <img
            src="/PT_Logo.png"
            alt="Pioneers Technical Logo"
            className="app-loading-logo"
            onError={(e) => {
              e.target.onerror = null
              e.target.src = 'https://pt-tgc.com/wp-content/uploads/2022/03/PT_Logo.png'
            }}
          />
          <div className="app-loading-spinner" />
          <p className="app-loading-text">Connecting to Pioneers Cloud Database...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

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

          {/* Center: Dynamic Island Navigation Capsule */}
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

          {/* Right: Live Operations Clock, Data Backup, User Info, Logout */}
          <div className="nav-right-cluster">
            {/* Live Operations Timestamp Capsule */}
            <div className="nav-clock-panel">
              <div
                className="clock-badge"
                title={`Live System Operations Time: ${timeData.timeStr} | ${timeData.dateStr} (${timeData.timeZone || timeData.offsetStr})`}
              >
                <div className="live-pulse-container">
                  <span className="live-pulse-dot" />
                  <span className="live-pulse-ring" />
                </div>
                <span className="clock-time-display">
                  {timeData.timeStr}
                </span>
                <div className="clock-divider" />
                <div className="clock-meta-display">
                  <span className="clock-date-text">{timeData.dateStr}</span>
                  <span className="clock-tz-text">
                    {timeData.tzShort} ({timeData.offsetStr})
                  </span>
                </div>
              </div>
            </div>

            <button
              className="island-backup-btn"
              onClick={() => setShowBackup(true)}
              title="Backup & Restore Data"
            >
              <span className="backup-icon">💾</span>
              <span className="backup-text">Backup</span>
            </button>

            {/* User Session Capsule & Sign Out */}
            <div className="nav-user-badge" title={`Signed in as: ${user?.email || 'User'}`}>
              <span className="nav-user-dot" />
              <span className="nav-user-email">
                {(user?.email || 'User').split('@')[0]}
              </span>
              <button
                className="nav-logout-btn"
                onClick={() => signOut()}
                title="Sign Out"
              >
                Sign Out
              </button>
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

      {/* Powered by The Nexus Lab Floating Bottom-Right Branding Badge */}
      <a
        href="https://www.thenexuslab.in"
        target="_blank"
        rel="noopener noreferrer"
        className="nexus-footer-badge"
        title="Powered by The Nexus Lab (www.thenexuslab.in)"
      >
        <span className="nexus-badge-dot" />
        <span className="nexus-badge-text">Powered by</span>
        <span className="nexus-badge-brand">The Nexus Lab</span>
        <span className="nexus-badge-arrow">↗</span>
      </a>
    </div>
  )
}
