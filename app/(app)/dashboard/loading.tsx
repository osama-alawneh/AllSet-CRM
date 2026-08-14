// The real dashboard opens straight onto .kpis with no .scrhead, so there is no title bar
// to stand in for. It then lays panels out in .grid2.
import { SkeletonScreen, SkeletonKpis, SkeletonPanel } from '@/components/skeleton/Skeleton';

export default function DashboardLoading() {
  return (
    <SkeletonScreen label="dashboard">
      <SkeletonKpis count={4} />
      <div className="grid2">
        <SkeletonPanel lines={6} />
        <SkeletonPanel lines={4} />
      </div>
    </SkeletonScreen>
  );
}
