import { requireAuth } from './auth.js';
import { db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    orderBy,
    doc,
    getDoc 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { calculateSettlements, awardXP } from './analytics.js';

let currentUser = null;
let currentGroupId = null;

// Initialize expenses page
async function initExpenses() {
    currentUser = await requireAuth();
    if (!currentUser) return;

    // Check for group filter in URL
    const urlParams = new URLSearchParams(window.location.search);
    currentGroupId = urlParams.get('group');

    await loadGroups();
    await loadExpenses();
    setupModals();
}

// Load groups for dropdown
async function loadGroups() {
    try {
        const groupsQuery = query(
            collection(db, 'groups'),
            where('members', 'array-contains', currentUser.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        
        const groupSelect = document.getElementById('expenseGroup');
        const groupFilter = document.getElementById('groupFilter');
        
        // Clear existing options (except first)
        if (groupSelect) {
            groupSelect.innerHTML = '<option value="">Select a group</option>';
        }
        if (groupFilter) {
            groupFilter.innerHTML = '<option value="all">All Groups</option>';
        }
        
        groupsSnapshot.forEach(doc => {
            const group = doc.data();
            const option = `<option value="${doc.id}">${group.name}</option>`;
            if (groupSelect) groupSelect.innerHTML += option;
            if (groupFilter) groupFilter.innerHTML += option;
        });
        
        // Set selected group if from URL
        if (currentGroupId && groupSelect) {
            groupSelect.value = currentGroupId;
            // Load members for preselected group (when navigated from group)
            try {
                await loadGroupMembers(currentGroupId);
            } catch (e) {
                console.error('Error preloading group members:', e);
            }
        }
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Load expenses
async function loadExpenses() {
    try {
        let expensesQuery;
        
        const groupFilter = document.getElementById('groupFilter')?.value;
        const monthFilter = document.getElementById('monthFilter')?.value;
        
        if (groupFilter && groupFilter !== 'all') {
            // Avoid composite index requirement; sort client-side
            expensesQuery = query(
                collection(db, 'expenses'),
                where('groupId', '==', groupFilter)
            );
            // Also load settlements for this group
            await loadGroupSettlementsUI(groupFilter);
        } else {
            // Get all groups user is part of
            const groupsQuery = query(
                collection(db, 'groups'),
                where('members', 'array-contains', currentUser.uid)
            );
            const groupsSnapshot = await getDocs(groupsQuery);
            const groupIds = [];
            groupsSnapshot.forEach(doc => groupIds.push(doc.id));
            
            if (groupIds.length === 0) {
                document.getElementById('expensesList').innerHTML = '<p class="empty-state">No expenses yet.</p>';
                const settlementsDiv = document.getElementById('groupSettlements');
                if (settlementsDiv) settlementsDiv.innerHTML = '';
                return;
            }
            
            // Avoid composite index requirement; sort client-side
            expensesQuery = query(
                collection(db, 'expenses'),
                where('groupId', 'in', groupIds)
            );
            // Clear settlements section when viewing all groups
            const settlementsDiv = document.getElementById('groupSettlements');
            if (settlementsDiv) settlementsDiv.innerHTML = '';
        }
        
        const expensesSnapshot = await getDocs(expensesQuery);
        const expensesList = document.getElementById('expensesList');
        
        if (expensesSnapshot.empty) {
            expensesList.innerHTML = '<p class="empty-state">No expenses yet. Add your first expense!</p>';
            return;
        }
        
        // Collect, filter by month, then sort by date desc client-side
        const items = [];
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            const d = new Date(expense.date);
            if (monthFilter) {
                const filterDate = new Date(monthFilter + '-01');
                if (d.getMonth() !== filterDate.getMonth() || d.getFullYear() !== filterDate.getFullYear()) {
                    return;
                }
            }
            items.push({ id: doc.id, data: expense, dateObj: d });
        });
        items.sort((a, b) => b.dateObj - a.dateObj);
        
        expensesList.innerHTML = items.length === 0 
            ? '<p class="empty-state">No expenses for selected filters.</p>'
            : '';
        items.forEach(({ id, data }) => {
            const expenseItem = createExpenseListItem(data, id);
            expensesList.appendChild(expenseItem);
        });
    } catch (error) {
        console.error('Error loading expenses:', error);
    }
}

// Load and render settlements for a specific group
async function loadGroupSettlementsUI(groupId) {
    try {
        const settlementsDiv = document.getElementById('groupSettlements');
        if (!settlementsDiv) return;
        settlementsDiv.innerHTML = '';
        
        // Get settlements for the group (pending only)
        const settlementsQuery = query(
            collection(db, 'settlements'),
            where('groupId', '==', groupId),
            where('status', '==', 'pending')
        );
        const snapshot = await getDocs(settlementsQuery);
        if (snapshot.empty) {
            settlementsDiv.innerHTML = '<p class="empty-state">No balances pending for this group.</p>';
            return;
        }
        
        // Build a simple list "A owes B: ₹X"
        const items = document.createElement('div');
        snapshot.forEach(docSnap => {
            const s = docSnap.data();
            const item = document.createElement('div');
            item.className = 'expense-item';
            item.innerHTML = `
                <div class="expense-item-header">
                    <span class="expense-item-title">${formatUser(s.userId)} owes ${formatUser(s.owedTo)}</span>
                    <span class="expense-item-amount">₹${Math.abs(s.amount || 0).toFixed(2)}</span>
                </div>
                <div class="expense-item-meta">
                    <span>${s.description || 'Settlement'}</span>
                </div>
            `;
            items.appendChild(item);
        });
        settlementsDiv.innerHTML = '<h3 style="margin: 8px 0;">Group Balances</h3>';
        settlementsDiv.appendChild(items);
    } catch (error) {
        console.error('Error loading group settlements:', error);
    }
}

// Format user ID to a short label for UI; could be extended to fetch names
function formatUser(userId) {
    if (!userId) return 'Unknown';
    // Try to map to "You" if matches current user
    if (currentUser && userId === currentUser.uid) return 'You';
    return `User ${userId.substring(0, 6)}`;
}

// Create expense list item
function createExpenseListItem(expense, expenseId) {
    const item = document.createElement('div');
    item.className = 'expense-item';
    item.style.cursor = 'pointer';
    item.onclick = () => {
        window.location.href = `expense-details.html?id=${expenseId}`;
    };
    
    const splitInfo = expense.splitType === 'equal' 
        ? `Split equally among ${expense.splitMembers?.length || 0} people`
        : 'Custom split';
    
    item.innerHTML = `
        <div class="expense-item-header">
            <span class="expense-item-title">${expense.description || 'Expense'}</span>
            <span class="expense-item-amount">₹${expense.amount?.toFixed(2) || '0.00'}</span>
        </div>
        <div class="expense-item-meta">
            <span>${new Date(expense.date).toLocaleDateString()}</span>
            <span>${expense.groupName || 'No Group'}</span>
            <span>${splitInfo}</span>
        </div>
    `;
    return item;
}

// Setup modals
function setupModals() {
    const addExpenseBtn = document.getElementById('addExpenseBtn');
    const addExpenseModal = document.getElementById('addExpenseModal');
    const addExpenseForm = document.getElementById('addExpenseForm');
    const expenseGroupSelect = document.getElementById('expenseGroup');
    const splitTypeSelect = document.getElementById('splitType');
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today;
    
    if (addExpenseBtn) {
        addExpenseBtn.addEventListener('click', async () => {
            addExpenseModal.classList.add('show');
            // When opening modal, ensure members list matches current selection
            const preselectedGroup = document.getElementById('expenseGroup')?.value;
            if (preselectedGroup) {
                try {
                    await loadGroupMembers(preselectedGroup);
                } catch (e) {
                    console.error('Error loading members on modal open:', e);
                }
            }
        });
    }
    
    if (expenseGroupSelect) {
        expenseGroupSelect.addEventListener('change', async (e) => {
            await loadGroupMembers(e.target.value);
        });
    }
    
    if (splitTypeSelect) {
        splitTypeSelect.addEventListener('change', (e) => {
            const customSection = document.getElementById('customSplitSection');
            if (e.target.value === 'custom') {
                customSection.style.display = 'block';
            } else {
                customSection.style.display = 'none';
            }
        });
    }
    
    if (addExpenseForm) {
        addExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addExpense();
        });
    }
    
    // Filter listeners
    const groupFilter = document.getElementById('groupFilter');
    const monthFilter = document.getElementById('monthFilter');
    
    if (groupFilter) {
        groupFilter.addEventListener('change', loadExpenses);
    }
    if (monthFilter) {
        monthFilter.addEventListener('change', loadExpenses);
    }
    
    // Close modals
    document.querySelectorAll('.close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.remove('show');
            });
        });
    });
    
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });
}

