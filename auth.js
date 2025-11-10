/**
 * ============================================
 * AUTHENTICATION FILE (auth.js)
 * ============================================
 * This file handles all user login/signup/logout features.
 * Think of it as the security guard of our app - it checks who is logged in.
 */

// Import Firebase authentication tools from firebase-config.js
import { auth } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword,   // For creating new accounts
    signInWithEmailAndPassword,       // For logging in
    signOut,                          // For logging out
    onAuthStateChanged                // For checking if someone is logged in
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Import database tools for storing user information
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './firebase-config.js';

/**
 * ============================================
 * FUNCTION: checkAuth()
 * ============================================
 * What it does: Checks if a user is currently logged in
 * Returns: User information if logged in, null if not logged in
 * Why we need it: So we know who the user is and what they can see
 */
export function checkAuth() {
    return new Promise((resolve) => {
        // Listen for changes in login status
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is logged in - give us their info
                resolve(user);
            } else {
                // User is not logged in
                resolve(null);
            }
        });
    });
}

/**
 * ============================================
 * FUNCTION: requireAuth()
 * ============================================
 * What it does: Makes sure user is logged in before viewing a page
 * If not logged in: Sends them to the login page (index.html)
 * If logged in: Let them view the page
 * Why we need it: To protect private pages like dashboard and expenses
 */
export async function requireAuth() {
    const user = await checkAuth();
    // If user is NOT logged in AND they're not on the login page
    if (!user && !window.location.pathname.includes('index.html')) {
        // Send them to login page
        window.location.href = 'index.html';
        return null;
    }
    return user;
}

/**
 * ============================================
 * FUNCTION: signUp(email, password, name)
 * ============================================
 * What it does: Creates a new user account
 * Parameters:
 *   - email: User's email address
 *   - password: Their password
 *   - name: Their display name
 * Returns: Success message and user info, or error message
 */
export async function signUp(email, password, name) {
    try {
        // Clean up the email (remove spaces, make lowercase)
        const normalizedEmail = (email || '').trim().toLowerCase();
        
        // Create the account in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const user = userCredential.user;
        
        // Also create a user profile in the database with extra information
        await setDoc(doc(db, 'users', user.uid), {
            name: name,                              // User's display name
            email: normalizedEmail,                  // User's email
            xpPoints: 0,                             // Points for achievements (starts at 0)
            level: 1,                                // User level (starts at 1)
            badges: [],                              // Badges/achievements (starts empty)
            createdAt: new Date().toISOString()      // Date and time account was created
        });
        
        // Return success
        return { success: true, user };
    } catch (error) {
        // If something went wrong, return the error message
        return { success: false, error: error.message };
    }
}

/**
 * ============================================
 * FUNCTION: signIn(email, password)
 * ============================================
 * What it does: Logs a user in with their email and password
 * Parameters:
 *   - email: User's email address
 *   - password: Their password
 * Returns: Success message and user info, or error message
 */
export async function signIn(email, password) {
    try {
        // Authenticate the user with Firebase
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        // If login failed, return the error
        return { success: false, error: error.message };
    }
}

/**
 * ============================================
 * FUNCTION: signOutUser()
 * ============================================
 * What it does: Logs the user out
 * After logout: Sends them back to the login page
 */
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


