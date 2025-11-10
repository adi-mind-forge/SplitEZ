import { requireAuth, getUserData } from './auth.js';
import { getLeaderboard, getMonthlySpending, getGroupSpending } from './analytics.js';

let currentUser = null;
let spendingChart = null;
let categoryChart = null;

// Initialize analytics page
async function initAnalytics() {
    currentUser = await requireAuth();
    if (!currentUser) return;

    await loadUserStats();
    await loadBadges();
    await loadLeaderboard();
    await loadGroupSpending();
    setupMonthFilter();
    
    // Load default month (current month)
    const now = new Date();
    await loadMonthlyData(now.getFullYear(), now.getMonth() + 1);
}

// Load user stats
async function loadUserStats() {
    try {
        const userData = await getUserData(currentUser.uid);
        if (userData) {
            document.getElementById('userXP').textContent = `${userData.xpPoints || 0} XP`;
            document.getElementById('userLevel').textContent = userData.level || 1;
            
            // Update XP progress bar
            const xpProgress = (userData.xpPoints || 0) % 100;
            document.getElementById('xpProgressBar').style.width = `${xpProgress}%`;
        }
    } catch (error) {
        console.error('Error loading user stats:', error);
    }
}

// Load badges
async function loadBadges() {
    try {
        const userData = await getUserData(currentUser.uid);
        const badges = userData?.badges || [];
        
        const badgeDefinitions = {
            'first_expense': { name: 'First Step', icon: 'fa-star' },
            'expense_master': { name: 'Expense Master', icon: 'fa-trophy' },
            'level_5': { name: 'Level 5', icon: 'fa-medal' },
            'level_10': { name: 'Level 10', icon: 'fa-crown' },
            'settler': { name: 'Settler', icon: 'fa-check-circle' },
            'group_creator': { name: 'Group Creator', icon: 'fa-users' }
        };
        
        const badgesGrid = document.getElementById('userBadges');
        badgesGrid.innerHTML = '';
        
        // Show all badges (earned and unearned)
        for (const [badgeId, badgeInfo] of Object.entries(badgeDefinitions)) {
            const isEarned = badges.includes(badgeId);
            const badgeItem = document.createElement('div');
            badgeItem.className = `badge-item ${isEarned ? 'earned' : ''}`;
            badgeItem.innerHTML = `
                <i class="fas ${badgeInfo.icon}"></i>
                <p>${badgeInfo.name}</p>
                ${isEarned ? '<span style="color: var(--success-color);">✓ Earned</span>' : '<span style="color: var(--text-secondary);">Locked</span>'}
            `;
            badgesGrid.appendChild(badgeItem);
        }
    } catch (error) {
        console.error('Error loading badges:', error);
    }
}

// Load leaderboard
async function loadLeaderboard() {
    try {
        const leaderboard = await getLeaderboard(10);
        const leaderboardDiv = document.getElementById('leaderboard');
        
        if (leaderboard.length === 0) {
            leaderboardDiv.innerHTML = '<p class="empty-state">No leaderboard data yet.</p>';
            return;
        }
        
        leaderboardDiv.innerHTML = '';
        leaderboard.forEach(user => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            const isCurrentUser = user.userId === currentUser.uid;
            item.style.background = isCurrentUser ? '#1e3a5f' : '#0f172a';
            
            item.innerHTML = `
                <div class="leaderboard-rank">${user.rank}</div>
                <div class="leaderboard-info">
                    <strong>${user.name}${isCurrentUser ? ' (You)' : ''}</strong>
                    <p>Level ${user.level} • ${user.badges.length} badges</p>
                </div>
                <div class="leaderboard-xp">${user.xpPoints} XP</div>
            `;
            leaderboardDiv.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

// Load monthly data
async function loadMonthlyData(year, month) {
    try {
        const data = await getMonthlySpending(currentUser.uid, month, year);
        
        // Update spending chart
        updateSpendingChart(data);
        
        // Update category chart
        updateCategoryChart(data.categories);
    } catch (error) {
        console.error('Error loading monthly data:', error);
    }
}

// Update spending chart
function updateSpendingChart(data) {
    const ctx = document.getElementById('spendingChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (spendingChart) {
        spendingChart.destroy();
    }
    
    // Prepare data for last 6 months
    const months = [];
    const amounts = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
        // For demo, use current month's data for all months
        // In production, fetch data for each month
        amounts.push(i === 0 ? data.total : 0);
    }
    
    spendingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Spending (₹)',
                data: amounts,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Update category chart
function updateCategoryChart(categories) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (categoryChart) {
        categoryChart.destroy();
    }
    
    const labels = Object.keys(categories);
    const values = Object.values(categories);
    
    if (labels.length === 0) {
        ctx.parentElement.innerHTML = '<p class="empty-state">No category data available.</p>';
        return;
    }
    
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#6366f1',
                    '#8b5cf6',
                    '#ec4899',
                    '#f59e0b',
                    '#10b981',
                    '#06b6d4'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// Load group spending
async function loadGroupSpending() {
    try {
        const groupSpending = await getGroupSpending(currentUser.uid);
        const groupSpendingDiv = document.getElementById('groupSpending');
        
        if (groupSpending.length === 0) {
            groupSpendingDiv.innerHTML = '<p class="empty-state">No group spending data yet.</p>';
            return;
        }
        
        groupSpendingDiv.innerHTML = '';
        groupSpending.forEach(group => {
            const item = document.createElement('div');
            item.className = 'group-spending-item';
            item.innerHTML = `
                <div>
                    <strong>${group.groupName}</strong>
                </div>
                <div style="color: var(--primary-color); font-weight: 600;">
                    ₹${group.total.toFixed(2)}
                </div>
            `;
            groupSpendingDiv.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading group spending:', error);
    }
}

// Setup month filter
function setupMonthFilter() {
    const monthSelect = document.getElementById('analyticsMonth');
    if (!monthSelect) return;
    
    // Populate month options (last 12 months)
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        
        const option = document.createElement('option');
        option.value = monthValue;
        option.textContent = monthLabel;
        if (i === 0) option.selected = true; // Select current month
        monthSelect.appendChild(option);
    }
    
    monthSelect.addEventListener('change', (e) => {
        const [year, month] = e.target.value.split('-').map(Number);
        loadMonthlyData(year, month);
    });
}

// Initialize on page load
if (document.getElementById('userXP')) {
    initAnalytics();
}

