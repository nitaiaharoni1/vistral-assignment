export function withinWindow(
  stamps: number[],
  now: number,
  windowMs: number,
  max: number,
): boolean {
  while (stamps.length && stamps[0] < now - windowMs) stamps.shift();
  return stamps.length < max;
}
