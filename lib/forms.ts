// Shared FormData helpers for the client edit forms.

// A present-but-blank money input in an ADMIN edit form is a deliberate "clear to $0",
// not "leave unchanged". The CRUD RPCs (migration 0014) coalesce a null p_quote/p_price
// as "keep the old value", and parseLeadForm/parseJobForm map blank -> null — so without
// this transform an admin can never zero money via the form. Turning a blank into '0' at
// the form boundary makes the parser yield numeric 0, which update_lead/update_job apply.
//
// Absent fields are left untouched: rep edit forms never render the money input at all, so
// the field is absent (not blank), and the RPC must keep ignoring it. Only a present blank
// (or whitespace-only) value is rewritten; non-blank values pass through unchanged.
export function blankMoneyToZero(fd: FormData, field: string): FormData {
  const v = fd.get(field);
  if (typeof v === 'string' && v.trim() === '') fd.set(field, '0');
  return fd;
}
