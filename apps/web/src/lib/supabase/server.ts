import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const createClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items: Array<{ name: string; value: string; options?: never }>) => {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {
          // Server Components cannot write cookies; middleware refreshes sessions.
        }
      },
    },
  });
};
