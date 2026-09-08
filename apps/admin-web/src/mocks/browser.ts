import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";
import { mocksAllowed } from "@/core/config/runtime";

if (!mocksAllowed()) throw new Error("MSW browser worker is forbidden in production");

export const mockWorker = setupWorker(...handlers);
