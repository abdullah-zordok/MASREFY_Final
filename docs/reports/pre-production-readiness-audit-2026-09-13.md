# تقرير فحص الجاهزية قبل الإنتاج — Masarifi

**تاريخ الفحص:** 13 سبتمبر 2026  
**الفرع والمراجعة:** `main` — `2ca8bd01a0aaf4a9190d74f665c2649b24cb4db8`  
**النتيجة النهائية:** **المشروع غير جاهز للنشر Production حاليًا، لكنه قريب من بيئة Staging متكاملة بعد إغلاق الموانع أدناه.**

## الخلاصة التنفيذية

المشروع ليس مجرد واجهة Admin كما توحي ملفات README القديمة. الموجود فعليًا نظام كبير يتكون من:

- تطبيق Mobile مبني بـ Expo/React Native.
- لوحة Admin مبنية بـ Next.js.
- API وWorker وMigration runner مبنية بـ NestJS.
- PostgreSQL/Supabase مع 66 migration تقريبًا وRLS ووظائف قاعدة بيانات.
- Clerk للمصادقة، وخدمات تقارير ورفع ملفات وإشعارات ودعم فني.
- طبقة AI اختيارية عبر OpenRouter تشمل المساعد المالي والصوت.

الـAPI وقاعدة البيانات والـAdmin في حالة تقنية جيدة نسبيًا، لكن التشغيل الكامل الحقيقي ما زال محجوبًا بسبب اختبارات Mobile الفاشلة، وأجزاء Admin غير الموصولة بالـLive API، وغياب إعداد Production/Staging كامل، وتعطيل Admin routes والـAI افتراضيًا، وأربع ملاحظات أمنية متوسطة مؤكدة.

**الخطوة التالية الصحيحة:** لا تبدأ خواص جديدة ولا تنشر Production. أنشئ مرحلة قصيرة اسمها **Staging Stabilization** تبدأ بإصلاح الـCI والملاحظات الأمنية، ثم توصيل كل شاشات Admin المطلوبة بالـAPI، ثم تجهيز بيئة Staging فعلية بكل الخدمات والمفاتيح، وبعدها تنفيذ اختبار End-to-End على أجهزة حقيقية.

## مصفوفة الحالة

| الجزء | الحالة | ما تم إثباته | ما يمنع الإنتاج |
|---|---|---|---|
| API | أصفر | TypeScript وLint وBuild والعقود والتكامل وE2E نجحت؛ CI الحالي نجح | اختبار parser الخاص بميزانية 25ms فشل مرة تحت الحمل ثم نجح منفردًا؛ يلزم إزالة حساسية التوقيت |
| Database / Supabase | أخضر تقنيًا، أصفر تشغيليًا | CI شغّل Supabase وreset وlint واختبارات DB والأمان والاسترجاع والأداء بنجاح | تشغيل Docker/Supabase المحلي لم يُثبت بثبات على الجهاز، ولا توجد بيئة Production موثقة ومتصلة |
| Admin Web | أصفر | Typecheck وLint و873 اختبارًا وBuild بإعداد CI وPlaywright على 5 أحجام شاشة نجحت | عدة repositories ترجع `unavailableClientOperation` في Live؛ نجاح الواجهة لا يعني اكتمال الوظائف الحقيقية |
| Mobile | أحمر | Typecheck وLint وExpo Android prebuild نجحت | Jest فشل محليًا وفي CI؛ 5 اختبارات ثابتة الفشل و4 timeouts متذبذبة في التشغيل الكامل؛ 78 تحذير lint |
| AI | أحمر/غير مفعّل | بنية Worker وGateway واختبارات AI والأداء موجودة | `MASARIFI_AI_PROVIDER_ENABLED=false` افتراضيًا، ولا يوجد OpenRouter key محلي، وحالة ZDR/no-training للحساب غير مثبتة، وهناك تسريب سياق خارج النطاق المختار |
| Clerk / Auth | أصفر | استخدام SDK الرسمي، صلاحيات Admin الخادمية وRLS سليمة في المسارات المراجعة | limiter للـwebhook يمكن استنزافه قبل التحقق من التوقيع |
| Reports / Email / Push / Scan | أصفر | الكود والاختبارات ومسارات التخزين الخاصة موجودة | SMTP غير مضبوط محليًا؛ إعدادات مقدمي Push والـmalware scanner تحتاج إثبات Staging/Production |
| Docker / Deployment | أحمر | صورة Backend واحدة تدعم API وWorker وMigration ومبنية بأسلوب non-root/distroless | لا يوجد manifest نشر Production كامل للـAPI والـWorker والـAdmin والـMobile ولا إثبات ingress/secrets/rollback |
| CI/CD | أحمر | Jobs التطبيق والقاعدة والـAdmin وكل Admin E2E نجحت | آخر workflow فشل في Mobile Jest وGitleaks؛ لا حماية لفرع `main` ولا Release نهائي |
| التوثيق | أحمر | توجد specs وrunbooks كثيرة | README وPROJECT_STRUCTURE وREADME الخاص بالـAPI لا تمثل حالة المشروع الحالية |

