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
    
    // Load paintings
    loadPaintings();
    
    // Modal functionality
    const addPaintingBtn = document.getElementById('addPaintingBtn');
    const addPaintingModal = document.getElementById('addPaintingModal');
    const editPaintingModal = document.getElementById('editPaintingModal');
    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    const closeModalButtons = document.querySelectorAll('.close-modal, .cancel-modal');
    
    // Open add painting modal
    if (addPaintingBtn) {
        addPaintingBtn.addEventListener('click', function() {
            addPaintingModal.classList.add('active');
        });
    }
    
    // Close modals
    closeModalButtons.forEach(button => {
        button.addEventListener('click', function() {
            addPaintingModal.classList.remove('active');
            editPaintingModal.classList.remove('active');
            deleteConfirmModal.classList.remove('active');
        });
    });
    
    // Image preview for add painting
    const imageInput = document.getElementById('image');
    const imagePreview = document.getElementById('imagePreview');
    
    if (imageInput) {
        imageInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            } else {
                imagePreview.innerHTML = '';
            }
        });
    }
    
    // Image preview for edit painting
    const editImageInput = document.getElementById('editImage');
    const editImagePreview = document.getElementById('editImagePreview');
    
    if (editImageInput) {
        editImageInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    editImagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Add painting form submission
    const addPaintingForm = document.getElementById('addPaintingForm');
    
    if (addPaintingForm) {
        addPaintingForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            
            fetch('/api/paintings', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    // Close modal and reload paintings
                    addPaintingModal.classList.remove('active');
                    addPaintingForm.reset();
                    imagePreview.innerHTML = '';
                    loadPaintings();
                }
            })
            .catch(error => {
                console.error('Error adding painting:', error);
                alert('An error occurred. Please try again.');
            });
        });
    }
    
    // Edit painting form submission
    const editPaintingForm = document.getElementById('editPaintingForm');
    
    if (editPaintingForm) {
        editPaintingForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const paintingId = document.getElementById('editPaintingId').value;
            
            fetch(`/api/paintings/${paintingId}`, {
                method: 'PUT',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    // Close modal and reload paintings
                    editPaintingModal.classList.remove('active');
                    editPaintingForm.reset();
                    editImagePreview.innerHTML = '';
                    loadPaintings();
                }
            })
            .catch(error => {
                console.error('Error updating painting:', error);
                alert('An error occurred. Please try again.');
            });
        });
    }
    
    // Delete painting confirmation
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', function() {
            const paintingId = document.getElementById('deletePaintingId').value;
            
            fetch(`/api/paintings/${paintingId}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    // Close modal and reload paintings
                    deleteConfirmModal.classList.remove('active');
                    loadPaintings();
                }
            })
            .catch(error => {
                console.error('Error deleting painting:', error);
                alert('An error occurred. Please try again.');
            });
        });
    }
    
    // Category filter
    const categoryFilter = document.getElementById('categoryFilter');
    
    if (categoryFilter) {
        categoryFilter.addEventListener('change', function() {
            loadPaintings(this.value);
        });
    }
    
    // Function to load paintings
    function loadPaintings(category = '') {
        fetch('/api/paintings')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Not authenticated');
                }
                return response.json();
            })
            .then(paintings => {
                const paintingsGrid = document.getElementById('paintingsGrid');
                
                if (paintingsGrid) {
                    // Filter by category if specified
                    if (category) {
                        paintings = paintings.filter(painting => painting.category === category);
                    }
                    
                    if (paintings.length === 0) {
                        paintingsGrid.innerHTML = `
                            <div class="empty-state">
                                <p>No paintings found. Add your first painting!</p>
                            </div>
                        `;
                    } else {
                        paintingsGrid.innerHTML = '';
                        
                        paintings.forEach(painting => {
                            const imageUrl = painting.image_url || '/placeholder.svg?height=200&width=300';
                            const formattedPrice = parseFloat(painting.price).toFixed(2);
                            const isSoldBadge = painting.is_sold == 1 
                                ? `<span style="position:absolute;top:12px;right:12px;background:rgba(239,68,68,0.92);color:#ffffff;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;letter-spacing:1px;box-shadow:0 4px 12px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);"><i class="fas fa-check-circle"></i> SOLD</span>` 
                                : '';
                            
                            paintingsGrid.innerHTML += `
                                <div class="painting-card" data-id="${painting.painting_id}">
                                    <div class="painting-image" style="position:relative;">
                                        ${isSoldBadge}
                                        <img src="${imageUrl}" alt="${painting.title}">
                                    </div>
                                    <div class="painting-details">
                                        <h3 class="painting-title">${painting.title}</h3>
                                        <div class="painting-price">₹${formattedPrice}</div>
                                        <div class="painting-category">${painting.category}</div>
                                        <div class="painting-actions">
                                            <button class="edit-btn" data-id="${painting.painting_id}">
                                                <i class="fas fa-edit"></i> Edit
                                            </button>
                                            <button class="delete-btn" data-id="${painting.painting_id}">
                                                <i class="fas fa-trash"></i> Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        });
                        
                        // Add event listeners to edit buttons
                        document.querySelectorAll('.edit-btn').forEach(button => {
                            button.addEventListener('click', function() {
                                const paintingId = this.getAttribute('data-id');
                                openEditModal(paintingId, paintings);
                            });
                        });
                        
                        // Add event listeners to delete buttons
                        document.querySelectorAll('.delete-btn').forEach(button => {
                            button.addEventListener('click', function() {
                                const paintingId = this.getAttribute('data-id');
                                openDeleteModal(paintingId);
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
    
    // Function to open edit modal
    function openEditModal(paintingId, paintings) {
        const painting = paintings.find(p => p.painting_id == paintingId);
        
        if (painting) {
            document.getElementById('editPaintingId').value = painting.painting_id;
            document.getElementById('editTitle').value = painting.title;
            document.getElementById('editDescription').value = painting.description || '';
            document.getElementById('editPrice').value = painting.price;
            document.getElementById('editCategory').value = painting.category;
            
            // Show current image
            if (painting.image_url) {
                editImagePreview.innerHTML = `<img src="${painting.image_url}" alt="Current Image">`;
            } else {
                editImagePreview.innerHTML = '';
            }
            
            editPaintingModal.classList.add('active');
        }
    }
    
    // Function to open delete modal
    function openDeleteModal(paintingId) {
        document.getElementById('deletePaintingId').value = paintingId;
        deleteConfirmModal.classList.add('active');
    }
});