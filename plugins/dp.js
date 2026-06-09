export default {
    name: 'dp',
    async execute(sock, msg, args) {
        const remoteJid = msg.key.remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');
        let targetJid = '';

        // 1. Parse targets (.pp 94xxx, .pp @user, etc.)
        if (args.length > 0) {
            let input = args.join('').trim();
            if (input.startsWith('@')) {
                input = input.replace(/[^0-9]/g, '');
            } else {
                input = input.replace(/[^0-9]/g, '');
            }
            if (input.length > 5) {
                targetJid = `${input}@s.whatsapp.net`;
            }
        }

        if (!targetJid && msg.message.extendedTextMessage?.contextInfo?.participant) {
            targetJid = msg.message.extendedTextMessage.contextInfo.participant;
        }

        if (!targetJid && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }

        if (!targetJid) {
            targetJid = isGroup ? (msg.key.participant || msg.participant) : remoteJid;
        }

        const cleanNumber = targetJid.split('@')[0];
        const footerText = `\n\n---` +
                           `\n🤖 *Bot:* wa.exe` +
                           `\n👨‍💻 *Developer:* DINUWA.DEV` +
                           `\n📅 *Generated:* ${new Date().toLocaleDateString()}`;

        let ppUrl = null;

        try {
            // --- FIX: Raw WhatsApp Binary Node Query ---
            // This manually queries the WhatsApp server node directly, bypassing Baileys' broken token logic.
            const result = await sock.query({
                tag: 'iq',
                attrs: {
                    target: targetJid,
                    to: '@s.whatsapp.net',
                    type: 'get',
                    xmlns: 'w:profile:picture'
                },
                content: [
                    { tag: 'picture', attrs: { type: 'image', query: 'url' } }
                ]
            });

            // Find the child node containing the image attribute
            const pictureNode = result.content?.find(node => node.tag === 'picture');
            if (pictureNode && pictureNode.attrs && pictureNode.attrs.url) {
                ppUrl = pictureNode.attrs.url;
            }
        } catch (rawError) {
            // Fallback to preview type query if high-res node fails
            try {
                const resultPreview = await sock.query({
                    tag: 'iq',
                    attrs: {
                        target: targetJid,
                        to: '@s.whatsapp.net',
                        type: 'get',
                        xmlns: 'w:profile:picture'
                    },
                    content: [
                        { tag: 'picture', attrs: { type: 'preview', query: 'url' } }
                    ]
                });
                const pictureNodePreview = resultPreview.content?.find(node => node.tag === 'picture');
                if (pictureNodePreview && pictureNodePreview.attrs && pictureNodePreview.attrs.url) {
                    ppUrl = pictureNodePreview.attrs.url;
                }
            } catch (e) {
                ppUrl = null;
            }
        }

        // 3. Send Response
        if (ppUrl) {
            await sock.sendMessage(remoteJid, {
                image: { url: ppUrl },
                caption: `👤 *User Profile Details*\n\n• *Target:* @${cleanNumber}\n• *Status:* Picture fetched successfully!${footerText}`,
                mentions: [targetJid]
            }, { quoted: msg });
        } else {
            await sock.sendMessage(remoteJid, {
                text: `👤 *User Profile Details*\n\n• *Target:* @${cleanNumber}\n• *Status:* Picture hidden or restricted by privacy settings.${footerText}`,
                mentions: [targetJid]
            }, { quoted: msg });
        }
    }
};

