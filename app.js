 const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Allow more requests for testing
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Serve static files
app.use(express.static('public'));

// MongoDB Schema - Simplified
const walletSchema = new mongoose.Schema({
  walletAddress: { type: String, required: true, unique: true },
  nadSbtBalance: { type: Number, default: 0 },
  transactionCount: { type: Number, default: 0 },
  eligible: { type: Boolean, default: false },
  tier: { type: String, enum: ['BASIC', 'MEDIUM', 'MAXIMUM'], default: 'BASIC' },
  allocation: { type: Number, default: 0 },
  submittedAt: { type: Date, default: Date.now },
  verificationStatus: { type: String, default: 'VERIFIED' }
});

const Wallet = mongoose.model('Wallet', walletSchema);

// Simplified blockchain simulation (for testing with real wallet addresses)
async function simulateBlockchainCheck(walletAddress) {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // For testing purposes, generate realistic but random data
  // In production, replace with actual blockchain calls
  const randomBalance = Math.floor(Math.random() * 2000000) + 500000; // 500K to 2.5M
  const randomTxCount = Math.floor(Math.random() * 1500) + 50; // 50 to 1550
  
  return {
    nadSbtBalance: randomBalance,
    transactionCount: randomTxCount
  };
}

// Helper functions
function calculateTier(transactionCount) {
  if (transactionCount >= 1000) return 'MAXIMUM';
  if (transactionCount >= 500) return 'MEDIUM';
  return 'BASIC';
}

function calculateAllocation(tier) {
  const allocations = {
    'BASIC': 22250,
    'MEDIUM': 31350,
    'MAXIMUM': 40500
  };
  return allocations[tier];
}

function checkEligibility(nadBalance, txCount) {
  const minBalance = parseInt(process.env.MIN_NAD_SBT_BALANCE) || 1000000;
  const minTxCount = parseInt(process.env.MIN_TRANSACTION_COUNT) || 100;
  
  return nadBalance >= minBalance && txCount >= minTxCount;
}

// Routes

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Main eligibility check endpoint
app.post('/api/check', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    // Basic validation
    if (!walletAddress || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address format'
      });
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // Check if already submitted
    const existingWallet = await Wallet.findOne({ walletAddress: normalizedAddress });
    if (existingWallet) {
      return res.status(409).json({
        success: false,
        message: 'This wallet address has already been submitted'
      });
    }

    console.log(`Checking eligibility for: ${walletAddress}`);

    // Simulate blockchain check (replace with actual blockchain calls in production)
    const blockchainData = await simulateBlockchainCheck(normalizedAddress);
    
    const { nadSbtBalance, transactionCount } = blockchainData;
    const eligible = checkEligibility(nadSbtBalance, transactionCount);
    const tier = calculateTier(transactionCount);
    const allocation = calculateAllocation(tier);

    // Save to database
    const wallet = new Wallet({
      walletAddress: normalizedAddress,
      nadSbtBalance,
      transactionCount,
      eligible,
      tier: eligible ? tier : 'BASIC',
      allocation: eligible ? allocation : 0
    });

    await wallet.save();

    // Prepare response
    const response = {
      success: true,
      eligible,
      walletData: {
        nadSbtBalance,
        transactionCount,
        minimumRequired: {
          nadSbtBalance: parseInt(process.env.MIN_NAD_SBT_BALANCE) || 1000000,
          transactionCount: parseInt(process.env.MIN_TRANSACTION_COUNT) || 100
        }
      }
    };

    if (eligible) {
      response.allocation = {
        tier,
        estimatedTokens: allocation.toLocaleString()
      };
      response.message = "Congratulations! You're eligible for M2M token distribution!";
    } else {
      const requirements = [];
      const minBalance = parseInt(process.env.MIN_NAD_SBT_BALANCE) || 1000000;
      const minTxCount = parseInt(process.env.MIN_TRANSACTION_COUNT) || 100;
      
      if (nadSbtBalance < minBalance) {
        requirements.push(`${(minBalance - nadSbtBalance).toLocaleString()} more NAD SBT tokens`);
      }
      if (transactionCount < minTxCount) {
        requirements.push(`${minTxCount - transactionCount} more transactions`);
      }
      
      response.message = `Not eligible yet. You need: ${requirements.join(' and ')}`;
      response.requirements = requirements;
    }

    res.json(response);

  } catch (error) {
    console.error('Eligibility check error:', error);
    
    res.status(500).json({
      success: false,
      message: 'An error occurred while checking eligibility. Please try again.'
    });
  }
});

// Get statistics
app.get('/api/check/stats', async (req, res) => {
  try {
    const totalSubmissions = await Wallet.countDocuments();
    const eligibleCount = await Wallet.countDocuments({ eligible: true });
    
    const tierCounts = await Wallet.aggregate([
      { $match: { eligible: true } },
      { $group: { _id: '$tier', count: { $sum: 1 } } }
    ]);

    const totalAllocation = await Wallet.aggregate([
      { $match: { eligible: true } },
      { $group: { _id: null, total: { $sum: '$allocation' } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalSubmissions,
        eligibleWallets: eligibleCount,
        eligibilityRate: totalSubmissions > 0 ? 
          ((eligibleCount / totalSubmissions) * 100).toFixed(2) + '%' : '0%',
        totalEstimatedAllocation: (totalAllocation[0]?.total || 0).toLocaleString() + ' M2M'
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Unable to fetch statistics'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Connected to MongoDB');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
});

module.exports = app;