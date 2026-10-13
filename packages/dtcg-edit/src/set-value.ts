import type { DesignSystem, Token } from "@sugarcube-sh/dtcg";
import type { FileOp, Json, OpResult, ValueOptions } from "./index.js";
import { groupPlace, placement, tokenCopies } from "./placement.js";
import { type Member, writtenIn } from "./file-text.js";

/**
 * Changes a token's value.
 *
 * Without a `context`, the shared value changes: one edit where a file every permutation reads
 * writes the token, seen by every context that doesn't override it. With a `context`, such as
 * `{ theme: "dark" }`, that context's own value changes: its override is edited, or one is added
 * to a file that context reads and the others don't; when there are several such files and none
 * declares the token's group, the answer is a `"placement"` question. A context at its default
 * counts as none. A later file replaces a token whole (Resolver 3.3), so a new override also
 * writes what the token says itself: its own `$type`, `$description`, `$deprecated` and
 * `$extensions`, not those it takes from a group.
 *
 * The value is written exactly as given, keeping the file's own spelling; use `toDTCGValue`
 * from `@sugarcube-sh/dtcg` to write a value taken from the model. A value the read finds wrong,
 * such as a reference to a token not made yet, is still written, and the read reports it.
 *
 * Refused, with the reason: a token that doesn't exist, one a generator makes, one a group
 * inherits through `$extends`, an override for two contexts at once, a context with no whole
 * file of its own, an override a file read later would hide, or a shared value when every
 * context writes its own.
 *
 * @example
 * setValue(ds, "color.danger", "{color.red.600}")
 * setValue(ds, "color.danger", "{color.red.400}", { context: { theme: "dark" } })
 */
export function setValue(
    ds: DesignSystem,
    path: string,
    value: Json,
    options: ValueOptions = {},
): OpResult {
    if (options.part !== undefined || options.inherited !== undefined) {
        throw new Error("not implemented yet");
    }
    const placed = placement(ds, path, options);
    if (!("token" in placed)) return placed;
    const { token, alsoAffects } = placed;
    if ("at" in placed) {
        return { ops: written(ds, placed.at, "$value", value), alsoAffects, moved: [] };
    }
    const override = { ...ownProperties(token), $value: value };
    const op: FileOp = {
        kind: "add",
        file: placed.into,
        jsonPath: path.split("."),
        value: override,
    };
    return { ops: [op], alsoAffects, moved: [] };
}

function ownProperties(token: Token): Record<string, Json> {
    const { authored, description, extensions } = token;
    return {
        ...(authored?.type !== undefined && { $type: authored.type }),
        ...(description !== undefined && { $description: description }),
        ...(authored?.deprecated !== undefined && { $deprecated: authored.deprecated }),
        ...(extensions && { $extensions: extensions as Json }),
    };
}

/**
 * Changes a token's description in every file that writes the token, so every context keeps the
 * same one, or a group's in the file that writes it. `null` removes it; removing one that isn't
 * there changes nothing.
 *
 * Refused, with the reason: a path that is neither a token nor a group, a token a generator
 * makes, or a token or group inherited through `$extends`.
 *
 * @example
 * setDescription(ds, "color.brand", "The house colour.")
 */
export function setDescription(
    ds: DesignSystem,
    path: string,
    description: string | null,
): OpResult {
    const copies = tokenCopies(ds, path);
    if (copies && "refused" in copies) return copies;
    if (copies) {
        const ops = copies.places.flatMap((at) => written(ds, at, "$description", description));
        return { ops, alsoAffects: copies.alsoAffects, moved: [] };
    }
    const placed = groupPlace(ds, path);
    if ("refused" in placed) return placed;
    const ops = written(ds, placed.at, "$description", description);
    return { ops, alsoAffects: placed.alsoAffects, moved: [] };
}

function written(ds: DesignSystem, at: Member, key: string, value: Json | null): FileOp[] {
    const { file } = at.span;
    const jsonPath = [...at.jsonPath, key];
    const was = writtenIn(ds, file, jsonPath);
    if (value === null) return was === undefined ? [] : [{ kind: "remove", file, jsonPath, was }];
    return was === undefined
        ? [{ kind: "add", file, jsonPath, value }]
        : [{ kind: "set", file, jsonPath, value, was }];
}
