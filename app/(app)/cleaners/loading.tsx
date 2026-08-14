// /cleaners is <section className="screen"><Leaderboard /></section> and nothing else, and
// Leaderboard is a .panel.box wrapping a 4-column .tbl. No .scrhead, so no head skeleton.
import { SkeletonScreen, SkeletonTable } from '@/components/skeleton/Skeleton';

export default function CleanersLoading() {
  return (
    <SkeletonScreen label="cleaners">
      <SkeletonTable cols={4} rows={6} />
    </SkeletonScreen>
  );
}
