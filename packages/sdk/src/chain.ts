import { createPublicClient, http } from "viem";
import { ComplianceDefinitionABI } from "./abi/ComplianceDefinition";
import type { ComplianceVersion } from "./types";

export async function getActiveVersion(
  rpcUrl: string,
  contractAddress: `0x${string}`,
): Promise<ComplianceVersion> {
  const client = createPublicClient({ transport: http(rpcUrl) });

  const result = await client.readContract({
    address: contractAddress,
    abi: ComplianceDefinitionABI,
    functionName: "getActiveVersion",
  });

  return {
    verifier: result.verifier,
    paramsRoot: result.paramsRoot,
    tStart: result.tStart,
    tEnd: result.tEnd,
    metadataHash: result.metadataHash,
  };
}
