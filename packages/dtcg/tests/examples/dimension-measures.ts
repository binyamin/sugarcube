// Works out what a size is for, such as a font size or a border width, so an editor can show the
// right preview next to it. A setting on the token or on any group above it can say so, and so
// can being used as the font size of a typography token or the width of a border.
import { type DesignSystem, type Group, type Token } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;

function declared(path: string): string | undefined {
    for (let at: Token | Group | undefined = ds.permutation().token(path); at; at = at.group) {
        const setting = at.extensions?.["com.example"] as { measures?: string } | undefined;
        if (setting?.measures) return setting.measures;
    }
    return undefined;
}

const measures: Record<string, string> = {
    "typography fontSize": "font-size",
    "typography letterSpacing": "letter-spacing",
    "border width": "border-width",
};

const usedAs = new Map<string, string>();
for (const t of ds.permutation().tokens) {
    for (const { property = [], token: target } of t.references) {
        const measure = measures[`${t.type} ${property.join(".")}`];
        if (measure && target) usedAs.set(target.path, measure);
    }
}

export function measureOf(path: string): string | undefined {
    return declared(path) ?? usedAs.get(path);
}
