// Global state
const state = {
    user: null,
    cart: [],
    favorites: [],
    paintings: [],
    categories: [],
    auctions: [],
    orders: [],
    currentPainting: null
};

// API URL (dynamic relative path works on localhost, custom domains, and cloud deployment)
const API_URL = '/api';

// Security: Sanitize strings against XSS attacks before injecting into DOM
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============ Toast Notification System ============
function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============ Cart Badge ============
function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    const count = state.cart.length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

// ============ Feature 1 & 7: Socket.io Real-Time Client ============
const socket = typeof io !== 'undefined' ? io() : null;
if (socket) {
    socket.on('connect', () => {
        console.log('⚡ Connected to ARTiQ live auction & messaging stream:', socket.id);
    });

    // Feature 1: Real-time Live Bidding Broadcasts
    socket.on('auction:bid', (data) => {
        console.log('⚡ Real-time bid broadcast received:', data);
        
        // Update in-memory auctions
        const found = state.auctions.find(a => a.auction_id == data.auctionId);
        if (found) {
            found.current_bid = data.currentBid;
        }

        // Live update any rendered auction cards on screen
        const cards = document.querySelectorAll(`[data-auction-id="${data.auctionId}"]`);
        cards.forEach(card => {
            const bidAmtEl = card.querySelector('.bid-amount');
            if (bidAmtEl) {
                bidAmtEl.textContent = `₹${Number(data.currentBid).toLocaleString('en-IN')}`;
                bidAmtEl.classList.remove('bid-pulse');
                void bidAmtEl.offsetWidth; // Trigger reflow for animation restart
                bidAmtEl.classList.add('bid-pulse');
            }
        });

        showNotification(`⚡ Live Bid: ₹${Number(data.currentBid).toLocaleString('en-IN')} placed for "${data.title}" by ${data.bidderName || 'a collector'}!`, 'info');
    });

    // Feature 7 & Req 1: Real-time Artist Messages & Chatbox Stream
    socket.on('chat:message', (data) => {
        console.log('💬 Real-time chat message received:', data);
        
        // 1. If live chat modal is open and matches this conversation, append bubble live
        const chatModal = document.getElementById('chatModal');
        const stream = document.getElementById('chatbox-stream');
        const targetArtistId = document.getElementById('chat-target-artist-id');
        
        if (chatModal && chatModal.style.display !== 'none' && stream) {
            if (!targetArtistId || !targetArtistId.value || targetArtistId.value == data.artist_id) {
                const bubble = document.createElement('div');
                bubble.className = 'chat-bubble artist';
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                bubble.innerHTML = `
                    <div class="bubble-content">${escapeHtml(data.message || '')}</div>
                    <div class="bubble-meta">${timeStr} · Artist Studio</div>
                `;
                stream.appendChild(bubble);
                stream.scrollTop = stream.scrollHeight;
            }
        }

        // 2. Refresh dashboard messages tab if currently visible
        const messagesTab = document.querySelector('#messages-tab');
        if (messagesTab && messagesTab.style.display !== 'none') {
            loadMessagesTab(messagesTab);
        }

        // 3. Show navbar notification dot & toast
        const msgBadge = document.getElementById('client-msg-badge');
        if (msgBadge) msgBadge.style.display = 'inline-block';

        showNotification(`💬 Message from Artist: "${(data.message || '').slice(0, 35)}..."`, 'info');
    });
}

// ============ Req 7: Palette Themes Switcher ============
function initThemeSwitcher() {
    const savedTheme = localStorage.getItem('artiq_theme') || 'dark';
    applyTheme(savedTheme);

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeDropdown = document.getElementById('theme-dropdown');

    if (themeToggleBtn && themeDropdown) {
        themeToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            themeDropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-menu')) {
                themeDropdown.classList.remove('active');
            }
        });
    }

    const themeOptions = document.querySelectorAll('.theme-opt');
    themeOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.preventDefault();
            const theme = opt.dataset.theme;
            applyTheme(theme);
            if (themeDropdown) themeDropdown.classList.remove('active');
        });
    });
}

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('artiq_theme', themeName);

    const themeOptions = document.querySelectorAll('.theme-opt');
    themeOptions.forEach(opt => {
        if (opt.dataset.theme === themeName) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
}

// ============ Req 1 & 7: Interactive Live Chatbox Controller ============
async function openChatModal(artistId, artistName = 'Studio Artist', prefillMessage = '') {
    if (!state.user) {
        showNotification('Please sign in to chat directly with artists or commission bespoke works.', 'error');
        navigateTo('login');
        return;
    }

    const modal = document.getElementById('chatModal');
    if (!modal) return;

    const targetArtistInput = document.getElementById('chat-target-artist-id');
    const artistNameDisplay = document.getElementById('chat-artist-name');
    const artistAvatar = document.getElementById('chat-artist-avatar');
    const inputText = document.getElementById('chat-input-text');
    const stream = document.getElementById('chatbox-stream');

    if (targetArtistInput) targetArtistInput.value = artistId;
    if (artistNameDisplay) artistNameDisplay.textContent = artistName;
    if (artistAvatar) {
        artistAvatar.innerHTML = `<span style="font-weight:700;font-size:1.1rem;">${(artistName || 'A').charAt(0).toUpperCase()}</span>`;
    }
    if (inputText) {
        inputText.value = prefillMessage || '';
    }

    // Clear and display chat modal immediately so the user sees the chatbox
    modal.style.display = 'flex';
    if (inputText) inputText.focus();

    // Hide navbar red badge when opening messages
    const msgBadge = document.getElementById('client-msg-badge');
    if (msgBadge) msgBadge.style.display = 'none';

    // Mark messages as read from this artist
    fetch(`${API_URL}/messages/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ artist_id: artistId })
    }).catch(err => console.debug('Mark read error:', err));

    // Fetch conversation history for this artist
    if (stream) {
        stream.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading conversation history...</div>';
        try {
            const res = await fetch(`${API_URL}/messages/${artistId}`, { credentials: 'include' });
            if (res.ok) {
                const messages = await res.json();
                stream.innerHTML = '';
                if (!messages || messages.length === 0) {
                    stream.innerHTML = `
                        <div style="text-align:center;padding:35px 20px;color:var(--text-muted);">
                            <div style="font-size:2.2rem;margin-bottom:10px;opacity:0.8;">🎨</div>
                            <div style="font-weight:600;color:var(--text-primary);margin-bottom:6px;font-size:1.05rem;">Studio Channel with ${escapeHtml(artistName)}</div>
                            <div style="font-size:0.85rem;max-width:320px;margin:0 auto;line-height:1.5;">Direct, authenticated chat. Inquire about framing, request custom commissions, or ask about inspiration.</div>
                        </div>
                    `;
                } else {
                    // Sort chronologically (oldest at top, latest at bottom)
                    messages.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at));
                    messages.forEach(msg => {
                        const isClient = msg.sender_type === 'client' || (!msg.sender_type && msg.client_id == state.user.client_id);
                        const bubble = document.createElement('div');
                        bubble.className = `chat-bubble ${isClient ? 'client' : 'artist'}`;
                        const timeStr = new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        
                        let tag = null;
                        let text = msg.message;
                        const match = msg.message && msg.message.match(/^\[(.*?)\]\s*(.*)/s);
                        if (match) {
                            tag = match[1];
                            text = match[2];
                        }

                        bubble.innerHTML = `
                            ${tag ? `<span class="bubble-tag">${escapeHtml(tag)}</span>` : ''}
                            <div class="bubble-content">${escapeHtml(text)}</div>
                            <div class="bubble-meta">${timeStr} ${isClient ? '<i class="fas fa-check" style="font-size:0.65rem;margin-left:3px;color:var(--gold);"></i>' : '· Artist'}</div>
                        `;
                        stream.appendChild(bubble);
                    });
                }
                stream.scrollTop = stream.scrollHeight;
            } else {
                stream.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">Start your conversation with this artist below.</div>';
            }
        } catch (err) {
            console.error('Error fetching chat thread:', err);
            stream.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">Direct message line ready. Send a message below.</div>';
        }
    }
}

function initChatModal() {
    const modal = document.getElementById('chatModal');
    if (!modal) return;

    const closeBtn = document.getElementById('close-chat-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Quick topic chips click handlers
    const chips = modal.querySelectorAll('.topic-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const topic = chip.dataset.topic;
            const input = document.getElementById('chat-input-text');
            if (!input) return;
            const currentVal = input.value.replace(/^\[.*?\]\s*/, '');
            input.value = `[${topic}] ${currentVal}`;
            input.focus();
        });
    });

    // Chat composer form submission - keeps the chatbox visible!
    const composer = document.getElementById('chatbox-composer-form');
    if (composer) {
        composer.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!state.user) {
                showNotification('Please sign in to send messages.', 'error');
                navigateTo('login');
                modal.style.display = 'none';
                return;
            }

            const artistId = document.getElementById('chat-target-artist-id').value || 1;
            const input = document.getElementById('chat-input-text');
            const stream = document.getElementById('chatbox-stream');
            const sendBtn = document.getElementById('chat-send-btn');
            const text = input.value.trim();

            if (!text) return;

            // Optimistically append message to the visible stream
            let tag = null;
            let cleanText = text;
            const match = text.match(/^\[(.*?)\]\s*(.*)/s);
            if (match) {
                tag = match[1];
                cleanText = match[2];
            }

            const optimisticBubble = document.createElement('div');
            optimisticBubble.className = 'chat-bubble client';
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            optimisticBubble.innerHTML = `
                ${tag ? `<span class="bubble-tag">${escapeHtml(tag)}</span>` : ''}
                <div class="bubble-content">${escapeHtml(cleanText)}</div>
                <div class="bubble-meta">${timeStr} <i class="fas fa-spinner fa-spin" style="font-size:0.65rem;margin-left:3px;color:var(--gold);"></i></div>
            `;
            if (stream) {
                stream.appendChild(optimisticBubble);
                stream.scrollTop = stream.scrollHeight;
            }

            input.value = '';
            const origBtnHtml = sendBtn ? sendBtn.innerHTML : '';
            if (sendBtn) {
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }

            try {
                const response = await fetch(`${API_URL}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        artist_id: artistId,
                        message: text
                    }),
                    credentials: 'include'
                });

                if (response.ok) {
                    showNotification('Message delivered to artist studio!', 'success');
                    // Update checkmark
                    const meta = optimisticBubble.querySelector('.bubble-meta');
                    if (meta) {
                        meta.innerHTML = `${timeStr} <i class="fas fa-check" style="font-size:0.65rem;margin-left:3px;color:var(--gold);"></i>`;
                    }
                } else {
                    const err = await response.json();
                    showNotification(err.message || 'Failed to deliver message', 'error');
                    optimisticBubble.style.opacity = '0.5';
                }
            } catch (err) {
                console.error('Error delivering message:', err);
                showNotification('Network error while delivering message', 'error');
                optimisticBubble.style.opacity = '0.5';
            } finally {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.innerHTML = origBtnHtml;
                }
                if (input) input.focus();
            }
        });
    }
}

