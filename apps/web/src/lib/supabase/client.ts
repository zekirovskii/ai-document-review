'use client';

import { createBrowserClient } from '@supabase/ssr';

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const createClient = () => createBrowserClient(
  required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
);
