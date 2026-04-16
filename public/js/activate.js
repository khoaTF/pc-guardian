(function() {
  const form = document.getElementById('activationForm');
  const input = document.getElementById('keyInput');
  const errorBox = document.getElementById('activationError');
  const btn = document.getElementById('activateBtn');
  const deviceIdDisplay = document.getElementById('deviceIdDisplay');

  // Load device ID
  fetch('/api/auth/license')
    .then(r => r.json())
    .then(data => {
      if (data.deviceId) {
        deviceIdDisplay.textContent = data.deviceId;
      }
      
      // Nếu trạng thái đã active thì đẩy về login/dashboard
      if (data.status === 'active' && !data.isExpired) {
        window.location.href = '/login.html';
      }
    })
    .catch(() => {
      deviceIdDisplay.textContent = 'Lỗi kết nối';
    });

  // Xử lý gửi Key
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const key = input.value.trim();
    if (!key) {
      showError('Vui lòng nhập khóa bản quyền.');
      return;
    }

    btn.classList.add('loading');
    btn.textContent = 'Đang kiểm tra...';

    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Kích hoạt thất bại');
        btn.classList.remove('loading');
        btn.textContent = 'Kích Hoạt Ngay';
        return;
      }

      // Kích hoạt thành công
      btn.textContent = '✅ Đã kích hoạt!';
      btn.style.background = 'var(--gradient-success)';
      
      // Xoá hiển thị lỗi
      errorBox.classList.remove('show');

      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1500);

    } catch (err) {
      showError('Không thể kết nối đến máy chủ xác thực.');
      btn.classList.remove('loading');
      btn.textContent = 'Kích Hoạt Ngay';
    }
  });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
    input.style.borderColor = 'var(--accent-red)';

    setTimeout(() => {
      errorBox.classList.remove('show');
      input.style.borderColor = '';
    }, 5000);
  }
})();
