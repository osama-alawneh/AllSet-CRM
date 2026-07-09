export type EarningRow = { cleaner_id: string; job_id: number; done_at: string; share: number };

// 'YYYY-MM' from the ISO timestamp — same UTC string-slice convention as lib/jobs dayTime().
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function leaderboard(
  rows: EarningRow[],
  names: Map<string, string>,
  month?: string,
): { cleaner_id: string; name: string; jobsDone: number; earnings: number }[] {
  const scoped = month ? rows.filter(r => monthKey(r.done_at) === month) : rows;
  const byCleaner = new Map<string, { jobs: Set<number>; earnings: number }>();
  for (const r of scoped) {
    const e = byCleaner.get(r.cleaner_id) ?? { jobs: new Set<number>(), earnings: 0 };
    e.jobs.add(r.job_id);
    e.earnings += Number(r.share);
    byCleaner.set(r.cleaner_id, e);
  }
  return [...byCleaner.entries()]
    .map(([cleaner_id, e]) => ({
      cleaner_id,
      name: names.get(cleaner_id) ?? '—',
      jobsDone: e.jobs.size,
      earnings: e.earnings,
    }))
    .sort((a, b) => b.earnings - a.earnings);
}
