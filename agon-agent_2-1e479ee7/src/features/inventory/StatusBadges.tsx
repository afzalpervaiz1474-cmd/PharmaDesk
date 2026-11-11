import { Badge } from '../../components/ui/Badge';
import type { ExpiryStatus, StockStatus } from '../../domain/inventory';

export function StockBadge({ status }: { status: StockStatus }) {
  if (status === 'out') return <Badge tone="danger">Out of stock</Badge>;
  if (status === 'low') return <Badge tone="warning">Low stock</Badge>;
  return <Badge tone="success">In stock</Badge>;
}

function describeDaysLeft(daysLeft: number): string {
  if (daysLeft < 0) return `Expired ${Math.abs(daysLeft)} day${daysLeft === -1 ? '' : 's'} ago`;
  if (daysLeft === 0) return 'Expires today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

export function ExpiryBadge({ status, daysLeft }: { status: ExpiryStatus; daysLeft: number }) {
  if (status === 'ok') return null;
  return <Badge tone={status === 'expired' ? 'danger' : 'warning'}>{describeDaysLeft(daysLeft)}</Badge>;
}
