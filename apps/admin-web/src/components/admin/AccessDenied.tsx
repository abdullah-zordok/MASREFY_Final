import Link from "next/link";
import { ShieldAlert } from "lucide-react";
export function AccessDenied({ permission }: { permission: string }) {
  return (
    <section className="state-box error" role="alert" aria-labelledby="access-denied-title">
      <ShieldAlert size={30} />
      <strong id="access-denied-title">لا تملك صلاحية الوصول</strong>
      <p>الصلاحية المطلوبة: <span className="ltr">{permission}</span></p>
      <Link className="button primary" href="/admin">العودة إلى النظرة العامة</Link>
    </section>
  );
}
