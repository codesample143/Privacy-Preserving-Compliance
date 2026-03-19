import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { BenchResult } from "./bench";
import { computeStats, type Stats } from "./stats";

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
    nodeVersion: string;
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
): BenchmarkOutput {
  return {
    circuit,
    timestamp: new Date().toISOString(),
    config: { runs, leaves },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    barretenbergInitMs,
    results,
    aggregate: {
      witnessGeneration: computeStats(results.map((r) => r.witnessGenerationMs)),
      proofGeneration: computeStats(results.map((r) => r.proofGenerationMs)),
      total: computeStats(results.map((r) => r.totalMs)),
    },
  };
}

export function writeResult(data: BenchmarkOutput, projectRoot: string): string {
  const dir = resolve(projectRoot, "benchmark-data");
  mkdirSync(dir, { recursive: true });

  const ts = data.timestamp.replace(/[:.]/g, "").replace("T", "T").slice(0, 15);
  const filename = `${data.circuit}-${ts}.json`;
  const filepath = resolve(dir, filename);

  writeFileSync(filepath, JSON.stringify(data, null, 2) + "\n");
  return filepath;
}
