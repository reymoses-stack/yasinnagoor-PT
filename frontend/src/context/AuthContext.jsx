import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../supabase'

const AuthContext = createContext({})

const STORAGE_KEY_DEVICE_USER = 'pt_device_auth_user'

function getStoredDeviceUser() {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DEVICE_USER)
      if (stored) return JSON.parse(stored)
    } catch (e) {
      console.warn('Could not read device user from localStorage', e)
    }
  }
  return null
}

function saveStoredDeviceUser(userData) {
  if (typeof window !== 'undefined') {
    try {
      if (userData) {
        localStorage.setItem(STORAGE_KEY_DEVICE_USER, JSON.stringify(userData))
      } else {
        localStorage.removeItem(STORAGE_KEY_DEVICE_USER)
      }
    } catch (e) {
      console.warn('Could not save device user to localStorage', e)
    }
  }
}

export function AuthProvider({ children }) {
  // Initialize immediately with persistent device credentials so login is never prompted again
  const [user, setUser] = useState(getStoredDeviceUser)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(() => !getStoredDeviceUser())

  useEffect(() => {
    // 1. Check Supabase active session in background
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (currentSession?.user) {
        setSession(currentSession)
        setUser(currentSession.user)
        saveStoredDeviceUser(currentSession.user)
      }
      setLoading(false)
    }).catch(err => {
      console.warn('Supabase getSession notice:', err)
      setLoading(false)
    })

    // 2. Listen for auth changes (token refresh, sign out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.user) {
        setSession(newSession)
        setUser(newSession.user)
        saveStoredDeviceUser(newSession.user)
      } else if (_event === 'SIGNED_OUT') {
        setSession(null)
        setUser(null)
        saveStoredDeviceUser(null)
      }
      setLoading(false)
    })

    return () => subscription?.unsubscribe && subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error

    if (data?.user) {
      setUser(data.user)
      setSession(data.session)
      saveStoredDeviceUser(data.user)
    }
    return data
  }

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
    return data
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('Supabase signOut notice:', err)
    } finally {
      setUser(null)
      setSession(null)
      saveStoredDeviceUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        isAuthenticated: Boolean(user),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
