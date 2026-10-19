import { adapterFor } from "../adapters";
import { type Studio, createStudio } from "../controllers/studio";
import { keepUnsaved } from "../controllers/unsaved";
import { ErrorMessages } from "../error-messages";
import type { Edits } from "@sugarcube-sh/dtcg-edit";
import type { Saved, StudioMessage } from "../protocol";

const WAIT_MS = 10_000;
const UNSAVED_KEY = "sugarcube:studio:unsaved:";

export interface SharedMessage {
    value(): StudioMessage | undefined;
    on(event: "updated", listener: (value: StudioMessage) => void): () => void;
}

export async function openStudio(
    shared: SharedMessage,
    signal: AbortSignal,
    { save, waitMs = WAIT_MS }: { save?: (edits: Edits) => Promise<Saved>; waitMs?: number } = {},
): Promise<Studio> {
    const first = shared.value() ?? (await arrived(shared, signal, waitMs));
    const studio = createStudio(first, adapterFor, save);
    const storage = sessionStorageOf();
    if (storage) void keepUnsaved(studio, storage, `${UNSAVED_KEY}${first.entry}`);
    const stop = shared.on("updated", (next) => studio.receive(next));
    signal.addEventListener("abort", () => {
        stop();
        studio.destroy();
    });
    return studio;
}

function arrived(
    shared: SharedMessage,
    signal: AbortSignal,
    waitMs: number,
): Promise<StudioMessage> {
    return new Promise((resolve, reject) => {
        const done = () => {
            stop();
            clearTimeout(timer);
            signal.removeEventListener("abort", aborted);
        };
        const stop = shared.on("updated", (next) => {
            done();
            resolve(next);
        });
        const timer = setTimeout(() => {
            done();
            reject(new Error(ErrorMessages.NO_MESSAGE));
        }, waitMs);
        const aborted = () => {
            done();
            reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", aborted, { once: true });
    });
}

function sessionStorageOf(): Storage | undefined {
    try {
        return globalThis.sessionStorage;
    } catch {
        return undefined;
    }
}
