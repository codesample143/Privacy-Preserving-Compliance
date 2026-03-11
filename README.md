# Privacy-Preserving-Compliance
Prototype implementation of masters thesis framework `Privacy Preserving Compliance`.  The current draft of my thesis can be found at [https://github.com/JossDuff/thesis](https://github.com/JossDuff/thesis).

This code is for demonstration purposes only.  It is not audited and should not be used in production environments.

## Overview

This repository contains the implementation of a framework for composable privacy-preserving compliance on blockchain systems. The framework enables regulatory bodies to publish compliance definitions, applications to require compliance proofs, and users to prove compliance without revealing private transaction data.

### Key Features

- **No Deanonymization**: Users prove compliance without revealing transaction histories or balances
- **Proactive Compliance**: Non-compliant actors are blocked before transactions, not detected after
- **Rich Compliance Language**: Express complex requirements using composable constraints
- **Multiple Compliance**: Support for requirements from multiple regulatory jurisdictions
- **Chain Agnostic**: Works on any blockchain with smart contracts and ZK proof verification
- **Modular Privacy**: Compatible with any privacy protocol

---

## Framework Actors

The framework supports three types of actors:

1. **Regulators**: Create and publish compliance definitions
2. **Applications**: Select relevant compliance definitions and require proofs from users
3. **Users**: Generate ZK proofs demonstrating compliance without revealing private data

### System Components
```
┌─────────────┐
│  Regulator  │
│    CLI      │
└──────┬──────┘
       │ publishes
       ▼
┌─────────────────────┐
│ ComplianceDefinition│
│   Verifier Contract │◄────────┐
└──────┬──────────────┘         │
       │                        │ requires
       │                        │
       ▼                   ┌────┴─────┐
┌─────────────┐            │   Dapp   │
│    User     │            │ Contract │
│Proof Manager│───────────►│          │
└─────────────┘  submits   └──────────┘
                  proof
```


## Repository Structure
```
privacy-preserving-compliance/
├── circuits/               # Example Noir compliance circuits
├── contracts/             # Solidity smart contracts
├── regulator-cli/         # Rust CLI for regulators
│   └── src/
├── proof-manager/         # Rust proof generation system
│   └── src/
```

# Developing

```bash 
# Build 
cargo build --bin regulator-cli
cargo build --bin proof-manager

# Build and run.  For debugging, omit --release
cargo run --release --bin regulator-cli
cargo run --release --bin proof-manager

# NOIR CIRCUITS
cd circuits/hello_world
nargo check
# Add circuit input to circuits/hello_world/Prover.toml
# Then execute to generate the witness
nargo execute
# generate proof and write the verification key to a file
bb prove -b ./target/hello_world.json -w ./target/hello_world.gz --write_vk -o target
# verify the proof using the vk
bb verify -p ./target/proof -k ./target/vk

# DEPLOYING NOIR CIRCUIT VERIFIER
# Generate the verification key. You need to pass the `--oracle_hash keccak` flag when generating vkey and proving
# to instruct bb to use keccak as the hash function, which is more optimal in Solidity
bb write_vk -b ./target/hello_world.json -o ./target --oracle_hash keccak
# Generate the Solidity verifier from the vkey
bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol

```



# Contributing
All contributions must be made by opening a PR to main and requires a review to be merged.  Include sufficient tests with any code implemented.

This is a master's thesis project and feedback and suggestions are welcome. Please open issues for bugs or feature requests.


# Building to host
pnpm --filter @ppc/sdk build && pnpm --filter @ppc/demo build && cp -r packages/demo/dist/* /path/to/your-username.github.io/ppc-demo/
