/**
 * ============================================
 * EXPENSE DETAILS PAGE (expense-details.js)
 * ============================================
 * This file shows the detailed breakdown of a single expense
 * - Who paid the money
 * - How much each person owes
 * - Lets users settle their debts with a button
 */

// Import login checker and user data fetcher from auth.js
import { requireAuth, getUserData } from './auth.js';
// Import database connection from firebase-config.js
import { db } from './firebase-config.js';
// Import database operations we need
import {
    collection,      // Get a reference to a collection (like a table)
    query,           // Create a search query
    where,           // Filter results (like WHERE in SQL)
    getDocs,         // Get multiple documents
    doc,             // Get a reference to a single document
    getDoc,          // Get data from a single document
    updateDoc,       // Update an existing document
    setDoc           // Create a new document
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * ============================================
 * GLOBAL VARIABLES
 * ============================================
 */
let currentUser = null; // Stores who is logged in

/**
 * ============================================
 * FUNCTION: initExpenseDetails()
 * ============================================
 * What it does:
 * 1. Checks if user is logged in (requireAuth)
 * 2. Gets the expense ID from the URL (the specific expense to show)
 * 3. Loads that expense's details
 */
async function initExpenseDetails() {
    // Step 1: Make sure user is logged in
    currentUser = await requireAuth();
    if (!currentUser) return; // If not logged in, stop here
    
    // Step 2: Get expense ID from URL
    // Example: expensedetails.html?id=abc123
    // This gets "abc123"
    const url = new URLSearchParams(window.location.search);
    const expenseId = url.get('id');
    
    // If no expense ID found in URL, show error
    if (!expenseId) {
        document.getElementById('expenseTitle').textContent = 'Expense Not Found';
        return;
    }

    // Step 3: Load the expense details
    await loadExpenseDetails(expenseId);
}

/**
 * ============================================
 * FUNCTION: loadExpenseDetails(expenseId)
 * ============================================
 * What it does: 
 * - Gets all the details about an expense from the database
 * - Shows who paid and how much
 * - Shows who owes what to whom
 * - Creates a "Settle Payment" button if user owes money
 */
async function loadExpenseDetails(expenseId) {
    try {
        // ==========================================
        // STEP 1: Get the Expense Information
        // ==========================================
        const expenseSnap = await getDoc(doc(db, 'expenses', expenseId));
        if (!expenseSnap.exists()) {
            document.getElementById('expenseTitle').textContent = 'Expense Not Found';
            return;
        }
        const expense = expenseSnap.data();
        // Now we have: expense.amount, expense.paidBy, expense.description, etc.
        
        // Set the page title to the expense description
        document.getElementById('expenseTitle').textContent = expense.description || 'Expense';

        // ==========================================
        // STEP 2: Display Expense Metadata
        // ==========================================
        // Show: Amount, Date, Who Paid
        const meta = document.getElementById('expenseMeta');
        const amount = `₹${(expense.amount || 0).toFixed(2)}`; // Format money
        const dateStr = expense.date ? new Date(expense.date).toLocaleDateString() : '';
        meta.innerHTML = `
            <div class="expense-item-header">
                <span class="expense-item-title">${expense.groupName || 'Group'}</span>
                <span class="expense-item-amount">${amount}</span>
            </div>
            <div class="expense-item-meta">
                <span>${dateStr}</span>
                <span>Paid by: ${await resolveName(expense.paidBy)}</span>
            </div>
        `;

        // ==========================================
        // STEP 3: Calculate Who Owes What
        // ==========================================
        // The expense might be split between multiple people
        // We need to figure out how much each person owes
        
        let settlements = [];  // List of who owes whom
        const payer = expense.paidBy;  // The person who paid
        let split = expense.splitAmounts || {};  // How the amount is split

        // If we don't have split information, we need to calculate it
        if (!split || Object.keys(split).length === 0) {
            let members = Array.isArray(expense.splitMembers) ? expense.splitMembers : [];
            
            // Try to get the group's members if we don't have them
            if (!members || members.length === 0) {
                try {
                    const groupSnap = await getDoc(doc(db, 'groups', expense.groupId));
                    if (groupSnap.exists()) {
                        const g = groupSnap.data();
                        const memberIds = new Set(g.members || []);
                        const memberEmails = Array.isArray(g.memberEmails) ? g.memberEmails : [];
                        
                        // Convert email addresses to user IDs
                        for (const email of memberEmails) {
                            const lc = (email || '').toLowerCase();
                            const s1 = await getDocs(query(collection(db, 'users'), where('email', '==', lc)));
                            s1.forEach(u => memberIds.add(u.id));
                            if (lc !== email) {
                                const s2 = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
                                s2.forEach(u => memberIds.add(u.id));
                            }
                        }
                        members = Array.from(memberIds);
                    }
                } catch {
                    members = [];
                }
            }
            
            // Remove the payer from the list (they don't owe themselves)
            members = members.filter(m => m && m !== payer);
            
            // Calculate equal split
            if ((expense.splitType || 'equal') === 'equal' && members.length > 0) {
                const perPerson = (Number(expense.amount) || 0) / members.length;
                const derived = {};
                members.forEach(m => { derived[m] = perPerson; });
                split = derived;
            } else {
                // Fallback: split equally among members
                if (members.length > 0) {
                    const perPerson = (Number(expense.amount) || 0) / members.length;
                    const derived = {};
                    members.forEach(m => { derived[m] = perPerson; });
                    split = derived;
                } else {
                    split = {};
                }
            }
        }

        // ==========================================
        // STEP 4: Build Settlement List
        // ==========================================
        // Create entries for "Person A owes Person B ₹X"
        Object.entries(split).forEach(([memberId, amt]) => {
            // Skip if no member or if payer owes themselves
            if (!memberId || memberId === payer) return;
            
            const amountNum = Number(amt) || 0;
            if (amountNum <= 0) return; // Skip zero amounts
            
            // Create settlement entry
            settlements.push({
                id: `local-${memberId}`,
                expenseId,
                groupId: expense.groupId,
                userId: memberId,              // Who owes
                owedTo: payer,                 // Who receives
                amount: amountNum,             // How much
                description: expense.description || 'Expense',
                status: 'pending'
            });
        });

        // ==========================================
        // STEP 5: Display Breakdown and Calculations
        // ==========================================
        // Calculate how much user owes and is owed
        let youOwe = 0;         // Total amount logged-in user owes
        let owedToYou = 0;      // Total amount owed to logged-in user
        
        const peopleDiv = document.getElementById('peopleBreakdown');
        peopleDiv.innerHTML = '';
        
        // If no settlements, show empty message
        if (settlements.length === 0) {
            peopleDiv.innerHTML = '<p class="empty-state">No breakdown available.</p>';
        }

        // Display each settlement
        for (const s of settlements) {
            const amount = s.amount || 0;
            const isYou = s.userId === currentUser.uid;
            const title = `${await resolveName(s.userId)} owes ${await resolveName(s.owedTo)}`;
            
            // Check if this settlement has been paid
            const settlementStatus = expense.settlementStatus && expense.settlementStatus[s.userId];
            const status = settlementStatus || 'pending'; // Default to pending if not specified
            
            // Create HTML for this settlement
            const item = document.createElement('div');
            item.className = 'expense-item';
            item.innerHTML = `
                <div class="expense-item-header">
                    <span class="expense-item-title">${title}</span>
                    <span class="expense-item-amount" style="color:${amount > 0 ? 'var(--danger-color)' : 'var(--success-color)'}">
                        ₹${Math.abs(amount).toFixed(2)}
                    </span>
                </div>
                <div class="expense-item-meta">
                    <span>${s.description || 'Settlement'}</span>
                    <span>Status: <strong style="color:${status === 'paid' ? 'var(--success-color)' : 'var(--danger-color)'}">${status}</strong></span>
                </div>
            `;
            peopleDiv.appendChild(item);

            // Calculate totals for current user
            // Only count unpaid amounts
            if (isYou && amount > 0 && status !== 'paid') youOwe += amount;
            if (s.owedTo === currentUser.uid && amount > 0) owedToYou += amount;
        }

        // ==========================================
        // STEP 6: Display User's Summary
        // ==========================================
        // Show total amount user owes and is owed
        const summary = document.getElementById('userSummary');
        summary.innerHTML = `
            <div class="expense-item-header">
                <span class="expense-item-title">Your Balance</span>
            </div>
            <div class="expense-item-meta">
                <span>You owe: <strong style="color:var(--danger-color)">₹${youOwe.toFixed(2)}</strong></span>
                <span>Owed to you: <strong style="color:var(--success-color)">₹${owedToYou.toFixed(2)}</strong></span>
            </div>
        `;

        // ==========================================
        // STEP 7: Create Settle Payment Button
        // ==========================================
        // Only show button if user owes money
        const settleContainer = document.getElementById('settleButtonContainer');
        console.log('youOwe:', youOwe, 'settleContainer:', settleContainer);
        if (youOwe > 0) {
            const settleButton = document.createElement('button');
            settleButton.className = 'btn btn-success';
            settleButton.textContent = `Settle Payment (₹${youOwe.toFixed(2)})`;
            settleButton.style.marginTop = '16px';
            // When clicked, settle the payment
            settleButton.onclick = () => settlePayment(expenseId, youOwe);
            settleContainer.appendChild(settleButton);
            console.log('Button added to container');
        } else {
            settleContainer.innerHTML = '';
            console.log('User does not owe money');
        }
    } catch (error) {
        console.error('Error loading expense details:', error);
        document.getElementById('peopleBreakdown').innerHTML = '<p class="empty-state">Unable to load details.</p>';
    }
}


/**
 * ============================================
 * FUNCTION: resolveName(userId)
 * ============================================
 * What it does:
 * - Takes a user ID and converts it to the user's display name
 * - Special case: If it's the current user, return "You" instead of name
 * - If user not found, return a shortened version of their ID
 * 
 * Why we need it:
 * - So we can show "John owes you ₹500" instead of "abc123 owes def456 ₹500"
 * - Makes the app more human-friendly
 */
async function resolveName(userId) {
    try {
        if (!userId) return 'Unknown';
        
        // If this is the logged-in user, show "You" instead of their name
        if (currentUser && userId === currentUser.uid) return 'You';
        
        // Get the user's profile from database
        const userSnap = await getDoc(doc(db, 'users', userId));
        if (userSnap.exists()) {
            // Return their display name
            return userSnap.data().name || 'Unknown';
        }
        // If user not found, show first 6 characters of ID
        return `User ${userId.substring(0, 6)}`;
    } catch {
        // If error occurs, also show shortened ID
        return `User ${userId.substring(0, 6)}`;
    }
}

/**
 * ============================================
 * FUNCTION: settlePayment(expenseId, amount)
 * ============================================
 * What it does:
 * - Records that the logged-in user has paid their debt
 * - Updates the expense to show the debt as "paid"
 * - Shows a success message
 * - Reloads the page to show updated status
 * 
 * Parameters:
 * - expenseId: Which expense is being settled
 * - amount: How much is being paid
 */
async function settlePayment(expenseId, amount) {
    // Safety check: Make sure user is logged in
    if (!currentUser) {
        alert('User not authenticated');
        return;
    }

    try {
        // Get the expense details from the database
        const expenseSnap = await getDoc(doc(db, 'expenses', expenseId));
        if (!expenseSnap.exists()) {
            alert('Expense not found');
            return;
        }

        const expense = expenseSnap.data();
        const payee = expense.paidBy; // Who should receive the payment

        // Don't allow users to settle their own expense
        if (currentUser.uid === payee) {
            alert('You cannot settle a payment for your own expense');
            return;
        }

        // Update the expense to mark this user's debt as "paid"
        const expenseRef = doc(db, 'expenses', expenseId);
        const updateData = {
            // Create/update the settlementStatus object
            // This tracks which users have paid their debts
            settlementStatus: {
                ...(expense.settlementStatus || {}), // Keep existing settlement statuses
                [currentUser.uid]: 'paid'             // Mark current user as paid
            }
        };

        // Save the update to the database
        await updateDoc(expenseRef, updateData);
        
        // Log success for debugging
        console.log('Settlement status updated successfully');
        
        // Show success message to user
        alert(`Payment of ₹${amount.toFixed(2)} settled successfully!`);
        
        // Reload the page to show the updated status
        window.location.reload();
    } catch (error) {
        // If something went wrong, show the error
        console.error('Error settling payment:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        alert(`Failed to settle payment: ${error.message}`);
    }
}

/**
 * ============================================
 * INITIALIZATION CODE
 * ============================================
 * This code runs when the page loads
 * It starts the expense detail loading process
 */
if (document.getElementById('expenseTitle')) {
    // If the page has an expense title element, load the expense details
    initExpenseDetails();
}


