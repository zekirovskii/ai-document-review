import { redirect } from 'next/navigation';
import { LogoutButton } from '../../components/logout-button';
import { DocumentsList } from '../../components/documents-list';
import { createClient } from '../../lib/supabase/server';

export default async function DocumentsPage() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return <main><LogoutButton /><h1>Documents</h1><DocumentsList /></main>;
}
