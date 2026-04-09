use merkle::compute_merkle_root;
use poseidon::poseidon2::Poseidon2;

// Merkle membership proof.
// Proves that `address` is a leaf in the Merkle tree with the given `root`,
// without revealing the address or its position.
//
// Public inputs:  address, root
// Private inputs: index, hash_path
fn main(
    // user address
    address: pub Field,
    // index of the address in the merkle tree, for the merkle proof
    index1: Field,
    index2: Field,
    // path of sibling nodes for the merkle proof
    hash_path: [Field; 32],
    // merkle root
    root1: pub Field,
    root2: pub Field
) {
    let computed_root1 = compute_merkle_root(address, index1, hash_path);
    assert(computed_root1 == root1);
    let computed_root2 = compute_merkle_root(address, index2, hash_path);
    assert(computed_root2 == root2);

}

