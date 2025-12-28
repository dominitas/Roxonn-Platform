// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title CommunityBountyEscrowProxy
 * @dev Proxy contract for CommunityBountyEscrow using UUPS pattern
 *
 * WHY PROXY PATTERN:
 * - Upgradeability: Can fix bugs or add features without redeploying
 * - Persistent address: Users always interact with same proxy address
 * - State preservation: Bounty data survives upgrades
 *
 * WHY ERC1967:
 * - Standard implementation (widely audited)
 * - Storage collision protection via standardized slots
 * - Event transparency for implementation changes
 *
 * WHY UUPS (vs Transparent Proxy):
 * - Gas efficient: Upgrade logic in implementation, not proxy
 * - Simpler proxy contract: Lower deployment cost
 * - Implementation controls upgrades: Better access control
 */
contract CommunityBountyEscrowProxy is ERC1967Proxy {
    /**
     * @dev Initializes the proxy with the implementation contract and initialization data
     * @param _logic Address of the CommunityBountyEscrow implementation contract
     * @param _data Encoded function call to initialize the implementation
     *
     * DEPLOYMENT FLOW:
     * 1. Deploy CommunityBountyEscrow implementation
     * 2. Encode initialize(roxnToken, usdcToken, relayer, feeCollector) call
     * 3. Deploy this proxy with implementation address + init data
     * 4. Proxy delegates initialize() call to implementation
     * 5. Implementation initialized, proxy ready for use
     */
    constructor(address _logic, bytes memory _data) ERC1967Proxy(_logic, _data) {}
}
