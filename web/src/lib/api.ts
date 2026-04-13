export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "https://api.thermal.gliderzone.com";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
