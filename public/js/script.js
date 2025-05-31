document.addEventListener('DOMContentLoaded', function() {
    document.body.classList.add('loaded');
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
    const helpBtn = document.getElementById("help-btn");
    const modal = document.getElementById("report-modal");
    const closeBtn = document.getElementById("close-report");
    const cancelBtn = document.getElementById("cancel-report");
    const submitBtn = document.getElementById("submit-report");
    let selectedFiles = [];
    let isGenerating = false; // Trạng thái AI đang trả lời
    let controller = null; // Để abort fetch nếu cần
    // Lưu trữ ID phiên hội thoại
    let currentSessionId = localStorage.getItem('sessionId'); // Không tạo mới sớm
    let currentUserEmail = null;
    let isLoggedIn = false;

    function safeCapitalize(input) {
        try {
            if (typeof input !== 'string') {
                if (input === null || input === undefined) return '[...]';
                input = String(input);
            }
            input = input.trim();
            if (input.length === 0) return '[...]';

            return input.charAt(0).toUpperCase() + input.slice(1);
        } catch (e) {
            console.warn("Lỗi khi viết hoa tiêu đề:", e);
            return '[...]';
        }
    }

    // Hàm tạo ID phiên ngẫu nhiên
    function generateSessionId(email) {
        return `${email}_${Date.now()}`;
    }
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
        if (!isLoggedIn) {
            showToast("❌ Vui lòng đăng nhập để tải ảnh.");
            return;
        }
        document.getElementById('fileInput').click();
    });
    document.getElementById('uploadFileBtn').addEventListener('click', () => {
        if (!isLoggedIn) {
            showToast("❌ Vui lòng đăng nhập để tải file.");
            return;
        }
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', function (e) {
        const newFiles = Array.from(e.target.files);

        if ((selectedFiles.length + newFiles.length) > 5) {
            alert('❌ Bạn chỉ được chọn tối đa 4 file.');
            e.target.value = ''; // Reset input file
            return;
        }

        selectedFiles = selectedFiles.concat(newFiles);

        updateFileDisplay();
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
            const container = document.createElement('div');
            container.className = 'file-item';

            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.className = 'preview-image';
                enableImageZoom(img);
                container.appendChild(img);
            } else {
                const icon = document.createElement('div');
                icon.className = 'file-icon-container';
                icon.textContent = getFileIcon(file.name);

                const fileName = document.createElement('span');
                fileName.className = 'file-name';
                fileName.textContent = file.name;

                container.appendChild(icon);
                container.appendChild(fileName);
            }
            if (file.type.startsWith('text/') || ['application/json', 'application/xml'].includes(file.type)) {
                const reader = new FileReader();
                reader.onload = () => {
                    const text = document.createElement('pre');
                    text.textContent = reader.result.slice(0, 300) + '...';
                    text.className = 'text-preview';
                    container.appendChild(text);
                };
                reader.readAsText(file);
            }

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-image-btn';
            removeBtn.innerHTML = '✖';
            removeBtn.title = 'Xoá file';
            removeBtn.addEventListener('click', () => {
                const fileToRemove = selectedFiles[index];
                selectedFiles = selectedFiles.filter(f => f !== fileToRemove);
                updateFileDisplay();
            });

            container.appendChild(removeBtn);
            fileDisplay.appendChild(container);
        });

        if (selectedFiles.length === 0 && fileDisplay) {
            fileDisplay.remove();
        }
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();

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
        fetch(`https://thinhlatoi.onrender.com/conversation/${currentSessionId}`)
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
                            if (typeof msg.content === 'string') {
                                // Thử parse nếu là JSON dạng array
                                try {
                                    const parsed = JSON.parse(msg.content);
                                    if (Array.isArray(parsed)) {
                                        msg.content = parsed;
                                    }
                                } catch (e) {
                                    // Không phải JSON, giữ nguyên
                                }
                            }
                            if (Array.isArray(msg.content)) {
                                let messageGroup = document.createElement('div');
                                messageGroup.className = 'message user-message';
                                let contentDiv = document.createElement('div');
                                contentDiv.className = 'message-content user-content';

                                msg.content.forEach(item => {
                                    if (item.type === 'image_url' && item.image_url?.url) {
                                        const img = document.createElement('img');
                                        img.src = item.image_url.url;
                                        img.style.maxWidth = '200px';
                                        img.style.maxHeight = '200px';
                                        img.style.objectFit = 'cover';
                                        img.style.marginBottom = '8px';
                                        img.style.borderRadius = '6px';
                                        enableImageZoom(img);
                                        contentDiv.appendChild(img);
                                    } else if (item.type === 'text') {
                                        const content = item.text.trim();

                                        // Nếu là file dạng 📄, 📎, 📊 thì chỉ hiện icon + tên
                                        if (/^📄|^📎|^📊/.test(content)) {
                                            const match = content.match(/^([📄📎📊]) (.+)$/);
                                            if (match) {
                                                const icon = match[1];
                                                const filename = match[2];

                                                const fileEl = document.createElement('div');
                                                fileEl.className = 'file-item';

                                                const iconDiv = document.createElement('div');
                                                iconDiv.className = 'file-icon-container';
                                                iconDiv.textContent = icon;

                                                const nameDiv = document.createElement('div');
                                                nameDiv.className = 'file-name';
                                                nameDiv.textContent = filename;

                                                fileEl.appendChild(iconDiv);
                                                fileEl.appendChild(nameDiv);
                                                contentDiv.appendChild(fileEl);
                                                return; // 👉 Đảm bảo không rơi xuống đoạn dưới
                                            }
                                        }

                                        // Nếu không phải file dạng đặc biệt, hiển thị nội dung bình thường
                                        const textEl = document.createElement('div');
                                        textEl.textContent = content;
                                        textEl.style.marginTop = '4px';
                                        contentDiv.appendChild(textEl);
                                    }
                                });

                                messageGroup.appendChild(contentDiv);
                                messagesContainer.appendChild(messageGroup);
                            } else if (typeof msg.content === 'string') {
                                addMessage(msg.content, 'user');
                            }
                        }else if (msg.role === 'assistant') {
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
        if (!currentUserEmail) {
            const suppressKey = 'suppressLoginPrompt';
            const lastShown = localStorage.getItem(suppressKey);
            const today = new Date().toISOString().split('T')[0];

            // Nếu hôm nay đã ẩn rồi thì không hiện lại
            if (lastShown !== today) {
                document.getElementById('loginPrompt').classList.remove('hidden');
                return;
            }
        }

        const message = userInput.value.trim();
        if (message === '') return;

        scrollToBottom(true);
        userInput.value = '';
        userInput.style.height = 'auto';
        sendBtn.disabled = !isGenerating;

        // Xóa hiển thị file nếu có
        const fileDisplay = document.getElementById('fileDisplay');
        if (fileDisplay) {
            fileDisplay.remove();
        }

        addMessage({ text: message, files: selectedFiles }, 'user');

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

        fetch('https://thinhlatoi.onrender.com/ask', {
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

                // 👉 Clear toàn bộ message cũ trên giao diện
                messagesContainer.innerHTML = '';

                // 👉 Load lại lịch sử hội thoại từ DB (bao gồm cả message vừa gửi)
                loadConversationHistory();
            });
    }

    function addMessage(content, sender, isHistory = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');

        if (sender === 'user') {
            messageDiv.classList.add('user-message');
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content user-content';

            // 👉 Luôn hiển thị phần text nếu có
            if (typeof content === 'string') {
                const textEl = document.createElement('div');
                textEl.textContent = content;
                contentDiv.appendChild(textEl);
            } else if (typeof content === 'object') {
                if (content.text) {
                    const textEl = document.createElement('div');
                    textEl.textContent = content.text;
                    contentDiv.appendChild(textEl);
                }

                // 👉 Hiển thị file văn bản/ký hiệu nếu có
                content.files?.forEach((file) => {
                    if (!file.type.startsWith('image/')) {
                        const container = document.createElement('div');
                        container.className = 'file-item';

                        const icon = document.createElement('div');
                        icon.className = 'file-icon-container';
                        icon.textContent = getFileIcon(file.name);

                        const name = document.createElement('div');
                        name.className = 'file-name';
                        name.textContent = file.name;

                        container.appendChild(icon);
                        container.appendChild(name);
                        contentDiv.appendChild(container);
                    }
                });

                // 👉 Hiển thị ảnh kèm
                content.files?.forEach((file) => {
                    if (file.type.startsWith('image/')) {
                        const img = document.createElement('img');
                        img.src = URL.createObjectURL(file);
                        img.style.maxWidth = '200px';
                        img.style.maxHeight = '200px';
                        img.style.objectFit = 'cover';
                        img.style.marginBottom = '8px';
                        img.style.borderRadius = '6px';
                        enableImageZoom(img);
                        contentDiv.appendChild(img);
                    }
                });
            }

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
        if (!isLoggedIn) {
            showToast("❌ Bạn cần đăng nhập để dán ảnh.");
            return;
        }
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
        fetch('https://thinhlatoi.onrender.com/api/user', { credentials: 'include' })
            .then(res => res.json())
            .then(user => {
                const newSessionId = generateSessionId(user.email);
                localStorage.setItem('sessionId', newSessionId);
                location.reload();
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
    function enableImageZoom(imgElement) {
        imgElement.style.cursor = 'zoom-in';
        imgElement.addEventListener('click', () => {
            const overlay = document.createElement('div');
            overlay.className = 'image-overlay';

            const zoomedImg = document.createElement('img');
            zoomedImg.src = imgElement.src;

            overlay.appendChild(zoomedImg);
            document.body.appendChild(overlay);

            // Đóng overlay khi click ngoài ảnh
            overlay.addEventListener('click', () => {
                overlay.remove();
            });
        });
    }
    const lastVisit = localStorage.getItem("lastVisit");
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const captchaChecked = localStorage.getItem("captchaChecked");

    if (lastVisit !== today) {
        window.location.href = "splash.html"; // chỉ hiện splash mỗi ngày 1 lần
    } else if (captchaChecked !== today) {
        window.location.href = "captcha.html"; // chỉ hiện CAPTCHA nếu chưa qua
    }

    // Gọi API lấy user (nếu có session)
    fetch('https://thinhlatoi.onrender.com/api/user', { credentials: 'include' })
        .then(res => {
            if (!res.ok) throw new Error('Chưa đăng nhập');
            return res.json();
        })
        .then(user => showUser(user))
        .catch(() => {
            document.getElementById('login-container').style.display = 'block';
        });

    // Sự kiện đăng nhập
    document.getElementById("custom-login-btn").addEventListener("click", () => {
        window.location.href = "https://thinhlatoi.onrender.com/auth/google";
    });

    // Sự kiện đăng xuất
    document.getElementById("logout-btn").addEventListener("click", () => {
        const dropdown = document.getElementById("dropdown");
        dropdown.innerHTML = `<p style="color: #ccc; margin: 0;">Đang đăng xuất...</p>`;
        setTimeout(() => {
            fetch('https://thinhlatoi.onrender.com/api/logout', {
                method: 'POST',
                credentials: 'include'
            }).then(() => location.reload());
        }, 1200);
    });

    document.getElementById("avatar").addEventListener("click", (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById("dropdown");
        dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", () => {
        document.getElementById("dropdown").style.display = "none";
    });

    function showUser(user) {
        isLoggedIn = true;
        document.getElementById("login-container").style.display = "none";
        document.getElementById("user-area").style.display = "flex";
        document.getElementById("avatar").src = user.avatar || user.picture;
        document.getElementById("email").textContent = user.email;
        document.getElementById("dropdown").style.display = "none";

        currentUserEmail = user.email;

        if (!currentSessionId) {
            currentSessionId = generateSessionId(currentUserEmail);
            localStorage.setItem('sessionId', currentSessionId);
        }

        loadConversationMenu(currentUserEmail);
        updateLayout();
        loadConversationHistory(); // ✅ đảm bảo được gọi sau khi gán sessionId đúng
    }

    function loadConversationMenu(email) {
        fetch('https://thinhlatoi.onrender.com/conversation-list', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                const menu = document.querySelector('.menu-content');
                menu.innerHTML = '';

                const groupedByDate = {};

                data.sessions.forEach(sess => {
                    const localDate = new Date(sess.createdAt);
                    const date = localDate.toLocaleDateString('en-CA'); // yyyy-mm-dd

                    if (!groupedByDate[date]) groupedByDate[date] = [];
                    groupedByDate[date].push(sess);
                });

                const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

                sortedDates.forEach(date => {
                    const dateLabel = (new Date(date)).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const dateHeader = document.createElement('div');
                    dateHeader.className = 'menu-date-label';
                    dateHeader.textContent = dateLabel;
                    menu.appendChild(dateHeader);

                    groupedByDate[date].forEach(sess => {
                        const item = document.createElement('div');
                        item.className = 'menu-item';

                        const rawText = sess.customName || sess.preview || '[...]';
                        const labelText = safeCapitalize(rawText);

                        const label = document.createElement('div');
                        label.textContent = labelText;
                        label.className = 'menu-label';
                        label.addEventListener('click', () => {
                            localStorage.setItem('sessionId', sess.id);
                            location.reload();
                        });

                        const moreBtn = document.createElement('button');
                        moreBtn.className = 'more-btn';
                        moreBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis-icon lucide-ellipsis"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>';
                        moreBtn.dataset.sessionId = sess.id;
                        moreBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            showOptionsPopup(sess.id, labelText, moreBtn);
                        });

                        item.appendChild(label);
                        item.appendChild(moreBtn);
                        menu.appendChild(item);
                    });
                });
            })
            .catch(err => console.error('Lỗi khi tải danh sách hội thoại:', err));
    }

    function showOptionsPopup(sessionId, currentName, anchorElement) {
        const existingPopup = document.querySelector('.options-popup');

        // Nếu popup đang hiển thị ở chính anchor này thì đóng
        if (existingPopup && existingPopup.dataset.sessionId === sessionId) {
            existingPopup.remove();
            return;
        }

        // Xoá popup cũ nếu khác anchor
        if (existingPopup) existingPopup.remove();

        // Tạo popup mới
        const popup = document.createElement('div');
        popup.className = 'options-popup';
        popup.dataset.sessionId = sessionId; // Để kiểm tra toggle

        const renameBtn = document.createElement('button');
        renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg> Đổi tên`;
        renameBtn.addEventListener('click', () => {
            popup.remove();
            promptRenameSession(sessionId, currentName);
        });

        const shareBtn = document.createElement('button');
        shareBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-share-icon lucide-share"><path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg> Chia sẻ`;
        shareBtn.addEventListener('click', () => {
            popup.remove();
            shareConversation(sessionId);
        });
        popup.appendChild(shareBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M3 6h18" color="#f15555"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" color="#f15555"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" color="#f15555"/><line x1="10" x2="10" y1="11" y2="17" color="#f15555"/><line x1="14" x2="14" y1="11" y2="17" color="#f15555"/></svg><span style="color: #f15555;">Xoá</span>`;
        deleteBtn.addEventListener('click', () => {
            popup.remove();
            confirmDeleteSession(sessionId);
        });

        popup.appendChild(renameBtn);
        popup.appendChild(deleteBtn);
        document.body.appendChild(popup);

        // Tính toán vị trí hiển thị
        const rect = anchorElement.getBoundingClientRect();
        const popupHeight = popup.offsetHeight;
        const viewportHeight = window.innerHeight;
        const scrollY = window.scrollY;

        // Nếu bị vượt ra ngoài màn hình, hiển thị phía trên
        if (rect.bottom + popupHeight > viewportHeight) {
            popup.style.top = `${rect.top + scrollY - popupHeight}px`;
        } else {
            popup.style.top = `${rect.bottom + scrollY}px`;
        }
        popup.style.left = `${rect.left + window.scrollX}px`;

        // Đóng nếu click ra ngoài
        setTimeout(() => {
            function handleClickOutside(e) {
                if (!popup.contains(e.target) && e.target !== anchorElement) {
                    popup.remove();
                    document.removeEventListener('click', handleClickOutside);
                }
            }
            document.addEventListener('click', handleClickOutside);
        }, 0);
    }

    function shareConversation(sessionId) {
        fetch(`https://thinhlatoi.onrender.com/conversation/${sessionId}/share`, {
            method: 'POST'
        })
            .then(res => res.json())
            .then(data => {
                const shareUrl = `${window.location.origin}/share/${data.shareId}`;
                navigator.clipboard.writeText(shareUrl);

                // ✅ Hiển thị form xác nhận
                showPreviewConfirmModal(shareUrl);
            })
            .catch(err => {
                alert("❌ Không thể tạo liên kết chia sẻ");
                console.error(err);
            });
    }

    function showPreviewConfirmModal(shareUrl) {
        const modal = document.getElementById('preview-modal');
        modal.classList.remove('hidden');

        const yesBtn = document.getElementById('preview-yes');
        const noBtn = document.getElementById('preview-no');

        const close = () => modal.classList.add('hidden');

        yesBtn.onclick = () => {
            close();
            window.open(shareUrl, '_blank');
        };

        noBtn.onclick = () => {
            close();
            showToast("✅ Liên kết đã được sao chép. Bạn có thể chia sẻ ngay!");
        };
    }

    function promptRenameSession(sessionId, currentName) {
        const newName = prompt("Nhập tên mới cho cuộc hội thoại:", currentName);
        if (!newName || newName.trim() === '') return;

        fetch(`https://thinhlatoi.onrender.com/conversation/${sessionId}/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
        })
            .then(res => {
                if (!res.ok) throw new Error('Lỗi đổi tên');
                location.reload();
            })
            .catch(err => alert("❌ Không thể đổi tên: " + err.message));
    }

    function confirmDeleteSession(sessionId) {
        if (!confirm("Bạn có chắc muốn xoá cuộc hội thoại này?")) return;

        fetch(`https://thinhlatoi.onrender.com/conversation/${sessionId}`, {
            method: 'DELETE'
        })
            .then(res => {
                if (!res.ok) throw new Error('Xoá thất bại');
                location.reload();
            })
            .catch(err => alert("❌ Không thể xoá: " + err.message));
    }

    document.getElementById('continueAnyway').addEventListener('click', () => {
        document.getElementById('loginPrompt').classList.add('hidden');

        // Ghi nhớ rằng hôm nay đã ẩn cảnh báo
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem('suppressLoginPrompt', today);
    });

    // Mở modal
    helpBtn?.addEventListener("click", function (e) {
        e.stopPropagation();
        modal.classList.remove("hidden");
    });

    // Đóng modal
    function closeModal() {
        modal.classList.add("hidden");
    }

    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

    // Gửi báo cáo (chỉ demo)
    submitBtn?.addEventListener("click", function () {
        const type = document.getElementById("report-type").value;
        const message = document.getElementById("report-message").value;

        console.log("Đã gửi báo cáo:", type, message);
        alert("Cảm ơn bạn đã phản hồi!");
        closeModal();
    });

    // Click bên ngoài để đóng
    modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
    });

    function onCaptchaSuccess() {
        const today = new Date().toISOString().split("T")[0];
        localStorage.setItem("captchaChecked", today);

        const captchaContainer = document.getElementById("captcha-container");
        if (captchaContainer) {
            captchaContainer.style.display = "none";
        }
    }
});