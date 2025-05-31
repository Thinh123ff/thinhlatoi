const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
                                                     id TEXT PRIMARY KEY,
                                                     email TEXT,
                                                     createdAt TIMESTAMPTZ,
                                                     customName TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
                                                id SERIAL PRIMARY KEY,
                                                sessionId TEXT REFERENCES conversations(id) ON DELETE CASCADE,
            role TEXT,
            content TEXT,
            createdAt TIMESTAMPTZ
            );

        CREATE TABLE IF NOT EXISTS shared_conversations (
                                                            shareId TEXT PRIMARY KEY,
                                                            sessionId TEXT REFERENCES conversations(id) ON DELETE CASCADE,
            createdAt TIMESTAMPTZ
            );
    `);
}
initTables();

async function createShare(sessionId) {
    const shareId = crypto.randomUUID();
    await pool.query(
        'INSERT INTO shared_conversations (shareId, sessionId, createdAt) VALUES ($1, $2, NOW())',
        [shareId, sessionId]
    );
    return shareId;
}

async function getSharedConversation(shareId) {
    const result = await pool.query('SELECT sessionId FROM shared_conversations WHERE shareId = $1', [shareId]);
    if (result.rowCount === 0) return null;
    return getConversation(result.rows[0].sessionid);
}

async function createSessionIfNotExist(sessionId, email, withPrompt = false) {
    const exists = await pool.query('SELECT 1 FROM conversations WHERE id = $1', [sessionId]);
    if (exists.rowCount === 0) {
        await pool.query(
            'INSERT INTO conversations (id, email, createdAt) VALUES ($1, $2, NOW())',
            [sessionId, email]
        );

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
            await saveMessage(sessionId, systemPrompt.role, systemPrompt.content);
        }
    }
}

async function saveMessage(sessionId, role, content) {
    await pool.query(
        'INSERT INTO messages (sessionId, role, content, createdAt) VALUES ($1, $2, $3, NOW())',
        [sessionId, role, JSON.stringify(content)]
    );
}

async function getConversation(sessionId) {
    const result = await pool.query(
        'SELECT role, content FROM messages WHERE sessionId = $1 ORDER BY id ASC',
        [sessionId]
    );
    return result.rows.map(r => ({ role: r.role, content: JSON.parse(r.content) }));
}

async function getSessionList(email) {
    const result = await pool.query(`
        SELECT c.id, c.createdAt, c.customName,
               (SELECT content FROM messages WHERE sessionId = c.id AND role = 'user' LIMIT 1) AS preview
        FROM conversations c
        WHERE c.email = $1
        ORDER BY createdAt DESC
    `, [email]);
    return result.rows;
}

async function renameSession(sessionId, newName) {
    await pool.query(
        'UPDATE conversations SET customName = $1 WHERE id = $2',
        [newName, sessionId]
    );
}

async function deleteSession(sessionId) {
    await pool.query('DELETE FROM messages WHERE sessionId = $1', [sessionId]);
    await pool.query('DELETE FROM conversations WHERE id = $1', [sessionId]);
}

async function getSessionInfo(sessionId) {
    const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [sessionId]);
    return result.rows[0];
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