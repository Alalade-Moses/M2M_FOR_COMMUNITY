const express = require('express');
const { body, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const axios = require('axios');
const Wallet = require('../models/Wallet');

const router = express.Router();

// NAD SBT Token ABI (simplified for balance checking)
const NAD_SBT_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  }
];

// Initialize provider for Monad Testnet
const getProvider = () => {
  const rpcUrl = process.env.MONAD_TESTNET_RPC || 'https://rpc.testnet.monad.xyz';
  return new ethers.JsonRpcProvider(rpcUrl);
};

// Get contract instance
const getNADContract = (provider) => {
  const contractAddress = process.env.NAD_SBT_CONTRACT_ADDRESS;
  return new ethers.Contract(contractAddress, NAD_SBT_ABI, provider);
};

// Validation middleware
const validateWalletAddress = [
  body('walletAddress')
    .isLength({ min: 42, max: 42 })
    .withMessage('Wallet address must be 42 characters long')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid Ethereum wallet address format')
    .custom(async (value) => {
      // Check if wallet already submitted
      const existingWallet = await Wallet.isWalletSubmitted(value);
      if (existingWallet) {
        throw new Error('This wallet address has already been submitted');
      }
      return true;
    })
];

// Rate limiting middleware specific to wallet checking
const checkRateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  
  // Store IP and user agent for tracking
  req.submissionData = {
    ip,
    userAgent,
    timestamp: new Date()
  };
  
  next();
};

// Blockchain data fetching functions
async function getNADSBTBalance(walletAddress) {
  try {
    const provider = getProvider();
    const contract = getNADContract(provider);
    
    const balance = await contract.balanceOf(walletAddress);
    return parseInt(balance.toString());
  } catch (error) {
    console.error('Error fetching NAD SBT balance:', error);
    
    // Fallback: Try direct RPC call
    try {
      const provider = getProvider();
      const contractAddress = process.env.NAD_SBT_CONTRACT_ADDRESS;
      
      // Encode function call
      const iface = new ethers.Interface(NAD_SBT_ABI);
      const data = iface.encodeFunctionData('balanceOf', [walletAddress]);
      
      const result = await provider.call({
        to: contractAddress,
        data: data
      });
      
      const decoded = iface.decodeFunctionResult('balanceOf', result);
      return parseInt(decoded[0].toString());
    } catch (fallbackError) {
      console.error('Fallback balance check failed:', fallbackError);
      throw new Error('Unable to fetch NAD SBT balance');
    }
  }
}

async function getTransactionCount(walletAddress) {
  try {
    const provider = getProvider();
    const txCount = await provider.getTransactionCount(walletAddress);
    return txCount;
  } catch (error) {
    console.error('Error fetching transaction count:', error);
    
    // Fallback: Try explorer API
    try {
      const explorerUrl = process.env.MONAD_EXPLORER_API || 'https://api.testnet.monad.xyz';
      const response = await axios.get(`${explorerUrl}/api/account/${walletAddress}`, {
        timeout: 5000
      });
      
      return response.data.transactionCount || 0;
    } catch (fallbackError) {
      console.error('Fallback transaction count check failed:', fallbackError);
      throw new Error('Unable to fetch transaction count');
    }
  }
}

async function getCurrentBlockHeight() {
  try {
    const provider = getProvider();
    return await provider.getBlockNumber();
  } catch (error) {
    console.error('Error fetching block height:', error);
    return null;
  }
}

