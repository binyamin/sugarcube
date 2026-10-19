import type { TokensOnDisk } from "@sugarcube-sh/dtcg/node";
import { type Conflict, isEdits } from "@sugarcube-sh/dtcg-edit";
import { applyToDisk } from "@sugarcube-sh/dtcg-edit/node";
import { ErrorMessages } from "./error-messages";

export type Saved =
    | { written: string[]; deleted: string[]; conflicts?: undefined }
    | { conflicts: Conflict[]; written?: undefined; deleted?: undefined };

export async function saveEdits(onDisk: TokensOnDisk, sent: unknown): Promise<Saved> {
    if (!isEdits(sent)) throw new Error(ErrorMessages.NOT_EDITS);
    const saved = await applyToDisk(onDisk, sent.ops);
    if (saved.conflicts) return { conflicts: saved.conflicts };
    return { written: Object.keys(saved.written), deleted: saved.deleted };
}
