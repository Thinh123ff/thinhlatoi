document.addEventListener('DOMContentLoaded', function() {
    const messagesContainer = document.getElementById('messagesContainer');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const clearBtn = document.getElementById('clearBtn');
    const themeToggle = document.getElementById('themeToggle');
    const typingIndicator = document.getElementById('typingIndicator');
    const initialState = document.getElementById('initialState');
    const chatContainer = document.getElementById('chatContainer');
    const menuIcon = document.querySelector('.menu-icon');
    const sideMenu = document.getElementById('sideMenu');
    const overlay = document.getElementById('menuOverlay');
    const uploadBtn = document.getElementById('uploadImageBtn');
    let selectedFiles = [];
    let isGenerating = false; // Trạng thái AI đang trả lời
    let controller = null; // Để abort fetch nếu cần
    // Lưu trữ ID phiên hội thoại
    let currentSessionId = localStorage.getItem('sessionId') || generateSessionId();

    // Hàm tạo ID phiên ngẫu nhiên
    function generateSessionId() {
        const id = 'session_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('sessionId', id);
        return id;
    }

    // Load tin nhắn cũ nếu có
    loadConversationHistory();
    // Load saved theme preference
    loadThemePreference();

    menuIcon.addEventListener('click', () => {
        sideMenu.classList.toggle('open');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
        sideMenu.classList.remove('open');
        overlay.classList.remove('active');
    });

    document.getElementById('uploadImageBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    document.getElementById('uploadFileBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', function (e) {
        const newFiles = Array.from(e.target.files);

        if ((selectedFiles.length + newFiles.length) > 4) {
            alert('❌ Bạn chỉ được chọn tối đa 4 file.');
            e.target.value = ''; // Reset input file
            return;
        }

        selectedFiles = selectedFiles.concat(newFiles);

        updateFileDisplay();

        if (selectedFiles.length > 0) {
            let fileDisplay = document.getElementById('fileDisplay');
            if (!fileDisplay) {
                fileDisplay = document.createElement('div');
                fileDisplay.id = 'fileDisplay';
                fileDisplay.className = 'file-display';
                const inputContainer = document.querySelector('.input-container');
                inputContainer.insertBefore(fileDisplay, inputContainer.firstChild);
            }

            fileDisplay.innerHTML = ''; // Xóa cũ

            selectedFiles.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';

                const icon = document.createElement('div');
                icon.className = 'file-icon-container';
                icon.textContent = getFileIcon(file.name);

                const fileName = document.createElement('span');
                fileName.className = 'file-name';
                fileName.textContent = file.name;

                const removeBtn = document.createElement('span');
                removeBtn.className = 'remove-file';
                removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-x-icon lucide-circle-x"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
                removeBtn.title = 'Xoá file';

                // Sự kiện xoá file
                removeBtn.addEventListener('click', () => {
                    selectedFiles.splice(index, 1); // Xoá file khỏi mảng
                    updateFileDisplay();            // Cập nhật lại giao diện
                });

                fileItem.appendChild(icon);
                fileItem.appendChild(fileName);
                fileItem.appendChild(removeBtn);
                fileDisplay.appendChild(fileItem);
            });
        }
    });

    function updateFileDisplay() {
        let fileDisplay = document.getElementById('fileDisplay');
        if (!fileDisplay) {
            fileDisplay = document.createElement('div');
            fileDisplay.id = 'fileDisplay';
            fileDisplay.className = 'file-display';

            const inputContainer = document.querySelector('.input-container');
            if (inputContainer) {
                inputContainer.insertBefore(fileDisplay, inputContainer.firstChild);
            }
        }

        fileDisplay.innerHTML = '';

        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';

            const icon = document.createElement('div');
            icon.className = 'file-icon-container';

            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.style.width = '40px';
                img.style.height = '40px';
                img.style.objectFit = 'cover';
                img.style.borderRadius = '4px';
                icon.appendChild(img);
            } else {
                icon.textContent = getFileIcon(file.name);
            }

            const fileName = document.createElement('span');
            fileName.className = 'file-name';
            fileName.textContent = file.name;

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-file';
            removeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-x-icon lucide-circle-x"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
            removeBtn.title = 'Xoá file';
            removeBtn.addEventListener('click', () => {
                selectedFiles.splice(index, 1);
                updateFileDisplay();
            });

            fileItem.appendChild(icon);
            fileItem.appendChild(fileName);
            fileItem.appendChild(removeBtn);
            fileDisplay.appendChild(fileItem);
        });

        // Nếu hết file thì xoá luôn khung hiển thị
        if (selectedFiles.length === 0 && fileDisplay) {
            fileDisplay.remove();
        }
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();

        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return '🖼️';
        if (['pdf'].includes(ext)) return '📄';
        if (['doc', 'docx'].includes(ext)) return '📃';
        if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
        if (['ppt', 'pptx'].includes(ext)) return '📽️';
        if (['txt', 'md', 'log'].includes(ext)) return '📑';
        if (['json', 'xml', 'yaml', 'yml'].includes(ext)) return '🧾';
        if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
        if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵';
        if (['mp4', 'mkv', 'avi'].includes(ext)) return '🎞️';
        if (['exe', 'msi'].includes(ext)) return '🧱';
        if (['html', 'css', 'js', 'ts'].includes(ext)) return '💻';
        if (['c', 'cpp', 'java', 'py', 'rb', 'sh'].includes(ext)) return '📄';
        return '📎'; // Mặc định
    }

    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
        sendBtn.disabled = this.value.trim() === '' && !isGenerating;
    });

    // Send message on Enter key (but allow Shift+Enter for new line)
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) {
                sendMessage();
            }
        }
    });

    sendBtn.addEventListener('click', () => {
        if (!isGenerating) {
            sendMessage();
        } else {
            stopResponse();
        }
    });

    clearBtn.addEventListener('click', function () {
        archiveCurrentConversation(); // Lưu và làm mới
    });

