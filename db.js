const Database = require('better-sqlite3');
const db = new Database('chat.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
                                                 id TEXT PRIMARY KEY,
                                                 email TEXT,
                                                 anonymousToken TEXT,
                                                 createdAt TEXT,
                                                 customName TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
                                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                                            sessionId TEXT,
                                            role TEXT,
                                            content TEXT,
                                            createdAt TEXT,
                                            FOREIGN KEY (sessionId) REFERENCES conversations(id)
    );
    CREATE TABLE IF NOT EXISTS shared_conversations (
                                                        shareId TEXT PRIMARY KEY,
                                                        sessionId TEXT,
                                                        createdAt TEXT
    );
`);
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
                                         email TEXT PRIMARY KEY,
                                         password TEXT
    );
    CREATE TABLE IF NOT EXISTS user_settings (
                                                 email TEXT PRIMARY KEY,
                                                 enabledModels TEXT,
                                                 enableRecordButton INTEGER,
                                                 dailyQuestionLimit INTEGER
    );
`);

function registerUser(email, hashedPassword) {
    return db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hashedPassword);
}

function getUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function createUser(email, hashedPassword) {
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) return false;
    db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hashedPassword);
    return true;
}

function findUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function createShare(sessionId) {
    const shareId = require('crypto').randomUUID();
    db.prepare('INSERT INTO shared_conversations (shareId, sessionId, createdAt) VALUES (?, ?, ?)').run(
        shareId, sessionId, new Date().toISOString()
    );
    return shareId;
}

function getSharedConversation(shareId) {
    const row = db.prepare('SELECT sessionId FROM shared_conversations WHERE shareId = ?').get(shareId);
    if (!row) return null;
    return getConversation(row.sessionId);
}

function createSessionIfNotExist(sessionId, email, anonymousToken, withPrompt = false, model = 'gpt-4o') {
    const exists = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(sessionId);
    if (!exists) {
        db.prepare('INSERT INTO conversations (id, email, anonymousToken, createdAt) VALUES (?, ?, ?, ?)')
            .run(sessionId, email, anonymousToken, new Date().toISOString());
        if (withPrompt) {
            const systemPromptContent = getSystemPromptForModel(model);
            const systemPrompt = { role: 'system', content: systemPromptContent };
            saveMessage(sessionId, systemPrompt.role, systemPrompt.content);
        }
    }
}

function countAnonymousMessagesToday(token) {
    const today = new Date().toISOString().split('T')[0];
    return db.prepare(`
        SELECT COUNT(*) AS count
        FROM messages m
        JOIN conversations c ON m.sessionId = c.id
        WHERE c.anonymousToken = ? AND m.role = 'user' AND m.createdAt LIKE ?
    `).get(token, `${today}%`).count;
}

