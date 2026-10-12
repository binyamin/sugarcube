import type { Merged, MergedToken } from "./merge.js";

export type Reached =
    | { kind: "group"; path: string }
    | { kind: "token"; path: string; token: MergedToken }
    | { kind: "part"; path: string; token: MergedToken; inside: string[] }
    | { kind: "nothing" };

export function reach(steps: string[] | undefined, merged: Merged): Reached {
    if (!steps) return { kind: "nothing" };
    const { path, inside } = pointerParts(steps);
    const token = merged.tokens.get(path);
    if (token) {
        return inside ? { kind: "part", path, token, inside } : { kind: "token", path, token };
    }
    if (!inside && merged.groups.has(path)) return { kind: "group", path };
    return { kind: "nothing" };
}

export function pointerParts(steps: string[]): { path: string; inside?: string[] } {
    const valueAt = steps.indexOf("$value");
    if (valueAt === -1) return { path: steps.join(".") };
    return { path: steps.slice(0, valueAt).join("."), inside: steps.slice(valueAt + 1) };
}

export function refObjectMeaning(reached: Reached): "group" | "token" | "nothing" {
    if (reached.kind === "token" || reached.kind === "part") return "token";
    return reached.kind;
}
