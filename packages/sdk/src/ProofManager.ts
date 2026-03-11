import type { CompiledCircuit } from "@noir-lang/noir_js";
import { getName, getActiveVersion, getVersionCount } from "./chain";
import { fetchCircuit, fetchLeaves } from "./ipfs";
import { generateProof } from "./prove";
import type { InputMap } from "@noir-lang/noirc_abi";
import type {
  ProofManagerConfig,
  ComplianceVersion,
  InputFormatter,
  ProofResult,
} from "./types";

export class ProofManager {
  private config: ProofManagerConfig;
  private proofCache = new Map<string, ProofResult>();

  constructor(config: ProofManagerConfig) {
    this.config = config;
  }

  async getName(contractAddress: `0x${string}`): Promise<string> {
    return getName(this.config.rpcUrl, contractAddress);
  }

  async getActiveDefinition(
    contractAddress: `0x${string}`,
  ): Promise<ComplianceVersion> {
    return getActiveVersion(this.config.rpcUrl, contractAddress);
  }

  async fetchCircuit(metadataHash: string): Promise<CompiledCircuit> {
    return fetchCircuit(this.config.ipfsGatewayUrl, metadataHash);
  }

  async prove(
    circuit: CompiledCircuit,
    inputs: InputMap,
  ): Promise<ProofResult> {
    return generateProof(circuit, inputs);
  }

  async fetchLeaves(leavesCid: string): Promise<bigint[]> {
    return fetchLeaves(this.config.ipfsGatewayUrl, leavesCid);
  }

  async getVersionCount(
    contractAddress: `0x${string}`,
  ): Promise<bigint> {
    return getVersionCount(this.config.rpcUrl, contractAddress);
  }

  /**
   * End-to-end compliance proof generation with caching.
   * Proofs are cached by ComplianceDefinition address and version count,
   * so multiple apps using the same definition reuse the same proof.
   */
  async generateComplianceProof(
    contractAddress: `0x${string}`,
    formatter: InputFormatter,
  ): Promise<ProofResult> {
    const versionCount = await this.getVersionCount(contractAddress);
    const cacheKey = `${contractAddress.toLowerCase()}:${versionCount}`;

    const cached = this.proofCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const definition = await this.getActiveDefinition(contractAddress);
    const circuit = await this.fetchCircuit(definition.metadataHash);
    const inputs = await formatter({
      definition,
      circuit,
      proofManager: this,
    });
    const result = await this.prove(circuit, inputs);

    this.proofCache.set(cacheKey, result);
    return result;
  }

  /** Return a cached proof for the given ComplianceDefinition, or undefined on miss. */
  getCachedProof(
    contractAddress: `0x${string}`,
    versionCount?: bigint,
  ): ProofResult | undefined {
    if (versionCount !== undefined) {
      return this.proofCache.get(
        `${contractAddress.toLowerCase()}:${versionCount}`,
      );
    }
    // Without versionCount, find any entry matching this address
    for (const [key, value] of this.proofCache) {
      if (key.startsWith(contractAddress.toLowerCase() + ":")) {
        return value;
      }
    }
    return undefined;
  }

  /** Clear all cached proofs. */
  clearProofCache(): void {
    this.proofCache.clear();
  }
}
