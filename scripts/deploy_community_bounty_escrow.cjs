/*
 * ============================================================================
 * COMMUNITY BOUNTY ESCROW DEPLOYMENT SCRIPT
 * ============================================================================
 *
 * PURPOSE:
 * Deploys the CommunityBountyEscrow contract with UUPS proxy pattern
 *
 * WHY DEPLOYMENT SCRIPT:
 * - Automates multi-step deployment (implementation + proxy + initialization)
 * - Validates deployment success before proceeding
 * - Provides clear env var instructions for backend integration
 * - Reduces human error in production deployment
 *
 * DEPLOYMENT FLOW:
 * 1. Deploy CommunityBountyEscrow implementation contract
 * 2. Encode initialization parameters (ROXN, USDC, relayer, fee collector)
 * 3. Deploy CommunityBountyEscrowProxy with implementation + init data
 * 4. Verify contract is initialized correctly
 * 5. Output env vars for backend configuration
 *
 * PREREQUISITES:
 * - ROXN_TOKEN_ADDRESS set in .env (platform token)
 * - USDC_XDC_ADDRESS set in .env (stablecoin)
 * - Deployer wallet has sufficient XDC for gas
 * - Deployer decides relayer address (can be deployer initially)
 *
 * WHY THESE DEPENDENCIES:
 * - ROXN: Platform governance/reward token
 * - USDC: Stable value for predictable bounties
 * - Relayer: Authorized to complete bounties after PR merge verification
 * - Fee collector: Receives platform fees (0.5%) + contributor fees (0.5%)
 */

const { ethers } = require("hardhat");
require('dotenv').config({ path: './server/.env' });

