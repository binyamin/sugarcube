import type {
    CubicBezierValue,
    DesignTokens,
    DimensionValue,
    DurationValue,
    JsonPath,
    JsonValue,
    Permutation,
    StrokeStyleValue,
    TokenType,
} from "@sugarcube-sh/dtcg";
import {
    type FontWeightKeyword,
    compositeParts,
    dimensionUnits,
    durationUnits,
    fontWeightKeywords,
    isJsonObject,
    parseValue,
    readReference,
    strokeStyleKeywords,
} from "@sugarcube-sh/dtcg/values";
import { nodeAt } from "./views";

type StrokeStyleKeyword = Extract<StrokeStyleValue, { kind: "keyword" }>["keyword"];

export type Field =
    | { readonly kind: "dimension"; readonly value: number; readonly unit: DimensionValue["unit"] }
    | { readonly kind: "duration"; readonly value: number; readonly unit: DurationValue["unit"] }
    | { readonly kind: "number"; readonly value: number }
    | { readonly kind: "fontWeight"; readonly value: number | FontWeightKeyword }
    | { readonly kind: "fontFamily"; readonly fonts: readonly string[]; readonly alone: boolean }
    | { readonly kind: "cubicBezier"; readonly points: CubicBezierValue }
    | { readonly kind: "strokeStyle"; readonly keyword: StrokeStyleKeyword }
    | { readonly kind: "reference"; readonly path: string }
    | { readonly kind: "parts"; readonly parts: readonly FieldPart[] }
    | {
          readonly kind: "list";
          readonly type: "shadow" | "gradient";
          readonly items: readonly ListItem[];
          readonly single: boolean;
      }
    | { readonly kind: "dashes"; readonly dashes: readonly Slot[]; readonly lineCap: string }
    | { readonly kind: "json"; readonly value: JsonValue };

export type FieldWithParts = Extract<Field, { kind: "parts" | "list" | "dashes" }>;

export type FieldType = Exclude<Field["kind"], "reference" | "json" | FieldWithParts["kind"]>;

export type CompositeType = keyof typeof compositeParts;

export interface Slot {
    readonly at: JsonPath;
    readonly type: TokenType | "boolean";
    readonly written: JsonValue | undefined;
}

export interface FieldPart extends Slot {
    readonly name: string;
}

export type ListItem = { readonly at: JsonPath; readonly written: JsonValue } & (
    | { readonly shown: "parts"; readonly parts: readonly FieldPart[] }
    | { readonly shown: "reference" | "json" }
);

export type Draft =
    | { readonly kind: "dimension" | "duration"; readonly amount: string; readonly unit: string }
    | { readonly kind: "number"; readonly amount: string }
    | {
          readonly kind: "fontWeight";
          readonly choice: FontWeightKeyword | "number" | "";
          readonly amount: string;
      }
    | { readonly kind: "fontFamily"; readonly fonts: readonly string[]; readonly alone: boolean }
    | { readonly kind: "cubicBezier"; readonly points: readonly string[] }
    | { readonly kind: "strokeStyle"; readonly keyword: string };

const fieldTypes = {
    dimension: true,
    duration: true,
    number: true,
    fontWeight: true,
    fontFamily: true,
    cubicBezier: true,
    strokeStyle: true,
} satisfies Record<FieldType, true>;

export const weightKeywords = Object.keys(fontWeightKeywords) as FontWeightKeyword[];

export function hasField(type: TokenType): type is FieldType {
    return Object.hasOwn(fieldTypes, type);
}

export function fieldFor(type: TokenType | undefined, written: JsonValue): Field {
    const json: Field = { kind: "json", value: written };
    if (type === undefined) return json;
    const reference = readReference(written);
    if (reference) {
        return reference.syntax === "curly-brace"
            ? { kind: "reference", path: reference.path }
            : json;
    }
    if (isComposite(type)) return compositeField(type, written) ?? json;
    if (type === "strokeStyle") {
        const dashes = dashesIn(written);
        if (dashes) return dashes;
    }
    if (!hasField(type)) return json;
    return literalField(type, written) ?? json;
}

export function isComposite(type: TokenType): type is CompositeType {
    return Object.hasOwn(compositeParts, type);
}

export function hasParts(field: Field): field is FieldWithParts {
    return field.kind === "parts" || field.kind === "list" || field.kind === "dashes";
}

