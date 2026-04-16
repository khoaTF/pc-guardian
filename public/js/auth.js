// ===========================
// PC Guardian - Auth Module
// ===========================

(function() {
  const form = document.getElementById('loginForm');
  const input = document.getElementById('passwordInput');
  const errorBox = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const toggleBtn = document.getElementById('togglePassword');
  const hint = document.getElementById('loginHint');

  // Check if already logged in
  const token = localStorage.getItem('pcg_token');
  if (token) {
    // Verify token
    fetch('/api/auth/status', {
      headers: { 'x-auth-token': token }
    }).then(res => {
      if (res.ok) {
        checkLicenseAndRedirect();
      }
    });
  }

  // Check first setup
  fetch('/api/auth/setup-check')
    .then(r => r.json())
    .then(data => {
      if (!data.isSetup) {
        hint.textContent = 'Lần đầu sử dụng - Nhập mật khẩu mới để thiết lập';
        input.placeholder = 'Tạo mật khẩu mới...';
        btn.textContent = 'Thiết lập & Đăng nhập';
      }
    });

  // Toggle password visibility
  toggleBtn.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    toggleBtn.textContent = isPassword ? '🙈' : '👁️';
  });

  // Login form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = input.value.trim();
    if (!password) {
      showError('Vui lòng nhập mật khẩu');
      return;
    }

    btn.classList.add('loading');
    btn.textContent = 'Đang xử lý...';

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Đăng nhập thất bại');
        btn.classList.remove('loading');
        btn.textContent = 'Đăng nhập';
        return;
      }

      // Save token
      localStorage.setItem('pcg_token', data.token);

      // Success animation
      btn.textContent = '✅ Thành công!';
      btn.style.background = 'var(--gradient-success)';

      setTimeout(() => {
        checkLicenseAndRedirect();
      }, 500);

    } catch (err) {
      showError('Không thể kết nối đến server');
      btn.classList.remove('loading');
      btn.textContent = 'Đăng nhập';
    }
  });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
    input.style.borderColor = 'var(--accent-red)';

    setTimeout(() => {
      errorBox.classList.remove('show');
      input.style.borderColor = '';
    }, 3000);
  }

  function checkLicenseAndRedirect() {
    fetch('/api/auth/license')
      .then(r => r.json())
      .then(lic => {
        if (lic.isExpired) {
          window.location.href = '/activate.html';
        } else {
          window.location.href = '/';
        }
      })
      .catch(() => {
        window.location.href = '/';
      });
  }
})();