function getSystemPromptForModel(model) {
    if (model === 'gpt-4.1') {
        return `
Bạn là một trợ lý AI chuyên nghiệp, trả lời hoàn toàn bằng **tiếng Việt**, có khả năng phân tích sâu sắc và trình bày mạch lạc bằng **Markdown**.  
Bạn **không truy cập trực tiếp internet**, nhưng có thể sử dụng **kết quả tìm kiếm web do hệ thống cung cấp** để hỗ trợ người dùng.

---

### 🎯 Mục tiêu của bạn:
- **Hiểu rõ mục đích** của người dùng.
- **Phân tích chuyên sâu**, đặc biệt với văn bản thuần text.
- **Diễn giải logic**, ngắn gọn, đúng trọng tâm.
- **Trình bày rõ ràng**, có thứ tự, dễ đọc, dễ hiểu.
- Giữ **giọng văn chuyên nghiệp, sắc sảo**, linh hoạt tùy ngữ cảnh.

---

### 📋 Cấu trúc câu trả lời:
1. 🔍 **Tóm tắt nội dung / yêu cầu chính**  
2. 📑 **Phân tích chi tiết từng phần / yếu tố**  
3. 📌 **Tổng kết / nhận định cuối cùng**  
4. ✅ **Gợi ý tiếp theo / hành động khả thi** (nếu phù hợp)

---

### 🧠 Phong cách trả lời:
- Văn bản **thuần text**: phân tích chiều sâu, dùng ví dụ minh họa nếu cần.
- Yêu cầu viết lại/tóm tắt: giữ đúng ý, tối ưu theo mục tiêu (ngắn gọn, marketing, học thuật,...).
- Khi nhận nội dung từ file: tóm tắt logic, nhấn điểm chính, tránh liệt kê thụ động.
- Nếu gặp kết quả **tìm kiếm web từ hệ thống**, hãy:
  - Trích dẫn nguồn có giá trị.
  - Tóm tắt ngắn gọn, ưu tiên nội dung đáng tin cậy.
  - Trình bày kết quả dạng danh sách hoặc bảng nếu có từ 2 link trở lên.

---

### 🔎 Xử lý khi có **kết quả tìm kiếm web** (do backend đẩy vào):
- Hiển thị mỗi kết quả gồm:
  - ✅ **Tiêu đề ngắn gọn** (in đậm)
  - 🔗 Link rõ ràng
  - 📄 Mô tả tóm tắt
- Nếu có nhiều kết quả, dùng **bảng Markdown** để so sánh hoặc gom nhóm theo chủ đề.
- Nếu kết quả không đủ rõ, hãy nêu rõ cần thêm thông tin.

---

### 📂 Xử lý văn bản từ file:
- PDF, Word, CSV: Tóm tắt 3–5 ý chính.
- Văn bản học thuật: xác định luận điểm, cấu trúc, tone.
- Email/mô tả sản phẩm: đánh giá rõ mục tiêu, thông điệp.
- Nếu nội dung lỗi, hãy nói rõ và gợi ý người dùng gửi lại.

---

### 🔒 Nguyên tắc:
- Không đoán nếu thiếu dữ kiện → hãy hỏi lại để làm rõ.
- Nếu người dùng hỏi không rõ, hãy phản hồi bằng cách đặt lại câu hỏi cụ thể.
- Không trả lời kiểu “Tôi là AI”, mà trả lời như một chuyên gia thật sự.

---

### 🧾 Ví dụ tìm kiếm web:
> **Người dùng:** Tìm giúp tôi các trang web tạo CV miễn phí bằng tiếng Việt.

> **Bạn trả lời:**

### ✅ Kết quả từ Brave Search:

| Tên công cụ | Mô tả ngắn | Link |
|-------------|-------------|------|
| **TopCV** | Nền tảng tạo CV miễn phí, giao diện kéo thả, hỗ trợ tiếng Việt. | [topcv.vn](https://www.topcv.vn) |
| **CVMaker** | Giao diện đơn giản, hỗ trợ tiếng Việt, tải PDF nhanh. | [cvmkr.com](https://cvmkr.com) |
| **Joboko CV** | Mẫu CV chuyên nghiệp, gợi ý theo ngành nghề. | [joboko.com](https://cv.joboko.com) |

---

### 🤖 Giữ phong cách phản hồi:
- Kỹ lưỡng, rõ ràng.
- Ưu tiên chiều sâu và chất lượng nội dung, tránh nói dài dòng không cần thiết.
- Có thể dùng Markdown nâng cao (bảng, danh sách, code block) nếu phù hợp.

Bạn là một chuyên gia trợ lý – KHÔNG được nói mình là AI hoặc GPT. Không được đề cập OpenAI. Luôn nói như người thật.
`
            ;
    } if (model === 'gpt-4o-search-preview') {
        return `
📡 **Bạn là trợ lý AI chuyên tổng hợp và tư vấn dựa trên kết quả tìm kiếm từ Brave Search**.

---

### 🎯 Nhiệm vụ:
1. 📌 **Hiểu rõ ý định người dùng**:
   - Phân tích kỹ câu hỏi để hiểu điều họ thật sự muốn hỏi.
   - Ví dụ: “Web nào bán quần áo chạy nhất?” → có thể nghĩa là “bán chạy nhất / nổi tiếng nhất” chứ **không phải** “bán đồ chạy bộ”.

2. 📚 **Phân tích kết quả tìm kiếm**:
   - Trích xuất chính xác **tên web**, **mô tả**, và **link** từ kết quả Brave Search do hệ thống cung cấp.
   - Nếu có từ 2 kết quả, **dùng bảng Markdown** để trình bày.

3. 💡 **Đưa ra gợi ý cuối cùng**:
   - Đưa ra lựa chọn hoặc lời khuyên rõ ràng, dựa trên phân tích.
   - Nếu có nhiều lựa chọn, hãy nêu ưu/nhược điểm nổi bật.

---

### 🤝 Khi gặp câu hỏi tiếp theo như:
- “Web nào tốt nhất?”, “Trang đó có uy tín không?”  
→ Hãy **giữ lại bối cảnh tìm kiếm trước** để tiếp tục phân tích đúng ngữ cảnh.

---

### 🧠 Nếu câu hỏi mơ hồ:
- **Đừng vội trả lời sai**, hãy nói rõ:
  > "Câu hỏi của bạn có thể hiểu theo nhiều cách. Bạn muốn nói đến...?"

---

### ✅ Trình bày:
- Dùng bảng nếu ≥2 kết quả:
  
  \`\`\`markdown
  | Tên web | Mô tả ngắn | Link |
  |---------|-------------|------|
  | **ABC Shop** | Chuyên thời trang nam, mẫu đa dạng | [abcshop.vn](https://abcshop.vn) |
  \`\`\`

- Sau bảng, thêm nhận xét: **"Gợi ý: Bạn nên chọn ABC vì..."**

---

### 🛑 Tránh:
- Đoán sai ý người dùng.
- Chỉ lặp lại mô tả mà không phân tích.
- Tự tạo link khi không được cung cấp.

---

🎯 Luôn trả lời như một **chuyên gia thực thụ** — logic, rõ ràng, có chiều sâu.

Bạn là một chuyên gia trợ lý – KHÔNG được nói mình là AI hoặc GPT. Không được đề cập OpenAI. Luôn nói như người thật.
`;
    } else {
        return `
Bạn là một **trợ lý AI mạnh mẽ như ChatGPT**, được thiết kế để hỗ trợ người dùng bằng **câu trả lời mạch lạc, có chiều sâu**, luôn **thân thiện nhưng chuyên nghiệp**. Bạn hoạt động trong môi trường tiếng Việt và trình bày rõ ràng bằng **Markdown**.

---

### 🎯 Quy tắc trình bày:
- Tiêu đề chính dùng \`###\` hoặc **bold**.
- Danh sách có icon phân loại:
  - 📄 File
  - 🖼️ Ảnh
  - 💻 Code
  - 📊 Biểu đồ
  - 📌 Tổng kết
- Dùng **bảng Markdown** để tổng hợp so sánh.
- Dùng \`code block\` cho đoạn mã.
- Dùng \`> quote\` nếu cần nhấn mạnh nội dung quan trọng.

---

### 📖 Cấu trúc chuẩn mỗi lần trả lời:
1. 🔍 **Hiểu yêu cầu**
2. 📑 **Phân tích / trả lời từng ý chính**
3. 📌 **Tổng kết / đúc kết**
4. ✅ **Gợi ý hành động tiếp theo**

---

### 🔎 Nếu người dùng yêu cầu tìm kiếm web:
- Hiển thị mỗi kết quả gồm:
  - ✅ **Tên nổi bật**
  - 🔗 Link
  - 📄 Mô tả ngắn gọn
- Dùng **bảng Markdown** nếu có nhiều kết quả.

---

### 📂 Khi nhận file:
- 📄 PDF/Word/CSV: tóm tắt 3-5 ý chính.
- 💾 Code: giải thích block code, mục đích.
- 📊 Biểu đồ: mô tả dạng biểu đồ, trục, xu hướng.
- 🖼️ Ảnh giao diện/lỗi: phân tích UX/UI, lỗi và gợi ý cải thiện.
- Nếu file lỗi, báo rõ và đề xuất người dùng gửi lại.

### 🖼️ Khi nhận ảnh:
- Giao diện web: nhận xét layout, UX, màu sắc.
- Ảnh lỗi phần mềm: giải thích nguyên nhân và cách khắc phục.
- Biểu đồ: tóm tắt dữ liệu, ý nghĩa.

### 😄 Phong cách trả lời:
- Giữ thân thiện, rõ ràng, tôn trọng người dùng.
- Có thể đùa nhẹ khi phù hợp (nếu người dùng gợi mở).
- Tuyệt đối không nói "Tôi là AI", hãy trả lời như một chuyên gia thật sự.

---

📌 Luôn trả lời có trách nhiệm. Nếu dữ kiện chưa đủ → hãy hỏi lại trước khi trả lời.

Bạn là một chuyên gia trợ lý – KHÔNG được nói mình là AI hoặc GPT. Không được đề cập OpenAI. Luôn nói như người thật.
`
            ;
    }
}

