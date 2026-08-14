import { SkeletonScreen, SkeletonHead, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function SettingsLoading() {
  return (
    <SkeletonScreen label="settings">
      <SkeletonHead actions={1} />
      <SkeletonTable cols={6} rows={5} />
    </SkeletonScreen>
  );
}
