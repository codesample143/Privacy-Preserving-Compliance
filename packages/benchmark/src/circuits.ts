import { computeMerkleProof, computeMerkleProofForLeaf } from "@ppc/sdk";
import type { InputMap } from "@noir-lang/noirc_abi";
import { randomBytes } from "crypto";

export interface CircuitConfig {
  /** Circuit identifier matching the Nargo package name */
  name: string;
  /** Path to the Nargo project directory (contains Nargo.toml), relative to project root */
  projectDir: string;
  /** Path to the compiled circuit JSON, relative to project root */
  artifactPath: string;
  /** Generate a set of test leaves and a target address for this circuit */
  generateTestData: (leafCount: number) => { leaves: bigint[]; address: bigint };
  /** Generate circuit inputs from test data */
  generateInputs: (leaves: bigint[], address: bigint) => InputMap;
}

function toHex(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

/** Generate a random bigint that looks like an Ethereum address (160 bits). */
function randomAddress(): bigint {
  return BigInt("0x" + randomBytes(20).toString("hex"));
}

// ── Membership ────────────────────────────────────────────────────────

const membership: CircuitConfig = {
  name: "membership",
  projectDir: "circuits/membership",
  artifactPath: "circuits/membership/target/membership.json",

  generateTestData(leafCount: number) {
    const leaves: bigint[] = [];
    for (let i = 0; i < leafCount; i++) {
      leaves.push(randomAddress());
    }
    // Pick a random leaf as the address to prove membership for
    const address = leaves[Math.floor(Math.random() * leaves.length)];
    return { leaves, address };
  },

  generateInputs(leaves: bigint[], address: bigint): InputMap {
    const proof = computeMerkleProofForLeaf(leaves, address);
    return {
      address: toHex(address),
      root: proof.root,
      index: proof.index,
      hash_path: proof.hashPath,
    };
  },
};

// ── Non-membership ────────────────────────────────────────────────────

const nonMembership: CircuitConfig = {
  name: "non_membership",
  projectDir: "circuits/non_membership",
  artifactPath: "circuits/non_membership/target/non_membership.json",

  generateTestData(leafCount: number) {
    // Generate sorted leaves for the non-membership tree
    const leaves: bigint[] = [];
    for (let i = 0; i < leafCount; i++) {
      leaves.push(randomAddress());
    }
    leaves.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    // Pick an address NOT in the set, between two existing leaves (sandwich case)
    let address: bigint;
    if (leaves.length >= 2) {
      // Find a gap between two adjacent leaves
      const lowerIdx = Math.floor(Math.random() * (leaves.length - 1));
      const lower = leaves[lowerIdx];
      const upper = leaves[lowerIdx + 1];
      // Midpoint between two leaves — guaranteed not in the set
      address = lower + (upper - lower) / 2n;
      // Edge case: if midpoint equals lower (leaves are adjacent values), shift up
      if (address === lower) address = lower + 1n;
      if (address >= upper) {
        // Leaves are consecutive, fall back to above-max
        address = leaves[leaves.length - 1] + 1n;
      }
    } else {
      // Single leaf — go above max
      address = leaves[0] + 1n;
    }

    return { leaves, address };
  },

  generateInputs(leaves: bigint[], address: bigint): InputMap {
    const target = address;

    if (target < leaves[0]) {
      // Below minimum
      const upperProof = computeMerkleProof(leaves, 0);
      return {
        address: toHex(target),
        root: upperProof.root,
        lower_leaf: toHex(0n),
        upper_leaf: toHex(leaves[0]),
        lower_index: "0",
        upper_index: upperProof.index,
        lower_hash_path: upperProof.hashPath,
        upper_hash_path: upperProof.hashPath,
        proof_type: "1",
      };
    } else if (target > leaves[leaves.length - 1]) {
      // Above maximum
      const lastIdx = leaves.length - 1;
      const lowerProof = computeMerkleProof(leaves, lastIdx);
      // Compute merkle path for the empty position at lastIdx+1
      const leavesWithEmpty = [...leaves, 0n];
      const emptyProof = computeMerkleProof(leavesWithEmpty, leaves.length);
      return {
        address: toHex(target),
        root: lowerProof.root,
        lower_leaf: toHex(leaves[lastIdx]),
        upper_leaf: toHex(0n),
        lower_index: lowerProof.index,
        upper_index: "0",
        lower_hash_path: lowerProof.hashPath,
        upper_hash_path: emptyProof.hashPath,
        proof_type: "2",
      };
    } else {
      // Sandwich: find two adjacent leaves bounding the address
      const upperIdx = leaves.findIndex((leaf) => leaf > target);
      const lowerIdx = upperIdx - 1;
      const lowerProof = computeMerkleProof(leaves, lowerIdx);
      const upperProof = computeMerkleProof(leaves, upperIdx);
      return {
        address: toHex(target),
        root: lowerProof.root,
        lower_leaf: toHex(leaves[lowerIdx]),
        upper_leaf: toHex(leaves[upperIdx]),
        lower_index: lowerProof.index,
        upper_index: upperProof.index,
        lower_hash_path: lowerProof.hashPath,
        upper_hash_path: upperProof.hashPath,
        proof_type: "0",
      };
    }
  },
};

// ── Registry ──────────────────────────────────────────────────────────

export const circuits: Record<string, CircuitConfig> = {
  membership,
  non_membership: nonMembership,
};