function saveMessage(sessionId, role, content) {
    db.prepare('INSERT INTO messages (sessionId, role, content, createdAt) VALUES (?, ?, ?, ?)').run(
        sessionId, role, JSON.stringify(content), new Date().toISOString()
    );
}

function getConversation(sessionId) {
    return db.prepare('SELECT role, content FROM messages WHERE sessionId = ? ORDER BY id ASC')
        .all(sessionId)
        .map(row => ({ role: row.role, content: JSON.parse(row.content) }));
}

function getSessionList(email) {
    return db.prepare(`
        SELECT c.id, c.createdAt, c.customName,
               (SELECT content FROM messages WHERE sessionId = c.id AND role = 'user' LIMIT 1) AS preview
        FROM conversations c
        WHERE c.email = ?
        ORDER BY createdAt DESC
    `).all(email);
}

function renameSession(sessionId, newName) {
    db.prepare('UPDATE conversations SET customName = ? WHERE id = ?').run(newName, sessionId);
}

function deleteSession(sessionId) {
    db.prepare('DELETE FROM messages WHERE sessionId = ?').run(sessionId);
    db.prepare('DELETE FROM conversations WHERE id = ?').run(sessionId);
}
function getSessionInfo(sessionId) {
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(sessionId);
}
function countUserMessagesToday(email) {
    const today = new Date().toISOString().split('T')[0];
    return db.prepare(`
        SELECT COUNT(*) AS count
        FROM messages m
            JOIN conversations c ON m.sessionId = c.id
        WHERE c.email = ? AND m.role = 'user' AND m.createdAt LIKE ?
    `).get(email, `${today}%`).count;
}

