/**
 * Email is simulated: messages are printed to the server console instead of being sent.
 */
export function sendEmail({ to, subject, text }) {
  const line = '-'.repeat(64);
  console.log(`\n${line}\n[EMAIL] To: ${to}\n[EMAIL] Subject: ${subject}\n\n${text}\n${line}\n`);
}
