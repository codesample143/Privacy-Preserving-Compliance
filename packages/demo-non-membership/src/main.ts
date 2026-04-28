import initACVM from "@noir-lang/acvm_js";
import initNoirC from "@noir-lang/noirc_abi";
import {
  ProofManager,
  computeMerkleProof,
  verifyProof,
  type InputFormatter,
  type ProofResult,
} from "@ppc/sdk";
import { createPublicClient, createWalletClient, custom, http } from "viem";
import { sepolia } from "viem/chains";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

// ── DOM refs ─────────────────────────────────────────────────────────
const $contract = document.getElementById("contract") as HTMLInputElement;
const $contractName = document.getElementById("contractName")!;
const $rpc = document.getElementById("rpc") as HTMLInputElement;
const $ipfs = document.getElementById("ipfs") as HTMLInputElement;
const $userAddr = document.getElementById("userAddr") as HTMLInputElement;
const $btn = document.getElementById("generate") as HTMLButtonElement;
const $status = document.getElementById("status")!;
const $proof = document.getElementById("proof") as HTMLTextAreaElement;
const $publicInputs = document.getElementById(
  "publicInputs",
) as HTMLTextAreaElement;
const $copyProof = document.getElementById("copyProof") as HTMLButtonElement;
const $copyInputs = document.getElementById("copyInputs") as HTMLButtonElement;
const $verify = document.getElementById("verify") as HTMLButtonElement;
const $verifyStatus = document.getElementById("verifyStatus")!;
const $connectWallet = document.getElementById("connectWallet") as HTMLButtonElement;

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

