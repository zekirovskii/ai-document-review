'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../lib/api';

export const UploadForm = () => {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function submit(formData: FormData) {
    setUploading(true);
    setMessage(null);

    try {
      const response = await apiFetch('/documents', { method: 'POST', body: formData });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Upload failed');
      router.push(`/documents/${body.document.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={submit} className="form-grid">
      <label className="upload-dropzone" htmlFor="file">
        <span className="upload-dropzone__title">Choose a PDF to upload</span>
        <span className="upload-dropzone__hint">Select a file from your device. PDF files only, up to 10 MiB.</span>
        {selectedFileName ? <span className="upload-file-name">Selected: {selectedFileName}</span> : null}
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          disabled={uploading}
          onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? null)}
        />
      </label>
      {message ? <p className="notice notice--error" role="alert">{message}</p> : null}
      <div className="form-actions">
        <button type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload PDF'}</button>
      </div>
    </form>
  );
};
