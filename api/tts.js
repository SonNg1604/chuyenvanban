const fetch = require('node-fetch');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const FPT_API_KEY = process.env.FPT_API_KEY; 
const FPT_API_URL = 'https://api.fpt.ai/hmi/tts/v5';

module.exports = async (req, res) => {
    // Xử lý CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { text, voice, speed } = req.body;
        if (!text || !voice) {
            return res.status(400).json({ error: 'Thiếu dữ liệu văn bản hoặc giọng đọc.' });
        }

        let audioBuffer;

        // --- TRƯỜNG HỢP 1: MICROSOFT EDGE (SỬA LỖI STREAM) ---
        if (voice.includes('Neural')) {
            console.log(`Đang gọi Microsoft Edge TTS (${voice})...`);
            const tts = new MsEdgeTTS();
            await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
            
            const readable = await tts.toStream(text);
            
            // SỬA LỖI: Dùng Promise để đọc stream thay vì for-await
            audioBuffer = await new Promise((resolve, reject) => {
                const chunks = [];
                readable.on('data', (chunk) => chunks.push(chunk));
                readable.on('end', () => resolve(Buffer.concat(chunks)));
                readable.on('error', (err) => reject(err));
            });
        }
        
        // --- TRƯỜNG HỢP 2: GIỌNG FPT.AI ---
        else {
            if (!FPT_API_KEY) {
                return res.status(500).json({ error: 'Chưa thiết lập FPT API Key trên Vercel!' });
            }
            
            console.log(`Đang gọi FPT.AI (${voice})...`);
            
            const response = await fetch(FPT_API_URL, {
                method: 'POST',
                headers: { 
                    'api-key': FPT_API_KEY, 
                    'voice': voice, 
                    'speed': speed || '', 
                    'Content-Type': 'text/plain' 
                },
                body: text
            });

            const data = await response.json();
            if (!response.ok || !data.async) { 
                throw new Error(data.message || 'Lỗi từ FPT.AI (Không lấy được link)'); 
            }

            console.log(`Link FPT ok, đang tải về server...`);
            const audioResponse = await fetch(data.async);
            if (!audioResponse.ok) {
                throw new Error("Không thể tải file MP3 từ link FPT.");
            }
            audioBuffer = await audioResponse.buffer();
        }

        // Gửi file về client
        console.log("Đã xong, gửi file về client.");
        res.setHeader('Content-Type', 'audio/mpeg');
        res.status(200).send(audioBuffer);

    } catch (error) {
        console.error("Lỗi Server:", error.message);
        res.status(500).json({ error: error.message });
    }
};
