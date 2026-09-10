export function segmentedRing(
  project: (x: number, y: number) => readonly [number, number],
): string {
  return Array.from({ length: 8 }, (_segmentValue, segment) =>
    Array.from({ length: 6 }, (_stepValue, step) => {
      const angle = -Math.PI / 2 + ((segment + step / 10) * Math.PI) / 4;
      const [x, y] = project(Math.cos(angle), Math.sin(angle));
      return `${step === 0 ? "M" : "L"}${x},${y}`;
    }).join(" "),
  ).join(" ");
}
