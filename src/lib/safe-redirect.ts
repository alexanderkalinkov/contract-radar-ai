/**
 * A same-site path to send someone to after sign-in, or the fallback. Blocks open redirects:
 * "//evil.com", "/\evil.com" (browsers read a backslash as a slash), "/%5Cevil.com" and control characters.
 * Usable in the browser and on the server.
 */
export function safeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value) return fallback;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  for (const s of [value, decoded]) {
    if (!s.startsWith("/") || s.startsWith("//") || s.includes("\\") || /[\u0000-\u001f\u007f]/.test(s)) return fallback;
  }
  // Anything that a URL parser would turn into another origin is out, whatever the spelling.
  try {
    const u = new URL(value, "https://same.invalid");
    if (u.origin !== "https://same.invalid") return fallback;
  } catch {
    return fallback;
  }
  return value.slice(0, 500);
}
