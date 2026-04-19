# Benchmark Suite

Benchmarks proof generation times for Noir circuits using two benchmark applications that share the same core logic:

- **Server-side** (`packages/benchmark-native/`) — CLI tool using Barretenberg's native binary backend
- **Client-side** (`packages/benchmark-browser/`) — Browser app using Barretenberg's WASM backend

Both measure the same phases (witness generation, proof generation) with identical circuit inputs. The only variable is the Barretenberg execution mode, isolating the performance impact of the runtime environment from the circuit complexity itself.

## Prerequisites

- Node.js >= 20
- `nargo` installed and on PATH (matching the project's Noir version)
- `pnpm install` and `pnpm build` run at the project root

## Server-side Benchmark (Native)

Uses Barretenberg's native binary backend. Represents the fastest possible proving on a given machine — relevant for server-side proof generation.

```
pnpm bench -- --circuit <name> --runs <N> [--leaves <count>] [--skip-compile]
```

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--circuit` | Yes | — | Circuit to benchmark (`membership`, `non_membership`) |
| `--runs` | Yes | — | Number of benchmark iterations |
| `--leaves` | No | 10 | Number of leaves in the test merkle tree |
| `--skip-compile` | No | — | Skip `nargo compile`, use existing artifacts |

### Examples

```bash
# Benchmark membership proof, 5 runs with 10 leaves
pnpm bench -- --circuit membership --runs 5

# Benchmark non-membership proof, 3 runs with 100 leaves
pnpm bench -- --circuit non_membership --runs 3 --leaves 100

# Skip recompilation for repeated runs
pnpm bench -- --circuit membership --runs 10 --skip-compile
```

Results are written to `benchmark-data/` at the project root (gitignored).

## Client-side Benchmark (Browser WASM)

Uses Barretenberg's WASM backend in a real browser environment. Captures the proving latency that end users actually experience, including Web Worker threading, browser memory constraints, and WASM bootstrap costs.

```bash
# Compile circuits first (browser can't run nargo)
cd circuits/membership && nargo compile
cd circuits/non_membership && nargo compile

# Start the benchmark app
pnpm dev:bench
```

Open `http://localhost:5173` in the browser. Select a circuit, configure runs and leaves, and click "Start Benchmark." Results display in real-time and can be downloaded as JSON.

## What It Measures

Each benchmark run captures three timings:

- **Witness generation** — executing the circuit logic (`noir.execute()`) to solve all constraints and produce a complete variable assignment
- **Proof generation** — running the Barretenberg cryptographic prover (`backend.generateProof()`) to produce an UltraHonk proof
- **Total** — wall-clock time for both phases combined

**Barretenberg init time** is recorded separately. This is the one-time cost of booting the proving runtime, measured outside the benchmark loop. It is negligible for the native backend but significant for WASM.

### Backend selection

`Barretenberg.new()` auto-detects the environment:
- In Node.js: selects the **native binary backend** (NativeUnixSocket)
- In the browser: selects the **WASM backend** (WasmWorker)

Both benchmark apps call `Barretenberg.new()` with no options — the environment determines the backend automatically. The shared benchmark runner (`runBenchmark`) accepts a pre-initialized `Barretenberg` API instance and is agnostic to which backend is behind it.

## Output

Both benchmarks produce the same JSON schema:

```json
{
  "circuit": "membership",
  "timestamp": "2026-03-25T15:09:00.000Z",
  "config": { "runs": 5, "leaves": 10 },
  "system": { "platform": "linux", "arch": "x64", "runtime": "Node.js v22.11.0 (native)" },
  "barretenbergInitMs": 11.4,
  "results": [
    {
      "run": 1,
      "witnessGenerationMs": 80.2,
      "proofGenerationMs": 469.8,
      "totalMs": 550.1
    }
  ],
  "aggregate": {
    "witnessGeneration": { "mean": 46.6, "min": 13.0, "max": 80.2, "stddev": 33.6 },
    "proofGeneration": { "mean": 492.1, "min": 469.8, "max": 514.4, "stddev": 22.3 },
    "total": { "mean": 538.8, "min": 527.5, "max": 550.1, "stddev": 11.3 }
  }
}
```

The `system.runtime` field distinguishes between `"Node.js v22.11.0 (native)"` and `"Browser (WASM)"`.

- **Server-side:** results are written to `benchmark-data/<circuit>-<timestamp>.json`
- **Client-side:** results are downloaded via the browser's "Download Results JSON" button

## Adding a New Circuit Benchmark

To benchmark a new circuit, add an entry to the circuit registry in `packages/benchmark-native/src/circuits.ts`.

### 1. Define the circuit config

Each circuit needs a `CircuitConfig` with five fields:

```ts
const myCircuit: CircuitConfig = {
  // Must match the Nargo package name
  name: "my_circuit",

  // Path to the Nargo project (contains Nargo.toml)
  projectDir: "circuits/my_circuit",

  // Path to the compiled artifact (produced by nargo compile)
  artifactPath: "circuits/my_circuit/target/my_circuit.json",

  // Generate test data: a set of merkle leaves and a target address
  generateTestData(leafCount: number) {
    // Create leaves and pick/generate an address for the proof
    // Return { leaves, address }
  },

  // Convert test data into the circuit's expected InputMap
  generateInputs(leaves: bigint[], address: bigint): InputMap {
    // Compute merkle proofs, format fields as hex strings
    // Return an object matching the circuit's parameter names
  },
};
```

### 2. Register it

Add the config to the `circuits` record at the bottom of `circuits.ts`:

```ts
export const circuits: Record<string, CircuitConfig> = {
  membership,
  non_membership: nonMembership,
  my_circuit: myCircuit,
};
```

The circuit is now available via `--circuit my_circuit` (CLI) and in the browser dropdown.

For the browser benchmark, also add a loader entry in `packages/benchmark-browser/src/main.ts`:

```ts
const circuitModules: Record<string, () => Promise<CompiledCircuit>> = {
  // ... existing entries ...
  my_circuit: () =>
    import("@circuits/my_circuit/target/my_circuit.json").then((m) => m.default as unknown as CompiledCircuit),
};
```

### Key conventions

- **Field values** should be formatted as `"0x"` + hex padded to 64 chars (32 bytes)
- **Array inputs** (like `hash_path`) are arrays of hex strings
- **Scalar inputs** (like `index`, `proof_type`) are decimal strings
- Use SDK utilities (`computeMerkleProof`, `computeMerkleProofForLeaf`) for merkle proof computation
- SDK might need to be extended to support generating input needed for the proof if it's a new type

## Architecture

```
packages/benchmark-native/src/
├── core.ts        Shared exports (circuits, bench, stats, output)
├── index.ts       CLI entry point — native Barretenberg
├── circuits.ts    Circuit registry (test data + input generation per circuit)
├── compile.ts     Runs nargo compile on the circuit's project directory
├── bench.ts       Benchmark runner (witness/proof timing loop)
├── stats.ts       Aggregate statistics (mean, min, max, stddev)
└── output.ts      JSON result builder

packages/benchmark-browser/
├── index.html     Benchmark UI
├── vite.config.ts Vite config (COEP/COOP headers, circuit alias)
└── src/main.ts    Browser entry point — WASM Barretenberg
```

The shared benchmark runner accepts a pre-initialized `Barretenberg` API instance and is agnostic to the backend. Each entry point initializes Barretenberg, times the init, and passes the API to the shared runner.

## Future Work

### Circuits requiring on-chain data

The current circuits (membership, non-membership) only need merkle leaves and a root. Future circuits may require indexing the blockchain for specific events. The `CircuitConfig` interface can be extended with an optional data-fetching method:

```ts
interface CircuitConfig {
  // ... existing fields ...
  fetchOnChainData?: (rpcUrl: string) => Promise<unknown>;
}
```

This would pair with a `--rpc-url` CLI flag required only when the selected circuit needs on-chain data.

### Leaf count sweeps

Run benchmarks across multiple leaf counts to produce a performance curve:

```
pnpm bench -- --circuit membership --runs 5 --leaves 10,100,1000
```

### Cross-browser benchmarking

The browser benchmark currently runs on whichever browser the user opens it in. Cross-browser comparison (Chrome, Firefox, Safari) would reveal WASM engine differences, as each browser uses a different JavaScript/WASM engine (V8, SpiderMonkey, JavaScriptCore).
