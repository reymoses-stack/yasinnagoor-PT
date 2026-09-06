import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  getCategories,
  saveCategories,
  addCategory,
  addTeamToCategory,
  updateCategoryTeams,
  getAllSystemTeams,
  DEFAULT_CATEGORIES,
} from '../api'
import './AssignedModal.css'

const PRESET_COLORS = [
  '#1a6fc4',
  '#6c5ce7',
  '#28a745',
  '#e08c00',
  '#00b894',
  '#4f46e5',
  '#e11d48',
  '#0891b2',
  '#d97706',
  '#7c3aed',
  '#2563eb',
]

export default function CategoryModal({ onClose, onCategoryCreated }) {
  const [categories, setCategories] = useState(getCategories)
  const [systemTeams, setSystemTeams] = useState(getAllSystemTeams)
  const [selectedCatCode, setSelectedCatCode] = useState('')
  const [editCatTeams, setEditCatTeams] = useState([])
  const [inlineNewTeam, setInlineNewTeam] = useState('')

  // New Category Creation State
  const [isAddingNewCat, setIsAddingNewCat] = useState(false)
  const [newCatCode, setNewCatCode] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#4f46e5')
  const [selectedTeamsForNewCat, setSelectedTeamsForNewCat] = useState([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [newTeamInput, setNewTeamInput] = useState('')
  const [newCatDesc, setNewCatDesc] = useState('')
  const [message, setMessage] = useState({ type: '', text: '' })

  const overlayRef = useRef()
  const dropdownRef = useRef()

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

  // Click outside to close team dropdown
  useEffect(() => {
    const handleClickOutside = e => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const refreshState = () => {
    setCategories(getCategories())
    setSystemTeams(getAllSystemTeams())
  }

  const showMsg = (text, type = 'success') => {
    setMessage({ type, text })
    setTimeout(() => setMessage({ type: '', text: '' }), 3500)
  }

  // Toggle checkbox for assigning team to new category
  const toggleTeamForNewCat = team => {
    setSelectedTeamsForNewCat(prev =>
      prev.includes(team)
        ? prev.filter(t => t !== team)
        : [...prev, team].sort()
    )
  }

  // Add brand new team to selection
  const handleAddNewTeamToNewCat = e => {
    e?.preventDefault?.()
    const t = newTeamInput.replace(/team/i, '').trim().toUpperCase()
    if (!t) {
      showMsg('Please enter a team identifier (e.g. F or Team F)', 'error')
      return
    }

    if (!selectedTeamsForNewCat.includes(t)) {
      setSelectedTeamsForNewCat(prev => [...prev, t].sort())
    }
    if (!systemTeams.includes(t)) {
      setSystemTeams(prev => [...prev, t].sort())
    }
    setNewTeamInput('')
    showMsg(`Team ${t} added and selected!`)
  }

  // Submit new category
  const handleCreateCategory = e => {
    e.preventDefault()
    const code = newCatCode.trim()
    const name = newCatName.trim() || code
    if (!code) {
      showMsg('Please enter a Project Code / Category Name', 'error')
      return
    }

    const created = addCategory({
      code,
      name,
      category: name,
      color: newCatColor,
      teams: selectedTeamsForNewCat,
      description: newCatDesc.trim(),
    })

    refreshState()
    setIsAddingNewCat(false)
    setNewCatCode('')
    setNewCatName('')
    setNewCatDesc('')
    setSelectedTeamsForNewCat([])
    showMsg(`Category & Project Code "${created.name}" created with ${created.teams.length} assigned teams!`)
    if (onCategoryCreated) onCategoryCreated(created)
  }

  // Open inline edit for an existing category
  const handleOpenEditCat = cat => {
    const catCode = cat.code || cat.category || cat.name
    if (selectedCatCode === catCode) {
      setSelectedCatCode('')
      setEditCatTeams([])
    } else {
      setSelectedCatCode(catCode)
      setEditCatTeams([...(cat.teams || [])])
      setInlineNewTeam('')
    }
  }

  const toggleEditTeamCheckbox = team => {
    setEditCatTeams(prev =>
      prev.includes(team)
        ? prev.filter(t => t !== team)
        : [...prev, team].sort()
    )
  }

  const handleSaveCategoryTeams = catCode => {
    updateCategoryTeams(catCode, editCatTeams)
    refreshState()
    setSelectedCatCode('')
    showMsg(`Teams updated for category "${catCode}"`)
  }

  const handleInlineAddNewTeam = catCode => {
    const t = inlineNewTeam.replace(/team/i, '').trim().toUpperCase()
    if (!t) {
      showMsg('Please enter a team name', 'error')
      return
    }

    if (!editCatTeams.includes(t)) {
      setEditCatTeams(prev => [...prev, t].sort())
    }
    if (!systemTeams.includes(t)) {
      setSystemTeams(prev => [...prev, t].sort())
    }
    setInlineNewTeam('')
    showMsg(`Team ${t} added to selection! Click "Save Teams" to confirm.`)
  }

  const handleDeleteCustomCat = catCode => {
    const isDefault = DEFAULT_CATEGORIES.some(
      d => d.code.toLowerCase() === catCode.toLowerCase()
    )
    if (isDefault) {
      showMsg('Standard system categories cannot be removed', 'error')
      return
    }
    if (!confirm(`Are you sure you want to delete category "${catCode}"?`)) return

    const updated = categories.filter(
      c => c.code.toLowerCase() !== catCode.toLowerCase()
    )
    saveCategories(updated)
    refreshState()
    showMsg(`Category "${catCode}" deleted`)
  }

  const handleResetToDefaults = () => {
    if (!confirm('Reset all categories to their original feed data teams?')) return
    saveCategories(DEFAULT_CATEGORIES)
    refreshState()
    showMsg('Categories reset to standard feed data teams')
  }

  return (
    <div
      className="modal-overlay open"
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{ zIndex: 1100 }}
    >
      <div className="glass-modal category-manager-modal" style={{ maxWidth: '840px', width: '92%' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🏷️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Project Code &amp; Category Manager</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginTop: '2px' }}>
                Unify project codes, add new categories, and assign teams via multi-select checkboxes
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {message.text && (
          <div
            style={{
              padding: '0.6rem 1.2rem',
              margin: '0.8rem 1.3rem 0',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: 600,
              background: message.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
              color: message.type === 'error' ? '#b91c1c' : '#15803d',
              border: `1px solid ${message.type === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
            }}
          >
            {message.type === 'error' ? '⚠️ ' : '✅ '} {message.text}
          </div>
        )}

        <div className="modal-body" style={{ maxHeight: '68vh', padding: '1.2rem' }}>
          {/* Top Header Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.2rem',
              paddingBottom: '0.8rem',
              borderBottom: '1px solid var(--glass-border-subtle)',
              flexWrap: 'wrap',
              gap: '0.6rem',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
              {categories.length} Operational Categories / Project Codes
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button
                type="button"
                className="btn-action"
                onClick={() => {
                  setIsAddingNewCat(!isAddingNewCat)
                  setSelectedCatCode('')
                }}
                style={{
                  background: isAddingNewCat ? 'rgba(239, 68, 68, 0.08)' : 'rgba(26, 111, 196, 0.1)',
                  color: isAddingNewCat ? 'var(--red)' : 'var(--blue)',
                  borderColor: isAddingNewCat ? 'rgba(239, 68, 68, 0.3)' : 'rgba(26, 111, 196, 0.3)',
                  fontWeight: 700,
                }}
              >
                {isAddingNewCat ? '✕ Close Form' : '+ Add New Category / Project Code'}
              </button>
              <button
                type="button"
                className="btn-action"
                onClick={handleResetToDefaults}
                title="Reset to original feed data"
                style={{ opacity: 0.75 }}
              >
                ↺ Restore Feed Defaults
              </button>
            </div>
          </div>

          {/* New Category Creation Box */}
          {isAddingNewCat && (
            <form
              onSubmit={handleCreateCategory}
              style={{
                background: 'rgba(255, 255, 255, 0.85)',
                border: '1.5px solid rgba(26, 111, 196, 0.35)',
                borderRadius: '12px',
                padding: '1.2rem',
                marginBottom: '1.4rem',
                boxShadow: '0 6px 20px rgba(26, 111, 196, 0.09)',
              }}
            >
              <h4 style={{ margin: '0 0 1rem 0', color: 'var(--blue)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>✨</span> Create New Category &amp; Project Code
              </h4>

              <div className="form-grid" style={{ gap: '0.85rem' }}>
                <div className="form-group">
                  <label>Project Code / Category Name *</label>
                  <input
                    type="text"
                    required
                    value={newCatCode}
                    onChange={e => {
                      setNewCatCode(e.target.value)
                      if (!newCatName) setNewCatName(e.target.value)
                    }}
                    placeholder="e.g. FABRICATION, PUMP, TURBINE"
                  />
                </div>

                <div className="form-group">
                  <label>Display Name</label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder="e.g. Fabrication &amp; Piping Works"
                  />
                </div>

                {/* ASSIGN EXISTING TEAMS: Multi-Select Dropdown with Checkboxes */}
                <div className="form-group" ref={dropdownRef} style={{ position: 'relative' }}>
                  <label>Assign Existing Teams (Dropdown Checkboxes)</label>
                  <div
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    style={{
                      padding: '0.52rem 0.8rem',
                      background: '#ffffff',
                      border: isDropdownOpen ? '1.5px solid var(--blue)' : '1px solid rgba(200, 210, 230, 0.8)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      userSelect: 'none',
                      fontSize: '13px',
                    }}
                  >
                    <span>
                      {selectedTeamsForNewCat.length > 0
                        ? `✓ ${selectedTeamsForNewCat.length} Teams Selected (${selectedTeamsForNewCat.map(t => `Team ${t}`).join(', ')})`
                        : '-- Click to select teams via checkboxes --'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      {isDropdownOpen ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Dropdown Checkboxes Panel */}
                  {isDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 200,
                        marginTop: '4px',
                        background: '#ffffff',
                        border: '1px solid rgba(26, 111, 196, 0.3)',
                        borderRadius: '10px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                        padding: '0.75rem',
                        maxHeight: '220px',
                        overflowY: 'auto',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '0.5rem',
                          paddingBottom: '0.4rem',
                          borderBottom: '1px solid #e2e8f0',
                          fontSize: '11.5px',
                        }}
                      >
                        <span style={{ fontWeight: 700, color: 'var(--text2)' }}>
                          Check teams to assign:
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedTeamsForNewCat([...systemTeams])}
                            style={{ background: 'none', border: 'none', color: 'var(--blue)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTeamsForNewCat([])}
                            style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.4rem' }}>
                        {systemTeams.map(t => {
                          const isChecked = selectedTeamsForNewCat.includes(t)
                          return (
                            <label
                              key={t}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: isChecked ? 'rgba(26, 111, 196, 0.1)' : '#f8fafc',
                                border: isChecked ? '1px solid rgba(26, 111, 196, 0.4)' : '1px solid #e2e8f0',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: isChecked ? 700 : 500,
                                color: isChecked ? '#1a6fc4' : '#334155',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleTeamForNewCat(t)}
                                style={{ cursor: 'pointer', accentColor: '#1a6fc4' }}
                              />
                              <span>Team {t}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ADD NEW TEAM INPUT OPTION */}
                <div className="form-group">
                  <label>Add Brand New Team</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      type="text"
                      value={newTeamInput}
                      onChange={e => setNewTeamInput(e.target.value)}
                      placeholder="e.g. X, Alpha, Bravo"
                      style={{ flex: 1 }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddNewTeamToNewCat()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-action"
                      onClick={handleAddNewTeamToNewCat}
                      style={{
                        background: 'rgba(26, 111, 196, 0.1)',
                        color: 'var(--blue)',
                        borderColor: 'rgba(26, 111, 196, 0.3)',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + Add Team
                    </button>
                  </div>
                </div>

                {/* Category Color Picker */}
                <div className="form-group">
                  <label>Category Color Theme</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      type="color"
                      value={newCatColor}
                      onChange={e => setNewCatColor(e.target.value)}
                      style={{ width: '36px', height: '32px', padding: '1px', cursor: 'pointer', borderRadius: '6px' }}
                    />
                    {PRESET_COLORS.map(c => (
                      <span
                        key={c}
                        onClick={() => setNewCatColor(c)}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: c,
                          cursor: 'pointer',
                          display: 'inline-block',
                          border: newCatColor === c ? '2px solid #000' : '1px solid rgba(0,0,0,0.15)',
                          transform: newCatColor === c ? 'scale(1.2)' : 'none',
                          transition: 'transform 0.15s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Scope / Description (Optional)</label>
                  <input
                    type="text"
                    value={newCatDesc}
                    onChange={e => setNewCatDesc(e.target.value)}
                    placeholder="Brief description of category..."
                  />
                </div>

                {/* SELECTED TEAMS PREVIEW FOR THIS CATEGORY */}
                <div className="form-group full" style={{ marginTop: '0.2rem' }}>
                  <label>
                    Assigned Teams for this Category ({selectedTeamsForNewCat.length} Selected):
                  </label>
                  <div
                    style={{
                      padding: '0.6rem 0.8rem',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.4rem',
                      minHeight: '38px',
                      alignItems: 'center',
                    }}
                  >
                    {selectedTeamsForNewCat.length > 0 ? (
                      selectedTeamsForNewCat.map(t => (
                        <span
                          key={t}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            background: `${newCatColor}18`,
                            color: newCatColor,
                            border: `1px solid ${newCatColor}40`,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          <span>Team {t}</span>
                          <span
                            onClick={() => toggleTeamForNewCat(t)}
                            style={{ cursor: 'pointer', opacity: 0.7, marginLeft: '2px', fontWeight: 'bold' }}
                            title="Remove team"
                          >
                            ✕
                          </span>
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                        No teams assigned yet. Use the dropdown checkboxes above or type a new team to assign.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => setIsAddingNewCat(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-action"
                  style={{ background: 'var(--blue)', color: '#fff', border: 'none', fontWeight: 700 }}
                >
                  Save Category
                </button>
              </div>
            </form>
          )}

          {/* List of Existing Categories & Teams */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {categories.map(cat => {
              const catCode = cat.code || cat.category || cat.name
              const color = cat.color || '#1a6fc4'
              const isDefault = DEFAULT_CATEGORIES.some(
                d => d.code.toLowerCase() === catCode.toLowerCase()
              )
              const isEditing = selectedCatCode === catCode

              return (
                <div
                  key={catCode}
                  style={{
                    background: 'rgba(255, 255, 255, 0.75)',
                    backdropFilter: 'blur(10px)',
                    border: `1px solid ${color}44`,
                    borderLeft: `5px solid ${color}`,
                    borderRadius: '10px',
                    padding: '0.9rem 1.1rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span
                        style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          background: color,
                          display: 'inline-block',
                          boxShadow: `0 0 8px ${color}88`,
                        }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)' }}>
                          {cat.name || catCode}{' '}
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: '999px',
                              background: `${color}18`,
                              color: color,
                              marginLeft: '6px',
                            }}
                          >
                            Code: {cat.code}
                          </span>
                        </div>
                        {cat.description && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: '2px' }}>
                            {cat.description}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn-action"
                        onClick={() => handleOpenEditCat(cat)}
                        style={{
                          fontSize: '11.5px',
                          padding: '0.35rem 0.65rem',
                          background: isEditing ? `${color}22` : 'transparent',
                          color: color,
                          borderColor: `${color}66`,
                          fontWeight: 700,
                        }}
                      >
                        {isEditing ? '✕ Cancel Edit' : '✏️ Assign / Edit Teams'}
                      </button>
                      {!isDefault && (
                        <button
                          type="button"
                          className="btn-icon del"
                          onClick={() => handleDeleteCustomCat(catCode)}
                          title="Delete custom category"
                          style={{ padding: '0.3rem 0.5rem' }}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Assigned Teams Display */}
                  {!isEditing && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                        Assigned Teams ({cat.teams?.length || 0}):
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                        {(cat.teams && cat.teams.length > 0) ? (
                          cat.teams.map(t => (
                            <span
                              key={t}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 9px',
                                background: `${color}14`,
                                color: color,
                                border: `1px solid ${color}40`,
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 700,
                              }}
                            >
                              Team {t}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic' }}>
                            No dedicated teams assigned (General pool)
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Inline Edit Teams Panel with Dropdown Checkboxes & Add New Team */}
                  {isEditing && (
                    <div
                      style={{
                        marginTop: '0.85rem',
                        padding: '0.85rem',
                        background: 'rgba(255, 255, 255, 0.9)',
                        borderRadius: '8px',
                        border: `1.5px dashed ${color}88`,
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '0.5rem' }}>
                        Check teams to assign to {cat.name || catCode}:
                      </div>

                      {/* Checkbox Grid of System Teams */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.4rem', marginBottom: '0.75rem' }}>
                        {systemTeams.map(t => {
                          const isChecked = editCatTeams.includes(t)
                          return (
                            <label
                              key={t}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: isChecked ? `${color}18` : '#f8fafc',
                                border: isChecked ? `1px solid ${color}66` : '1px solid #e2e8f0',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: isChecked ? 700 : 500,
                                color: isChecked ? color : '#334155',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleEditTeamCheckbox(t)}
                                style={{ cursor: 'pointer', accentColor: color }}
                              />
                              <span>Team {t}</span>
                            </label>
                          )
                        })}
                      </div>

                      {/* Inline Add New Team input */}
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <input
                          type="text"
                          value={inlineNewTeam}
                          onChange={e => setInlineNewTeam(e.target.value)}
                          placeholder="Or type a brand new team (e.g. N, Red)..."
                          style={{
                            flex: 1,
                            padding: '0.35rem 0.65rem',
                            fontSize: '12px',
                            border: '1px solid rgba(200, 215, 235, 0.8)',
                            borderRadius: '6px',
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleInlineAddNewTeam(catCode)
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => handleInlineAddNewTeam(catCode)}
                          style={{
                            background: 'rgba(26, 111, 196, 0.08)',
                            color: 'var(--blue)',
                            borderColor: 'rgba(26, 111, 196, 0.3)',
                            fontSize: '12px',
                            padding: '0.35rem 0.75rem',
                            fontWeight: 600,
                          }}
                        >
                          + Add Team
                        </button>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => setSelectedCatCode('')}
                          style={{ fontSize: '12px', padding: '0.35rem 0.75rem' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => handleSaveCategoryTeams(catCode)}
                          style={{
                            background: color,
                            color: '#fff',
                            border: 'none',
                            fontSize: '12px',
                            padding: '0.35rem 0.9rem',
                            fontWeight: 700,
                          }}
                        >
                          Save Teams ({editCatTeams.length})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