// Theme toggle
themeToggle.addEventListener('click', function() {
    document.body.classList.toggle('dark-mode');
    updateThemeIcon();
    saveThemePreference();
});

function saveThemePreference() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
}

function loadThemePreference() {
    const isDarkMode = localStorage.getItem('darkMode');

    // Nếu người dùng đã chọn chế độ tối trước đó, áp dụng nó
    if (isDarkMode === 'true') {
        document.body.classList.add('dark-mode');
    } else if (isDarkMode === 'false') {
        document.body.classList.remove('dark-mode');
    } else {
        // Nếu không có lựa chọn trước đó, kiểm tra tùy chọn hệ thống
        checkSystemPreference();
    }
    updateThemeIcon();
}

function checkSystemPreference() {
    // Kiểm tra xem trình duyệt của người dùng có đặt chế độ tối làm mặc định không
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
    }
}

function updateThemeIcon() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    themeToggle.innerHTML = isDarkMode ?
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>' :
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
}

function updateLayout() {
    if (messagesContainer.children.length === 0) {
        chatContainer.classList.remove('has-messages');
        initialState.style.display = 'flex';
    } else {
        chatContainer.classList.add('has-messages');
        initialState.style.display = 'none';
    }

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Tải lịch sử hội thoại từ server
function loadConversationHistory() {
    fetch(`http://localhost:5000/conversation/${currentSessionId}`)
        .then(res => {
            if (!res.ok) {
                // Nếu không tìm thấy phiên (mã lỗi 404), tạo phiên mới
                if (res.status === 404) {
                    console.log('Không tìm thấy phiên, tạo phiên mới');
                    return { history: [] };
                }
                throw new Error('Lỗi khi tải lịch sử hội thoại');
            }
            return res.json();
        })
        .then(data => {
            if (data.history && data.history.length > 0) {
                // Hiển thị lịch sử tin nhắn
                data.history.forEach(msg => {
                    if (msg.role === 'user') {
                        // Lấy nội dung tin nhắn người dùng
                        let userContent = '';
                        if (typeof msg.content === 'string') {
                            userContent = msg.content;
                        } else if (Array.isArray(msg.content)) {
                            // Lấy phần text từ content nếu là mảng
                            const textItem = msg.content.find(item => item.type === 'text');
                            if (textItem) userContent = textItem.text;
                        }
                        addMessage(userContent, 'user');
                    } else if (msg.role === 'assistant') {
                        addMessage(msg.content, 'ai');
                    }
                });
                updateLayout();
            }
        })
        .catch(err => {
            console.error('Lỗi khi tải lịch sử hội thoại:', err);
        });
}

// ... existing code ...
function sendMessage() {
    const message = userInput.value.trim();
    if (message === '') return;

    addMessage(message, 'user');
    scrollToBottom(true);
    userInput.value = '';
    userInput.style.height = 'auto';
    sendBtn.disabled = !isGenerating;

    // Xóa hiển thị file nếu có
    const fileDisplay = document.getElementById('fileDisplay');
    if (fileDisplay) {
        fileDisplay.remove();
    }

    const formData = new FormData();
    formData.append('message', message);
    formData.append('sessionId', currentSessionId);
    selectedFiles.forEach(file => formData.append('files', file));

    // 👇 Hiện typing indicator
    typingIndicator.style.display = 'flex';
    scrollToBottom(true);

    controller = new AbortController();
    const signal = controller.signal;

    isGenerating = true;
    toggleSendStopButton('stop');

    // Tạo message container cho AI response
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'ai-message');
    const cardDiv = document.createElement('div');
    cardDiv.className = 'ai-card';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    cardDiv.appendChild(contentDiv);
    messageDiv.appendChild(cardDiv);
    messagesContainer.appendChild(messageDiv);

    let fullText = '';

fetch('http://localhost:5000/ask', {
    method: 'POST',
    body: formData,
    signal: signal
})
.then(response => {
    if (!response.ok) {
        return response.json().then(data => {
            showToast(data.reply);
            typingIndicator.style.display = 'none';
            isGenerating = false;
            toggleSendStopButton('send');
            selectedFiles = [];
        });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    function processStream({ done, value }) {
        if (done) {
            return;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.content) {
                        fullText += parsed.content;
                        // Render markdown mỗi lần nhận được text mới
                        contentDiv.innerHTML = '';
                        contentDiv.appendChild(formatMessage(fullText));
                        scrollToBottom(true);
                    }
                } catch (e) {
                    console.error('Error parsing stream data:', e);
                }
            }
        }

        return reader.read().then(processStream);
    }

    return reader.read().then(processStream);
})
    .catch(err => {
        if (err.name === 'AbortError') {
            console.log('Fetch aborted');
        } else {
            console.error('Stream error:', err);
            showToast("" + err.message); // ✅ chỉ hiển thị toast
            messageDiv.remove(); // ✅ Xoá luôn khung chat lỗi nếu cần
        }
    })
    .finally(() => {
        typingIndicator.style.display = 'none';
        isGenerating = false;
        toggleSendStopButton('send');
        selectedFiles = [];
    });
}

