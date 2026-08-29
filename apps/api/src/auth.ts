import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthenticatedUser, AuthVerifier } from './types.js';

export const createSupabaseAuthVerifier = (supabase: SupabaseClient): AuthVerifier => ({
  async verifyAccessToken(token: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }

    return { userId: data.user.id, email: data.user.email ?? undefined };
  },
});
