# M2M Token Eligibility Checker

A **real-world, production-ready** crypto eligibility checker for M2M token distribution. Built with **Node.js**, **Express**, **MongoDB**, and **Ethers.js** to verify wallet eligibility on **Monad Testnet**.

## 🌟 Overview

This application allows users to check their eligibility for M2M token distribution by verifying:
- **NAD SBT Token Balance** (≥ 1M required)
- **Transaction Count** on Monad Testnet (≥ 100 required)

Users are allocated tokens based on tiered system:
- **Basic Tier** (100-499 tx): 200 M2M
- **Medium Tier** (500-999 tx): 500 M2M  
- **Maximum Tier** (1000+ tx): 1000 M2M

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: MongoDB with Mongoose ODM
- **Blockchain**: Ethers.js for Monad Testnet integration
- **Frontend**: Vanilla HTML/CSS/JavaScript with SweetAlert2
- **Security**: Helmet, CORS, Rate Limiting, Input Validation

## 📁 Project Structure

```
m2m-eligibility-checker/
├── public/
│   ├── css/
│   │   └── styles.css       # Modern Web3-style CSS
│   └── js/
│       └── script.js        # Frontend logic + API integration
├── views/
│   └── index.html           # Single-page application
├── routes/
│   └── check.js             # API endpoints for eligibility
├── models/
│   └── Wallet.js            # MongoDB schema for wallets
├── .env                     # Environment variables
├── .gitignore
├── app.js                   # Express server entry point
├── package.json
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+ and npm
- **MongoDB** (local or MongoDB Atlas)
- Access to **Monad Testnet RPC**

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd m2m-eligibility-checker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/m2m-eligibility
   MONAD_TESTNET_RPC=https://rpc.testnet.monad.xyz
   NAD_SBT_CONTRACT_ADDRESS=0x742d35Cc5De354741c8E6E6f2A6C85C1F6c1F5c1
   MIN_NAD_SBT_BALANCE=1000000
   MIN_TRANSACTION_COUNT=100
   ```

4. **Start MongoDB** (if running locally)
   ```bash
   mongod
   ```

5. **Run the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Access the application**
   Open http://localhost:3000 in your browser

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/m2m-eligibility` |
| `MONAD_TESTNET_RPC` | Monad Testnet RPC endpoint | `https://rpc.testnet.monad.xyz` |
| `NAD_SBT_CONTRACT_ADDRESS` | NAD SBT token contract address | Required |
| `MIN_NAD_SBT_BALANCE` | Minimum NAD SBT tokens required | `1000000` |
| `MIN_TRANSACTION_COUNT` | Minimum transactions required | `100` |
| `BASIC_TIER_MIN_TX` | Basic tier minimum transactions | `100` |
| `MEDIUM_TIER_MIN_TX` | Medium tier minimum transactions | `500` |
| `MAX_TIER_MIN_TX` | Maximum tier minimum transactions | `1000` |

### Allocation Amounts

| Variable | Description | Default |
|----------|-------------|---------|
| `BASIC_ALLOCATION` | Basic tier token allocation | `200` |
| `MEDIUM_ALLOCATION` | Medium tier token allocation | `500` |
| `MAX_ALLOCATION` | Maximum tier token allocation | `1000` |

## 📡 API Endpoints

### POST `/api/check`
Check wallet eligibility for M2M token distribution.

**Request:**
```json
{
  "walletAddress": "0x742d35Cc5De354741c8E6E6f2A6C85C1F6c1F5c1"
}
```

**Response (Eligible):**
```json
{
  "success": true,
  "eligible": true,
  "message": "🎉 Congratulations! You're eligible for M2M token distribution!",
  "walletData": {
    "nadSbtBalance": 1500000,
    "transactionCount": 350,
    "minimumRequired": {
      "nadSbtBalance": 1000000,
      "transactionCount": 100
    }
  },
  "allocation": {
    "tier": "BASIC",
    "estimatedTokens": 200,
    "tierRequirements": {
      "BASIC": "100+ transactions",
      "MEDIUM": "500+ transactions", 
      "MAXIMUM": "1000+ transactions"
    }
  }
}
```

