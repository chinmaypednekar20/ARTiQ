document.addEventListener('DOMContentLoaded', function() {
    // Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorMessage = document.getElementById('errorMessage');
            
            if (!email || !password) {
                errorMessage.textContent = 'Please fill in all fields';
                return;
            }
            
            fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    errorMessage.textContent = data.error;
                } else {
                    // ✅ Store user info in localStorage
                    localStorage.setItem('artist', JSON.stringify(data.artist));
                    
                    // e.g., { name: "John", user_id: 1 }

                    // ✅ Redirect to dashboard
                    window.location.href = '/dashboard';
                }
            })
            .catch(error => {
                console.error('Login error:', error);
                errorMessage.textContent = 'An error occurred. Please try again.';
            });
        });
    }
    
    // Register Form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const age = document.getElementById('age').value;
            const gender = document.getElementById('gender').value;
            const phone = document.getElementById('phone').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const errorMessage = document.getElementById('errorMessage');
            
            // Validate form
            if (!name || !age || !gender || !phone || !email || !password || !confirmPassword) {
                errorMessage.textContent = 'Please fill in all fields';
                return;
            }
            
            if (password !== confirmPassword) {
                errorMessage.textContent = 'Passwords do not match';
                return;
            }
            
            // Send register request
            fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, age, gender, phone, email, password })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    errorMessage.textContent = data.error;
                } else {
                    // Redirect to login page
                    window.location.href = '/login.html?registered=true';
                }
            })
            .catch(error => {
                console.error('Registration error:', error);
                errorMessage.textContent = 'An error occurred. Please try again.';
            });
        });
    }
    
    // Check if user just registered
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('registered') === 'true' && loginForm) {
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = 'Registration successful! Please login.';
        errorMessage.style.color = '#28a745';
    }

    // ============ Google OAuth Handler ============
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', function() {
            // Simulated / Token-Ready Google OAuth popup flow
            const emailPrompt = prompt('Enter your Google account email to sign in to ARTiQ Studio:', 'artist.studio@gmail.com');
            if (!emailPrompt) return;
            const googleName = emailPrompt.split('@')[0].replace(/[._]/g, ' ').toUpperCase();

            googleLoginBtn.disabled = true;
            googleLoginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating with Google...';

            fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailPrompt.trim(),
                    name: googleName,
                    google_id: 'goog_' + Date.now()
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.artist) {
                    localStorage.setItem('artist', JSON.stringify(data.artist));
                    window.location.href = '/dashboard';
                } else {
                    alert(data.error || 'Google authentication failed');
                    googleLoginBtn.disabled = false;
                    googleLoginBtn.innerHTML = 'Continue with Google';
                }
            })
            .catch(err => {
                console.error('Google auth error:', err);
                alert('Network error connecting to Google Auth.');
                googleLoginBtn.disabled = false;
                googleLoginBtn.innerHTML = 'Continue with Google';
            });
        });
    }

    // ============ Forgot Password Flow ============
    const forgotLink = document.getElementById('forgotPasswordLink');
    const forgotModal = document.getElementById('forgotModal');
    const closeForgot = document.getElementById('closeForgotModal');
    const forgotReqForm = document.getElementById('forgotRequestForm');
    const forgotResetForm = document.getElementById('forgotResetForm');
    const forgotStatus = document.getElementById('forgotStatusMsg');

    if (forgotLink && forgotModal) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            forgotModal.style.display = 'flex';
            if (forgotStatus) forgotStatus.textContent = '';
        });

        if (closeForgot) {
            closeForgot.addEventListener('click', () => {
                forgotModal.style.display = 'none';
            });
        }

        if (forgotReqForm) {
            forgotReqForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const email = document.getElementById('forgotEmail').value.trim();
                const sendBtn = document.getElementById('sendCodeBtn');
                sendBtn.disabled = true;
                sendBtn.textContent = 'Generating code...';

                fetch('/api/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                })
                .then(r => r.json())
                .then(data => {
                    sendBtn.disabled = false;
                    sendBtn.textContent = 'Send Verification Code';
                    if (data.resetCode) {
                        forgotStatus.style.color = '#10b981';
                        forgotStatus.innerHTML = `Verification code sent! (Dev verification code: <strong>${data.resetCode}</strong>)`;
                        forgotReqForm.style.display = 'none';
                        forgotResetForm.style.display = 'block';
                        document.getElementById('resetTokenInput').value = data.resetCode;
                    } else {
                        forgotStatus.style.color = '#ef4444';
                        forgotStatus.textContent = data.error || 'Failed to process request';
                    }
                })
                .catch(err => {
                    sendBtn.disabled = false;
                    sendBtn.textContent = 'Send Verification Code';
                    forgotStatus.style.color = '#ef4444';
                    forgotStatus.textContent = 'Network error while requesting reset.';
                });
            });
        }

        if (forgotResetForm) {
            forgotResetForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const email = document.getElementById('forgotEmail').value.trim();
                const token = document.getElementById('resetTokenInput').value.trim();
                const newPassword = document.getElementById('resetNewPass').value;
                const confirmBtn = document.getElementById('confirmResetBtn');

                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Updating...';

                fetch('/api/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, token, newPassword })
                })
                .then(r => r.json())
                .then(data => {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Update Password';
                    if (data.message && !data.error) {
                        forgotStatus.style.color = '#10b981';
                        forgotStatus.textContent = data.message;
                        setTimeout(() => {
                            forgotModal.style.display = 'none';
                            forgotResetForm.reset();
                            forgotReqForm.style.display = 'block';
                            forgotResetForm.style.display = 'none';
                        }, 1800);
                    } else {
                        forgotStatus.style.color = '#ef4444';
                        forgotStatus.textContent = data.error || 'Reset failed';
                    }
                })
                .catch(err => {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Update Password';
                    forgotStatus.style.color = '#ef4444';
                    forgotStatus.textContent = 'Network error resetting password.';
                });
            });
        }
    }
});