function addMessage(content, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');

    if (sender === 'user') {
        messageDiv.classList.add('user-message');
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content user-content';
        contentDiv.textContent = content;
        messageDiv.appendChild(contentDiv);
    } else if (sender === 'ai') {
        messageDiv.classList.add('ai-message');

        const cardDiv = document.createElement('div');
        cardDiv.className = 'ai-card';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.appendChild(formatMessage(content));

        cardDiv.appendChild(contentDiv);
        messageDiv.appendChild(cardDiv);
    }
    messagesContainer.appendChild(messageDiv);
    updateLayout();
}

function formatMessage(text) {
    // Thêm xử lý nếu text là undefined hoặc null
    if (!text) {
        const errorDiv = document.createElement('div');
        errorDiv.textContent = "Không nhận được phản hồi hoàn chỉnh. Vui lòng thử lại.";
        errorDiv.classList.add('error-message');
        return errorDiv;
    }

    try {
        const html = marked.parse(text);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        const codeBlocks = tempDiv.querySelectorAll('pre code');

        codeBlocks.forEach(block => {
            // Highlight
            hljs.highlightElement(block);

            // Nút sao chép
            const copyButton = document.createElement('button');
            copyButton.innerHTML = '<?xml version="1.0" encoding="UTF-8"?><svg width="18px" height="18px" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="#000000"><path d="M19.4 20H9.6C9.26863 20 9 19.7314 9 19.4V9.6C9 9.26863 9.26863 9 9.6 9H19.4C19.7314 9 20 9.26863 20 9.6V19.4C20 19.7314 19.7314 20 19.4 20Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M15 9V4.6C15 4.26863 14.7314 4 14.4 4H4.6C4.26863 4 4 4.26863 4 4.6V14.4C4 14.7314 4.26863 15 4.6 15H9" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
            copyButton.className = 'copy-btn';
            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(block.innerText)
                    .then(() => {
                        copyButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"\n' +
                            '     viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">\n' +
                            '  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />\n' +
                            '</svg>';
                        setTimeout(() => copyButton.innerHTML = '<?xml version="1.0" encoding="UTF-8"?><svg width="18px" height="18px" stroke-width="1.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" color="#000000"><path d="M19.4 20H9.6C9.26863 20 9 19.7314 9 19.4V9.6C9 9.26863 9.26863 9 9.6 9H19.4C19.7314 9 20 9.26863 20 9.6V19.4C20 19.7314 19.7314 20 19.4 20Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M15 9V4.6C15 4.26863 14.7314 4 14.4 4H4.6C4.26863 4 4 4.26863 4 4.6V14.4C4 14.7314 4.26863 15 4.6 15H9" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>', 1500);
                    })
                    .catch(err => {
                        console.error('Copy failed:', err);
                    });
            });

            const pre = block.parentElement;
            pre.style.position = 'relative';
            pre.appendChild(copyButton);
        });

        return tempDiv;
    } catch (error) {
        console.error('Error formatting message:', error);
        const errorDiv = document.createElement('div');
        errorDiv.textContent = "Lỗi khi hiển thị tin nhắn: " + error.message;
        errorDiv.classList.add('error-message');
        return errorDiv;
    }
}

