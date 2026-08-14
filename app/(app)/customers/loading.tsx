// Shown the instant a link to /customers is clicked, and — because a loading boundary
// exists at all — this is also what Next prefetches on hover. Mirrors CustomersTable.
import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function CustomersLoading() {
  return (
    <SkeletonScreen label="customers">
      <SkeletonHead />
      <SkeletonTable cols={5} rows={8} />
    </SkeletonScreen>
  );
}
