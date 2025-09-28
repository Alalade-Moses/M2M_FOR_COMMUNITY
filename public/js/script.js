// DOM elements
const form = document.getElementById('eligibilityForm');
const walletInput = document.getElementById('walletAddress');
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
const loadingSpinner = document.getElementById('loadingSpinner');
const statusContainer = document.getElementById('statusContainer');
const statusTitle = document.getElementById('statusTitle');
const statusMessage = document.getElementById('statusMessage');
const walletDetails = document.getElementById('walletDetails');
const tierInfo = document.getElementById('tierInfo');
const tierDetails = document.getElementById('tierDetails');
form.addEventListener("submit", function(e) {
      e.preventDefault(); // prevent page reload (optional)
      
      // do something with the input value
      console.log("Submitted value:", input.value);

      // clear the input box
      input.value = "";
    });
// Simple utility functions
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

// Simple alert functions (fallback if SweetAlert2 fails)
function showAlert(message, type = 'info') {
    // Try SweetAlert2 first, fallback to native alert
    if (typeof Swal !== 'undefined') {
        const config = {
            title: type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Info',
            text: message,
            icon: type,
            background: '#1a1a3e',
            color: '#ffffff',
            confirmButtonText: 'OK'
        };
        
        if (type === 'error') config.confirmButtonColor = '#ef4444';
        if (type === 'success') config.confirmButtonColor = '#22c55e';
        if (type === 'warning') config.confirmButtonColor = '#f59e0b';
        
        Swal.fire(config);
    } else {
        // Fallback to native alert
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

function setLoading(loading) {
    if (loading) {
        submitBtn.disabled = true;
        loadingSpinner.style.display = 'inline-block';
        btnText.textContent = 'Checking...';
    } else {
        submitBtn.disabled = false;
        loadingSpinner.style.display = 'none';
        btnText.textContent = 'Check Eligibility';
    }
}

function showStatus(success, title, message, walletData = null, allocation = null) {
    statusContainer.style.display = 'block';
    statusContainer.className = `status-container ${success ? 'status-success' : 'status-error'}`;
    statusTitle.textContent = title;
    statusMessage.textContent = message;

    // Show wallet details
    if (walletData) {
        walletDetails.style.display = 'block';
        walletDetails.innerHTML = `
            <div><span>NAD SBT Balance:</span> <span>${formatNumber(walletData.nadSbtBalance)}</span></div>
            <div><span>Transaction Count:</span> <span>${formatNumber(walletData.transactionCount)}</span></div>
            <div><span>Required Balance:</span> <span>${formatNumber(walletData.minimumRequired.nadSbtBalance)}</span></div>
            <div><span>Required Transactions:</span> <span>${formatNumber(walletData.minimumRequired.transactionCount)}</span></div>
        `;
    } else {
        walletDetails.style.display = 'none';
    }

    // Show tier information
    if (allocation) {
        tierInfo.style.display = 'block';
        tierDetails.innerHTML = `
            <div style="color: #22c55e; font-weight: 600; margin-bottom: 0.5rem;">
                ${allocation.tier} Tier - ${allocation.estimatedTokens} M2M Tokens
            </div>
        `;
    } else {
        tierInfo.style.display = 'none';
    }

    // Smooth scroll to status
    statusContainer.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest' 
    });
}

