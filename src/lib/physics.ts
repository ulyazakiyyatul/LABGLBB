export type Point = { t: number; x: number; y: number; detected?: boolean };
export type KinematicPoint = Point & { v: number; a: number };

/**
 * Smooth small frame-to-frame centroid jitter before numerical differentiation.
 * The original time values are retained; invalid and duplicate timestamps are removed.
 */
export function deriveKinematics(points: Point[]): KinematicPoint[] {
  const sorted = points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.x) && Number.isFinite(point.y))
    .filter((point) => point.detected !== false)
    .sort((a, b) => a.t - b.t)
    .filter((point, index, list) => index === 0 || point.t > list[index - 1].t);

  if (!sorted.length) return [];

  const radius = sorted.length >= 9 ? 2 : sorted.length >= 7 ? 1 : 0;
  const smoothed = sorted.map((point, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(sorted.length - 1, index + radius);
    const window = sorted.slice(start, end + 1);
    return {
      ...point,
      x: window.reduce((sum, item) => sum + item.x, 0) / window.length,
      y: window.reduce((sum, item) => sum + item.y, 0) / window.length,
    };
  });

  const velocities = smoothed.map(() => 0);
  if (smoothed.length === 2) {
    const dt = smoothed[1].t - smoothed[0].t;
    const velocity = dt > 0 ? (smoothed[1].x - smoothed[0].x) / dt : 0;
    velocities[0] = velocity;
    velocities[1] = velocity;
  } else if (smoothed.length > 2) {
    for (let index = 1; index < smoothed.length - 1; index++) {
      const dt = smoothed[index + 1].t - smoothed[index - 1].t;
      velocities[index] = dt > 0 ? (smoothed[index + 1].x - smoothed[index - 1].x) / dt : 0;
    }
    const edge = radius > 0 ? radius + 2 : 1;
    for (let index = 0; index < edge; index++) velocities[index] = velocities[edge];
    for (let index = smoothed.length - edge; index < smoothed.length; index++) velocities[index] = velocities[smoothed.length - edge - 1];
  }

  const accelerations = smoothed.map(() => 0);
  if (smoothed.length > 2) {
    for (let index = 1; index < smoothed.length - 1; index++) {
      const leftDt = smoothed[index].t - smoothed[index - 1].t;
      const rightDt = smoothed[index + 1].t - smoothed[index].t;
      if (leftDt > 0 && rightDt > 0) {
        const leftSlope = (smoothed[index].x - smoothed[index - 1].x) / leftDt;
        const rightSlope = (smoothed[index + 1].x - smoothed[index].x) / rightDt;
        accelerations[index] = (2 * (rightSlope - leftSlope)) / (leftDt + rightDt);
      }
    }
    const edge = radius > 0 ? radius + 2 : 1;
    for (let index = 0; index < edge; index++) accelerations[index] = accelerations[edge];
    for (let index = smoothed.length - edge; index < smoothed.length; index++) accelerations[index] = accelerations[smoothed.length - edge - 1];
  }

  return smoothed.map((point, index) => ({ ...point, v: velocities[index], a: accelerations[index] }));
}

/** Least-squares fit x(t) = x0 + v0*t + 1/2*a*t^2, using centered time for stability. */
export function fitQuadratic(points: Point[]) {
  const clean = points
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.x) && point.detected !== false)
    .sort((a, b) => a.t - b.t)
    .filter((point, index, list) => index === 0 || point.t > list[index - 1].t);
  const n = clean.length;
  if (n < 3) return null;

  const meanTime = clean.reduce((sum, point) => sum + point.t, 0) / n;
  const rows = clean.map((point) => ({ t: point.t - meanTime, x: point.x }));
  const sums = [
    rows.reduce((sum, point) => sum + 1, 0),
    rows.reduce((sum, point) => sum + point.t, 0),
    rows.reduce((sum, point) => sum + point.t ** 2, 0),
    rows.reduce((sum, point) => sum + point.t ** 3, 0),
    rows.reduce((sum, point) => sum + point.t ** 4, 0),
    rows.reduce((sum, point) => sum + point.x, 0),
    rows.reduce((sum, point) => sum + point.t * point.x, 0),
    rows.reduce((sum, point) => sum + point.t ** 2 * point.x, 0),
  ];

  // Augmented normal-equation matrix for [A, B, C] in x = A*tau^2 + B*tau + C.
  const matrix = [
    [sums[4], sums[3], sums[2], sums[7]],
    [sums[3], sums[2], sums[1], sums[6]],
    [sums[2], sums[1], sums[0], sums[5]],
  ];

  for (let column = 0; column < 3; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < 3; row++) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(matrix[pivotRow][column]) < 1e-12) return null;
    [matrix[column], matrix[pivotRow]] = [matrix[pivotRow], matrix[column]];
    const pivot = matrix[column][column];
    for (let j = column; j < 4; j++) matrix[column][j] /= pivot;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let j = column; j < 4; j++) matrix[row][j] -= factor * matrix[column][j];
    }
  }

  const [quadratic, linear, constant] = matrix.map((row) => row[3]);
  const acceleration = 2 * quadratic;
  const initialVelocity = linear - 2 * quadratic * meanTime;
  const initialPosition = quadratic * meanTime ** 2 - linear * meanTime + constant;
  const meanX = sums[5] / n;
  const total = clean.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const residual = clean.reduce((sum, point) => {
    const predicted = quadratic * (point.t - meanTime) ** 2 + linear * (point.t - meanTime) + constant;
    return sum + (point.x - predicted) ** 2;
  }, 0);
  const r2 = total < 1e-12 ? null : 1 - residual / total;
  if (![initialPosition, initialVelocity, acceleration].every(Number.isFinite)) return null;

  const sign = (value: number) => (value < 0 ? "−" : "+");
  const equation = `x(t) = ${initialPosition.toFixed(4)} ${sign(initialVelocity)} ${Math.abs(initialVelocity).toFixed(4)}t ${sign(acceleration / 2)} ${Math.abs(acceleration / 2).toFixed(4)}t²`;
  return { x0: initialPosition, v0: initialVelocity, a: acceleration, r2, equation };
}

export function toCsv(rows: Record<string, string | number | boolean>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [keys.map(escape).join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\r\n");
}