// ============ Page Loader ============
function dismissLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => loader.remove(), 500);
    }
}

// ============ Scroll Reveal ============
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// DOM Elements
const app = document.getElementById('app');
const userDropdown = document.getElementById('user-dropdown');
const userIcon = document.getElementById('user-icon');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Theme Switcher immediately
    initThemeSwitcher();

    // Initialize Forgot Password modal
    initClientForgotPasswordModal();

    // Initialize the app
    init();
    
    // Navigation
    document.addEventListener('click', (e) => {
        if (e.target.matches('[data-link]') || e.target.parentElement.matches('[data-link]')) {
            e.preventDefault();
            const link = e.target.matches('[data-link]') ? e.target : e.target.parentElement;
            const page = link.dataset.link;
            navigateTo(page);
        }
    });
    
    // User dropdown
    userIcon.addEventListener('click', (e) => {
        e.preventDefault();
        userDropdown.classList.toggle('active');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-menu')) {
            userDropdown.classList.remove('active');
        }
    });
    
    // Search
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');
    
    if (searchButton && searchInput) {
        searchButton.addEventListener('click', () => {
            const query = searchInput.value.trim();
            if (query) {
                navigateTo('paintings', { search: query });
            }
        });
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    navigateTo('paintings', { search: query });
                }
            }
        });
    }

    // Direct Navbar Messages Action
    const navMessagesBtn = document.getElementById('nav-messages-btn');
    if (navMessagesBtn) {
        navMessagesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!state.user) {
                showNotification('Please sign in to view your messages and chat with artists.', 'error');
                navigateTo('login');
                return;
            }
            openChatModal(1, 'Studio Master Artist');
        });
    }

    // Initialize interactive live chatbox modal listeners
    initChatModal();
});

// Initialize the app
async function init() {
    await checkAuth();
    await Promise.all([fetchPaintings(), fetchCategories()]);
    if (state.user) await fetchCart();
    updateCartBadge();
    navigateTo('home');
    dismissLoader();
}

// Check if user is authenticated
async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/profile`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const userData = await response.json();
            state.user = userData;
            updateUserUI();
        } else {
            state.user = null;
            updateUserUI();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        state.user = null;
        updateUserUI();
    }
}

// Update user UI
function updateUserUI() {
    userDropdown.innerHTML = '';
    if (state.user) {
        // Dynamic profile avatar in navbar
        if (state.user.profile_pic) {
            userIcon.innerHTML = `<img src="${escapeHtml(state.user.profile_pic)}" alt="${escapeHtml(state.user.name)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1.5px solid var(--gold);vertical-align:middle;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`;
        } else {
            userIcon.innerHTML = '<i class="fas fa-user"></i>';
        }

        userDropdown.innerHTML = `
            <div style="padding:10px 14px 6px;font-size:0.8rem;color:var(--text-muted)">Signed in as</div>
            <div style="padding:0 14px 12px;font-weight:600;color:var(--text-primary);font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(state.user.name)}</div>
            <div class="divider"></div>
            <a href="#" data-link="dashboard"><i class="fas fa-th-large" style="width:16px"></i> Dashboard</a>
            <a href="#" data-link="favorites"><i class="fas fa-heart" style="width:16px"></i> Favorites</a>
            <div class="divider"></div>
            <a href="#" id="logout-btn" class="danger"><i class="fas fa-sign-out-alt" style="width:16px"></i> Sign Out</a>
        `;
        document.getElementById('logout-btn').addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
        });
    } else {
        userIcon.innerHTML = '<i class="fas fa-user"></i>';
        userDropdown.innerHTML = `
            <a href="#" data-link="login"><i class="fas fa-sign-in-alt" style="width:16px"></i> Sign In</a>
            <a href="#" data-link="register"><i class="fas fa-user-plus" style="width:16px"></i> Register</a>
        `;
    }
}

