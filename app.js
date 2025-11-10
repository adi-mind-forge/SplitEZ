import { requireAuth, getUserData } from './auth.js';
import { db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    orderBy, 
    limit,
    doc,
    getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;

// Initialize dashboard
async function initDashboard() {
    currentUser = await requireAuth();
    if (!currentUser) return;

    // Load user data
    const userData = await getUserData(currentUser.uid);
    if (userData) {
        document.getElementById('userName').textContent = userData.name || 'User';
        document.getElementById('xpPoints').textContent = `${userData.xpPoints || 0} XP`;
    }

    // Load dashboard data
    await loadDashboardStats();
    await loadRecentExpenses();
    await loadPendingSettlements();
    await loadUserGroups();
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        const expensesQuery = query(
            collection(db, 'expenses'),
            where('paidBy', '==', currentUser.uid),
            orderBy('date', 'desc')
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        
        let totalSpent = 0;
        expensesSnapshot.forEach(doc => {
            totalSpent += doc.data().amount || 0;
        });

        // Calculate owed amounts
        const settlementsQuery = query(
            collection(db, 'settlements'),
            where('userId', '==', currentUser.uid),
            where('status', '==', 'pending')
        );
        const settlementsSnapshot = await getDocs(settlementsQuery);
        
        let totalOwed = 0;
        let totalOwedToYou = 0;
        settlementsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.amount > 0) {
                totalOwed += data.amount;
            } else {
                totalOwedToYou += Math.abs(data.amount);
            }
        });

        document.getElementById('totalSpent').textContent = `₹${totalSpent.toFixed(2)}`;
        document.getElementById('totalOwed').textContent = `₹${totalOwed.toFixed(2)}`;
        document.getElementById('totalOwedToYou').textContent = `₹${totalOwedToYou.toFixed(2)}`;
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Load recent expenses
async function loadRecentExpenses() {
    try {
        const expensesQuery = query(
            collection(db, 'expenses'),
            where('paidBy', '==', currentUser.uid),
            orderBy('date', 'desc'),
            limit(5)
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        const expensesList = document.getElementById('recentExpenses');
        
        if (expensesSnapshot.empty) {
            expensesList.innerHTML = '<p class="empty-state">No expenses yet. Add your first expense!</p>';
            return;
        }

        expensesList.innerHTML = '';
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            const expenseItem = createExpenseItem(expense, doc.id);
            expensesList.appendChild(expenseItem);
        });
    } catch (error) {
        console.error('Error loading recent expenses:', error);
    }
}

// Create expense item element
function createExpenseItem(expense, expenseId) {
    const item = document.createElement('div');
    item.className = 'expense-item';
    item.innerHTML = `
        <div class="expense-item-header">
            <span class="expense-item-title">${expense.description || 'Expense'}</span>
            <span class="expense-item-amount">₹${expense.amount?.toFixed(2) || '0.00'}</span>
        </div>
        <div class="expense-item-meta">
            <span>${new Date(expense.date).toLocaleDateString()}</span>
            <span>${expense.groupName || 'No Group'}</span>
        </div>
    `;
    return item;
}

// Load pending settlements
async function loadPendingSettlements() {
    try {
        const settlementsQuery = query(
            collection(db, 'settlements'),
            where('userId', '==', currentUser.uid),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc')
        );
        const settlementsSnapshot = await getDocs(settlementsQuery);
        const settlementsList = document.getElementById('pendingSettlements');
        
        if (settlementsSnapshot.empty) {
            settlementsList.innerHTML = '<p class="empty-state">No pending settlements</p>';
            return;
        }

        settlementsList.innerHTML = '';
        settlementsSnapshot.forEach(doc => {
            const settlement = doc.data();
            const settlementItem = createSettlementItem(settlement, doc.id);
            settlementsList.appendChild(settlementItem);
        });
    } catch (error) {
        console.error('Error loading pending settlements:', error);
    }
}

