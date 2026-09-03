import type { PermissionKey } from "@/core/permissions/permissions";
import type { Phase4ActionRequest, Phase4Resource } from "./contracts";

interface ResourceCopy {
  title: string;
  description: string;
  permission: PermissionKey;
}

export const operationalCopy = {
  ar: {
    resources: {
      sessions: {
        title: "جلسات الاستيراد",
        description: "متابعة الجلسات المنقحة حسب المنصة والمصدر والحالة.",
        permission: "imports.read",
      },
      failures: {
        title: "عمليات الاستيراد الفاشلة",
        description: "معالجة حالات الفشل دون عرض المحتوى المستورد الخام.",
        permission: "imports.failures.manage",
      },
      "low-confidence": {
        title: "الاستيرادات منخفضة الثقة",
        description: "مراجعة اقتراحات الخادم ضمن النتائج المسموح بها فقط.",
        permission: "imports.confidence.manage",
      },
      duplicates: {
        title: "مرشحو التكرار",
        description: "مقارنة ملخصات منقحة مع الحفاظ على دلالات الحدث الأصلي.",
        permission: "imports.duplicates.manage",
      },
      unsupported: {
        title: "التنسيقات غير المدعومة",
        description:
          "توجيه الحالات غير المدعومة دون كشف الرسائل أو الملفات الخام.",
        permission: "imports.unsupported.manage",
      },
      banks: {
        title: "البنوك المدعومة",
        description: "مراقبة تغطية المصادر والمرسلين وقواعد التحليل.",
        permission: "parsers.coverage.read",
      },
      senders: {
        title: "إدارة المرسلين",
        description: "إدارة أنماط مرسلين محدودة وآمنة ضمن المحاكاة.",
        permission: "parsers.senders.manage",
      },
      "parser-rules": {
        title: "قواعد المحلل",
        description: "قواعد تعريفية محدودة دون تشغيل شيفرة أو اتصالات شبكة.",
        permission: "parsers.rules.read",
      },
      "test-cases": {
        title: "حالات اختبار المحلل",
        description: "عينات محلية خيالية فقط لا ترتبط ببيانات العملاء.",
        permission: "parsers.tests.run",
      },
      versions: {
        title: "إصدارات المحلل",
        description: "دورة إصدار ثابتة وتاريخ غير قابل للتعديل.",
        permission: "parsers.versions.manage",
      },
      "merchant-rules": {
        title: "قواعد التجار",
        description: "توحيد أسماء تجريبية وحدود أسماء بديلة واضحة.",
        permission: "parsers.merchants.manage",
      },
      "category-rules": {
        title: "قواعد التصنيف",
        description: "أنماط آمنة وثقة ونطاقات محددة للمحاكاة.",
        permission: "parsers.categories.manage",
      },
    } as Record<Phase4Resource, ResourceCopy>,
    eyebrow: "العمليات / المرحلة الرابعة",
    searchPlaceholder: "المعرّف أو الاسم المنقح",
    searchAria: "بحث النتائج التشغيلية",
    allPlatforms: "كل المنصات",
    allSources: "كل المصادر",
    statusPlaceholder: "الحالة",
    platformAria: "المنصة",
    sourceAria: "المصدر",
    statusAria: "الحالة",
    bankIdAria: "معرف البنك",
    parserVersionAria: "إصدار المحلل",
    appVersionAria: "إصدار التطبيق",
    dateFromAria: "من تاريخ",
    dateToAria: "إلى تاريخ",
    sortAria: "الفرز",
    sortDirAria: "اتجاه الفرز",
    pageSizeAria: "حجم الصفحة",
    sort: {
      updatedAt: "التحديث",
      id: "المعرف",
      status: "الحالة",
      source: "المصدر",
      bank: "البنك",
      version: "الإصدار",
      appVersion: "التطبيق",
    },
    order: {
      desc: "تنازلي",
      asc: "تصاعدي",
    },
    clear: "مسح",
    page: "الصفحة",
    total: "الإجمالي",
    previous: "السابق",
    next: "التالي",
    paginationAria: "ترقيم النتائج",
    emptyState: "لا توجد سجلات مطابقة.",
    errorMutation: "تعذر تنفيذ المحاكاة. حدّث البيانات ثم حاول مرة أخرى.",
    columns: {
      identifier: "المعرّف",
      record: "السجل",
      status: "الحالة",
      platform: "المنصة",
      source: "المصدر",
      confidence: "الثقة",
      updated: "التحديث",
    },
    mobileLabels: {
      results: "النتائج التشغيلية",
      platform: "المنصة",
      source: "المصدر",
      pattern: "النمط",
    },
    actions: {
      sectionTitle: "الإجراءات المتاحة",
      sectionDescription: "كل إجراء محاكاة واجهة فقط ويحتاج تأكيداً صريحاً.",
      reasonLabel: "سبب الإجراء",
      defaultReason: "مراجعة تشغيلية ضمن المحاكاة",
      confirmTitle: "تأكيد الإجراء",
      confirmConsequence:
        "سيتم تحديث حالة المحاكاة فقط، دون إنشاء معاملة أو تشغيل محلل أو خدمة خلفية.",
      confirmSuccess: "اكتملت المحاكاة",
      confirmFailure: "فشلت المحاكاة",
      confirmConflict: "تعارضت الحالة أو المراجعة",
      auditRef: "مرجع التدقيق",
    },
    actionLabels: {
      retry_handoff: "تسليم إعادة المحاولة",
      assign_parser_issue: "إسناد مشكلة محلل",
      mark_unsupported: "تعليم كغير مدعوم",
      create_rule_draft_handoff: "إنشاء تسليم مسودة",
      accept_suggestion: "قبول الاقتراح",
      correct_merchant: "تصحيح التاجر",
      correct_category: "تصحيح التصنيف",
      defer: "تأجيل",
      confirm_duplicate: "تأكيد التكرار",
      reject_match: "رفض المطابقة",
      activate: "تفعيل",
      deactivate: "إيقاف",
      test: "تشغيل اختبار خيالي",
      release: "إصدار",
      retire: "إحالة للتقاعد",
      rollback: "إنشاء مسودة تراجع",
      save: "حفظ المحاكاة",
    } as Record<Phase4ActionRequest["action"], string>,
    detail: {
      eyebrow: "تفاصيل منقحة",
      description: "الاستجابة مقيدة بصلاحية العرض ولا تحتوي على حمولة خام.",
      backToList: "العودة للقائمة",
      defaultReason: "مراجعة تفصيلية ضمن المحاكاة",
      detailActions: "إجراءات التفاصيل",
      errorMutation: "تعذر تنفيذ المحاكاة. حدث البيانات ثم حاول مرة أخرى.",
      confirmConsequence:
        "سيتم تسجيل نتيجة محاكاة فقط مع مرجع تدقيق مخطط، ولن يتم تشغيل محلل أو طابور أو تكامل خلفي.",
    },
  },
  en: {
    resources: {
      sessions: {
        title: "Import Sessions",
        description:
          "Track sanitized sessions by platform, source, and status.",
        permission: "imports.read",
      },
      failures: {
        title: "Failed Imports",
        description:
          "Handle failure cases without showing raw imported content.",
        permission: "imports.failures.manage",
      },
      "low-confidence": {
        title: "Low Confidence Imports",
        description: "Review server suggestions within allowed results only.",
        permission: "imports.confidence.manage",
      },
      duplicates: {
        title: "Duplicate Candidates",
        description:
          "Compare sanitized summaries while preserving original event semantics.",
        permission: "imports.duplicates.manage",
      },
      unsupported: {
        title: "Unsupported Formats",
        description:
          "Route unsupported cases without exposing raw messages or files.",
        permission: "imports.unsupported.manage",
      },
      banks: {
        title: "Supported Banks",
        description:
          "Monitor coverage across sources, senders, and parser rules.",
        permission: "parsers.coverage.read",
      },
      senders: {
        title: "Sender Management",
        description:
          "Manage limited and safe sender patterns within simulation.",
        permission: "parsers.senders.manage",
      },
      "parser-rules": {
        title: "Parser Rules",
        description:
          "Limited declarative rules without code execution or network connections.",
        permission: "parsers.rules.read",
      },
      "test-cases": {
        title: "Parser Test Cases",
        description:
          "Local fictional samples only, not linked to customer data.",
        permission: "parsers.tests.run",
      },
      versions: {
        title: "Parser Versions",
        description: "Fixed release cycle and immutable history.",
        permission: "parsers.versions.manage",
      },
      "merchant-rules": {
        title: "Merchant Rules",
        description:
          "Experimental name standardization with clear alias limits.",
        permission: "parsers.merchants.manage",
      },
      "category-rules": {
        title: "Category Rules",
        description:
          "Safe patterns, confidence, and scoped ranges for simulation.",
        permission: "parsers.categories.manage",
      },
    } as Record<Phase4Resource, ResourceCopy>,
    eyebrow: "Operations / Parsers",
    searchPlaceholder: "Search by identifier or bank name",
    searchAria: "Search operational results",
    allPlatforms: "All platforms",
    allSources: "All sources",
    statusPlaceholder: "Status",
    platformAria: "Platform",
    sourceAria: "Source",
    statusAria: "Status",
    bankIdAria: "Bank ID",
    parserVersionAria: "Parser version",
    appVersionAria: "App version",
    dateFromAria: "From date",
    dateToAria: "To date",
    sortAria: "Sort by",
    sortDirAria: "Sort direction",
    pageSizeAria: "Page size",
    sort: {
      updatedAt: "Updated",
      id: "Identifier",
      status: "Status",
      source: "Source",
      bank: "Bank",
      version: "Version",
      appVersion: "App version",
    },
    order: {
      desc: "Descending",
      asc: "Ascending",
    },
    clear: "Clear",
    page: "Page",
    total: "Total",
    previous: "Previous",
    next: "Next",
    paginationAria: "Result pagination",
    emptyState: "No matching records found.",
    errorMutation: "Unable to execute simulation. Refresh and try again.",
    columns: {
      identifier: "Identifier",
      record: "Record",
      status: "Status",
      platform: "Platform",
      source: "Source",
      confidence: "Confidence",
      updated: "Updated",
    },
    mobileLabels: {
      results: "Operational results",
      platform: "Platform",
      source: "Source",
      pattern: "Pattern",
    },
    actions: {
      sectionTitle: "Available Actions",
      sectionDescription:
        "Each action is a UI simulation and requires explicit confirmation.",
      reasonLabel: "Action reason",
      defaultReason: "Operational review within simulation",
      confirmTitle: "Confirm action",
      confirmConsequence:
        "Only the simulation state will be updated. No transaction, parser, or backend service will be triggered.",
      confirmSuccess: "Simulation completed",
      confirmFailure: "Simulation failed",
      confirmConflict: "State or revision conflict",
      auditRef: "Audit reference",
    },
    actionLabels: {
      retry_handoff: "Retry handoff",
      assign_parser_issue: "Assign parser issue",
      mark_unsupported: "Mark unsupported",
      create_rule_draft_handoff: "Create draft handoff",
      accept_suggestion: "Accept suggestion",
      correct_merchant: "Correct merchant",
      correct_category: "Correct category",
      defer: "Defer",
      confirm_duplicate: "Confirm duplicate",
      reject_match: "Reject match",
      activate: "Activate",
      deactivate: "Deactivate",
      test: "Run fictional test",
      release: "Release",
      retire: "Retire",
      rollback: "Create rollback draft",
      save: "Save simulation",
    } as Record<Phase4ActionRequest["action"], string>,
    detail: {
      eyebrow: "Sanitized Details",
      description:
        "Response is restricted to view permissions and contains no raw payload.",
      backToList: "Back to list",
      defaultReason: "Detailed review within simulation",
      detailActions: "Detail Actions",
      errorMutation: "Unable to execute simulation. Refresh and try again.",
      confirmConsequence:
        "Only a simulation result with a planned audit reference will be recorded. No parser, queue, or backend integration will be triggered.",
    },
  },
} as const;
