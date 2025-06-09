require('dotenv').config();
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const axios = require('axios');
const FormData = require('form-data');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const csvParse = require('csv-parse/sync');
const { encode } = require('gpt-3-encoder');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');
const bcrypt = require('bcrypt');

const app = express();
const port = 5000;
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const ext = file.mimetype.split('/')[1];
        cb(null, `${Date.now()}.${ext}`);
    }
});

const upload = multer({ storage });

const https = require('https');
const AVATAR_DIR = path.join(__dirname, 'public', 'avatar-cache');
if (!fs.existsSync(AVATAR_DIR)) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

app.use(cors({
    origin: [
        'http://localhost:63342',
        'http://127.0.0.1:5500',
        'http://localhost:5000',
        'https://cron-job.org',
        'https://thinhnt-mr.github.io'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    console.log("✅ Đang dùng callback URL:", process.env.GOOGLE_CALLBACK_URL);
    try {
        const email = profile.emails?.[0]?.value;
        const photoUrl = profile.photos?.[0]?.value;

        // Chỉ tải nếu chưa có
        if (email && photoUrl) {
            const avatarPath = path.join(AVATAR_DIR, `${email}.jpg`);
            if (!fs.existsSync(avatarPath)) {
                const file = fs.createWriteStream(avatarPath);
                https.get(photoUrl, (res) => {
                    if (res.statusCode === 200) {
                        res.pipe(file);
                    } else {
                        console.warn('⚠️ Không thể tải avatar:', res.statusCode);
                        file.close();
                    }
                }).on('error', err => {
                    console.error('Lỗi tải avatar:', err);
                });
            }
        }
        done(null, profile);
    } catch (err) {
        console.error('Lỗi xử lý avatar Google:', err);
        done(err, profile);
    }
}));

async function fetchWikipediaSummary(query, lang = 'vi') {
    try {
        query = query
            .replace(/["“”‘’]/g, '')
            .replace(/[?!.,:;]+$/g, '')
            .replace(/^ai là|là gì|là ai|hãy cho biết|vui lòng cho biết|trình bày|giới thiệu|hãy nói về/i, '')
            .trim();

        const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
        const searchRes = await axios.get(searchUrl);

        if (!searchRes.data?.query?.search?.length) {
            console.warn("❌ Không tìm thấy kết quả phù hợp cho:", query);
            return null;
        }

        const bestTitle = searchRes.data.query.search[0].title;
        const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`;
        const summaryRes = await axios.get(summaryUrl);

        if (summaryRes?.data?.extract) {
            return {
                title: summaryRes.data.title,
                summary: summaryRes.data.extract,
                url: summaryRes.data.content_urls?.desktop?.page
            };
        }
    } catch (err) {
        console.warn("❌ Lỗi khi truy vấn Wikipedia:", err.message);
    }

    return null;
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login-failed' }), (req, res) => {
    const email = req.user.emails?.[0]?.value;
    if (email) db.logLogin(email);
    const photoUrl = req.user.photos?.[0]?.value;
    const avatarPath = path.join(AVATAR_DIR, `${email}.jpg`);

    if (email && photoUrl && !fs.existsSync(avatarPath)) {
        const file = fs.createWriteStream(avatarPath);
        https.get(photoUrl, (resImg) => {
            if (resImg.statusCode === 200) {
                resImg.pipe(file).on('finish', () => {
                    res.redirect('/index.html?justLoggedIn=1');
                });
            } else {
                console.warn('⚠️ Không tải được avatar:', resImg.statusCode);
                res.redirect('/index.html?justLoggedIn=1');
            }
        }).on('error', err => {
            console.error('Lỗi tải avatar:', err);
            res.redirect('/index.html?justLoggedIn=1');
        });
    } else {
        res.redirect('/index.html?justLoggedIn=1');
    }
});

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        const email = req.user.emails?.[0]?.value;
        const displayName = req.user.displayName;
        const avatarPath = `/avatar-cache/${email}.jpg`;
        const localPath = path.join(__dirname, 'public', avatarPath);

        const avatar = fs.existsSync(localPath)
            ? avatarPath
            : '/image/default-avatar.png';

        res.json({
            name: displayName,
            email,
            avatar
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
    return `
| # | Trang web | Mô tả ngắn | Link |
|---|-----------|------------|------|
${res.data.web.results.map((r, i) =>
        `| ${i + 1} | **${r.title.trim()}** | ${r.description?.trim().slice(0, 100)} | [${new URL(r.url).hostname}](${r.url}) |`
    ).join('\n')}
`;
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
    let anonymousToken = req.body.anonymousToken;

    if (req.isAuthenticated && req.isAuthenticated()) {
        email = req.user.emails[0].value;
    }

    if (email !== 'anonymous') {
        const todayCount = db.countUserMessagesToday(email);
        const settings = db.getUserSettings(email);
        const limit = settings?.dailyQuestionLimit !== undefined ? settings.dailyQuestionLimit : 5;
        if (todayCount >= limit) {
            return res.status(429).json({
                showBanner: true,
                bannerMessage: "Tận hưởng tốt hơn khi bạn nâng cấp lên Askiva Pro hoặc thử lại sau 24h!"
            });
        }
    } else {
        const todayCount = db.countAnonymousMessagesToday(anonymousToken);
        const settings = db.getUserSettings(email);
        const limit = settings?.dailyQuestionLimit !== undefined ? settings.dailyQuestionLimit : 5;
        if (todayCount >= limit) {
            return res.status(429).json({
                showBanner: true,
                bannerMessage: "Tận hưởng tốt hơn khi bạn nâng cấp lên Askiva Pro hoặc thử lại sau 24h!"
            });
        }
    }

    const selectedModel = req.body.model || 'gpt-4o';
    console.log(`🤖 Đang dùng model: ${selectedModel}`);
    db.createSessionIfNotExist(sessionId, email, anonymousToken, true, selectedModel);

    if (/tìm (trên mạng|web|Google|Bing|internet|link tải|công cụ|trang web|download)/i.test(message)) {
        let searchResult;

        if (selectedModel === 'gpt-4o-search-preview') {
            try {
                const res = await axios.post('https://google.serper.dev/search', {
                    q: message,
                    num: 5
                }, {
                    headers: {
                        'X-API-KEY': process.env.SERPER_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });

                const results = res.data?.organic || [];
                if (!results.length) {
                    console.warn('⚠️ Serper.dev không trả về kết quả cho:', message);
                    searchResult = '❌ Không tìm thấy kết quả tìm kiếm trên web.';
                } else {
                    searchResult = `
| # | Trang web | Mô tả | Link |
|---|-----------|--------|------|
${results.map((r, i) =>
                        `| ${i + 1} | **${r.title}** | ${r.snippet?.slice(0, 100)} | [${new URL(r.link).hostname}](${r.link}) |`
                    ).join('\n')}
            `;
                }

                const prompt = [
                    {
                        role: 'system',
                        content: `
📡 **Bạn là một trợ lý AI chuyên phân tích kết quả tìm kiếm từ internet**.

- Phân tích đúng **tiêu đề + mô tả + URL** từ dữ liệu được cung cấp.
- 🚩 **KHÔNG được bịa hoặc thay đổi URL** — chỉ dùng đúng link đã cho.
- Nếu không có link → báo là "(thiếu link)" — KHÔNG tự tạo.
- Trình bày bằng Markdown, có thể dùng bảng nếu phù hợp.
- Nếu không có kết quả tìm kiếm, trả lời ngắn gọn rằng không tìm thấy thông tin.

Ví dụ:

| Trang web | Mô tả | Link |
|-----------|-------|------|
| TopCV     | Tạo CV tiếng Việt | [topcv.vn](https://www.topcv.vn) |
| Canva     | Thiết kế CV đẹp | [canva.com](https://www.canva.com) |
`
                    },
                    {
                        role: 'user',
                        content: `❓ Câu hỏi của người dùng:\n${message}\n\n🔎 Kết quả từ Serper.dev:\n\n${searchResult}`
                    }
                ];

                console.log('📤 Prompt gửi OpenAI:', JSON.stringify(prompt, null, 2));

                const replyRes = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: selectedModel,
                    messages: prompt,
                    max_tokens: 1024
                }, {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY_1}`,
                        'Content-Type': 'application/json'
                    }
                });

                console.log('📥 Phản hồi từ OpenAI:', replyRes.data);

                const answer = replyRes.data.choices?.[0]?.message?.content || "❌ Model không trả lời. Vui lòng thử lại hoặc dùng model khác.";
                db.saveMessage(sessionId, 'assistant', answer);
                return res.json({ reply: answer });
            } catch (err) {
                console.error('Lỗi xử lý tìm kiếm với gpt-4o-search-preview:', err.response?.data || err.message);
                const fallbackAnswer = "❌ Lỗi khi xử lý tìm kiếm. Vui lòng thử lại hoặc dùng model khác.";
                db.saveMessage(sessionId, 'assistant', fallbackAnswer);
                return res.json({ reply: fallbackAnswer });
            }
        }

        const braveRes = await axios.get('https://api.search.brave.com/res/v1/web/search', {
            headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': process.env.BRAVE_API_KEY
            },
            params: { q: message, count: 3 }
        });

        searchResult = `
| # | Trang web | Mô tả ngắn | Link |
|---|-----------|------------|------|
${braveRes.data.web.results.map((r, i) =>
            `| ${i + 1} | **${r.title.trim()}** | ${r.description?.trim().slice(0, 100)} | [${new URL(r.url).hostname}](${r.url}) |`
        ).join('\n')}
    `;

        const searchResponse = {
            role: 'assistant',
            content: `📡 **Kết quả từ Brave Search:**\n\n${searchResult}`
        };
        db.saveMessage(sessionId, searchResponse.role, searchResponse.content);
        return res.json({ reply: searchResponse.content });
    }

    const content = [{ type: 'text', text: message }];
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
                if (selectedModel === 'gpt-4.1') {
                    content.push({ type: 'text', text: `🖼️ Đã bỏ qua ảnh "${filename}" vì model "${selectedModel}" không hỗ trợ ảnh.` });
                } else {
                    const base64 = buffer.toString('base64');
                    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } });
                }
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
    let wikipediaAdded = false;
    let usedWikipediaAsFallback = false;

    if (allMessages.length <= 1 && selectedModel !== 'gpt-4o-search-preview') {
        const wiki = await fetchWikipediaSummary(message);
        if (wiki) {
            wikipediaAdded = true;
            usedWikipediaAsFallback = true;
            allMessages.unshift({
                role: 'system',
                content: `📚 **Thông tin từ Wikipedia - ${wiki.title}**:\n\n${wiki.summary}\n\n🔗 ${wiki.url}`
            });
            db.saveMessage(sessionId, 'system', JSON.stringify(`📚 **Thông tin từ Wikipedia - ${wiki.title}**:\n\n${wiki.summary}\n\n🔗 ${wiki.url}`));
        }
    }

    const userMessageCountInThisSession = allMessages.filter(m => m.role === 'user').length;

    const sessionData = db.getSessionInfo(sessionId);
    if (!sessionData?.customName && userMessageCountInThisSession === 1) {
        const summary = typeof userMessage.content === 'string'
            ? userMessage.content.slice(0, 50)
            : Array.isArray(userMessage.content)
                ? userMessage.content.find(c => typeof c === 'string')?.slice(0, 50) || '[File/Ảnh]'
                : '[...]';
        db.renameSession(sessionId, summary);
    }

    const tokenLimit = 10000;
    const promptTokens = encode(allMessages.map(m =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join(' ')
    ).length;
    const safeMaxTokens = Math.min(2000, Math.max(800, tokenLimit - promptTokens));

    // Thay đoạn code từ dòng 458 đến dòng 531 trong endpoint /ask
    try {
        // Sửa lỗi: Chỉ giữ lại tin nhắn user cuối cùng
        const messages = [];
        let lastUserMessage = null;

        allMessages.forEach(m => {
            let parsed;
            if (typeof m.content === 'string') {
                try {
                    parsed = JSON.parse(m.content);
                } catch {
                    parsed = m.content;
                }
            } else {
                parsed = m.content;
            }

            if (selectedModel === 'gpt-4o-search-preview') {
                if (m.role === 'system') {
                    if (Array.isArray(parsed)) {
                        parsed = parsed.map(p => (typeof p === 'string' ? p : p?.text || '')).join('\n');
                    } else if (typeof parsed === 'object') {
                        parsed = parsed?.text || JSON.stringify(parsed);
                    }
                } else {
                    if (typeof parsed === 'string') {
                        parsed = [{ type: 'text', text: parsed }];
                    } else if (Array.isArray(parsed)) {
                        parsed = parsed.map(item => {
                            if (typeof item === 'string') {
                                return { type: 'text', text: item };
                            } else if (item?.type === 'text' && typeof item?.text === 'string') {
                                return item;
                            } else if (item?.type === 'image_url' && item?.image_url?.url) {
                                return item;
                            } else {
                                return { type: 'text', text: JSON.stringify(item) };
                            }
                        });
                    } else {
                        parsed = [{ type: 'text', text: JSON.stringify(parsed) }];
                    }
                }
            }

            if (m.role === 'user') {
                lastUserMessage = { role: m.role, content: parsed };
            } else {
                messages.push({ role: m.role, content: parsed });
            }
        });

        if (lastUserMessage) {
            messages.push(lastUserMessage); // Chỉ thêm tin nhắn user cuối cùng
        }

        console.log("✅ Gửi OpenAI:", {
            model: selectedModel,
            types: messages.flatMap(m => Array.isArray(m.content) ? m.content.map(c => c.type) : typeof m.content)
        });

        const useStream = selectedModel !== 'gpt-4o-search-preview';

        // Sửa lỗi: Loại bỏ temperature khi dùng gpt-4o-search-preview
        const requestBody = {
            model: selectedModel,
            messages,
            max_tokens: safeMaxTokens,
            stream: useStream
        };

        if (selectedModel !== 'gpt-4o-search-preview') {
            requestBody.temperature = 0.5;
        }

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY_1}`,
                    'Content-Type': 'application/json'
                },
                responseType: useStream ? 'stream' : 'json',
                timeout: 120000
            }
        );

        if (!useStream) {
            const fullResponse = response.data.choices?.[0]?.message?.content || "❌ Không có phản hồi.";
            db.saveMessage(sessionId, 'assistant', fullResponse);
            return res.json({ reply: fullResponse });
        }

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
        console.error('Lỗi gửi OpenAI:', err.response?.data || err.message);
        res.status(500).json({ reply: `Lỗi: ${err.response?.data?.error?.message || err.message}` });
    } finally {
        files.forEach(f => fs.unlinkSync(f.path));
    }
});

app.get('/share/:shareId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

app.get('/share-data/:shareId', (req, res) => {
    const history = db.getSharedConversation(req.params.shareId);
    if (!history) return res.status(404).json({ error: 'Không tìm thấy hội thoại chia sẻ' });
    res.json({ history });
});

app.post('/conversation/:sessionId/share', (req, res) => {
    const sessionId = req.params.sessionId;
    const shareId = db.createShare(sessionId);
    res.json({ shareId });
});

app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });

    try {
        const hashed = await bcrypt.hash(password, 10);
        const success = db.createUser(email, hashed);

        if (!success) return res.status(400).json({ error: 'Email đã được đăng ký' });
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Lỗi đăng ký:', err);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });

    try {
        const user = db.findUserByEmail(email);
        if (!user) return res.status(400).json({ error: 'Tài khoản không tồn tại' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: 'Mật khẩu không đúng' });

        req.login({ emails: [{ value: email }], displayName: email, photos: [{ value: '/image/default-avatar.png' }] }, (err) => {
            if (err) return res.status(500).json({ error: 'Đăng nhập thất bại' });
            db.logLogin(email); // ← thêm dòng này
            res.json({ success: true });
        });
    } catch (err) {
        console.error('Lỗi đăng nhập:', err);
        res.status(500).json({ error: 'Lỗi máy chủ' });
    }
});

app.post('/api/ask-knowledge', async (req, res) => {
    const { question, model } = req.body;
    console.log("📚 Wikipedia mode: ", model, "Câu hỏi:", question);

    let email = 'anonymous';
    if (req.isAuthenticated && req.isAuthenticated()) {
        email = req.user.emails[0].value;
    }

    const todayCount = db.countUserMessagesToday(email);
    const settings = db.getUserSettings(email);
    const limit = settings?.dailyQuestionLimit !== undefined ? settings.dailyQuestionLimit : 5;
    if (todayCount >= limit) {
        return res.status(429).json({ answer: "Nâng cấp lên gói Askiva Pro để tăng tính trải nghiệm hoặc thử lại sau 24h!" });
    }

    const wiki = await fetchWikipediaSummary(question);
    if (!wiki) {
        return res.json({
            answer: "🤔 Mình chưa tìm thấy thông tin phù hợp cho câu hỏi này. Bạn thử hỏi theo cách khác hoặc rút gọn từ khóa nhé!"
        });
    }

    const prompt = [
        {
            role: 'system',
            content: `📚 Bạn vừa nhận được kết quả tóm tắt từ Wikipedia về chủ đề "${wiki.title}". Hãy dùng thông tin này để trả lời câu hỏi sau của người dùng một cách ngắn gọn, rõ ràng, bằng tiếng Việt.\n\nTóm tắt Wikipedia:\n${wiki.summary}`
        },
        {
            role: 'user',
            content: question
        }
    ];

    try {
        const reply = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: 'gpt-4o',
            messages: prompt,
            temperature: 0.5,
            max_tokens: 1024
        }, {
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY_1}`,
                'Content-Type': 'application/json'
            }
        });

        const content = reply.data.choices?.[0]?.message?.content;
        res.json({ answer: content });
    } catch (err) {
        console.error("Lỗi gọi GPT:", err.response?.data || err.message);
        res.status(500).json({ answer: `❌ Lỗi xử lý câu hỏi: ${err.response?.data?.error?.message || err.message}` });
    }
});