// Logout
async function logout() {
    try {
        const response = await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            state.user = null;
            updateUserUI();
            navigateTo('home');
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Fetch paintings
async function fetchPaintings() {
    try {
        const response = await fetch(`${API_URL}/paintings`);
        if (response.ok) {
            state.paintings = await response.json();
        }
    } catch (error) {
        console.error('Error fetching paintings:', error);
    }
}

// Fetch categories
async function fetchCategories() {
    try {
        const response = await fetch(`${API_URL}/categories`);
        if (response.ok) {
            state.categories = await response.json();
        }
    } catch (error) {
        console.error('Error fetching categories:', error);
    }
}

// Fetch painting by ID
async function fetchPaintingById(id) {
    try {
        const response = await fetch(`${API_URL}/paintings/${id}`);
        if (response.ok) {
            state.currentPainting = await response.json();
            return state.currentPainting;
        }
        return null;
    } catch (error) {
        console.error('Error fetching painting:', error);
        return null;
    }
}

// Fetch cart
async function fetchCart() {
    if (!state.user) return;
    
    try {
        const response = await fetch(`${API_URL}/cart`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            state.cart = await response.json();
        }
    } catch (error) {
        console.error('Error fetching cart:', error);
    }
}

// Fetch favorites
async function fetchFavorites() {
    if (!state.user) return;
    
    try {
        const response = await fetch(`${API_URL}/favorites`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            state.favorites = await response.json();
        }
    } catch (error) {
        console.error('Error fetching favorites:', error);
    }
}

// Fetch orders
async function fetchOrders() {
    if (!state.user) return;
    
    try {
        const response = await fetch(`${API_URL}/orders`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            state.orders = await response.json();
        }
    } catch (error) {
        console.error('Error fetching orders:', error);
    }
}

// Fetch auctions
async function fetchAuctions() {
    try {
        const response = await fetch(`${API_URL}/auctions`);
        if (response.ok) {
            state.auctions = await response.json();
            console.log(state.auctions);
        }
    } catch (error) {
        console.error('Error fetching auctions:', error);
    }
}

// Add to cart
async function addToCart(paintingId) {
    if (!state.user) {
        navigateTo('login');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/cart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paintingId }),
            credentials: 'include'
        });
        
        if (response.ok) {
            await fetchCart();
            showNotification('Added to cart successfully!');
        } else {
            const data = await response.json();
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        showNotification('Failed to add to cart', 'error');
    }
}

// Remove from cart
async function removeFromCart(cartId) {
    try {
        const response = await fetch(`${API_URL}/cart/${cartId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            await fetchCart();
            renderCart();
            showNotification('Removed from cart successfully!');
        } else {
            const data = await response.json();
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error removing from cart:', error);
        showNotification('Failed to remove from cart', 'error');
    }
}

// Add to favorites
async function addToFavorites(paintingId) {
    if (!state.user) {
        navigateTo('login');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/favorites`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paintingId }),
            credentials: 'include'
        });
        
        if (response.ok) {
            await fetchFavorites();
            showNotification('Added to favorites successfully!');
        } else {
            const data = await response.json();
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error adding to favorites:', error);
        showNotification('Failed to add to favorites', 'error');
    }
}

// Remove from favorites
async function removeFromFavorites(favoriteId) {
    try {
        const response = await fetch(`${API_URL}/favorites/${favoriteId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            await fetchFavorites();
            if (app.querySelector('.favorites-grid')) {
                renderFavorites();
            }
            showNotification('Removed from favorites successfully!');
        } else {
            const data = await response.json();
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error removing from favorites:', error);
        showNotification('Failed to remove from favorites', 'error');
    }
}

// Create order
async function createOrder() {
    try {
        const response = await fetch(`${API_URL}/orders`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            await fetchOrders();
            showNotification('Order created successfully!');
            navigateTo('orders');
        } else {
            const data = await response.json();
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error creating order:', error);
        showNotification('Failed to create order', 'error');
    }
}

// Place bid
async function placeBid(auctionId, bidAmount) {
    if (!state.user) {
        navigateTo('login');
        return;
    }
    
    const userId = localStorage.getItem('userId');
    console.log('Logged in client ID:', userId);

    try {

        const response = await fetch(`${API_URL}/bids`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ auctionId, bidAmount, bidderId: userId }),
            credentials: 'include'
        });
        
        
        if (response.ok) {
            await fetchAuctions();
            showNotification('Bid placed successfully!');
        } else {
            const data = await response.json();
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error placing bid:', error);
        showNotification('Failed to place bid', 'error');
    }
}

// Update profile
async function updateProfile(profileData) {
    try {
        const response = await fetch(`${API_URL}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profileData),
            credentials: 'include'
        });
        
        if (response.ok) {
            await checkAuth();
            showNotification('Profile updated successfully!');
        } else {
            const data = await response.json();
            showNotification(data.message, 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('Failed to update profile', 'error');
    }
}

// Navigation
function navigateTo(page, params = {}) {
    switch (page) {
        case 'home':
            renderHome();
            break;
        case 'paintings':
            renderPaintings(params);
            break;
        case 'painting':
            renderPaintingDetail(params.id);
            break;
        case 'cart':
            renderCart();
            break;
        case 'checkout':
            renderCheckout();
            break;
        case 'login':
            renderLogin();
            break;
        case 'register':
            renderRegister();
            break;
        case 'dashboard':
            renderDashboard();
            break;
        case 'favorites':
            renderFavorites();
            break;
        case 'orders':
            renderOrders();
            break;
        case 'auctions':
            renderAuctions();
            break;
        default:
            renderHome();
    }
}

