import type { Node } from "jsonc-parser";
import type {
    Diagnostic,
    ExtensionError,
    ExtensionMessages,
    ExtensionValidator,
    Permutation,
    StandardSchemaV1,
    IgnoredProperty,
    ParseOptions,
    ValueError,
} from "../index.js";
import { type SchemaOutput, checkSchema, extensionDiagnostic } from "./extension-check.js";
import { type JsonFile, member } from "./json.js";
import { everyGroup } from "./merge.js";
import { settingsOf } from "./settings.js";
import type { NormalisedPermutation } from "./normalise.js";

type Checked = Parameters<NonNullable<ExtensionValidator["validate"]>>[0];

/**
 * Defines an {@link ExtensionValidator}, checking each error `validate` returns against its
 * `messages`. With a `schema`, `validate` receives the schema's output.
 *
 * @example
 * // { "space": { "$type": "dimension", "$value": …, "$extensions": { "com.example": { "fluid": true } } } }
 * const fluid = defineExtensionValidator({
 *   key: "com.example",
 *   appliesTo: ["dimension"],
 *   messages: {
 *     "not-a-boolean": ({ fluid }: { fluid: unknown }) =>
 *       `\`fluid\` must be true or false, not ${JSON.stringify(fluid)}`,
 *   },
 *   validate: (token, extension) => {
 *     const { fluid } = extension as { fluid?: unknown };
 *     return typeof fluid === "boolean"
 *       ? []
 *       : [{ jsonPath: ["fluid"], reason: "not-a-boolean", data: { fluid } }];
 *   },
 * });
 */
export function defineExtensionValidator<
    const M extends ExtensionMessages = Record<never, never>,
    S extends StandardSchemaV1 | undefined = undefined,
>(
    validator: Omit<ExtensionValidator, "schema" | "messages" | "validate"> & {
        schema?: S;
        messages?: M;
        validate?: (
            on: Checked,
            extension: SchemaOutput<S>,
            options: ParseOptions,
        ) => (ExtensionError<NoInfer<M>> | ValueError | IgnoredProperty)[];
    },
): ExtensionValidator {
    return validator;
}

export function validateExtensions(
    normalised: NormalisedPermutation[],
    permutations: readonly Permutation[],
    {
        validators,
        parseOptions,
    }: { validators: readonly ExtensionValidator[]; parseOptions: ParseOptions },
    diagnostics: Diagnostic[],
): void {
    if (validators.length === 0) return;

    normalised.forEach(({ merged, input: permutation }, index) => {
        const checked = new Map<ExtensionValidator, Set<Node>>();
        const check = (
            validator: ExtensionValidator,
            on: Checked,
            value: unknown,
            json: JsonFile,
            node: Node,
        ) => {
            const done = checked.get(validator) ?? new Set<Node>();
            checked.set(validator, done);
            if (done.has(node)) return;
            done.add(node);
            const passed = checkSchema(validator.schema, value, validator.key);
            const problems = passed.ok
                ? (validator.validate?.(on, passed.value, parseOptions) ?? [])
                : passed.problems;
            const extension = {
                within: [validator.key] as [string],
                messages: validator.messages,
                json,
                node,
                ...(on.path !== undefined && { path: on.path }),
                permutation,
            };
            for (const problem of problems) {
                diagnostics.push(extensionDiagnostic(problem, extension));
            }
        };

        for (const [path, group] of everyGroup(merged)) {
            const settings = settingsOf(merged, group);
            for (const validator of validators) {
                const written = settings.extensionsAt?.[validator.key];
                if (!written || !validator.appliesTo.includes("group")) continue;
                const node = member(written.node, validator.key);
                if (!node) continue;
                const value = settings.extensions?.[validator.key];
                const on: Checked = { ...(path !== undefined && { path }), type: "group" };
                check(validator, on, value, written.json, node);
            }
        }

        const types = new Map(permutations[index]?.tokens.map(({ path, type }) => [path, type]));
        for (const token of merged.tokens.values()) {
            const type = types.get(token.path);
            const object = token.value.parent?.parent;
            if (token.added || !type || !object || !token.extensions) continue;
            const extensions = member(object, "$extensions");
            if (!extensions) continue;
            for (const validator of validators) {
                const node = member(extensions, validator.key);
                if (!node || !validator.appliesTo.includes(type)) continue;
                const value = token.extensions[validator.key];
                check(validator, { path: token.path, type }, value, token.json, node);
            }
        }
    });
}
