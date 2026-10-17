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
                    localStorage.clear();
                    window.location.href = '/login.html';
                })
                .catch(error => {
                    console.error('Logout error:', error);
                });
        });
    }
    
    const artist = JSON.parse(localStorage.getItem('artist'));
    const artistNameElement = document.getElementById('artistName');
    
    if (artistNameElement) {
        fetch('/api/dashboard')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Not authenticated');
                }
                return response.json();
            })
            .then(data => {
                // Set artist name from session
                const artistName = sessionStorage.getItem('artistName') || data.artistName || (artist && artist.name) || 'Artist';
                artistNameElement.textContent = artistName;
                
                // Set avatar initial
                const userAvatar = document.getElementById('userAvatar');
                if (userAvatar && artistName) {
                    userAvatar.innerHTML = `<span>${artistName.charAt(0).toUpperCase()}</span>`;
                }

                
                // Load dashboard data
                loadDashboardData(data);
            })
            .catch(error => {
                console.error('Error:', error);
                if (error.message === 'Not authenticated') {
                    window.location.href = '/login.html';
                }
     
            });
    }

    
    // Function to load dashboard data
    function loadDashboardData(data) {
        // Update stats
        document.getElementById('totalPaintings').textContent = data.totalPaintings;
        document.getElementById('totalOrders').textContent = data.totalOrders;
        document.getElementById('totalSales').textContent = `₹${parseFloat(data.totalSales).toFixed(2)}`;
        
        // Load recent orders
        const recentOrdersTable = document.getElementById('recentOrdersTable');
        if (recentOrdersTable) {
            if (data.recentOrders.length === 0) {
                recentOrdersTable.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center">No orders found</td>
                    </tr>
                `;
            } else {
                recentOrdersTable.innerHTML = '';
                data.recentOrders.forEach(order => {
                    const date = new Date(order.order_date).toLocaleDateString();
                    
                    let statusClass = '';
                    switch (order.status) {
                        case 'pending':
                            statusClass = 'pending';
                            break;
                        case 'shipped':
                            statusClass = 'shipped';
                            break;
                        case 'delivered':
                            statusClass = 'delivered';
                            break;
                    }
                    
                    recentOrdersTable.innerHTML += `
                        <tr>
                            <td>#${order.order_id}</td>
                            <td>${order.client_name}</td>
                            <td>${order.painting_title}</td>
                            <td>₹${parseFloat(order.amount).toFixed(2)}</td>
                            <td><span class="status ${statusClass}">${order.status}</span></td>
                            <td>${date}</td>
                        </tr>
                    `;
                });
            }
        }
    }
});