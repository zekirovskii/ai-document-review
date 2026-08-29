import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';

export default async function DocumentPage() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return <main><p>Document details are loaded from the API after authentication.</p></main>;
}
