export type ApiErrorCode =
  | "validation_error"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "session_expired"
  | "recent_auth_required"
  | "gone"
  | "rate_limited"
  | "provider_unavailable"
  | "contract_mismatch"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const SAFE_MESSAGES: Record<ApiErrorCode, string> = {
  validation_error: "تحقق من البيانات المدخلة ثم حاول مرة أخرى.",
  forbidden: "غير مصرح بهذا الإجراء.",
  not_found: "تعذر العثور على العنصر المطلوب.",
  conflict: "تعارض الطلب مع الحالة الحالية.",
  session_expired: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
  recent_auth_required: "أعد التحقق من هويتك لإكمال هذا الإجراء.",
  gone: "انتهت صلاحية هذا المحتوى ولم يعد متاحاً.",
  rate_limited: "تجاوزت عدد المحاولات المسموح. حاول لاحقاً.",
  provider_unavailable: "الخدمة غير متاحة مؤقتاً.",
  contract_mismatch: "أعادت الخدمة استجابة غير مدعومة.",
  internal_error: "تعذر إكمال الطلب. حاول مرة أخرى.",
};

export function safeApiMessage(code: ApiErrorCode): string {
  return SAFE_MESSAGES[code];
}

export function normalizeHttpStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
    case 422:
      return "validation_error";
    case 401:
      return "session_expired";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 410:
      return "gone";
    case 429:
      return "rate_limited";
    case 503:
      return "provider_unavailable";
    default:
      return "internal_error";
  }
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("internal_error", safeApiMessage("internal_error"), 500);
}
