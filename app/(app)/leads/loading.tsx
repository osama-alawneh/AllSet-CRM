import { SkeletonScreen, SkeletonHead, SkeletonBoard } from '@/components/skeleton/Skeleton';

export default function LeadsLoading() {
  return (
    <SkeletonScreen label="leads">
      <SkeletonHead actions={3} />
      <SkeletonBoard cols={4} cards={3} />
    </SkeletonScreen>
  );
}
