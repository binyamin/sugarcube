import { type DesignTokens, pathBelow } from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { FileOp, OpResult } from "./index.js";
import { groupCopies, tokenCopies } from "./placement.js";

/**
 * Removes a token or group from every file that writes it: the copy that wins, any copy an earlier
 * file writes that it replaces, and each context's own. Never refused for what refers to it: the
 * tokens and groups left referring to nothing are listed in `broken`.
 *
 * Refused, with the reason: a path that is neither a token nor a group, a token a generator makes,
 * or a token or group inherited through `$extends`.
 *
 * @example
 * const result = remove(tokens, "color.legacy");
 * if (result.broken?.length) warn(result.broken);
 */
export function remove(tokens: DesignTokens, path: string): OpResult {
    const copies =
        tokenCopies(tokens, path) ??
        groupCopies(tokens, path) ??
        refused({ kind: "not-found", path });
    if ("refused" in copies) return copies;

    const ops = copies.places.map(({ span, jsonPath, written }): FileOp => ({
        kind: "remove",
        file: span.file,
        jsonPath,
        was: written,
    }));
    const broken = new Set<string>();
    for (const { from } of tokens.referencedBy(path)) {
        if (from !== path && pathBelow(from, path) === undefined) broken.add(from);
    }
    return { ops, alsoAffects: copies.alsoAffects, broken: [...broken], moved: [] };
}