function scrollToBottom(force = false) {
    setTimeout(() => {
        if (force) {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        } else {
        const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 200;
            if (isNearBottom) {
                messagesContainer.scrollTo({
                    top: messagesContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }
    }, 0);
}

// Khởi tạo giao diện
updateLayout();

function toggleSendStopButton(state) {
    const sendIcon = document.getElementById('sendIcon');

    if (state === 'stop') {
        sendBtn.setAttribute('data-state', 'stop');
        sendIcon.innerHTML = `
        <rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect>
    `;
    } else {
        sendBtn.setAttribute('data-state', 'send');
        sendIcon.innerHTML = `
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
    `;
    }
}

function stopResponse() {
    toggleSendStopButton('send');
    isGenerating = false;

    if (controller) {
        try {
            controller.abort();
        } catch (e) {
            console.warn('Không thể abort:', e);
        }
        controller = null;
    }

    typingIndicator.style.display = 'none';

    sendBtn.disabled = userInput.value.trim() === '';
}

    document.addEventListener('paste', async function (event) {
        if (!event.clipboardData || !event.clipboardData.items) return;

        const items = event.clipboardData.items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                if (selectedFiles.length >= 4) {
                    alert('❌ Bạn chỉ được chọn tối đa 4 file.');
                    return;
                }

                // Tạo tên file giả lập
                const fakeFile = new File([blob], `screenshot-${Date.now()}.png`, { type: blob.type });
                selectedFiles.push(fakeFile);
                updateFileDisplay();
            }
        }
    });

// Lắng nghe thay đổi chế độ màu của hệ thống
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        // Chỉ áp dụng thay đổi nếu người dùng chưa tự chọn chế độ
        if (localStorage.getItem('darkMode') === null) {
            if (e.matches) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
            updateThemeIcon();
        }
    });
}

