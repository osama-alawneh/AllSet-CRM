// /jobs defaults to the board view (JobsBoard -> .kanban). A loading shell renders before
// the page does and so cannot read ?view=; matching the default is the best it can do.
import { SkeletonScreen, SkeletonHead, SkeletonBoard } from '@/components/skeleton/Skeleton';

export default function JobsLoading() {
  return (
    <SkeletonScreen label="jobs">
      <SkeletonHead actions={3} />
      <SkeletonBoard cols={4} cards={3} />
    </SkeletonScreen>
  );
}
