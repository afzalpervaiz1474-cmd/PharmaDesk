import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackendClient, type AuthResult, type CloudUser, type RegisterInput } from './BackendClient';
import { CloudSessionContext, type CloudSessionValue } from './cloud-session-context';

const STORAGE_KEY = 'pharmadesk.cloud.v1';

interface StoredSession {
  baseUrl: string;
  token: string | null;
  user: CloudUser | null;
}

function readStoredSession(): StoredSession {
  const fallback: StoredSession = {
    baseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
    token: null,
    user: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : fallback.baseUrl,
      token: typeof parsed.token === 'string' ? parsed.token : null,
      user: parsed.user && typeof parsed.user === 'object' ? (parsed.user as CloudUser) : null,
    };
  } catch {
    return fallback;
  }
}

/**
 * Holds the optional connection to the cloud backend.
 *
 * The access token is kept in localStorage for now. Moving it to the
 * operating system keychain is planned (see SECURITY.md); there is no token
 * refresh yet, so an expired token simply requires signing in again.
 */
export function CloudSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession>(readStoredSession);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Without storage the session lasts until the window closes.
    }
  }, [session]);

  const client = useMemo(
    () => (session.baseUrl ? new BackendClient(session.baseUrl, () => session.token) : null),
    [session.baseUrl, session.token],
  );

  const setBaseUrl = useCallback((baseUrl: string) => {
    // A token is only valid for the backend that issued it.
    setSession((current) => (current.baseUrl === baseUrl ? current : { baseUrl, token: null, user: null }));
  }, []);

  const accept = useCallback((result: AuthResult) => {
    setSession((current) => ({ ...current, token: result.accessToken, user: result.user }));
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) throw new Error('Set the backend address first.');
      accept(await client.login(email, password));
    },
    [client, accept],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      if (!client) throw new Error('Set the backend address first.');
      accept(await client.register(input));
    },
    [client, accept],
  );

  const signOut = useCallback(() => {
    setSession((current) => ({ ...current, token: null, user: null }));
  }, []);

  const value = useMemo<CloudSessionValue>(
    () => ({ baseUrl: session.baseUrl, user: session.token ? session.user : null, client, setBaseUrl, signIn, register, signOut }),
    [session, client, setBaseUrl, signIn, register, signOut],
  );

  return <CloudSessionContext.Provider value={value}>{children}</CloudSessionContext.Provider>;
}
