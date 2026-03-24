const socket = io();
let currentChat = { type: null, id: null, name: null };
let typingTimeout = null;

// Initialize connection
socket.emit('setup', CURRENT_USER.id);

// DOM Elements
const usersList = document.getElementById('usersList');
const groupsList = document.getElementById('groupsList');
const chatPlaceholder = document.getElementById('chatPlaceholder');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const activeName = document.getElementById('activeName');
const activeAvatar = document.getElementById('activeAvatar');
const activeStatus = document.getElementById('activeStatus');
const logoutBtn = document.getElementById('logoutBtn');

const groupModal = document.getElementById('groupModal');
const createGroupBtn = document.getElementById('createGroupBtn');
const closeModal = document.getElementById('closeModal');
const groupMembersList = document.getElementById('groupMembersList');
const confirmCreateGroup = document.getElementById('confirmCreateGroup');
const groupNameInput = document.getElementById('groupName');

// Advanced Group Elements
const groupActions = document.getElementById('groupActions');
const manageGroupBtn = document.getElementById('manageGroupBtn');
const deleteGroupBtn = document.getElementById('deleteGroupBtn');
const manageGroupModal = document.getElementById('manageGroupModal');
const closeManageModal = document.getElementById('closeManageModal');
const addMemberSelect = document.getElementById('addMemberSelect');
const addMemberBtn = document.getElementById('addMemberBtn');
const currentMembersList = document.getElementById('currentMembersList');

const unicastControls = document.getElementById('unicastControls');
const messageModeSelect = document.getElementById('messageModeSelect');
const unicastUserSelect = document.getElementById('unicastUserSelect');
const searchInput = document.getElementById('searchInput');

let allUsers = [];
let chatContacts = [];
let groupsMap = {};
let searchTimeout = null;

// Fetch Users and Groups on load
async function fetchContacts() {
    try {
        const [usersRes, contactsRes, groupsRes] = await Promise.all([
            fetch('/user').then(r => r.json()),
            fetch('/user/contacts').then(r => r.json()),
            fetch('/chat/groups/all').then(r => r.json())
        ]);

        if (usersRes.success) {
            allUsers = usersRes.data;
        }

        if (contactsRes.success) {
            chatContacts = contactsRes.data;
            usersList.innerHTML = chatContacts.map(u => `
                <li onclick="openChat('private', '${u._id}', '${u.username}', '${u.status}')" id="contact-${u._id}">
                    <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
                    <div class="details">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${u.username}</strong>
                            <span class="status-indicator ${u.status === 'online' ? 'online' : ''}" id="status-${u._id}"></span>
                        </div>
                    </div>
                </li>
            `).join('');
        }

        if (groupsRes.success) {
            groupsMap = {};
            
            // Sort to ensure General group is on top
            groupsRes.data.sort((a, b) => b.isGeneral - a.isGeneral);

            groupsList.innerHTML = groupsRes.data.map(g => {
                groupsMap[g._id] = g;
                return `
                <li onclick="openChat('group', '${g._id}', '${g.groupName}', 'Multiple Members')" id="contact-${g._id}">
                    <div class="avatar">${g.isGeneral ? '🌐' : g.groupName.charAt(0).toUpperCase()}</div>
                    <div class="details">
                        <strong>${g.groupName}</strong>
                    </div>
                </li>
            `}).join('');

            // Join socket rooms for groups
            groupsRes.data.forEach(g => socket.emit('join_group', g._id));

            // Auto open general group by default
            if (!currentChat.id) {
                const generalGroup = groupsRes.data.find(g => g.isGeneral);
                if (generalGroup) {
                    openChat('group', generalGroup._id, generalGroup.groupName, 'Global Chat');
                }
            }
        }
    } catch (err) {
        console.error('Error fetching contacts:', err);
    }
}

