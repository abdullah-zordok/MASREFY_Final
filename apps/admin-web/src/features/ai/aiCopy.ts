export const aiCopy = {
  ar: {
    page: {
      eyebrow: "العمليات / الذكاء الاصطناعي",
      title: "إدارة الذكاء الاصطناعي",
      description: "مراقبة حجم الطلبات المنقحة والموثوقية والتكلفة وزمن الاستجابة وحداثة البيانات.",
      providers: "المزودون",
      privacyNotice: "لا تعرض هذه الصفحة المطالبات أو المحادثات أو حمولات المزود أو بيانات الاعتماد أو المحتوى المالي للعملاء.",
      emptyState: "لا توجد بيانات ذكاء اصطناعي للفلاتر المحددة.",
      emptyCharts: "لا توجد بيانات رسوم للفلاتر المحددة.",
      openFailures: "فتح حالات الفشل",
      openUsage: "فتح الاستخدام",
    },
    filters: {
      platform: "المنصة",
      period: "الفترة",
      allPlatforms: "كل المنصات",
      unknown: "غير معروف",
    },
    metrics: {
      denominator: "المقام",
      fresh: "محدث",
      units: {
        requests: "طلبات",
        attempts: "محاولات",
        failures: "فشل",
        duration_ms: "ملي ثانية",
      },
      keys: {
        "original_requests": "الطلبات الأصلية",
        "successful_requests": "الطلبات الناجحة",
        "failed_requests": "الطلبات الفاشلة",
        "attempts": "المحاولات",
        "fallback_attempts": "محاولات الاحتياط",
        "average_latency": "متوسط زمن الاستجابة",
      },
      denominators: {
        "original_requests": "الطلبات الأصلية",
        "attempts": "المحاولات",
      }
    },
    charts: {
      featuresTitle: "توزيع الميزات",
      featuresDescription: "الطلبات الأصلية حسب ميزة الذكاء الاصطناعي.",
      trendsTitle: "اتجاهات المزود والمنصة",
      trendsDescription: "إجماليات المزود وإسناد غير معروف صريح.",
      labels: {
        "receipt_analysis": "تحليل الإيصالات",
        "categorization": "التصنيف",
        "financial_assistant": "المساعد المالي",
        "android": "Android",
        "ios": "iOS",
        "unknown": "غير معروف"
      }
    },
    summary: {
      originalRequests: "الطلبات الأصلية",
      attempts: "المحاولات",
      fallbackAttempts: "محاولات الاحتياط",
      estimatedCost: "التكلفة التقديرية",
    }
  },
  en: {
    page: {
      eyebrow: "Operations / AI",
      title: "AI Management",
      description: "Monitor sanitized request volume, reliability, cost, latency, and data freshness.",
      providers: "Providers",
      privacyNotice: "This page does not display prompts, conversations, provider payloads, credentials, or customer financial content.",
      emptyState: "No AI data available for the selected filters.",
      emptyCharts: "No chart data available for the selected filters.",
      openFailures: "Open failures",
      openUsage: "Open usage",
    },
    filters: {
      platform: "Platform",
      period: "Period",
      allPlatforms: "All Platforms",
      unknown: "Unknown",
    },
    metrics: {
      denominator: "denominator",
      fresh: "fresh",
      units: {
        requests: "requests",
        attempts: "attempts",
        failures: "failures",
        duration_ms: "ms",
      },
      keys: {
        "original_requests": "Original requests",
        "successful_requests": "Successful requests",
        "failed_requests": "Failed requests",
        "attempts": "Attempts",
        "fallback_attempts": "Fallback attempts",
        "average_latency": "Average response time",
      },
      denominators: {
        "original_requests": "original requests",
        "attempts": "attempts",
      }
    },
    charts: {
      featuresTitle: "Feature distribution",
      featuresDescription: "Original requests by AI feature.",
      trendsTitle: "Provider and platform trends",
      trendsDescription: "Provider totals and explicit unknown attribution.",
      labels: {
        "receipt_analysis": "Receipt analysis",
        "categorization": "Categorization",
        "financial_assistant": "Financial assistant",
        "android": "Android",
        "ios": "iOS",
        "unknown": "Unknown"
      }
    },
    summary: {
      originalRequests: "Original requests",
      attempts: "Attempts",
      fallbackAttempts: "Fallback attempts",
      estimatedCost: "Estimated cost",
    }
  }
} as const;
