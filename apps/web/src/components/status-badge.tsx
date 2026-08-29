const statusClassNames: Record<string, string> = {
  QUEUED: 'status-badge--queued',
  PROCESSING: 'status-badge--processing',
  REVIEW_REQUIRED: 'status-badge--review-required',
  APPROVED: 'status-badge--approved',
  FAILED: 'status-badge--failed',
};

export const StatusBadge = ({ status }: { status: string }) => (
  <span className={`status-badge ${statusClassNames[status] ?? 'status-badge--queued'}`}>
    {status.replaceAll('_', ' ')}
  </span>
);
