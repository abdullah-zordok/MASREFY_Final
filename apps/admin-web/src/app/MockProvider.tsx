"use client";

import { useEffect, useState } from "react";
import { mocksAllowed } from "@/core/api/client";

let workerStart: Promise<unknown> | undefined;

export function MockProvider({ children }: { children: React.ReactNode }) {
  const enabled =
    mocksAllowed() && process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true";
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void import("@/mocks/browser")
      .then(({ mockWorker }) =>
        (workerStart ??= mockWorker.start({ onUnhandledRequest: "bypass" })),
      )
      .then(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return ready ? (
    children
  ) : (
    <div className="page" role="status">
      جاري تجهيز البيانات التجريبية…
    </div>
  );
}
