import type { DesignTokens, JsonValue, PlaceInPermutations, Span } from "@sugarcube-sh/dtcg";
import { isJsonObject } from "@sugarcube-sh/dtcg/values";

export interface PlaceRow {
    readonly label: string | undefined;
    readonly value: unknown;
    readonly at: Span;
}

export function placeRows(tokens: DesignTokens, path: string): PlaceRow[] {
    return tokens.writtenAt(path).map((place) => ({
        label: labelOf(place),
        value: isJsonObject(place.written) ? place.written.$value : undefined,
        at: place.span,
    }));
}

export function parsedJson(text: string): { value: JsonValue } | undefined {
    try {
        return { value: JSON.parse(text) };
    } catch {
        return undefined;
    }
}

function labelOf({ sources, readIn }: PlaceInPermutations): string | undefined {
    if (sources.some((source) => source.context)) return readIn.label;
    return sources[0]?.sets[0]?.name;
}
