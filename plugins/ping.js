export default {
    name: 'ping',
    description: 'Responds with a pong status to verify responsiveness',
    async execute(sock, msg, { remoteJid }) {
        await sock.sendMessage(remoteJid, { 
            text: 'bot is alive' 
        }, { quoted: msg });
    }
};