## نتائج الاختبارات التي نُفذت

### API

- `typecheck`, `lint`, `build`, migration checksums: ناجحة.
- Unit: نجح 891 من 892 في التشغيل الشامل؛ اختبار `tracking.parser` تجاوز ميزانية زمنية 25ms مرة واحدة، ثم نجح منفردًا 17/17. هذا flaky performance assertion وليس فشلًا وظيفيًا مثبتًا.
- Contract: 79 suites و233 tests ناجحة.
- Integration: 28 suites ناجحة و65 skipped؛ 61 tests ناجحة و178 skipped حسب البيئة.
- E2E: 26 suites ناجحة و15 skipped؛ 37 tests ناجحة و34 skipped.
- فحوص security workflow pins: 42 suites ناجحة وواحدة skipped.
- CI Database الحالي أكمل اختبارات DB وRLS والاسترجاع والأداء والضغط بنجاح.

### Admin

- Typecheck وLint: ناجحان.
- Unit: 82 files و873 tests ناجحة.
- Production build يرفض التشغيل بدون URL HTTPS وClerk config، وهذا fail-closed صحيح. البناء نجح عند تمرير قيم CI الآمنة، وتم توليد 82 route.
- Playwright نجح على mobile 390، tablet 768/1024، desktop 1280/1440.
- التحذير المهم: اختبارات العرض لا تغطي اكتمال كل الـLive repositories. توجد عمليات مستخدمين وأجهزة وجلسات وطلبات وصول وبحث ومنصة ما زالت ترجع unavailable في الوضع الحقيقي.

### Mobile

- Typecheck: ناجح.
- Lint: ناجح مع 78 warning من نوع `no-require-imports`.
- Expo Android prebuild في CI: ناجح.
- Jest الكامل: 441 suite؛ 434 نجحت و7 فشلت. 2,127 test نجحت و9 فشلت.
- إعادة تشغيل الملفات الفاشلة منفردة أثبتت 5 حالات ثابتة:
  - 3 في `AccountScopeSheet.test.tsx` بسبب وجود أكثر من عنصر باسم `Wallet`.
  - 1 في `TransactionForm.test.tsx` للسبب نفسه.
  - 1 في `subscription-settings-service.test.ts`: المتوقع `provider_unavailable` والمستلم `session_expired`.
- أربع حالات timeout أخرى نجحت منفردة، ما يشير إلى ضغط/عزل اختبارات غير مستقر في التشغيل الكامل.
- لا يوجد إثبات EAS Production build أو اختبار iOS/Android على أجهزة حقيقية ضمن الـCI الحالي.

### GitHub Actions

آخر تشغيل على نفس commit انتهى **Failure**:  
https://github.com/abdullah-zordok/MASREFY_Final/actions/runs/34719833558

