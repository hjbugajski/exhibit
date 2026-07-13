import { Badge } from '@/components/ui/badge';
import type { ArtifactType } from '@/database/repository';

const typeVariants = { spec: 'info', html: 'warning' } as const;

export function TypeBadge({ type }: { type: ArtifactType }) {
  return (
    <Badge className="shrink-0 self-start tracking-wide uppercase" variant={typeVariants[type]}>
      {type}
    </Badge>
  );
}