// Create settlement item element
function createSettlementItem(settlement, settlementId) {
    const item = document.createElement('div');
    item.className = 'settlement-item';
    const amount = settlement.amount || 0;
    const isOwed = amount > 0;
    
    const settleButton = isOwed ? `
        <button class="btn btn-primary" style="margin-top: 8px; width: auto;" onclick="settlePayment('${settlementId}', ${Math.abs(amount)})">
            Settle Payment
        </button>
    ` : '';
    
    // For settlements where user is owed, send reminder to the person who owes
    const reminderButton = !isOwed ? `
        <button class="btn btn-secondary" style="margin-top: 8px; width: auto; margin-left: 8px;" onclick="sendReminderToDebtor('${settlementId}')">
            <i class="fas fa-bell"></i> Send Reminder
        </button>
    ` : '';
    
    item.innerHTML = `
        <div class="expense-item-header">
            <span class="expense-item-title">${settlement.description || 'Settlement'}</span>
            <span class="expense-item-amount" style="color: ${isOwed ? 'var(--danger-color)' : 'var(--success-color)'}">
                ${isOwed ? 'You owe' : 'Owed to you'}: ₹${Math.abs(amount).toFixed(2)}
            </span>
        </div>
        <div class="expense-item-meta">
            <span>${settlement.groupName || 'No Group'}</span>
        </div>
        <div style="display: flex; gap: 8px;">
            ${settleButton}
            ${reminderButton}
        </div>
    `;
    return item;
}

// Load user groups
async function loadUserGroups() {
    try {
        const groupsQuery = query(
            collection(db, 'groups'),
            where('members', 'array-contains', currentUser.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupsList = document.getElementById('userGroups');
        
        if (groupsSnapshot.empty) {
            groupsList.innerHTML = '<p class="empty-state">No groups yet. Create your first group!</p>';
            return;
        }

        groupsList.innerHTML = '';
        groupsSnapshot.forEach(doc => {
            const group = doc.data();
            const groupItem = createGroupItem(group, doc.id);
            groupsList.appendChild(groupItem);
        });
    } catch (error) {
        console.error('Error loading user groups:', error);
    }
}

// Create group item element
function createGroupItem(group, groupId) {
    const item = document.createElement('div');
    item.className = 'group-card';
    item.onclick = () => window.location.href = `groups.html?id=${groupId}`;
    
    item.innerHTML = `
        <div class="group-card-header">
            <span class="group-card-name">${group.name || 'Unnamed Group'}</span>
        </div>
        <div class="group-card-members">${group.members?.length || 0} members</div>
        <div class="group-card-balance">View Details →</div>
    `;
    return item;
}

// Settle payment function (global for onclick)
window.settlePayment = async function(settlementId, amount) {
    try {
        const { initiatePayment } = await import('./payments.js');
        const settlementDoc = await getDoc(doc(db, 'settlements', settlementId));
        if (!settlementDoc.exists()) {
            alert('Settlement not found');
            return;
        }
        
        const settlement = settlementDoc.data();
        await initiatePayment(
            amount,
            settlement.description || 'Settlement',
            currentUser.uid,
            settlementId
        );
    } catch (error) {
        console.error('Error settling payment:', error);
        alert('Error settling payment: ' + error.message);
    }
};

// Send reminder function (global for onclick)
window.sendReminderToDebtor = async function(settlementId) {
    try {
        const settlementDoc = await getDoc(doc(db, 'settlements', settlementId));
        if (!settlementDoc.exists()) {
            alert('Settlement not found');
            return;
        }
        
        const settlement = settlementDoc.data();
        // The userId in settlement is the person who owes (debtor)
        const debtorId = settlement.userId;
        
        const reminderModule = await import('./reminders.js');
        const result = await reminderModule.sendReminder(settlementId, debtorId);
        if (result.success) {
            alert('Reminder sent successfully!');
        } else {
            alert('Error sending reminder: ' + result.error);
        }
    } catch (error) {
        console.error('Error sending reminder:', error);
        alert('Error sending reminder: ' + error.message);
    }
};

// Initialize on page load
if (document.getElementById('userName')) {
    initDashboard();
}

