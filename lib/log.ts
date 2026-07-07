// Pages previously discarded `error` from every Supabase read, rendering silent empty
// states indistinguishable from "no records" (review finding PERF-3/M2).
export function logQueryError(scope: string, error: { message: string } | null | undefined): void {
  if (error) console.error(`[query:${scope}]`, error.message);
}
