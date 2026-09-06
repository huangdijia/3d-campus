export type LabelAnchor = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
};
export type LabelPlacement = LabelAnchor & { left: number; top: number };
export type LabelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export function overlaps(a: LabelPlacement, b: LabelPlacement, gap = 6) {
  return (
    a.left < b.left + b.width + gap &&
    a.left + a.width + gap > b.left &&
    a.top < b.top + b.height + gap &&
    a.top + a.height + gap > b.top
  );
}
/** Screen-space labels stay legible while their leaders retain true map anchors. */
export function layoutMapLabels(anchors: LabelAnchor[], bounds: LabelBounds) {
  const placed: LabelPlacement[] = [];
  const overflow: string[] = [];
  const sorted = [...anchors].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
  for (const anchor of sorted) {
    const options: LabelPlacement[] = [];
    const step = anchor.height + 8;
    for (let row = -5; row <= 5; row++) {
      for (let col = -2; col <= 2; col++) {
        const left = Math.max(
          bounds.left,
          Math.min(
            bounds.right - anchor.width,
            anchor.x - anchor.width / 2 + col * (anchor.width + 8),
          ),
        );
        const top = Math.max(
          bounds.top,
          Math.min(
            bounds.bottom - anchor.height,
            anchor.y - anchor.height / 2 + row * step,
          ),
        );
        if (
          left < bounds.left ||
          top < bounds.top ||
          left + anchor.width > bounds.right ||
          top + anchor.height > bounds.bottom
        )
          continue;
        options.push({ ...anchor, left, top });
      }
    }
    options.sort(
      (a, b) =>
        Math.hypot(a.left + a.width / 2 - a.x, a.top + a.height / 2 - a.y) -
        Math.hypot(b.left + b.width / 2 - b.x, b.top + b.height / 2 - b.y),
    );
    const free = options.find((candidate) =>
      placed.every((other) => !overlaps(candidate, other)),
    );
    if (free) placed.push(free);
    else overflow.push(anchor.id);
  }
  return { placed, overflow };
}
