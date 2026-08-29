'use client';

import { useState } from 'react';
import { createClient } from '../lib/supabase/client';

export const LoginForm = () => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    window.location.assign('/documents');
  }

  return (
    <div className="login">
      <section className="card login__card" aria-labelledby="login-title">
        <div className="login__brand">GOATECH</div>
        <h1 className="login__title" id="login-title">Welcome back</h1>
        <p className="login__subtitle">AI Document Review Platform</p>

        <form action={onSubmit} className="form-grid">
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email" required disabled={isSubmitting} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required disabled={isSubmitting} />
          </div>
          {error ? <p className="notice notice--error" role="alert">{error}</p> : null}
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </div>
  );
};
