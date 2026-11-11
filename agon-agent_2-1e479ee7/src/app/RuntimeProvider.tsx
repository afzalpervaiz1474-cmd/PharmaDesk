import { useEffect, useState, type ReactNode } from 'react';
import { describeError } from '../data/errors';
import { createRuntime, type AppRuntime } from '../data/runtime';
import { RuntimeContext } from './runtime-context';

type State =
  | { status: 'starting' }
  | { status: 'ready'; runtime: AppRuntime }
  | { status: 'failed'; message: string };

/** Opens the data source once, then makes it available to the whole app. */
export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'starting' });

  useEffect(() => {
    let cancelled = false;
    createRuntime()
      .then((runtime) => {
        if (!cancelled) setState({ status: 'ready', runtime });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: describeError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'ready') {
    return <RuntimeContext.Provider value={state.runtime}>{children}</RuntimeContext.Provider>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center">
        <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-4 text-lg font-semibold text-ink">PharmaDesk</h1>
        {state.status === 'starting' ? (
          <p className="mt-2 text-sm text-muted" role="status">
            Opening the database…
          </p>
        ) : (
          <div role="alert">
            <p className="mt-2 text-sm font-medium text-danger">The database could not be opened.</p>
            <p className="mt-2 break-words text-sm text-muted">{state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-hover"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
