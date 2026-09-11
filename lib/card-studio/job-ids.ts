export function formatJobId(date = new Date(), sequence: number) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `JOB-${y}${m}${d}-${String(sequence).padStart(6, "0")}`;
}

export function formatCardNumber(sequence: number) {
  return `FIT-${String(sequence).padStart(8, "0")}`;
}

export function parseJobSequence(jobId: string) {
  const match = /^JOB-\d{8}-(\d{6})$/.exec(jobId);
  return match ? Number(match[1]) : null;
}
