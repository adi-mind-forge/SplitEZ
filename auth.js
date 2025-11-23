import { auth } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword,   
    signInWithEmailAndPassword,       
    signOut,                          
    onAuthStateChanged                
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';

export function checkAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve(user);
            } else {
                resolve(null);
            }
        });
    });
}

export async function requireAuth() {
    const user = await checkAuth();

    if (!user && !window.location.pathname.includes('index.html')) {

        window.location.href = 'index.html';
        return null;
    }
    return user;
}

export async function signUp(email, password, name) {
    try {
        const normalizedEmail = (email || '').trim().toLowerCase();
        
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const user = userCredential.user;
        
        await setDoc(doc(db, 'users', user.uid), {
            name: name,                              
            email: normalizedEmail,                  
            xpPoints: 0,                             
            level: 1,                                
            badges: [],                              // Badges/achievements (starts empty)
            createdAt: new Date().toISOString()      
        });
        
        return { success: true, user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function signOutUser() {
    try {
        // Log user out from Firebase
        await signOut(auth);
        // Send them back to login page
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

/**
 * ============================================
 * FUNCTION: getUserData(userId)
 * ============================================
 * What it does: Gets detailed information about a user from the database
 * Parameters:
 *   - userId: The unique ID of the user
 * Returns: User's profile information (name, email, level, etc.) or null if not found
 */
export async function getUserData(userId) {
    try {
        // Get the user's profile from database
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            // Return the user's data
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Error getting user data:', error);
        return null;
    }
}

/**
 * ============================================
 * SECTION: Login Form Handler
 * ============================================
 * What it does: When user submits the login form, this code runs
 * It takes their email and password and tries to log them in
 */
if (document.getElementById('loginFormElement')) {
    document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
        e.preventDefault(); // Stop form from reloading page
        
        // Get what user typed in the form
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('authError'); // Where to show errors
        
        // Try to sign in
        const result = await signIn(email, password);
        if (result.success) {
            // Login worked! Take them to dashboard
            window.location.href = 'dashboard.html';
        } else {
            // Login failed - show the error message
            errorDiv.textContent = result.error;
            errorDiv.classList.add('show');
        }
    });
}

/**
 * ============================================
 * SECTION: Signup Form Handler
 * ============================================
 * What it does: When user submits the signup form, this code runs
 * It takes their email, password, and name to create a new account
 */
if (document.getElementById('signupFormElement')) {
    document.getElementById('signupFormElement').addEventListener('submit', async (e) => {
        e.preventDefault(); // Stop form from reloading page
        
        // Get what user typed in the form
        const name = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const errorDiv = document.getElementById('authError'); // Where to show errors
        
        // Try to sign up
        const result = await signUp(email, password, name);
        if (result.success) {
            // Signup worked! Take them to dashboard
            window.location.href = 'dashboard.html';
        } else {
            // Signup failed - show the error message
            errorDiv.textContent = result.error;
            errorDiv.classList.add('show');
        }
    });
}

/**
 * ============================================
 * SECTION: Toggle Login/Signup Form
 * ============================================
 * What it does: When user clicks "Create new account", switch to signup form
 */
if (document.getElementById('showSignup')) {
    document.getElementById('showSignup').addEventListener('click', (e) => {
        e.preventDefault();
        // Hide login form, show signup form
        document.getElementById('loginForm').classList.remove('active');
        document.getElementById('signupForm').classList.add('active');
        // Hide any error messages
        document.getElementById('authError').classList.remove('show');
    });
}

/**
 * ============================================
 * SECTION: Toggle Signup/Login Form
 * ============================================
 * What it does: When user clicks "Already have an account?", switch to login form
 */
if (document.getElementById('showLogin')) {
    document.getElementById('showLogin').addEventListener('click', (e) => {
        e.preventDefault();
        // Hide signup form, show login form
        document.getElementById('signupForm').classList.remove('active');
        document.getElementById('loginForm').classList.add('active');
        // Hide any error messages
        document.getElementById('authError').classList.remove('show');
    });
}

/**
 * ============================================
 * SECTION: Logout Button Handler
 * ============================================
 * What it does: When user clicks the logout button in the navbar,
 * this code logs them out and sends them back to login page
 */
if (document.getElementById('logoutBtn')) {
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        signOutUser(); // Log them out
    });
}


