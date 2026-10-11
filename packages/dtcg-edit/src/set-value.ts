import type { Project } from "@sugarcube-sh/dtcg";
import type { FileOp, Json, OpResult, ValueOptions } from "./index.js";
import { type Place, declaredPlace, placement, writtenAt } from "./placement.js";

/**
 * Changes a token's value.
 *
 * Without a `context`, the shared value changes: one edit where a file every permutation reads
 * writes the token, seen by every context that doesn't override it. With a `context`, such as
 * `{ theme: "dark" }`, that context's own value changes: its override is edited, or one is added
 * to a file that context reads and the others don't; when there are several such files and none
 * declares the token's group, the answer is a `"placement"` question. A context at its default
 * counts as none.
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
 * setValue(project, "color.danger", "{color.red.600}")
 * setValue(project, "color.danger", "{color.red.400}", { context: { theme: "dark" } })
 */
export function setValue(
    project: Project,
    path: string,
    value: Json,
    options: ValueOptions = {},
): OpResult {
    if (options.part !== undefined || options.inherited !== undefined) {
        throw new Error("not implemented yet");
    }
    const placed = placement(project, path, options);
    if (!("token" in placed)) return placed;
    const { token, alsoAffects } = placed;
    if ("at" in placed) {
        return { ops: written(project, placed.at, "$value", value), alsoAffects, moved: [] };
    }
    const override = { ...(token.authored?.typeDeclared && { $type: token.type }), $value: value };
    const op: FileOp = { kind: "add", file: placed.into, path: path.split("."), value: override };
    return { ops: [op], alsoAffects, moved: [] };
}

/**
 * Changes a token's or group's description, where a file every permutation reads writes it.
 * `null` removes it; removing one that isn't there changes nothing. Refused, with the reason, as
 * {@link setValue} refuses.
 *
 * @example
 * setDescription(project, "color.brand", "The house colour.")
 */
export function setDescription(
    project: Project,
    path: string,
    description: string | null,
): OpResult {
    const placed = declaredPlace(project, path);
    if ("refused" in placed) return placed;
    const ops = written(project, placed.at, "$description", description);
    return { ops, alsoAffects: placed.alsoAffects, moved: [] };
}

function written(project: Project, at: Place, key: string, value: Json | null): FileOp[] {
    const { file } = at.span;
    const path = [...at.path, key];
    const was = writtenAt(project, at, key);
    if (value === null) return was === undefined ? [] : [{ kind: "remove", file, path, was }];
    return was === undefined
        ? [{ kind: "add", file, path, value }]
        : [{ kind: "set", file, path, value, was }];
}
