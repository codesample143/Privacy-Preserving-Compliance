import { Noir, type CompiledCircuit } from "@noir-lang/noir_js";
import type { Barretenberg } from "@aztec/bb.js";
import { UltraHonkBackend } from "@aztec/bb.js";
import type { InputMap } from "@noir-lang/noirc_abi";

export interface BenchResult {
  run: number;
  witnessGenerationMs: number;
  proofGenerationMs: number;
  totalMs: number;
}

/**
 * Run the benchmark loop using a pre-initialized Barretenberg API.
 * The caller is responsible for initializing and destroying the API,
 * and for timing the initialization separately.
 */
export async function runBenchmark(
  api: Barretenberg,
  circuit: CompiledCircuit,
  inputs: InputMap,
  runs: number,
): Promise<BenchResult[]> {
  const results: BenchResult[] = [];

  for (let i = 0; i < runs; i++) {
    const totalStart = performance.now();

    // Witness generation
    const witnessStart = performance.now();
    const noir = new Noir(circuit);
    const { witness } = await noir.execute(inputs);
    const witnessGenerationMs = performance.now() - witnessStart;

    // Proof generation
    const proofStart = performance.now();
    const backend = new UltraHonkBackend(circuit.bytecode, api);
    await backend.generateProof(witness, { verifierTarget: "evm" });
    const proofGenerationMs = performance.now() - proofStart;

    const totalMs = performance.now() - totalStart;

    results.push({
      run: i + 1,
      witnessGenerationMs,
      proofGenerationMs,
      totalMs,
    });
  }

  return results;
}
