import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from '@/types/index'

export const createClient = () =>
  createClientComponentClient<Database>()
