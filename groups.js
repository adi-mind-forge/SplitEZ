import { requireAuth, getUserData } from './auth.js';
import { db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    doc, 
    getDoc, 
    deleteDoc,
    updateDoc,
    arrayUnion,
    arrayRemove 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let currentUser = null;

// Initialize groups page
async function initGroups() {
    currentUser = await requireAuth();
    if (!currentUser) return;

    await loadGroups();
    setupModals();
}

// Load all groups
async function loadGroups() {
    try {
        const groupsQuery = query(
            collection(db, 'groups'),
            where('members', 'array-contains', currentUser.uid)
        );
        const groupsSnapshot = await getDocs(groupsQuery);
        const groupsList = document.getElementById('groupsList');
        
        if (groupsSnapshot.empty) {
            groupsList.innerHTML = '<p class="empty-state">No groups yet. Create your first group!</p>';
            return;
        }

        groupsList.innerHTML = '';
        groupsSnapshot.forEach(async (groupDoc) => {
            const group = groupDoc.data();
            const groupCard = await createGroupCard(group, groupDoc.id);
            groupsList.appendChild(groupCard);
        });
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Create group card
async function createGroupCard(group, groupId) {
    const card = document.createElement('div');
    card.className = 'group-card';
    
    // Get member names
    const memberNames = await getMemberNames(group.members || []);
    const pending = (group.pendingMemberEmails || []).filter(e => !!e);
    const displayMembers = [...memberNames, ...pending];
    
    card.innerHTML = `
        <div class="group-card-header">
            <span class="group-card-name">${group.name || 'Unnamed Group'}</span>
        </div>
        <div class="group-card-members">${displayMembers.join(', ')}</div>
        <div class="group-card-balance">Click to view details</div>
    `;
    
    card.onclick = () => showGroupDetails(groupId);
    return card;
}

// Get member names from user IDs
async function getMemberNames(memberIds) {
    const names = [];
    for (const memberId of memberIds) {
        try {
            const userDoc = await getDoc(doc(db, 'users', memberId));
            if (userDoc.exists()) {
                names.push(userDoc.data().name || 'Unknown');
            }
        } catch (error) {
            console.error('Error getting member name:', error);
        }
    }
    return names;
}

// Setup modals
function setupModals() {
    const createGroupBtn = document.getElementById('createGroupBtn');
    const createGroupModal = document.getElementById('createGroupModal');
    const createGroupForm = document.getElementById('createGroupForm');
    const closeButtons = document.querySelectorAll('.close');

    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => {
            createGroupModal.classList.add('show');
        });
    }

    if (createGroupForm) {
        createGroupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createGroup();
        });
    }

    closeButtons.forEach(btn => {
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

// Create new group
async function createGroup() {
    try {
        const name = document.getElementById('groupName').value;
        const description = document.getElementById('groupDescription').value;
        const membersInput = document.getElementById('groupMembers').value;
        
        // Get member emails and find their UIDs
        const rawMemberEmails = membersInput
            .split(',')
            .map(email => email.trim())
            .filter(email => email);
        const memberEmails = rawMemberEmails.map(e => e.toLowerCase());
        const memberIds = [currentUser.uid]; // Include current user
        const pendingMemberEmails = [];
        
        // Find user IDs by email (try lowercase first, then original casing as fallback)
        for (let i = 0; i < rawMemberEmails.length; i++) {
            const rawEmail = rawMemberEmails[i];
            const lcEmail = memberEmails[i];
            try {
                let foundUid = null;
                
                // Lowercased lookup
                const usersQueryLc = query(
                    collection(db, 'users'),
                    where('email', '==', lcEmail)
                );
                const usersSnapshotLc = await getDocs(usersQueryLc);
                usersSnapshotLc.forEach(userDoc => {
                    if (!memberIds.includes(userDoc.id)) {
                        foundUid = userDoc.id;
                        memberIds.push(userDoc.id);
                    }
                });

                // Fallback: original-case lookup (for legacy accounts stored with mixed case)
                if (!foundUid && rawEmail !== lcEmail) {
                    const usersQueryRaw = query(
                        collection(db, 'users'),
                        where('email', '==', rawEmail)
                    );
                    const usersSnapshotRaw = await getDocs(usersQueryRaw);
                    usersSnapshotRaw.forEach(userDoc => {
                        if (!memberIds.includes(userDoc.id)) {
                            foundUid = userDoc.id;
                            memberIds.push(userDoc.id);
                        }
                    });
                }

                if (!foundUid) {
                    pendingMemberEmails.push(rawEmail);
                }
            } catch (error) {
                console.error('Error finding user by email:', error);
                if (!pendingMemberEmails.includes(rawEmail)) {
                    pendingMemberEmails.push(rawEmail);
                }
            }
        }

        const groupData = {
            name: name,
            description: description || '',
            members: memberIds,
            memberEmails: memberEmails,
            pendingMemberEmails: pendingMemberEmails,
            createdBy: currentUser.uid,
            createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'groups'), groupData);
        
        // Reset form and close modal
        document.getElementById('createGroupForm').reset();
        document.getElementById('createGroupModal').classList.remove('show');
        
        // Reload groups
        await loadGroups();
        
        alert('Group created successfully!');
    } catch (error) {
        console.error('Error creating group:', error);
        alert('Error creating group: ' + error.message);
    }
}

// Show group details
async function showGroupDetails(groupId) {
    const modal = document.getElementById('groupDetailsModal');
    const title = document.getElementById('groupDetailsTitle');
    const content = document.getElementById('groupDetailsContent');
    
    // Always fetch latest group snapshot for accurate data
    const freshSnap = await getDoc(doc(db, 'groups', groupId));
    if (!freshSnap.exists()) {
        alert('Group not found.');
        return;
    }
    const latestGroupData = freshSnap.data();

    title.textContent = latestGroupData.name || 'Group Details';
    
    // Get member names
    const memberNames = await getMemberNames(latestGroupData.members || []);
    const pending = (latestGroupData.pendingMemberEmails || []).filter(e => !!e);
    const displayMembers = [...memberNames, ...pending];
    
    // Get group expenses
    const expensesQuery = query(
        collection(db, 'expenses'),
        where('groupId', '==', groupId)
    );
    const expensesSnapshot = await getDocs(expensesQuery);
    
    let expensesHtml = '<h4>Expenses</h4>';
    if (expensesSnapshot.empty) {
        expensesHtml += '<p>No expenses in this group yet.</p>';
    } else {
        expensesHtml += '<ul>';
        expensesSnapshot.forEach(doc => {
            const expense = doc.data();
            expensesHtml += `<li>${expense.description}: ₹${expense.amount?.toFixed(2)}</li>`;
        });
        expensesHtml += '</ul>';
    }
    
    // Action buttons
    const isCreator = latestGroupData.createdBy === currentUser.uid;
    const isLegacyNoCreator = !latestGroupData.createdBy;
    const isMember = Array.isArray(latestGroupData.members) && latestGroupData.members.includes(currentUser.uid);
    const canDelete = isCreator || (isLegacyNoCreator && isMember);
    const deleteButton = canDelete ? `
        <button class="btn btn-danger" style="margin-left: 8px;" onclick="window.deleteGroup('${groupId}')">
            Delete Group
        </button>
    ` : '';
    
    content.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h4>Members</h4>
            <p>${displayMembers.join(', ')}</p>
        </div>
        <div style="margin-bottom: 20px;">
            <h4>Add Members</h4>
            <div class="form-group">
                <label for="addMemberEmails">Emails (comma-separated)</label>
                <input type="text" id="addMemberEmails" placeholder="email1@example.com, email2@example.com">
            </div>
            <button class="btn btn-secondary" onclick="window.addMembersToGroup('${groupId}')">Add</button>
        </div>
        ${expensesHtml}
        <div style="display:flex; gap: 8px;">
            <button class="btn btn-primary" onclick="window.location.href='expenses.html?group=${groupId}'">
                Add Expense
            </button>
            ${deleteButton}
        </div>
    `;
    
    modal.classList.add('show');
}

// Delete group (global for onclick)
window.deleteGroup = async function(groupId) {
    try {
        // Confirm intent
        if (!confirm('Are you sure you want to delete this group and all its expenses? This cannot be undone.')) {
            return;
        }

        // Fetch group doc to verify ownership
        const groupRef = doc(db, 'groups', groupId);
        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) {
            alert('Group not found.');
            return;
        }
        const groupData = groupSnap.data();
        if (groupData.createdBy !== currentUser.uid) {
            alert('Only the group creator can delete this group.');
            return;
        }

        // Delete related expenses
        const expensesQueryRef = query(
            collection(db, 'expenses'),
            where('groupId', '==', groupId)
        );
        const expSnap = await getDocs(expensesQueryRef);
        const deletions = [];
        expSnap.forEach(expDoc => {
            deletions.push(deleteDoc(doc(db, 'expenses', expDoc.id)));
        });
        await Promise.all(deletions);

        // Delete the group
        await deleteDoc(groupRef);

        // Close modal and reload groups
        const modal = document.getElementById('groupDetailsModal');
        if (modal) modal.classList.remove('show');
        await loadGroups();
        alert('Group deleted successfully.');
    } catch (error) {
        console.error('Error deleting group:', error);
        alert('Error deleting group: ' + error.message);
    }
};

// Add members to existing group (global for onclick)
window.addMembersToGroup = async function(groupId) {
    try {
        const input = document.getElementById('addMemberEmails');
        if (!input) return;
        const raw = input.value || '';
        const emailsRaw = raw.split(',').map(e => e.trim()).filter(Boolean);
        if (emailsRaw.length === 0) return;

        // Fetch group
        const groupRef = doc(db, 'groups', groupId);
        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) {
            alert('Group not found.');
            return;
        }
        const group = groupSnap.data();
        const members = new Set(group.members || []);
        const memberEmails = new Set((group.memberEmails || []).map(e => (e || '').toLowerCase()));
        const pendingMemberEmails = new Set(group.pendingMemberEmails || []);

        // Resolve to UIDs where possible
        for (const email of emailsRaw) {
            const lc = (email || '').toLowerCase();
            memberEmails.add(lc);
            try {
                const usersSnap = await getDocs(query(collection(db, 'users'), where('email', '==', lc)));
                let matched = false;
                usersSnap.forEach(u => {
                    members.add(u.id);
                    matched = true;
                });
                if (!matched) {
                    pendingMemberEmails.add(email);
                }
            } catch (e) {
                console.error('Error resolving email:', e);
                pendingMemberEmails.add(email);
            }
        }

        // Persist
        await updateDoc(groupRef, {
            members: Array.from(members),
            memberEmails: Array.from(memberEmails),
            pendingMemberEmails: Array.from(pendingMemberEmails)
        });

        // Refresh modal
        await showGroupDetails(groupId);
        alert('Members updated.');
    } catch (error) {
        console.error('Error adding members:', error);
        alert('Error adding members: ' + error.message);
    }
};

// Initialize on page load
if (document.getElementById('groupsList')) {
    initGroups();
}


