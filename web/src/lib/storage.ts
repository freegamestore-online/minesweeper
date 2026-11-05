/** localStorage that never throws: blocked storage reads as empty and drops writes. */
export function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full: progress just isn't kept.
  }
}
