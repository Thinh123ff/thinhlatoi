require('dotenv').config();
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const csvParse = require('csv-parse/sync');
const { encode } = require('gpt-3-encoder');
const axios = require('axios');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const app = express();
const port = 5000;
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Lưu trữ phiên hội thoại
const sessions = {};

// Hàm đếm token từ messages
function countTokensFromMessages(messages) {
    const flatContent = messages
        .map(msg => {
            if (typeof msg.content === 'string') return msg.content;
            if (Array.isArray(msg.content)) {
                return msg.content.map(item => item.text || '').join(' ');
            }
            return '';
        })
        .join(' ');
    return encode(flatContent).length;
}

// Tạo hoặc lấy phiên hội thoại
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

🧠 Hỗ trợ các lĩnh vực lập trình, nấu ăn, sức khỏe cơ bản...

- Nếu có nội dung dạng liệt kê, hãy dùng **danh sách gạch đầu dòng**.
- Nếu nội dung có thể phân loại, hãy dùng **bảng markdown**.
- Trả lời ngắn gọn trước, chi tiết ở phần sau nếu cần.
- Nếu là mã code, hãy đặt trong block markdown như \`\`\`ngôn_ngữ\`\`\`.
- Giải thích rõ ràng, **thân thiện**, ngắn gọn.
- Khi cần, hãy trình bày bằng bảng, danh sách hoặc định dạng markdown rõ ràng.
- Biết điều chỉnh **giọng văn** tùy theo nội dung: kỹ thuật → chi tiết; đời sống → đơn giản, dễ hiểu.
- Nếu mô tả sự khác biệt, hãy tạo bảng ✅❌ để so sánh, giúp người đọc dễ hiểu hơn.
- Kết thúc trả lời có thể hỏi lại nhẹ nhàng, thân thiện thêm icon phù hợp ngữ cảnh.

📂 Nếu người dùng tải lên file:
- Đọc kỹ nội dung file và mô tả lại cho người dùng dễ hiểu.
- Dùng chính xác tên file trong phản hồi.

🧠 Phạm vi hỗ trợ:
- Lập trình, kỹ thuật, tài liệu, học tập, nấu ăn, sức khỏe cơ bản, kỹ năng mềm, kinh doanh nhỏ.
- Tìm kiếm thông tin nâng cao nếu có công cụ hỗ trợ.

📌 Tránh trả lời hời hợt hoặc “không biết”. Nếu chưa chắc, hãy hỏi lại để làm rõ.

🌐 Nếu câu hỏi liên quan đến: link, website, địa chỉ trang web, tên miền... bạn KHÔNG cần đoán hay tạo ra. Hệ thống sẽ tìm kiếm web và hiển thị kết quả. Bạn chỉ phản hồi đơn giản nếu cần.

🧠 Luôn nhớ ngữ cảnh hội thoại trước đó để trả lời mạch lạc.

✅ Mục tiêu: Giúp người dùng hiểu sâu hơn hoặc khám phá điều gì đó hữu ích!

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
            createdAt: new Date()
        };
    }
    return sessions[sessionId];
}

// Dọn dẹp phiên hết hạn (phiên cũ hơn 24 giờ)
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

// Chạy dọn dẹp mỗi giờ
setInterval(cleanupSessions, 1000 * 60 * 60);

app.post('/ask', upload.array('files'), async (req, res) => {
    const message = req.body.message || '';
    const files = req.files || [];
    const sessionId = req.body.sessionId || 'default';

    try {
        const session = getOrCreateSession(sessionId);

        const content = [
            { type: 'text', text: `\n${message}` }
        ];

        for (const file of files) {
            const buffer = fs.readFileSync(file.path);
            const mime = file.mimetype;
            const filename = file.originalname;

            try {
                if (mime === 'application/pdf') {
                    const pdfData = await pdfParse(buffer);
                    content.push({
                        type: 'text',
                        text: `📄 **Nội dung từ file PDF _${filename}_**:\n\n${pdfData.text.slice(0, 5000)}`
                    });
                } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                    const result = await mammoth.extractRawText({ buffer });
                    content.push({
                        type: 'text',
                        text: `📝 **Nội dung từ file Word _${filename}_**:\n\n${result.value.slice(0, 5000)}`
                    });
                } else if (mime === 'text/csv') {
                    const csvText = buffer.toString('utf8');
                    const records = csvParse.parse(csvText, { columns: true });
                    const preview = JSON.stringify(records.slice(0, 3), null, 2);
                    content.push({
                        type: 'text',
                        text: `📊 **Dữ liệu CSV từ _${filename}_ (3 dòng đầu)**:\n\n\`\`\`json\n${preview}\n\`\`\``
                    });
                } else if (mime.startsWith('image/')) {
                    const base64 = buffer.toString('base64');
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: `data:${mime};base64,${base64}`,
                            detail: 'auto'
                        }
                    });
                } else {
                    const textContent = buffer.toString('utf8').slice(0, 5000);
                    content.push({
                        type: 'text',
                        text: `📎 **Nội dung từ file _${filename}_**:\n\n${textContent}`
                    });
                }
            } catch (err) {
                content.push({
                    type: 'text',
                    text: `⚠️ Không thể xử lý nội dung từ file _${filename}_.`
                });
            }
        }

        // Thêm tin nhắn người dùng vào phiên
        session.messages.push({
            role: 'user',
            content: content
        });

        // Giới hạn số lượng tin nhắn để không vượt quá token
        const maxMessagesToKeep = 2; // Có thể điều chỉnh theo nhu cầu
        if (session.messages.length > maxMessagesToKeep + 1) { // +1 cho system message
            session.messages = [
                session.messages[0], // Giữ system message
                ...session.messages.slice(-(maxMessagesToKeep))
            ];
        }

        const tokenLimit = 4000;
        const promptTokens = countTokensFromMessages(session.messages);
        const safeMaxTokens = Math.max(100, Math.min(2000, tokenLimit - promptTokens));

        console.log('Đang gửi yêu cầu đến OpenRouter...');
        console.log(`promptTokens: ${promptTokens}, max_tokens: ${safeMaxTokens}`);
        console.log(`Session ${sessionId} có ${session.messages.length} tin nhắn`);

        if (promptTokens >= tokenLimit - 100) {
            console.warn(`Cảnh báo: promptTokens (${promptTokens}) gần vượt giới hạn token (${tokenLimit}).`);
        }

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-4o',
                messages: session.messages,
                max_tokens: safeMaxTokens,
                temperature: 0.7,
                stream: false
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'http://localhost:5000',
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );

        // Xoá file tạm
        files.forEach(f => fs.unlinkSync(f.path));

        if (response.data && response.data.choices?.length > 0 && response.data.choices[0].message) {
            const aiReply = response.data.choices[0].message.content;

            // Thêm phản hồi của AI vào phiên
            session.messages.push({
                role: 'assistant',
                content: aiReply
            });

            res.json({
                reply: aiReply,
                sessionId: sessionId
            });
        } else {
            console.error('Cấu trúc phản hồi không hợp lệ:', response.data);
            res.status(500).json({ reply: "Lỗi cấu trúc phản hồi từ OpenRouter. Vui lòng kiểm tra console." });
        }
    } catch (err) {
        console.error('Lỗi khi gọi API OpenRouter:');
        if (err.response) {
            console.error('Mã lỗi:', err.response.status);
            console.error('Dữ liệu lỗi:', err.response.data);
            res.status(500).json({
                reply: `Lỗi từ OpenRouter: ${err.response.data?.error?.message || 'Không xác định'}`
            });
        } else if (err.request) {
            console.error('Không nhận được phản hồi:', err.request);
            res.status(500).json({ reply: "Không nhận được phản hồi từ OpenRouter. Vui lòng kiểm tra kết nối mạng." });
        } else {
            console.error('Lỗi:', err.message);
            res.status(500).json({ reply: `Lỗi khi gửi yêu cầu: ${err.message}` });
        }
    }
});

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
    if (!process.env.OPENROUTER_API_KEY) {
        console.error('CẢNH BÁO: OPENROUTER_API_KEY không được thiết lập!');
    } else {
        console.log('OPENROUTER_API_KEY đã được cấu hình.');
    }
});