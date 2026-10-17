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
});