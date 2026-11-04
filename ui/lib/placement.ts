/**
 * Card placement. Pure geometry, no DOM. All rects share one coordinate space (for example the
 * pointer layer's space), and the returned x and y are the card's top-left corner in that space.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = "left" | "right" | "top" | "bottom";

export interface Placement {
  x: number;
  y: number;
  side: Side;
}

/** Gap kept between the target and the card on the chosen side. */
export const CARD_MARGIN = 24;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Pick the side of `target` with the most free space inside `container`, and put the card there:
 * outside the target plus `margin`, centred on the target along the other axis, clamped so the card
 * stays inside the container. A side where the card fits wins over a larger side where it does not.
 * Ties resolve in the order right, left, bottom, top.
 */
export function placeCard(target: Rect, container: Rect, card: Size, margin: number = CARD_MARGIN): Placement {
  const free: Record<Side, number> = {
    right: container.x + container.width - (target.x + target.width) - margin,
    left: target.x - container.x - margin,
    bottom: container.y + container.height - (target.y + target.height) - margin,
    top: target.y - container.y - margin,
  };
  const need: Record<Side, number> = {
    right: card.width,
    left: card.width,
    bottom: card.height,
    top: card.height,
  };

  const order: Side[] = ["right", "left", "bottom", "top"];
  const fits = order.filter((side) => free[side] >= need[side]);
  const pool = fits.length > 0 ? fits : order;
  let side = pool[0];
  for (const candidate of pool) {
    if (free[candidate] > free[side]) side = candidate;
  }

  const minX = container.x;
  const maxX = container.x + container.width - card.width;
  const minY = container.y;
  const maxY = container.y + container.height - card.height;
  const centreX = target.x + target.width / 2 - card.width / 2;
  const centreY = target.y + target.height / 2 - card.height / 2;

  let x: number;
  let y: number;
  if (side === "right") {
    x = target.x + target.width + margin;
    y = centreY;
  } else if (side === "left") {
    x = target.x - margin - card.width;
    y = centreY;
  } else if (side === "bottom") {
    x = centreX;
    y = target.y + target.height + margin;
  } else {
    x = centreX;
    y = target.y - margin - card.height;
  }

  return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY), side };
}
