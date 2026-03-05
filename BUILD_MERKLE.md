# build-merkle

Builds a Poseidon2 sparse merkle tree (depth 32) from Ethereum addresses. Outputs the merkle root to stdout and writes the leaves to a JSON file compatible with the regulator CLI and proof manager SDK.

Uses the same `@zkpassport/poseidon2` hash as the SDK and Noir circuits, so roots and proofs are guaranteed to be compatible.

## Prerequisites

From the repository root:

```bash
pnpm install
```

## Usage

```bash
npx tsx packages/build-merkle/index.ts [options] <address> [address...]
```

### Options

| Flag | Description |
|------|-------------|
| `-o <file>` | Output leaves JSON file (default: `leaves.json`) |
| `-f <file>` | Read addresses from a file (one per line, `#` comments ignored) |
| `-h` | Show help |

### Examples

Pass addresses directly:

```bash
npx tsx packages/build-merkle/index.ts \
  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 \
  0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B
```

Read from a file:

```bash
npx tsx packages/build-merkle/index.ts -f addresses.txt -o leaves.json
```

Where `addresses.txt` contains:

```
# Compliant addresses
0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B
```

## Output

- **stdout** — Merkle root as a `0x`-prefixed 64-character hex string.
- **leaves.json** (or path given by `-o`) — JSON array of hex address strings.

Example leaves file:

```json
[
  "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
  "0xab5801a7d398351b8be11c439e05c5b3259aec9b"
]
```

## Using with the regulator CLI

```bash
ROOT=$(npx tsx packages/build-merkle/index.ts -o leaves.json -f addresses.txt)

regulator-cli new-compliance-definition \
  --merkle-root "$ROOT" \
  --leaves-file leaves.json \
  # ... other flags
```

Or when updating an existing compliance definition:

```bash
ROOT=$(npx tsx packages/build-merkle/index.ts -o leaves.json 0xaddr1 0xaddr2)

regulator-cli publish \
  --merkle-root "$ROOT" \
  --leaves-file leaves.json \
  # ... other flags
```

The regulator CLI uploads `leaves.json` to IPFS and stores both the merkle root and the leaves CID on-chain. The proof manager SDK then fetches the leaves from IPFS and computes merkle proofs for individual users.
