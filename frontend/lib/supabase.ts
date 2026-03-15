import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

if (supabaseUrl === undefined) {
  throw new Error("Supabase URL is not defined")
}
if (supabaseKey === undefined) {
  throw new Error("Supabase key is not defined")
}


export const supabase = createClient(supabaseUrl, supabaseKey)
