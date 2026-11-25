import crypto from 'node:crypto';

/**
 * Simulated card processor. No real payment provider is contacted.
 *
 * Test cards:
 *   any valid-looking number          -> approved
 *   number ending in 0002             -> declined
 *   number ending in 9995             -> insufficient funds
 */
export function processPayment({ cardNumber, cardName, expiry, cvc, amountCents }) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  const reference = `SIM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const last4 = digits.slice(-4) || null;
  const brand = cardBrand(digits);

  const fail = (reason) => ({ ok: false, reason, reference, last4, brand });

  if (!cardName || !String(cardName).trim()) return fail('Cardholder name is required');
  if (digits.length < 12 || digits.length > 19) return fail('Card number is not valid');

  const m = /^(\d{2})\s*\/\s*(\d{2}|\d{4})$/.exec(String(expiry || '').trim());
  if (!m) return fail('Expiry must be in MM/YY format');
  const month = Number(m[1]);
  let year = Number(m[2]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12) return fail('Expiry month is not valid');
  const endOfExpiryMonth = new Date(year, month, 0, 23, 59, 59);
  if (endOfExpiryMonth < new Date()) return fail('Card has expired');

  if (!/^\d{3,4}$/.test(String(cvc || '').trim())) return fail('Security code is not valid');
  if (!Number.isInteger(amountCents) || amountCents < 0) return fail('Amount is not valid');

  if (digits.endsWith('0002')) return fail('Card declined by issuer');
  if (digits.endsWith('9995')) return fail('Insufficient funds');

  return { ok: true, reference, last4, brand };
}

function cardBrand(digits) {
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  return 'Card';
}
