// Works out what a size is for, such as a font size or a border width, so an editor can show the
// right preview next to it. A setting on the token or on any group above it can say so, and so
// can being used as the font size of a typography token or the width of a border.
import {
    defaultPermutation,
    isAlias,
    isPointer,
    token,
    type Document,
    type Group,
    type Token,
} from "@sugarcube-sh/dtcg";

declare const doc: Document;

function declared(path: string): string | undefined {
    for (let at: Token | Group | undefined = token(doc, path); at; at = at.group) {
        const setting = at.extensions?.["com.example"] as { measures?: string } | undefined;
        if (setting?.measures) return setting.measures;
    }
    return undefined;
}

const usedAs = new Map<string, string>();
for (const t of defaultPermutation(doc)?.tokens ?? []) {
    if (t.type === "typography" && t.value && !isAlias(t.value) && !isPointer(t.value)) {
        if (isAlias(t.value.fontSize)) usedAs.set(t.value.fontSize.alias, "font-size");
        if (isAlias(t.value.letterSpacing))
            usedAs.set(t.value.letterSpacing.alias, "letter-spacing");
    }
    if (
        t.type === "border" &&
        t.value &&
        !isAlias(t.value) &&
        !isPointer(t.value) &&
        isAlias(t.value.width)
    ) {
        usedAs.set(t.value.width.alias, "border-width");
    }
}

export function measureOf(path: string): string | undefined {
    return declared(path) ?? usedAs.get(path);
}
