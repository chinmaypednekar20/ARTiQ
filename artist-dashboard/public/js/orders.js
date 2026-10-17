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
    const artist = JSON.parse(localStorage.getItem('artist'));

    artistNameElement.textContent=artist.name;
    if (artistNameElement) {
        // Set artist name from session
        const artistName = sessionStorage.getItem('artistName');
        if (artistName) {
            artistNameElement.textContent = artistName;
        }
    }
    
    // Load orders
    loadOrders();
    
    // Modal functionality
    const updateStatusModal = document.getElementById('updateStatusModal');
    const closeModalButtons = document.querySelectorAll('.close-modal, .cancel-modal');
    
    // Close modals
    closeModalButtons.forEach(button => {
        button.addEventListener('click', function() {
            updateStatusModal.classList.remove('active');
        });
    });
    
    // Update order status form submission
    const updateStatusForm = document.getElementById('updateStatusForm');
    
    if (updateStatusForm) {
        updateStatusForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const orderId = document.getElementById('updateOrderId').value;
            const status = document.getElementById('orderStatus').value;
            
            fetch(`/api/orders/${orderId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    // Close modal and reload orders
                    updateStatusModal.classList.remove('active');
                    loadOrders();
                }
            })
            .catch(error => {
                console.error('Error updating order status:', error);
                alert('An error occurred. Please try again.');
            });
        });
    }
    
    // Order status filter
    const orderStatusFilter = document.getElementById('orderStatusFilter');
    
    if (orderStatusFilter) {
        orderStatusFilter.addEventListener('change', function() {
            loadOrders(this.value);
        });
    }
    
    // Function to load orders
    function loadOrders(status = 'all') {
        fetch('/api/orders')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Not authenticated');
                }
                return response.json();
            })
            .then(orders => {
                const ordersTable = document.getElementById('ordersTable');
                
                if (ordersTable) {
                    // Filter by status if specified
                    if (status !== 'all') {
                        orders = orders.filter(order => order.status === status);
                    }
                    
                    if (orders.length === 0) {
                        ordersTable.innerHTML = `
                            <tr>
                                <td colspan="7" class="text-center">No orders found</td>
                            </tr>
                        `;
                    } else {
                        ordersTable.innerHTML = '';
                        
                        orders.forEach(order => {
                            const date = new Date(order.order_date).toLocaleDateString();
                            const formattedAmount = parseFloat(order.amount).toFixed(2);
                            
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
                            
                            ordersTable.innerHTML += `
                                <tr>
                                    <td>#${order.order_id}</td>
                                    <td>${order.client_name}</td>
                                    <td>${order.painting_title}</td>
                                    <td>₹${formattedAmount}</td>
                                    <td><span class="status ${statusClass}">${order.status}</span></td>
                                    <td>${date}</td>
                                    <td>
                                        <button class="update-status-btn" data-id="${order.order_id}" data-status="${order.status}">
                                            <i class="fas fa-edit"></i> Update Status
                                        </button>
                                    </td>
                                </tr>
                            `;
                        });
                        
                        // Add event listeners to update status buttons
                        document.querySelectorAll('.update-status-btn').forEach(button => {
                            button.addEventListener('click', function() {
                                const orderId = this.getAttribute('data-id');
                                const currentStatus = this.getAttribute('data-status');
                                openUpdateStatusModal(orderId, currentStatus);
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
    
    // Function to open update status modal
    function openUpdateStatusModal(orderId, currentStatus) {
        document.getElementById('updateOrderId').value = orderId;
        document.getElementById('orderStatus').value = currentStatus;
        updateStatusModal.classList.add('active');
    }
});