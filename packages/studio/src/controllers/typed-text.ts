import type { JsonValue } from "@sugarcube-sh/dtcg";

export function numberIn(text: string): number | undefined {
    if (text.trim() === "") return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
}

export function parsedJson(text: string): { value: JsonValue } | undefined {
    try {
        return { value: JSON.parse(text) };
    } catch {
        return undefined;
    }
}
