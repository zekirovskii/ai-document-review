import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { organizationIdSchema } from '@goatech/shared';

import { ApiError, forbidden } from './errors.js';
import type { MembershipResolver } from './types.js';

const membershipRowsSchema = z.array(z.object({ organization_id: organizationIdSchema }));

export const createMembershipResolver = (supabase: SupabaseClient): MembershipResolver => ({
  async resolveOrganizationId(userId) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    if (error) {
      throw new ApiError(500, 'DATABASE_ERROR', 'Unable to resolve organization membership');
    }

    const memberships = membershipRowsSchema.parse(data ?? []);
    if (memberships.length === 0) {
      throw forbidden();
    }
    if (memberships.length > 1) {
      throw forbidden('Multiple organization memberships are not supported');
    }

    const membership = memberships[0];
    if (!membership) {
      throw forbidden();
    }
    return membership.organization_id;
  },
});
