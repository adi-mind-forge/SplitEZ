import { db } from './firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs,
    doc,
    getDoc,
    addDoc 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Send reminder for pending settlements
export async function sendReminder(settlementId, userId) {
    try {
        const settlementDoc = await getDoc(doc(db, 'settlements', settlementId));
        if (!settlementDoc.exists()) {
            throw new Error('Settlement not found');
        }
        
        const settlement = settlementDoc.data();
        const userDoc = await getDoc(doc(db, 'users', userId));
        const user = userDoc.exists() ? userDoc.data() : null;
        
        if (!user) {
            throw new Error('User not found');
        }
        
        // Create reminder record
        await addDoc(collection(db, 'reminders'), {
            settlementId: settlementId,
            userId: userId,
            amount: settlement.amount,
            description: settlement.description,
            sentAt: new Date().toISOString(),
            method: 'whatsapp' // or 'email'
        });
        
        // Generate WhatsApp message
        const whatsappMessage = generateWhatsAppMessage(settlement, user);
        const whatsappLink = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;
        
        // Open WhatsApp (or email client)
        window.open(whatsappLink, '_blank');
        
        return { success: true, message: 'Reminder sent successfully!' };
    } catch (error) {
        console.error('Error sending reminder:', error);
        return { success: false, error: error.message };
    }
}

// Generate WhatsApp reminder message
function generateWhatsAppMessage(settlement, user) {
    const amount = Math.abs(settlement.amount || 0);
    const isOwed = settlement.amount > 0;
    const message = isOwed
        ? `Hi! This is a reminder from SplitEZ. You owe ₹${amount.toFixed(2)} for "${settlement.description || 'expense'}". Please settle this payment.`
        : `Hi! This is a reminder from SplitEZ. You are owed ₹${amount.toFixed(2)} for "${settlement.description || 'expense'}". Please remind the payer to settle this payment.`;
    
    return message;
}

// Send email reminder (requires backend service)
export async function sendEmailReminder(settlementId, userId) {
    try {
        // In production, this would call a backend API to send emails
        // For now, we'll use mailto link
        const settlementDoc = await getDoc(doc(db, 'settlements', settlementId));
        if (!settlementDoc.exists()) return;
        
        const settlement = settlementDoc.data();
        const userDoc = await getDoc(doc(db, 'users', userId));
        const user = userDoc.exists() ? userDoc.data() : null;
        
        if (!user) return;
        
        const amount = Math.abs(settlement.amount || 0);
        const subject = encodeURIComponent(`Reminder: Payment Due - SplitEZ`);
        const body = encodeURIComponent(
            `Hi ${user.name},\n\n` +
            `This is a reminder that you have a pending payment of ₹${amount.toFixed(2)} ` +
            `for "${settlement.description || 'expense'}" in SplitEZ.\n\n` +
            `Please settle this payment at your earliest convenience.\n\n` +
            `Thank you!`
        );
        
        const mailtoLink = `mailto:${user.email}?subject=${subject}&body=${body}`;
        window.location.href = mailtoLink;
        
        return { success: true };
    } catch (error) {
        console.error('Error sending email reminder:', error);
        return { success: false, error: error.message };
    }
}

// Get pending reminders for a user
export async function getPendingReminders(userId) {
    try {
        const remindersQuery = query(
            collection(db, 'reminders'),
            where('userId', '==', userId)
        );
        const remindersSnapshot = await getDocs(remindersQuery);
        
        const reminders = [];
        remindersSnapshot.forEach(doc => {
            reminders.push({ id: doc.id, ...doc.data() });
        });
        
        return reminders;
    } catch (error) {
        console.error('Error getting reminders:', error);
        return [];
    }
}

// Auto-remind for overdue payments (can be called periodically)
export async function checkAndRemindOverduePayments() {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        const settlementsQuery = query(
            collection(db, 'settlements'),
            where('status', '==', 'pending')
        );
        const settlementsSnapshot = await getDocs(settlementsQuery);
        
        const overdueSettlements = [];
        settlementsSnapshot.forEach(doc => {
            const settlement = doc.data();
            const createdAt = new Date(settlement.createdAt);
            if (createdAt < thirtyDaysAgo) {
                overdueSettlements.push({ id: doc.id, ...settlement });
            }
        });
        
        return overdueSettlements;
    } catch (error) {
        console.error('Error checking overdue payments:', error);
        return [];
    }
}


