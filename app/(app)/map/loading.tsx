// The map screen is .screen.screen-fill, so its placeholder has to fill too — a short
// skeleton here would collapse the layout and then jump when tiles arrive.
import { SkeletonFill } from '@/components/skeleton/Skeleton';

export default function MapLoading() {
  return (
    <section className="screen screen-fill" role="status" aria-busy="true" aria-label="Loading map">
      <SkeletonFill />
    </section>
  );
}