// API call function
async function checkEligibility(walletAddress) {
    try {
        const response = await fetch('/api/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ walletAddress })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Network error occurred');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Form handling
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const walletAddress = walletInput.value.trim();

    // Basic validation
    if (!walletAddress) {
        showAlert('Please enter your wallet address', 'warning');
        walletInput.focus();
        return;
    }

    if (!isValidEthereumAddress(walletAddress)) {
        showAlert('Please enter a valid Ethereum wallet address', 'error');
        walletInput.classList.add('input-error');
        setTimeout(() => walletInput.classList.remove('input-error'), 3000);
        walletInput.focus();
        return;
    }

    setLoading(true);
    statusContainer.style.display = 'none';

    try {
        const result = await checkEligibility(walletAddress);

        if (result.success) {
            if (result.eligible) {
                showStatus(
                    true,
                    '🎉 Congratulations!',
                    result.message,
                    result.walletData,
                    result.allocation
                );
                showAlert(`You're eligible! Tier: ${result.allocation.tier}`, 'success');
            } else {
                showStatus(
                    false,
                    '❌ Not Eligible Yet',
                    result.message,
                    result.walletData
                );
                showAlert(result.message, 'warning');
            }
            
            // Load stats after submission
            loadStats();
        } else {
            showAlert(result.message || 'Failed to check eligibility', 'error');
        }

    } catch (error) {
        console.error('Eligibility check failed:', error);

        if (error.message.includes('already been submitted')) {
            showAlert('This wallet address has already been submitted', 'warning');
        } else {
            showAlert('An error occurred while checking eligibility. Please try again.', 'error');
        }

        showStatus(
            false,
            'Error',
            'Failed to check eligibility. Please try again later.'
        );
    } finally {
        setLoading(false);
    }
});

// Input validation and formatting
walletInput.addEventListener('input', (e) => {
    let value = e.target.value;
    
    // Auto-add 0x prefix
    if (value && !value.startsWith('0x')) {
        value = '0x' + value;
        e.target.value = value;
    }
    
    // Clean up input
    if (value.startsWith('0x')) {
        e.target.value = '0x' + value.slice(2).replace(/[^0-9a-fA-F]/g, '');
    }
    
    // Remove error styling
    if (e.target.classList.contains('input-error')) {
        e.target.classList.remove('input-error');
    }
});

// Stats functionality (simplified)
async function loadStats() {
    try {
        const response = await fetch('/api/check/stats');
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.stats) {
                // Update stats if elements exist
                const totalSubmissions = document.getElementById('totalSubmissions');
                const eligibleWallets = document.getElementById('eligibleWallets');
                const eligibilityRate = document.getElementById('eligibilityRate');
                const totalAllocation = document.getElementById('totalAllocation');
                
                if (totalSubmissions) totalSubmissions.textContent = formatNumber(data.stats.totalSubmissions);
                if (eligibleWallets) eligibleWallets.textContent = formatNumber(data.stats.eligibleWallets);
                if (eligibilityRate) eligibilityRate.textContent = data.stats.eligibilityRate;
                if (totalAllocation) totalAllocation.textContent = data.stats.totalEstimatedAllocation;
            }
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Network status check (simplified)
async function checkNetworkStatus() {
    try {
        const response = await fetch('/api/health');
        const networkStatus = document.getElementById('networkStatus');
        if (networkStatus) {
            if (response.ok) {
                networkStatus.classList.remove('offline');
                networkStatus.title = 'Connected';
            } else {
                networkStatus.classList.add('offline');
                networkStatus.title = 'Disconnected';
            }
        }
    } catch (error) {
        const networkStatus = document.getElementById('networkStatus');
        if (networkStatus) {
            networkStatus.classList.add('offline');
            networkStatus.title = 'Connection Error';
        }
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Enter to submit
    if (e.key === 'Enter' && e.target === walletInput) {
        e.preventDefault();
        if (!submitBtn.disabled) {
            form.dispatchEvent(new Event('submit'));
        }
    }
    
    // ESC to clear
    if (e.key === 'Escape') {
        walletInput.value = '';
        walletInput.focus();
        statusContainer.style.display = 'none';
    }
});

// Error handling for uncaught errors
window.addEventListener('error', (e) => {
    console.error('JavaScript Error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('M2M Eligibility Checker initialized');
    
    // Focus on wallet input
    walletInput.focus();
    
    // Load initial stats and check network
    loadStats();
    checkNetworkStatus();
    
    // Set up periodic updates (every 30 seconds)
    setInterval(() => {
        if (!document.hidden) {
            loadStats();
            checkNetworkStatus();
        }
    }, 30000);
    
    console.log('App ready for submissions');
});