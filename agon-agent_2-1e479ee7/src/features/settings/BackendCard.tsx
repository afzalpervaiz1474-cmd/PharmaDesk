import { useState, type FormEvent } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field, TextInput } from '../../components/ui/Field';
import { Notice } from '../../components/ui/Notice';
import { describeError } from '../../data/errors';
import { BackendClient, normalizeBaseUrl, type HealthStatus } from '../cloud/BackendClient';
import { useCloudSession } from '../cloud/cloud-session-context';

/** Sets the backend address and checks that it responds. */
export function BackendCard() {
  const { baseUrl, setBaseUrl } = useCloudSession();
  const [input, setInput] = useState(baseUrl);
  const [inputError, setInputError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setHealth(null);
    setFailure(null);

    if (input.trim() === '') {
      setInputError(null);
      setBaseUrl('');
      return;
    }
    const normalized = normalizeBaseUrl(input);
    if (!normalized) {
      setInputError('Enter a full address starting with http:// or https://');
      return;
    }
    setInputError(null);
    setInput(normalized);
    setBaseUrl(normalized);

    setTesting(true);
    try {
      setHealth(await new BackendClient(normalized, () => null).health());
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Cloud backend"
        description="Optional. The PharmaDesk NestJS server that stores synchronised data and runs the assistant."
      />
      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4 px-5 py-4">
        <Field
          label="Backend address"
          htmlFor="settings-backend-url"
          error={inputError ?? undefined}
          hint="For local development: http://localhost:3000. Changing the address signs you out."
        >
          <TextInput
            id="settings-backend-url"
            type="url"
            inputMode="url"
            placeholder="http://localhost:3000"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            invalid={Boolean(inputError)}
            hasHint
            autoComplete="off"
            className="font-mono"
          />
        </Field>
        <Button type="submit" variant="secondary" loading={testing}>
          Save and test connection
        </Button>

        {failure ? (
          <Notice tone="danger" title="Connection failed">
            {failure}
          </Notice>
        ) : null}
        {health ? (
          <div className="rounded-md border border-line" role="status">
            <dl className="divide-y divide-line text-sm">
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">Server</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink-soft">v{health.version}</span>
                  <Badge tone="success">Reachable</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">PostgreSQL</dt>
                <dd>{health.database === 'up' ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Not reachable</Badge>}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">OmniRoute AI gateway</dt>
                <dd>{health.aiGateway === 'configured' ? <Badge tone="success">Configured</Badge> : <Badge>Not configured</Badge>}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
