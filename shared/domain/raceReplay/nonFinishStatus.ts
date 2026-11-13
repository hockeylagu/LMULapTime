/** The results' finish status when the car did not finish (DNF, DQ, DNS, retired); undefined for a finisher or none. */
export function nonFinishStatus(status: string | null | undefined): string | undefined {
  return status && /dnf|dns|dq|retired|disqual/i.test(status) ? status : undefined;
}
