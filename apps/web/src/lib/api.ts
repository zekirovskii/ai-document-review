'use client';

import { createClient } from './supabase/client';

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error('Missing required environment variable: NEXT_PUBLIC_API_BASE_URL');
  const { data } = await createClient().auth.getSession();
  if (!data.session?.access_token) throw new Error('Authentication required');
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${data.session.access_token}` },
  });
};
