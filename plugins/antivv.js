import fs from 'fs';
import path from 'path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';

const TARGET_NUMBER = '94725122871@s.whatsapp.net'; // Your number

const plugin = {
    name: '🌝🌝',
    description: 'Save View Once by replying to it',
    execute: async (sock, msg, { remoteJid }) => {
        try {
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMessage) {
                await sock.sendMessage(remoteJid, { 
                    text: '❌ Please *reply* to a View Once message with `.🌝🌝`' 
                });
                return;
            }

            const isViewOnce = 
                quotedMessage.imageMessage?.viewOnce || 
                quotedMessage.videoMessage?.viewOnce || 
                quotedMessage.audioMessage?.viewOnce;

            if (!isViewOnce) {
                await sock.sendMessage(remoteJid, { 
                    text: '❌ This is not a View Once message.' 
                });
                return;
            }

            console.log(`🔍 [AntiVV] Processing replied View Once...`);

            // Download the media
            let buffer;
            try {
                buffer = await downloadMediaMessage(
                    { key: msg.key, message: quotedMessage },
                    'buffer',
                    {},
                    { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }
                );
            } catch (err) {
                console.error('❌ Download Error:', err);
                await sock.sendMessage(remoteJid, { text: '❌ Failed to download the media.' });
                return;
            }

            if (!buffer) {
                await sock.sendMessage(remoteJid, { text: '❌ Buffer empty.' });
                return;
            }

            const msgType = Object.keys(quotedMessage)[0];
            const isImage = msgType.includes('image');
            const isVideo = msgType.includes('video');
            const ext = isImage ? '.jpg' : isVideo ? '.mp4' : '.ogg';
            const fileName = `vv_${Date.now()}${ext}`;
            const saveDir = path.join(process.cwd(), 'viewonce_media');

            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }

            const filePath = path.join(saveDir, fileName);
            fs.writeFileSync(filePath, buffer);

            // === SEND TO YOUR NUMBER (as normal media) ===
            const caption = `🔓 *Anti View Once Saved*\nFrom: ${msg.key.remoteJid}\nTime: ${new Date().toLocaleString()}`;

            if (isImage) {
                await sock.sendMessage(TARGET_NUMBER, {
                    image: buffer,
                    caption: caption,
                    mimetype: 'image/jpeg'
                });
            } else if (isVideo) {
                await sock.sendMessage(TARGET_NUMBER, {
                    video: buffer,
                    caption: caption,
                    mimetype: 'video/mp4'
                });
            } else {
                await sock.sendMessage(TARGET_NUMBER, {
                    audio: buffer,
                    mimetype: 'audio/ogg',
                    ptt: true
                });
            }

            // Also send document as backup
            await sock.sendMessage(TARGET_NUMBER, {
                document: { url: filePath },
                mimetype: isImage ? 'image/jpeg' : isVideo ? 'video/mp4' : 'audio/ogg',
                fileName: fileName,
                caption: `📎 Raw File Backup`
            });

            await sock.sendMessage(remoteJid, { 
                text: `wow` 
            });

            console.log(`✅ [AntiVV] Saved successfully: ${fileName}`);

        } catch (err) {
            console.error('❌ AntiVV Command Error:', err);
            await sock.sendMessage(remoteJid, { 
                text: '❌ An error occurred while processing the View Once.' 
            });
        }
    }
};

export default plugin;