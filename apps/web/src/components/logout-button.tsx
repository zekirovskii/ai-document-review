'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabase/client';

export const LogoutButton = () => {
  const router = useRouter();

  return (
    <button
      className="shell__sign-out"
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
};
