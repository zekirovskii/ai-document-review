'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';

export const UploadForm = () => {
  const router = useRouter(); const [message, setMessage] = useState<string | null>(null); const [uploading, setUploading] = useState(false);
  async function submit(formData: FormData) {
    setUploading(true); setMessage(null);
    try {
      const response = await apiFetch('/documents', { method: 'POST', body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Upload failed');
      router.push(`/documents/${body.document.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed'); }
    finally { setUploading(false); }
  }
  return <form action={submit}><input name="file" type="file" accept="application/pdf,.pdf" required />{message ? <p role="alert">{message}</p> : null}<button disabled={uploading}>{uploading ? 'Uploading…' : 'Upload PDF'}</button></form>;
};
