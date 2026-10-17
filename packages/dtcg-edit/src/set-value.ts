import type { DesignTokens, Token, JsonValue } from "@sugarcube-sh/dtcg";
import type { FileOp, OpResult, ValueOptions } from "./index.js";
import { asked, copiesOf, describedPlace, placement } from "./placement.js";
import { type Member, writtenIn } from "./file-text.js";

/**
 * Changes a token's value.
 *
 * Without an `input`, the shared value changes: one edit where a file every permutation reads
 * writes the token, seen by every context that doesn't override it. With an `input`, such as
 * `{ mode: "dark" }`, that context's own value changes: its override is edited, or one is added
 * to a file that context reads and the others don't; when there are several such files and none
 * declares the token's group, the answer is a placement {@link Question}. A context at its default
 * counts as none. A later file replaces a token whole (Resolver 3.3), so a new override also
 * writes what the token says itself: its own `$type`, `$description`, `$deprecated` and
 * `$extensions`, not those it takes from a group.
 *
 * With `at`, a place from `tokens.writtenAt(path)`, the value written at that place changes
 * instead, whichever contexts read it.
 *
 * The value is written exactly as given, keeping the file's own spelling; use `toDTCGValue`
 * from `@sugarcube-sh/dtcg` to write a value taken from the model. A value the read finds wrong,
 * such as a reference to a token not made yet, is still written, and the read reports it.
 *
 * Refused, with the reason: a token that doesn't exist, one a generator makes, one a group
 * inherits through `$extends`, an override for two contexts at once, a context with no whole
 * file of its own, an override a file read later would hide, a shared value when every
 * context writes its own, or a place `at` where the token isn't written.
 *
 * @example
 * setValue(tokens, "color.danger", "{color.red.600}")
 * setValue(tokens, "color.danger", "{color.red.400}", { input: { mode: "dark" } })
 * const dark = tokens.writtenAt("color.danger").find(({ span }) => span.file === "dark.json");
 * if (dark) setValue(tokens, "color.danger", "{color.red.400}", { at: dark.span });
 */
export function setValue(
    tokens: DesignTokens,
    path: string,
    value: JsonValue,
    options: ValueOptions = {},
): OpResult {
    return setValueIn(tokens, path, value, options);
}

function setValueIn(
    tokens: DesignTokens,
    path: string,
    value: JsonValue,
    options: ValueOptions,
    place?: string,
): OpResult {
    if (options.part !== undefined) throw new Error("not implemented yet");
    const placed = placement(tokens, path, options, place);
    if ("choose" in placed) {
        return asked(placed.choose, (file) => setValueIn(tokens, path, value, options, file));
    }
    if ("refused" in placed) return placed;
    if ("at" in placed) {
        const { at, alsoAffects } = placed;
        return { ops: written(tokens, at, "$value", value), alsoAffects, moved: [] };
    }
    const { token, into, alsoAffects } = placed;
    const override = { ...ownProperties(token), $value: value };
    const op: FileOp = {
        kind: "add",
        file: into,
        jsonPath: path.split("."),
        value: override,
    };
    return { ops: [op], alsoAffects, moved: [] };
}

function ownProperties(token: Token): Record<string, JsonValue> {
    const { authored, description, extensions } = token;
    return {
        ...(authored?.type !== undefined && { $type: authored.type }),
        ...(description !== undefined && { $description: description }),
        ...(authored?.deprecated !== undefined && { $deprecated: authored.deprecated }),
        ...(extensions && { $extensions: extensions as JsonValue }),
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
 * setDescription(tokens, "color.brand", "The house colour.")
 */
export function setDescription(
    tokens: DesignTokens,
    path: string,
    description: string | null,
): OpResult {
    return setDescriptionIn(tokens, path, description);
}

function setDescriptionIn(
    tokens: DesignTokens,
    path: string,
    description: string | null,
    place?: string,
): OpResult {
    const copies = copiesOf(tokens, path);
    if ("refused" in copies) return copies;
    if (copies.of === "token") {
        const ops = copies.places.flatMap((at) => written(tokens, at, "$description", description));
        return { ops, alsoAffects: copies.alsoAffects, moved: [] };
    }
    const described = describedPlace(tokens, path, copies.places, place);
    if ("choose" in described) {
        return asked(described.choose, (file) => setDescriptionIn(tokens, path, description, file));
    }
    if ("refused" in described) return described;
    const ops = written(tokens, described.at, "$description", description);
    return { ops, alsoAffects: described.alsoAffects, moved: [] };
}

function written(tokens: DesignTokens, at: Member, key: string, value: JsonValue | null): FileOp[] {
    const { file } = at.span;
    const jsonPath = [...at.jsonPath, key];
    const was = writtenIn(tokens, file, jsonPath);
    if (value === null) return was === undefined ? [] : [{ kind: "remove", file, jsonPath, was }];
    return was === undefined
        ? [{ kind: "add", file, jsonPath, value }]
        : [{ kind: "set", file, jsonPath, value, was }];
}
