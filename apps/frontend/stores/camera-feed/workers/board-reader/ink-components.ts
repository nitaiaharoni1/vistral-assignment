export type Component = {
  points: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function enqueueNeighbors(
  mask: Uint8Array,
  visited: Uint8Array,
  queue: Int32Array,
  size: number,
  x: number,
  y: number,
  tail: number,
): number {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const next = ny * size + nx;
      if (!mask[next] || visited[next]) continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }
  return tail;
}

export function components(mask: Uint8Array, size: number): Component[] {
  const visited = new Uint8Array(mask.length);
  const found: Component[] = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;
    const component: Component = {
      points: [],
      minX: size,
      maxX: 0,
      minY: size,
      maxY: 0,
    };
    let head = 0;
    let tail = 1;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
      const at = queue[head++];
      const x = at % size;
      const y = Math.floor(at / size);
      component.points.push(at);
      component.minX = Math.min(component.minX, x);
      component.maxX = Math.max(component.maxX, x);
      component.minY = Math.min(component.minY, y);
      component.maxY = Math.max(component.maxY, y);
      tail = enqueueNeighbors(mask, visited, queue, size, x, y, tail);
    }
    found.push(component);
  }
  return found.toSorted((a, b) => b.points.length - a.points.length);
}

function seedBorder(
  mask: Uint8Array,
  visited: Uint8Array,
  queue: Int32Array,
  size: number,
): number {
  let tail = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x !== 0 && y !== 0 && x !== size - 1 && y !== size - 1) continue;
      const at = y * size + x;
      if (!mask[at] && !visited[at]) {
        queue[tail++] = at;
        visited[at] = 1;
      }
    }
  }
  return tail;
}

function enqueueEmptyNeighbors(
  mask: Uint8Array,
  visited: Uint8Array,
  queue: Int32Array,
  size: number,
  at: number,
  tail: number,
): number {
  const x = at % size;
  const y = Math.floor(at / size);
  const neighbors = [
    x > 0 ? at - 1 : -1,
    x < size - 1 ? at + 1 : -1,
    y > 0 ? at - size : -1,
    y < size - 1 ? at + size : -1,
  ];
  for (const next of neighbors) {
    if (next < 0 || visited[next] || mask[next]) continue;
    visited[next] = 1;
    queue[tail++] = next;
  }
  return tail;
}

function enclosedRatio(
  mask: Uint8Array,
  visited: Uint8Array,
  size: number,
  bounds: Component,
): number {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  let enclosed = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const at = y * size + x;
      if (!visited[at] && !mask[at]) enclosed++;
    }
  }
  return enclosed / (width * height);
}

export function enclosedCenter(
  mask: Uint8Array,
  size: number,
  bounds: Component,
): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = seedBorder(mask, visited, queue, size);
  while (head < tail) {
    tail = enqueueEmptyNeighbors(
      mask,
      visited,
      queue,
      size,
      queue[head++],
      tail,
    );
  }
  const center =
    Math.round((bounds.minY + bounds.maxY) / 2) * size +
    Math.round((bounds.minX + bounds.maxX) / 2);
  if (visited[center] || mask[center]) return 0;
  return enclosedRatio(mask, visited, size, bounds);
}

export function isStructuredInk(group: Component): boolean {
  return (
    group.points.length >= 18 &&
    Math.max(group.maxX - group.minX, group.maxY - group.minY) >= 8
  );
}

export function hasStructuredInk(mask: Uint8Array, size: number): boolean {
  return components(mask, size).some(isStructuredInk);
}

export function removeGridFragments(
  mask: Uint8Array,
  size: number,
  gridMask?: Uint8Array,
): Uint8Array {
  if (!gridMask) return mask;
  const clean = mask.slice();
  const rows = new Uint16Array(size);
  const columns = new Uint16Array(size);
  for (let at = 0; at < gridMask.length; at++) {
    if (!gridMask[at]) continue;
    rows[Math.floor(at / size)]++;
    columns[at % size]++;
  }
  for (let at = 0; at < clean.length; at++) {
    if (
      gridMask[at] &&
      (rows[Math.floor(at / size)] > size * 0.6 ||
        columns[at % size] > size * 0.6)
    )
      clean[at] = 0;
  }
  for (const group of components(clean, size)) {
    const width = group.maxX - group.minX + 1,
      height = group.maxY - group.minY + 1;
    if (
      Math.min(width, height) > 12 ||
      Math.max(width, height) < Math.min(width, height) * 2
    )
      continue;
    const known = group.points.filter((at) => gridMask[at]).length;
    if (known / group.points.length >= 0.6)
      for (const at of group.points) clean[at] = 0;
  }
  return clean;
}

export function closeSmallGaps(mask: Uint8Array, size: number): Uint8Array {
  const dilated = new Uint8Array(mask.length);
  const closed = mask.slice();
  const stride = size + 1;
  const integral = new Uint32Array(stride * stride);
  const sumMask = (source: Uint8Array) => {
    for (let y = 0; y < size; y++) {
      let rowSum = 0;
      for (let x = 0; x < size; x++) {
        rowSum += Number(source[y * size + x] !== 0);
        integral[(y + 1) * stride + x + 1] =
          integral[y * stride + x + 1] + rowSum;
      }
    }
  };
  sumMask(mask);
  for (let y = 2; y < size - 2; y++) {
    const top = (y - 2) * stride;
    const bottom = (y + 3) * stride;
    for (let x = 2; x < size - 2; x++) {
      const count =
        integral[bottom + x + 3] -
        integral[top + x + 3] -
        integral[bottom + x - 2] +
        integral[top + x - 2];
      dilated[y * size + x] = Number(count > 0);
    }
  }
  sumMask(dilated);
  for (let y = 2; y < size - 2; y++) {
    const top = (y - 2) * stride;
    const bottom = (y + 3) * stride;
    for (let x = 2; x < size - 2; x++) {
      const count =
        integral[bottom + x + 3] -
        integral[top + x + 3] -
        integral[bottom + x - 2] +
        integral[top + x - 2];
      closed[y * size + x] = Number(count === 25 || !!mask[y * size + x]);
    }
  }
  return closed;
}

export function hasUnsupportedInk(
  mask: Uint8Array,
  support: Uint8Array,
  size: number,
): boolean {
  const unsupported = mask.slice();
  for (let at = 0; at < mask.length; at++) {
    if (!support[at]) continue;
    const x = at % size;
    const y = Math.floor(at / size);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size)
          unsupported[ny * size + nx] = 0;
      }
    }
  }
  return hasStructuredInk(unsupported, size);
}
