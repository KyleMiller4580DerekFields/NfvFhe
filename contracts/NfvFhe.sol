// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NfvFhe is SepoliaConfig {
    struct EncryptedVnf {
        uint256 vnfId;
        address owner;
        euint32 configuration;
        euint32 state;
        euint32 performanceMetrics;
        uint256 timestamp;
    }

    struct ServiceChain {
        uint256 chainId;
        euint32[] vnfSequence;
        euint32 chainStatus;
        uint256 timestamp;
    }

    uint256 public vnfCount;
    uint256 public chainCount;
    mapping(uint256 => EncryptedVnf) public virtualNetworkFunctions;
    mapping(uint256 => ServiceChain) public serviceChains;
    mapping(address => uint256[]) public operatorVnfs;
    mapping(address => bool) public networkOperators;

    event VnfDeployed(uint256 indexed vnfId, address indexed operator, uint256 timestamp);
    event ChainCreated(uint256 indexed chainId, uint256 timestamp);
    event ChainUpdated(uint256 indexed chainId, uint256 timestamp);

    modifier onlyOperator() {
        require(networkOperators[msg.sender], "Unauthorized operator");
        _;
    }

    constructor() {
        networkOperators[msg.sender] = true;
    }

    function authorizeOperator(address operator) external onlyOperator {
        networkOperators[operator] = true;
    }

    function deployVnf(
        euint32 encryptedConfig,
        euint32 initialState,
        euint32 initialMetrics
    ) external onlyOperator {
        vnfCount++;
        uint256 newId = vnfCount;

        virtualNetworkFunctions[newId] = EncryptedVnf({
            vnfId: newId,
            owner: msg.sender,
            configuration: encryptedConfig,
            state: initialState,
            performanceMetrics: initialMetrics,
            timestamp: block.timestamp
        });

        operatorVnfs[msg.sender].push(newId);
        emit VnfDeployed(newId, msg.sender, block.timestamp);
    }

    function createServiceChain(uint256[] memory vnfIds) external onlyOperator {
        require(vnfIds.length > 0, "Empty VNF sequence");

        chainCount++;
        uint256 newId = chainCount;
        euint32[] memory encryptedSequence = new euint32[](vnfIds.length);

        for (uint256 i = 0; i < vnfIds.length; i++) {
            require(virtualNetworkFunctions[vnfIds[i]].owner == msg.sender, "Not VNF owner");
            encryptedSequence[i] = virtualNetworkFunctions[vnfIds[i]].configuration;
        }

        serviceChains[newId] = ServiceChain({
            chainId: newId,
            vnfSequence: encryptedSequence,
            chainStatus: FHE.asEuint32(1), // Active status
            timestamp: block.timestamp
        });

        emit ChainCreated(newId, block.timestamp);
    }

    function updateServiceChain(
        uint256 chainId,
        uint256[] memory vnfIds
    ) external onlyOperator {
        require(serviceChains[chainId].chainId != 0, "Chain not found");
        require(vnfIds.length > 0, "Empty VNF sequence");

        euint32[] memory encryptedSequence = new euint32[](vnfIds.length);
        for (uint256 i = 0; i < vnfIds.length; i++) {
            require(virtualNetworkFunctions[vnfIds[i]].owner == msg.sender, "Not VNF owner");
            encryptedSequence[i] = virtualNetworkFunctions[vnfIds[i]].configuration;
        }

        serviceChains[chainId].vnfSequence = encryptedSequence;
        serviceChains[chainId].timestamp = block.timestamp;

        emit ChainUpdated(chainId, block.timestamp);
    }

    function verifyChainIntegrity(uint256 chainId) external onlyOperator {
        ServiceChain storage chain = serviceChains[chainId];
        require(chain.chainId != 0, "Chain not found");

        bytes32[] memory ciphertexts = new bytes32[](chain.vnfSequence.length);
        for (uint256 i = 0; i < chain.vnfSequence.length; i++) {
            ciphertexts[i] = FHE.toBytes32(chain.vnfSequence[i]);
        }

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.checkChainIntegrity.selector);
    }

    function checkChainIntegrity(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Integrity verification logic would be implemented here
        // For simplicity, we just update the chain status
        serviceChains[requestId].chainStatus = FHE.asEuint32(2); // Verified status
    }

    function getVnfConfiguration(uint256 vnfId) external view onlyOperator returns (euint32) {
        return virtualNetworkFunctions[vnfId].configuration;
    }

    function getChainVnfs(uint256 chainId) external view onlyOperator returns (euint32[] memory) {
        return serviceChains[chainId].vnfSequence;
    }

    function getOperatorVnfs(address operator) external view onlyOperator returns (uint256[] memory) {
        return operatorVnfs[operator];
    }
}