export function partsOf(type: CompositeType, written: JsonValue): FieldPart[] | undefined {
    if (!isJsonObject(written)) return undefined;
    const parts: Readonly<Record<string, TokenType | "boolean">> = compositeParts[type];
    if (Object.keys(written).some((name) => !Object.hasOwn(parts, name))) return undefined;
    return Object.entries(parts).map(([name, partType]) => ({
        name,
        at: [name],
        type: partType,
        written: written[name],
    }));
}

function compositeField(type: CompositeType, written: JsonValue): Field | undefined {
    if (type === "shadow" || type === "gradient") {
        if (Array.isArray(written) && written.length > 0) {
            const items = written.map((each, index) => itemAt(type, each, [index]));
            return { kind: "list", type, items, single: false };
        }
        return type === "shadow" && isJsonObject(written)
            ? { kind: "list", type, items: [itemAt(type, written, [])], single: true }
            : undefined;
    }
    const parts = partsOf(type, written);
    return parts && { kind: "parts", parts };
}

function itemAt(type: "shadow" | "gradient", written: JsonValue, at: JsonPath): ListItem {
    if (readReference(written)) return { at, written, shown: "reference" };
    const parts = partsOf(type, written);
    return parts ? { at, written, shown: "parts", parts } : { at, written, shown: "json" };
}

function dashesIn(written: JsonValue): Field | undefined {
    if (!isJsonObject(written)) return undefined;
    const { dashArray, lineCap, ...rest } = written;
    if (Object.keys(rest).length > 0 || !Array.isArray(dashArray) || dashArray.length === 0) {
        return undefined;
    }
    return {
        kind: "dashes",
        dashes: dashArray.map((dash, index) => ({
            at: ["dashArray", index],
            type: "dimension",
            written: dash,
        })),
        lineCap: typeof lineCap === "string" ? lineCap : "",
    };
}

function literalField(type: FieldType, written: JsonValue): Field | undefined {
    switch (type) {
        case "dimension": {
            const read = parseValue(type, written, [], { references: false });
            return read.ok
                ? { kind: type, value: read.value.value, unit: read.value.unit }
                : undefined;
        }
        case "duration": {
            const read = parseValue(type, written, [], { references: false });
            return read.ok
                ? { kind: type, value: read.value.value, unit: read.value.unit }
                : undefined;
        }
        case "number": {
            const read = parseValue(type, written, [], { references: false });
            return read.ok ? { kind: type, value: read.value } : undefined;
        }
        case "fontWeight": {
            const read = parseValue(type, written, [], { references: false });
            if (!read.ok) return undefined;
            const keyword = weightKeywords.find((each) => each === written);
            return { kind: type, value: keyword ?? read.value };
        }
        case "fontFamily": {
            const read = parseValue(type, written, [], { references: false });
            return read.ok
                ? { kind: type, fonts: read.value, alone: typeof written === "string" }
                : undefined;
        }
        case "cubicBezier": {
            const read = parseValue(type, written, [], { references: false });
            return read.ok ? { kind: type, points: read.value } : undefined;
        }
        case "strokeStyle": {
            const read = parseValue(type, written, [], { references: false });
            return read.ok && read.value.kind === "keyword"
                ? { kind: type, keyword: read.value.keyword }
                : undefined;
        }
    }
}

export function writtenFor(field: Field): JsonValue {
    switch (field.kind) {
        case "dimension":
        case "duration":
            return { value: field.value, unit: field.unit };
        case "number":
        case "fontWeight":
            return field.value;
        case "fontFamily": {
            const [only] = field.fonts;
            return field.alone && field.fonts.length === 1 && only !== undefined
                ? only
                : [...field.fonts];
        }
        case "cubicBezier":
            return [...field.points];
        case "strokeStyle":
            return field.keyword;
        case "reference":
            return `{${field.path}}`;
        case "parts":
            return Object.fromEntries(
                field.parts.flatMap(({ name, written }) =>
                    written === undefined ? [] : [[name, written]],
                ),
            );
        case "list": {
            const items = writtenItems(field);
            const [only] = items;
            return field.single && items.length === 1 && only !== undefined ? only : items;
        }
        case "dashes":
            return listedAs(field, writtenItems(field));
        case "json":
            return field.value;
    }
}

type Listed = Extract<Field, { kind: "list" | "dashes" }>;

export function withAdded(field: Listed): JsonValue {
    const items = writtenItems(field);
    const last = items.at(-1);
    return listedAs(field, last === undefined ? items : [...items, last]);
}