app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
    const audioPath = req.file.path;
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(audioPath));
        formData.append('model', 'whisper-1');

        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY_1}`,
                    ...formData.getHeaders()
                }
            }
        );

        const transcript = response.data.text;
        fs.unlinkSync(audioPath);
        res.json({ transcript });
    } catch (err) {
        console.error('Lỗi upload audio:', err.response?.data || err.message);
        res.status(500).json({ error: 'Không xử lý được audio' });
    }
});

async function searchSerper(query) {
    const res = await axios.post('https://google.serper.dev/search', {
        q: query,
        num: 5
    }, {
        headers: {
            'X-API-KEY': process.env.SERPER_API_KEY,
            'Content-Type': 'application/json'
        }
    });

    const results = res.data?.organic || [];
    if (!results.length) return "❌ Không tìm thấy kết quả.";

    return `
| # | Trang web | Mô tả | Link |
|---|-----------|--------|------|
${results.map((r, i) =>
        `| ${i + 1} | **${r.title}** | ${r.snippet?.slice(0, 100)} | [${new URL(r.link).hostname}](${r.link}) |`
    ).join('\n')}
    `;
}

app.post('/admin/update-settings', (req, res) => {
    const { email, verifyPassword, reset, block } = req.body;

    if (verifyPassword !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Mật khẩu xác minh không đúng' });
    }

    const existing = db.getUserSettings(email);

    if (block) {
        if (existing) {
            db.updateDailyLimit(email, 0);
        } else {
            db.insertUserSettings(email, 0);
        }
        return res.json({ success: true, message: `Đã chặn quyền ${email}` });
    }

    if (reset === true) {
        db.updateUserSettings(email, {
            enabledModels: [],
            enableRecordButton: false,
            dailyQuestionLimit: 5
        });
    } else {
        db.updateUserSettings(email, {
            enabledModels: ['text-embedding-3-large', 'gpt-4o-search-preview'],
            enableRecordButton: true,
            dailyQuestionLimit: 15
        });
    }

    res.json({ success: true });
});

app.get('/api/user/settings', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const email = req.user.emails[0].value;
    const settings = db.getUserSettings(email);
    res.json(settings || {});
});

app.get('/api/settings', (req, res) => {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Thiếu email' });

    const settings = db.getUserSettings(email);
    res.json(settings || {});
});

app.get('/admin/login-logs', (req, res) => {
    const { verifyPassword } = req.query;

    if (verifyPassword !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Mật khẩu xác minh không đúng' });
    }

    const logs = db.getLoginLogs();
    res.json({ logs });
});

app.get('/ping', (req, res) => {
    res.send('pong');
});

app.listen(port, () => {
    console.log(`✅ Server SQLite đang chạy tại http://localhost:${port}`);
});