**Response (Not Eligible):**
```json
{
  "success": true,
  "eligible": false,
  "message": "❌ Not eligible yet. You need: 500,000 more NAD SBT tokens and 50 more transactions.",
  "walletData": {
    "nadSbtBalance": 500000,
    "transactionCount": 50,
    "minimumRequired": {
      "nadSbtBalance": 1000000,
      "transactionCount": 100
    }
  },
  "requirements": [
    "500,000 more NAD SBT tokens",
    "50 more transactions on Monad Testnet"
  ]
}
```

### GET `/api/check/stats`
Get community eligibility statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalSubmissions": 1247,
    "eligibleWallets": 892,
    "eligibilityRate": "71.54%",
    "allocationTiers": {
      "basic": 456,
      "medium": 312,
      "maximum": 124
    },
    "totalEstimatedAllocation": "524,800 M2M"
  },
  "lastUpdated": "2024-01-15T10:30:00.000Z"
}
```

### POST `/api/check/check-duplicate`
Check if wallet address was already submitted.

**Request:**
```json
{
  "walletAddress": "0x742d35Cc5De354741c8E6E6f2A6C85C1F6c1F5c1"
}
```

**Response:**
```json
{
  "success": true,
  "alreadySubmitted": true,
  "submittedAt": "2024-01-15T08:45:30.000Z"
}
```

### GET `/api/health`
Server health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production"
}
```

## 🔒 Security Features

- **Rate Limiting**: 10 requests per 15 minutes per IP
- **Input Validation**: Comprehensive wallet address validation
- **Duplicate Prevention**: One submission per wallet address
- **Data Encryption**: Wallet addresses are hashed and encrypted
- **CORS Protection**: Configurable origin restrictions
- **Helmet.js**: Security headers and XSS protection
- **Request Sanitization**: SQL injection and XSS prevention

## 🗄️ Database Schema

The `Wallet` model stores:
- Hashed wallet addresses (for privacy)
- Blockchain verification data
- Eligibility status and tier
- Submission metadata and IP tracking
- Verification timestamps

## 🎨 Frontend Features

- **Modern Web3 UI**: Dark theme with glowing animations
- **Real-time Validation**: Instant wallet address formatting
- **Responsive Design**: Mobile-first responsive layout
- **Loading States**: Professional loading animations
- **Success/Error Handling**: SweetAlert2 popups
- **Community Stats**: Live eligibility statistics
- **Network Status**: Real-time Monad Testnet connection status
- **Accessibility**: Screen reader support and keyboard navigation

## 🔍 Blockchain Integration

The application integrates with:
- **Monad Testnet RPC** for transaction count verification
- **NAD SBT Contract** for token balance verification
- **Block height tracking** for audit purposes
- **Fallback mechanisms** for network reliability

## 📊 Analytics & Monitoring

- Eligibility check success/failure rates
- Transaction distribution across tiers
- Geographic distribution (privacy-respecting)
- Network performance monitoring
- Error tracking and alerting

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   export NODE_ENV=production
   export PORT=3000
   export MONGODB_URI="mongodb://your-production-db"
   ```

2. **Build and Start**
   ```bash
   npm install --production
   npm start
   ```

3. **Process Management** (PM2)
   ```bash
   npm install -g pm2
   pm2 start app.js --name "m2m-checker"
   pm2 startup
   pm2 save
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Test wallet addresses for development:
```javascript
// Eligible wallets
0x742d35Cc5De354741c8E6E6f2A6C85C1F6c1F5c1  // Basic tier
0x8ba1f109551bd432803012645af136f7b5d8e1c1  // High tier

// Non-eligible wallet  
0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an [Issue](https://github.com/your-repo/issues)
- Join our [Discord Community](https://discord.gg/m2m-community)
- Email: support@m2m-community.org

## 🙏 Acknowledgments

- **Monad Team** for testnet access
- **Community Contributors** for feedback and testing
- **Open Source Libraries** that made this possible

---

**Built with ❤️ by and for the M2M community**