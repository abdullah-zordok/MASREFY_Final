"use client";

import { useEffect, useState } from "react";
import { mocksEnabled } from "@/core/config/runtime";

let workerStart: Promise<unknown> | undefined;

export function MockProvider({ children }: { children: React.ReactNode }) {
  const enabled = mocksEnabled();
  const [ready, setReady] = useState(!enabled);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void import("@/mocks/browser")
      .then(({ mockWorker }) =>
        (workerStart ??= mockWorker.start({
          onUnhandledRequest(request, print) {
            if (new URL(request.url).pathname.startsWith("/api/")) print.error();
          },
        })),
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
