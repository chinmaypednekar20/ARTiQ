document.addEventListener('DOMContentLoaded', function() {
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
        });
    }
    
    // Logout functionality
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            fetch('/api/logout')
                .then(response => response.json())
                .then(data => {
                    window.location.href = '/login.html';
                })
                .catch(error => {
                    console.error('Logout error:', error);
                });
        });
    }
    
    // Load artist name
    const artistNameElement = document.getElementById('artistName');
    if (artistNameElement) {
        // Set artist name from session
        const artistName = sessionStorage.getItem('artistName');
        if (artistName) {
            artistNameElement.textContent = artistName;
        }
    }
    
    // Load messages
    loadMessages();
    
    // Message form submission
    const messageForm = document.getElementById('messageForm');
    
    if (messageForm) {
        messageForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const clientId = document.getElementById('clientId').value;
            const message = document.getElementById('messageInput').value;
            
            if (!clientId || !message) {
                return;
            }
            
            fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ client_id: clientId, message })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    // Clear input and reload messages
                    document.getElementById('messageInput').value = '';
                    loadMessages(clientId);
                }
            })
            .catch(error => {
                console.error('Error sending message:', error);
                alert('An error occurred. Please try again.');
            });
        });
    }
    
    // Function to load messages
    function loadMessages(selectedClientId = null) {
        fetch('/api/messages')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Not authenticated');
                }
                return response.json();
            })
            .then(clientMessages => {
                const clientsList = document.getElementById('clientsList');
                
                if (clientsList) {
                    if (clientMessages.length === 0) {
                        clientsList.innerHTML = `
                            <div class="empty-state" style="padding: 20px; text-align: center;">
                                <p>No messages found</p>
                            </div>
                        `;
                    } else {
                        clientsList.innerHTML = '';
                        
                        clientMessages.forEach(client => {
                            const lastMessage = client.messages[0] || {};
                            const lastMessageText = lastMessage.message || 'No messages';
                            const isActive = selectedClientId && selectedClientId == client.client_id ? 'active' : '';
                            
                            clientsList.innerHTML += `
                                <div class="client-item ${isActive}" data-id="${client.client_id}">
                                    <div class="client-name">${client.client_name}</div>
                                    <div class="message-preview">${lastMessageText}</div>
                                </div>
                            `;
                        });
                        
                        // Add event listeners to client items
                        document.querySelectorAll('.client-item').forEach(item => {
                            item.addEventListener('click', function() {
                                const clientId = this.getAttribute('data-id');
                                const clientName = this.querySelector('.client-name').textContent;
                                
                                // Remove active class from all items
                                document.querySelectorAll('.client-item').forEach(i => {
                                    i.classList.remove('active');
                                });
                                
                                // Add active class to clicked item
                                this.classList.add('active');
                                
                                // Show chat container
                                document.getElementById('emptyChat').style.display = 'none';
                                document.getElementById('chatContainer').style.display = 'flex';
                                
                                // Set client name and ID
                                document.getElementById('chatClientName').textContent = clientName;
                                document.getElementById('clientId').value = clientId;
                                
                                // Load chat messages
                                loadChatMessages(clientId, clientMessages);
                            });
                        });
                        
                        // If a client is selected, load their messages
                        if (selectedClientId) {
                            const selectedClient = clientMessages.find(c => c.client_id == selectedClientId);
                            if (selectedClient) {
                                document.getElementById('emptyChat').style.display = 'none';
                                document.getElementById('chatContainer').style.display = 'flex';
                                document.getElementById('chatClientName').textContent = selectedClient.client_name;
                                document.getElementById('clientId').value = selectedClientId;
                                loadChatMessages(selectedClientId, clientMessages);
                            }
                        }
                    }
                }
            })
            .catch(error => {
                console.error('Error:', error);
                if (error.message === 'Not authenticated') {
                    window.location.href = '/login.html';
                }
            });
    }
    
    // Function to load chat messages for a specific client (chronological top-to-bottom)
    function loadChatMessages(clientId, clientMessages) {
        const client = clientMessages.find(c => c.client_id == clientId);
        const chatMessages = document.getElementById('chatMessages');
        
        if (client && chatMessages) {
            chatMessages.innerHTML = '';
            
            if (client.messages.length === 0) {
                chatMessages.innerHTML = `
                    <div class="empty-state">
                        <p>No messages yet with this collector</p>
                    </div>
                `;
            } else {
                // Sort chronologically: oldest at top, newest at bottom
                const sortedMessages = [...client.messages].sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
                
                sortedMessages.forEach(message => {
                    const date = new Date(message.sent_at).toLocaleString('en-IN', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                    });
                    
                    // Distinguish artist sent messages from client received inquiries
                    const isArtist = message.sender_type === 'artist' || 
                                     message.message.startsWith('[Artist]') || 
                                     message.message.startsWith('[Reply]');
                    const msgClass = isArtist ? 'sent' : 'received';
                    
                    // Clean tag for display if present
                    let displayMsg = message.message;
                    let tagBadge = '';
                    const tagMatch = message.message.match(/^\[(.*?)\]\s*(.*)/s);
                    if (tagMatch) {
                        tagBadge = `<span style="display:inline-block;font-size:0.7rem;padding:2px 8px;border-radius:12px;background:rgba(245,158,11,0.2);color:#fbbf24;margin-bottom:6px;font-weight:600;"><i class="fas fa-tag"></i> ${tagMatch[1]}</span><br>`;
                        displayMsg = tagMatch[2];
                    }
                    
                    chatMessages.innerHTML += `
                        <div class="message ${msgClass}">
                            <div class="message-content">
                                ${tagBadge}
                                ${displayMsg}
                            </div>
                            <div class="message-time">${date}</div>
                        </div>
                    `;
                });
                
                // Scroll down to latest message at the bottom
                setTimeout(() => {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 50);

                // Mark messages from this client as seen / read
                fetch('/api/messages/mark-read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ client_id: clientId })
                }).then(() => {
                    // Update client.messages in-memory is_read flags
                    if (client.messages) {
                        client.messages.forEach(m => { m.is_read = 1; });
                    }
                    // Remove red dot notification badge immediately
                    const badge = document.getElementById('messagesBadge');
                    if (badge) badge.style.display = 'none';
                }).catch(err => console.debug('Mark read error:', err));
            }
        }
    }
});