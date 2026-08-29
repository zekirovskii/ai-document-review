'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import { StatusBadge } from './status-badge';

type Analysis = {
  documentType: 'contract' | 'invoice' | 'report' | 'other';
  language: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  flags: string[];
};

type Document = {
  id: string;
  originalFilename: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  failureReason?: string | null;
  analysis: Analysis | null;
};

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

const humanize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const DocumentReview = ({ id }: { id: string }) => {
  const [document, setDocument] = useState<Document | null>(null);
  const [form, setForm] = useState<Analysis | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    const response = await apiFetch(`/documents/${id}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? 'Unable to load document');

    setDocument(body.document);
    setForm(body.document.analysis);
    setIsDirty(false);
  }, [id]);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    loadDocument()
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load document'))
      .finally(() => setIsLoading(false));
  }, [loadDocument]);

  useEffect(() => {
    if (document?.status !== 'QUEUED' && document?.status !== 'PROCESSING') return;

    const intervalId = window.setInterval(() => {
      void loadDocument().catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to refresh document');
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [document?.status, loadDocument]);

  const change = <Key extends keyof Analysis>(key: Key, value: Analysis[Key]) => {
    if (!form) return;
    setForm({ ...form, [key]: value });
    setIsDirty(true);
    setSuccess(null);
  };

  const save = async () => {
    if (!form) return;
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      const response = await apiFetch(`/documents/${id}/analysis`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Unable to save changes');

      setForm(body.analysis);
      setIsDirty(false);
      setSuccess('Analysis changes saved.');
      await loadDocument();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const approve = async () => {
    setError(null);
    setSuccess(null);
    setIsApproving(true);

    try {
      const response = await apiFetch(`/documents/${id}/approve`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Unable to approve document');

      await loadDocument();
      setSuccess('Document approved.');
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Unable to approve document');
    } finally {
      setIsApproving(false);
    }
  };

  if (isLoading) return <main className="page"><p className="loading-state">Loading document…</p></main>;
  if (!document) return <main className="page"><p className="notice notice--error" role="alert">{error ?? 'Document not found.'}</p></main>;

  const isReviewRequired = document.status === 'REVIEW_REQUIRED' && form;
  const isApproved = document.status === 'APPROVED';

  return (
    <main className="page">
      <Link className="document-back" href="/documents">← Back to Documents</Link>

      <section className="card" aria-labelledby="document-title">
        <div className="card__body">
          <div className="document-header">
            <h1 className="document-header__name" id="document-title">{document.originalFilename}</h1>
            <StatusBadge status={document.status} />
          </div>
          <dl className="document-meta">
            <div>
              <dt>Created</dt>
              <dd><time dateTime={document.createdAt}>{formatDate(document.createdAt)}</time></dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd><time dateTime={document.updatedAt}>{formatDate(document.updatedAt)}</time></dd>
            </div>
          </dl>
        </div>
      </section>

      {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
      {success ? <p className="notice notice--success" role="status">{success}</p> : null}

      {document.status === 'FAILED' ? (
        <section className="card">
          <div className="card__body">
            <h2 className="card__heading">Processing failed</h2>
            <p className="notice notice--error" role="alert">{document.failureReason || 'This document could not be processed. Please upload another PDF and try again.'}</p>
          </div>
        </section>
      ) : null}

      {document.status === 'QUEUED' ? (
        <section className="card"><div className="card__body"><h2 className="card__heading">Queued for processing</h2><p className="card__description">Your PDF is waiting for a worker. This page refreshes automatically while processing is pending.</p></div></section>
      ) : null}

      {document.status === 'PROCESSING' ? (
        <section className="card"><div className="card__body"><h2 className="card__heading">Processing document</h2><p className="card__description">The PDF is being extracted and analysed. This page refreshes automatically while processing continues.</p></div></section>
      ) : null}

      {isReviewRequired ? (
        <section className="card analysis-card" aria-labelledby="analysis-title">
          <div className="card__body">
            <div className="analysis-card__header">
              <h2 className="card__heading" id="analysis-title">Review analysis</h2>
              <p className="card__description">Check the generated analysis, make any needed corrections, then approve the document.</p>
            </div>
            <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
              <div className="field">
                <label htmlFor="document-type">Document Type</label>
                <select id="document-type" value={form.documentType} onChange={(event) => change('documentType', event.target.value as Analysis['documentType'])} disabled={isSaving || isApproving}>
                  <option value="contract">Contract</option><option value="invoice">Invoice</option><option value="report">Report</option><option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="language">Language</label>
                <input id="language" value={form.language} onChange={(event) => change('language', event.target.value)} disabled={isSaving || isApproving} required />
              </div>
              <div className="field">
                <label htmlFor="summary">Summary</label>
                <textarea id="summary" value={form.summary} onChange={(event) => change('summary', event.target.value)} disabled={isSaving || isApproving} required />
              </div>
              <div className="field">
                <label htmlFor="risk-level">Risk Level</label>
                <select id="risk-level" value={form.riskLevel} onChange={(event) => change('riskLevel', event.target.value as Analysis['riskLevel'])} disabled={isSaving || isApproving}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="flags">Flags</label>
                <textarea id="flags" value={form.flags.join('\n')} onChange={(event) => change('flags', event.target.value.split('\n').map((flag) => flag.trim()).filter(Boolean))} disabled={isSaving || isApproving} aria-describedby="flags-help" />
                <span className="form-help" id="flags-help">Enter one flag per line.</span>
              </div>
              <div className="form-actions">
                <button type="submit" disabled={isSaving || isApproving}>{isSaving ? 'Saving…' : 'Save changes'}</button>
                <button className="button-secondary" type="button" onClick={() => void approve()} disabled={isDirty || isSaving || isApproving}>
                  {isApproving ? 'Approving…' : 'Approve document'}
                </button>
                {isDirty ? <p className="form-help">Save changes before approving.</p> : null}
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {document.analysis && !isReviewRequired ? (
        <section className="card analysis-card" aria-labelledby="analysis-title">
          <div className="card__body">
            {isApproved ? <div className="approved-banner"><div><strong>Document approved</strong>This analysis has been approved and is now read-only.</div></div> : null}
            <div className="analysis-card__header"><h2 className="card__heading" id="analysis-title">Analysis</h2><p className="card__description">Generated document analysis.</p></div>
            <dl className="analysis-readonly">
              <div className="analysis-readonly__item"><dt>Document Type</dt><dd>{humanize(document.analysis.documentType)}</dd></div>
              <div className="analysis-readonly__item"><dt>Language</dt><dd>{document.analysis.language}</dd></div>
              <div className="analysis-readonly__item"><dt>Summary</dt><dd>{document.analysis.summary}</dd></div>
              <div className="analysis-readonly__item"><dt>Risk Level</dt><dd>{humanize(document.analysis.riskLevel)}</dd></div>
              <div className="analysis-readonly__item"><dt>Flags</dt><dd>{document.analysis.flags.length ? <ul className="flag-list">{document.analysis.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul> : 'No flags identified.'}</dd></div>
            </dl>
          </div>
        </section>
      ) : null}
    </main>
  );
};
