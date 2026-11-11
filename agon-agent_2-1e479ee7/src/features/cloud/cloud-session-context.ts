import { createContext, useContext } from 'react';
import type { BackendClient, CloudUser, RegisterInput } from './BackendClient';

export interface CloudSessionValue {
  /** Backend address, e.g. http://localhost:3000. Empty until configured. */
  baseUrl: string;
  user: CloudUser | null;
  /** Client for the configured backend, or null when no address is set. */
  client: BackendClient | null;
  setBaseUrl: (baseUrl: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => void;
}

export const CloudSessionContext = createContext<CloudSessionValue | null>(null);

export function useCloudSession(): CloudSessionValue {
  const value = useContext(CloudSessionContext);
  if (!value) throw new Error('useCloudSession must be used inside <CloudSessionProvider>');
  return value;
}
