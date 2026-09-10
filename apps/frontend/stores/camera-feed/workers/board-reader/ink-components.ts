export type Component = {
  points: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type FloodState = {
  mask: Uint8Array;
  visited: Uint8Array;
  queue: Int32Array;
  size: number;
};

// Adds unread neighbor ink pixels to the flood queue.
function enqueueNeighbors(input: FloodState & { x: number; y: number; tail: number }): number {
  let { tail } = input;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = input.x + dx;
      const ny = input.y + dy;
      if (nx < 0 || ny < 0 || nx >= input.size || ny >= input.size) continue;
      const next = ny * input.size + nx;
      if (!input.mask[next] || input.visited[next]) continue;
      input.visited[next] = 1;
      input.queue[tail++] = next;
    }
  }
  return tail;
}

// Finds connected ink blobs, largest first.
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
      tail = enqueueNeighbors({ mask, visited, queue, size, x, y, tail });
    }
    found.push(component);
  }
  return found.toSorted((a, b) => b.points.length - a.points.length);
}

// Starts a flood from empty pixels on the mask edge.
function seedBorder(input: FloodState): number {
  let tail = 0;
  for (let y = 0; y < input.size; y++) {
    for (let x = 0; x < input.size; x++) {
      if (x !== 0 && y !== 0 && x !== input.size - 1 && y !== input.size - 1) continue;
      const at = y * input.size + x;
      if (!input.mask[at] && !input.visited[at]) {
        input.queue[tail++] = at;
        input.visited[at] = 1;
      }
    }
  }
  return tail;
}

// Adds unread empty neighbor pixels to the flood queue.
function enqueueEmptyNeighbors(input: FloodState & { at: number; tail: number }): number {
  const x = input.at % input.size;
  const y = Math.floor(input.at / input.size);
  const neighbors = [x > 0 ? input.at - 1 : -1, x < input.size - 1 ? input.at + 1 : -1, y > 0 ? input.at - input.size : -1, y < input.size - 1 ? input.at + input.size : -1];
  let { tail } = input;
  for (const next of neighbors) {
    if (next < 0 || input.visited[next] || input.mask[next]) continue;
    input.visited[next] = 1;
    input.queue[tail++] = next;
  }
  return tail;
}

// Measures how much of a blob's box is a closed hole.
function enclosedRatio(input: { mask: Uint8Array; visited: Uint8Array; size: number; bounds: Component }): number {
  const width = input.bounds.maxX - input.bounds.minX + 1;
  const height = input.bounds.maxY - input.bounds.minY + 1;
  let enclosed = 0;
  for (let y = input.bounds.minY; y <= input.bounds.maxY; y++) {
    for (let x = input.bounds.minX; x <= input.bounds.maxX; x++) {
      const at = y * input.size + x;
      if (!input.visited[at] && !input.mask[at]) enclosed++;
    }
  }
  return enclosed / (width * height);
}

// Measures the closed hole at the center of a blob.
export function enclosedCenter(mask: Uint8Array, size: number, bounds: Component): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = seedBorder({ mask, visited, queue, size });
  while (head < tail) {
    tail = enqueueEmptyNeighbors({ mask, visited, queue, size, at: queue[head++], tail });
  }
  const center = Math.round((bounds.minY + bounds.maxY) / 2) * size + Math.round((bounds.minX + bounds.maxX) / 2);
  if (visited[center] || mask[center]) return 0;
  return enclosedRatio({ mask, visited, size, bounds });
}

// True when a blob is large enough to be a mark.
export function isStructuredInk(group: Component): boolean {
  return group.points.length >= 18 && Math.max(group.maxX - group.minX, group.maxY - group.minY) >= 8;
}

// True when the mask has at least one mark-sized blob.
export function hasStructuredInk(mask: Uint8Array, size: number): boolean {
  return components(mask, size).some(isStructuredInk);
}

// Clears ink that belongs to the grid lines.
export function removeGridFragments(mask: Uint8Array, size: number, gridMask?: Uint8Array): Uint8Array {
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
    if (gridMask[at] && (rows[Math.floor(at / size)] > size * 0.6 || columns[at % size] > size * 0.6)) clean[at] = 0;
  }
  for (const group of components(clean, size)) {
    const width = group.maxX - group.minX + 1,
      height = group.maxY - group.minY + 1;
    if (Math.min(width, height) > 12 || Math.max(width, height) < Math.min(width, height) * 2) continue;
    const known = group.points.filter((at) => gridMask[at]).length;
    if (known / group.points.length >= 0.6) for (const at of group.points) clean[at] = 0;
  }
  return clean;
}

// Fills tiny holes in an ink mask.
export function closeSmallGaps(mask: Uint8Array, size: number): Uint8Array {
  const dilated = new Uint8Array(mask.length);
  const closed = mask.slice();
  const stride = size + 1;
  const integral = new Uint32Array(stride * stride);
  // Builds a prefix-sum table for a mask.
  const sumMask = (source: Uint8Array) => {
    for (let y = 0; y < size; y++) {
      let rowSum = 0;
      for (let x = 0; x < size; x++) {
        rowSum += Number(source[y * size + x] !== 0);
        integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
      }
    }
  };
  sumMask(mask);
  for (let y = 2; y < size - 2; y++) {
    const top = (y - 2) * stride;
    const bottom = (y + 3) * stride;
    for (let x = 2; x < size - 2; x++) {
      const count = integral[bottom + x + 3] - integral[top + x + 3] - integral[bottom + x - 2] + integral[top + x - 2];
      dilated[y * size + x] = Number(count > 0);
    }
  }
  sumMask(dilated);
  for (let y = 2; y < size - 2; y++) {
    const top = (y - 2) * stride;
    const bottom = (y + 3) * stride;
    for (let x = 2; x < size - 2; x++) {
      const count = integral[bottom + x + 3] - integral[top + x + 3] - integral[bottom + x - 2] + integral[top + x - 2];
      closed[y * size + x] = Number(count === 25 || !!mask[y * size + x]);
    }
  }
  return closed;
}

// True when leftover ink is not near the supported mark.
export function hasUnsupportedInk(mask: Uint8Array, support: Uint8Array, size: number): boolean {
  const unsupported = mask.slice();
  for (let at = 0; at < mask.length; at++) {
    if (!support[at]) continue;
    const x = at % size;
    const y = Math.floor(at / size);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size) unsupported[ny * size + nx] = 0;
      }
    }
  }
  return hasStructuredInk(unsupported, size);
}
