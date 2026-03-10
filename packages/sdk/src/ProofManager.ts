import type { CompiledCircuit } from "@noir-lang/noir_js";
import { getName, getActiveVersion } from "./chain";
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

  /**
   * End-to-end compliance proof generation.
   * Fetches the active definition and circuit, calls the user-provided
   * formatter to build circuit inputs, then generates the proof.
   */
  async generateComplianceProof(
    contractAddress: `0x${string}`,
    formatter: InputFormatter,
  ): Promise<ProofResult> {
    const definition = await this.getActiveDefinition(contractAddress);
    const circuit = await this.fetchCircuit(definition.metadataHash);
    const inputs = await formatter({
      definition,
      circuit,
      proofManager: this,
    });
    return this.prove(circuit, inputs);
  }
}