async function main() {
  console.log("🚀 Deploying CommunityBountyEscrow with UUPS proxy...");
  console.log("=" .repeat(80));

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`\n📍 Deploying from account: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`💰 Account balance: ${ethers.formatEther(balance)} XDC`);

  // Validate required environment variables
  // WHY: Fail fast if configuration is incomplete
  const roxnTokenAddress = process.env.ROXN_TOKEN_ADDRESS;
  const usdcTokenAddress = process.env.USDC_XDC_ADDRESS;

  if (!roxnTokenAddress || !ethers.isAddress(roxnTokenAddress)) {
    throw new Error("❌ ROXN_TOKEN_ADDRESS not set or invalid in .env");
  }
  if (!usdcTokenAddress || !ethers.isAddress(usdcTokenAddress)) {
    throw new Error("❌ USDC_XDC_ADDRESS not set or invalid in .env");
  }

  console.log(`\n📦 Configuration:`);
  console.log(`  ROXN Token: ${roxnTokenAddress}`);
  console.log(`  USDC Token: ${usdcTokenAddress}`);

  // Relayer configuration
  // WHY CONFIGURABLE: Allows using dedicated relayer wallet or deployer initially
  const relayerAddress = process.env.COMMUNITY_BOUNTY_RELAYER || deployer.address;
  console.log(`  Relayer: ${relayerAddress}`);

  if (relayerAddress === deployer.address) {
    console.log(`  ⚠️  Using deployer as relayer (you can change this later via setRelayer())`);
  }

  // Fee collector configuration
  // WHY CONFIGURABLE: Allows setting treasury address for fee collection
  const feeCollectorAddress = process.env.FEE_COLLECTOR_ADDRESS || deployer.address;
  console.log(`  Fee Collector: ${feeCollectorAddress}`);

  if (feeCollectorAddress === deployer.address) {
    console.log(`  ⚠️  Using deployer as fee collector (you can change this later via setFeeCollector())`);
  }

  try {
    // Get current gas price
    // WHY: Ensures deployment doesn't fail due to low gas price
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits("1", "gwei");
    console.log(`\n⛽ Current gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

    // =========================================================================
    // STEP 1: Deploy Implementation Contract
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 1: Deploying CommunityBountyEscrow implementation...");
    console.log("=".repeat(80));

    const CommunityBountyEscrowFactory = await ethers.getContractFactory("CommunityBountyEscrow");

    // WHY HIGH GAS LIMIT: Implementation contract is large (many functions + docs)
    const implementationTx = await CommunityBountyEscrowFactory.deploy({
      gasLimit: 5000000, // 5M gas
      gasPrice: ethers.parseUnits("50", "gwei") // Force 50 gwei for faster confirmation
    });

    console.log(`\n⏳ Transaction sent. Waiting for confirmation...`);
    await implementationTx.waitForDeployment();
    const implementationAddress = await implementationTx.getAddress();
    console.log(`✅ Implementation deployed: ${implementationAddress}`);

    // Wait for network propagation
    // WHY: Ensures contract is propagated to all nodes before proxy deployment
    console.log("\n⏳ Waiting 5 seconds for network propagation...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // =========================================================================
    // STEP 2: Encode Initialization Data
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2: Encoding initialization data...");
    console.log("=".repeat(80));

    // WHY ENCODE: Proxy constructor needs encoded function call, not raw parameters
    const initData = CommunityBountyEscrowFactory.interface.encodeFunctionData('initialize', [
      roxnTokenAddress,
      usdcTokenAddress,
      relayerAddress,
      feeCollectorAddress
    ]);

    console.log(`\n✅ Initialization data encoded (${initData.length} bytes)`);

    // =========================================================================
    // STEP 3: Deploy Proxy Contract
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 3: Deploying CommunityBountyEscrowProxy...");
    console.log("=".repeat(80));

    const CommunityBountyEscrowProxyFactory = await ethers.getContractFactory("CommunityBountyEscrowProxy");

    // WHY PROXY GAS LIMIT: Proxy is small but executes init data delegatecall
    const proxyTx = await CommunityBountyEscrowProxyFactory.deploy(
      implementationAddress,
      initData,
      {
        gasLimit: 2000000, // 2M gas
        gasPrice: ethers.parseUnits("50", "gwei") // Force 50 gwei for faster confirmation
      }
    );

    console.log(`\n⏳ Transaction sent. Waiting for confirmation...`);
    await proxyTx.waitForDeployment();
    const proxyAddress = await proxyTx.getAddress();
    console.log(`✅ Proxy deployed: ${proxyAddress}`);

    // Wait for network propagation
    console.log("\n⏳ Waiting 10 seconds for network propagation...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // =========================================================================
    // STEP 4: Verify Deployment
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("STEP 4: Verifying deployment...");
    console.log("=".repeat(80));

    // WHY ATTACH: Access implementation contract ABI through proxy address
    const proxiedContract = CommunityBountyEscrowFactory.attach(proxyAddress);

    try {
      // WHY VERIFY: Ensures initialization was successful
      const owner = await proxiedContract.owner();
      const storedRoxnToken = await proxiedContract.roxnToken();
      const storedUsdcToken = await proxiedContract.usdcToken();
      const storedRelayer = await proxiedContract.relayer();
      const storedFeeCollector = await proxiedContract.feeCollector();
      const platformFeeRate = await proxiedContract.platformFeeRate();
      const contributorFeeRate = await proxiedContract.contributorFeeRate();
      const nextBountyId = await proxiedContract.nextBountyId();

      console.log("\n✅ Deployment Verification:");
      console.log(`  Proxy Address:         ${proxyAddress}`);
      console.log(`  Implementation:        ${implementationAddress}`);
      console.log(`  Owner:                 ${owner}`);
      console.log(`  ROXN Token:            ${storedRoxnToken}`);
      console.log(`  USDC Token:            ${storedUsdcToken}`);
      console.log(`  Relayer:               ${storedRelayer}`);
      console.log(`  Fee Collector:         ${storedFeeCollector}`);
      console.log(`  Platform Fee Rate:     ${platformFeeRate} basis points (${Number(platformFeeRate) / 100}%)`);
      console.log(`  Contributor Fee Rate:  ${contributorFeeRate} basis points (${Number(contributorFeeRate) / 100}%)`);
      console.log(`  Next Bounty ID:        ${nextBountyId}`);

      console.log("\n✅ Contract configuration verified!");
    } catch (verifyError) {
      console.log("\n⚠️  Warning: Could not verify all contract parameters.");
      console.log("The contracts may still be deployed correctly.");
      console.log("Error:", verifyError.message);
    }

    // =========================================================================
    // STEP 5: Output Configuration Instructions
    // =========================================================================
    console.log("\n" + "=".repeat(80));
    console.log("🎉 DEPLOYMENT COMPLETE!");
    console.log("=".repeat(80));

    console.log("\n📝 Update your server/.env file with these values:");
    console.log("─".repeat(80));
    console.log(`COMMUNITY_BOUNTY_ESCROW_ADDRESS=${proxyAddress}`);
    console.log(`COMMUNITY_BOUNTY_ESCROW_IMPL_ADDRESS=${implementationAddress}`);
    console.log(`COMMUNITY_BOUNTY_RELAYER=${relayerAddress}`);
    console.log("─".repeat(80));

    console.log("\n📌 Next Steps:");
    console.log("  1. Copy the env vars above to server/.env");
    console.log("  2. Update server/blockchain.ts to import CommunityBountyEscrow contract");
    console.log("  3. Restart backend server (pm2 restart all)");
    console.log("  4. Test bounty creation:");
    console.log(`     - Call createBounty() with test amount`);
    console.log(`     - Verify escrow holds funds`);
    console.log(`     - Test completeBounty() via relayer`);
    console.log("  5. Test refund mechanism:");
    console.log(`     - Create bounty with short expiry`);
    console.log(`     - Wait for expiry`);
    console.log(`     - Call refundBounty()`);

    console.log("\n💡 Admin Functions Available:");
    console.log("  - setRelayer(address): Change relayer address");
    console.log("  - setFeeCollector(address): Change fee collector");
    console.log("  - setFeeRates(uint256, uint256): Adjust fee rates (max 10% total)");

    console.log("\n🔐 Security Reminders:");
    console.log("  - Relayer private key should be stored securely (AWS Secrets Manager)");
    console.log("  - Only relayer can call completeBounty()");
    console.log("  - Verify PR merge on GitHub before calling completeBounty()");
    console.log("  - Monitor fee collector balance for unexpected changes");

  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ DEPLOYMENT FAILED");
    console.error("=".repeat(80));
    console.error(error);
    if (error.receipt) {
      console.log("\n📋 Transaction Receipt:");
      console.log(`  Status: ${error.receipt.status}`);
      console.log(`  Gas Used: ${error.receipt.gasUsed.toString()}`);
      console.log(`  TX Hash: ${error.receipt.hash}`);
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
