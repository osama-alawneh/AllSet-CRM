// Builds a PostgREST or() filter for the customers typeahead.
// Commas/parens delimit or() branches and %/_ are ilike wildcards, so strip them
// from user input; the wildcards we add ourselves are the only ones sent.
export function buildOrFilter(q: string): string | null {
  const s = q.replace(/[%_,()]/g, ' ').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  return `name.ilike.%${s}%,phone.ilike.%${s}%,address.ilike.%${s}%`;
}
