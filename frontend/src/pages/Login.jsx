import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)

    try {
      if (!email.trim() || !password.trim()) {
        throw new Error('Please enter both email and password.')
      }

      if (isSignUp) {
        const data = await signUp(email.trim(), password)
        if (data?.user && !data?.session) {
          setSuccessMsg(
            'Account created! If email confirmation is enabled in Supabase, please check your inbox.'
          )
        } else {
          setSuccessMsg('Account created successfully! Logging you in...')
        }
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      console.error('Auth error:', err)
      let msg = err.message || 'Authentication failed. Please check your credentials.'
      if (msg.includes('Invalid login credentials')) {
        msg = 'Invalid email or password. If you are new, click "Create an Account" below.'
      }
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page-container">
      {/* Background Decorative Glows */}
      <div className="login-bg-glow login-bg-glow-1" />
      <div className="login-bg-glow login-bg-glow-2" />

      <div className="login-card">
        {/* Brand Header */}
        <div className="login-brand-header">
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
          <h1 className="login-title">Pioneers Technical</h1>
          <p className="login-subtitle">
            Operations &amp; Team Management Portal
          </p>
        </div>

        {/* Form Mode Selector Tabs */}
        <div className="login-mode-tabs">
          <button
            type="button"
            className={`login-mode-btn ${!isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(false)
              setErrorMsg('')
              setSuccessMsg('')
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`login-mode-btn ${isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(true)
              setErrorMsg('')
              setSuccessMsg('')
            }}
          >
            Create Account
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="login-alert login-alert-error">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="login-alert login-alert-success">
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-group">
            <label className="login-label">Email Address</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">✉️</span>
              <input
                type="email"
                required
                className="login-input"
                placeholder="admin@pt-tgc.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="login-input-group">
            <label className="login-label">Password</label>
            <div className="login-input-wrapper">
              <span className="login-input-icon">🔒</span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="login-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
              <span className="login-loading-spinner">Processing...</span>
            ) : isSignUp ? (
              'Create Account & Sign In'
            ) : (
              'Sign In to Dashboard →'
            )}
          </button>
        </form>

        <div className="login-footer-info">
          <p>
            🔒 Protected by <strong>Supabase Cloud Database &amp; Authentication</strong>.
            All project schedules and team allocations are synchronized securely in real time.
          </p>
        </div>
      </div>

      {/* Powered by The Nexus Lab floating badge */}
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
