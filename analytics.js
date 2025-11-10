import { db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    getDoc, 
    updateDoc,
    addDoc,
    orderBy,
    limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Calculate settlements for a group after adding expense
export async function calculateSettlements(groupId, expense) {
    try {
        const paidBy = expense.paidBy;
        const splitAmounts = expense.splitAmounts || {};
        
        // Create settlements for each member who owes
        for (const [memberId, amount] of Object.entries(splitAmounts)) {
            if (memberId === paidBy) continue; // Skip the payer
            
            const settlementData = {
                groupId: groupId,
                expenseId: expense.id || '',
                userId: memberId,
                owedTo: paidBy,
                amount: amount, // Positive means user owes
                description: expense.description || 'Expense',
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            await addDoc(collection(db, 'settlements'), settlementData);
        }
        
        // Create settlement for the payer (negative amount means they are owed)
        const totalOwed = Object.values(splitAmounts)
            .filter((_, index) => Object.keys(splitAmounts)[index] !== paidBy)
            .reduce((sum, amount) => sum + amount, 0);
        
        if (totalOwed > 0) {
            const payerSettlement = {
                groupId: groupId,
                expenseId: expense.id || '',
                userId: paidBy,
                owedTo: paidBy,
                amount: -totalOwed, // Negative means user is owed
                description: expense.description || 'Expense',
                status: 'pending',
                createdAt: new Date().toISOString()
            };
            
            await addDoc(collection(db, 'settlements'), payerSettlement);
        }
    } catch (error) {
        console.error('Error calculating settlements:', error);
    }
}

// Award XP points to user
export async function awardXP(userId, points) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data();
        const currentXP = userData.xpPoints || 0;
        const newXP = currentXP + points;
        const newLevel = Math.floor(newXP / 100) + 1; // Level up every 100 XP
        
        await updateDoc(doc(db, 'users', userId), {
            xpPoints: newXP,
            level: newLevel
        });
        
        // Check for badge achievements
        await checkBadges(userId, newXP, newLevel);
        
        return { success: true, newXP, newLevel };
    } catch (error) {
        console.error('Error awarding XP:', error);
        return { success: false, error: error.message };
    }
}

// Check and award badges
async function checkBadges(userId, xp, level) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data();
        const currentBadges = userData.badges || [];
        const newBadges = [];
        
        // Badge definitions
        const badgeDefinitions = [
            { id: 'first_expense', name: 'First Step', icon: 'fa-star', condition: () => xp >= 10 },
            { id: 'expense_master', name: 'Expense Master', icon: 'fa-trophy', condition: () => xp >= 100 },
            { id: 'level_5', name: 'Level 5', icon: 'fa-medal', condition: () => level >= 5 },
            { id: 'level_10', name: 'Level 10', icon: 'fa-crown', condition: () => level >= 10 },
            { id: 'settler', name: 'Settler', icon: 'fa-check-circle', condition: async () => {
                const settlementsQuery = query(
                    collection(db, 'settlements'),
                    where('userId', '==', userId),
                    where('status', '==', 'paid')
                );
                const settlementsSnapshot = await getDocs(settlementsQuery);
                return settlementsSnapshot.size >= 5;
            }},
            { id: 'group_creator', name: 'Group Creator', icon: 'fa-users', condition: async () => {
                const groupsQuery = query(
                    collection(db, 'groups'),
                    where('createdBy', '==', userId)
                );
                const groupsSnapshot = await getDocs(groupsQuery);
                return groupsSnapshot.size >= 3;
            }}
        ];
        
        for (const badge of badgeDefinitions) {
            if (!currentBadges.includes(badge.id)) {
                const earned = typeof badge.condition === 'function' 
                    ? await badge.condition() 
                    : badge.condition;
                
                if (earned) {
                    newBadges.push(badge.id);
                }
            }
        }
        
        if (newBadges.length > 0) {
            await updateDoc(doc(db, 'users', userId), {
                badges: [...currentBadges, ...newBadges]
            });
            
            // Show badge notification
            showBadgeNotification(newBadges.map(id => 
                badgeDefinitions.find(b => b.id === id)
            ));
        }
    } catch (error) {
        console.error('Error checking badges:', error);
    }
}

