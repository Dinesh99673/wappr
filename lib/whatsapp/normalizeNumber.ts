/**
 * Normalizes a raw phone number into WhatsApp's chat-id format:
 *   <countrycode><number>@c.us
 *
 * The input must be a full international number INCLUDING the country code
 * (e.g. "+1 415 555 0123", "14155550123", "44 7700 900000"). We only strip
 * formatting characters — we never guess a country code.
 *
 * Returns null if the input does not look like a valid E.164-style number,
 * so callers can reject it with a 400.
 */
export function normalizeNumber(raw: string): string | null {
  if (typeof raw !== "string") return null;

  // Already a chat id? Accept and pass through the digits.
  const withoutSuffix = raw.trim().replace(/@c\.us$/i, "");

  // Strip everything that isn't a digit (drops +, spaces, dashes, parens, dots).
  const digits = withoutSuffix.replace(/\D/g, "");

  // E.164 allows a maximum of 15 digits; a realistic minimum (country code +
  // subscriber number) is around 8.
  if (digits.length < 8 || digits.length > 15) return null;

  // Numbers with a leading zero after stripping "+" are almost always a local
  // trunk-prefixed number missing the country code — reject to avoid silent
  // misdelivery.
  if (digits.startsWith("0")) return null;

  return `${digits}@c.us`;
}
