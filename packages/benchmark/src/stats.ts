export interface Stats {
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

export function computeStats(values: number[]): Stats {
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return { mean, min, max, stddev };
}
