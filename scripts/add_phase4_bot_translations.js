'use strict';
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../src/i18n/locales');
const webLocalesPath = path.join(__dirname, '../web/lib/locales.json');
const LANGS = ['en', 'ar', 'ru', 'fr', 'es', 'de', 'tr', 'pt', 'zh', 'hi', 'id', 'ur'];

const BOT_KEYS = {
  'bot.tos.detailed': {
    en: `📜 <b>DETAILED TERMS OF SERVICE & ACCEPTABLE USE</b>
──────────────────────────────
<b>1. Acceptance of Terms</b>
By interacting with this bot, API, web dashboard, or edge hosting nodes, you legally agree to adhere to these Terms of Service.

<b>2. Acceptable Use Policy</b>
You agree to use this platform only for lawful communications, software testing, personal portfolios, and verified development.
Strictly Prohibited:
• Distribution of malicious software (trojans, worms, ransomware)
• Hosting or linking to phishing or fraudulent login pages
• Unauthorized vulnerability scanning or DDoS orchestration
• Copyright infringement or hosting pirated content
• Cryptocurrency mining scripts in any form

<b>3. Service Availability & Quotas</b>
We reserve the right to limit, throttle, or suspend accounts that generate anomalous network traffic, overload hosting nodes, or attempt unauthorized privilege escalation.

<b>4. Logging & Security Scanners</b>
All deployed files and system actions undergo automatic heuristics and signature checks. Malicious signatures result in immediate blocking and audit logging.

<b>5. Modification of Terms</b>
Terms may be updated periodically to reflect security requirements. Continuing to use the bot constitutes acceptance of modified terms.
──────────────────────────────`,
    ar: `📜 <b>شروط الخدمة المفصلة والاستخدام المقبول</b>
──────────────────────────────
<b>1. قبول الشروط</b>
من خلال تفاعلك مع هذا البوت، أو واجهة البرمجة (API)، أو لوحة التحكم، أو عقد الاستضافة، فإنك توافق قانونياً على الالتزام بشروط الخدمة هذه.

<b>2. سياسة الاستخدام المقبول</b>
أنت توافق على استخدام هذه المنصة فقط للاتصالات المشروعة، واختبار البرمجيات، والمشاريع الشخصية، والتطوير المعتمد.
يُحظر تماماً:
• نشر البرمجيات الخبيثة (أحصنة طروادة، الديدان، برامج الفدية)
• استضافة أو ربط صفحات التصيد الاحتيالي أو تسجيل الدخول المزيفة
• فحص الثغرات الأمنية دون إذن أو شن هجمات حجب الخدمة (DDoS)
• انتهاك حقوق الطبع والنشر أو استضافة المحتوى المقرصن
• نصوص تعدين العملات الرقمية المشفرة بأي شكل من الأشكال

<b>3. توفر الخدمة والحصص</b>
نحتفظ بالحق في تقييد أو تعليق الحسابات التي تولد حركة مرور شبكية غير طبيعية، أو تفرط في تحميل عقد الاستضافة، أو تحاول تصعيد الامتيازات دون تصريح.

<b>4. التسجيل وفاحصات الأمان</b>
تخضع جميع الملفات المنشورة والإجراءات لفحص دوري وتلقائي. تؤدي التهديدات المكتشفة إلى الحظر الفوري وتوثيق الواقعة في سجلات التدقيق.

<b>5. تعديل الشروط</b>
قد يتم تحديث الشروط دورياً لتلبية المتطلبات الأمنية. استمرارك في استخدام البوت يعد قبولاً للشروط المحدثة.
──────────────────────────────`,
    ru: `📜 <b>ПОЛНЫЕ УСЛОВИЯ ОБСЛУЖИВАНИЯ И ПРАВИЛА ИСПОЛЬЗОВАНИЯ</b>
──────────────────────────────
<b>1. Принятие условий</b>
Используя данного бота, API, веб-панель или серверные узлы, вы подтверждаете согласие с настоящими Условиями обслуживания.

<b>2. Политика допустимого использования</b>
Платформа предназначена исключительно для законных коммуникаций, тестирования ПО и подтвержденной разработки.
Строго запрещено:
• Распространение вредоносного ПО (трояны, вирусы, вымогатели)
• Размещение фишинговых и мошеннических страниц
• Несанкционированное сканирование уязвимостей или DDoS-атаки
• Нарушение авторских прав или размещение пиратского контента
• Любые скрипты для майнинга криптовалют

<b>3. Доступность сервиса и лимиты</b>
Администрация оставляет за собой право ограничивать или блокировать учетные записи при аномальной нагрузке или попытках взлома.

<b>4. Аудит и сканеры безопасности</b>
Все загружаемые файлы автоматически проверяются сканерами безопасности. Вредоносный контент немедленно блокируется.

<b>5. Изменение условий</b>
Условия могут периодически обновляться. Дальнейшее использование платформы означает согласие с изменениями.
──────────────────────────────`,
    fr: `📜 <b>CONDITIONS D'UTILISATION DÉTAILLÉES & UTILISATION ACCEPTABLE</b>
──────────────────────────────
<b>1. Acceptation des conditions</b>
En utilisant ce bot, l'API, le tableau de bord ou les nœuds d'hébergement, vous acceptez légalement de respecter ces Conditions.

<b>2. Politique d'utilisation acceptable</b>
Vous acceptez d'utiliser cette plateforme uniquement pour des communications légales et le développement vérifié.
Strictement interdit :
• Diffusion de logiciels malveillants
• Hébergement de pages de phishing ou frauduleuses
• Attaques DDoS ou scans non autorisés
• Violation de droits d'auteur
• Scripts de minage de cryptomonnaies

<b>3. Disponibilité et quotas</b>
Nous nous réservons le droit de suspendre tout compte générant un trafic anormal ou abusif.
──────────────────────────────`,
    es: `📜 <b>TÉRMINOS DE SERVICIO DETALLADOS Y USO ACEPTABLE</b>
──────────────────────────────
<b>1. Aceptación de los términos</b>
Al interactuar con este bot, API, panel web o nodos de alojamiento, acepta legalmente estos Términos de Servicio.

<b>2. Política de uso aceptable</b>
Acepta utilizar esta plataforma únicamente para comunicaciones legítimas y desarrollo verificado.
Estrictamente prohibido:
• Distribución de malware
• Páginas de phishing o fraudulentas
• Escaneos no autorizados o ataques DDoS
• Minería de criptomonedas de cualquier tipo
──────────────────────────────`,
    de: `📜 <b>AUSFÜHRLICHE NUTZUNGSBEDINGUNGEN</b>
──────────────────────────────
<b>1. Annahme der Bedingungen</b>
Durch die Nutzung dieses Bots, der API, des Web-Dashboards oder der Hosting-Knoten stimmen Sie diesen Bedingungen rechtsverbindlich zu.

<b>2. Richtlinie für akzeptable Nutzung</b>
Ausschließlich für rechtmäßige Kommunikation und Entwicklung vorgesehen.
Streng verboten:
• Malware und Ransomware
• Phishing-Seiten
• DDoS-Angriffe
• Krypto-Mining jeglicher Art
──────────────────────────────`,
    tr: `📜 <b>AYRINTILI HİZMET ŞARTLARI VE KABUL EDİLEBİLİR KULLANIM</b>
──────────────────────────────
<b>1. Şartların Kabulü</b>
Bu bot, API, web paneli veya sunucu düğümleri ile etkileşime girerek bu Hizmet Şartlarını yasal olarak kabul etmiş olursunuz.

<b>2. Kabul Edilebilir Kullanım Politikası</b>
Yalnızca yasal iletişim ve doğrulanmış geliştirme amacıyla kullanılabilir.
Kesinlikle Yasaktır:
• Kötü amaçlı yazılımlar
• Kimlik avı (phishing) sayfaları
• Yetkisiz taramalar veya DDoS saldırıları
• Kripto para madenciliği
──────────────────────────────`,
    pt: `📜 <b>TERMOS DE SERVIÇO DETALHADOS E USO ACEITÁVEL</b>
──────────────────────────────
<b>1. Aceitação dos Termos</b>
Ao usar este bot, API, painel web ou nós de hospedagem, você concorda legalmente com estes Termos de Serviço.

<b>2. Política de Uso Aceitável</b>
Destinado apenas para comunicações legítimas e desenvolvimento verificado.
Estritamente proibido:
• Distribuição de malware
• Hospedagem de páginas de phishing
• Ataques DDoS
• Mineração de criptomoedas
──────────────────────────────`,
    zh: `📜 <b>详细服务条款与可接受使用政策</b>
──────────────────────────────
<b>1. 条款接受</b>
使用本机器人、API、网页控制台或托管节点即表示您同意遵守本服务条款。

<b>2. 可接受使用政策</b>
仅限用于合法的网络通信、软件测试和正规开发。
严禁行为：
• 传播恶意软件或勒索软件
• 托管钓鱼盗号页面
• 发起DDoS攻击或未授权扫描
• 任何形式的加密货币挖矿
──────────────────────────────`,
    hi: `📜 <b>विस्तृत सेवा की शर्तें और स्वीकार्य उपयोग नीति</b>
──────────────────────────────
<b>1. शर्तों की स्वीकृति</b>
इस बॉट, एपीआई, वेब डैशबोर्ड या होस्टिंग नोड्स का उपयोग करके आप इन सेवा शर्तों से सहमत होते हैं।

<b>2. स्वीकार्य उपयोग नीति</b>
केवल वैध संचार और सॉफ़्टवेयर विकास के लिए अनुमत है।
सख्त वर्जित:
• मैलवेयर या वायरस का प्रसार
• फ़िशिंग या धोखाधड़ी वाले पृष्ठ
• डीडीओएस हमले
• क्रिप्टो माइनिंग
──────────────────────────────`,
    id: `📜 <b>SYARAT KETENTUAN LAYANAN & PENGGUNAAN TEPAT</b>
──────────────────────────────
<b>1. Penerimaan Ketentuan</b>
Dengan berinteraksi dengan bot ini, API, atau dasbor web, Anda secara hukum menyetujui Ketentuan Layanan ini.

<b>2. Kebijakan Penggunaan</b>
Hanya untuk komunikasi yang sah dan pengembangan perangkat lunak.
Dilarang Keras:
• Penyebaran malware
• Halaman phishing
• Serangan DDoS
• Penambangan kripto dalam bentuk apa pun
──────────────────────────────`,
    ur: `📜 <b>تفصیلی سروس کی شرائط اور قابل قبول استعمال</b>
──────────────────────────────
<b>1. شرائط کی قبولیت</b>
اس بوٹ، API، یا ویب ڈیش بورڈ کا استعمال کرتے ہوئے آپ قانونی طور پر ان سروس شرائط پر عمل کرنے کے پابند ہیں۔

<b>2. قابل قبول استعمال کی پالیسی</b>
صرف قانونی مواصلات اور تصدیق شدہ سافٹ ویئر ڈویلپمنٹ کے لیے مجاز ہے۔
سختی سے ممنوع:
• میلویئر یا وائرس پھیلانا
• فشنگ یا دھوکہ دہی کے صفحات
• DDoS حملے
• کسی بھی قسم کی کرپٹو کرنسی مائننگ
──────────────────────────────`
  },
  'bot.tos.declined': {
    en: '❌ <b>Terms of Service Declined</b>\n\nYou have chosen not to accept the Terms of Service. Platform access remains locked.\n\nWhenever you change your mind, tap <b>Accept Terms</b> below or send /start.',
    ar: '❌ <b>تم رفض شروط الخدمة</b>\n\nلقد اخترت عدم قبول شروط الخدمة. يظل الوصول إلى المنصة مغلقاً.\n\nعندما تغير رأيك، اضغط على <b>قبول الشروط</b> أدناه أو أرسل /start.',
    ru: '❌ <b>Условия обслуживания отклонены</b>\n\nВы отказались принять условия. Доступ к платформе заблокирован.\n\nЕсли вы передумаете, нажмите <b>Принять условия</b> ниже или отправьте /start.',
    fr: '❌ <b>Conditions d\'utilisation refusées</b>\n\nVous avez choisi de ne pas accepter les conditions. L\'accès reste verrouillé.\n\nAppuyez sur <b>Accepter les conditions</b> ci-dessous ou envoyez /start pour continuer.',
    es: '❌ <b>Términos de servicio rechazados</b>\n\nHa decidido no aceptar los términos. El acceso permanece bloqueado.\n\nToque <b>Aceptar términos</b> a continuación o envíe /start cuando desee continuar.',
    de: '❌ <b>Nutzungsbedingungen abgelehnt</b>\n\nSie haben die Bedingungen abgelehnt. Der Zugriff bleibt gesperrt.\n\nTippen Sie unten auf <b>Bedingungen akzeptieren</b> oder senden Sie /start, um fortzufahren.',
    tr: '❌ <b>Hizmet Şartları Reddedildi</b>\n\nHizmet Şartlarını kabul etmemeyi seçtiniz. Platform erişimi kilitli kalacaktır.\n\nDevam etmek istediğinizde aşağıdaki <b>Şartları Kabul Et</b> butonuna dokunun veya /start gönderin.',
    pt: '❌ <b>Termos de Serviço Recusados</b>\n\nVocê optou por não aceitar os termos. O acesso permanece bloqueado.\n\nToque em <b>Aceitar Termos</b> abaixo ou envie /start para continuar.',
    zh: '❌ <b>已拒绝服务条款</b>\n\n您选择拒绝服务条款。平台访问权限将保持锁定。\n\n如需继续使用，请点击下方的<b>接受条款</b>或发送 /start。',
    hi: '❌ <b>सेवा की शर्तें अस्वीकार कर दी गईं</b>\n\nआपने शर्तों को स्वीकार नहीं करना चुना है। प्लेटफ़ॉर्म का उपयोग अवरुद्ध रहेगा।\n\nआगे बढ़ने के लिए नीचे <b>शर्तें स्वीकार करें</b> पर टैप करें या /start भेजें।',
    id: '❌ <b>Ketentuan Layanan Ditolak</b>\n\nAnda telah memilih untuk tidak menerima ketentuan. Akses platform tetap terkunci.\n\nKetuk <b>Terima Ketentuan</b> di bawah ini atau kirim /start untuk melanjutkan.',
    ur: '❌ <b>سروس کی شرائط مسترد کر دی گئیں</b>\n\nآپ نے شرائط کو قبول نہ کرنے کا انتخاب کیا ہے۔ پلیٹ فارم تک رسائی مقفل رہے گی۔\n\nجاری رکھنے کے لیے نیچے <b>شرائط قبول کریں</b> پر ٹیپ کریں یا /start بھیجیں۔'
  },
  'bot.privacy_title': {
    en: '🛡️ <b>Commandor Dev Pack — Privacy & Security Architecture</b>',
    ar: '🛡️ <b>حزمة تطوير كوماندور — بنية الخصوصية والأمان</b>',
    ru: '🛡️ <b>Commandor Dev Pack — Архитектура конфиденциальности и безопасности</b>',
    fr: '🛡️ <b>Commandor Dev Pack — Architecture de confidentialité et sécurité</b>',
    es: '🛡️ <b>Commandor Dev Pack — Arquitectura de privacidad y seguridad</b>',
    de: '🛡️ <b>Commandor Dev Pack — Datenschutz- & Sicherheitsarchitektur</b>',
    tr: '🛡️ <b>Commandor Dev Pack — Gizlilik ve Güvenlik Mimarisi</b>',
    pt: '🛡️ <b>Commandor Dev Pack — Arquitetura de Privacidade e Segurança</b>',
    zh: '🛡️ <b>Commandor Dev Pack — 隐私与安全架构</b>',
    hi: '🛡️ <b>कमांडोर देव पैक — गोपनीयता और सुरक्षा वास्तुकला</b>',
    id: '🛡️ <b>Commandor Dev Pack — Arsitektur Privasi & Keamanan</b>',
    ur: '🛡️ <b>کمانڈر دیو پیک — پرائیویسی اور سیکیورٹی فن تعمیر</b>'
  },
  'bot.privacy_desc': {
    en: `Your privacy is our core engineering requirement:

• <b>Zero Plaintext Logging:</b> Incoming messages are encrypted and isolated in storage, bound exclusively to your user identity.
• <b>HTML Sanitization:</b> All incoming email HTML is aggressively sanitized. Tracker beacons, malicious scripts, and cross-site requests are stripped.
• <b>1-Hour Burners:</b> Temporary aliases self-destruct automatically when their timer expires.
• <b>Data Sovereignty:</b> You can export your data anytime via <code>/export</code> or delete your emails and aliases on demand.
• <b>End-to-End Sessions:</b> Web sessions are hashed with SHA-256 and expire automatically.

<i>Commandor Dev Pack never sells, rents, or reads your personal communications.</i>`,
    ar: `خصوصيتك هي أولويتنا الهندسية الأساسية:

• <b>انعدام السجلات النصية الصريحة:</b> يتم تشفير الرسائل الواردة وعزلها في التخزين، وربطها حصرياً بهويتك.
• <b>تعقيم HTML الصارم:</b> يتم تنظيف وتعقيم كود HTML بالكامل وإزالة أدوات التتبع والنصوص البرمجية الضارة.
• <b>عناوين مؤقتة لمدة ساعة:</b> تدمر العناوين المؤقتة ذاتياً وبشكل تلقائي عند انتهاء مؤقتها.
• <b>سيادة البيانات:</b> يمكنك تصدير بياناتك في أي وقت عبر <code>/export</code> أو حذف رسائلك وعناوينك فورياً.
• <b>جلسات مشفرة:</b> يتم تشفير جلسات الويب باستخدام SHA-256 وتنتهي صلاحيتها تلقائياً.

<i>حزمة كوماندور لا تبيع ولا تؤجر ولا تطلع على اتصالاتك الشخصية أبداً.</i>`,
    ru: `Конфиденциальность — наш ключевой инженерный принцип:

• <b>Никаких открытых логов:</b> входящие сообщения изолированы и привязаны исключительно к вашему профилю.
• <b>Очистка HTML:</b> весь входящий HTML очищается от трекеров, вредоносных скриптов и шпионских пикселей.
• <b>1-часовые псевдонимы:</b> временные адреса самоуничтожаются автоматически по истечении таймера.
• <b>Суверенитет данных:</b> экспортируйте данные в любой момент с помощью <code>/export</code> или удаляйте их по требованию.
• <b>Безопасные сессии:</b> веб-сессии хэшируются через SHA-256 и автоматически истекают.

<i>Commandor Dev Pack никогда не продает и не читает вашу переписку.</i>`,
    fr: `Votre vie privée est au cœur de notre ingénierie :

• <b>Zéro journal en clair :</b> les messages sont chiffrés et isolés, liés uniquement à votre identité.
• <b>Nettoyage HTML :</b> les scripts malveillants et traqueurs sont systématiquement supprimés.
• <b>Alias temporaires d'une heure :</b> destruction automatique à l'expiration.
• <b>Souveraineté des données :</b> exportez vos données via <code>/export</code> à tout moment.

<i>Commandor Dev Pack ne lit ni ne vend jamais vos communications.</i>`,
    es: `Su privacidad es nuestro requisito de ingeniería principal:

• <b>Cero registros en texto plano:</b> los mensajes entrantes están aislados y vinculados únicamente a su usuario.
• <b>Sanitización de HTML:</b> se eliminan scripts maliciosos y rastreadores automáticamente.
• <b>Alias de 1 hora:</b> los alias temporales se autodestruyen al expirar su temporizador.
• <b>Soberanía de datos:</b> exporte sus datos en cualquier momento mediante <code>/export</code>.

<i>Commandor Dev Pack nunca vende ni lee sus comunicaciones personales.</i>`,
    de: `Ihre Privatsphäre ist unser oberstes Gebot:

• <b>Keine Klartextprotokollierung:</b> Eingehende Nachrichten sind isoliert und ausschließlich an Ihre Identität gebunden.
• <b>HTML-Bereinigung:</b> Tracker und schädliche Skripte werden automatisch entfernt.
• <b>1-Stunden-Brenner:</b> Temporäre Aliase zerstören sich nach Ablauf des Timers selbst.
• <b>Datenhoheit:</b> Exportieren Sie Ihre Daten jederzeit mit <code>/export</code>.

<i>Commandor Dev Pack liest oder verkauft Ihre Nachrichten niemals.</i>`,
    tr: `Gizliliğiniz temel mühendislik ilkemizdir:

• <b>Açık Metin Günlüğü Yok:</b> Gelen mesajlar şifrelenir ve yalnızca kimliğinize bağlanır.
• <b>HTML Temizleme:</b> İzleyiciler ve kötü amaçlı komut dosyaları otomatik olarak temizlenir.
• <b>1 Saatlik Geçici Adresler:</b> Süreleri dolduğunda otomatik olarak yok olurlar.
• <b>Veri Egemenliği:</b> Verilerinizi istediğiniz zaman <code>/export</code> ile dışa aktarabilirsiniz.

<i>Commandor Dev Pack kişisel verilerinizi asla satmaz veya okumaz.</i>`,
    pt: `Sua privacidade é nosso requisito essencial:

• <b>Zero registros em texto simples:</b> Mensagens recebidas são isoladas e vinculadas exclusivamente à sua identidade.
• <b>Sanitização de HTML:</b> Rastreadores e scripts maliciosos são removidos automaticamente.
• <b>Aliases de 1 hora:</b> Destroem-se automaticamente após o término do cronômetro.
• <b>Soberania dos dados:</b> Exporte seus dados a qualquer momento via <code>/export</code>.

<i>O Commandor Dev Pack nunca vende nem lê suas comunicações.</i>`,
    zh: `保护您的隐私是我们的核心设计原则：

• <b>零明文日志：</b> 收到的邮件完全隔离存储，且仅绑定到您的账户。
• <b>HTML严格清洗：</b> 自动过滤所有追踪探针、恶意脚本和跨站请求。
• <b>1小时自毁别名：</b> 倒计时结束后临时地址自动销毁。
• <b>数据主权：</b> 随时通过 <code>/export</code> 导出您的数据，或按需删除。

<i>Commandor Dev Pack 绝不出售、出租或读取您的私人通信。</i>`,
    hi: `आपकी गोपनीयता हमारी मुख्य इंजीनियरिंग आवश्यकता है:

• <b>शून्य प्लेनटेक्स्ट लॉगिंग:</b> संदेश एन्क्रिप्टेड और सुरक्षित रूप से अलग रखे जाते हैं।
• <b>HTML शुद्धिकरण:</b> दुर्भावनापूर्ण स्क्रिप्ट और ट्रैकर स्वचालित रूप से हटा दिए जाते हैं।
• <b>1-घंटे के बर्नर उपनाम:</b> समय समाप्त होने पर स्वचालित रूप से नष्ट हो जाते हैं।
• <b>डेटा संप्रभुता:</b> <code>/export</code> के माध्यम से कभी भी अपना डेटा निर्यात करें।

<i>कमांडोर देव पैक कभी भी आपके संचार को नहीं बेचता या पढ़ता है।</i>`,
    id: `Privasi Anda adalah persyaratan utama kami:

• <b>Nol Pencatatan Teks Biasa:</b> Pesan masuk dienkripsi dan diisolasi khusus untuk identitas Anda.
• <b>Sanitasi HTML:</b> Skrip berbahaya dan pelacak otomatis dihapus.
• <b>Alias 1 Jam:</b> Menghancurkan diri secara otomatis saat waktu habis.
• <b>Kedaulatan Data:</b> Ekspor data Anda kapan saja melalui <code>/export</code>.

<i>Commandor Dev Pack tidak pernah menjual atau membaca komunikasi Anda.</i>`,
    ur: `آپ کی پرائیویسی ہماری بنیادی انجینئرنگ ضرورت ہے:

• <b>زیرو پلین ٹیکسٹ لاگنگ:</b> آنے والے پیغامات کو محفوظ اور الگ تھلگ رکھا جاتا ہے۔
• <b>HTML صفائی:</b> نقصان دہ اسکرپٹس اور ٹریکرز کو خودکار طریقے سے صاف کیا جاتا ہے۔
• <b>1 گھنٹے کے برنر عرفی نام:</b> وقت ختم ہونے پر خود بخود ختم ہو جاتے ہیں۔
• <b>ڈیٹا کی خودمختاری:</b> <code>/export</code> کے ذریعے کسی بھی وقت اپنا ڈیٹا ایکسپورٹ کریں۔

<i>کمانڈر دیو پیک کبھی بھی آپ کے پیغامات کو نہیں پڑھتا اور نہ بیچتا ہے۔</i>`
  },
  'bot.support_title': {
    en: '🎧 <b>Commandor Dev Pack — Support & Helpdesk</b>',
    ar: '🎧 <b>حزمة كوماندور — الدعم والمساعدة الفنية</b>',
    ru: '🎧 <b>Commandor Dev Pack — Поддержка и справочный центр</b>',
    fr: '🎧 <b>Commandor Dev Pack — Support & Centre d\'aide</b>',
    es: '🎧 <b>Commandor Dev Pack — Soporte y Centro de Ayuda</b>',
    de: '🎧 <b>Commandor Dev Pack — Support & Hilfecenter</b>',
    tr: '🎧 <b>Commandor Dev Pack — Destek ve Yardım Masası</b>',
    pt: '🎧 <b>Commandor Dev Pack — Suporte e Central de Ajuda</b>',
    zh: '🎧 <b>Commandor Dev Pack — 帮助与技术支持</b>',
    hi: '🎧 <b>कमांडोर देव पैक — सहायता और हेल्पडेस्क</b>',
    id: '🎧 <b>Commandor Dev Pack — Bantuan & Dukungan</b>',
    ur: '🎧 <b>کمانڈر دیو پیک — سپورٹ اور ہیلپ ڈیسک</b>'
  },
  'bot.support_desc': {
    en: `Need assistance, want to report a bug, or request a feature?

👤 <b>Your Diagnostic ID:</b> <code>User #{userId}</code>
🤖 <b>Bot Service:</b> @{botUser}
👑 <b>Owner:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Direct Support:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    ar: `هل تحتاج إلى مساعدة، أو ترغب في الإبلاغ عن خطأ، أو طلب ميزة جديدة؟

👤 <b>معرف التشخيص الخاص بك:</b> <code>مستخدم #{userId}</code>
🤖 <b>خدمة البوت:</b> @{botUser}
👑 <b>المالك:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>الدعم المباشر:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    ru: `Нужна помощь, хотите сообщить об ошибке или предложить функцию?

👤 <b>Ваш диагностический ID:</b> <code>User #{userId}</code>
🤖 <b>Служба бота:</b> @{botUser}
👑 <b>Владелец:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Прямая поддержка:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    fr: `Besoin d'aide, envie de signaler un bug ou de demander une fonctionnalité ?

👤 <b>Votre ID diagnostic :</b> <code>User #{userId}</code>
🤖 <b>Service Bot :</b> @{botUser}
👑 <b>Propriétaire :</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Support direct :</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    es: `¿Necesita ayuda, desea reportar un error o solicitar una función?

👤 <b>Su ID de diagnóstico:</b> <code>User #{userId}</code>
🤖 <b>Servicio de Bot:</b> @{botUser}
👑 <b>Propietario:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Soporte directo:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    de: `Benötigen Sie Hilfe, möchten einen Fehler melden oder eine Funktion anfragen?

👤 <b>Ihre Diagnose-ID:</b> <code>User #{userId}</code>
🤖 <b>Bot-Dienst:</b> @{botUser}
👑 <b>Inhaber:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Direkter Support:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    tr: `Yardıma mı ihtiyacınız var, hata mı bildirmek istiyorsunuz?

👤 <b>Tanılama Kimliğiniz:</b> <code>User #{userId}</code>
🤖 <b>Bot Hizmeti:</b> @{botUser}
👑 <b>Sahip:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Doğrudan Destek:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    pt: `Precisa de ajuda, deseja relatar um bug ou sugerir um recurso?

👤 <b>Seu ID de Diagnóstico:</b> <code>User #{userId}</code>
🤖 <b>Serviço do Bot:</b> @{botUser}
👑 <b>Proprietário:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Suporte Direto:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    zh: `需要帮助、报告问题或提出新功能建议？

👤 <b>您的诊断ID：</b> <code>User #{userId}</code>
🤖 <b>机器人服务：</b> @{botUser}
👑 <b>平台所有者：</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>技术支持直达：</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    hi: `सहायता चाहिए, बग रिपोर्ट करना है या किसी सुविधा का अनुरोध करना है?

👤 <b>आपकी डायग्नोस्टिक आईडी:</b> <code>User #{userId}</code>
🤖 <b>बॉट सेवा:</b> @{botUser}
👑 <b>स्वामी:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>सीधा समर्थन:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    id: `Butuh bantuan, ingin melaporkan bug, atau meminta fitur?

👤 <b>ID Diagnostik Anda:</b> <code>User #{userId}</code>
🤖 <b>Layanan Bot:</b> @{botUser}
👑 <b>Pemilik:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>Dukungan Langsung:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`,
    ur: `مدد کی ضرورت ہے، کسی مسئلے کی اطلاع دینا چاہتے ہیں، یا فیچر کی درخواست کرنا چاہتے ہیں؟

👤 <b>آپ کی تشخیصی ID:</b> <code>User #{userId}</code>
🤖 <b>بوٹ سروس:</b> @{botUser}
👑 <b>مالک:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
💬 <b>براہ راست سپورٹ:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>`
  },
  'bot.credits_title': {
    en: '👑 <b>Commandor Dev Pack — Credits & Attribution</b>',
    ar: '👑 <b>حزمة كوماندور — الشكر والتقدير</b>',
    ru: '👑 <b>Commandor Dev Pack — Благодарности и авторство</b>',
    fr: '👑 <b>Commandor Dev Pack — Crédits & Attribution</b>',
    es: '👑 <b>Commandor Dev Pack — Créditos y Atribución</b>',
    de: '👑 <b>Commandor Dev Pack — Danksagung & Urheberschaft</b>',
    tr: '👑 <b>Commandor Dev Pack — Emeği Geçenler ve Telif</b>',
    pt: '👑 <b>Commandor Dev Pack — Créditos e Atribuição</b>',
    zh: '👑 <b>Commandor Dev Pack — 致谢与版权</b>',
    hi: '👑 <b>कमांडोर देव पैक — श्रेय और आभार</b>',
    id: '👑 <b>Commandor Dev Pack — Kredit & Atribusi</b>',
    ur: '👑 <b>کمانڈر دیو پیک — کریڈٹس اور انتساب</b>'
  },
  'bot.credits_desc': {
    en: `🌟 <b>Owner & Lead Developer:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Official Telegram Bot:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>GitHub Repository:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Platform:</b> Commandor Dev Pack
⚙️ <b>Architecture:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare

<i>Commandor Dev Pack transforms multi-cloud, VPS, and edge servers into a cohesive, secure, and developer-friendly control plane.</i>`,
    ar: `🌟 <b>المالك والمطور الرئيسي:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>بوت تيليجرام الرسمي:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>مستودع GitHub:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>المنصة:</b> Commandor Dev Pack
⚙️ <b>البنية التقنية:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare

<i>تحوّل حزمة كوماندور الخوادم متعددة السحابات وخوادم VPS إلى لوحة تحكم متكاملة وآمنة وصديقة للمطورين.</i>`,
    ru: `🌟 <b>Владелец и ведущий разработчик:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Официальный бот Telegram:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>Репозиторий GitHub:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Платформа:</b> Commandor Dev Pack
⚙️ <b>Архитектура:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare

<i>Commandor Dev Pack объединяет мульти-облачные и VPS серверы в надежную и удобную панель управления.</i>`,
    fr: `🌟 <b>Propriétaire et développeur principal :</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Bot Telegram officiel :</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>Dépôt GitHub :</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Plateforme :</b> Commandor Dev Pack
⚙️ <b>Architecture :</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    es: `🌟 <b>Propietario y desarrollador principal:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Bot oficial de Telegram:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>Repositorio GitHub:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Plataforma:</b> Commandor Dev Pack
⚙️ <b>Arquitectura:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    de: `🌟 <b>Inhaber & Chefentwickler:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Offizieller Telegram-Bot:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>GitHub-Repository:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Plattform:</b> Commandor Dev Pack
⚙️ <b>Architektur:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    tr: `🌟 <b>Sahip ve Baş Geliştirici:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Resmi Telegram Botu:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>GitHub Deposu:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Platform:</b> Commandor Dev Pack
⚙️ <b>Mimari:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    pt: `🌟 <b>Proprietário e Desenvolvedor Líder:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Bot Oficial do Telegram:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>Repositório GitHub:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Plataforma:</b> Commandor Dev Pack
⚙️ <b>Arquitetura:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    zh: `🌟 <b>所有者与核心开发者：</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>官方 Telegram 机器人：</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>GitHub 开源代码库：</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>平台：</b> Commandor Dev Pack
⚙️ <b>系统架构：</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    hi: `🌟 <b>स्वामी और मुख्य डेवलपर:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>आधिकारिक टेलीग्राम बॉट:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>गिटहब रिपॉजिटरी:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>प्लेटफ़ॉर्म:</b> कमांडोर देव पैक
⚙️ <b>वास्तुकला:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    id: `🌟 <b>Pemilik & Pengembang Utama:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>Bot Telegram Resmi:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>Repositori GitHub:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>Platform:</b> Commandor Dev Pack
⚙️ <b>Arsitektur:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`,
    ur: `🌟 <b>مالک اور لیڈ ڈویلپر:</b> <a href="https://t.me/{ownerUser}">@{ownerUser}</a>
🤖 <b>آفیشل ٹیلیگرام بوٹ:</b> <a href="https://t.me/{botUser}">@{botUser}</a>
🐙 <b>GitHub ذخیرہ:</b> <a href="https://github.com/Masrofii/Commandor_dev_pack">Masrofii/Commandor_dev_pack</a>

🛡️ <b>پلیٹ فارم:</b> کمانڈر دیو پیک
⚙️ <b>فن تعمیر:</b> Node.js · Telegraf · SQLite · Next.js · Nginx · Cloudflare`
  }
};

// Update src/i18n/locales/<lang>.json and web/lib/locales.json
console.log('🔄 Merging Phase 4 Bot translations...');
const mergedCatalogs = {};

for (const lang of LANGS) {
  const filePath = path.join(localesDir, `${lang}.json`);
  let catalog = {};
  if (fs.existsSync(filePath)) {
    catalog = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  for (const [key, langMap] of Object.entries(BOT_KEYS)) {
    catalog[key] = langMap[lang] || langMap['en'] || key;
  }

  mergedCatalogs[lang] = catalog;
  fs.writeFileSync(filePath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
}

fs.writeFileSync(webLocalesPath, JSON.stringify(mergedCatalogs, null, 2) + '\n', 'utf8');
console.log(`✅ All Phase 4 keys successfully merged! Total keys per language: ${Object.keys(mergedCatalogs.en).length}`);
