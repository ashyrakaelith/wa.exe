export default {
    name: 'info',
    description: 'Returns metadata regarding context execution parameters',
    async execute(sock, msg, { remoteJid, sender }) {
        const infoText = `*Modular Metadata Routing:*\n\n` +
                         `• Sender Identity: @${sender.split('@')[0]}\n` +
                         `• Channel Domain: ${remoteJid.endsWith('@g.us') ? 'Group Infrastructure' : 'Direct Conversation'}`;

        await sock.sendMessage(remoteJid, { 
            text: infoText, 
            mentions: [sender] 
        }, { quoted: msg });
    }
};
