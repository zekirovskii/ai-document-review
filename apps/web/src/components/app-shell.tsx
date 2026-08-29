'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '../lib/supabase/client';
import { LogoutButton } from './logout-button';

export const AppShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const isDocumentsRoute = pathname === '/documents' || pathname.startsWith('/documents/');

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <span className="shell__brand-name">GOATECH</span>
          <span className="shell__brand-subtitle">AI Document Review</span>
        </div>

        <nav className="shell__nav" aria-label="Primary navigation">
          <Link className={`shell__nav-link ${isDocumentsRoute && pathname !== '/documents/upload' ? 'shell__nav-link--active' : ''}`} href="/documents">
            Documents
          </Link>
          <Link className={`shell__nav-link ${pathname === '/documents/upload' ? 'shell__nav-link--active' : ''}`} href="/documents/upload">
            Upload document
          </Link>
        </nav>

        <div className="shell__footer">
          {email ? <span className="shell__email" title={email}>{email}</span> : null}
          <LogoutButton />
        </div>
      </aside>
      <div className="shell__content">{children}</div>
    </div>
  );
};
