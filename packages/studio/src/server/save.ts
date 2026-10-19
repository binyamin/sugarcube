import type { TokensOnDisk } from "@sugarcube-sh/dtcg/node";
import { isEdits } from "@sugarcube-sh/dtcg-edit";
import { applyToDisk } from "@sugarcube-sh/dtcg-edit/node";
import { ErrorMessages } from "../error-messages";
import type { SaveOutcome } from "../protocol";

export async function saveEdits(onDisk: TokensOnDisk, sent: unknown): Promise<SaveOutcome> {
    if (!isEdits(sent)) throw new Error(ErrorMessages.NOT_EDITS);
    const saved = await applyToDisk(onDisk, sent.ops);
    if (saved.conflicts) return { conflicts: saved.conflicts };
    return { written: Object.keys(saved.written), deleted: saved.deleted };
}