// Render home page
function renderHome() {
    const template = document.getElementById('home-template');
    const content = template.content.cloneNode(true);
    
    // Render categories
    const categoryList = content.querySelector('.category-list');
    categoryList.innerHTML = '';
    
    state.categories.forEach(category => {
        const categoryItem = document.createElement('div');
        categoryItem.className = 'category-item';
        categoryItem.innerHTML = `
            <i class="fas fa-palette"></i>
            <h3>${category}</h3>
        `;
        categoryItem.addEventListener('click', () => {
            navigateTo('paintings', { category });
        });
        categoryList.appendChild(categoryItem);
    });
    
    // Render featured paintings
    const paintingsGrid = content.querySelector('.paintings-grid');
    paintingsGrid.innerHTML = '';
    
    // Get 6 random paintings for featured section
    const featuredPaintings = state.paintings
        .sort(() => 0.5 - Math.random())
        .slice(0, 6);
    
    featuredPaintings.forEach(painting => {
        const paintingCard = createPaintingCard(painting);
        
        paintingsGrid.appendChild(paintingCard);
    });
    
    // Fetch and render auctions
    fetchAuctions().then(() => {
        const auctionsGrid = document.querySelector('.auctions-grid');
        if (auctionsGrid) {
            auctionsGrid.innerHTML = '';
            
            if (state.auctions.length === 0) {
                auctionsGrid.innerHTML = '<p class="no-items">No active auctions at the moment.</p>';
                return;
            }
            
            state.auctions.slice(0, 3).forEach(auction => {
                const auctionCard = createAuctionCard(auction);
                auctionsGrid.appendChild(auctionCard);
            });
        }
    });
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Render paintings page
function renderPaintings(params = {}) {
    const template = document.getElementById('paintings-template');
    const content = template.content.cloneNode(true);
    
    // Populate category filter
    const categoryFilter = content.querySelector('#category-filter');
    state.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
    
    // Set filter values if provided in params
    if (params.category) {
        categoryFilter.value = params.category;
    }
    
    if (params.minPrice) {
        content.querySelector('#price-min').value = params.minPrice;
    }
    
    if (params.maxPrice) {
        content.querySelector('#price-max').value = params.maxPrice;
    }
    
    if (params.size) {
        content.querySelector('#size-filter').value = params.size;
    }
    
    // Apply filters button
    content.querySelector('#apply-filters').addEventListener('click', () => {
        const category = categoryFilter.value;
        const priceMinElement = content.querySelector('#price-min');
        const priceMaxElement = content.querySelector('#price-max');
        const sizeFilterElement = content.querySelector('#size-filter');

        const minPrice = priceMinElement ? priceMinElement.value : '';
        const maxPrice = priceMaxElement ? priceMaxElement.value : '';
        const size = sizeFilterElement ? sizeFilterElement.value : '';
        
        let filteredPaintings = [...state.paintings];
        
        if (category) {
            filteredPaintings = filteredPaintings.filter(p => p.category === category);
        }
        
        if (minPrice) {
            filteredPaintings = filteredPaintings.filter(p => p.price >= parseFloat(minPrice));
        }
        
        if (maxPrice) {
            filteredPaintings = filteredPaintings.filter(p => p.price <= parseFloat(maxPrice));
        }
        
        if (size) {
            filteredPaintings = filteredPaintings.filter(p => p.size.includes(size));
        }
        
        if (params.search) {
            const searchTerm = params.search.toLowerCase();
            filteredPaintings = filteredPaintings.filter(p => 
                p.title.toLowerCase().includes(searchTerm) || 
                p.artist_name.toLowerCase().includes(searchTerm) ||
                p.category.toLowerCase().includes(searchTerm)
            );
        }
        
        renderPaintingsGrid(filteredPaintings);
    });
    
    app.innerHTML = '';
    app.appendChild(content);
    
    // Initial rendering of paintings
    let paintingsToRender = [...state.paintings];
    
    if (params.category) {
        paintingsToRender = paintingsToRender.filter(p => p.category === params.category);
    }
    
    if (params.search) {
        const searchTerm = params.search.toLowerCase();
        paintingsToRender = paintingsToRender.filter(p => 
            p.title.toLowerCase().includes(searchTerm) || 
            p.artist_name.toLowerCase().includes(searchTerm) ||
            p.category.toLowerCase().includes(searchTerm)
        );
    }
    
    renderPaintingsGrid(paintingsToRender);
}

// Render paintings grid
function renderPaintingsGrid(paintings) {
    const paintingsGrid = document.querySelector('.paintings-grid');
    paintingsGrid.innerHTML = '';
    
    if (paintings.length === 0) {
        paintingsGrid.innerHTML = '<p class="no-items">No paintings found matching your criteria.</p>';
        return;
    }
    
    paintings.forEach(painting => {
        const paintingCard = createPaintingCard(painting);
        paintingsGrid.appendChild(paintingCard);
    });
}

// Create painting card (with SOLD status handling)
function createPaintingCard(painting) {
    const imageUrl = painting.image_url || 'https://via.placeholder.com/300x240/161616/c9a84c?text=ARTiQ';
    const isSold = painting.is_sold == 1 || painting.is_sold === true;
    const card = document.createElement('div');
    card.className = `painting-card ${isSold ? 'is-sold-card' : ''}`;
    card.innerHTML = `
        <div class="painting-image">
            <img src="${imageUrl}" alt="${escapeHtml(painting.title)}" loading="lazy">
            <span class="category-badge">${escapeHtml(painting.category)}</span>
            ${isSold ? '<span class="sold-badge"><i class="fas fa-lock"></i> SOLD</span>' : ''}
            <div class="painting-overlay">
                ${isSold 
                    ? `<button class="btn commission-btn sold-commission-btn" style="font-size:0.8rem;padding:8px 14px;background:rgba(220,38,38,0.9);color:#fff;border-color:transparent;box-shadow:0 4px 12px rgba(220,38,38,0.4);">
                        <i class="fas fa-magic"></i> Commission Similar
                       </button>`
                    : `<button class="btn primary-btn add-to-cart-btn" style="font-size:0.8rem;padding:8px 14px">
                        <i class="fas fa-shopping-bag"></i> Add to Cart
                       </button>`
                }
                <button class="btn ghost-btn favorite-btn" style="font-size:0.8rem;padding:8px 14px">
                    <i class="far fa-heart"></i>
                </button>
            </div>
        </div>
        <div class="painting-info">
            <h3>${escapeHtml(painting.title)}</h3>
            <p class="artist">By <span>${escapeHtml(painting.artist_name)}</span></p>
            <div class="price-row">
                <span class="price" ${isSold ? 'style="text-decoration:line-through;opacity:0.6;"' : ''}>₹${Number(painting.price).toLocaleString('en-IN')}</span>
                ${isSold ? '<span style="font-size:0.75rem;font-weight:700;color:#ef4444;background:rgba(239,68,68,0.15);padding:2px 8px;border-radius:12px;margin-left:auto;letter-spacing:0.04em;">PRIVATE COLLECTION</span>' : ''}
                <button class="fav-btn" title="Add to favorites"><i class="far fa-heart"></i></button>
            </div>
        </div>
    `;
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.painting-overlay') && !e.target.closest('.fav-btn')) {
            navigateTo('painting', { id: painting.painting_id });
        }
    });

    const addBtn = card.querySelector('.add-to-cart-btn');
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToCart(painting.painting_id);
        });
    }

    const commissionBtn = card.querySelector('.sold-commission-btn');
    if (commissionBtn) {
        commissionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openChatModal(
                painting.artist_id || 1, 
                painting.artist_name || 'the Artist', 
                `Hi ${painting.artist_name || 'Artist'}, I saw that your original masterpiece "${painting.title}" has been sold to a private collector. Could I commission a bespoke piece in a similar composition?`
            );
        });
    }

    const favBtns = card.querySelectorAll('.favorite-btn, .fav-btn');
    favBtns.forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToFavorites(painting.painting_id);
    }));
    return card;
}

// Create auction card
function createAuctionCard(auction) {
    const endTime = new Date(auction.end_time);
    const now = new Date();
    const timeLeft = endTime - now;
    let timeLeftText = '';
    if (timeLeft <= 0) {
        timeLeftText = 'Auction ended';
    } else {
        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) timeLeftText = `${days}d ${hours}h remaining`;
        else timeLeftText = `${hours}h ${minutes}m remaining`;
    }
    const imgUrl = auction.image_url || 'https://via.placeholder.com/300x200/161616/c9a84c?text=ARTiQ';
    const card = document.createElement('div');
    card.className = 'auction-card';
    card.setAttribute('data-auction-id', auction.auction_id);
    card.innerHTML = `
        <div class="auction-image">
            <img src="${imgUrl}" alt="${escapeHtml(auction.title)}" loading="lazy">
            ${timeLeft > 0 ? '<div class="live-badge"><span class="live-dot"></span>LIVE</div>' : ''}
        </div>
        <div class="auction-info">
            <h3>${escapeHtml(auction.title)}</h3>
            <p class="artist">By ${escapeHtml(auction.artist_name)}</p>
            <div class="bid-info">
                <div>
                    <div class="bid-label">Current Bid</div>
                    <div class="bid-amount">₹${Number(auction.current_bid).toLocaleString('en-IN')}</div>
                </div>
                <div style="text-align:right">
                    <div class="bid-label">Starting</div>
                    <div class="bid-start">₹${Number(auction.starting_price).toLocaleString('en-IN')}</div>
                </div>
            </div>
            <div class="time-left"><i class="fas fa-clock"></i> ${timeLeftText}</div>
            <button class="btn primary-btn bid-btn" style="width:100%" ${timeLeft <= 0 ? 'disabled' : ''}>
                <i class="fas fa-gavel"></i> Place Bid
            </button>
        </div>
    `;
    card.querySelector('.bid-btn').addEventListener('click', () => {
        if (!state.user) { navigateTo('login'); return; }
        const bidAmount = prompt(`Current bid: ₹${auction.current_bid}\nEnter your bid amount (must be higher):`);
        if (bidAmount && !isNaN(bidAmount) && parseFloat(bidAmount) > auction.current_bid) {
            placeBid(auction.auction_id, parseFloat(bidAmount));
        } else if (bidAmount) {
            showNotification('Bid must be higher than the current bid.', 'error');
        }
    });
    return card;
}

