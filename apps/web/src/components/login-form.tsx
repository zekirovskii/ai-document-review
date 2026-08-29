'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabase/client';

export const LoginForm = () => {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(formData: FormData) {
    setError(null);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: String(formData.get('email') ?? ''), password: String(formData.get('password') ?? ''),
    });
    if (signInError) return setError(signInError.message);
    window.location.assign('/documents');
  }
  return <form action={onSubmit}><label>Email<input name="email" type="email" required /></label><label>Password<input name="password" type="password" required /></label>{error ? <p role="alert">{error}</p> : null}<button type="submit">Sign in</button></form>;
};
