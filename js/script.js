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
                removeBtn.innerHTML = '❌';
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
        const fileDisplay = document.getElementById('fileDisplay');
        if (!fileDisplay) return;

        fileDisplay.innerHTML = '';

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
            removeBtn.innerHTML = '❌';
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
    fetch(`https://chat-bot-server-foxw.onrender.com/conversation/${currentSessionId}`)
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
    scrollToBottom(true); // 👈 đảm bảo kéo xuống để thấy "3 chấm"

    controller = new AbortController();
    const signal = controller.signal;

    isGenerating = true;
    toggleSendStopButton('stop');

    fetch('https://chat-bot-server-foxw.onrender.com/ask', {
        method: 'POST',
        body: formData,
        signal: signal
    })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error! Status: ${res.status}`);
            }
            return res.json();
        })
        .then(data => {
            addMessage(data.reply, 'ai');
            scrollToBottom(true); // 👈 Cuộn khi nhận phản hồi
            if (data.sessionId) {
                currentSessionId = data.sessionId;
                localStorage.setItem('sessionId', currentSessionId);
            }
            selectedFiles = [];
        })
        .catch(err => {
            addMessage("Lỗi server: " + err.message, 'ai');
            console.error(err);
        })
        .finally(() => {
            // 👇 Ẩn typing indicator khi xong
            typingIndicator.style.display = 'none';
            isGenerating = false;
            toggleSendStopButton('send');
        });

    console.log("Gửi tin nhắn, chuẩn bị hiện 3 chấm");
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
        const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 200;
        if (force || isNearBottom) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
function disableUploadButton() {
    uploadBtn.classList.add('disabled');
    uploadBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };
}
disableUploadButton();

function archiveCurrentConversation() {
    const allChats = JSON.parse(localStorage.getItem('savedConversations') || '[]');
    const htmlContent = messagesContainer.innerHTML;
    if (!htmlContent.trim()) return;

    const title = messagesContainer.querySelector('.user-message .message-content')?.textContent?.slice(0, 30) || 'Cuộc trò chuyện';

    allChats.push({
        id: currentSessionId,
        title: title + '...',
        content: htmlContent,
        isActive: false
    });

    localStorage.setItem('savedConversations', JSON.stringify(allChats));
    messagesContainer.innerHTML = '';
    currentSessionId = generateSessionId();
    localStorage.setItem('sessionId', currentSessionId);
    updateLayout();
    renderSavedConversations();
}

function loadConversationFromMenu(sessionId) {
    const allChats = JSON.parse(localStorage.getItem('savedConversations') || '[]');

    // Lưu lại cuộc trò chuyện hiện tại trước khi chuyển
    const htmlContent = messagesContainer.innerHTML;
    if (htmlContent.trim()) {
        const existing = allChats.find(c => c.id === currentSessionId);
        if (existing) {
            existing.content = htmlContent;
        } else {
            allChats.push({
                id: currentSessionId,
                title: 'Cuộc trò chuyện chưa đặt tên...',
                content: htmlContent,
                isActive: false
            });
        }
    }

    const selected = allChats.find(c => c.id === sessionId);
    if (selected) {
        messagesContainer.innerHTML = selected.content;
        currentSessionId = selected.id;
        localStorage.setItem('sessionId', currentSessionId);
    }

    localStorage.setItem('savedConversations', JSON.stringify(allChats));
    renderSavedConversations();
    updateLayout();
}

function renderSavedConversations() {
    const menuContent = document.querySelector('.menu-content');
    if (!menuContent) return;
    menuContent.innerHTML = '';

    const allChats = JSON.parse(localStorage.getItem('savedConversations') || '[]');
    allChats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.textContent = chat.title;
        item.onclick = () => loadConversationFromMenu(chat.id);
        menuContent.appendChild(item);
    });
}

// Gọi ngay khi load
renderSavedConversations();
});