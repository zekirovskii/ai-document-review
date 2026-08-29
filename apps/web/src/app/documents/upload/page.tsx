import { redirect } from 'next/navigation';
import { UploadForm } from '../../../components/upload-form';
import { AppShell } from '../../../components/app-shell';
import { createClient } from '../../../lib/supabase/server';

export default async function UploadPage() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return (
    <AppShell>
      <main className="page">
        <header className="page-header">
          <div>
            <h1 className="page-title">Upload document</h1>
            <p className="page-subtitle">Upload a PDF for secure background review. Extraction and analysis start after the upload completes.</p>
          </div>
        </header>
        <section className="card">
          <div className="card__body">
            <h2 className="card__heading">Choose a PDF</h2>
            <p className="card__description">PDF files only. The maximum upload size is 10 MiB.</p>
            <UploadForm />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
