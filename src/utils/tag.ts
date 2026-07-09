export function generateTag(pattern: string): string {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const star = pattern.indexOf("*");
  const prefix = star === -1 ? pattern : pattern.slice(0, star);

  return `${prefix}${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}
