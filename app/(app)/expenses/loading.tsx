import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function ExpensesLoading() {
  return (
    <SkeletonScreen label="expenses">
      <SkeletonHead />
      <SkeletonTable cols={6} rows={7} />
    </SkeletonScreen>
  );
}
