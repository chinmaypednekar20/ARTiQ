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
    
    // Function to load chat messages for a specific client
    function loadChatMessages(clientId, clientMessages) {
        const client = clientMessages.find(c => c.client_id == clientId);
        const chatMessages = document.getElementById('chatMessages');
        
        if (client && chatMessages) {
            chatMessages.innerHTML = '';
            
            if (client.messages.length === 0) {
                chatMessages.innerHTML = `
                    <div class="empty-state">
                        <p>No messages yet</p>
                    </div>
                `;
            } else {
                client.messages.forEach(message => {
                    const date = new Date(message.sent_at).toLocaleString();
                    
                    chatMessages.innerHTML += `
                        <div class="message sent">
                            <div class="message-content">${message.message}</div>
                            <div class="message-time">${date}</div>
                        </div>
                    `;
                });
                
                // Scroll to bottom
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }
    }
});