- ناجح: application، database، admin، sentinel-redaction، وكل مصفوفة Admin E2E.
- فاشل: mobile في Jest.
- فاشل: secrets بسبب Gitleaks عند `apps/mobile/src/services/live/auth-service.test.ts:430`. القيمة `deletion-operation-123` هي Idempotency-Key اختبارية وليست credential حقيقية؛ يلزم تغيير fixture أو إضافة تجاهل دقيق موثق، وليس تعطيل Gitleaks.
- فرع `main` غير محمي حاليًا.
- توجد GitHub environments، لكن لم يظهر لها protection rules أو secrets/variables قابلة للتحقق من المستودع.
- لا توجد GitHub Release منشورة لهذا الإصدار.

## الفحص الأمني

تم إكمال فحص Codex Security قياسي للنقاط الحساسة. النتيجة: **0 Critical، 0 High، 4 Medium مؤكدة**. كما لم يثبت وجود SQL injection أو cross-tenant access أو تجاوز مباشر لصلاحيات Admin في المسارات التي تمت مراجعتها.

1. **Clerk webhook DoS:** الطلبات غير الموقعة تستهلك bucket عالمي قبل التحقق من توقيع Clerk، ويمكنها تأخير مزامنة أحداث المستخدمين.
2. **تخزين SMS المالي دون تشفير:** Queue الخاصة باستيراد SMS تُحفظ JSON في AsyncStorage وتتجاوز SQLCipher ولا تُمسح في sign-out الطبيعي.
3. **غياب tenant quotas للـimports/reports:** يمكن للمستخدم الموثق إنشاء عدد غير محدود تراكميًا من الأعمال المختلفة رغم وجود حدود لكل request.
4. **AI context over-disclosure:** `contextScope` يفلتر الملخصات، لكنه لا يفلتر aliases التفصيلية؛ لذلك قد تُرسل أنواع بيانات مالية غير مختارة إلى OpenRouter.

تقرير الأمان الكامل المُولّد موجود في:

`C:\Users\DELL\AppData\Local\Temp\codex-security-scans-jI1BY9\MASREFY-_Final\2ca8bd01a0aaf4a9190d74f665c2649b24cb4db8_20260912T212857Z_uqnini_9\report.md`

ملاحظة: صلاحية Daybreak الأمنية للحساب `not_granted`. هذا لا يمنع الفحص المحلي، لكن يمكن طلب الوصول من https://chatgpt.com/cyber إذا أردت استخدام برامج Daybreak.

## إعدادات التشغيل الناقصة

ملف `apps/api/.env` المحلي موجود ومُتجاهل من Git، وتوجد به القيم الأساسية غير الفارغة الخاصة بقاعدة البيانات وClerk وSupabase والتشفير/الـhash دون عرض أي أسرار. لكن التشغيل الكامل غير متاح بهذه الحالة:

- `MASARIFI_ADMIN_ROUTES_ENABLED` غير مضبوط، وبالتالي القيمة الافتراضية `false`.
- `MASARIFI_AI_PROVIDER_ENABLED` غير مضبوط، وبالتالي AI الحقيقي معطّل.
- `OPENROUTER_API_KEY` غير موجود محليًا.
- SMTP غير مضبوط، وبالتالي إرسال التقارير بالبريد غير جاهز.
- لا يوجد `apps/admin-web/.env`.
- لا يوجد `apps/mobile/.env`.

لا يجب نسخ أسرار Production إلى الجهاز. استخدم مفاتيح Staging منفصلة وخزنة أسرار للبيئة المنشورة.

## خطة الإغلاق قبل Production

### P0 — ابدأ بها الآن

