import type {
    DesignTokens,
    Group,
    JsonValue,
    PlaceInPermutations,
    Span,
    TokenType,
} from "@sugarcube-sh/dtcg";
import type { Clash, NewToken } from "@sugarcube-sh/dtcg-edit";
import { isJsonObject } from "@sugarcube-sh/dtcg/values";

export interface PlaceRow {
    readonly label: string | undefined;
    readonly value: JsonValue | undefined;
    readonly at: Span;
}

export function placeRows(tokens: DesignTokens, path: string): PlaceRow[] {
    return tokens.writtenAt(path).map((place) => ({
        label: labelOf(place),
        value: isJsonObject(place.written) ? place.written.$value : undefined,
        at: place.span,
    }));
}

export type ClashRow = { readonly clash: Clash; readonly keepable: boolean } & (
    | { readonly kind: "renamed"; readonly from: string; readonly to: string }
    | {
          readonly kind: "changed" | "gone" | "removed";
          readonly path: string;
          readonly label: string | undefined;
          readonly yours: unknown;
          readonly theirs: unknown;
      }
);

export function clashRows(tokens: DesignTokens, clashes: readonly Clash[]): ClashRow[] {
    return clashes.map((clash) => {
        const { keepable } = clash;
        const [move] = clash.step.moved;
        if (move) return { clash, keepable, kind: "renamed", from: move.from, to: move.to };
        const [part] = clash.parts;
        const path = part?.path ?? part?.file ?? "";
        return {
            clash,
            keepable,
            kind: !keepable ? "gone" : part?.yours === undefined ? "removed" : "changed",
            path,
            label: placeRows(tokens, path).find(({ at }) => at.file === part?.file)?.label,
            yours: valueOf(part?.yours),
            theirs: valueOf(part?.theirs),
        };
    });
}

export function newToken(
    { type, value }: { type: TokenType; value: JsonValue },
    group: Group | undefined,
): NewToken {
    return type === group?.type ? { $value: value } : { $type: type, $value: value };
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

function valueOf(member: JsonValue | undefined): unknown {
    return isJsonObject(member) ? member.$value : member;
}
