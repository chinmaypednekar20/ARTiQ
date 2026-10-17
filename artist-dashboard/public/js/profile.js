// ARTiQ Artist Profile Controller
document.addEventListener('DOMContentLoaded', function() {
    const toast = document.getElementById('statusToast');
    
    function showToast(message, type = 'success') {
        if (!toast) return;
        toast.className = `toast-msg ${type}`;
        toast.textContent = message;
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
        }, 4000);
    }

    function renderAvatar(picUrl, name) {
        const box = document.getElementById('profileAvatarBox');
        if (!box) return;
        if (picUrl) {
            box.innerHTML = `<img src="${picUrl}" alt="${name || 'Artist'}">`;
        } else if (name) {
            box.innerHTML = `<span>${name.charAt(0).toUpperCase()}</span>`;
        } else {
            box.innerHTML = `<i class="fas fa-user" style="font-size:3.5rem;color:var(--text-muted)"></i>`;
        }
    }

    // 1. Fetch Profile Info
    fetch('/api/profile')
        .then(res => {
            if (!res.ok) throw new Error('Not authenticated');
            return res.json();
        })
        .then(artist => {
            document.getElementById('name').value = artist.name || '';
            document.getElementById('email').value = artist.email || '';
            document.getElementById('phone').value = artist.phone || '';
            document.getElementById('age').value = artist.age || '';
            if (artist.gender) document.getElementById('gender').value = artist.gender;
            document.getElementById('bio').value = artist.bio || '';
            
            const cardName = document.getElementById('cardArtistName');
            if (cardName) cardName.textContent = artist.name || 'Artist Name';
            
            renderAvatar(artist.profile_pic, artist.name);
        })
        .catch(err => {
            console.error('Failed to load profile:', err);
            showToast('Failed to load profile data', 'error');
        });

    // 2. Profile Photo Upload Handler
    const uploadPicBtn = document.getElementById('uploadPicBtn');
    const profilePicInput = document.getElementById('profilePicInput');

    if (uploadPicBtn && profilePicInput) {
        uploadPicBtn.addEventListener('click', () => profilePicInput.click());

        profilePicInput.addEventListener('change', function() {
            if (!this.files || !this.files[0]) return;
            const file = this.files[0];

            const formData = new FormData();
            formData.append('profile_picture', file);

            uploadPicBtn.disabled = true;
            uploadPicBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            fetch('/api/profile/picture', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                uploadPicBtn.disabled = false;
                uploadPicBtn.innerHTML = '<i class="fas fa-camera" style="margin-right:8px;"></i> Upload Profile Photo';
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast('Profile photo updated successfully!');
                    renderAvatar(data.profile_pic, document.getElementById('name').value);
                    
                    // Update sidebar avatar immediately
                    const sidebarAvatar = document.getElementById('userAvatar');
                    if (sidebarAvatar) {
                        sidebarAvatar.innerHTML = `<img src="${data.profile_pic}" alt="Profile" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
                    }
                }
            })
            .catch(err => {
                uploadPicBtn.disabled = false;
                uploadPicBtn.innerHTML = '<i class="fas fa-camera" style="margin-right:8px;"></i> Upload Profile Photo';
                showToast('Failed to upload image', 'error');
            });
        });
    }

    // 3. Form Submit Handler
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const saveBtn = document.getElementById('saveProfileBtn');
            const originalText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            const payload = {
                name: document.getElementById('name').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                age: parseInt(document.getElementById('age').value, 10),
                gender: document.getElementById('gender').value,
                bio: document.getElementById('bio').value.trim()
            };

            fetch('/api/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(data => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast('Profile settings saved successfully!');
                    sessionStorage.setItem('artistName', payload.name);
                    const nameEl = document.getElementById('artistName');
                    if (nameEl) nameEl.textContent = payload.name;
                    const cardName = document.getElementById('cardArtistName');
                    if (cardName) cardName.textContent = payload.name;
                }
            })
            .catch(err => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
                showToast('Network error while saving profile', 'error');
            });
        });
    }
});
