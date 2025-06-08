const Database = require('better-sqlite3');
const db = new Database('chat.db');

// Xoá bảng nếu tồn tại
db.exec('DROP TABLE IF EXISTS user_settings');

// Tạo lại bảng KHÔNG có FOREIGN KEY
db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
        email TEXT PRIMARY KEY,
        enabledModels TEXT,
        enableRecordButton INTEGER,
        dailyQuestionLimit INTEGER
    );
`);

console.log('✅ Đã reset lại bảng user_settings (không còn FOREIGN KEY)');