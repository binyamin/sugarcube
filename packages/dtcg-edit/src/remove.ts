import { type Document, type Project, referrers, token, tokensIn } from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { FileOp, OpResult } from "./index.js";
import { groupCopies, tokenCopies } from "./placement.js";

/**
 * Removes a token or group from every file that writes it: the copy that wins, any copy an earlier
 * file writes that it replaces, and each context's own. Never refused for what refers to it: the
 * tokens left pointing at nothing are listed in `broken`.
 *
 * Refused, with the reason: a path that is neither a token nor a group, a token a generator makes,
 * or a token or group inherited through `$extends`.
 *
 * @example
 * const result = remove(project, "color.legacy");
 * if ("ops" in result && result.broken?.length) warn(result.broken);
 */
export function remove(project: Project, path: string): OpResult {
    const copies =
        tokenCopies(project, path) ??
        groupCopies(project, path) ??
        refused({ kind: "not-found", path });
    if ("refused" in copies) return copies;

    const ops = copies.places.map(({ span, path: at, written }): FileOp => ({
        kind: "remove",
        file: span.file,
        path: at,
        was: written,
    }));
    const broken = referrers(project.doc, removedTokens(project.doc, path)).map(
        (each) => each.path,
    );
    return { ops, alsoAffects: copies.alsoAffects, broken, moved: [] };
}

function removedTokens(doc: Document, path: string): string[] {
    const tokens = doc.permutations.flatMap((perm) =>
        token(perm, path) ? [path] : tokensIn(perm, path).map((each) => each.path),
    );
    return [...new Set(tokens)];
}
