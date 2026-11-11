import { Link, useParams } from 'react-router-dom';
import { PLANNED_MODULES } from '../../app/navigation';
import { PlannedBadge } from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/buttonStyles';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Notice } from '../../components/ui/Notice';
import { PageHeader } from '../../components/ui/PageHeader';

/** Honest placeholder for a module that is on the roadmap but not built. */
export function PlannedPage() {
  const { moduleId } = useParams();
  const module = PLANNED_MODULES.find((candidate) => candidate.id === moduleId);
  if (!module) return <NotFoundPage />;

  return (
    <>
      <PageHeader title={module.title} description={module.summary} actions={<PlannedBadge />} />
      <Notice tone="info" title="This module is not implemented yet" className="mb-6">
        There is no working screen, no data and no backend for it in this version. The list below is the intended
        scope, not a description of existing behaviour.
      </Notice>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Intended scope" description={`Roadmap: ${module.phase}`} />
          <ul className="divide-y divide-line">
            {module.scope.map((item) => (
              <li key={item} className="flex items-start gap-3 px-5 py-3 text-sm text-ink-soft">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="What it depends on" />
          <p className="px-5 py-4 text-sm text-ink-soft">{module.dependsOn}</p>
          <p className="border-t border-line px-5 py-4 text-[13px] text-muted">
            Phases and status are tracked in <span className="font-mono text-xs">ROADMAP.md</span> in the repository.
            Contributions are welcome — see <span className="font-mono text-xs">CONTRIBUTING.md</span>.
          </p>
        </Card>
      </div>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        title="Page not found"
        action={
          <Link to="/" className={buttonClasses('primary')}>
            Go to dashboard
          </Link>
        }
      >
        This screen does not exist.
      </EmptyState>
    </Card>
  );
}
