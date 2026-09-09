import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)

    try {
      if (!email.trim() || !password.trim()) {
        throw new Error('Please enter both email and password.')
      }
      await signIn(email.trim(), password)
    } catch (err) {
      console.error('Auth error:', err)
      let msg = err.message || 'Authentication failed. Please check your credentials.'
      if (msg.includes('Invalid login credentials')) {
        msg = 'Invalid email or password. Please check your credentials and try again.'
      } else if (msg.includes('Email not confirmed')) {
        msg = 'Your email has not been confirmed yet.'
      }
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page-container">
      {/* Dynamic Background Aurora Glows */}
      <div className="login-bg-glow login-bg-glow-1" />
      <div className="login-bg-glow login-bg-glow-2" />
      <div className="login-bg-glow login-bg-glow-3" />

      {/* Main Luxury Glass Card */}
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-brand-header">
          <div className="login-logo-wrapper">
            <div className="login-logo-glow" />
            <div className="login-logo-box">
              <img
                src="/PT_Logo.png"
                alt="Pioneers Technical Logo"
                className="login-logo-img"
                onError={(e) => {
                  e.target.onerror = null
                  e.target.src = 'https://pt-tgc.com/wp-content/uploads/2022/03/PT_Logo.png'
                }}
              />
            </div>
          </div>

          <h1 className="login-title">Pioneers Technical</h1>
          <div className="login-badge-tag">
            <span className="login-badge-dot" />
            <span>Yasin Nagoor Project Management Portal</span>
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="login-alert login-alert-error">
            <span className="alert-icon">⚠️</span>
            <span className="alert-text">{errorMsg}</span>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-group">
            <label className="login-label">
              <span>Email Address</span>
            </label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">✉️</span>
              <input
                type="email"
                required
                className="login-input"
                placeholder="name@pt-tgc.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="login-input-group">
            <div className="login-label-row">
              <label className="login-label">
                <span>Password</span>
              </label>
            </div>
            <div className="login-input-wrapper">
              <span className="login-input-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="login-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-show-pw-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide Password' : 'Show Password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-submit-btn"
          >
            {loading ? (
              <span className="login-loading-spinner">
                <span className="spinner-dot" />
                <span>Authenticating...</span>
              </span>
            ) : (
              <span className="btn-content-flex">
                <span>Sign In to Dashboard</span>
                <span className="btn-arrow">→</span>
              </span>
            )}
          </button>
        </form>

        {/* Security & Live Operational Footer */}
        <div className="login-card-footer">
          <div className="login-security-pill">
            <span className="security-dot" />
            <span>Secure 256-Bit Encrypted Portal</span>
          </div>
        </div>
      </div>

      {/* Powered by The Nexus Lab Floating Badge */}
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
