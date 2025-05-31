require('dotenv').config();
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const axios = require('axios');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const csvParse = require('csv-parse/sync');
const { encode } = require('gpt-3-encoder');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');

const app = express();
const port = 5000;
const upload = multer({ dest: 'uploads/' });
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors({
    origin: [
        'http://localhost:63342',
        'http://127.0.0.1:5500',
        'http://localhost:5000',
        'https://thinhnt-mr.github.io'
    ]
}));

app.use(express.json());
app.use(express.static('public'));

app.use(session({
    store: new pgSession({
        pool: pgPool,
        tableName: 'user_sessions',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 ngày
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login-failed' }), (req, res) => {
    res.redirect('/index.html');
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        const { displayName, emails, photos } = req.user;
        res.json({
            name: displayName,
            email: emails[0].value,
            avatar: photos[0].value
        });
    } else {
        res.status(401).json({ error: 'Chưa đăng nhập' });
    }
});

app.post('/api/logout', (req, res) => {
    req.logout(err => {
        if (err) return res.status(500).json({ error: 'Logout thất bại' });
        res.json({ success: true });
    });
});

// 👉 Tích hợp Brave Search lại
async function searchBrave(query) {
    const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
        headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': process.env.BRAVE_API_KEY
        },
        params: {
            q: query,
            count: 3
        }
    });
    return res.data.web.results.map(r => `✅ **${r.title}**\n🔗 ${r.url}\n📄 ${r.description}`).join('\n\n');
}

app.get('/conversation-list', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const email = req.user.emails[0].value;
    const result = db.getSessionList(email).map(sess => ({
        id: sess.id,
        createdAt: sess.createdAt,
        customName: sess.customName,
        preview: sess.preview ? JSON.parse(sess.preview)?.text?.slice(0, 30) || '[File/Ảnh]' : '[...]'
    }));
    res.json({ sessions: result });
});

app.post('/conversation/:sessionId/rename', (req, res) => {
    const sessionId = req.params.sessionId;
    const newName = req.body.newName?.slice(0, 100).trim();
    if (!newName) return res.status(400).json({ error: 'Thiếu tên' });
    db.renameSession(sessionId, newName);
    res.json({ success: true });
});

app.delete('/conversation/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    db.deleteSession(sessionId);
    res.json({ success: true, message: 'Đã xóa phiên hội thoại' });
});

app.get('/conversation/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const history = db.getConversation(sessionId);
    res.json({ history });
});

app.post('/ask', upload.array('files'), async (req, res) => {
    const message = req.body.message || '';
    const files = req.files || [];
    const sessionId = req.body.sessionId || 'default';
    let email = 'anonymous';

    if (req.isAuthenticated && req.isAuthenticated()) {
        email = req.user.emails[0].value;
    }

    // 👉 Đảm bảo session mới sẽ được thêm prompt hệ thống
    db.createSessionIfNotExist(sessionId, email, true);

    if (/tìm (trên mạng|web|Google|Bing|internet|link tải|công cụ|trang web|download)/i.test(message)) {
        const searchResult = await searchBrave(message);
        const searchResponse = {
            role: 'assistant',
            content: `📡 **Kết quả từ Brave Search:**\n\n${searchResult}`
        };
        db.saveMessage(sessionId, searchResponse.role, searchResponse.content);
        return res.json({ reply: searchResponse.content });
    }

    const content = [{ type: 'text', text: message }]
    let fullResponse = '';

    for (const file of files) {
        const buffer = fs.readFileSync(file.path);
        const mime = file.mimetype;
        const filename = file.originalname;

        try {
            if (mime === 'application/pdf') {
                const pdfData = await pdfParse(buffer);
                content.push({ type: 'text', text: `📄 ${filename}:\n\n${pdfData.text.slice(0, 5000)}` });
            } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const result = await mammoth.extractRawText({ buffer });
                content.push({ type: 'text', text: `📝 ${filename}:\n\n${result.value.slice(0, 5000)}` });
            } else if (mime === 'text/csv') {
                const csvText = buffer.toString('utf8');
                const records = csvParse.parse(csvText, { columns: true });
                const preview = JSON.stringify(records.slice(0, 3), null, 2);
                content.push({ type: 'text', text: `📊 ${filename}:\n\n\`\`\`json\n${preview}\n\`\`\`` });
            } else if (mime.startsWith('image/')) {
                const base64 = buffer.toString('base64');
                content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } });
            } else {
                content.push({ type: 'text', text: `📎 ${filename}` });
            }
        } catch {
            content.push({ type: 'text', text: `⚠️ Không thể xử lý file ${filename}` });
        }
    }

    const messageParts = content.map(c => c.type === 'text' ? c.text.trim() : c);
    const userMessage = messageParts.some(p => typeof p === 'object')
        ? { role: 'user', content: messageParts }
        : { role: 'user', content: messageParts.join('\n\n') };

    db.saveMessage(sessionId, userMessage.role, JSON.stringify(userMessage.content));

    const allMessages = db.getConversation(sessionId);
    const userQuestionCount = allMessages.filter(m => m.role === 'user').length;

    // 👉 Đặt tên hội thoại nếu chưa có customName và đây là câu hỏi đầu tiên
    const sessionData = db.getSessionInfo(sessionId);
    if (!sessionData?.customName && userQuestionCount === 1) {
        const summary = typeof userMessage.content === 'string'
            ? userMessage.content.slice(0, 50)
            : Array.isArray(userMessage.content)
                ? userMessage.content.find(c => typeof c === 'string')?.slice(0, 50) || '[File/Ảnh]'
                : '[...]';
        db.renameSession(sessionId, summary);
    }

    if (userQuestionCount >= 5) {
        return res.status(429).json({ reply: "Bạn đã dùng hết 5 lượt trong hôm nay. Vui lòng thử lại sau." });
    }

    const tokenLimit = 10000;
    const promptTokens = encode(allMessages.map(m =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join(' ')
    ).length;
    const safeMaxTokens = Math.min(4000, Math.max(800, tokenLimit - promptTokens));

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o',
                messages: allMessages,
                max_tokens: safeMaxTokens,
                temperature: 0.7,
                stream: true
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY_1}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'stream',
                timeout: 120000
            }
        );

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        response.data.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        db.saveMessage(sessionId, 'assistant', fullResponse);
                        res.write(`data: [DONE]\n\n`);
                        res.end();
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            fullResponse += delta;
                            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
                        }
                    } catch {}
                }
            }
        });

        response.data.on('error', err => {
            console.error('Lỗi stream:', err);
            res.status(500).json({ reply: 'Lỗi khi nhận phản hồi từ OpenAI' });
        });
    } catch (err) {
        console.error('Lỗi gửi OpenAI:', err);
        res.status(500).json({ reply: err.message });
    } finally {
        files.forEach(f => fs.unlinkSync(f.path));
    }
});
app.get('/share/:shareId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// API dùng JS trong share.html để lấy dữ liệu
app.get('/share-data/:shareId', (req, res) => {
    const history = db.getSharedConversation(req.params.shareId);
    if (!history) return res.status(404).json({ error: 'Không tìm thấy hội thoại chia sẻ' });
    res.json({ history });
});

app.post('/conversation/:sessionId/share', (req, res) => {
    const sessionId = req.params.sessionId;
    const shareId = db.createShare(sessionId); // từ db.js
    res.json({ shareId });
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(port, () => {
    console.log(`✅ Server PostgreSQL đang chạy tại http://localhost:${port}`);
});