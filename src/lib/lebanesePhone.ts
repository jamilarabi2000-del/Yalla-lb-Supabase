/**
 * The (up to 8) digits that follow +961 in a phone box with "+961" printed
 * beside it, taken from whatever was typed or pasted: "+961 70 123 456",
 * "00961 70123456", "070 123 456" (a leading 0 is not part of the number after
 * the country code) and "70123456" all give "70123456". Only digits are kept.
 *
 * The box used to have maxLength={8}, which cut a pasted "+961 70 123 456" to
 * its first eight characters before any code ran, leaving "96170".
 */
export function lebaneseLocalDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00961')) digits = digits.slice(5);
  else if (digits.startsWith('961') && digits.length > 8) digits = digits.slice(3);
  if (digits.length === 9 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 8);
}