// Render painting detail (with SOLD Banner & interactive Chatbox commission)
async function renderPaintingDetail(id) {
    const painting = await fetchPaintingById(id);
    
    if (!painting) {
        navigateTo('paintings');
        return;
    }
    
    const template = document.getElementById('painting-detail-template');
    const content = template.content.cloneNode(true);
    const isSold = painting.is_sold == 1 || painting.is_sold === true;
    
    // Populate painting details
    content.querySelector('#detail-image').src = painting.image_url || '/placeholder.svg?height=400&width=600';
    content.querySelector('#detail-image').alt = painting.title;
    content.querySelector('#detail-title').textContent = painting.title;
    content.querySelector('#detail-artist').textContent = painting.artist_name;
    content.querySelector('#detail-price').textContent = Number(painting.price).toLocaleString('en-IN');
    content.querySelector('#detail-size').textContent = painting.size;
    content.querySelector('#detail-category').textContent = painting.category;
    content.querySelector('#detail-description').textContent = painting.description || 'No description available.';
    
    const soldBanner = content.querySelector('#detail-sold-banner');
    const addToCartBtn = content.querySelector('#add-to-cart');
    const inquireBtn = content.querySelector('#inquire-artist-btn');

    if (isSold) {
        if (soldBanner) soldBanner.style.display = 'flex';
        if (addToCartBtn) {
            addToCartBtn.disabled = true;
            addToCartBtn.style.opacity = '0.55';
            addToCartBtn.style.cursor = 'not-allowed';
            addToCartBtn.innerHTML = '<i class="fas fa-lock"></i> Original Sold';
        }
        if (inquireBtn) {
            inquireBtn.classList.remove('ghost-btn');
            inquireBtn.classList.add('primary-btn');
            inquireBtn.innerHTML = '<i class="fas fa-magic"></i> Commission Similar Piece';
        }
    } else {
        if (soldBanner) soldBanner.style.display = 'none';
        if (addToCartBtn) {
            addToCartBtn.addEventListener('click', () => {
                addToCart(painting.painting_id);
            });
        }
    }
    
    content.querySelector('#add-to-favorites').addEventListener('click', () => {
        addToFavorites(painting.painting_id);
    });

    // Req 1 & 4: Open Interactive Chatbox for Inquiry / Custom Commission
    if (inquireBtn) {
        inquireBtn.addEventListener('click', () => {
            const prefill = isSold
                ? `Hi ${painting.artist_name || 'Artist'}, I saw that your original painting "${painting.title}" is already acquired. Could I commission a bespoke similar work?`
                : `Hi ${painting.artist_name || 'Artist'}, I would love to ask about your artwork "${painting.title}".`;
            openChatModal(painting.artist_id || 1, painting.artist_name || 'Studio Artist', prefill);
        });
    }
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Render cart
async function renderCart() {
    await fetchCart();
    
    const template = document.getElementById('cart-template');
    const content = template.content.cloneNode(true);
    
    const cartItems = content.querySelector('.cart-items');
    cartItems.innerHTML = '';
    
    if (state.cart.length === 0) {
        cartItems.innerHTML = '<p class="no-items">Your cart is empty.</p>';
        content.querySelector('#checkout-btn').disabled = true;
    } else {
        let subtotal = 0;
        
        state.cart.forEach(item => {
            subtotal += parseFloat(item.price);
            
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.innerHTML = `
                <div class="cart-item-image">
                    <img src="${item.image_url || '/placeholder.svg?height=100&width=100'}" alt="${item.title}">
                </div>
                <div class="cart-item-info">
                    <h3>${item.title}</h3>
                    <p class="artist">By ${item.artist_name}</p>
                    <p class="price">₹${item.price}</p>
                </div>
                <div class="cart-item-actions">
                    <button class="remove-btn">Remove</button>
                </div>
            `;
            
            cartItem.querySelector('.remove-btn').addEventListener('click', () => {
                removeFromCart(item.cart_id);
            });
            
            cartItems.appendChild(cartItem);
        });
        
        // Update subtotal and total
        content.querySelector('#cart-subtotal').textContent = `₹${subtotal.toFixed(2)}`;
        content.querySelector('#cart-total').textContent = `₹${(subtotal + 25).toFixed(2)}`;
        
        // Checkout button
        content.querySelector('#checkout-btn').addEventListener('click', () => {
            if (!state.user) {
                navigateTo('login');
                return;
            }
            navigateTo('checkout');
        });
    }
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Render checkout
async function renderCheckout() {
    if (!state.user) {
        navigateTo('login');
        return;
    }
    
    await fetchCart();
    
    if (state.cart.length === 0) {
        navigateTo('cart');
        return;
    }
    
    const template = document.getElementById('checkout-template');
    const content = template.content.cloneNode(true);
    
    const orderItems = content.querySelector('.order-items');
    orderItems.innerHTML = '';
    
    let subtotal = 0;
    
    state.cart.forEach(item => {
        subtotal += parseFloat(item.price);
        
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';
        orderItem.innerHTML = `
            <div class="order-item-image">
                <img src="${item.image_url || '/placeholder.svg?height=60&width=60'}" alt="${item.title}">
            </div>
            <div class="order-item-info">
                <h4>${item.title}</h4>
                <p class="price">₹${Number(item.price).toLocaleString('en-IN')}</p>
            </div>
        `;
        
        orderItems.appendChild(orderItem);
    });
    
    const shippingFee = 250;
    const grandTotal = subtotal + shippingFee;

    // Update subtotal and total
    content.querySelector('#checkout-subtotal').textContent = `₹${subtotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    content.querySelector('#checkout-total').textContent = `₹${grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    
    // Feature 6: Payment method toggle
    const payRadios = content.querySelectorAll('input[name="pay-method"]');
    const cardFields = content.querySelector('#card-fields-container');
    const upiFields = content.querySelector('#upi-fields-container');
    const methodCards = content.querySelectorAll('.pay-method-card');

    payRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            methodCards.forEach(c => {
                const r = c.querySelector('input[name="pay-method"]');
                if (r && r.checked) {
                    c.style.borderColor = 'var(--gold)';
                    c.style.background = 'var(--dark-3)';
                } else {
                    c.style.borderColor = 'var(--border)';
                    c.style.background = 'var(--dark-2)';
                }
            });
            if (radio.value === 'upi') {
                if (cardFields) cardFields.style.display = 'none';
                if (upiFields) upiFields.style.display = 'block';
                content.querySelector('#card-number').required = false;
                content.querySelector('#expiry').required = false;
                content.querySelector('#cvv').required = false;
                content.querySelector('#upi-id').required = true;
            } else {
                if (cardFields) cardFields.style.display = 'block';
                if (upiFields) upiFields.style.display = 'none';
                content.querySelector('#card-number').required = true;
                content.querySelector('#expiry').required = true;
                content.querySelector('#cvv').required = true;
                content.querySelector('#upi-id').required = false;
            }
        });
    });

    // Feature 6: Autofill Stripe Test Card
    const autofillBtn = content.querySelector('#autofill-test-card');
    if (autofillBtn) {
        autofillBtn.addEventListener('click', () => {
            content.querySelector('#card-number').value = '4242 4242 4242 4242';
            content.querySelector('#expiry').value = '12/28';
            content.querySelector('#cvv').value = '123';
            showNotification('Stripe test card autofilled (Visa · 4242)', 'info');
        });
    }

    // Live card number spacing
    const cardInput = content.querySelector('#card-number');
    if (cardInput) {
        cardInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '').substring(0, 16);
            val = val.match(/.{1,4}/g)?.join(' ') || val;
            e.target.value = val;
        });
    }

    // Expiry MM/YY formatting
    const expInput = content.querySelector('#expiry');
    if (expInput) {
        expInput.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, '').substring(0, 4);
            if (val.length >= 2) val = val.substring(0, 2) + '/' + val.substring(2);
            e.target.value = val;
        });
    }

    // Form submission with Stripe Intent Authorization
    content.querySelector('#shipping-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = content.querySelector('#place-order-submit-btn') || e.target.querySelector('button[type="submit"]');
        const origText = submitBtn.innerHTML;

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authorizing with Stripe Gateway...';

            const selectedMethod = content.querySelector('input[name="pay-method"]:checked')?.value || 'card';

            // Call Stripe Payment Intent API
            const intentRes = await fetch(`${API_URL}/payment/create-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: grandTotal, currency: 'inr' }),
                credentials: 'include'
            });

            if (!intentRes.ok) {
                const errData = await intentRes.json();
                throw new Error(errData.message || 'Payment authorization failed');
            }

            const intentData = await intentRes.json();

            // Simulate Stripe 3D secure verification handshake
            await new Promise(r => setTimeout(r, 750));

            submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Payment Authorized! Creating Order...';
            
            // Execute order creation
            await createOrder();
            showNotification(`Payment verified by Stripe (${intentData.clientSecret.slice(0, 18)}...)`, 'success');
        } catch (err) {
            console.error('Checkout error:', err);
            showNotification(err.message || 'Checkout failed. Please retry.', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
        }
    });
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Render login
function renderLogin() {
    if (state.user) {
        navigateTo('dashboard');
        return;
    }
    
    const template = document.getElementById('login-template');
    const content = template.content.cloneNode(true);
    
    content.querySelector('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.querySelector('#login-email')?.value || '';
        const password = document.querySelector('#login-password')?.value || '';
        
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('userId', data.user.id);
                localStorage.setItem('userName', data.user.name);
                localStorage.setItem('userEmail', data.user.email);
                await checkAuth();
                navigateTo('dashboard');
                showNotification('Welcome back to ARTiQ!');
            } else {
                const data = await response.json();
                showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification('Login failed', 'error');
        }
    });

    // Google OAuth Handler
    const googleBtn = content.querySelector('#client-google-btn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            const googleEmail = prompt('Sign in with Google Account:\nEnter Google Email:', 'collector@gmail.com');
            if (!googleEmail) return;
            const googleName = prompt('Enter Google Display Name:', 'Contemporary Collector') || 'Collector';

            googleBtn.disabled = true;
            googleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';

            try {
                const res = await fetch(`${API_URL}/auth/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        email: googleEmail,
                        name: googleName,
                        google_id: 'goog_' + Date.now()
                    })
                });
                const data = await res.json();
                if (res.ok && data.user) {
                    localStorage.setItem('userId', data.user.id);
                    localStorage.setItem('userName', data.user.name);
                    localStorage.setItem('userEmail', data.user.email);
                    await checkAuth();
                    navigateTo('dashboard');
                    showNotification('Signed in with Google successfully!');
                } else {
                    showNotification(data.message || 'Google sign-in failed', 'error');
                    googleBtn.disabled = false;
                    googleBtn.innerHTML = 'Continue with Google';
                }
            } catch (err) {
                console.error('Google sign-in error:', err);
                showNotification('Google authentication failed', 'error');
                googleBtn.disabled = false;
                googleBtn.innerHTML = 'Continue with Google';
            }
        });
    }

    // Forgot Password Link Handler
    const forgotLink = content.querySelector('#client-forgot-link');
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            const modal = document.getElementById('clientForgotModal');
            if (modal) {
                modal.style.display = 'flex';
                const status = document.getElementById('clientForgotStatusMsg');
                if (status) status.textContent = '';
            }
        });
    }
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Client Forgot Password Modal Logic
function initClientForgotPasswordModal() {
    const modal = document.getElementById('clientForgotModal');
    const closeBtn = document.getElementById('closeClientForgotModal');
    const reqForm = document.getElementById('clientForgotRequestForm');
    const resetForm = document.getElementById('clientForgotResetForm');
    const statusMsg = document.getElementById('clientForgotStatusMsg');

    if (!modal) return;

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    if (reqForm) {
        reqForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('clientForgotEmail').value.trim();
            const sendBtn = document.getElementById('clientSendCodeBtn');
            sendBtn.disabled = true;
            sendBtn.textContent = 'Generating verification code...';

            try {
                const res = await fetch(`${API_URL}/auth/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send Verification Code';

                if (res.ok && data.resetCode) {
                    statusMsg.style.color = 'var(--color-success)';
                    statusMsg.innerHTML = `Verification code generated! (Dev code: <strong>${data.resetCode}</strong>)`;
                    reqForm.style.display = 'none';
                    resetForm.style.display = 'block';
                    document.getElementById('clientResetTokenInput').value = data.resetCode;
                } else {
                    statusMsg.style.color = 'var(--color-error)';
                    statusMsg.textContent = data.message || 'Failed to process request';
                }
            } catch (err) {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send Verification Code';
                statusMsg.style.color = 'var(--color-error)';
                statusMsg.textContent = 'Network error while requesting code.';
            }
        });
    }

    if (resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('clientForgotEmail').value.trim();
            const token = document.getElementById('clientResetTokenInput').value.trim();
            const newPassword = document.getElementById('clientResetNewPass').value;
            const confirmBtn = document.getElementById('clientConfirmResetBtn');

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Updating...';

            try {
                const res = await fetch(`${API_URL}/auth/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, token, newPassword })
                });
                const data = await res.json();
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Update Password';

                if (res.ok) {
                    statusMsg.style.color = 'var(--color-success)';
                    statusMsg.textContent = data.message || 'Password updated successfully! You may now sign in.';
                    setTimeout(() => {
                        modal.style.display = 'none';
                        resetForm.reset();
                        reqForm.style.display = 'block';
                        resetForm.style.display = 'none';
                        statusMsg.textContent = '';
                    }, 2000);
                } else {
                    statusMsg.style.color = 'var(--color-error)';
                    statusMsg.textContent = data.message || 'Failed to update password';
                }
            } catch (err) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Update Password';
                statusMsg.style.color = 'var(--color-error)';
                statusMsg.textContent = 'Network error while resetting password.';
            }
        });
    }
}


