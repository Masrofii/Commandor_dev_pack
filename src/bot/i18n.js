'use strict';
const T = {
  en: {
    'start.welcome': '👋 <b>Welcome to TempMail Manager!</b>\n\nYour secure, private disposable and custom email service right inside Telegram.\nGenerate instant throwaway addresses, custom aliases (e.g. <code>example-ca@commandor.my.id</code>), receive verification codes in real-time, and manage your API directly through this bot.\n\n⚡ <b>Quick Actions:</b>\n• <b>/new</b> — Instant disposable alias\n• <b>/custom &lt;name&gt;</b> — Custom alias (with protected -ca)\n• <b>/burner</b> — 1-hour self-destructing address\n• <b>/inbox</b> — Check received emails & OTPs\n• <b>/aliases</b> — Manage your addresses\n• <b>/api</b> — Manage REST API keys\n• <b>/stats</b> — Account usage & storage (Unlimited)\n• <b>/web</b> — Web dashboard with live sync\n• <b>/help</b> — Complete command guide\n\n👇 <i>Choose an action below to get started:</i>',
    'alias.created': '✨ <b>New Email Alias Created!</b>\n──────────────────\n📬 <code>{address}</code>\n<i>(Tap address above to copy)</i>\n\n🏷 <b>Type:</b> {type}\n⏳ <b>Expires:</b> {expires}\n──────────────────\nReady to receive incoming emails.',
    'alias.custom_created': '✨ <b>Custom Email Alias Created!</b>\n──────────────────\n📬 <code>{address}</code>\n<i>(Tap address above to copy)</i>\n\n🛡 <b>Security:</b> Enforced with protected <code>-ca</code> suffix\n⏳ <b>Expires:</b> Permanent (Unlimited)\n──────────────────\nReady to receive incoming emails.',
    'alias.custom_prompt': '✏️ <b>Create Custom Alias</b>\n──────────────────\nPlease reply with your desired name (e.g. <code>example</code>).\n\nYour address will automatically be:\n<code>[name]-ca@commandor.my.id</code>\n\n🛡 <i>Note: All custom aliases end with <b>-ca</b> to protect against claiming owner or admin addresses.</i>',
    'alias.limit_reached': '❌ <b>Alias limit reached ({limit})</b>\nPlease delete an existing alias first using /aliases.',
    'alias.not_found': '❌ Alias not found or already deleted.',
    'alias.deleted': '🗑 <b>Alias deleted successfully:</b>\n<code>{address}</code>',
    'alias.none': '📭 <b>You don\'t have any aliases yet.</b>\n\nUse <b>/new</b> for an instant alias, <b>/custom</b> for a named alias, or <b>/burner</b> for a 1-hour disposable address.',
    'alias.header': '📧 <b>Your Email Aliases</b> ({count} total):\n──────────────────',
    'burner.created': '🔥 <b>Burner Alias Active!</b>\n──────────────────\n📬 <code>{address}</code>\n<i>(Tap address above to copy)</i>\n\n⏳ <b>Self-destructs:</b> {expires}\n⚠️ <i>All messages and this alias will be permanently erased at expiry.</i>\n──────────────────',
    'domain.none': '❌ No domains available for creating aliases.',
    'inbox.empty': '📭 <b>Your inbox is empty.</b>\nEmails sent to your aliases will appear here in real-time.',
    'inbox.header': '📬 <b>Inbox</b> ({count} emails):\n──────────────────',
    'inbox.filter.unread': '🔵 <b>Filter:</b> Unread emails\n',
    'inbox.filter.starred': '⭐ <b>Filter:</b> Starred emails\n',
    'notifications.new_email': '📬 <b>New Email Received!</b>\n──────────────────\nTo: <code>{alias}</code>\nFrom: <b>{from}</b>\nSubject: <b>{subject}</b>\n{otpBlock}\n📝 <b>Preview:</b>\n{preview}{spamWarning}\n──────────────────',
    'help.text': '📖 <b>TempMail Manager — Commands Guide</b>\n──────────────────\n\n⚡ <b>Email Aliases</b>\n• <b>/new</b> — Create a new disposable alias\n• <b>/custom &lt;name&gt;</b> — Create custom alias (<code>name-ca@commandor.my.id</code>)\n• <b>/burner</b> — Create a 1-hour self-destructing address\n• <b>/aliases</b> — List, copy, or delete your aliases\n\n📬 <b>Inbox & Search</b>\n• <b>/inbox</b> — View received messages & OTP codes\n• <b>/search &lt;query&gt;</b> — Search your emails\n\n🔑 <b>Developer & API</b>\n• <b>/api</b> — Manage REST API keys & view guide\n\n🌐 <b>Web & Account</b>\n• <b>/web</b> — Web Dashboard with live sync\n• <b>/login</b> — Generate 10-minute login link\n• <b>/stats</b> — Account usage & storage (Unlimited)\n• <b>/settings</b> — Switch language\n• <b>/help</b> — Show this guide\n──────────────────',
    'api.header': '🔑 <b>API Key Management</b>\n──────────────────\nManage REST API tokens to automate TempMail from apps and scripts.\n\n<b>Your Active Keys:</b> ({count})\n{keysList}',
    'api.none': '📭 You don\'t have any active API keys.\n\nTap "➕ Generate API Key" below to create one.',
    'admin.denied': '⛔ <b>Access Denied:</b> This area is restricted to the platform owner/admin.',
    'web.open': '🌐 <b>TempMail Web Dashboard</b>\nAccess your messages, custom domains, and live inbox:\n\n🔗 {url}',
    'login.link': '🔑 <b>Instant Web Login Link</b>\n──────────────────\nTap the button below or open this link to log in:\n\n{url}\n\n⏱ <i>Valid for 10 minutes. Do not share this link.</i>',
    'search.prompt': '🔎 <b>Search Emails</b>\nPlease enter your search keyword (subject, sender, or content):',
    'search.empty': '❌ Search query cannot be empty.',
    'search.none': '📭 No emails found matching "<b>{query}</b>".',
    'search.header': '🔎 <b>Search Results for "{query}":</b>\n──────────────────',
    'reply.prompt': '✍️ <b>Reply to Email</b>\nType your message below and send it. It will be delivered to the sender:',
    'reply.sent': '✅ <b>Reply sent successfully!</b>',
    'settings.header': '⚙️ <b>Settings & Preferences</b>\n──────────────────\nCurrent language: <b>{language}</b>\n\nSelect your preferred language:',
    'settings.updated': '✅ <b>Settings updated successfully!</b>',
    'stats.header': '📊 <b>Your Account Statistics</b>\n──────────────────',
    'stats.body': '📧 <b>Active Aliases:</b> {aliases}\n📨 <b>Total Received:</b> {emails}\n💾 <b>Storage:</b> {storage}\n{progressBar}',
    'error.generic': '❌ An error occurred. Please try again.'
  },
  ar: {
    'start.welcome': '👋 <b>مرحباً بك في TempMail Manager!</b>\n\nخدمتك الآمنة لإنشاء عناوين بريد مؤقتة ومخصصة واستقبال رسائل التفعيل وإدارة API من تيليجرام مباشرة.\nيمكنك إنشاء عناوين مخصصة مثل <code>example-ca@commandor.my.id</code> واستقبال رسائل غير محدودة.\n\n⚡ <b>إجراءات سريعة:</b>\n• <b>/new</b> — إنشاء عنوان مؤقت فوري\n• <b>/custom &lt;اسم&gt;</b> — إنشاء عنوان مخصص (محمي بـ ca-)\n• <b>/burner</b> — عنوان مؤقت لمدة ساعة ذاتي التدمير\n• <b>/inbox</b> — صندوق الوارد ورموز التفعيل\n• <b>/aliases</b> — إدارة عناوينك\n• <b>/api</b> — إدارة مفاتيح API\n• <b>/stats</b> — إحصائيات الحساب والاستهلاك (غير محدود)\n• <b>/web</b> — لوحة التحكم بالويب\n• <b>/help</b> — دليل الأوامر الكامل\n\n👇 <i>اختر ما تريد من الأزرار أدناه:</i>',
    'alias.created': '✨ <b>تم إنشاء عنوان بريد جديد!</b>\n──────────────────\n📬 <code>{address}</code>\n<i>(اضغط على العنوان بالأعلى لنسخه)</i>\n\n🏷 <b>النوع:</b> {type}\n⏳ <b>الصلاحية:</b> {expires}\n──────────────────\nجاهز لاستقبال الرسائل فوراً.',
    'alias.custom_created': '✨ <b>تم إنشاء عنوان البريد المخصص!</b>\n──────────────────\n📬 <code>{address}</code>\n<i>(اضغط على العنوان بالأعلى لنسخه)</i>\n\n🛡 <b>الحماية:</b> مدمج باللاحقة المحمية <code>ca-</code>\n⏳ <b>الصلاحية:</b> دائم (غير محدود)\n──────────────────\nجاهز لاستقبال الرسائل فوراً.',
    'alias.custom_prompt': '✏️ <b>إنشاء عنوان بريد مخصص</b>\n──────────────────\nأرسل الاسم المطلوب (مثال: <code>example</code>).\n\nسيكون عنوانك تلقائياً:\n<code>[name]-ca@commandor.my.id</code>\n\n🛡 <i>ملاحظة: تنتهي جميع العناوين المخصصة بـ <b>ca-</b> لمنع ادعاء ملكية الإدارة أو المالك.</i>',
    'alias.limit_reached': '❌ <b>تم الوصول للحد الأقصى ({limit})</b>\nيرجى حذف عنوان قديم أولاً عبر /aliases.',
    'alias.not_found': '❌ لم يتم العثور على العنوان.',
    'alias.deleted': '🗑 <b>تم حذف العنوان بنجاح:</b>\n<code>{address}</code>',
    'alias.none': '📭 <b>ليس لديك أي عناوين بريد حالياً.</b>\n\nاستخدم <b>/new</b> لإنشاء عنوان أو <b>/custom</b> لعنوان مخصص أو <b>/burner</b> لعنوان مؤقت.',
    'alias.header': '📧 <b>عناوين البريد الخاصة بك</b> ({count} إجمالي):\n──────────────────',
    'burner.created': '🔥 <b>تم تفعيل العنوان المؤقت!</b>\n──────────────────\n📬 <code>{address}</code>\n<i>(اضغط على العنوان بالأعلى لنسخه)</i>\n\n⏳ <b>ينتهي في:</b> {expires}\n⚠️ <i>سيتم حذف العنوان وكافة رسائله نهائياً عند الانتهاء.</i>\n──────────────────',
    'domain.none': '❌ لا تتوفر نطاقات حالياً لإنشاء عناوين.',
    'inbox.empty': '📭 <b>صندوق الوارد فارغ.</b>\nستظهر الرسائل الواردة هنا تلقائياً وبشكل فوري.',
    'inbox.header': '📬 <b>صندوق الوارد</b> ({count} رسالة):\n──────────────────',
    'inbox.filter.unread': '🔵 <b>تصفية:</b> الرسائل غير المقروءة\n',
    'inbox.filter.starred': '⭐ <b>تصفية:</b> الرسائل المميزة بنجمة\n',
    'notifications.new_email': '📬 <b>وصلت رسالة جديدة!</b>\n──────────────────\nإلى: <code>{alias}</code>\nمن: <b>{from}</b>\nالموضوع: <b>{subject}</b>\n{otpBlock}\n📝 <b>المعاينة:</b>\n{preview}{spamWarning}\n──────────────────',
    'help.text': '📖 <b>دليل أوامر TempMail Manager</b>\n──────────────────\n\n⚡ <b>عناوين البريد</b>\n• <b>/new</b> — إنشاء عنوان بريد مؤقت جديد\n• <b>/custom &lt;اسم&gt;</b> — إنشاء عنوان مخصص (<code>name-ca@commandor.my.id</code>)\n• <b>/burner</b> — إنشاء عنوان مؤقت لمدة ساعة\n• <b>/aliases</b> — عرض وإدارة وحذف عناوينك\n\n📬 <b>صندوق الوارد والبحث</b>\n• <b>/inbox</b> — عرض الرسائل الواردة ورموز OTP\n• <b>/search &lt;بحث&gt;</b> — البحث في الرسائل\n\n🔑 <b>المطورين و API</b>\n• <b>/api</b> — إدارة مفاتيح REST API واستعراض الدليل\n\n🌐 <b>الويب والحساب</b>\n• <b>/web</b> — فتح لوحة تحكم الويب\n• <b>/login</b> — رابط دخول سريع لمدة 10 دقائق\n• <b>/stats</b> — إحصائيات الاستهلاك والمساحة (غير محدود)\n• <b>/settings</b> — تغيير اللغة\n• <b>/help</b> — عرض المساعدة\n──────────────────',
    'api.header': '🔑 <b>إدارة مفاتيح API</b>\n──────────────────\nإدارة مفاتيح REST API للربط البرمجي وأتمتة استقبال الرسائل.\n\n<b>المفاتيح النشطة:</b> ({count})\n{keysList}',
    'api.none': '📭 ليس لديك أي مفاتيح API نشطة حالياً.\n\nاضغط على "➕ إنشاء مفتاح API" بالأسفل لإنشاء مفتاح.',
    'admin.denied': '⛔ <b>تم رفض الوصول:</b> هذه المنطقة مخصصة لمالك المنصة والمسؤول فقط.',
    'web.open': '🌐 <b>لوحة تحكم الويب TempMail</b>\nتصفح رسائلك ونطاقاتك المخصصة من المتصفح:\n\n🔗 {url}',
    'login.link': '🔑 <b>رابط الدخول المباشر للويب</b>\n──────────────────\nاضغط على الزر أدناه للدخول إلى حسابك:\n\n{url}\n\n⏱ <i>صالح لمدة 10 دقائق فقط. لا تشارك هذا الرابط.</i>',
    'search.prompt': '🔎 <b>البحث في الرسائل</b>\nأدخل نص البحث (الموضوع، المرسل، أو المحتوى):',
    'search.empty': '❌ نص البحث لا يمكن أن يكون فارغاً.',
    'search.none': '📭 لم يتم العثور على رسائل تطابق "<b>{query}</b>".',
    'search.header': '🔎 <b>نتائج البحث عن "{query}":</b>\n──────────────────',
    'reply.prompt': '✍️ <b>الرد على الرسالة</b>\nأرسل نص الرد في رسالتك التالية وسيتم تسليمه للمرسل:',
    'reply.sent': '✅ <b>تم إرسال الرد بنجاح!</b>',
    'settings.header': '⚙️ <b>الإعدادات واللغة</b>\n──────────────────\nاللغة الحالية: <b>{language}</b>\n\nاختر لغتك المفضلة:',
    'settings.updated': '✅ <b>تم تحديث الإعدادات بنجاح!</b>',
    'stats.header': '📊 <b>إحصائيات حسابك</b>\n──────────────────',
    'stats.body': '📧 <b>العناوين النشطة:</b> {aliases}\n📨 <b>إجمالي الرسائل:</b> {emails}\n💾 <b>المساحة المستخدمة:</b> {storage}\n{progressBar}',
    'error.generic': '❌ حدث خطأ، يرجى المحاولة مرة أخرى.'
  }
};

function t(key, lang = 'en', vars = {}) {
  const lm = T[lang] || T.en;
  let s = lm[key] || T.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v !== undefined && v !== null ? v : '');
  }
  return s;
}

module.exports = { t, translations: T };
