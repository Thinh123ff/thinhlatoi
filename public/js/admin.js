async function grantAccess() {
    const email = document.getElementById("emailInput").value;
    const verifyPassword = document.getElementById("verifyPasswordInput").value;

    const res = await fetch('https://thinhlatoi.onrender.com/admin/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            verifyPassword
        })
    });

    const data = await res.json();
    if (data.success) {
        alert('✅ Đã bật quyền cho tài khoản: ' + email);
    } else {
        alert('❌ Lỗi: ' + (data.error || 'Không xác định'));
    }
}
async function resetAccess() {
    const email = document.getElementById("emailInput").value;
    const verifyPassword = document.getElementById("verifyPasswordInput").value;

    const res = await fetch('https://thinhlatoi.onrender.com/admin/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, verifyPassword, reset: true })
    });

    const data = await res.json();
    if (data.success) {
        alert('🧹 Đã reset quyền về mặc định cho: ' + email);
    } else {
        alert('❌ ' + (data.error || 'Lỗi không xác định'));
    }
}
async function blockAccess() {
    const email = document.getElementById("emailInput").value;
    const verifyPassword = document.getElementById("verifyPasswordInput").value;

    const res = await fetch('https://thinhlatoi.onrender.com/admin/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, verifyPassword, block: true })
    });

    const data = await res.json();
    if (data.success) {
        alert('🚫 Đã chặn quyền: ' + email);
    } else {
        alert('❌ ' + (data.error || 'Lỗi không xác định'));
    }
}
async function showLoginLogs() {
    const verifyPassword = document.getElementById("verifyPasswordInput").value;
    const res = await fetch(`https://thinhlatoi.onrender.com/admin/login-logs?verifyPassword=${encodeURIComponent(verifyPassword)}`);
    const data = await res.json();

    if (data.error) {
        alert('❌ ' + data.error);
        return;
    }

    const logDiv = document.getElementById("loginLogs");
    logDiv.innerHTML = '<h3>Danh sách đăng nhập:</h3><ul>' +
        data.logs.map(l => `<li>${l.email} — quyền: ${l.dailyLimit} câu/ngày — đăng nhập lúc: ${new Date(l.latestLogin).toLocaleString()}</li>`).join('') +
        '</ul>';
}
async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('error');

    try {
        const response = await fetch('/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            document.getElementById('login-form').classList.add('hidden');
            document.querySelector('.admin-content').classList.add('active');
        } else {
            errorEl.textContent = result.error || 'Đăng nhập thất bại';
        }
    } catch (err) {
        errorEl.textContent = 'Lỗi kết nối server';
    }
}