/**
 * Convert followupDate (Date) + followupTime (string "HH:MM") into a real
 * UTC Date so we can compare against new Date() accurately.
 */
export function buildFollowupDateTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const dt = new Date(date);
  dt.setHours(hours, minutes, 0, 0);
  return dt;
}