// Main eligibility check endpoint
router.post('/', checkRateLimit, validateWalletAddress, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { walletAddress } = req.body;
    const normalizedAddress = walletAddress.toLowerCase();

    console.log(`🔍 Checking eligibility for wallet: ${walletAddress}`);

    // Fetch blockchain data in parallel
    const [nadBalance, txCount, blockHeight] = await Promise.all([
      getNADSBTBalance(normalizedAddress),
      getTransactionCount(normalizedAddress),
      getCurrentBlockHeight()
    ]);

    console.log(`📊 Blockchain data - Balance: ${nadBalance}, TX Count: ${txCount}, Block: ${blockHeight}`);

    // Create wallet record
    const wallet = new Wallet({
      walletAddress: normalizedAddress,
      nadSbtBalance: nadBalance,
      transactionCount: txCount,
      submissionIP: req.submissionData.ip,
      userAgent: req.submissionData.userAgent,
      blockHeight,
      verificationStatus: 'VERIFIED',
      lastVerifiedAt: new Date()
    });

    // Check eligibility and calculate tier
    const isEligible = wallet.checkEligibility();

    // Save to database
    await wallet.save();

    console.log(`✅ Wallet saved - Eligible: ${isEligible}, Tier: ${wallet.allocationTier}`);

    // Prepare response
    const response = {
      success: true,
      eligible: isEligible,
      walletData: {
        nadSbtBalance: nadBalance,
        transactionCount: txCount,
        minimumRequired: {
          nadSbtBalance: parseInt(process.env.MIN_NAD_SBT_BALANCE) || 1000000,
          transactionCount: parseInt(process.env.MIN_TRANSACTION_COUNT) || 100
        }
      }
    };

    if (isEligible) {
      response.allocation = {
        tier: wallet.allocationTier,
        estimatedTokens: wallet.estimatedAllocation,
        tierRequirements: {
          BASIC: `${process.env.BASIC_TIER_MIN_TX || 100}+ transactions`,
          MEDIUM: `${process.env.MEDIUM_TIER_MIN_TX || 500}+ transactions`,
          MAXIMUM: `${process.env.MAX_TIER_MIN_TX || 1000}+ transactions`
        }
      };
      response.message = "🎉 Congratulations! You're eligible for M2M token distribution!";
    } else {
      const requirements = [];
      if (nadBalance < (parseInt(process.env.MIN_NAD_SBT_BALANCE) || 1000000)) {
        const needed = (parseInt(process.env.MIN_NAD_SBT_BALANCE) || 1000000) - nadBalance;
        requirements.push(`${needed.toLocaleString()} more NAD SBT tokens`);
      }
      if (txCount < (parseInt(process.env.MIN_TRANSACTION_COUNT) || 100)) {
        const needed = (parseInt(process.env.MIN_TRANSACTION_COUNT) || 100) - txCount;
        requirements.push(`${needed} more transactions on Monad Testnet`);
      }
      
      response.message = `❌ Not eligible yet. You need: ${requirements.join(' and ')}.`;
      response.requirements = requirements;
    }

    res.json(response);

  } catch (error) {
    console.error('❌ Eligibility check error:', error);

    // Handle specific error types
    if (error.message.includes('already been submitted')) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate submission',
        message: "You've already submitted this address. Only one entry allowed."
      });
    }

    if (error.message.includes('Unable to fetch')) {
      return res.status(503).json({
        success: false,
        error: 'Blockchain service unavailable',
        message: 'Unable to connect to Monad Testnet. Please try again later.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An error occurred while checking eligibility. Please try again.'
    });
  }
});

// Get eligibility statistics (public endpoint)
router.get('/stats', async (req, res) => {
  try {
    const stats = await Wallet.getEligibilityStats();
    
    res.json({
      success: true,
      stats: {
        totalSubmissions: stats.totalSubmissions,
        eligibleWallets: stats.eligibleCount,
        eligibilityRate: stats.totalSubmissions > 0 ? 
          ((stats.eligibleCount / stats.totalSubmissions) * 100).toFixed(2) + '%' : '0%',
        allocationTiers: {
          basic: stats.basicTier,
          medium: stats.mediumTier,
          maximum: stats.maxTier
        },
        totalEstimatedAllocation: stats.totalAllocation.toLocaleString() + ' M2M'
      },
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to fetch statistics'
    });
  }
});

// Check if wallet was already submitted (without revealing details)
router.post('/check-duplicate', [
  body('walletAddress')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid wallet address format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
      });
    }

    const { walletAddress } = req.body;
    const existingWallet = await Wallet.isWalletSubmitted(walletAddress);

    res.json({
      success: true,
      alreadySubmitted: !!existingWallet,
      submittedAt: existingWallet ? existingWallet.submittedAt : null
    });
  } catch (error) {
    console.error('Error checking duplicate:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to check submission status'
    });
  }
});

module.exports = router;