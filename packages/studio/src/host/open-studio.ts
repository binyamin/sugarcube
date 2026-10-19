import { type Studio, createStudio } from "../controllers/studio";
import { ErrorMessages } from "../error-messages";
import type { StudioMessage } from "../protocol";

const WAIT_MS = 10_000;

export interface SharedMessage {
    value(): StudioMessage | undefined;
    on(event: "updated", listener: (value: StudioMessage) => void): () => void;
}

export async function openStudio(
    shared: SharedMessage,
    signal: AbortSignal,
    waitMs = WAIT_MS,
): Promise<Studio> {
    const first = shared.value() ?? (await arrived(shared, signal, waitMs));
    const studio = createStudio(first);
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