1. أصلح اختبارات Mobile الخمسة الثابتة واعزل/ثبّت اختبارات الـtimeouts، ثم اجعل workflow الحالي أخضر بالكامل.
2. عالج false positive الخاص بـGitleaks بتغيير قيمة الاختبار إلى صيغة لا تشبه مفتاح API أو تجاهل fingerprint محدد مع تعليق؛ لا توسّع allowlist.
3. أصلح الأربع ملاحظات الأمنية وأضف اختبار regression صغير لكل واحدة.
4. احصر كل `unavailableClientOperation` في Admin، وحدد ما يلزم للإطلاق، ثم صِل هذه العمليات بالـAPI أو أزل/اخفِ الوظيفة غير المدعومة من نسخة Production.
5. اجعل `main` محميًا: required checks، منع direct push، ومراجعة قبل الدمج.

### P1 — بيئة Staging كاملة

1. أنشئ Supabase/Clerk منفصلين للـStaging ومستخدمين حقيقيين بأدوار customer/support/admin.
2. انشر نفس Backend image ثلاث مرات: migration كـpre-deploy job، ثم API، ثم Worker.
3. انشر Admin مع `NEXT_PUBLIC_CLIENT_MODE=live` وHTTPS API وClerk Staging.
4. جهّز Mobile development/preview build مع `EXPO_PUBLIC_CLIENT_MODE=live` وHTTPS API وClerk Staging.
5. فعّل `MASARIFI_ADMIN_ROUTES_ENABLED=true` في Staging فقط بعد bootstrap واضح للـAdmin.
6. اضبط SMTP وPush وClamAV/storage webhooks، واختبر failure/retry paths.
7. فعّل AI في Staging فقط بعد إصلاح context scope، واعتماد OpenRouter ZDR/no-training، ووضع المفتاح في Worker وحده.

### P1 — اختبار قبول حقيقي

نفّذ رحلة كاملة على Android وiOS وAdmin، ببيانات Staging:

- تسجيل/دخول/خروج، MFA، انتهاء الجلسة وتعطيل المستخدم.
- إنشاء الحسابات والتصنيفات والمعاملات والموازنات والالتزامات والمزامنة offline/online.
- استيراد CSV وSMS، المراجعة والتكرار والفشل وإعادة المحاولة.
- تسجيل صوت ورفع وتحليل وتأكيد/رفض الاقتراح.
- المساعد المالي بكل context scope، مع فحص الـpayload الخارج للـprovider.
- تقارير PDF/CSV والبريد والتنزيل والـretention.
- الدعم والمرفقات والفحص ضد malware.
- Admin users/access/security/reports/operations مع فحص الصلاحيات لكل دور.
- حذف الحساب وتصدير الخصوصية ومسح كل البيانات المحلية.
- انقطاع API/DB/Worker/provider ثم recovery دون ازدواج أو فقد بيانات.

يوجد حاليًا 372 task غير مؤشرة في specs الخاصة بالموبايل و24 task في specs الخاصة بالـAPI، إضافة إلى 49 external gate في Phase 14. لا يعني ذلك أن كلها ناقصة كود، لكنه يعني أن أدلة الإغلاق غير مكتملة ويجب تصنيف كل بند إلى done/obsolete/blocked مع دليل.

### P2 — نشر ومراقبة

- أضف manifests فعلية للبنية التحتية بدل الاكتفاء بوثيقة نوايا: read-only root filesystem، non-root، secret store، network policies، autoscaling، timeouts وhealth checks.
- اجعل migration خطوة pre-traffic واحدة وقابلة للفشل الآمن.
- أضف observability للـAPI والـWorker والoutbox/provider latency والquotas وwebhook failures مع تنبيهات.
- نفّذ backup/restore وrollback drill، ثم وقّع الصور واربط release بالـcommit وmigration checksum.
- حدّث README وPROJECT_STRUCTURE وREADME الخاص بالـAPI لتصبح تعليمات التشغيل الحقيقية مصدرًا واحدًا.

## تشغيل النظام محليًا بعد تجهيز القيم

استخدم 4 نوافذ Terminal. القيم أدناه أوامر فقط؛ ملفات `.env` يجب أن تحتوي مفاتيح Development/Staging صحيحة.

### 1. التثبيت وقاعدة البيانات

