import type { CompiledCircuit } from "@noir-lang/noir_js";
import type { InputMap } from "@noir-lang/noirc_abi";
import type { ProofManager } from "./ProofManager";

/** Configuration for the ProofManager */
export interface ProofManagerConfig {
  /** Ethereum JSON-RPC URL (e.g., Sepolia Infura endpoint) */
  rpcUrl: string;
  /** IPFS gateway URL (e.g., http://localhost:8080) */
  ipfsGatewayUrl: string;
}

/** On-chain ComplianceVersion struct */
export interface ComplianceVersion {
  verifier: `0x${string}`;
  merkleRoot1: `0x${string}`;
  merkleRoot2: `0x${string}`;
  tStart: bigint;
  tEnd: bigint;
  metadataHash: string;
  leavesHash: string;
  leavesHashB: string;
}

/** Context passed to an InputFormatter so it can fetch data and build circuit inputs */
export interface FormatterContext {
  /** The active compliance definition fetched from the contract */
  definition: ComplianceVersion;
  /** The compiled Noir circuit (includes ABI with parameter names/types) */
  circuit: CompiledCircuit;
  /** The ProofManager instance, for calling fetchLeaves() etc. */
  proofManager: ProofManager;
}

/**
 * User-provided function that transforms application data into circuit inputs.
 * Each circuit type (membership, non-membership, etc.) needs its own formatter.
 */
export type InputFormatter = (ctx: FormatterContext) => Promise<InputMap>;

/** Result of proof generation */
export interface ProofResult {
  /** Proof bytes, hex-encoded, ready for on-chain submission */
  proof: `0x${string}`;
  /** Public inputs array, hex-encoded, for the verifier contract */
  publicInputs: `0x${string}`[];
}
