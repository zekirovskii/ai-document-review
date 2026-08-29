import { redirect } from 'next/navigation';
import { DocumentsList } from '../../components/documents-list';
import { AppShell } from '../../components/app-shell';
import { createClient } from '../../lib/supabase/server';

export default async function DocumentsPage() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return (
    <AppShell>
      <main className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Documents</h1>
            <p className="page-subtitle">Track PDF uploads and review completed document analyses.</p>
          </div>
        </header>
        <DocumentsList />
      </main>
    </AppShell>
  );
}
