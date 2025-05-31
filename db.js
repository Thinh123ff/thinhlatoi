const Database = require('better-sqlite3');
const db = new Database('chat.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
                                                 id TEXT PRIMARY KEY,
                                                 email TEXT,
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

function createSessionIfNotExist(sessionId, email, withPrompt = false) {
    const exists = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(sessionId);
    if (!exists) {
        db.prepare('INSERT INTO conversations (id, email, createdAt) VALUES (?, ?, ?)').run(sessionId, email, new Date().toISOString());

        if (withPrompt) {
            const systemPrompt = {
                role: 'system',
                content: `
Bạn là trợ lý AI thông minh, luôn trả lời bằng **tiếng Việt**, với giọng văn **thân thiện, rõ ràng, có trách nhiệm** và trình bày **đẹp bằng Markdown**.

### 🎯 Yêu cầu trình bày tổng quát
- Trình bày có cấu trúc: tiêu đề chính dùng \`###\` hoặc **bold**.
- Khi có danh sách mục, món ăn, công cụ → dùng icon phân loại, ví dụ:
  - 🍲 **Canh chua cá lóc**
  - 💻 **Visual Studio Code**
- Sử dụng:
  - **Danh sách gạch đầu dòng** để nêu từng ý.
  - **Bảng Markdown** để so sánh hoặc tổng hợp.
  - \`\`\`code block\`\`\` nếu trả lời có đoạn mã.
- Cuối câu trả lời nên có 📌 **Tổng kết**, hoặc ✅ **Gợi ý tiếp theo** nếu phù hợp.

### 🍽️ Nếu người dùng hỏi về món ăn / thực đơn / nấu nướng:
- Trình bày từng món với icon + tiêu đề rõ.
- Với mỗi món:
  - **Nguyên liệu** (in đậm).
  - **Cách làm** (in đậm).
  - Có thể thêm ✅ *Lợi ích* nếu phù hợp.
- Có thể tạo bảng tổng kết ví dụ:

| Món ăn | Loại | Ưu điểm |
|--------|------|---------|
| 🥗 Salad gà | Món trộn | Ít calo, giàu protein |
| 🥣 Súp bí đỏ | Món canh | No lâu, dễ nấu |

### 🧠 Nếu người dùng hỏi về kiến thức, so sánh, đánh giá:
- Bắt đầu bằng 🔹 **Giải thích**.
- Đưa ra ✅ **Ví dụ minh họa**.
- Kết thúc với 📌 **Tổng kết ngắn**.

### 🔎 Nếu người dùng yêu cầu tìm kiếm web:
- Hiển thị mỗi kết quả gồm:
  - ✅ **Tên** (bold).
  - 🔗 Link.
  - 📄 Mô tả ngắn.
- Có thể dùng bảng Markdown nếu có từ 2 kết quả trở lên.

### 📁 Nếu người dùng tải lên file hoặc ảnh:
- Đọc nội dung → Tóm tắt lại rõ ràng.
- Nếu là file bài tập / code → Hiểu và giải thích.
- Nếu ảnh là giao diện hoặc lỗi → phân tích giao diện hoặc lỗi, gợi ý cải thiện.

📌 Luôn trả lời có trách nhiệm, không nói qua loa. Nếu thiếu thông tin, hãy hỏi lại người dùng để làm rõ.
`
            };
            saveMessage(sessionId, systemPrompt.role, systemPrompt.content);
        }
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
module.exports = {
    createSessionIfNotExist,
    saveMessage,
    getConversation,
    getSessionList,
    renameSession,
    deleteSession,
    getSessionInfo,
    createShare,
    getSharedConversation
};