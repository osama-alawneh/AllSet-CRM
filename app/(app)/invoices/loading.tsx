import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function InvoicesLoading() {
  return (
    <SkeletonScreen label="invoices">
      <SkeletonHead />
      <SkeletonTable cols={6} rows={7} />
    </SkeletonScreen>
  );
}
