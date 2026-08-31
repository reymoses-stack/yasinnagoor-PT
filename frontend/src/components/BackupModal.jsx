import { useState, useRef, useEffect, useCallback } from 'react'
import {
  createBackupPayload,
  downloadBackupJSON,
  importBackupJSON,
  resetStoredData,
} from '../api'
import './BackupModal.css'

export default function BackupModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('export') // 'export' | 'import' | 'reset'
  const [exportStats, setExportStats] = useState(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [exportedFileName, setExportedFileName] = useState('')

  // Import State
  const [importedFile, setImportedFile] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  // Reset State
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const fileInputRef = useRef(null)
  const overlayRef = useRef(null)

  // Load current stats on mount
  useEffect(() => {
    try {
      const payload = createBackupPayload()
      setExportStats(payload)
    } catch (e) {
      console.error('Error generating backup payload:', e)
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleOverlayClick = useCallback(
    e => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose]
  )

  // --- Export Action ---
  const handleExport = () => {
    try {
      const res = downloadBackupJSON()
      setExportedFileName(res.filename)
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 5000)
    } catch (e) {
      alert('Failed to export backup: ' + e.message)
    }
  }

  // --- File Processing for Import ---
  const processFile = file => {
    setImportError('')
    setImportSuccess(false)
    setParsedData(null)

    if (!file) return
    if (!file.name.endsWith('.json')) {
      setImportError('Please select a valid JSON file (.json)')
      return
    }

    setImportedFile(file)
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text = e.target.result
        const data = JSON.parse(text)

        // Validation
        const hasProjects = Array.isArray(data.projects) || Array.isArray(data)
        const hasEmployees = Array.isArray(data.employees)

        if (!hasProjects && !hasEmployees) {
          throw new Error('This file does not contain valid Pioneer projects or workforce data.')
        }

        setParsedData(data)
      } catch (err) {
        setImportError('Invalid JSON structure: ' + err.message)
      }
    }
    reader.onerror = () => setImportError('Failed to read the selected file.')
    reader.readAsText(file)
  }

  const handleFileInputChange = e => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = e => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleDragOver = e => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = e => {
    e.preventDefault()
    setIsDragging(false)
  }

  // --- Confirm Import ---
  const handleConfirmImport = () => {
    if (!parsedData) return
    try {
      const summary = importBackupJSON(parsedData)
      setImportSummary(summary)
      setImportSuccess(true)
      // Refresh current export stats in background
      setExportStats(createBackupPayload())
    } catch (err) {
      setImportError(err.message)
    }
  }

  // --- Factory Reset ---
  const handleReset = () => {
    resetStoredData()
    setResetSuccess(true)
    setResetConfirm(false)
    setExportStats(createBackupPayload())
    setTimeout(() => {
      setResetSuccess(false)
    }, 4000)
  }

  return (
    <div className="bk-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="bk-modal">
        {/* Header */}
        <div className="bk-header">
          <div className="bk-header-left">
            <div className="bk-icon-badge">💾</div>
            <div>
              <div className="bk-title">Data Backup &amp; Multi-Device Transfer</div>
              <div className="bk-subtitle">
                Export &amp; restore your projects and workforce data across laptops
              </div>
            </div>
          </div>
          <button className="bk-close-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bk-tabs">
          <button
            className={`bk-tab-btn ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            <span>⬇</span> Export Backup (JSON)
          </button>
          <button
            className={`bk-tab-btn ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            <span>⬆</span> Import / Restore Data
          </button>
          <button
            className={`bk-tab-btn reset-tab ${activeTab === 'reset' ? 'active' : ''}`}
            onClick={() => setActiveTab('reset')}
          >
            <span>🔄</span> Factory Reset
          </button>
        </div>

        {/* Body Content */}
        <div className="bk-body">
          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div className="bk-section">
              <div className="bk-desc-box">
                <div className="bk-desc-title">📦 Portable Offline Backup</div>
                <div className="bk-desc-text">
                  Download a complete snapshot of all your Projects, Start/End dates, Mobilization timelines,
                  and Workforce allocations into a single <code>.json</code> file. You can email, send via WhatsApp, or upload this file to any other laptop.
                </div>
              </div>

              {exportStats && (
                <div className="bk-stats-grid">
                  <div className="bk-stat-card">
                    <span className="bk-stat-val">{exportStats.projects?.length || 0}</span>
                    <span className="bk-stat-lbl">Total Projects</span>
                  </div>
                  <div className="bk-stat-card">
                    <span className="bk-stat-val c-blue">{exportStats.employees?.length || 0}</span>
                    <span className="bk-stat-lbl">Workforce Records</span>
                  </div>
                  <div className="bk-stat-card">
                    <span className="bk-stat-val c-green">
                      {exportStats.metadata?.activeProjects || 0}
                    </span>
                    <span className="bk-stat-lbl">Active Projects</span>
                  </div>
                  <div className="bk-stat-card">
                    <span className="bk-stat-val">5</span>
                    <span className="bk-stat-lbl">Pool Categories</span>
                  </div>
                </div>
              )}

              {exportSuccess && (
                <div className="bk-alert success">
                  <span className="bk-alert-icon">✅</span>
                  <div>
                    <strong>Backup Downloaded Successfully!</strong>
                    <div style={{ fontSize: '12px', marginTop: '2px', color: '#166534' }}>
                      File saved: <code>{exportedFileName}</code>
                    </div>
                  </div>
                </div>
              )}

              <div className="bk-actions-row">
                <button className="bk-primary-btn" onClick={handleExport}>
                  <span>⬇</span> Download Backup File (.json)
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT */}
          {activeTab === 'import' && (
            <div className="bk-section">
              <div className="bk-desc-box">
                <div className="bk-desc-title">📥 Restore Data on this Laptop</div>
                <div className="bk-desc-text">
                  Select or drag-and-drop a previously exported <code>Pioneer_Data_Backup_*.json</code> file to restore all your projects and workforce data.
                </div>
              </div>

              {/* Dropzone */}
              <div
                className={`bk-dropzone ${isDragging ? 'dragging' : ''} ${
                  importedFile ? 'has-file' : ''
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                />
                <div className="bk-dropzone-icon">
                  {importedFile ? '📄' : '📁'}
                </div>
                <div className="bk-dropzone-text">
                  {importedFile ? (
                    <>
                      <strong>{importedFile.name}</strong>
                      <span className="bk-dropzone-sub">
                        ({Math.round(importedFile.size / 1024)} KB) • Click to change file
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>Click to browse</strong> or drag &amp; drop your backup JSON file here
                      <span className="bk-dropzone-sub">Supports .json files exported from Pioneer Technical</span>
                    </>
                  )}
                </div>
              </div>

              {/* Error Box */}
              {importError && (
                <div className="bk-alert error">
                  <span className="bk-alert-icon">⚠️</span>
                  <div>
                    <strong>Import Error:</strong> {importError}
                  </div>
                </div>
              )}

              {/* Parsed Data Preview */}
              {parsedData && !importSuccess && (
                <div className="bk-preview-box">
                  <div className="bk-preview-header">
                    <span>🔍 Backup Content Summary</span>
                    <span className="bk-preview-tag">Verified JSON</span>
                  </div>
                  <div className="bk-preview-content">
                    <div className="bk-preview-row">
                      <span>Backup Export Date:</span>
                      <strong>
                        {parsedData.formattedDate ||
                          parsedData.exportedAt ||
                          'Unknown Date'}
                      </strong>
                    </div>
                    <div className="bk-preview-row">
                      <span>Projects Found:</span>
                      <strong>
                        {Array.isArray(parsedData.projects)
                          ? parsedData.projects.length
                          : Array.isArray(parsedData)
                          ? parsedData.length
                          : 0}{' '}
                        Projects
                      </strong>
                    </div>
                    <div className="bk-preview-row">
                      <span>Workforce Records:</span>
                      <strong>
                        {Array.isArray(parsedData.employees)
                          ? parsedData.employees.length
                          : 'Not included (Retains existing)'}{' '}
                      </strong>
                    </div>
                  </div>

                  <div className="bk-actions-row" style={{ marginTop: '1rem' }}>
                    <button className="bk-primary-btn green" onClick={handleConfirmImport}>
                      <span>✔</span> Restore &amp; Overwrite Current Data
                    </button>
                  </div>
                </div>
              )}

              {/* Import Success */}
              {importSuccess && importSummary && (
                <div className="bk-alert success" style={{ padding: '1.25rem' }}>
                  <span className="bk-alert-icon" style={{ fontSize: '24px' }}>🎉</span>
                  <div>
                    <strong style={{ fontSize: '15px' }}>Data Restored Successfully!</strong>
                    <div style={{ fontSize: '13px', marginTop: '4px', color: '#166534', lineHeight: 1.5 }}>
                      • <strong>{importSummary.projectsImported}</strong> Projects loaded<br />
                      • <strong>{importSummary.employeesImported}</strong> Workforce records loaded<br />
                      All Dashboard KPIs, Project Tables, and Workforce Pools are updated and synced in realtime!
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RESET */}
          {activeTab === 'reset' && (
            <div className="bk-section">
              <div className="bk-desc-box warning">
                <div className="bk-desc-title">⚠️ Reset to Factory Default Seed Data</div>
                <div className="bk-desc-text">
                  This action will clear any custom changes made in this browser and revert all Projects and Workforce back to the original 85 Workforce records and default projects.
                </div>
              </div>

              {resetSuccess && (
                <div className="bk-alert success">
                  <span className="bk-alert-icon">✅</span>
                  <div>
                    <strong>Reset Complete!</strong> Local database has been restored to factory seed data.
                  </div>
                </div>
              )}

              <div className="bk-reset-card">
                <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '1rem' }}>
                  If you want to start fresh or remove test data, you can reset your local database anytime.
                </p>

                {!resetConfirm ? (
                  <button
                    className="bk-danger-btn"
                    onClick={() => setResetConfirm(true)}
                  >
                    <span>🔄</span> Reset to Default Data
                  </button>
                ) : (
                  <div className="bk-confirm-box">
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c' }}>
                      Are you sure? Any unsaved edits will be replaced with default seed data.
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                      <button className="bk-danger-btn" onClick={handleReset}>
                        Yes, Reset Everything
                      </button>
                      <button
                        className="bk-secondary-btn"
                        onClick={() => setResetConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bk-footer">
          <div className="bk-footer-note">
            <span>🔒</span> Data is processed locally in your browser with zero cloud storage risk.
          </div>
          <button className="bk-secondary-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
