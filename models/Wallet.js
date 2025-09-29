 const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Database cleanup function - run this once
async function fixDuplicateWalletHashes() {
  try {
    const Wallet = mongoose.model('Wallet');
    
    // Find all documents with null walletAddressHash
    const nullHashWallets = await Wallet.find({ walletAddressHash: null });
    
    console.log(`Found ${nullHashWallets.length} wallets with null hash`);
    
    for (const wallet of nullHashWallets) {
      if (wallet.walletAddress) {
        // Re-generate the hash for wallets that have an address
        wallet.walletAddressHash = await bcrypt.hash(wallet.walletAddress.toLowerCase(), 12);
        await wallet.save();
        console.log(`Fixed hash for wallet: ${wallet.walletAddress.substring(0, 10)}...`);
      } else {
        // Delete wallets that don't have an address (invalid data)
        await Wallet.deleteOne({ _id: wallet._id });
        console.log(`Deleted invalid wallet without address: ${wallet._id}`);
      }
    }
    
    // Remove the unique index temporarily to clean duplicates
    try {
      await Wallet.collection.dropIndex('walletAddressHash_1');
    } catch (e) {
      console.log('Index might not exist or already dropped:', e.message);
    }
    
    // Find and remove duplicate walletAddressHash values
    const duplicates = await Wallet.aggregate([
      {
        $group: {
          _id: "$walletAddressHash",
          count: { $sum: 1 },
          ids: { $push: "$_id" }
        }
      },
      {
        $match: {
          count: { $gt: 1 },
          "_id": { $ne: null }
        }
      }
    ]);
    
    for (const dup of duplicates) {
      // Keep the first document, delete the rest
      const [keep, ...remove] = dup.ids;
      await Wallet.deleteMany({ 
        _id: { $in: remove },
        walletAddressHash: dup._id
      });
      console.log(`Removed ${remove.length} duplicates for hash: ${dup._id.substring(0, 10)}...`);
    }
    
    // Recreate the unique index
    await Wallet.collection.createIndex({ walletAddressHash: 1 }, { unique: true });
    
    console.log('Database cleanup completed successfully');
  } catch (error) {
    console.error('Error fixing duplicate hashes:', error);
  }
}

// Wallet Schema Definition
const walletSchema = new mongoose.Schema({
  // Wallet address (hashed for privacy)
  walletAddressHash: {
    type: String,
    required: [true, 'Wallet address hash is required'],
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        return v !== null && v !== undefined && v.trim() !== '';
      },
      message: 'Wallet address hash cannot be empty'
    }
  },
  
  // Original wallet address (encrypted)
  walletAddress: {
    type: String,
    required: [true, 'Wallet address is required'],
    validate: {
      validator: function(v) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid wallet address format'
    },
    set: function(v) {
      // Always normalize to lowercase
      return v.toLowerCase();
    }
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

// Enhanced pre-save middleware with better error handling
walletSchema.pre('save', async function(next) {
  try {
    // Always ensure walletAddress is normalized
    if (this.walletAddress) {
      this.walletAddress = this.walletAddress.toLowerCase();
    }
    
    // Generate hash if not already present or if walletAddress changed
    if (this.isModified('walletAddress') || !this.walletAddressHash) {
      if (!this.walletAddress) {
        throw new Error('Wallet address is required to generate hash');
      }
      
      this.walletAddressHash = await bcrypt.hash(this.walletAddress, 12);
      
      // Validate the hash was created
      if (!this.walletAddressHash) {
        throw new Error('Failed to generate wallet address hash');
      }
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Enhanced static method to check if wallet already submitted
walletSchema.statics.isWalletSubmitted = async function(walletAddress) {
  try {
    if (!walletAddress) {
      throw new Error('Wallet address is required');
    }
    
    const normalizedAddress = walletAddress.toLowerCase();
    
    // More efficient approach: try direct comparison first for new submissions
    const existingWallets = await this.find({ 
      walletAddressHash: { $ne: null } 
    }).select('walletAddressHash');
    
    for (const wallet of existingWallets) {
      if (wallet.walletAddressHash && await bcrypt.compare(normalizedAddress, wallet.walletAddressHash)) {
        return wallet;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error checking wallet submission:', error);
    throw error;
  }
};

// New static method for safe wallet creation
walletSchema.statics.createWallet = async function(walletData) {
  try {
    // Validate required fields
    const requiredFields = ['walletAddress', 'nadSbtBalance', 'transactionCount', 'submissionIP'];
    for (const field of requiredFields) {
      if (!walletData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletData.walletAddress)) {
      throw new Error('Invalid wallet address format');
    }
    
    // Check if wallet already exists
    const existingWallet = await this.isWalletSubmitted(walletData.walletAddress);
    if (existingWallet) {
      throw new Error('Wallet already submitted');
    }
    
    // Create and save the wallet
    const wallet = new this(walletData);
    
    // Manually trigger hash generation to ensure it's created
    if (!wallet.walletAddressHash) {
      wallet.walletAddressHash = await bcrypt.hash(wallet.walletAddress, 12);
    }
    
    await wallet.save();
    return wallet;
  } catch (error) {
    if (error.code === 11000) {
      // Handle duplicate key error gracefully
      throw new Error('Wallet already exists in database');
    }
    throw error;
  }
};

// Enhanced instance method to determine allocation tier
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

// Enhanced instance method to check eligibility
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
      $match: {
        walletAddressHash: { $ne: null } // Exclude invalid documents
      }
    },
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

// Export the model and cleanup function
const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = {
  Wallet,
  fixDuplicateWalletHashes
};