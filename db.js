const { Pool } = require('pg');

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

initTables(); // gọi khi load module

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
                content: `...` // Giữ nguyên đoạn prompt như cũ
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