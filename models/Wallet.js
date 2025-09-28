const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const walletSchema = new mongoose.Schema({
  // Wallet address (hashed for privacy)
  walletAddressHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Original wallet address (encrypted)
  walletAddress: {
    type: String,
    required: true
  },
  
  // Blockchain data at time of submission
  nadSbtBalance: {
    type: Number,
    required: true,
    min: 0
  },
  
  transactionCount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Eligibility status
  isEligible: {
    type: Boolean,
    required: true,
    default: false
  },
  
  // Allocation tier
  allocationTier: {
    type: String,
    enum: ['BASIC', 'MEDIUM', 'MAXIMUM', 'NONE'],
    default: 'NONE'
  },
  
  estimatedAllocation: {
    type: Number,
    default: 0
  },
  
  // Submission metadata
  submissionIP: {
    type: String,
    required: true
  },
  
  userAgent: {
    type: String,
    default: ''
  },
  
  // Verification status
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'FAILED'],
    default: 'PENDING'
  },
  
  verificationAttempts: {
    type: Number,
    default: 0,
    max: 3
  },
  
  // Timestamps
  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  lastVerifiedAt: {
    type: Date
  },
  
  // Additional blockchain data for audit
  blockHeight: {
    type: Number
  },
  
  networkId: {
    type: String,
    default: 'monad-testnet'
  }
}, {
  timestamps: true,
  collection: 'wallets'
});

// Indexes for performance
walletSchema.index({ submittedAt: -1 });
walletSchema.index({ isEligible: 1, allocationTier: 1 });
walletSchema.index({ submissionIP: 1, submittedAt: -1 });

// Hash wallet address before saving
walletSchema.pre('save', async function(next) {
  if (!this.isModified('walletAddress')) return next();
  
  try {
    // Create hash for unique constraint
    this.walletAddressHash = await bcrypt.hash(this.walletAddress.toLowerCase(), 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Static method to check if wallet already submitted
walletSchema.statics.isWalletSubmitted = async function(walletAddress) {
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check against all existing hashes (less efficient but necessary for existing data)
  const existingWallets = await this.find({}, { walletAddress: 1, walletAddressHash: 1 });
  
  for (const wallet of existingWallets) {
    if (await bcrypt.compare(normalizedAddress, wallet.walletAddressHash)) {
      return wallet;
    }
  }
  
  return null;
};

// Instance method to determine allocation tier
walletSchema.methods.calculateAllocationTier = function() {
  if (!this.isEligible) {
    this.allocationTier = 'NONE';
    this.estimatedAllocation = 0;
    return;
  }
  
  const txCount = this.transactionCount;
  const BASIC_MIN = parseInt(process.env.BASIC_TIER_MIN_TX) || 100;
  const MEDIUM_MIN = parseInt(process.env.MEDIUM_TIER_MIN_TX) || 500;
  const MAX_MIN = parseInt(process.env.MAX_TIER_MIN_TX) || 1000;
  
  const BASIC_ALLOCATION = parseInt(process.env.BASIC_ALLOCATION) || 200;
  const MEDIUM_ALLOCATION = parseInt(process.env.MEDIUM_ALLOCATION) || 500;
  const MAX_ALLOCATION = parseInt(process.env.MAX_ALLOCATION) || 1000;
  
  if (txCount >= MAX_MIN) {
    this.allocationTier = 'MAXIMUM';
    this.estimatedAllocation = MAX_ALLOCATION;
  } else if (txCount >= MEDIUM_MIN) {
    this.allocationTier = 'MEDIUM';
    this.estimatedAllocation = MEDIUM_ALLOCATION;
  } else if (txCount >= BASIC_MIN) {
    this.allocationTier = 'BASIC';
    this.estimatedAllocation = BASIC_ALLOCATION;
  } else {
    this.allocationTier = 'NONE';
    this.estimatedAllocation = 0;
  }
};

// Instance method to check eligibility
walletSchema.methods.checkEligibility = function() {
  const MIN_NAD_BALANCE = parseInt(process.env.MIN_NAD_SBT_BALANCE) || 1000000;
  const MIN_TX_COUNT = parseInt(process.env.MIN_TRANSACTION_COUNT) || 100;
  
  this.isEligible = this.nadSbtBalance >= MIN_NAD_BALANCE && 
                   this.transactionCount >= MIN_TX_COUNT;
  
  this.calculateAllocationTier();
  return this.isEligible;
};

// Virtual for submission date formatting
walletSchema.virtual('submittedAtFormatted').get(function() {
  return this.submittedAt.toISOString().split('T')[0];
});

// Transform JSON output to hide sensitive data
walletSchema.methods.toJSON = function() {
  const wallet = this.toObject();
  
  // Remove sensitive fields from JSON output
  delete wallet.walletAddressHash;
  delete wallet.walletAddress;
  delete wallet.submissionIP;
  delete wallet.userAgent;
  
  return wallet;
};

// Static method for analytics
walletSchema.statics.getEligibilityStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        eligibleCount: {
          $sum: { $cond: [{ $eq: ['$isEligible', true] }, 1, 0] }
        },
        basicTier: {
          $sum: { $cond: [{ $eq: ['$allocationTier', 'BASIC'] }, 1, 0] }
        },
        mediumTier: {
          $sum: { $cond: [{ $eq: ['$allocationTier', 'MEDIUM'] }, 1, 0] }
        },
        maxTier: {
          $sum: { $cond: [{ $eq: ['$allocationTier', 'MAXIMUM'] }, 1, 0] }
        },
        totalAllocation: { $sum: '$estimatedAllocation' }
      }
    }
  ]);
  
  return stats[0] || {
    totalSubmissions: 0,
    eligibleCount: 0,
    basicTier: 0,
    mediumTier: 0,
    maxTier: 0,
    totalAllocation: 0
  };
};

module.exports = mongoose.model('Wallet', walletSchema);