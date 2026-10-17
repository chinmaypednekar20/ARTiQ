// ARTiQ Artist Dashboard Common Script
document.addEventListener('DOMContentLoaded', function() {
    // 1. Sidebar Toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
        });
    }

    // 2. Logout Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            fetch('/api/logout')
                .then(r => r.json())
                .then(() => {
                    sessionStorage.clear();
                    window.location.href = '/login.html';
                })
                .catch(err => console.error('Logout error:', err));
        });
    }

    // 3. Load Artist Info & Profile Picture in Sidebar
    function loadSidebarArtist() {
        fetch('/api/profile')
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Not authenticated');
            })
            .then(artist => {
                const nameEl = document.getElementById('artistName');
                if (nameEl) nameEl.textContent = artist.name;
                
                const avatarEl = document.getElementById('userAvatar');
                if (avatarEl) {
                    if (artist.profile_pic) {
                        avatarEl.innerHTML = `<img src="${artist.profile_pic}" alt="${artist.name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                    } else {
                        avatarEl.innerHTML = `<span>${artist.name.charAt(0).toUpperCase()}</span>`;
                    }
                }
            })
            .catch(() => {
                // Fallback from session storage if available
                const storedName = sessionStorage.getItem('artistName');
                const nameEl = document.getElementById('artistName');
                if (storedName && nameEl) nameEl.textContent = storedName;
            });
    }
    loadSidebarArtist();

    // 4. Check for Unread Messages & Show Notification Badge (Red Circle)
    function checkMessagesBadge() {
        fetch('/api/messages')
            .then(res => {
                if (res.ok) return res.json();
                return [];
            })
            .then(clientMessages => {
                const badge = document.getElementById('messagesBadge');
                if (!badge) return;
                
                let totalMessages = 0;
                clientMessages.forEach(c => {
                    totalMessages += (c.messages ? c.messages.length : 0);
                });

                if (totalMessages > 0) {
                    badge.style.display = 'inline-block';
                    badge.title = `${totalMessages} total message(s)`;
                } else {
                    badge.style.display = 'none';
                }
            })
            .catch(err => console.debug('Badge check err:', err));
    }
    checkMessagesBadge();
    // Periodic badge check every 20 seconds
    setInterval(checkMessagesBadge, 20000);
});
