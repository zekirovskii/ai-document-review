'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';

type Item = { id: string; originalFilename: string; status: string; createdAt: string };
export const DocumentsList = () => {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => { apiFetch('/documents').then((r) => r.json()).then((data) => setItems(data.documents ?? [])).catch(() => setItems([])); }, []);
  return <><Link href="/documents/upload">Upload PDF</Link><ul>{items.map((item) => <li key={item.id}><Link href={`/documents/${item.id}`}>{item.originalFilename}</Link> — {item.status} — {new Date(item.createdAt).toLocaleString()}</li>)}</ul></>;
};
