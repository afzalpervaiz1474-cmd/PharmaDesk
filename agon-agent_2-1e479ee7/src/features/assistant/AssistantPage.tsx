import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRuntime } from '../../app/runtime-context';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { usePreferences } from '../../lib/preferences-context';
import { useCloudSession } from '../cloud/cloud-session-context';
import { AssistantChat } from './AssistantChat';
import { PreviewAssistantClient } from './PreviewAssistantClient';
import type { AssistantClient } from './types';

/**
 * Chooses how the assistant is reached:
 * - web preview: the preview API (data-lookup mode, no model);
 * - desktop: the NestJS backend, which holds the OmniRoute key. The assistant
 *   therefore needs a backend connection and only sees synchronised data.
 */
export function AssistantPage() {
  const { mode } = useRuntime();
  const { currency } = usePreferences();
  const { client: backend, user } = useCloudSession();

  const client = useMemo<AssistantClient | null>(() => {
    if (mode === 'web-preview') return new PreviewAssistantClient(currency);
    return backend && user ? backend : null;
  }, [mode, currency, backend, user]);

  return (
    <>
      <PageHeader
        title="Assistant"
        description="Ask about stock, reorder needs, expiry and where a medicine is kept. Answers use read-only data functions on the server."
      />
      {client ? (
        <AssistantChat client={client} />
      ) : (
        <Card>
          <EmptyState
            title="Connect to the backend to use the assistant"
            action={
              <Link to="/settings" className={buttonClasses('primary')}>
                Open sync &amp; settings
              </Link>
            }
          >
            The assistant runs on the PharmaDesk backend so that AI gateway keys never reach this device. Set the
            backend address, sign in and push your data first — it can only answer from synchronised records.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
