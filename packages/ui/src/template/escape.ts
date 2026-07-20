/**
 * HTML escaping for the two supported interpolation contexts.
 *
 * Text content escapes the markup-significant characters `& < >`. Quoted
 * attribute values additionally escape both quote characters so a value can
 * never terminate its attribute early, regardless of the quote style used.
 */

const TEXT_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => TEXT_ESCAPES[char] ?? char);
}

export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (char) => TEXT_ESCAPES[char] ?? char);
}