// Render register
function renderRegister() {
    if (state.user) {
        navigateTo('dashboard');
        return;
    }
    
    const template = document.getElementById('register-template');
    const content = template.content.cloneNode(true);
    
    content.querySelector('#register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.querySelector('#register-name').value;
        const email = document.querySelector('#register-email').value;
        const password = document.querySelector('#register-password').value;
        const confirmPassword = document.querySelector('#register-confirm-password').value;
        const phone = document.querySelector('#register-phone').value;
        const age = document.querySelector('#register-age').value;
        const gender = document.querySelector('#register-gender').value;
        
        if (password !== confirmPassword) {
            showNotification('Passwords do not match', 'error');
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password, phone, age, gender }),
                credentials: 'include'
            });
            
            if (response.ok) {
                showNotification('Registration successful! Please login.');
                navigateTo('login');
            } else {
                const data = await response.json();
                showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showNotification('Registration failed', 'error');
        }
    });
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Render dashboard
async function renderDashboard() {
    if (!state.user) {
        navigateTo('login');
        return;
    }

    const template = document.getElementById('dashboard-template');
    const content = template.content.cloneNode(true);

    // Populate profile form (before appending to DOM is fine)
    content.querySelector('#profile-name').value = state.user.name || '';
    content.querySelector('#profile-email').value = state.user.email || '';
    content.querySelector('#profile-phone').value = state.user.phone || '';
    content.querySelector('#profile-age').value = state.user.age || '';
    content.querySelector('#profile-gender').value = state.user.gender || 'other';

    const picUrlInput = content.querySelector('#profile-pic-url');
    if (picUrlInput) picUrlInput.value = state.user.profile_pic || '';

    const bioInput = content.querySelector('#profile-bio');
    if (bioInput) bioInput.value = state.user.bio || '';

    const avatarPreview = content.querySelector('#client-avatar-preview');
    if (avatarPreview) {
        if (state.user.profile_pic) {
            avatarPreview.innerHTML = `<img src="${escapeHtml(state.user.profile_pic)}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`;
        } else {
            avatarPreview.innerHTML = '<i class="fas fa-user"></i>';
        }
    }

    // Inject content into the DOM
    app.innerHTML = '';
    app.appendChild(content);

    // Live avatar preview on input
    const livePicInput = document.querySelector('#profile-pic-url');
    const livePreview = document.querySelector('#client-avatar-preview');
    if (livePicInput && livePreview) {
        livePicInput.addEventListener('input', () => {
            const url = livePicInput.value.trim();
            if (url) {
                livePreview.innerHTML = `<img src="${escapeHtml(url)}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`;
            } else {
                livePreview.innerHTML = '<i class="fas fa-user"></i>';
            }
        });
    }

    // Now use document.querySelector to access DOM elements
    const tabLinks = document.querySelectorAll('.dashboard-menu a');
    const tabs = document.querySelectorAll('.dashboard-tab');

    // Handle profile form submission
    const profileForm = document.querySelector('#profile-form');
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const profileData = {
            name: document.querySelector('#profile-name').value.trim(),
            phone: document.querySelector('#profile-phone').value.trim(),
            age: document.querySelector('#profile-age').value,
            gender: document.querySelector('#profile-gender').value,
            profile_pic: document.querySelector('#profile-pic-url') ? document.querySelector('#profile-pic-url').value.trim() : null,
            bio: document.querySelector('#profile-bio') ? document.querySelector('#profile-bio').value.trim() : null
        };

        await updateProfile(profileData);
    });

    // Tab switching logic
    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();

            // Update active tab link
            tabLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Hide all tabs
            tabs.forEach(tab => tab.style.display = 'none');

            // Show selected tab
            const tabId = link.dataset.tab;
            const activeTab = document.querySelector(`#${tabId}-tab`);
            if (activeTab) activeTab.style.display = 'block';

            // Load tab-specific data
            if (tabId === 'orders') {
                loadOrdersTab(activeTab);
            } else if (tabId === 'favorites') {
                loadFavoritesTab(activeTab);
            } else if (tabId === 'auctions') {
                loadAuctionsTab(activeTab);
            } else if (tabId === 'messages') {
                loadMessagesTab(activeTab);
            }
        });
    });

    // Show the default tab (Profile)
    document.querySelector('#profile-tab').style.display = 'block';
}

