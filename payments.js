// Razorpay Payment Integration
// Note: This is a simplified implementation. For production, use Razorpay's official SDK

export async function initiatePayment(amount, description, userId, settlementId) {
    try {
        // In a real implementation, you would:
        // 1. Create a payment order on your backend
        // 2. Initialize Razorpay checkout
        // 3. Handle payment success/failure callbacks
        
        // For demo purposes, we'll simulate payment
        const paymentData = {
            amount: amount * 100, // Convert to paise
            currency: 'INR',
            description: description,
            userId: userId,
            settlementId: settlementId
        };
        
        // Simulate Razorpay checkout
        // Replace this with actual Razorpay integration
        const options = {
            key: 'YOUR_RAZORPAY_KEY_ID', // Replace with your Razorpay key
            amount: paymentData.amount,
            currency: paymentData.currency,
            name: 'SplitEZ',
            description: paymentData.description,
            handler: async function(response) {
                await handlePaymentSuccess(response, settlementId);
            },
            prefill: {
                email: '', // Get from user data
                contact: '' // Get from user data
            },
            theme: {
                color: '#6366f1'
            }
        };
        
        // For demo: show confirmation dialog
        const confirmed = confirm(`Pay ₹${amount.toFixed(2)} for ${description}?`);
        if (confirmed) {
            // Simulate successful payment
            await handlePaymentSuccess({
                razorpay_payment_id: 'demo_payment_' + Date.now(),
                razorpay_order_id: 'demo_order_' + Date.now(),
                razorpay_signature: 'demo_signature'
            }, settlementId);
        }
        
        // In production, uncomment this:
        // const razorpay = new Razorpay(options);
        // razorpay.open();
        
    } catch (error) {
        console.error('Payment error:', error);
        alert('Payment failed: ' + error.message);
    }
}

async function handlePaymentSuccess(response, settlementId) {
    try {
        // Update settlement status in Firestore
        const { db } = await import('./firebase-config.js');
        const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        await updateDoc(doc(db, 'settlements', settlementId), {
            status: 'paid',
            paidAt: new Date().toISOString(),
            paymentId: response.razorpay_payment_id
        });
        
        // Award XP for settling payment
        const { awardXP } = await import('./analytics.js');
        const { requireAuth } = await import('./auth.js');
        const user = await requireAuth();
        if (user) {
            await awardXP(user.uid, 20); // 20 XP for settling payment
        }
        
        alert('Payment successful!');
        window.location.reload();
    } catch (error) {
        console.error('Error updating payment status:', error);
        alert('Payment successful but failed to update status. Please contact support.');
    }
}

export function createPaymentLink(amount, description, settlementId) {
    // Create a payment link (for sharing via WhatsApp/Email)
    const baseUrl = window.location.origin;
    return `${baseUrl}/pay?settlement=${settlementId}&amount=${amount}&desc=${encodeURIComponent(description)}`;
}


