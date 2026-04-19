import type { BenchResult } from "./bench.js";
import { computeStats, type Stats } from "./stats.js";

export interface BenchmarkOutput {
  circuit: string;
  timestamp: string;
  config: {
    runs: number;
    leaves: number;
  };
  system: {
    platform: string;
    arch: string;
    runtime: string;
  };
  barretenbergInitMs: number;
  results: BenchResult[];
  aggregate: {
    witnessGeneration: Stats;
    proofGeneration: Stats;
    total: Stats;
  };
}

export function buildOutput(
  circuit: string,
  runs: number,
  leaves: number,
  barretenbergInitMs: number,
  results: BenchResult[],
  system: { platform: string; arch: string; runtime: string },
): BenchmarkOutput {
  return {
    circuit,
    timestamp: new Date().toISOString(),
    config: { runs, leaves },
    system,
    barretenbergInitMs,
    results,
    aggregate: {
      witnessGeneration: computeStats(results.map((r) => r.witnessGenerationMs)),
      proofGeneration: computeStats(results.map((r) => r.proofGenerationMs)),
      total: computeStats(results.map((r) => r.totalMs)),
    },
  };
}
