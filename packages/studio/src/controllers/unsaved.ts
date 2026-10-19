import { decodeEdits, encodeEdits } from "./edits-text";
import type { Studio } from "./studio";

export type EditsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export async function keepUnsaved(
    studio: Studio,
    storage: EditsStorage,
    key: string,
): Promise<void> {
    let kept = studio.unsaved;
    let latest = 0;
    studio.subscribe(async () => {
        const { unsaved } = studio;
        if (unsaved === kept) return;
        kept = unsaved;
        const turn = ++latest;
        if (unsaved.steps.length === 0) {
            storage.removeItem(key);
            return;
        }
        const text = await encodeEdits(unsaved);
        if (turn === latest) storage.setItem(key, text);
    });

    const held = storage.getItem(key);
    const edits = held === null ? undefined : await decodeEdits(held);
    if (edits) studio.restore(edits);
    else if (held !== null) storage.removeItem(key);
}
