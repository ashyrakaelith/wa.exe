import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

const isInteractive = process.stdin.isTTY;

async function askQuestion(text) {
    if (!isInteractive) return null;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

const plugins = new Map();
const prefix = '.'; 
let sockGlobal = null;

async function loadPlugins() {
    const pluginsDir = path.join(process.cwd(), 'plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);

    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    
    for (const file of files) {
        try {
            const pluginModule = await import(`./plugins/${file}?t=${Date.now()}`);
            const plugin = pluginModule.default;
            if (plugin && plugin.name && typeof plugin.execute === 'function') {
                plugins.set(plugin.name.toLowerCase(), plugin);
                console.log(`📡 Loaded plugin: [${plugin.name}]`);
            }
        } catch (error) {
            console.error(`❌ Error loading plugin ${file}:`, error);
        }
    }
    console.log(`✅ Total plugins: ${plugins.size}\n`);
}

async function startBot() {
    await loadPlugins();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sockGlobal = sock;

    if (!sock.authState.creds.registered) {
        let phoneNumber = process.env.PHONE_NUMBER;

        if (!phoneNumber && isInteractive) {
            phoneNumber = await askQuestion('Enter your WhatsApp phone number with country code: ');
        }

        if (!phoneNumber) {
            console.error('❌ No phone number provided. Set the PHONE_NUMBER environment variable (e.g. 1234567890) and restart.');
            process.exit(1);
        }

        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(cleanNumber);
                console.log(`\n====================================`);
                console.log(`Pairing Code: \x1b[32m${code}\x1b[0m`);
                console.log(`====================================\n`);
            } catch (error) {
                console.error('Pairing code error:', error);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) 
                ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut 
                : true;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('🚀 Bot Connected!');
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message) return;

            const remoteJid = msg.key.remoteJid;
            const isFromMe = msg.key.fromMe;
            const messageType = Object.keys(msg.message)[0];

            const body = messageType === 'conversation' ? msg.message.conversation :
                        messageType === 'extendedTextMessage' ? msg.message.extendedTextMessage.text : '';

            const text = body.trim();

            console.log(`📥 [IN] ${isFromMe ? 'SELF' : 'OTHER'} | ${remoteJid} | ${text ? text.substring(0,60) : messageType}`);

            if (!text.startsWith(prefix)) return;

            const args = text.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();

            const plugin = plugins.get(commandName);
            if (!plugin) return;

            const sender = isFromMe ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : msg.key.participant || remoteJid;

            console.log(`🔧 Executing command: .${commandName}`);
            await plugin.execute(sock, msg, { args, remoteJid, sender });

        } catch (err) {
            console.error('❌ Core Error:', err);
        }
    });
}

startBot();