clearBtn.addEventListener('click', function () {
    messagesContainer.innerHTML = '';
    updateLayout();
});
});
function showToast(message, duration = 6000) {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, duration);
}
// Kiểm tra xem người dùng đã chấp nhận cookie chưa
function checkCookieConsent() {
    return localStorage.getItem('cookieConsent');
}
// Lấy giá trị cookie theo tên
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}
// Lưu lựa chọn của người dùng
function saveCookieConsent(consent) {
    localStorage.setItem('cookieConsent', consent);
    document.getElementById('cookie-banner').style.display = 'none';
}
// Thiết lập cookie khi người dùng chấp nhận
function setCookies() {
    const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    // Cookie cơ bản
    document.cookie = "acceptCookies=true; expires=" + expiryDate + "; path=/";
    // Khởi tạo cookie cho lịch sử video đã tải
    if (!getCookie('downloadHistory')) {
        document.cookie = "downloadHistory=[]; expires=" + expiryDate + "; path=/";
    }
    // Khởi tạo cookie cho định dạng tải xuống ưa thích
    document.cookie = "preferredFormat=mp4; expires=" + expiryDate + "; path=/";
    // Khởi tạo cookie cho chất lượng video mặc định
    document.cookie = "preferredQuality=high; expires=" + expiryDate + "; path=/";
    // Cookie theo dõi sử dụng
    const currentUsage = getCookie('usageCount');
    if (currentUsage) {
        document.cookie = "usageCount=" + (parseInt(currentUsage) + 1) + "; expires=" + expiryDate + "; path=/";
    } else {
        document.cookie = "usageCount=1; expires=" + expiryDate + "; path=/";
    }
    // Cookie ghi nhớ thời gian truy cập cuối
    document.cookie = "lastVisit=" + new Date().toString() + "; expires=" + expiryDate + "; path=/";
}
// Tăng số lần sử dụng
function incrementUsageCount() {
    if (checkCookieConsent() === 'accepted') {
        const currentUsage = getCookie('usageCount');
        const newCount = currentUsage ? (parseInt(currentUsage) + 1) : 1;
        const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = "usageCount=" + newCount + "; expires=" + expiryDate + "; path=/";
    }
}
// Xử lý khi người dùng chấp nhận cookie
document.getElementById('accept-cookies').addEventListener('click', function() {
    setCookies();
    saveCookieConsent('accepted');
});
// Xử lý khi người dùng từ chối cookie
document.getElementById('reject-cookies').addEventListener('click', function() {
    saveCookieConsent('rejected');
});
// Hiển thị thông báo cookie nếu người dùng chưa có lựa chọn
window.onload = function() {
    if (!checkCookieConsent()) {
        setTimeout(function() {
            document.getElementById('cookie-banner').style.display = 'flex';
        }, 1000); // Hiển thị sau 1 giây để không xuất hiện ngay lập tức
    } else if (checkCookieConsent() === 'accepted') {
        // Cập nhật thời gian truy cập cuối và tăng số lần sử dụng
        const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
        document.cookie = "lastVisit=" + new Date().toString() + "; expires=" + expiryDate + "; path=/";
        incrementUsageCount();
        // Tải các tùy chọn người dùng từ cookie (nếu có)
        const preferredFormat = getCookie('preferredFormat');
        const preferredQuality = getCookie('preferredQuality');
    }
};
document.getElementById('cookie-banner').style.display = 'flex';