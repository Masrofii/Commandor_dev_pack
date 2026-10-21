'use strict';
const T = {
  en: {
    'start.welcome': '🛡️ <b>Commandor Mail</b> — Email Infrastructure Platform\n──────────────────────────────\nHigh-performance email alias management, subdomains, and cloud routing right inside Telegram.\nGenerate instant aliases, claim custom identities (e.g. <code>name-ca@commandor.my.id</code>), receive verification codes in real time, and deploy edge-hosted sites.\n\n📬 <b>EMAIL ACTIONS</b>\n• <b>/inbox</b> — Incoming mail & instant OTP extraction\n• <b>/aliases</b> — Manage & toggle active email aliases\n• <b>/new</b> — Instant disposable address\n• <b>/custom &lt;name&gt;</b> — Protected custom alias (with <code>-ca</code>)\n• <b>/burner</b> — 1-hour self-destructing address\n\n🌐 <b>INFRASTRUCTURE & TOOLS</b>\n• <b>/subdomains</b> — Subdomain routing & reverse proxy\n• <b>/hosting</b> — Edge cloud hosting & server nodes\n• <b>/api</b> — REST API keys & developer documentation\n• <b>/search</b> — Search incoming messages\n• <b>/web</b> — Web Dashboard with real-time sync\n• <b>/stats</b> — Account usage & storage metrics\n• <b>/help</b> — Complete command guide\n──────────────────────────────\n👇 <i>Choose an action below to get started:</i>',
    'alias.created': '✨ <b>New Email Alias Generated!</b>\n──────────────────────────────\n📬 <code>{address}</code>\n<i>(Tap address above to copy)</i>\n\n🏷 <b>Type:</b> {type}\n⏳ <b>Status:</b> Active (Ready for mail)\n⏳ <b>Expires:</b> {expires}\n──────────────────────────────',
    'alias.custom_created': '✨ <b>Custom Protected Alias Created!</b>\n──────────────────────────────\n📬 <code>{address}</code>\n<i>(Tap address above to copy)</i>\n\n🛡 <b>Security:</b> Enforced with protected <code>-ca</code> suffix\n⏳ <b>Expires:</b> Permanent (Unlimited)\n──────────────────────────────\nReady to receive incoming emails.',
    'alias.custom_prompt': '🎨 <b>Create Custom Alias</b>\n──────────────────────────────\nPlease reply with your desired alias name (e.g. <code>finance</code> or <code>github</code>).\n\nYour address will be:\n<code>[name]-ca@commandor.my.id</code>\n\n🛡 <i>Note: All custom aliases include <b>-ca</b> to protect against claiming system and administrative usernames.</i>',
    'alias.limit_reached': '❌ <b>Alias limit reached ({limit})</b>\nPlease remove an existing alias first using /aliases.',
    'alias.not_found': '❌ Alias not found or already deleted.',
    'alias.deleted': '🗑 <b>Alias deleted successfully:</b>\n<code>{address}</code>',
    'alias.none': '📭 <b>You do not have any active aliases.</b>\n\nUse <b>/new</b> for an instant alias, <b>/custom</b> for a custom name, or <b>/burner</b> for a 1-hour burner address.',
    'alias.header': '✉️ <b>Commandor Mail — Aliases</b> ({count} total):\n──────────────────────────────',
    'burner.created': '🔥 <b>1-Hour Burner Alias Activated!</b>\n──────────────────────────────\n📬 <code>{address}</code>\n<i>(Tap address above to copy)</i>\n\n⏳ <b>Self-destructs:</b> {expires}\n⚠️ <i>All messages and this address will be permanently erased at expiry.</i>\n──────────────────────────────',
    'domain.none': '❌ No domains currently configured on this server.',
    'inbox.empty': '📭 <b>Inbox is empty.</b>\nEmails sent to your aliases will arrive here instantly with real-time push notifications.',
    'inbox.header': '📥 <b>Commandor Mail — Inbox</b> ({count} messages):\n──────────────────────────────',
    'inbox.filter.unread': '🔵 <b>Filter:</b> Unread emails\n',
    'inbox.filter.starred': '⭐ <b>Filter:</b> Starred emails\n',
    'notifications.new_email': '📬 <b>Commandor Mail — New Email Received!</b>\n──────────────────────────────\n📬 <b>To:</b> <code>{alias}</code>\n👤 <b>From:</b> <b>{from}</b>\n📌 <b>Subject:</b> <b>{subject}</b>\n{otpBlock}\n📝 <b>Preview:</b>\n{preview}{spamWarning}\n──────────────────────────────',
    'help.text': '📖 <b>Commandor Mail — Command Reference</b>\n──────────────────────────────\n\n📬 <b>Email Management</b>\n• <b>/inbox</b> — View received messages & OTP verification codes\n• <b>/aliases</b> — List, toggle, and manage your aliases\n• <b>/new</b> — Generate an instant disposable alias\n• <b>/custom &lt;name&gt;</b> — Create a custom protected alias\n• <b>/burner</b> — Create a 1-hour self-destructing address\n• <b>/search &lt;query&gt;</b> — Search your received emails\n\n🌐 <b>Infrastructure & Edge</b>\n• <b>/subdomains</b> — Manage subdomains, reverse proxy & capture\n• <b>/hosting</b> — Deploy lightweight sites & server nodes\n• <b>/api</b> — REST API key management & tokens\n\n⚙️ <b>Dashboard & Account</b>\n• <b>/web</b> — Web Dashboard with live synchronization\n• <b>/login</b> — Generate an instant 10-minute web session token\n• <b>/stats</b> — Account storage & resource metrics\n• <b>/settings</b> — Language and notification preferences\n• <b>/help</b> — Display this reference manual\n──────────────────────────────',
    'api.header': '🔑 <b>API Key Management</b>\n──────────────────────────────\nManage REST API tokens to programmatically automate Commandor Mail from external apps and CLI tools.\n\n<b>Active Keys:</b> ({count})\n{keysList}',
    'api.none': '📭 You do not have any active API keys.\n\nTap "➕ Generate API Key" below to create one.',
    'admin.denied': '⛔ <b>Access Denied:</b> This area is restricted to authorized platform administrators.',
    'web.open': '🌍 <b>Commandor Mail Web Dashboard</b>\nAccess the full-featured web dashboard with reading panes and domain tools:\n\n🔗 {url}',
    'login.link': '🔑 <b>Commandor Mail — Instant Web Login Link</b>\n──────────────────────────────\nTap the button below or open this URL in your browser to sign in:\n\n{url}\n\n⏱ <i>Valid for 10 minutes. Keep this token private.</i>',
    'search.prompt': '🔎 <b>Search Emails</b>\nEnter your search keyword (matches sender, subject, or message body):',
    'search.empty': '❌ Search query cannot be empty.',
    'search.none': '📭 No messages found matching "<b>{query}</b>".',
    'search.header': '🔎 <b>Search Results for "{query}":</b>\n──────────────────────────────',
    'reply.prompt': '✍️ <b>Reply to Email</b>\nType your message below and send it. It will be delivered to the sender:',
    'reply.sent': '✅ <b>Reply sent successfully!</b>',
    'settings.header': '⚙️ <b>Settings & Preferences</b>\n──────────────────────────────\nCurrent language: <b>{language}</b>\n\nSelect your preferred language:',
    'settings.updated': '✅ <b>Settings updated successfully!</b>',
    'stats.header': '📊 <b>Account Usage & Resource Metrics</b>\n──────────────────────────────',
    'stats.body': '✉️ <b>Active Aliases:</b> {aliases}\n📥 <b>Total Emails:</b> {emails}\n💾 <b>Storage:</b> {storage}\n{progressBar}',
    'error.generic': '❌ An error occurred. Please try again.'
  },
  ar: {
    'start.welcome': '🛡️ <b>منصة Commandor Mail للبريد وإدارة البنية التحتية</b>\n──────────────────────────────\nمنصة متقدمة لإنشاء وتوجيه البريد الإلكتروني، النطاقات الفرعية، والاستضافة السحابية من تيليجرام مباشرة.\nيمكنك إنشاء عناوين بريد فورية، عناوين مخصصة مثل <code>name-ca@commandor.my.id</code>، استقبال رموز التفعيل (OTP) ونشر مواقع سحابية.\n\n📬 <b>البريد الإلكتروني</b>\n• <b>/inbox</b> — صندوق الوارد ورموز التفعيل الفورية\n• <b>/aliases</b> — إدارة وتفعيل العناوين البريدية\n• <b>/new</b> — عنوان بريدي مؤقت فوري\n• <b>/custom &lt;اسم&gt;</b> — عنوان مخصص محمي بـ <code>-ca</code>\n• <b>/burner</b> — عنوان مؤقت لمدة ساعة ذاتي التدمير\n\n🌐 <b>البنية التحتية والأدوات</b>\n• <b>/subdomains</b> — النطاقات الفرعية والبروكسي العكسي\n• <b>/hosting</b> — الاستضافة السحابية وخوادم النود\n• <b>/api</b> — مفاتيح REST API للربط البرمجي\n• <b>/search</b> — البحث في الرسائل\n• <b>/web</b> — لوحة تحكم الويب المباشرة\n• <b>/stats</b> — إحصائيات الاستهلاك والمساحة\n• <b>/help</b> — دليل الأوامر الكامل\n──────────────────────────────\n👇 <i>اختر ما تريد من الأزرار أدناه:</i>',
    'alias.created': '✨ <b>تم إنشاء عنوان بريدي جديد!</b>\n──────────────────────────────\n📬 <code>{address}</code>\n<i>(اضغط على العنوان بالأعلى لنسخه)</i>\n\n🏷 <b>النوع:</b> {type}\n⏳ <b>الصلاحية:</b> {expires}\n──────────────────────────────\nجاهز لاستقبال الرسائل فوراً.',
    'alias.custom_created': '✨ <b>تم إنشاء عنوان البريد المخصص!</b>\n──────────────────────────────\n📬 <code>{address}</code>\n<i>(اضغط على العنوان بالأعلى لنسخه)</i>\n\n🛡 <b>الحماية:</b> مدمج باللاحقة المحمية <code>-ca</code>\n⏳ <b>الصلاحية:</b> دائم (غير محدود)\n──────────────────────────────\nجاهز لاستقبال الرسائل فوراً.',
    'alias.custom_prompt': '🎨 <b>إنشاء عنوان بريد مخصص</b>\n──────────────────────────────\nأرسل الاسم المطلوب (مثال: <code>finance</code> أو <code>github</code>).\n\nسيكون عنوانك تلقائياً:\n<code>[name]-ca@commandor.my.id</code>\n\n🛡 <i>ملاحظة: تنتهي جميع العناوين المخصصة بـ <b>-ca</b> لحماية الأسماء الإدارية والنظام.</i>',
    'alias.limit_reached': '❌ <b>تم الوصول للحد الأقصى ({limit})</b>\nيرجى حذف عنوان قديم أولاً عبر /aliases.',
    'alias.not_found': '❌ لم يتم العثور على العنوان أو تم حذفه.',
    'alias.deleted': '🗑 <b>تم حذف العنوان بنجاح:</b>\n<code>{address}</code>',
    'alias.none': '📭 <b>ليس لديك أي عناوين بريد حالياً.</b>\n\nاستخدم <b>/new</b> لإنشاء عنوان أو <b>/custom</b> لعنوان مخصص أو <b>/burner</b> لعنوان مؤقت لمدة ساعة.',
    'alias.header': '✉️ <b>Commandor Mail — عناوين البريد</b> ({count} إجمالي):\n──────────────────────────────',
    'burner.created': '🔥 <b>تم تفعيل العنوان المؤقت (1-Hour Burner)!</b>\n──────────────────────────────\n📬 <code>{address}</code>\n<i>(اضغط على العنوان بالأعلى لنسخه)</i>\n\n⏳ <b>ينتهي في:</b> {expires}\n⚠️ <i>سيتم حذف العنوان وكافة رسائله نهائياً عند الانتهاء.</i>\n──────────────────────────────',
    'domain.none': '❌ لا تتوفر نطاقات حالياً لإنشاء عناوين.',
    'inbox.empty': '📭 <b>صندوق الوارد فارغ.</b>\nستظهر الرسائل الواردة هنا تلقائياً وبشكل فوري مع إشعارات مباشرة.',
    'inbox.header': '📥 <b>Commandor Mail — صندوق الوارد</b> ({count} رسالة):\n──────────────────────────────',
    'inbox.filter.unread': '🔵 <b>تصفية:</b> الرسائل غير المقروءة\n',
    'inbox.filter.starred': '⭐ <b>تصفية:</b> الرسائل المميزة بنجمة\n',
    'notifications.new_email': '📬 <b>Commandor Mail — وصلت رسالة جديدة!</b>\n──────────────────────────────\n📬 <b>إلى:</b> <code>{alias}</code>\n👤 <b>من:</b> <b>{from}</b>\n📌 <b>الموضوع:</b> <b>{subject}</b>\n{otpBlock}\n📝 <b>المعاينة:</b>\n{preview}{spamWarning}\n──────────────────────────────',
    'help.text': '📖 <b>Commandor Mail — دليل الأوامر</b>\n──────────────────────────────\n\n📬 <b>إدارة البريد</b>\n• <b>/inbox</b> — عرض الرسائل الواردة ورموز OTP\n• <b>/aliases</b> — عرض وإدارة وحذف عناوينك\n• <b>/new</b> — إنشاء عنوان مؤقت فوري\n• <b>/custom &lt;اسم&gt;</b> — إنشاء عنوان مخصص (<code>name-ca@commandor.my.id</code>)\n• <b>/burner</b> — إنشاء عنوان مؤقت لمدة ساعة\n• <b>/search &lt;بحث&gt;</b> — البحث في الرسائل\n\n🌐 <b>البنية التحتية والسحابة</b>\n• <b>/subdomains</b> — النطاقات الفرعية والبروكسي العكسي\n• <b>/hosting</b> — الاستضافة السحابية ونود الخوادم\n• <b>/api</b> — إدارة مفاتيح REST API\n\n⚙️ <b>اللوحة والحساب</b>\n• <b>/web</b> — فتح لوحة تحكم الويب\n• <b>/login</b> — رابط دخول سريع لمدة 10 دقائق\n• <b>/stats</b> — إحصائيات الاستهلاك والمساحة\n• <b>/settings</b> — تغيير اللغة\n• <b>/help</b> — عرض المساعدة\n──────────────────────────────',
    'api.header': '🔑 <b>إدارة مفاتيح API</b>\n──────────────────────────────\nإدارة مفاتيح REST API للربط البرمجي وأتمتة المنصة.\n\n<b>المفاتيح النشطة:</b> ({count})\n{keysList}',
    'api.none': '📭 ليس لديك أي مفاتيح API نشطة حالياً.\n\nاضغط على "➕ إنشاء مفتاح API" بالأسفل لإنشاء مفتاح.',
    'admin.denied': '⛔ <b>تم رفض الوصول:</b> هذه المنطقة مخصصة لإدارة المنصة فقط.',
    'web.open': '🌍 <b>لوحة تحكم الويب Commandor Mail</b>\nتصفح رسائلك ونطاقاتك المخصصة من المتصفح:\n\n🔗 {url}',
    'login.link': '🔑 <b>رابط الدخول المباشر للويب</b>\n──────────────────────────────\nاضغط على الزر أدناه للدخول إلى حسابك:\n\n{url}\n\n⏱ <i>صالح لمدة 10 دقائق فقط. لا تشارك هذا الرابط.</i>',
    'search.prompt': '🔎 <b>البحث في الرسائل</b>\nأدخل نص البحث (الموضوع، المرسل، أو المحتوى):',
    'search.empty': '❌ نص البحث لا يمكن أن يكون فارغاً.',
    'search.none': '📭 لم يتم العثور على رسائل تطابق "<b>{query}</b>".',
    'search.header': '🔎 <b>نتائج البحث عن "{query}":</b>\n──────────────────────────────',
    'reply.prompt': '✍️ <b>الرد على الرسالة</b>\nأرسل نص الرد في رسالتك التالية وسيتم تسليمه للمرسل:',
    'reply.sent': '✅ <b>تم إرسال الرد بنجاح!</b>',
    'settings.header': '⚙️ <b>الإعدادات واللغة</b>\n──────────────────────────────\nاللغة الحالية: <b>{language}</b>\n\nاختر لغتك المفضلة:',
    'settings.updated': '✅ <b>تم تحديث الإعدادات بنجاح!</b>',
    'stats.header': '📊 <b>إحصائيات حسابك</b>\n──────────────────────────────',
    'stats.body': '✉️ <b>العناوين النشطة:</b> {aliases}\n📥 <b>إجمالي الرسائل:</b> {emails}\n💾 <b>المساحة المستخدمة:</b> {storage}\n{progressBar}',
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
