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
        userDropdown.innerHTML = `
            <div style="padding:10px 14px 6px;font-size:0.8rem;color:var(--text-muted)">Signed in as</div>
            <div style="padding:0 14px 12px;font-weight:600;color:var(--text-primary);font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${state.user.name}</div>
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

// Create painting card
function createPaintingCard(painting) {
    const imageUrl = painting.image_url || 'https://via.placeholder.com/300x240/161616/c9a84c?text=ARTiQ';
    const card = document.createElement('div');
    card.className = 'painting-card';
    card.innerHTML = `
        <div class="painting-image">
            <img src="${imageUrl}" alt="${escapeHtml(painting.title)}" loading="lazy">
            <span class="category-badge">${escapeHtml(painting.category)}</span>
            <div class="painting-overlay">
                <button class="btn primary-btn add-to-cart-btn" style="font-size:0.8rem;padding:8px 14px">
                    <i class="fas fa-shopping-bag"></i> Add to Cart
                </button>
                <button class="btn ghost-btn favorite-btn" style="font-size:0.8rem;padding:8px 14px">
                    <i class="far fa-heart"></i>
                </button>
            </div>
        </div>
        <div class="painting-info">
            <h3>${escapeHtml(painting.title)}</h3>
            <p class="artist">By <span>${escapeHtml(painting.artist_name)}</span></p>
            <div class="price-row">
                <span class="price">₹${Number(painting.price).toLocaleString('en-IN')}</span>
                <button class="fav-btn" title="Add to favorites"><i class="far fa-heart"></i></button>
            </div>
        </div>
    `;
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.painting-overlay') && !e.target.closest('.fav-btn')) {
            navigateTo('painting', { id: painting.painting_id });
        }
    });
    card.querySelector('.add-to-cart-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        addToCart(painting.painting_id);
    });
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

// Render painting detail
async function renderPaintingDetail(id) {
    const painting = await fetchPaintingById(id);
    
    if (!painting) {
        navigateTo('paintings');
        return;
    }
    
    const template = document.getElementById('painting-detail-template');
    const content = template.content.cloneNode(true);
    
    // Populate painting details
    content.querySelector('#detail-image').src = painting.image_url || '/placeholder.svg?height=400&width=600';
    content.querySelector('#detail-image').alt = painting.title;
    content.querySelector('#detail-title').textContent = painting.title;
    content.querySelector('#detail-artist').textContent = painting.artist_name;
    content.querySelector('#detail-price').textContent = painting.price;
    content.querySelector('#detail-size').textContent = painting.size;
    content.querySelector('#detail-category').textContent = painting.category;
    content.querySelector('#detail-description').textContent = painting.description || 'No description available.';
    
    // Add event listeners
    content.querySelector('#add-to-cart').addEventListener('click', () => {
        addToCart(painting.painting_id);
    });
    
    content.querySelector('#add-to-favorites').addEventListener('click', () => {
        addToFavorites(painting.painting_id);
    });
    
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
                <p class="price">₹${item.price}</p>
            </div>
        `;
        
        orderItems.appendChild(orderItem);
    });
    
    // Update subtotal and total
    content.querySelector('#checkout-subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    content.querySelector('#checkout-total').textContent = `₹${(subtotal + 25).toFixed(2)}`;
    
    // Form submission
    content.querySelector('#shipping-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createOrder();
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
        
        console.log(email, password);
        
        
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
                showNotification('Login successful!');
            } else {
                const data = await response.json();
                showNotification(data.message, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showNotification('Login failed', 'error');
        }
    });
    
    app.innerHTML = '';
    app.appendChild(content);
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
    content.querySelector('#profile-name').value = state.user.name;
    content.querySelector('#profile-email').value = state.user.email;
    content.querySelector('#profile-phone').value = state.user.phone;
    content.querySelector('#profile-age').value = state.user.age;
    content.querySelector('#profile-gender').value = state.user.gender;

    // Inject content into the DOM
    app.innerHTML = '';
    app.appendChild(content);

    // Now use document.querySelector to access DOM elements
    const tabLinks = document.querySelectorAll('.dashboard-menu a');
    const tabs = document.querySelectorAll('.dashboard-tab');

    // Handle profile form submission
    const profileForm = document.querySelector('#profile-form');
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const profileData = {
            name: document.querySelector('#profile-name').value,
            phone: document.querySelector('#profile-phone').value,
            age: document.querySelector('#profile-age').value,
            gender: document.querySelector('#profile-gender').value
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
        
        if (response.ok) {
            const messages = await response.json();
            
            const messagesList = content.querySelector('.messages-list');
            messagesList.innerHTML = '';
            
            if (messages.length === 0) {
                messagesList.innerHTML = '<p class="no-items">You have no messages.</p>';
                return;
            }
            
            messages.forEach(message => {
                const messageItem = document.createElement('div');
                messageItem.className = 'message-item';
                
                const messageDate = new Date(message.sent_at).toLocaleString();
                
                messageItem.innerHTML = `
                    <div class="message-header">
                        <span class="message-sender">${message.sender_name}</span>
                        <span class="message-date">${messageDate}</span>
                    </div>
                    <div class="message-content">
                        <p>${message.message}</p>
                    </div>
                `;
                
                messagesList.appendChild(messageItem);
            });
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
    console.log(id);
    
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

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Add notification styles
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 4px;
        color: #fff;
        font-weight: 500;
        z-index: 1000;
        transform: translateX(120%);
        transition: transform 0.3s ease;
        max-width: 300px;
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification.success {
        background-color: #4caf50;
    }
    
    .notification.error {
        background-color: #f44336;
    }
`;

document.head.appendChild(notificationStyles);


