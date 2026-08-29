import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { ApiConfig } from './config.js';

export const createSupabaseAdminClient = (config: ApiConfig): SupabaseClient =>
  createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