function closeReceiptModal() {
    document.getElementById('receiptModal').style.display = 'none';
}
window.addEventListener('click', function(e) {
    const modal = document.getElementById('receiptModal');
    if (e.target === modal) {
        closeReceiptModal();
    }
});


function renderReceipt(data) {
    const container = document.getElementById('receiptContainer');
    const date = new Date(data.order_date).toLocaleDateString();
    const subtotal = parseFloat(data.amount);
    const tax = subtotal * 0.05;
    const totalPaid = subtotal + tax;

    container.innerHTML = `
    <div class="receipt-container">
      <div class="header">
        <h2>ARTiQ</h2>
        <p>Painting E-commerce Platform</p>
      </div>
      <div class="info-section">
        <div class="info-block">
          <strong>Billed To:</strong><br>
          ${data.client_name}<br>
          ${data.client_email}<br>
          ${data.client_address}
        </div>
        <div class="info-block" style="text-align: right;">
          <strong>Receipt No:</strong> #${data.receipt_no}<br>
          <strong>Date:</strong> ${date}
        </div>
      </div>
      <table class="receipt-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Cost per unit</th>
            <th>Qty</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${data.title} <br><small>by ${data.artist_name}</small></td>
            <td>₹${data.amount}</td>
            <td>1</td>
            <td>₹${subtotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div class="totals">
        <p>Subtotal: ₹${subtotal.toFixed(2)}</p>
        <p>Tax (5%): ₹${tax.toFixed(2)}</p>
        <p><strong>Total Paid: ₹${totalPaid.toFixed(2)}</strong></p>
      </div>
      <div class="payment-method">
        Payment Method: UPI / Card / COD
      </div>
    </div>
    `;

    document.getElementById('receiptModal').style.display = 'flex';
}


// Load orders tab
async function loadOrdersTab(content) {
    await fetchOrders();
    
    const ordersList = document.querySelector('.orders-list');
    ordersList.innerHTML = '';
    
    if (state.orders.length === 0) {
        ordersList.innerHTML = '<p class="no-items">You have no orders yet.</p>';
        return;
    }
    
    state.orders.forEach(order => {
        const orderItem = document.createElement('div');
        orderItem.className = 'order-item';
        
        const statusClass = order.status === 'pending' ? 'pending' : 
                           order.status === 'shipped' ? 'shipped' : 'delivered';
        
        const orderDate = new Date(order.order_date).toLocaleDateString();
        
        orderItem.innerHTML = `
        <div class="order-header">
            <span class="order-id">Order #${order.order_id}</span>
            <span class="order-date">${orderDate}</span>
            <span class="order-status ${statusClass}">${order.status}</span>
        </div>
        <div class="order-details">
            <div class="order-painting">
                <div class="order-painting-image">
                    <img src="${order.image_url || '/placeholder.svg?height=60&width=60'}" alt="${order.title}">
                </div>
                <div class="order-painting-info">
                    <h4>${order.title}</h4>
                    <p class="artist">By ${order.artist_name}</p>
                </div>
            </div>
            <div class="order-total">Total: ₹${order.amount}</div>
           <button class="show-receipt" onclick="showReceipt(${order.order_id})">Show Receipt</button>

        </div>
    `;
    
    ordersList.appendChild(orderItem);
    
    });
}
async function showReceipt(orderId) {
    try {
        const res = await fetch(`/api/orders/receipt/${orderId}`);
        const data = await res.json();
        renderReceipt(data);
    } catch (err) {
        console.error('Error fetching receipt:', err);
        alert('Failed to load receipt.');
    }
}



