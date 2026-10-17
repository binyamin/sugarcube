import type { Parse, UnresolvedValue } from "./index.js";
import { readToken } from "./values/read-syntax.js";

export { colorSpaces, type ColorComponentRange } from "./values/color-spaces.js";
export { dimensionUnits, durationUnits } from "./values/units.js";
export {
    type FontWeightKeyword,
    type LineCap,
    fontWeightKeywords,
    lineCaps,
    strokeStyleKeywords,
} from "./values/keywords.js";
export { tokenTypes } from "./values/token-types.js";
export { parseValue } from "./values/parse-value.js";
export { asJsonPointer, isReference, readReference, referenceText } from "./values/references.js";
export {
    type ExtensionReader,
    type ExtensionResult,
    extensionReader,
} from "./values/extension-reader.js";
export { isJsonObject } from "./values/json.js";
export { compositeParts } from "./values/composite-parts.js";

/**
 * Reads one color value. A reference to a whole token, written `"{color.brand}"`, is read as a
 * `CurlyBraceReference`. A JSON Pointer is read as a `JsonPointerReference`, and may stand in place
 * of the whole value or any part of it.
 *
 * @example
 * parseColor({ colorSpace: "srgb", components: [1, 0, 1] }, [])
 * // { ok: true, value: { colorSpace: "srgb", components: [1, 0, 1], alpha: 1 }, ignored: [] }
 *
 * @example
 * parseColor("{color.brand}", [])
 * // { ok: true, value: { syntax: "curly-brace", path: "color.brand" }, ignored: [] }
 *
 * @example
 * parseColor({ colorSpace: "srgb", components: [1, 0, 1], name: "magenta" }, [])
 * // { ok: false, errors: [{ kind: "invalid-value", jsonPath: ["name"], … }], ignored: [] }
 *
 * @example
 * parseColor({ colorSpace: "srgb", components: [1, 0, 1], name: "magenta" }, [], {
 *   ignoreUnknownProperties: true,
 * })
 * // read without `name`, which is in `ignored`:
 * // [{ kind: "unknown-property", jsonPath: ["name"],
 * //    detail: { type: "color", property: "name" }, … }]
 */
export const parseColor: Parse<UnresolvedValue<"color">> = (raw, jsonPath, options) =>
    readToken("color", raw, jsonPath, options);
/** Reads one dimension value. */
export const parseDimension: Parse<UnresolvedValue<"dimension">> = (raw, jsonPath, options) =>
    readToken("dimension", raw, jsonPath, options);
/** Reads one duration value. */
export const parseDuration: Parse<UnresolvedValue<"duration">> = (raw, jsonPath, options) =>
    readToken("duration", raw, jsonPath, options);
/** Reads one cubic Bézier value. */
export const parseCubicBezier: Parse<UnresolvedValue<"cubicBezier">> = (raw, jsonPath, options) =>
    readToken("cubicBezier", raw, jsonPath, options);
/** Reads one number value. */
export const parseNumber: Parse<UnresolvedValue<"number">> = (raw, jsonPath, options) =>
    readToken("number", raw, jsonPath, options);
/** Reads one font family value. A single name becomes a list of one. */
export const parseFontFamily: Parse<UnresolvedValue<"fontFamily">> = (raw, jsonPath, options) =>
    readToken("fontFamily", raw, jsonPath, options);
/** Reads one font weight value. Keywords become their numbers. */
export const parseFontWeight: Parse<UnresolvedValue<"fontWeight">> = (raw, jsonPath, options) =>
    readToken("fontWeight", raw, jsonPath, options);
/** Reads one stroke style value. */
export const parseStrokeStyle: Parse<UnresolvedValue<"strokeStyle">> = (raw, jsonPath, options) =>
    readToken("strokeStyle", raw, jsonPath, options);
/**
 * Reads one border value. A part written as a reference is kept as written, in either syntax,
 * and checked against its target when references are followed.
 *
 * @example
 * parseBorder({ color: "{color.brand}", width: { value: 1, unit: "px" }, style: "solid" }, [])
 * // { ok: true, value: { color: { syntax: "curly-brace", path: "color.brand" },
 * //   width: { value: 1, unit: "px" },
 * //   style: { kind: "keyword", keyword: "solid" } }, ignored: [] }
 */
export const parseBorder: Parse<UnresolvedValue<"border">> = (raw, jsonPath, options) =>
    readToken("border", raw, jsonPath, options);
/** Reads one shadow value. A single shadow becomes a list of one. */
export const parseShadow: Parse<UnresolvedValue<"shadow">> = (raw, jsonPath, options) =>
    readToken("shadow", raw, jsonPath, options);
/** Reads one gradient value. */
export const parseGradient: Parse<UnresolvedValue<"gradient">> = (raw, jsonPath, options) =>
    readToken("gradient", raw, jsonPath, options);
/** Reads one transition value. */
export const parseTransition: Parse<UnresolvedValue<"transition">> = (raw, jsonPath, options) =>
    readToken("transition", raw, jsonPath, options);
/** Reads one typography value. */
export const parseTypography: Parse<UnresolvedValue<"typography">> = (raw, jsonPath, options) =>
    readToken("typography", raw, jsonPath, options);
