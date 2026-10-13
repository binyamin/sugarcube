import {
    type Document,
    type Project,
    childPath,
    forbiddenInName,
    group,
    parentOf,
    token,
} from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { FileOp, OpResult } from "./index.js";
import { groupCopies, tokenCopies } from "./placement.js";
import { type Place, placeOf } from "./project-text.js";

/**
 * Renames a token or group where each is written, and rewrites every reference to it or to
 * anything inside it, in whichever file it is written, the resolver too: `{…}` references,
 * `$ref` pointers (keeping their steps into the value), and `$extends`. Text that only looks like
 * a reference, such as a `$description` mentioning `{color.brand}`, is left alone. References are
 * found in the permutations the read built, so a read limited by `inputs` can miss one written in
 * a file only another permutation reads. `moved` gives the path that changed, which a session's
 * ids and {@link diff} follow.
 *
 * Refused, with the reason: a path that is neither a token nor a group, a name already taken or
 * one the spec forbids, a token a generator makes, or a token or group inherited through
 * `$extends`.
 *
 * @example
 * session.do(rename(session.project, "color.brand", "primary"));
 */
export function rename(project: Project, path: string, newName: string): OpResult {
    if (newName === "") return refused({ kind: "invalid-name", name: newName });
    const character = forbiddenInName(newName);
    if (character !== undefined) return refused({ kind: "invalid-name", name: newName, character });

    const copies =
        tokenCopies(project, path) ??
        groupCopies(project, path) ??
        refused({ kind: "not-found", path });
    if ("refused" in copies) return copies;
    const to = childPath(parentOf(path), newName);
    if (to === path) return { ops: [], alsoAffects: copies.alsoAffects, moved: [] };
    if (taken(project.doc, to)) return refused({ kind: "taken", path: to });

    const moved = [{ from: path, to }];
    const keys = copies.places.map(({ span, path: at, written }): FileOp => ({
        kind: "renameKey",
        file: span.file,
        path: at,
        name: newName,
        was: written,
    }));
    const references = project.doc.referencedBy(path).flatMap((reference): FileOp[] => {
        const place = placeOf(project, reference.span);
        if (!place) return [];
        const at = afterKeys(place, copies.places, newName);
        const value = reference.moved(moved);
        return [{ kind: "set", file: place.span.file, path: at, value, was: place.written }];
    });
    return { ops: [...keys, ...references], alsoAffects: copies.alsoAffects, moved };
}

function taken(doc: Document, path: string): boolean {
    return doc.permutations.some((perm) => (token(perm, path) ?? group(perm, path)) !== undefined);
}

function afterKeys(place: Place, keys: Place[], name: string): Place["path"] {
    return keys.reduce((path, key) => {
        const inside =
            key.span.file === place.span.file &&
            key.path.length <= path.length &&
            key.path.every((step, index) => path[index] === step);
        return inside
            ? path.map((step, index) => (index === key.path.length - 1 ? name : step))
            : path;
    }, place.path);
}
