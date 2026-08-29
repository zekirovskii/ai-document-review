'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import { StatusBadge } from './status-badge';

type Item = { id: string; originalFilename: string; status: string; createdAt: string };

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

export const DocumentsList = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    apiFetch('/documents')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message ?? 'Unable to load documents');
        if (isCurrent) setItems(data.documents ?? []);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : 'Unable to load documents');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => { isCurrent = false; };
  }, []);

  if (isLoading) return <p className="loading-state">Loading documents…</p>;
  if (error) return <p className="notice notice--error" role="alert">{error}</p>;

  return (
    <section className="card">
      <div className="card__body">
        <div className="documents-toolbar">
          <div>
            <h2 className="card__heading">Your documents</h2>
            <p className="card__description">Open a document to check its processing status or review its analysis.</p>
          </div>
          <Link className="button-link" href="/documents/upload">Upload PDF</Link>
        </div>

        {items.length ? (
          <ul className="documents-list">
            {items.map((item) => (
              <li className="document-row" key={item.id}>
                <Link className="document-row__name" href={`/documents/${item.id}`}>{item.originalFilename}</Link>
                <StatusBadge status={item.status} />
                <time className="document-row__date" dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No documents yet. Upload a PDF to start a review.</p>
        )}
      </div>
    </section>
  );
};
