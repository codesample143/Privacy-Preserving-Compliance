import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { CompiledCircuit } from "@noir-lang/noir_js";
import { circuits } from "./circuits.js";
import { compileCircuit } from "./compile.js";
import { runBenchmark } from "./bench.js";
import { buildOutput, writeResult } from "./output.js";
import type { Stats } from "./stats.js";

// ── Helpers ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

function usage(): never {
  console.error(
    `Usage: pnpm bench --circuit <name> --runs <N> [--leaves <count>] [--skip-compile]

Options:
  --circuit       Circuit to benchmark (${Object.keys(circuits).join(", ")})
  --runs          Number of benchmark iterations
  --leaves        Number of leaves in test merkle tree (default: 10)
  --skip-compile  Skip nargo compile, use existing artifacts`,
  );
  process.exit(1);
}

function formatMs(ms: number): string {
  return (ms / 1000).toFixed(2) + "s";
}

function formatStats(label: string, stats: Stats): string {
  return `    ${label.padEnd(10)} mean=${formatMs(stats.mean)}  min=${formatMs(stats.min)}  max=${formatMs(stats.max)}  stddev=${formatMs(stats.stddev)}`;
}

// ── Arg parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
let circuitName: string | undefined;
let runs: number | undefined;
let leaves = 10;
let skipCompile = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--circuit" && i + 1 < args.length) {
    circuitName = args[++i];
  } else if (args[i] === "--runs" && i + 1 < args.length) {
    runs = parseInt(args[++i], 10);
  } else if (args[i] === "--leaves" && i + 1 < args.length) {
    leaves = parseInt(args[++i], 10);
  } else if (args[i] === "--") {
    continue;
  } else if (args[i] === "--skip-compile") {
    skipCompile = true;
  } else if (args[i] === "-h" || args[i] === "--help") {
    usage();
  } else {
    console.error(`Unknown argument: ${args[i]}`);
    usage();
  }
}

if (!circuitName || !runs) {
  console.error("Error: --circuit and --runs are required.");
  usage();
}

const config = circuits[circuitName];
if (!config) {
  console.error(
    `Error: Unknown circuit "${circuitName}". Available: ${Object.keys(circuits).join(", ")}`,
  );
  process.exit(1);
}

if (isNaN(runs) || runs < 1) {
  console.error("Error: --runs must be a positive integer.");
  process.exit(1);
}

if (isNaN(leaves) || leaves < 1) {
  console.error("Error: --leaves must be a positive integer.");
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────

// Compile circuit
if (!skipCompile) {
  compileCircuit(config.projectDir, PROJECT_ROOT);
}

// Check artifact exists
const artifactPath = resolve(PROJECT_ROOT, config.artifactPath);
try {
  readFileSync(artifactPath);
} catch {
  console.error(`Error: Compiled circuit not found at ${config.artifactPath}`);
  console.error(`Run \`cd ${config.projectDir} && nargo compile\` first.`);
  process.exit(1);
}

// Load compiled circuit
const circuit: CompiledCircuit = JSON.parse(readFileSync(artifactPath, "utf-8"));

// Generate test data
console.log(`Generating test data (${leaves} leaves)...`);
const { leaves: testLeaves, address } = config.generateTestData(leaves);
const inputs = config.generateInputs(testLeaves, address);

// Run benchmark
console.log(`\nBenchmarking: ${circuitName} (${leaves} leaves, ${runs} runs)\n`);
const { barretenbergInitMs, results } = await runBenchmark(circuit, inputs, runs);

console.log(`  Barretenberg init: ${formatMs(barretenbergInitMs)}\n`);

for (const r of results) {
  console.log(
    `  Run ${r.run}: witness=${formatMs(r.witnessGenerationMs)}  proof=${formatMs(r.proofGenerationMs)}  total=${formatMs(r.totalMs)}`,
  );
}

// Build output and compute aggregates
const output = buildOutput(circuitName, runs, leaves, barretenbergInitMs, results);

console.log(`\n  Aggregate (${runs} runs):`);
console.log(formatStats("Witness:", output.aggregate.witnessGeneration));
console.log(formatStats("Proof:", output.aggregate.proofGeneration));
console.log(formatStats("Total:", output.aggregate.total));

// Write results
const filepath = writeResult(output, PROJECT_ROOT);
console.log(`\nResults saved to ${filepath}`);
