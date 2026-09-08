import { createClient } from '@supabase/supabase-js'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {})

const SUPABASE_URL =
  env.VITE_SUPABASE_URL || 'https://ixdheaayfjqprerslpys.supabase.co'
const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4ZGhlYWF5ZmpxcHJlcnNscHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NTk0OTgsImV4cCI6MjEwNDQzNTQ5OH0.9v21-C1zAypyNNrGe2PcBmDHYB-fHqc6-3gyZDwWRdc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'pt_supabase_auth_token',
  },
})

export const isSupabaseConfigured = () => {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}
