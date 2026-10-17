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
    const artist = JSON.parse(localStorage.getItem('artist'));
    const artistNameElement = document.getElementById('artistName');
    artistNameElement.textContent=artist.name;
    if (artistNameElement) {
        // Set artist name from session
        const artistName = sessionStorage.getItem('artistName');
        if (artistName) {
            artistNameElement.textContent = artistName;
        }
    }
    
    // Load auctions
    loadAuctions();
    
    // Load available paintings for auction
    loadAvailablePaintings();
    
    // Modal functionality
    const createAuctionBtn = document.getElementById('createAuctionBtn');
    const createAuctionModal = document.getElementById('createAuctionModal');
    const cancelAuctionModal = document.getElementById('cancelAuctionModal');
    const closeModalButtons = document.querySelectorAll('.close-modal, .cancel-modal');
    
    // Open create auction modal
    if (createAuctionBtn) {
        createAuctionBtn.addEventListener('click', function() {
            createAuctionModal.classList.add('active');
        });
    }
    
    // Close modals
    closeModalButtons.forEach(button => {
        button.addEventListener('click', function() {
            createAuctionModal.classList.remove('active');
            cancelAuctionModal.classList.remove('active');
        });
    });
    
    // Create auction form submission
    const createAuctionForm = document.getElementById('createAuctionForm');
    
    if (createAuctionForm) {
        createAuctionForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const auctionData = {
                painting_id: formData.get('painting_id'),
                starting_price: formData.get('starting_price'),
                end_time: formData.get('end_time')
            };
            
            fetch('/api/auctions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(auctionData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    // Close modal and reload auctions
                    createAuctionModal.classList.remove('active');
                    createAuctionForm.reset();
                    loadAuctions();
                }
            })
            .catch(error => {
                console.error('Error creating auction:', error);
                alert('An error occurred. Please try again.');
            });
        });
    }
    
    // Cancel auction confirmation
    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', function() {
            const auctionId = document.getElementById('cancelAuctionId').value;
            
            fetch(`/api/auctions/${auctionId}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    // Close modal and reload auctions
                    cancelAuctionModal.classList.remove('active');
                    loadAuctions();
                }
            })
            .catch(error => {
                console.error('Error canceling auction:', error);
                alert('An error occurred. Please try again.');
            });
        });
    }
    
    // Auction status filter
    const auctionStatusFilter = document.getElementById('auctionStatusFilter');
    
    if (auctionStatusFilter) {
        auctionStatusFilter.addEventListener('change', function() {
            loadAuctions(this.value);
        });
    }
    
    // Function to load auctions
    function loadAuctions(status = 'active') {
        fetch('/api/auctions')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Not authenticated');
                }
                return response.json();
            })
            .then(auctions => {
                const auctionsGrid = document.getElementById('auctionsGrid');
                
                if (auctionsGrid) {
                    // Filter by status if specified
                    if (status !== 'all') {
                        auctions = auctions.filter(auction => auction.status === status);
                    }
                    
                    if (auctions.length === 0) {
                        auctionsGrid.innerHTML = `
                            <div class="empty-state">
                                <p>No auctions found. Create your first auction!</p>
                            </div>
                        `;
                    } else {
                        auctionsGrid.innerHTML = '';
                        
                        auctions.forEach(auction => {
                            const imageUrl = auction.image_url || '/placeholder.svg?height=200&width=300';
                            const formattedStartingPrice = parseFloat(auction.starting_price).toFixed(2);
                            const formattedCurrentBid = parseFloat(auction.current_bid).toFixed(2);
                            
                            // Calculate time remaining
                            const endTime = new Date(auction.end_time);
                            const now = new Date();
                            const timeRemaining = endTime - now;
                            
                            let timeRemainingText = '';
                            let timerClass = '';
                            
                            if (timeRemaining <= 0 || auction.status === 'completed') {
                                timeRemainingText = 'Auction Ended';
                                timerClass = 'ended';
                            } else {
                                const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
                                const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                                
                                if (days > 0) {
                                    timeRemainingText = `${days} days, ${hours} hours remaining`;
                                } else if (hours > 0) {
                                    timeRemainingText = `${hours} hours, ${minutes} minutes remaining`;
                                } else {
                                    timeRemainingText = `${minutes} minutes remaining`;
                                }
                            }
                            
                            auctionsGrid.innerHTML += `
                                <div class="auction-card" data-id="${auction.auction_id}">
                                    <div class="auction-image">
                                        <img src="${imageUrl}" alt="${auction.title}">
                                    </div>
                                    <div class="auction-details">
                                        <h3 class="auction-title">${auction.title}</h3>
                                        <div class="auction-price">
                                            <div>
                                                <span>Starting Price</span>
                                                <strong>₹${formattedStartingPrice}</strong>
                                            </div>
                                            <div>
                                                <span>Current Bid</span>
                                                <strong>₹${formattedCurrentBid}</strong>
                                            </div>
                                        </div>
                                        <div class="auction-timer ${timerClass}">
                                            ${timeRemainingText}
                                        </div>
                                        <div class="auction-status">
                                            <span class="status ${auction.status}">${auction.status}</span>
                                            ${auction.highest_bidder_name ? `<span class="highest-bidder">Highest Bidder: ${auction.highest_bidder_name}</span>` : ''}
                                        </div>
                                        <div class="auction-actions">
                                            ${auction.status === 'active' ? `
                                                <button class="cancel-btn" data-id="${auction.auction_id}">
                                                    <i class="fas fa-times"></i> Cancel Auction
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        });
                        
                        // Add event listeners to cancel buttons
                        document.querySelectorAll('.cancel-btn').forEach(button => {
                            button.addEventListener('click', function() {
                                const auctionId = this.getAttribute('data-id');
                                openCancelModal(auctionId);
                            });
                        });
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
    
    // Function to load available paintings for auction
    function loadAvailablePaintings() {
        fetch('/api/paintings')
            .then(response => response.json())
            .then(paintings => {
                const paintingSelect = document.getElementById('paintingSelect');
                
                if (paintingSelect) {
                    // Clear existing options except the first one
                    while (paintingSelect.options.length > 1) {
                        paintingSelect.remove(1);
                    }
                    
                    // Add paintings as options
                    paintings.forEach(painting => {
                        const option = document.createElement('option');
                        option.value = painting.painting_id;
                        option.textContent = `${painting.title} - ₹${parseFloat(painting.price).toFixed(2)}`;
                        paintingSelect.appendChild(option);
                    });
                }
            })
            .catch(error => {
                console.error('Error loading paintings:', error);
            });
    }
    
    // Function to open cancel auction modal
    function openCancelModal(auctionId) {
        document.getElementById('cancelAuctionId').value = auctionId;
        cancelAuctionModal.classList.add('active');
    }
});