export function withRemoved(field: Listed, at: number): JsonValue {
    return listedAs(field, without(writtenItems(field), at));
}

function writtenItems(field: Listed): JsonValue[] {
    const items = field.kind === "list" ? field.items : field.dashes;
    return items.flatMap(({ written }) => (written === undefined ? [] : [written]));
}

function listedAs(field: Listed, items: JsonValue[]): JsonValue {
    if (field.kind === "list") return items;
    return field.lineCap === ""
        ? { dashArray: items }
        : { dashArray: items, lineCap: field.lineCap };
}

export function changes(field: Field, written: JsonValue | undefined): boolean {
    return written === undefined || !same(writtenFor(field), written);
}

export function draftFor(type: FieldType, field: Field | undefined): Draft {
    switch (type) {
        case "dimension":
        case "duration":
            return field?.kind === type
                ? { kind: type, amount: String(field.value), unit: field.unit }
                : { kind: type, amount: "", unit: "" };
        case "number":
            return { kind: type, amount: field?.kind === type ? String(field.value) : "" };
        case "fontWeight": {
            if (field?.kind !== type) return { kind: type, choice: "", amount: "" };
            const { value } = field;
            return typeof value === "number"
                ? { kind: type, choice: "number", amount: String(value) }
                : { kind: type, choice: value, amount: String(fontWeightKeywords[value]) };
        }
        case "fontFamily":
            return field?.kind === type
                ? { kind: type, fonts: field.fonts, alone: field.alone }
                : { kind: type, fonts: [""], alone: true };
        case "cubicBezier": {
            if (field?.kind !== type) return { kind: type, points: ["", "", "", ""] };
            const [a, b, c, d] = field.points;
            return { kind: type, points: [String(a), String(b), String(c), String(d)] };
        }
        case "strokeStyle":
            return { kind: type, keyword: field?.kind === type ? field.keyword : "" };
    }
}

export function fieldFrom(draft: Draft): Field | undefined {
    switch (draft.kind) {
        case "dimension": {
            const value = numberIn(draft.amount);
            const unit = dimensionUnits.find((each) => each === draft.unit);
            return value === undefined || unit === undefined
                ? undefined
                : { kind: draft.kind, value, unit };
        }
        case "duration": {
            const value = numberIn(draft.amount);
            const unit = durationUnits.find((each) => each === draft.unit);
            return value === undefined || unit === undefined
                ? undefined
                : { kind: draft.kind, value, unit };
        }
        case "number": {
            const value = numberIn(draft.amount);
            return value === undefined ? undefined : { kind: draft.kind, value };
        }
        case "fontWeight": {
            if (draft.choice === "") return undefined;
            if (draft.choice !== "number") return { kind: draft.kind, value: draft.choice };
            const value = numberIn(draft.amount);
            return value === undefined ? undefined : { kind: draft.kind, value };
        }
        case "fontFamily":
            return draft.fonts.length > 0 && draft.fonts.every((name) => name !== "")
                ? { kind: draft.kind, fonts: draft.fonts, alone: draft.alone }
                : undefined;
        case "cubicBezier": {
            const [a, b, c, d] = draft.points.map(numberIn);
            return a === undefined || b === undefined || c === undefined || d === undefined
                ? undefined
                : { kind: draft.kind, points: [a, b, c, d] };
        }
        case "strokeStyle": {
            const keyword = strokeStyleKeywords.find((each) => each === draft.keyword);
            return keyword === undefined ? undefined : { kind: draft.kind, keyword };
        }
    }
}

export function says(draft: Draft, field: Field | undefined): boolean {
    const made = fieldFrom(draft);
    return made === undefined || field === undefined
        ? made === field
        : same(writtenFor(made), writtenFor(field));
}

export function moved<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list];
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    return next;
}

export function without<T>(list: readonly T[], at: number): T[] {
    return list.filter((_, index) => index !== at);
}

export function referable(
    tokens: DesignTokens,
    showing: Permutation,
    type: TokenType,
    path: string,
): string[] {
    return tokens.tokenPaths().filter((each) => {
        if (each === path) return false;
        const node = nodeAt(tokens, showing, each)?.node;
        return node?.kind !== "group" && node?.type === type;
    });
}

function numberIn(text: string): number | undefined {
    if (text.trim() === "") return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
}

function same(a: JsonValue, b: JsonValue): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function parsedJson(text: string): { value: JsonValue } | undefined {
    try {
        return { value: JSON.parse(text) };
    } catch {
        return undefined;
    }
}
