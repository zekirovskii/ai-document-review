import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { DocumentReview } from '../../../components/document-review';

export default async function DocumentPage({params}:{params:Promise<{id:string}>}) {
  const { data } = await (await createClient()).auth.getClaims();
  if (!data?.claims?.sub) redirect('/login');
  return <DocumentReview id={(await params).id}/>;
}