```powershell
npm --prefix apps/api ci
npm --prefix apps/admin-web ci
npm --prefix apps/mobile ci
npm --prefix apps/api run supabase:start
npm --prefix apps/api run db:reset
```

إذا ظل Docker/Supabase المحلي معلقًا، أعد تشغيل Docker Desktop وتأكد أن engine يستجيب قبل متابعة المشروع. لا تعتمد على وجود process أو port فقط.

### 2. API

```powershell
npm --prefix apps/api run start:dev
```

### 3. Worker

```powershell
npm --prefix apps/api run start:worker:dev
```

### 4. Admin

أنشئ `apps/admin-web/.env` من المثال واضبط Development/Staging API وClerk، ثم:

```powershell
npm --prefix apps/admin-web run dev
```

### 5. Mobile

أنشئ `apps/mobile/.env` من المثال، واجعل API عنوان HTTPS يمكن للجهاز/المحاكي الوصول إليه، ثم:

```powershell
npm --prefix apps/mobile start
```

تطبيق الهاتف الحقيقي لا يستطيع استخدام `localhost` الخاص بالكمبيوتر مباشرة في كل الحالات. استخدم عنوان شبكة مناسبًا أو tunnel/HTTPS Staging.

### بوابة التحقق قبل أي Release

```powershell
npm --prefix apps/api run verify
npm --prefix apps/admin-web run typecheck
npm --prefix apps/admin-web run lint
npm --prefix apps/admin-web test
npm --prefix apps/admin-web run build
npm --prefix apps/admin-web run test:e2e
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run lint
npm --prefix apps/mobile test
npm --prefix apps/mobile run check:client-runtime
```

ثم يجب أن يكون GitHub Actions أخضر بالكامل على commit المرشح نفسه، وليس على commit أقدم.

## فحص البساطة والدين التقني

- `delete:` احذف `apps/api/pnpm-lock.yaml` و`pnpm-workspace.yaml` غير المتتبعين إن لم يكن هناك قرار صريح للانتقال من npm؛ CI والمستودع يستخدمان npm و`package-lock.json`.
- `delete:` نظّف 151 ملف PNG/XML/DB غير متتبع أو انقل الأدلة المختارة فقط إلى مسار QA واضح قبل أي commit.
- `delete:` احسم الفروق ثم احذف نسخة design-system المسماة `untracked-copy.md` بدل الاحتفاظ بوثيقتين متنافستين.
- `delete/yagni:` مجلدات `packages/*` و`marketing-web` الحالية marker-only؛ لا تضف scaffolding قبل وجود مستخدم فعلي لها.
- `shrink:` الملفات التي تتجاوز 1,000–1,900 سطر في Mobile/API/Admin تحتاج تقسيمًا تدريجيًا عند تعديلها، لا مشروع refactor شامل بلا فائدة مباشرة.
- **net: يمكن إزالة نحو 7,772 سطرًا و0 dependencies من التكرار/scaffolding الواضح، بعد حسم نسخة design-system.**

## ملاحظات المستودع

- شجرة العمل كانت غير نظيفة قبل التقرير: ملف tracked معدل و155 عنصرًا غير متتبع. لم يتم حذفها أو تعديلها.
- الملف الوحيد الذي أُضيف بواسطة هذا الفحص هو هذا التقرير.
- لا توجد مبررات حاليًا لإضافة framework أو service جديدة؛ المطلوب إغلاق المسارات الموجودة وربطها واختبارها.

## قرار Go / No-Go

**No-Go للإنتاج الآن.**  
**Go لمرحلة Staging Stabilization** بمجرد قبول نطاقها، وتكون بوابة الانتقال التالية: CI أخضر، الأربع ملاحظات الأمنية مغلقة، لا توجد وظيفة إطلاق أساسية ترجع unavailable، وكل رحلة القبول السابقة ناجحة على خدمات Staging وأجهزة حقيقية، مع rollback وmonitoring مثبتين.
