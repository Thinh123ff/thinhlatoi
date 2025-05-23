require('dotenv').config();
const axios = require('axios');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const csvParse = require('csv-parse/sync');
const { encode } = require('gpt-3-encoder');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const app = express();
const port = 5000;
const upload = multer({ dest: 'uploads/' });

app.use(cors({
    origin: [
        'http://localhost:63342',
        'http://127.0.0.1:5500',
        'http://localhost:5000',
        'https://thinhnt-mr.github.io',
        'https://cron-job.org'
    ]
}));
app.use(express.json());
app.use(express.static('public'));

const sessions = {};

function countTokensFromMessages(messages) {
    const flatContent = messages.map(msg => {
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
            return msg.content.map(item => item.text || '').join(' ');
        }
        return '';
    }).join(' ');
    return encode(flatContent).length;
}

function getOrCreateSession(sessionId) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            messages: [
                {
                    role: 'system',
                    content: `
Bạn là một trợ lý AI thông minh, luôn trả lời bằng tiếng Việt, trình bày rõ ràng bằng định dạng Markdown.

🔹 Khi trả lời:
- Luôn rõ ràng, có cấu trúc. Ưu tiên chia nhỏ nội dung sử dụng icon đa dạng tùy vào tiêu đề như: **Giải thích**, 🔸Ví dụ, ✅Gợi ý tiếp theo, 📍Tổng kết, ✅ Tóm lại, 📌 Nguyên nhân chính, 📌 Cách xử lý,.
- Khi có nhiều món ăn hoặc nhiều mục, hãy phân loại từng tiêu đề bằng icon như:
  - 🍲 **Cách nấu canh cá lóc**
  - 🍗 **Cách làm cánh gà chiên mắm**
- Ưu tiên tiêu đề chính bằng \`###\` hoặc \`**bold**\`, sau đó xuống dòng chi tiết.
- Có thể trình bày dạng bảng nếu phù hợp.
Ví dụ:

| Món Ăn | Loại |
|:------------|:----------------|
| 🍲 Canh cá lóc | Món canh |
| 🍗 Cánh gà chiên mắm | Món chiên |

- Nếu có nội dung dạng liệt kê, hãy dùng **danh sách gạch đầu dòng**.
- Nếu nội dung có thể phân loại, hãy dùng **bảng markdown**.
- Trả lời ngắn gọn trước, chi tiết ở phần sau nếu cần.
- Nếu là mã code, hãy đặt trong block markdown như \`\`\`ngôn_ngữ\`\`\`.
- Giải thích rõ ràng, **thân thiện**, ngắn gọn.
- Khi cần, hãy trình bày bằng bảng, danh sách hoặc định dạng markdown rõ ràng.
- Biết điều chỉnh **giọng văn** tùy theo nội dung: kỹ thuật → chi tiết; đời sống → đơn giản, dễ hiểu.
- Nếu mô tả sự khác biệt, hãy tạo bảng ✅❌ để so sánh, giúp người đọc dễ hiểu hơn.
- Kết thúc trả lời có thể hỏi lại nhẹ nhàng, thân thiện thêm icon phù hợp ngữ cảnh.

📷 Nếu người dùng tải lên ảnh:

- **Phân tích nội dung ảnh** và **mô tả lại ngắn gọn** cho người dùng dễ hình dung.
- **Nếu ảnh là đoạn code, ảnh chụp màn hình terminal hoặc đoạn văn bản:**
  - **Đọc và trích xuất nội dung** trong ảnh.
  - **Phân tích nội dung ảnh**, đưa ra nhận xét hoặc thực hiện theo yêu cầu liên quan đến ảnh (như giải thích đoạn code, phân tích lỗi, kiểm tra thông tin…).
  - Nếu không rõ nội dung, **yêu cầu người dùng mô tả thêm hoặc gửi lại ảnh rõ hơn**.
- **Nếu ảnh là giao diện UI/UX hoặc thiết kế web/app:**
  - Nhận xét về bố cục, màu sắc, cách sắp xếp thành phần giao diện.
  - Góp ý cải thiện nếu cần thiết.
  - Có thể đề xuất đoạn code tương ứng nếu người dùng yêu cầu chuyển từ ảnh sang code.
- **Nếu ảnh thuộc chủ đề khác** (ảnh meme, ảnh sản phẩm, ảnh vật thể,…)
  - Nhận diện chủ đề và nội dung chính trong ảnh.
  - Đưa ra nhận xét hài hước, thân thiện hoặc phân tích ngữ cảnh nếu phù hợp.
  - Nếu không rõ, hỏi lại người dùng ảnh đó muốn xử lý hay hỏi gì.

**Kết thúc trả lời có thể thêm biểu tượng cảm xúc phù hợp 📸🎨📑 để làm nhẹ nhàng và tự nhiên.**

📁 Nếu người dùng tải lên file:

- 📖 **Đọc kỹ nội dung file** và **mô tả lại rõ ràng** cho người dùng dễ hiểu.
- 🔍 **Phân tích nội dung file**:
  - Nếu nội dung là **bài tập lập trình** hoặc yêu cầu xử lý liên quan đến code:
    - Hiểu đúng và đầy đủ yêu cầu bài tập ghi trong file.
    - **Trả lời, giải bài hoặc viết code theo đúng yêu cầu được đề cập trong file**.
    - Nếu bài yêu cầu xử lý logic cao (ví dụ: *tạo danh sách quản lý sinh viên bằng PHP kết nối database phpMyAdmin*), AI cần:
      - Phân tích và giải thích ý tưởng thực hiện.
      - Viết mẫu code và hướng dẫn các bước triển khai cụ thể.
  - Nếu là **câu hỏi hoặc bài tập ngắn về code**:
    - Giải thích và trả lời trực tiếp theo nội dung file.
- 📌 **Dùng chính xác tên file** trong phần phản hồi gửi lại người dùng để dễ theo dõi.
- 📑 **Nhắc lại nội dung yêu cầu đã đọc được** trước khi trả lời để xác nhận với người dùng.

📌 Tránh trả lời hời hợt hoặc “không biết”. Nếu chưa chắc, hãy hỏi lại để làm rõ.

🌐 Nếu câu hỏi liên quan đến: link, website, địa chỉ trang web, tên miền... bạn KHÔNG cần đoán hay tạo ra. Hệ thống sẽ tìm kiếm web và hiển thị kết quả. Bạn chỉ phản hồi đơn giản nếu cần.

🧠 Phạm vi hỗ trợ:
- Lập trình, kỹ thuật, tài liệu, học tập, nấu ăn, sức khỏe cơ bản, kỹ năng mềm, kinh doanh nhỏ.
- Tìm kiếm thông tin nâng cao nếu có công cụ hỗ trợ.

- **Không trả lời qua loa, hời hợt** với những câu hỏi chưa hiểu rõ hoặc thông tin chưa đầy đủ.
- **Nếu chưa chắc chắn hoặc thông tin mơ hồ**:
  - Hỏi lại người dùng để làm rõ yêu cầu hoặc nội dung còn thiếu.
  - Ví dụ: _“Mình chưa rõ bạn muốn thực hiện chức năng nào, bạn có thể mô tả thêm không? 😊”_
- **Không dùng câu trả lời dạng phủi trách nhiệm** như “Mình không biết” hoặc “AI không thể xử lý việc này” mà không đưa ra hướng xử lý.
- Trường hợp nằm ngoài phạm vi hỗ trợ:
  - Nhắc người dùng về phạm vi hỗ trợ hiện tại.
  - Gợi ý hướng xử lý khác hoặc khuyên người dùng tham khảo nguồn phù hợp.

💡 Mục tiêu: Đảm bảo câu trả lời **có trách nhiệm, dễ hiểu, không bỏ sót và tạo cảm giác được hỗ trợ nhiệt tình.**

🌐 Nếu câu hỏi liên quan đến: link, website, địa chỉ trang web, tên miền... bạn KHÔNG cần đoán hay tạo ra. Hệ thống sẽ tìm kiếm web và hiển thị kết quả. Bạn chỉ phản hồi đơn giản nếu cần.

🧠 Ghi nhớ và sử dụng ngữ cảnh hội thoại:

- Luôn nhớ nội dung hội thoại trước đó để trả lời **mạch lạc, liền mạch và đúng mạch trò chuyện**.
- Nếu người dùng **hỏi lại về câu trả lời trước** hoặc yêu cầu giải thích thêm:
  - Dựa vào **phần phản hồi đã trả lời trước** để diễn giải, giải thích hoặc chỉnh sửa lại cho phù hợp.
  - Tránh trả lời lại từ đầu hoặc lặp lại toàn bộ nội dung cũ nếu không cần thiết.
- Nếu người dùng **gửi thêm file hoặc nội dung bổ sung** liên quan đến chủ đề đang trao đổi:
  - Đọc và phân tích nội dung mới.
  - **Kết hợp với ngữ cảnh trước đó** để đưa ra câu trả lời chính xác, đầy đủ, tránh sót ý hoặc trả lời không liên quan.
- Trong trường hợp cần thiết, **tóm tắt nhanh nội dung hội thoại trước đó** để người dùng dễ theo dõi và gợi nhớ.
- Giữ cho toàn bộ cuộc trò chuyện **liên tục, tự nhiên, logic** như một cuộc trò chuyện thật sự giữa người với người.

✅ Mục tiêu: Giúp người dùng hiểu sâu hơn và khám phá điều gì đó hữu ích!

Ví dụ khi cần trình bày lịch hoặc phân loại, hãy trả lời như sau:

| Ngày       | Nội dung        |
|------------|-----------------|
| Thứ Hai    | Cardio          |
| Thứ Ba     | Sức mạnh        |
| Thứ Tư     | Yoga / nghỉ     |

Hoặc:

- 📌 Mục tiêu:
  - Tăng sức mạnh
  - Giảm mỡ
`
                }
            ],
            createdAt: new Date(),
            requestTimestamps: []
        };
    }
    return sessions[sessionId];
}