function toHex(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

$copyProof.addEventListener("click", () => {
  navigator.clipboard.writeText($proof.value);
});
$copyInputs.addEventListener("click", () => {
  navigator.clipboard.writeText($publicInputs.value);
});

// ── Fetch contract name on address change ───────────────────────────
let nameDebounce: ReturnType<typeof setTimeout>;
$contract.addEventListener("input", () => {
  clearTimeout(nameDebounce);
  $contractName.textContent = "";
  const addr = $contract.value.trim();
  if (!addr.match(/^0x[0-9a-fA-F]{40}$/)) return;

  nameDebounce = setTimeout(async () => {
    try {
      const pm = new ProofManager({
        rpcUrl: $rpc.value.trim(),
        ipfsGatewayUrl: $ipfs.value.trim(),
      });
      const name = await pm.getName(addr as `0x${string}`);
      $contractName.textContent = name;
    } catch {
      $contractName.textContent = "";
    }
  }, 400);
});

// ── Connect wallet ──────────────────────────────────────────────────
$connectWallet.addEventListener("click", async () => {
  if (!window.ethereum) {
    setStatus("No wallet found. Install MetaMask or another browser wallet.");
    return;
  }
  try {
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as `0x${string}`[];
    $userAddr.value = accounts[0];
    $connectWallet.textContent = "Connected";
  } catch (err) {
    setStatus(`Wallet connection failed: ${err instanceof Error ? err.message : err}`);
  }
});

// ── State ────────────────────────────────────────────────────────────
let lastProofResult: ProofResult | null = null;

// ── Main flow ────────────────────────────────────────────────────────
$btn.addEventListener("click", async () => {
  $btn.disabled = true;
  $proof.value = "";
  $publicInputs.value = "";
  $copyProof.style.display = "none";
  $copyInputs.style.display = "none";
  $verify.style.display = "none";
  $verifyStatus.textContent = "";
  lastProofResult = null;

  try {
    setStatus("Initializing WASM...");
    await ensureWasm();

    const pm = new ProofManager({
      rpcUrl: $rpc.value.trim(),
      ipfsGatewayUrl: $ipfs.value.trim(),
    });

    const contractAddr = $contract.value.trim() as `0x${string}`;
    const userAddr = $userAddr.value.trim();
    if (!userAddr) {
      setStatus("Connect your wallet first — your address is used as a public input.");
      return;
    }

    // Non-membership input formatter:
    // fetches sorted leaves, determines the proof type (sandwich, below-min,
    // or above-max), computes the appropriate merkle proofs, and maps the
    // result onto the non_membership circuit's expected inputs.
    const nonMembershipFormatter: InputFormatter = async (ctx) => {
      setStatus("Fetching merkle leaves from IPFS...");
      const leaves = await ctx.proofManager.fetchLeaves(ctx.definition.leavesHash);

      if (leaves.length === 0) {
        throw new Error("No leaves in the compliance set.");
      }

      const target = BigInt(userAddr);

      // Check if the address is actually in the set
      if (leaves.some((l) => l === target)) {
        throw new Error("Address IS in the compliance set -- cannot prove non-membership.");
      }

      // Leaves are sorted. Determine which proof type to use.
      if (target < leaves[0]) {
        // Below minimum: address is less than the smallest leaf
        setStatus("Address is below all leaves, computing below-min proof...");
        const upperProof = computeMerkleProof(leaves, 0);

        return {
          root: ctx.definition.merkleRoot1,
          address: userAddr,
          lower_leaf: toHex(0n),
          upper_leaf: toHex(leaves[0]),
          lower_index: "0",
          upper_index: upperProof.index,
          lower_hash_path: upperProof.hashPath,
          upper_hash_path: upperProof.hashPath,
          proof_type: "1",
        };
      } else if (target > leaves[leaves.length - 1]) {
        // Above maximum: address is greater than the largest leaf.
        // Prove the last leaf is in the tree and the next position is empty.
        setStatus("Address is above all leaves, computing above-max proof...");
        const lastIdx = leaves.length - 1;
        const lowerProof = computeMerkleProof(leaves, lastIdx);

        // Compute merkle path for the empty position at index lastIdx+1.
        // Appending 0n doesn't change the sparse tree (0n leaves are skipped).
        const leavesWithEmpty = [...leaves, 0n];
        const emptyProof = computeMerkleProof(leavesWithEmpty, leaves.length);

        return {
          root: ctx.definition.merkleRoot1,
          address: userAddr,
          lower_leaf: toHex(leaves[lastIdx]),
          upper_leaf: toHex(0n),
          lower_index: lowerProof.index,
          upper_index: "0",
          lower_hash_path: lowerProof.hashPath,
          upper_hash_path: emptyProof.hashPath,
          proof_type: "2",
        };
      } else {
        // Normal sandwich: find two adjacent leaves that bound the address
        setStatus("Finding sandwich leaves...");
        const upperIdx = leaves.findIndex((leaf) => leaf > target);
        const lowerIdx = upperIdx - 1;

        setStatus("Computing merkle proofs for sandwich leaves...");
        const lowerProof = computeMerkleProof(leaves, lowerIdx);
        const upperProof = computeMerkleProof(leaves, upperIdx);

        return {
          root: ctx.definition.merkleRoot1,
          address: userAddr,
          lower_leaf: toHex(leaves[lowerIdx]),
          upper_leaf: toHex(leaves[upperIdx]),
          lower_index: lowerProof.index,
          upper_index: upperProof.index,
          lower_hash_path: lowerProof.hashPath,
          upper_hash_path: upperProof.hashPath,
          proof_type: "0",
        };
      }
    };

    setStatus("Generating proof... (this may take 30-60 seconds)");
    const result = await pm.generateComplianceProof(contractAddr, nonMembershipFormatter);

    $proof.value = result.proof;
    $publicInputs.value = result.publicInputs.join("\n");
    $copyProof.style.display = "inline-block";
    $copyInputs.style.display = "inline-block";
    lastProofResult = result;
    $verify.style.display = "inline-block";
    setStatus("Done! You can now verify the proof on-chain.");
  } catch (err) {
    setStatus(`Error: ${err instanceof Error ? err.message : err}`);
    console.error(err);
  } finally {
    $btn.disabled = false;
  }
});

// ── Verify on-chain ──────────────────────────────────────────────────
$verify.addEventListener("click", async () => {
  if (!lastProofResult) return;
  if (!window.ethereum) {
    $verifyStatus.textContent = "No wallet found. Install MetaMask or another browser wallet.";
    return;
  }

  $verify.disabled = true;
  $verifyStatus.textContent = "Connecting wallet...";

  try {
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as `0x${string}`[];

    // The contract verifies against msg.sender, so the wallet must match the proof address
    const proofAddr = $userAddr.value.trim().toLowerCase();
    if (accounts[0].toLowerCase() !== proofAddr) {
      $verifyStatus.textContent = `Wallet mismatch: proof was generated for ${proofAddr}, but wallet is ${accounts[0]}. The contract will reject this.`;
      return;
    }

    const walletClient = createWalletClient({
      account: accounts[0],
      chain: sepolia,
      transport: custom(window.ethereum),
    });

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http($rpc.value.trim()),
    });

    const contractAddr = $contract.value.trim() as `0x${string}`;

    $verifyStatus.textContent = "Submitting transaction... (confirm in wallet)";

    const { txHash } = await verifyProof(
      walletClient,
      publicClient,
      contractAddr,
      lastProofResult,
    );

    $verifyStatus.textContent = `Verified! tx: ${txHash}`;
  } catch (err) {
    $verifyStatus.textContent = `Verification failed: ${err instanceof Error ? err.message : err}`;
    console.error(err);
  } finally {
    $verify.disabled = false;
  }
});
