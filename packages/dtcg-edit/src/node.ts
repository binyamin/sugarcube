import type { Project } from "@sugarcube-sh/dtcg";
import type { Conflict, FileOp } from "./index.js";

/**
 * Applies edits to the files on disk. Each file is read as it is now, so edits made elsewhere
 * in the meantime are kept, and edits that no longer apply, as `apply` decides, are
 * returned as conflicts.
 *
 * Only files the design system reads once the edits are applied can be written: a new file must
 * be added to the resolver by the same edits, and a file such as `package.json` is always
 * refused. A file can only be deleted if the design system read it before the edits and no
 * longer reads it after them.
 *
 * Every edit is applied in memory before any file is written, so if one fails, nothing is
 * written. Each file is written to a temporary copy and then renamed into place, so no file is
 * left half-written.
 */
export function applyToDisk(
    project: Project,
    ops: FileOp[],
): Promise<{ written: string[] } | { conflicts: Conflict[] } | { refused: { reason: string } }> {
    throw new Error("not implemented yet");
}