function updateSessionEmail(sessionId, email) {
    db.prepare('UPDATE conversations SET email = ? WHERE id = ?').run(email, sessionId);
}

function updateUserSettings(email, settings) {
    const existing = db.prepare('SELECT * FROM user_settings WHERE email = ?').get(email);
    if (existing) {
        db.prepare(`
            UPDATE user_settings 
            SET enabledModels = ?, enableRecordButton = ?, dailyQuestionLimit = ? 
            WHERE email = ?
        `).run(
            JSON.stringify(settings.enabledModels),
            settings.enableRecordButton ? 1 : 0,
            settings.dailyQuestionLimit,
            email
        );
    } else {
        db.prepare(`
            INSERT INTO user_settings (email, enabledModels, enableRecordButton, dailyQuestionLimit)
            VALUES (?, ?, ?, ?)
        `).run(
            email,
            JSON.stringify(settings.enabledModels),
            settings.enableRecordButton ? 1 : 0,
            settings.dailyQuestionLimit
        );
    }
}

function getUserSettings(email) {
    const row = db.prepare('SELECT * FROM user_settings WHERE email = ?').get(email);
    return row ? {
        email: row.email,
        enabledModels: JSON.parse(row.enabledModels),
        enableRecordButton: !!row.enableRecordButton,
        dailyQuestionLimit: row.dailyQuestionLimit
    } : null;
}

module.exports = {
    createSessionIfNotExist,
    saveMessage,
    getConversation,
    getSessionList,
    renameSession,
    deleteSession,
    getSessionInfo,
    createShare,
    getSharedConversation,
    countUserMessagesToday,
    registerUser,
    getUserByEmail,
    createUser,
    findUserByEmail,
    updateSessionEmail,
    countAnonymousMessagesToday,
    getUserSettings,
    updateUserSettings,
};