// Show badge notification
function showBadgeNotification(badges) {
    badges.forEach(badge => {
        if (badge) {
            alert(`🎉 Badge Unlocked: ${badge.name}!`);
        }
    });
}

// Get leaderboard
export async function getLeaderboard(limitCount = 10) {
    try {
        const usersQuery = query(
            collection(db, 'users'),
            orderBy('xpPoints', 'desc'),
            limit(limitCount)
        );
        const usersSnapshot = await getDocs(usersQuery);
        
        const leaderboard = [];
        usersSnapshot.forEach((doc, index) => {
            const userData = doc.data();
            leaderboard.push({
                rank: index + 1,
                userId: doc.id,
                name: userData.name || 'Unknown',
                xpPoints: userData.xpPoints || 0,
                level: userData.level || 1,
                badges: userData.badges || []
            });
        });
        
        return leaderboard;
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

// Get monthly spending analytics
export async function getMonthlySpending(userId, month, year) {
    try {
        const startDate = new Date(year, month - 1, 1).toISOString();
        const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
        
        // Get all expenses where user is involved
        const groupsQuery = query(
            collection(db, 'groups'),
            where('members', 'array-contains', userId)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupIds = [];
        groupsSnapshot.forEach(doc => groupIds.push(doc.id));
        
        if (groupIds.length === 0) return { total: 0, expenses: [] };
        
        const expensesQuery = query(
            collection(db, 'expenses'),
            where('groupId', 'in', groupIds),
            orderBy('date', 'desc')
        );
        const expensesSnapshot = await getDocs(expensesQuery);
        
        let total = 0;
        const expenses = [];
        const categoryMap = {};
        
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            const expenseDate = new Date(expense.date);
            
            if (expenseDate >= new Date(startDate) && expenseDate <= new Date(endDate)) {
                // Calculate user's share
                const splitAmounts = expense.splitAmounts || {};
                const userShare = splitAmounts[userId] || 0;
                
                total += userShare;
                expenses.push({
                    id: doc.id,
                    ...expense,
                    userShare
                });
                
                // Categorize (simple categorization based on description)
                const category = categorizeExpense(expense.description || '');
                categoryMap[category] = (categoryMap[category] || 0) + userShare;
            }
        });
        
        return {
            total,
            expenses,
            categories: categoryMap
        };
    } catch (error) {
        console.error('Error getting monthly spending:', error);
        return { total: 0, expenses: [], categories: {} };
    }
}

// Simple expense categorization
function categorizeExpense(description) {
    const desc = description.toLowerCase();
    if (desc.includes('food') || desc.includes('restaurant') || desc.includes('canteen') || desc.includes('dinner') || desc.includes('lunch')) {
        return 'Food';
    } else if (desc.includes('trip') || desc.includes('travel') || desc.includes('taxi') || desc.includes('uber')) {
        return 'Travel';
    } else if (desc.includes('room') || desc.includes('hostel') || desc.includes('rent')) {
        return 'Accommodation';
    } else if (desc.includes('project') || desc.includes('book') || desc.includes('stationery')) {
        return 'Education';
    } else {
        return 'Other';
    }
}

// Get group-wise spending
export async function getGroupSpending(userId) {
    try {
        const groupsQuery = query(
            collection(db, 'groups'),
            where('members', 'array-contains', userId)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        
        const groupSpending = [];
        
        for (const groupDoc of groupsSnapshot.docs) {
            const group = groupDoc.data();
            const expensesQuery = query(
                collection(db, 'expenses'),
                where('groupId', '==', groupDoc.id)
            );
            const expensesSnapshot = await getDocs(expensesQuery);
            
            let total = 0;
            expensesSnapshot.forEach(expenseDoc => {
                const expense = expenseDoc.data();
                const splitAmounts = expense.splitAmounts || {};
                total += splitAmounts[userId] || 0;
            });
            
            groupSpending.push({
                groupId: groupDoc.id,
                groupName: group.name,
                total: total
            });
        }
        
        return groupSpending;
    } catch (error) {
        console.error('Error getting group spending:', error);
        return [];
    }
}