// Load group members
async function loadGroupMembers(groupId) {
    try {
        if (!groupId) return;
        
        const groupDoc = await getDoc(doc(db, 'groups', groupId));
        if (!groupDoc.exists()) return;
        
        const group = groupDoc.data();
        const groupRef = doc(db, 'groups', groupId);
        const memberIds = new Set(group.members || []);
        const memberEmails = Array.isArray(group.memberEmails) ? group.memberEmails : [];
        const pendingEmails = Array.isArray(group.pendingMemberEmails) ? group.pendingMemberEmails : [];

        // Try to resolve any memberEmails that aren't yet in members to user IDs
        for (const email of memberEmails) {
            try {
                const emailLc = (email || '').toLowerCase();
                let found = false;
                // First try lowercase
                const usersByEmailLc = await getDocs(
                    query(collection(db, 'users'), where('email', '==', emailLc))
                );
                usersByEmailLc.forEach(u => {
                    if (!memberIds.has(u.id)) {
                        memberIds.add(u.id);
                    }
                    found = true;
                });
                // Fallback: try raw casing (legacy)
                if (!found && email !== emailLc) {
                    const usersByEmailRaw = await getDocs(
                        query(collection(db, 'users'), where('email', '==', email))
                    );
                    usersByEmailRaw.forEach(u => {
                        if (!memberIds.has(u.id)) {
                            memberIds.add(u.id);
                        }
                    });
                }
            } catch (e) {
                console.error('Error resolving member email:', e);
            }
        }
        // Also try to resolve pending emails (users might have signed up since)
        const stillPending = [];
        const newlyResolvedEmails = [];
        for (const pEmail of pendingEmails) {
            const email = (pEmail || '').trim();
            if (!email) continue;
            try {
                const lc = email.toLowerCase();
                let resolved = false;
                const s1 = await getDocs(query(collection(db, 'users'), where('email', '==', lc)));
                s1.forEach(u => {
                    memberIds.add(u.id);
                    resolved = true;
                });
                if (!resolved && lc !== email) {
                    const s2 = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
                    s2.forEach(u => {
                        memberIds.add(u.id);
                        resolved = true;
                    });
                }
                if (resolved) {
                    newlyResolvedEmails.push(email);
                } else {
                    stillPending.push(email);
                }
            } catch (e) {
                console.error('Error resolving pending email:', e);
                stillPending.push(email);
            }
        }
        // If any pending emails resolved, persist promotion to group (best-effort)
        if (newlyResolvedEmails.length > 0) {
            try {
                // Rebuild new arrays
                const updatedPending = pendingEmails.filter(e => !newlyResolvedEmails.includes(e));
                const normalizedAdditions = newlyResolvedEmails.map(e => (e || '').toLowerCase());
                const updatedMemberEmails = Array.from(new Set([...memberEmails, ...normalizedAdditions]));
                await updateDoc(groupRef, {
                    members: Array.from(memberIds),
                    memberEmails: updatedMemberEmails,
                    pendingMemberEmails: updatedPending
                });
            } catch (e) {
                console.error('Error promoting pending to members:', e);
            }
        }
        
        // Load paid by dropdown
        const paidBySelect = document.getElementById('expensePaidBy');
        paidBySelect.innerHTML = '<option value="">Select payer</option>';
        
        // Load split members
        const splitMembersDiv = document.getElementById('splitMembers');
        splitMembersDiv.innerHTML = '';
        
        const customSplitInputs = document.getElementById('customSplitInputs');
        customSplitInputs.innerHTML = '';
        
        // Add resolved user members
        for (const memberId of memberIds) {
            try {
                const userDoc = await getDoc(doc(db, 'users', memberId));
                if (userDoc.exists()) {
                    const userName = userDoc.data().name || 'Unknown';
                    
                    // Add to paid by dropdown
                    const option = document.createElement('option');
                    option.value = memberId;
                    option.textContent = userName;
                    paidBySelect.appendChild(option);
                    
                    // Add to split members
                    const memberItem = document.createElement('div');
                    memberItem.className = 'split-member-item';
                    memberItem.innerHTML = `
                        <input type="checkbox" id="member_${memberId}" value="${memberId}" checked>
                        <label for="member_${memberId}">${userName}</label>
                    `;
                    splitMembersDiv.appendChild(memberItem);
                    
                    // Add to custom split inputs
                    const customInput = document.createElement('div');
                    customInput.className = 'form-group';
                    customInput.innerHTML = `
                        <label>${userName}</label>
                        <input type="number" id="custom_${memberId}" step="0.01" min="0" placeholder="Amount">
                    `;
                    customSplitInputs.appendChild(customInput);
                }
            } catch (error) {
                console.error('Error loading member:', error);
            }
        }

        // Show remaining pending emails (no user yet): not allowed as payer
        const pendingToShow = newlyResolvedEmails.length > 0 ? pendingEmails.filter(e => !newlyResolvedEmails.includes(e)) : pendingEmails;
        for (const pEmail of pendingToShow) {
            const emailText = (pEmail || '').trim();
            if (!emailText) continue;
            const memberItem = document.createElement('div');
            memberItem.className = 'split-member-item';
            memberItem.innerHTML = `
                <input type="checkbox" disabled>
                <label>${emailText} (pending)</label>
            `;
            splitMembersDiv.appendChild(memberItem);
        }
    } catch (error) {
        console.error('Error loading group members:', error);
    }
}

