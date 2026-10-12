import type { Merged, MergedToken } from "./merge.js";

export type Reached =
    | { kind: "group"; path: string }
    | { kind: "token"; path: string; token: MergedToken }
    | { kind: "part"; path: string; token: MergedToken; inside: string[] }
    | { kind: "nothing" };

export function reach(steps: string[] | undefined, merged: Merged): Reached {
    if (!steps) return { kind: "nothing" };
    const { path, inside } = pointerParts(steps);
    if (path === undefined) return { kind: "nothing" };
    const token = merged.tokens.get(path);
    if (token) {
        return inside ? { kind: "part", path, token, inside } : { kind: "token", path, token };
    }
    if (!inside && merged.groups.has(path)) return { kind: "group", path };
    return { kind: "nothing" };
}

export function pointerParts(steps: string[]): { path?: string; inside?: string[] } {
    const valueAt = steps.indexOf("$value");
    const before = valueAt === -1 ? steps : steps.slice(0, valueAt);
    const path = before.length === 0 ? undefined : before.join(".");
    return {
        ...(path !== undefined && { path }),
        ...(valueAt !== -1 && { inside: steps.slice(valueAt + 1) }),
    };
}

export function wholeValueTarget(steps: string[]): string | undefined {
    const { path, inside } = pointerParts(steps);
    return inside === undefined || inside.length === 0 ? path : undefined;
}

export function refObjectMeaning(reached: Reached): "group" | "token" | "nothing" {
    if (reached.kind === "token" || reached.kind === "part") return "token";
    return reached.kind;
}
