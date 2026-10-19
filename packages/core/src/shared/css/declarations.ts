import {
    type DesignTokens,
    type ParseOptions,
    type Permutation,
    type Source,
    type Token,
} from "@sugarcube-sh/dtcg";
import { cssVariable } from "@sugarcube-sh/dtcg/css";
import type { FluidConfig, InternalConfig } from "../../types/config.js";
import { SUGARCUBE_NAMESPACE } from "../extensions.js";
import { type Fallbacks, fallbacksIn, supportsCondition } from "./polyfill.js";
import { type ReplacementFor, type Written, renderToken } from "./values.js";

export interface Declaration {
    token: Token;
    name: string;
    property?: string;
    value: string;
    supports?: { condition: string; value: string };
}

export interface Declared {
    declarations: Declaration[];
    undeclared: { token: Token; private: boolean }[];
    missing: Fallbacks["missing"];
}

export interface DeclarationOptions {
    variable: (path: string, property?: string) => string;
    privateSource: (source: Source) => boolean;
    fluid: FluidConfig;
    polyfill: boolean;
    parseOptions: ParseOptions;
}

export function declarationOptions(
    tokens: DesignTokens,
    config: InternalConfig,
): DeclarationOptions {
    const { prefix, case: casing, delimiter, variableName, transforms } = config.variables;
    return {
        variable: (path, property) =>
            cssVariable(path, {
                prefix,
                case: casing,
                delimiter,
                name: variableName,
                cssProperty: property,
            }),
        privateSource: (source) => !emits(source),
        fluid: transforms.fluid,
        polyfill: transforms.colorFallbackStrategy === "polyfill",
        parseOptions: tokens.parseOptions,
    };
}

export interface Renderer {
    native(token: Token): Written | undefined;
    fallback(token: Token): Written | undefined;
    isPrivate(token: Token): boolean;
}

export function renderer({
    variable,
    privateSource,
    fluid,
    parseOptions,
}: DeclarationOptions): Renderer {
    const privateFrom = new Map<Source, boolean>();
    const isPrivate = ({ valueFrom: { source } }: Token) => {
        let found = privateFrom.get(source);
        if (found === undefined) {
            found = privateSource(source);
            privateFrom.set(source, found);
        }
        return found;
    };
    const writer = (colors: "native" | "hex") => {
        const renderedFor = new Map<Token, Written | undefined>();
        const rendered = (each: Token): Written | undefined => {
            if (!renderedFor.has(each)) {
                renderedFor.set(
                    each,
                    renderToken(each, replacementFor, { fluid, colors, parseOptions }),
                );
            }
            return renderedFor.get(each);
        };
        const replacementFor: ReplacementFor = (ref, property) => {
            const target = ref.token;
            const written = target && rendered(target);
            if (!target || written === undefined) return undefined;
            return isPrivate(target) ? { written } : { variable: variable(target.path, property) };
        };
        return rendered;
    };
    return { native: writer("native"), fallback: writer("hex"), isPrivate };
}

export function declarations(
    permutation: Permutation,
    { variable, polyfill }: DeclarationOptions,
    { native, fallback, isPrivate }: Renderer,
): Declared {
    const lines = (each: Token, written: Written): Declaration[] => {
        if (typeof written === "string") {
            return [{ token: each, name: variable(each.path), value: written }];
        }
        return Object.entries(written).map(([property, value]) => ({
            token: each,
            name: variable(each.path, property),
            property,
            value,
        }));
    };

    const missing: Fallbacks["missing"] = [];
    const undeclared: Declared["undeclared"] = [];
    const declare = (each: Token): Declaration[] => {
        const hidden = isPrivate(each);
        const written = hidden ? undefined : native(each);
        if (written === undefined) {
            undeclared.push({ token: each, private: hidden });
            return [];
        }
        const found = polyfill ? fallbacksIn(each, isPrivate) : undefined;
        const plain = found && found.spaces.length > 0 ? fallback(each) : undefined;
        if (found) missing.push(...found.missing);
        if (!found || plain === undefined) return lines(each, written);
        const real = new Map(lines(each, written).map(({ name, value }) => [name, value]));
        const condition = supportsCondition(found.spaces);
        return lines(each, plain).map((line) => {
            const own = real.get(line.name);
            if (own !== undefined && own !== line.value) line.supports = { condition, value: own };
            return line;
        });
    };

    const declared = permutation.tokens.flatMap(declare);
    return { declarations: declared, undeclared, missing };
}

function emits(source: Source): boolean {
    const outermostFirst = [...source.sets.map(({ extensions }) => extensions), source.extensions];
    let emitted = true;
    for (const extensions of outermostFirst) {
        const ours = extensions?.[SUGARCUBE_NAMESPACE];
        if (typeof ours === "object" && ours !== null && "emit" in ours) {
            emitted = ours.emit !== false;
        }
    }
    return emitted;
}
