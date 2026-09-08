import type { Locale } from "@/core/localization/direction";
import { getEnvironmentLabel } from "@/core/localization/display-labels";
import { t } from "@/core/localization/messages";

export function EnvironmentIndicator({
  environment,
  locale,
}: {
  environment: "production" | "staging" | "development";
  locale: Locale;
}) {
  const label = getEnvironmentLabel(locale, environment);
  return (
    <span className={`environment environment-${environment}`} aria-label={t(locale, "environment.aria", { label })}>
      <span aria-hidden="true" /> {t(locale, "environment.text", { label })}
    </span>
  );
}
