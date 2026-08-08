import { Badge } from '@/components/ui/badge';
import type { ArtifactType } from '@/database/repository';

const typeVariants = { spec: 'info', html: 'warning', markdown: 'success' } as const;

/** Badge text; "markdown" is too long for the badge chip, so it gets the conventional short form. */
const typeLabels: Record<ArtifactType, string> = { spec: 'spec', html: 'html', markdown: 'md' };

export function TypeBadge({ type }: { type: ArtifactType }) {
  return (
    <Badge className="shrink-0 self-start tracking-wide uppercase" variant={typeVariants[type]}>
      {typeLabels[type]}
    </Badge>
  );
}
