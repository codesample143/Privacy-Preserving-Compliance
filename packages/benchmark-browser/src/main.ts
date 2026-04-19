import initACVM from "@noir-lang/acvm_js";
import initNoirC from "@noir-lang/noirc_abi";
import { Barretenberg } from "@aztec/bb.js";
import type { CompiledCircuit } from "@noir-lang/noir_js";
import {
  circuits,
  runBenchmark,
  buildOutput,
  type BenchmarkOutput,
} from "@ppc/benchmark-native";

// ── Circuit artifact loading ─────────────────────────────────────────

const circuitModules: Record<string, () => Promise<CompiledCircuit>> = {
  membership: () =>
    import("@circuits/membership/target/membership.json").then((m) => m.default as unknown as CompiledCircuit),
  non_membership: () =>
    import("@circuits/non_membership/target/non_membership.json").then((m) => m.default as unknown as CompiledCircuit),
};

// ── DOM refs ─────────────────────────────────────────────────────────

const $circuit = document.getElementById("circuit") as HTMLSelectElement;
const $runs = document.getElementById("runs") as HTMLInputElement;
const $leaves = document.getElementById("leaves") as HTMLInputElement;
const $start = document.getElementById("start") as HTMLButtonElement;
const $status = document.getElementById("status")!;
const $results = document.getElementById("results")!;
const $download = document.getElementById("download") as HTMLButtonElement;

// ── WASM init ────────────────────────────────────────────────────────

let wasmReady = false;

async function ensureWasm() {
  if (wasmReady) return;
  await Promise.all([initACVM(), initNoirC()]);
  wasmReady = true;
}

// ── Helpers ──────────────────────────────────────────────────────────

function setStatus(msg: string) {
  $status.textContent = msg;
}

function formatMs(ms: number): string {
  return (ms / 1000).toFixed(2) + "s";
}

let lastOutput: BenchmarkOutput | null = null;

// ── Benchmark flow ───────────────────────────────────────────────────

$start.addEventListener("click", async () => {
  $start.disabled = true;
  $results.style.display = "none";
  $download.style.display = "none";
  lastOutput = null;

  const circuitName = $circuit.value;
  const runs = parseInt($runs.value, 10);
  const leaves = parseInt($leaves.value, 10);

  if (isNaN(runs) || runs < 1 || isNaN(leaves) || leaves < 1) {
    setStatus("Runs and leaves must be positive integers.");
    $start.disabled = false;
    return;
  }

  const config = circuits[circuitName];
  if (!config) {
    setStatus(`Unknown circuit: ${circuitName}`);
    $start.disabled = false;
    return;
  }

  try {
    setStatus("Initializing WASM...");
    await ensureWasm();

    setStatus("Loading circuit artifact...");
    const loader = circuitModules[circuitName];
    if (!loader) {
      setStatus(`No artifact loader for circuit: ${circuitName}. Run nargo compile first.`);
      $start.disabled = false;
      return;
    }
    const circuit = await loader();

    setStatus(`Generating test data (${leaves} leaves)...`);
    const { leaves: testLeaves, address } = config.generateTestData(leaves);

    setStatus("Computing circuit inputs...");
    const inputs = config.generateInputs(testLeaves, address);

    setStatus("Initializing Barretenberg (WASM)...");
    const initStart = performance.now();
    const api = await Barretenberg.new();
    const barretenbergInitMs = performance.now() - initStart;

    let output = "";
    output += `Benchmarking: ${circuitName} (${leaves} leaves, ${runs} runs)\n\n`;
    output += `Barretenberg init: ${formatMs(barretenbergInitMs)}\n\n`;

    $results.textContent = output;
    $results.style.display = "block";

    setStatus(`Running benchmark... (0/${runs})`);
    const results = [];

    for (let i = 0; i < runs; i++) {
      setStatus(`Running benchmark... (${i + 1}/${runs})`);
      const runResults = await runBenchmark(api, circuit, inputs, 1);
      const r = { ...runResults[0], run: i + 1 };
      results.push(r);

      output += `Run ${r.run}: witness=${formatMs(r.witnessGenerationMs)}  proof=${formatMs(r.proofGenerationMs)}  total=${formatMs(r.totalMs)}\n`;
      $results.textContent = output;
    }

    await api.destroy();

    // Build output with aggregates
    const benchOutput = buildOutput(circuitName, runs, leaves, barretenbergInitMs, results, {
      platform: navigator.platform,
      arch: navigator.userAgent,
      runtime: "Browser (WASM)",
    });

    const agg = benchOutput.aggregate;
    output += `\nAggregate (${runs} runs):\n`;
    output += `  Witness:  mean=${formatMs(agg.witnessGeneration.mean)}  min=${formatMs(agg.witnessGeneration.min)}  max=${formatMs(agg.witnessGeneration.max)}  stddev=${formatMs(agg.witnessGeneration.stddev)}\n`;
    output += `  Proof:    mean=${formatMs(agg.proofGeneration.mean)}  min=${formatMs(agg.proofGeneration.min)}  max=${formatMs(agg.proofGeneration.max)}  stddev=${formatMs(agg.proofGeneration.stddev)}\n`;
    output += `  Total:    mean=${formatMs(agg.total.mean)}  min=${formatMs(agg.total.min)}  max=${formatMs(agg.total.max)}  stddev=${formatMs(agg.total.stddev)}\n`;

    $results.textContent = output;
    lastOutput = benchOutput;
    $download.style.display = "inline-block";
    setStatus("Done!");
  } catch (err) {
    setStatus(`Error: ${err instanceof Error ? err.message : err}`);
    console.error(err);
  } finally {
    $start.disabled = false;
  }
});

// ── Download results ─────────────────────────────────────────────────

$download.addEventListener("click", () => {
  if (!lastOutput) return;
  const json = JSON.stringify(lastOutput, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ts = lastOutput.timestamp.replace(/[:.]/g, "").slice(0, 15);
  a.download = `${lastOutput.circuit}-browser-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
