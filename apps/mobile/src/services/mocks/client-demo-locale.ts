import { isDemoModeEnabled } from '@/config/demo-mode';
import type { Locale } from '@/domain/foundation';
import { seedClientDemoData } from '@/storage/client-demo-seeder';

export async function synchronizeClientDemoLocale(
  locale: Locale,
  now = Date.now()
): Promise<boolean> {
  if (!isDemoModeEnabled()) return false;
  const changed = await seedClientDemoData({ locale, now });
  const [coreFinance, financialPlanning, automaticTracking] = await Promise.all([
    import('./core-finance-service'),
    import('./financial-planning-service'),
    import('./automatic-tracking-service')
  ]);
  coreFinance.relocalizeDemoCoreFinanceRepository(locale);
  financialPlanning.relocalizeDemoFinancialPlanningRepository(locale);
  automaticTracking.relocalizeDemoAutomaticTrackingRepository(locale);
  return changed;
}
