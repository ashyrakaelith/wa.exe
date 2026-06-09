import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { startWebServer, logMessage, logError, logInfo } from './web.js';

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

async function loadPlugins() {
    const pluginsDir = path.join(process.cwd(), 'plugins');
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);

    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
        try {
            const mod = await import(`./plugins/${file}?t=${Date.now()}`);
            const plugin = mod.default;
            if (plugin && plugin.name && typeof plugin.execute === 'function') {
                plugins.set(plugin.name.toLowerCase(), plugin);
                console.log(`📡 Loaded plugin: [${plugin.name}]`);
            }
        } catch (err) {
            console.error(`❌ Error loading plugin ${file}:`, err);
            logError(`Plugin load: ${file}`, err);
        }
    }
    console.log(`✅ Total plugins: ${plugins.size}\n`);
    logInfo(`✅ Loaded ${plugins.size} plugin(s): ${[...plugins.keys()].join(', ') || 'none'}`);
}

async function connectBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (!sock.authState.creds.registered) {
        let phoneNumber = process.env.PHONE_NUMBER;
        if (!phoneNumber && isInteractive) {
            phoneNumber = await askQuestion('Enter your WhatsApp phone number with country code: ');
        }
        if (!phoneNumber) {
            const msg = 'No phone number provided. Set the PHONE_NUMBER environment variable and restart.';
            console.error('❌ ' + msg);
            logError('Auth', new Error(msg));
            process.exit(1);
        }
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(cleanNumber);
                console.log(`\n====================================`);
                console.log(`Pairing Code: \x1b[32m${code}\x1b[0m`);
                console.log(`====================================\n`);
                logInfo(`🔑 Pairing code for ${cleanNumber}: ${code}`);
            } catch (err) {
                console.error('Pairing code error:', err);
                logError('Pairing code', err);
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
            if (shouldReconnect) {
                logInfo('🔄 Reconnecting…');
                connectBot();
            } else {
                logInfo('🚫 Logged out. Restart the bot to re-authenticate.');
            }
        } else if (connection === 'open') {
            console.log('🚀 Bot Connected!');
            logInfo('🚀 Bot Connected!');
        } else if (connection === 'connecting') {
            logInfo('⏳ Connecting to WhatsApp…');
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            if (!msg.message) return;

            const remoteJid = msg.key.remoteJid;
            const isFromMe = msg.key.fromMe;
            const messageType = Object.keys(msg.message)[0];

            const body = messageType === 'conversation'
                ? msg.message.conversation
                : messageType === 'extendedTextMessage'
                    ? msg.message.extendedTextMessage.text
                    : '';

            const text = body.trim();
            const sender = isFromMe
                ? (sock.user?.id?.split(':')[0] + '@s.whatsapp.net')
                : (msg.key.participant || remoteJid);

            console.log(`📥 [${isFromMe ? 'OUT' : 'IN'}] ${remoteJid} | ${text ? text.substring(0, 60) : messageType}`);

            logMessage({
                direction: isFromMe ? 'out' : 'in',
                from: sender,
                to: remoteJid,
                text: text || null,
                messageType,
                timestamp: new Date().toISOString()
            });

            if (!text.startsWith(prefix)) return;

            const args = text.slice(prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const plugin = plugins.get(commandName);
            if (!plugin) return;

            console.log(`🔧 Executing command: .${commandName}`);
            await plugin.execute(sock, msg, { args, remoteJid, sender });

        } catch (err) {
            console.error('❌ Core Error:', err);
            logError('Core message handler', err);
        }
    });
}

async function main() {
    startWebServer(5000);
    await loadPlugins();
    await connectBot();
}

main();
