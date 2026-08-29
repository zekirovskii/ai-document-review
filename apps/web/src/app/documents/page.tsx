import { redirect } from 'next/navigation';
import { LogoutButton } from '../../components/logout-button';
import { createClient } from '../../lib/supabase/server';

export default async function DocumentsPage() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return <main><LogoutButton /><p>Authenticated. Documents UI will be added in the next milestone.</p></main>;
}
