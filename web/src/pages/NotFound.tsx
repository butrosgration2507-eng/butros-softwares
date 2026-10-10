import { Compass } from 'lucide-react';
import { EmptyState, LinkButton, usePageMeta } from '../components/ui';

export default function NotFound() {
  usePageMeta('Page not found');
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <EmptyState icon={<Compass className="size-6" />} title="Page not found">The page you are looking for does not exist or is no longer available.<div className="mt-5"><LinkButton to="/catalogue">Browse the catalogue</LinkButton></div></EmptyState>
    </div>
  );
}