// Open Chat Function
async function openChat(type, id, name, status) {
    currentChat = { type, id, name };
    
    // UI Update
    chatPlaceholder.classList.add('d-none');
    chatContainer.classList.remove('d-none');
    activeName.innerText = name;
    activeAvatar.innerText = name.charAt(0).toUpperCase();
    activeStatus.innerText = status;

    groupActions.classList.add('d-none');
    if (type === 'group' && groupsMap[id] && groupsMap[id].adminId === CURRENT_USER.id) {
        groupActions.classList.remove('d-none');
    }

    // Toggle Unicast UI for General Group
    unicastControls.classList.add('d-none');
    if (type === 'group' && groupsMap[id] && groupsMap[id].isGeneral) {
        unicastControls.classList.remove('d-none');
        unicastUserSelect.classList.add('d-none');
        messageModeSelect.value = 'broadcast';
        
        // Populate unicast users
        const nonSelfMembers = allUsers.filter(u => u._id !== CURRENT_USER.id);
        unicastUserSelect.innerHTML = '<option value="">Select user...</option>' + 
            nonSelfMembers.map(u => `<option value="${u._id}">${u.username}</option>`).join('');
    }

    // Remove active class from lists
    document.querySelectorAll('.contact-list li').forEach(li => li.classList.remove('active'));
    document.getElementById(`contact-${id}`).classList.add('active');

    // Fetch Messages
    chatMessages.innerHTML = '<div style="text-align:center; padding: 20px;">Loading messages...</div>';
    
    try {
        const endpoint = type === 'private' ? `/chat/${id}` : `/chat/group/${id}`;
        const res = await fetch(endpoint);
        const data = await res.json();
        
        if (data.success) {
            chatMessages.innerHTML = '';
            data.data.forEach(msg => {
                appendMessage(msg, type);
            });
            scrollToBottom();
        }
    } catch (err) {
        chatMessages.innerHTML = '<div style="text-align:center; padding: 20px; color: red;">Failed to load messages</div>';
    }
}

function appendMessage(msg, chatType) {
    const isSent = msg.senderId._id === CURRENT_USER.id || msg.senderId === CURRENT_USER.id;
    const time = new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    let senderNameHTML = '';
    let modeLabel = '';

    if (msg.messageMode === 'unicast') {
        modeLabel = ' <span style="font-size:10px; background: #ffeeba; color: #856404; padding: 2px 5px; border-radius: 4px; margin-left: 5px;">Private</span>';
    }

    if (chatType === 'group' && !isSent && msg.senderId && msg.senderId.username) {
        senderNameHTML = `<div style="font-size:11px; font-weight:bold; margin-bottom: 2px;">${msg.senderId.username}${modeLabel}</div>`;
    } else if (isSent && modeLabel) {
        senderNameHTML = `<div style="font-size:11px; font-weight:bold; margin-bottom: 2px; color: var(--text-dark); opacity: 0.7;">To: ${allUsers.find(u => u._id === msg.targetUserId)?.username || 'User'}${modeLabel}</div>`;
    }

    const textSpan = document.createElement('span');
    textSpan.textContent = msg.message;

    const div = document.createElement('div');
    div.classList.add('msg', isSent ? 'sent' : 'received');
    div.innerHTML = `
        ${senderNameHTML}
        ${textSpan.outerHTML}
        <span class="msg-time">${time}</span>
    `;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Sending Messages
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Emitting Messages
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChat.id) return;

    let mode = 'broadcast';
    let targetUser = null;

    if (currentChat.type === 'group' && groupsMap[currentChat.id] && groupsMap[currentChat.id].isGeneral) {
        mode = messageModeSelect.value;
        if (mode === 'unicast') {
            targetUser = unicastUserSelect.value;
            if (!targetUser) {
                alert('Please select a user to unicast your message.');
                return;
            }
        }
    }

    const msgData = {
        senderId: CURRENT_USER.id,
        receiverId: currentChat.type === 'private' ? currentChat.id : null,
        groupId: currentChat.type === 'group' ? currentChat.id : null,
        message: text,
        messageType: 'text',
        messageMode: mode,
        targetUserId: targetUser
    };

    socket.emit('send_message', msgData);
    messageInput.value = '';
    
    // Stop typing
    socket.emit('stop_typing', { room: currentChat.id, typerId: CURRENT_USER.id });
}

// Unicast mode toggle
messageModeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'unicast') {
        unicastUserSelect.classList.remove('d-none');
    } else {
        unicastUserSelect.classList.add('d-none');
    }
});

// Typing Indication
messageInput.addEventListener('input', () => {
    if (!currentChat.id) return;
    socket.emit('typing', { room: currentChat.id, typerId: CURRENT_USER.id });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop_typing', { room: currentChat.id, typerId: CURRENT_USER.id });
    }, 2000);
});