// Load favorites tab
async function loadFavoritesTab(content) {
    await fetchFavorites();
    
    const favoritesGrid = content.querySelector('.favorites-grid');
    favoritesGrid.innerHTML = '';
    
    if (state.favorites.length === 0) {
        favoritesGrid.innerHTML = '<p class="no-items">You have no favorites yet.</p>';
        return;
    }
    
    state.favorites.forEach(favorite => {
        const favoriteCard = document.createElement('div');
        favoriteCard.className = 'painting-card';
        favoriteCard.innerHTML = `
            <div class="painting-image">
                <img src="${favorite.image_url || '/placeholder.svg?height=200&width=300'}" alt="${favorite.title}">
            </div>
            <div class="painting-info">
                <h3>${favorite.title}</h3>
                <p class="artist">By ${favorite.artist_name}</p>
                <p class="price">₹${favorite.price}</p>
                <p class="size">Size: ${favorite.size}</p>
                <div class="painting-actions">
                    <button class="btn primary-btn add-to-cart-btn">Add to Cart</button>
                    <button class="btn secondary-btn remove-favorite-btn"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        
        // Add event listeners
        favoriteCard.addEventListener('click', (e) => {
            if (!e.target.closest('.painting-actions')) {
                navigateTo('painting', { id: favorite.painting_id });
            }
        });
        
        favoriteCard.querySelector('.add-to-cart-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            addToCart(favorite.painting_id);
        });
        
        favoriteCard.querySelector('.remove-favorite-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromFavorites(favorite.id);
        });
        
        favoritesGrid.appendChild(favoriteCard);
    });
}

// Load auctions tab
async function loadAuctionsTab(content) {

    await fetchAuctions();
    
    const auctionsList = document.querySelector('.auctions-list');
    auctionsList.innerHTML = '';
    const userId = localStorage.getItem('userId');
    // Filter auctions where user is the highest bidder
    const userAuctions = state.auctions.filter(
        auction => Number(auction.highest_bidder) === Number(userId)
      );
      
      
    console.log('All auctions:', state.auctions);
    
    if (userAuctions.length === 0) {
        auctionsList.innerHTML = '<p class="no-items">You are not participating in any auctions.</p>';
        return;
    }
    
    userAuctions.forEach(auction => {
        const auctionItem = document.createElement('div');
        auctionItem.className = 'auction-item';
        
        const endTime = new Date(auction.end_time);
        const now = new Date();
        const timeLeft = endTime - now;
        
        let timeLeftText = '';
        if (timeLeft <= 0) {
            timeLeftText = 'Auction ended';
        } else {
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            if (days > 0) {
                timeLeftText = `${days} days, ${hours} hours left`;
            } else {
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                timeLeftText = `${hours} hours, ${minutes} minutes left`;
            }
        }
        
        auctionItem.innerHTML = `
            <div class="auction-header">
                <span class="auction-title">${auction.title}</span>
                <span class="auction-time-left">${timeLeftText}</span>
            </div>
            <div class="auction-details">
                <div class="auction-painting">
                    <div class="auction-painting-image">
                        <img src="${auction.image_url || '/placeholder.svg?height=60&width=60'}" alt="${auction.title}">
                    </div>
                    <div class="auction-painting-info">
                        <p class="artist">By ${auction.artist_name}</p>
                        <p class="current-bid">Your Bid: ₹${auction.current_bid}</p>
                    </div>
                </div>
                <button class="btn primary-btn bid-again-btn">Bid Again</button>
            </div>
        `;
        
        auctionItem.querySelector('.bid-again-btn').addEventListener('click', () => {
            const bidAmount = prompt(`Current bid is $${auction.current_bid}. Enter your bid amount:`);
            if (bidAmount && !isNaN(bidAmount) && parseFloat(bidAmount) > auction.current_bid) {
                placeBid(auction.auction_id, parseFloat(bidAmount));
            } else if (bidAmount) {
                alert('Bid must be higher than the current bid.');
            }
        });
        
        auctionsList.appendChild(auctionItem);
    });
}

// Load messages tab
async function loadMessagesTab(content) {
    try {
        const response = await fetch(`${API_URL}/messages`, {
            credentials: 'include'
        });
        
        const container = content.querySelector('.client-messages-list') || content.querySelector('.messages-list');
        if (!container) return;
        
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Loading conversation history...</div>';

        if (response.ok) {
            const messages = await response.json();
            container.innerHTML = '';
            
            if (messages.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="padding:40px 20px;">
                        <i class="fas fa-comments"></i>
                        <h3>No Inquiries Yet</h3>
                        <p>Browse the gallery and click <strong>"Inquire / Commission"</strong> on any artwork to connect directly with artists.</p>
                        <button class="btn primary-btn" onclick="navigateTo('paintings')"><i class="fas fa-palette"></i> Explore Gallery</button>
                    </div>
                `;
                return;
            }
            
            messages.forEach(msg => {
                const thread = document.createElement('div');
                thread.className = 'inquiry-thread-card';
                
                const dateStr = new Date(msg.sent_at).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                });

                // Extract tag if present: e.g. "[Custom Commission] message..."
                let tag = 'General Inquiry';
                let cleanText = msg.message;
                const tagMatch = msg.message && msg.message.match(/^\[(.*?)\]\s*(.*)/s);
                if (tagMatch) {
                    tag = tagMatch[1];
                    cleanText = tagMatch[2];
                }

                const artistName = msg.artist_name || 'Studio Artist';
                const initial = artistName.charAt(0).toUpperCase();

                thread.innerHTML = `
                    <div class="inquiry-header">
                        <div class="inquiry-artist-meta">
                            <div class="inquiry-artist-avatar">${initial}</div>
                            <div>
                                <div style="font-weight:600;color:var(--text-primary);font-size:0.95rem;">${escapeHtml(artistName)}</div>
                                <span class="inquiry-tag"><i class="fas fa-tag" style="margin-right:4px;"></i>${escapeHtml(tag)}</span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <button type="button" class="btn ghost-btn open-chat-thread-btn" style="font-size:0.75rem;padding:4px 10px;border-radius:12px;">
                                <i class="fas fa-comments"></i> Live Chatbox
                            </button>
                            <div style="font-size:0.75rem;color:var(--text-muted)"><i class="fas fa-clock" style="margin-right:4px;"></i>${dateStr}</div>
                        </div>
                    </div>
                    <div class="inquiry-body">${escapeHtml(cleanText)}</div>
                    <form class="inquiry-reply-box" data-artist-id="${msg.artist_id}">
                        <input type="text" placeholder="Reply to ${escapeHtml(artistName)}..." required>
                        <button type="submit" class="btn primary-btn" style="padding:8px 16px;font-size:0.85rem;">
                            <i class="fas fa-paper-plane"></i> Reply
                        </button>
                    </form>
                `;

                const chatBtn = thread.querySelector('.open-chat-thread-btn');
                if (chatBtn) {
                    chatBtn.addEventListener('click', () => {
                        openChatModal(msg.artist_id, artistName);
                    });
                }

                thread.querySelector('.inquiry-reply-box').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const replyInput = e.target.querySelector('input');
                    const text = replyInput.value.trim();
                    if (!text) return;
                    
                    try {
                        const replyRes = await fetch(`${API_URL}/messages`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                artist_id: msg.artist_id,
                                message: `[Follow-up] ${text}`
                            }),
                            credentials: 'include'
                        });
                        if (replyRes.ok) {
                            showNotification('Reply delivered to artist!', 'success');
                            loadMessagesTab(content);
                        } else {
                            showNotification('Failed to send reply', 'error');
                        }
                    } catch (err) {
                        showNotification('Network error while sending reply', 'error');
                    }
                });

                container.appendChild(thread);
            });
        } else {
            container.innerHTML = '<p class="no-items">Unable to load messages.</p>';
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
    }
}

// Render favorites
async function renderFavorites() {
    if (!state.user) {
        navigateTo('login');
        return;
    }
    
    await fetchFavorites();
    
    const template = document.getElementById('favorites-template');
    const content = template.content.cloneNode(true);
    
    const favoritesGrid = content.querySelector('.favorites-grid');
    favoritesGrid.innerHTML = '';
    
    if (state.favorites.length === 0) {
        favoritesGrid.innerHTML = '<p class="no-items">You have no favorites yet.</p>';
    } else {
        state.favorites.forEach(favorite => {
            const favoriteCard = document.createElement('div');
            favoriteCard.className = 'painting-card';
            favoriteCard.innerHTML = `
                <div class="painting-image">
                    <img src="${favorite.image_url || '/placeholder.svg?height=200&width=300'}" alt="${favorite.title}">
                </div>
                <div class="painting-info">
                    <h3>${favorite.title}</h3>
                    <p class="artist">By ${favorite.artist_name}</p>
                    <p class="price">₹${favorite.price}</p>
                    <p class="size">Size: ${favorite.size}</p>
                    <div class="painting-actions">
                        <button class="btn primary-btn add-to-cart-btn">Add to Cart</button>
                        <button class="btn secondary-btn remove-favorite-btn"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            
            // Add event listeners
            favoriteCard.addEventListener('click', (e) => {
                if (!e.target.closest('.painting-actions')) {
                    navigateTo('painting', { id: favorite.painting_id });
                }
            });
            
            favoriteCard.querySelector('.add-to-cart-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                addToCart(favorite.painting_id);
            });
            
            favoriteCard.querySelector('.remove-favorite-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                removeFromFavorites(favorite.id);
            });
            
            favoritesGrid.appendChild(favoriteCard);
        });
    }
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Render orders
async function renderOrders() {
    if (!state.user) {
        navigateTo('login');
        return;
    }
    
    await fetchOrders();
    
    const template = document.getElementById('dashboard-template');
    const content = template.content.cloneNode(true);
    
    // Show orders tab
    content.querySelectorAll('.dashboard-tab').forEach(tab => tab.style.display = 'none');
    content.querySelector('#orders-tab').style.display = 'block';
    
    // Set active tab
    content.querySelectorAll('.dashboard-menu a').forEach(link => link.classList.remove('active'));
    content.querySelector('[data-tab="orders"]').classList.add('active');
    
    // Load orders
    loadOrdersTab(content);
    
    app.innerHTML = '';
    app.appendChild(content);
}

// Render auctions
async function renderAuctions() {
    await fetchAuctions();
    
    const template = document.getElementById('auctions-template');
    const content = template.content.cloneNode(true);
    
    const auctionsGrid = content.querySelector('.auctions-grid');
    auctionsGrid.innerHTML = '';
    
    if (state.auctions.length === 0) {
        auctionsGrid.innerHTML = '<p class="no-items">No active auctions at the moment.</p>';
    } else {
        state.auctions.forEach(auction => {
            const auctionCard = createAuctionCard(auction);
            auctionsGrid.appendChild(auctionCard);
        });
    }
    
    app.innerHTML = '';
    app.appendChild(content);
}