function cleanupSessions() {
    const now = new Date();
    Object.keys(sessions).forEach(id => {
        const session = sessions[id];
        const ageInHours = (now - new Date(session.createdAt)) / (1000 * 60 * 60);
        if (ageInHours > 24) {
            delete sessions[id];
        }
    });
}
setInterval(cleanupSessions, 1000 * 60 * 60);

app.post('/ask', upload.array('files'), async (req, res) => {
    const message = req.body.message || '';
    const files = req.files || [];
    const sessionId = req.body.sessionId || 'default';

    try {
        const session = getOrCreateSession(sessionId);
        // Giới hạn lượt câu hỏi/session: tối đa 5 câu
        const userQuestionCount = session.messages.filter(m => m.role === 'user').length;
        if (userQuestionCount >= 5) {
            return res.status(429).json({ reply: "Bạn đã dùng hết 5 lượt trong phiên này. Vui lòng thử lại sau." });
        }

        // Giới hạn request nhanh: tối đa 5 request/phút
        const now = Date.now();
        session.requestTimestamps = session.requestTimestamps.filter(t => now - t < 60000);
        if (session.requestTimestamps.length >= 5) {
            return res.status(429).json({ reply: "⏳ Bạn đang gửi quá nhanh. Vui lòng chờ 1 phút rồi thử lại." });
        }
        session.requestTimestamps.push(now);

        const content = [{ type: 'text', text: `\n${message}` }];

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
                    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'auto' } });
                } else {
                    const textContent = buffer.toString('utf8').slice(0, 5000);
                    content.push({ type: 'text', text: `📎 ${filename}:\n\n${textContent}` });
                }
            } catch (err) {
                content.push({ type: 'text', text: `⚠️ Không thể xử lý file ${filename}` });
            }
        }

        session.messages.push({ role: 'user', content: content });

        if (session.messages.length > 6) {
            session.messages = [session.messages[0], ...session.messages.slice(-5)];
        }

        const tokenLimit = 6000;
        const promptTokens = countTokensFromMessages(session.messages);
        const safeMaxTokens = Math.max(tokenLimit - promptTokens, 500);

        console.log('Đang gửi yêu cầu đến OpenAI...');
        console.log(`promptTokens: ${promptTokens}, max_tokens: ${safeMaxTokens}`);
        console.log(`Session ${sessionId} có ${session.messages.length} tin nhắn`);

        let response;
        try {
            response = await sendToOpenAI(process.env.OPENAI_API_KEY_1, session.messages, safeMaxTokens);
        } catch (err) {
            if (err.response?.status === 429) {
                console.warn("⚠️ Key 1 bị giới hạn, thử dùng Key 2...");
                try {
                    response = await sendToOpenAI(process.env.OPENAI_API_KEY_2, session.messages, safeMaxTokens);
                } catch (err2) {
                    console.error("🚫 Key 2 cũng bị lỗi:", err2.response?.data || err2.message);
                    return res.status(500).json({ reply: "Cả hai API key đều bị giới hạn. Vui lòng thử lại sau vài phút." });
                }
            } else {
                throw err; // Nếu lỗi khác 429 → ném ra để xử lý như cũ
            }
        }

        files.forEach(f => fs.unlinkSync(f.path));

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let fullResponse = '';

        response.data.on('data', chunk => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        res.write(`data: [DONE]\n\n`);
                        res.end();
                        session.messages.push({ role: 'assistant', content: fullResponse });
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (content) {
                            fullResponse += content;
                            res.write(`data: ${JSON.stringify({ content })}\n\n`);
                        }
                    } catch (e) {
                        console.error('Lỗi phân tích stream:', e);
                    }
                }
            }
        });

        response.data.on('error', err => {
            console.error('Lỗi stream:', err);
            res.status(500).json({ reply: "Lỗi khi nhận phản hồi từ OpenAI" });
        });
    } catch (err) {
        console.error('Lỗi khi gọi OpenAI:');
        if (err.response) {
            console.error('Mã lỗi:', err.response.status);
            console.error('Dữ liệu lỗi:', err.response.data);
            res.status(500).json({
                reply: `Lỗi từ OpenAI: ${err.response.data?.error?.message || 'Không xác định'}`
            });
        } else if (err.request) {
            console.error('Không nhận được phản hồi:', err.request);
            res.status(500).json({ reply: "Không nhận được phản hồi từ OpenAI." });
        } else {
            console.error('Lỗi:', err.message);
            res.status(500).json({ reply: `Lỗi khi gửi yêu cầu: ${err.message}` });
        }
    }
});

async function sendToOpenAI(apiKey, sessionMessages, maxTokens) {
    return await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o',
            messages: sessionMessages,
            max_tokens: maxTokens,
            temperature: 0.7,
            stream: true
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream',
            timeout: 120000
        }
    );
}

// API lấy lịch sử hội thoại
app.get('/conversation/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const session = sessions[sessionId];

    if (!session) {
        return res.status(404).json({ error: 'Không tìm thấy phiên hội thoại' });
    }

    // Chỉ trả về tin nhắn của người dùng và AI (không trả về system message)
    const conversationHistory = session.messages.slice(1);
    res.json({ history: conversationHistory });
});

// API xóa hội thoại
app.delete('/conversation/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    if (sessions[sessionId]) {
        delete sessions[sessionId];
        res.json({ success: true, message: 'Đã xóa phiên hội thoại' });
    } else {
        res.status(404).json({ error: 'Không tìm thấy phiên hội thoại' });
    }
});

app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
    if (!process.env.OPENAI_API_KEY) {
        console.error('⚠️ OPENAI_API_KEY chưa được thiết lập trong .env');
    } else {
        console.log('✅ OPENAI_API_KEY đã được cấu hình.');
    }
});