// Socket Listeners
socket.on('receive_message', (msg) => {
    // Check if we need to refresh contacts to add a new DM
    let needsRefresh = false;
    const senderId = msg.senderId._id || msg.senderId;
    if (msg.groupId === null) {
        if (senderId !== CURRENT_USER.id && !chatContacts.find(c => c._id === senderId)) needsRefresh = true;
        if (msg.receiverId && msg.receiverId !== CURRENT_USER.id && !chatContacts.find(c => c._id === msg.receiverId)) needsRefresh = true;
    } else if (msg.messageMode === 'unicast') {
        if (senderId !== CURRENT_USER.id && !chatContacts.find(c => c._id === senderId)) needsRefresh = true;
        if (msg.targetUserId && msg.targetUserId !== CURRENT_USER.id && !chatContacts.find(c => c._id === msg.targetUserId)) needsRefresh = true;
    }
    if (needsRefresh) {
        fetchContacts();
    }

    // Only append if it belongs to the current open chat
    if (currentChat.type === 'private') {
        if (msg.senderId._id === currentChat.id || msg.receiverId === currentChat.id || msg.senderId === currentChat.id || msg.senderId._id === CURRENT_USER.id) {
            appendMessage(msg, 'private');
        }
    } else if (currentChat.type === 'group') {
        if (msg.groupId === currentChat.id) {
            if (msg.messageMode === 'unicast') {
                // Defensive check: only append if current user is sender or target
                if (senderId === CURRENT_USER.id || msg.targetUserId === CURRENT_USER.id) {
                    appendMessage(msg, 'group');
                }
            } else {
                appendMessage(msg, 'group');
            }
        }
    }
});

socket.on('user_status_change', ({ userId, status }) => {
    const statusDot = document.getElementById(`status-${userId}`);
    if (statusDot) {
        if (status === 'online') {
            statusDot.classList.add('online');
        } else {
            statusDot.classList.remove('online');
        }
    }
    if (currentChat.type === 'private' && currentChat.id === userId) {
        activeStatus.innerText = status === 'online' ? 'Online' : 'Offline';
    }
});

const typingIndicatorEl = document.createElement('div');
typingIndicatorEl.classList.add('status-text');
typingIndicatorEl.style.fontStyle = 'italic';
typingIndicatorEl.style.color = 'var(--primary)';
typingIndicatorEl.innerText = 'typing...';

socket.on('typing', ({ room, typerId }) => {
    if (currentChat.id === room && typerId !== CURRENT_USER.id) {
        activeStatus.innerText = 'Typing...';
    }
});

socket.on('stop_typing', ({ room, typerId }) => {
    if (currentChat.id === room && typerId !== CURRENT_USER.id) {
        activeStatus.innerText = currentChat.type === 'private' ? 'Online' : 'Multiple Members'; // Simplified
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await fetch('/auth/logout');
    window.location.href = '/login';
});

// Group Modal Logic
createGroupBtn.addEventListener('click', async () => {
    groupModal.classList.remove('d-none');
    const res = await fetch('/user');
    const data = await res.json();
    if(data.success) {
        groupMembersList.innerHTML = data.data.map(u => `
            <div class="selectable-item">
                <input type="checkbox" value="${u._id}" id="user-${u._id}">
                <label for="user-${u._id}">${u.username}</label>
            </div>
        `).join('');
    }
});

closeModal.addEventListener('click', () => {
    groupModal.classList.add('d-none');
});

confirmCreateGroup.addEventListener('click', async () => {
    const name = groupNameInput.value.trim();
    if(!name) return;

    const selectedMembers = Array.from(document.querySelectorAll('#groupMembersList input:checked')).map(cb => cb.value);
    
    const res = await fetch('/chat/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName: name, members: JSON.stringify(selectedMembers) })
    });

    if(res.ok) {
        groupModal.classList.add('d-none');
        groupNameInput.value = '';
        fetchContacts(); // Reload lists
    }
});

// Advanced Group Admin Logic
deleteGroupBtn.addEventListener('click', async () => {
    if (!currentChat.id || currentChat.type !== 'group') return;
    if (confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
        try {
            const res = await fetch(`/chat/group/${currentChat.id}`, { method: 'DELETE' });
            if (res.ok) {
                socket.emit('group_deleted', currentChat.id);
                fetchContacts();
                closeActiveChat();
            } else {
                alert('Failed to delete group');
            }
        } catch (err) {
            console.error(err);
        }
    }
});

manageGroupBtn.addEventListener('click', () => {
    if (!currentChat.id || currentChat.type !== 'group') return;
    const group = groupsMap[currentChat.id];
    if (!group) return;

    // Populate Add Members Dropdown
    const nonMembers = allUsers.filter(u => !group.members.includes(u._id) && u._id !== CURRENT_USER.id);
    addMemberSelect.innerHTML = '<option value="">Select a user...</option>' + 
        nonMembers.map(u => `<option value="${u._id}">${u.username}</option>`).join('');

    // Populate Current Members
    const currentMembers = allUsers.filter(u => group.members.includes(u._id));
    currentMembersList.innerHTML = currentMembers.map(u => `
        <div class="selectable-item" style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #eee;">
            <span>${u.username}</span>
            <button class="btn-danger" style="padding:4px 8px; font-size:11px; border:none; border-radius:4px; cursor:pointer;" onclick="removeMember('${u._id}')">Remove</button>
        </div>
    `).join('');

    manageGroupModal.classList.remove('d-none');
});