// Add expense
async function addExpense() {
    try {
        const groupId = document.getElementById('expenseGroup').value;
        const description = document.getElementById('expenseDescription').value;
        const amount = parseFloat(document.getElementById('expenseAmount').value);
        const date = document.getElementById('expenseDate').value;
        const paidBy = document.getElementById('expensePaidBy').value;
        const splitType = document.getElementById('splitType').value;
        
        // Get selected members for split
        const selectedMembers = [];
        document.querySelectorAll('#splitMembers input[type="checkbox"]:checked').forEach(checkbox => {
            selectedMembers.push(checkbox.value);
        });
        
        if (selectedMembers.length === 0) {
            alert('Please select at least one member to split with.');
            return;
        }
        
        // Calculate split amounts
        let splitAmounts = {};
        if (splitType === 'equal') {
            const perPerson = amount / selectedMembers.length;
            selectedMembers.forEach(memberId => {
                splitAmounts[memberId] = perPerson;
            });
        } else {
            // Custom split
            let totalCustom = 0;
            selectedMembers.forEach(memberId => {
                const customAmount = parseFloat(document.getElementById(`custom_${memberId}`).value) || 0;
                splitAmounts[memberId] = customAmount;
                totalCustom += customAmount;
            });
            
            if (Math.abs(totalCustom - amount) > 0.01) {
                alert(`Custom split amounts (₹${totalCustom.toFixed(2)}) must equal total amount (₹${amount.toFixed(2)}).`);
                return;
            }
        }
        
        // Get group name
        const groupDoc = await getDoc(doc(db, 'groups', groupId));
        const groupName = groupDoc.exists() ? groupDoc.data().name : 'Unknown Group';
        
        // Create expense document
        const expenseData = {
            groupId: groupId,
            groupName: groupName,
            description: description,
            amount: amount,
            date: date,
            paidBy: paidBy,
            splitType: splitType,
            splitMembers: selectedMembers,
            splitAmounts: splitAmounts,
            createdAt: new Date().toISOString()
        };
        
        const expenseRef = await addDoc(collection(db, 'expenses'), expenseData);
        
        // Calculate and create settlements (with expense ID)
        expenseData.id = expenseRef.id;
        await calculateSettlements(groupId, expenseData);
        
        // Award XP
        await awardXP(paidBy, 10); // 10 XP for adding expense
        
        // Reset form and close modal
        document.getElementById('addExpenseForm').reset();
        document.getElementById('addExpenseModal').classList.remove('show');
        
        // Reload expenses
        await loadExpenses();
        // If a specific group is selected, refresh its settlements UI
        const gf = document.getElementById('groupFilter')?.value;
        if (gf && gf !== 'all') {
            await loadGroupSettlementsUI(gf);
        }
        
        alert('Expense added successfully!');
    } catch (error) {
        console.error('Error adding expense:', error);
        alert('Error adding expense: ' + error.message);
    }
}

// Initialize on page load
if (document.getElementById('expensesList')) {
    initExpenses();
}

