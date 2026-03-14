import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'postgresql://postgres:[EvNtDRofOMNH9kAV]@db.wfhzfttltzjqtlndvice.supabase.co:5432/postgres'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_4j5IpGVu4T-vVT-gI8sM9Q_fKTWdugo'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
