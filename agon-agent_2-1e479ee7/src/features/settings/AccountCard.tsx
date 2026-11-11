import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field, TextInput } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { describeError } from '../../data/errors';
import { cn } from '../../lib/cn';
import { usePreferences } from '../../lib/preferences-context';
import { useCloudSession } from '../cloud/cloud-session-context';

type Mode = 'signin' | 'register';
type Errors = Partial<Record<'pharmacyName' | 'displayName' | 'email' | 'password', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

/** Sign in to, or create, an account on the configured backend. */
export function AccountCard() {
  const { baseUrl, user, signIn, register, signOut } = useCloudSession();
  const { currency } = usePreferences();
  const [mode, setMode] = useState<Mode>('signin');
  const [pharmacyName, setPharmacyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);

    const nextErrors: Errors = {};
    if (!EMAIL.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (mode === 'register') {
      if (pharmacyName.trim().length < 2) nextErrors.pharmacyName = 'Enter the name of the store.';
      if (displayName.trim().length < 2) nextErrors.displayName = 'Enter your name.';
      if (password.length < MIN_PASSWORD_LENGTH) {
        nextErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
    } else if (password === '') {
      nextErrors.password = 'Enter your password.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register({
          pharmacyName: pharmacyName.trim(),
          displayName: displayName.trim(),
          email: email.trim(),
          password,
          currencyCode: currency,
        });
      } else {
        await signIn(email.trim(), password);
      }
      setPassword('');
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Account"
        description="Register, sign in and token checks work on the backend. Password reset, token refresh and staff roles are planned."
      />
      {user ? (
        <div className="px-5 py-4">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-muted">Signed in as</dt>
              <dd className="break-words font-medium text-ink">{user.displayName}</dd>
              <dd className="break-words text-ink-soft">{user.email}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted">Store</dt>
              <dd className="break-words font-medium text-ink">{user.pharmacyName}</dd>
              <dd className="text-ink-soft">
                {user.role === 'owner' ? 'Owner' : 'Staff'} · {user.currencyCode}
              </dd>
            </div>
          </dl>
          <Button variant="secondary" className="mt-4" onClick={signOut}>
            Sign out
          </Button>
        </div>
      ) : !baseUrl ? (
        <p className="px-5 py-4 text-sm text-muted">Set the backend address first. The app works fully without an account.</p>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="px-5 py-4">
          <div className="mb-4 inline-flex rounded-md border border-line-strong p-0.5" role="group" aria-label="Account action">
            {(['signin', 'register'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => {
                  setMode(option);
                  setErrors({});
                  setFailure(null);
                }}
                className={cn(
                  'h-8 rounded px-3 text-[13px] font-medium',
                  mode === option ? 'bg-primary text-primary-ink' : 'text-ink-soft hover:bg-surface-muted',
                )}
              >
                {option === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'register' ? (
              <>
                <Field label="Store name" htmlFor="account-pharmacy" required error={errors.pharmacyName}>
                  <TextInput
                    id="account-pharmacy"
                    value={pharmacyName}
                    onChange={(event) => setPharmacyName(event.target.value)}
                    invalid={Boolean(errors.pharmacyName)}
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Your name" htmlFor="account-name" required error={errors.displayName}>
                  <TextInput
                    id="account-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    invalid={Boolean(errors.displayName)}
                    autoComplete="name"
                  />
                </Field>
              </>
            ) : null}
            <Field label="Email" htmlFor="account-email" required error={errors.email}>
              <TextInput
                id="account-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                invalid={Boolean(errors.email)}
                autoComplete="email"
              />
            </Field>
            <Field
              label="Password"
              htmlFor="account-password"
              required
              error={errors.password}
              hint={mode === 'register' ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
            >
              <TextInput
                id="account-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                invalid={Boolean(errors.password)}
                hasHint={mode === 'register'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            </Field>
          </div>

          {failure ? (
            <Notice tone="danger" className="mt-4">
              {failure}
            </Notice>
          ) : null}
          <Button type="submit" className="mt-4" loading={submitting}>
            {mode === 'register' ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      )}
    </Card>
  );
}
