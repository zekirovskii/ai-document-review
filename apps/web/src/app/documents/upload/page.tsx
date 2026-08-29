import { redirect } from 'next/navigation';
import { UploadForm } from '../../../components/upload-form';
import { createClient } from '../../../lib/supabase/server';

export default async function UploadPage() {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return <main><h1>Upload PDF</h1><UploadForm /></main>;
}
