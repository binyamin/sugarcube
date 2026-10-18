import type { Group, JsonPath, Place, Token, TokenType } from "../index.js";
import type { MergedGroup, MergedToken } from "./merge.js";
import type { Properties } from "./walk.js";
import { sameJson } from "../values/same-value.js";

export interface Target {
    path?: string | undefined;
    token?: Token | undefined;
    targetProperty?: JsonPath | undefined;
}

export interface MadeFrom {
    type: TokenType;
    value: unknown;
    resolved: unknown;
    invalid: true | undefined;
    deprecated: boolean | string | undefined;
    writtenAt: readonly Place[];
}

export function sameToken(
    earlier: Token,
    written: MergedToken,
    now: MadeFrom,
    targets: readonly Target[],
): boolean {
    if (earlier.type !== now.type || earlier.deprecated !== now.deprecated) return false;
    if (!sameList(earlier.writtenAt, now.writtenAt)) return false;
    if (earlier.generated?.from !== written.generated?.from) return false;
    if (earlier.generated?.extension !== written.generated?.extension) return false;
    if (earlier.inherited?.from !== written.inherited?.from) return false;
    const { references } = earlier;
    if (references.length !== targets.length) return false;
    let followed = targets.length > 0;
    for (const [index, { path, token, targetProperty }] of targets.entries()) {
        const reference = references[index];
        if (!reference || reference.token !== token || reference.path !== path) return false;
        if (targetProperty !== undefined) followed = false;
    }
    const resolved =
        followed ||
        earlier.resolved === now.resolved ||
        ((targets.length > 0 || written.added === true) &&
            sameJson(earlier.resolved, now.resolved));
    if (!written.added) return earlier.value === now.value && resolved;
    return (
        resolved &&
        sameJson(earlier.value, now.value) &&
        earlier.description === written.description &&
        sameJson(earlier.extensions, written.extensions)
    );
}

export function sameGroup(
    earlier: Group,
    written: MergedGroup,
    applies: Properties,
    writtenAt: readonly Place[],
    children: readonly (Token | Group)[],
    extending: Group | undefined,
): boolean {
    return (
        earlier.extends === extending &&
        earlier.type === (applies.type === "unusable" ? undefined : applies.type) &&
        earlier.deprecated === applies.deprecated &&
        earlier.inherited?.from === written.inherited?.from &&
        sameList(earlier.writtenAt, writtenAt) &&
        sameList(earlier.children, children)
    );
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
    return a.length === b.length && a.every((each, index) => each === b[index]);
}