closeManageModal.addEventListener('click', () => {
    manageGroupModal.classList.add('d-none');
});

addMemberBtn.addEventListener('click', async () => {
    const userId = addMemberSelect.value;
    if (!userId || !currentChat.id || currentChat.type !== 'group') return;

    try {
        const res = await fetch('/chat/group/add-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: currentChat.id, userId })
        });
        
        if (res.ok) {
            socket.emit('user_added', { groupId: currentChat.id, memberId: userId });
            await fetchContacts();
            manageGroupModal.classList.add('d-none'); // close to refresh state
            manageGroupBtn.click(); // Re-open
        }
    } catch (err) {
        console.error(err);
    }
});

async function removeMember(userId) {
    if (!currentChat.id || currentChat.type !== 'group') return;
    if (confirm('Remove this user from the group?')) {
        try {
            const res = await fetch('/chat/group/remove-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupId: currentChat.id, userId })
            });

            if (res.ok) {
                socket.emit('user_removed', { groupId: currentChat.id, memberId: userId });
                await fetchContacts();
                manageGroupModal.classList.add('d-none');
                manageGroupBtn.click();
            } else {
                alert('Cannot remove admin or failed to remove member');
            }
        } catch (err) {
            console.error(err);
        }
    }
}

function closeActiveChat() {
    chatContainer.classList.add('d-none');
    chatPlaceholder.classList.remove('d-none');
    currentChat = { type: null, id: null, name: null };
}

// Socket listening for advanced group features
socket.on('group_deleted', (groupId) => {
    if (currentChat.id === groupId) {
        alert('This group has been deleted by the admin.');
        closeActiveChat();
    }
    fetchContacts();
});

socket.on('user_added', ({ groupId, memberId }) => {
    if (memberId === CURRENT_USER.id) {
        // I was added! Let's refresh so I can see it.
        fetchContacts();
    } else {
        // Someone else was added. Refresh contacts silently so map is updated.
        fetchContacts();
    }
    if (currentChat.id === groupId && memberId !== CURRENT_USER.id) {
        const userObj = allUsers.find(u => u._id === memberId) || {username: 'A user'};
        appendSystemMessage(`${userObj.username} was added to the group`);
    }
});

socket.on('user_removed', ({ groupId, memberId }) => {
    if (memberId === CURRENT_USER.id) {
        alert('You have been removed from the group.');
        if (currentChat.id === groupId) closeActiveChat();
        fetchContacts();
    } else {
        fetchContacts();
    }
    if (currentChat.id === groupId && memberId !== CURRENT_USER.id) {
        const userObj = allUsers.find(u => u._id === memberId) || {username: 'A user'};
        appendSystemMessage(`${userObj.username} was removed from the group`);
    }
});

function appendSystemMessage(msgText) {
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.margin = '10px 0';
    div.innerHTML = `<span style="background: rgba(0,0,0,0.1); padding: 4px 10px; border-radius: 12px; font-size: 11px; color: var(--text-muted);">${msgText}</span>`;
    chatMessages.appendChild(div);
    scrollToBottom();
}

// Search functionality with debounce
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(async () => {
        if (!query) {
            fetchContacts(); // Reset to default
            return;
        }

        try {
            const res = await fetch(`/user/search?query=${query}`);
            const data = await res.json();
            
            if (data.success) {
                // Render Users Search
                if (data.data.users.length === 0) {
                    usersList.innerHTML = '<li style="color:var(--text-muted); padding:10px;">No users found.</li>';
                } else {
                    usersList.innerHTML = data.data.users.map(u => `
                        <li onclick="openChat('private', '${u._id}', '${u.username}', '${u.status}')" id="contact-${u._id}">
                            <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
                            <div class="details">
                                <div style="display:flex; justify-content:space-between;">
                                    <strong>${u.username}</strong>
                                    <span class="status-indicator ${u.status === 'online' ? 'online' : ''}" id="status-${u._id}"></span>
                                </div>
                            </div>
                        </li>
                    `).join('');
                }

                // Render Groups Search
                if (data.data.groups.length === 0) {
                    groupsList.innerHTML = '<li style="color:var(--text-muted); padding:10px;">No groups found.</li>';
                } else {
                    groupsList.innerHTML = data.data.groups.map(g => `
                        <li onclick="openChat('group', '${g._id}', '${g.groupName}', 'Multiple Members')" id="contact-${g._id}">
                            <div class="avatar">${g.groupName.charAt(0).toUpperCase()}</div>
                            <div class="details">
                                <strong>${g.groupName}</strong>
                            </div>
                        </li>
                    `).join('');
                }
            }
        } catch (err) {
            console.error('Search error:', err);
        }
    }, 300);
});

// Start
fetchContacts();
