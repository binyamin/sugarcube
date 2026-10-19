import { readFromMemory } from "@sugarcube-sh/dtcg";
import { describe, expect, it } from "vitest";
import { fillDefaults } from "../src/node/config/normalize.js";
import { cssFrom } from "../src/shared/css-from.js";
import { declare } from "../src/shared/css/declare.js";
import { emitCSS } from "../src/shared/css/emit.js";
import { readOptions } from "../src/shared/read-options.js";
import { located } from "../src/shared/diagnostics.js";
import { utilityRules } from "../src/shared/utilities/rules.js";
import { utilityTokens } from "../src/shared/utilities/tokens.js";
import type { UtilityClassesConfig } from "../src/types/config.js";

const color = (value: string) => ({ $type: "color", $value: value });

const json = {
    color: { ink: color("#111111"), paper: color("#ffffff"), brand: color("{color.missing}") },
};

function project(classes: UtilityClassesConfig) {
    const config = fillDefaults({
        variables: {
            path: "variables.css",
            propagateDependents: true,
            transforms: { colorFallbackStrategy: "polyfill" },
        },
        utilities: { classes },
    });
    const tokens = readFromMemory(
        { files: { "tokens.json": JSON.stringify(json) } },
        readOptions(config),
    );
    return { tokens, config };
}

const classes = {
    color: { source: "color.*", prefix: "text", safelist: ["ink", "nope"] },
    margin: { source: "space.*", prefix: "m" },
};

describe("cssFrom", () => {
    it("gives the declarations it made, for a reader that needs which variable is which token", () => {
        const { tokens, config } = project(classes);

        expect(cssFrom(tokens, config).declared).toStrictEqual(declare(tokens, config));
        expect(
            cssFrom(tokens, config, { variables: false, utilities: false }).declared,
        ).toStrictEqual(declare(tokens, config));
    });

    it("gives what declaring, the variables and the utility rules give in turn", () => {
        const { tokens, config } = project(classes);
        const declared = declare(tokens, config);
        const emitted = emitCSS(declared, config);
        const ruled = utilityRules(utilityTokens(declared), classes);

        const made = cssFrom(tokens, config);

        expect(made.variables).toStrictEqual(emitted.files);
        expect(made.utilities).toStrictEqual({
            rules: expect.any(Array),
            starts: ruled.starts,
            safelist: ruled.safelist,
            customProperties: ruled.customProperties,
        });
        expect(made.utilities?.rules.map(([pattern]) => pattern)).toStrictEqual(
            ruled.rules.map(([pattern]) => pattern),
        );
        expect(made.diagnostics).toStrictEqual([
            ...declared.diagnostics,
            ...emitted.diagnostics,
            ...located(tokens, ruled.aboutTokens),
            ...ruled.diagnostics,
        ]);
        expect(made.diagnostics.map(({ kind }) => kind)).toStrictEqual([
            "missing-reference",
            "option-deprecated",
            "option-renamed",
            "utility-without-classes",
            "safelist-without-token",
        ]);
    });

    it("writes each class's variable through its rules", () => {
        const { tokens, config } = project(classes);
        const rules = cssFrom(tokens, config).utilities?.rules ?? [];
        const written = rules.flatMap(([pattern, handler]) => {
            const match = "text-ink".match(pattern);
            return match ? [handler(match)] : [];
        });
        expect(written).toStrictEqual([{ color: "var(--color-ink)" }]);
    });

    it("leaves out the variables with variables: false", () => {
        const { tokens, config } = project(classes);
        const made = cssFrom(tokens, config, { variables: false });
        expect(made.variables).toStrictEqual([]);
        expect(made.utilities?.safelist).toStrictEqual(["text-ink"]);
        expect(made.diagnostics.map(({ kind }) => kind)).toStrictEqual([
            "missing-reference",
            "option-deprecated",
            "utility-without-classes",
            "safelist-without-token",
        ]);
    });

    it("leaves out the utilities and their problems with utilities: false", () => {
        const { tokens, config } = project(classes);
        const made = cssFrom(tokens, config, { utilities: false });
        expect(made.variables).toHaveLength(1);
        expect(made.utilities).toBeUndefined();
        expect(made.diagnostics.map(({ kind }) => kind)).toStrictEqual([
            "missing-reference",
            "option-deprecated",
            "option-renamed",
        ]);
    });

    it("gives no utilities and no utility problems when the config asks for no classes", () => {
        const { tokens, config } = project({});
        const made = cssFrom(tokens, config);
        expect(made.variables).toHaveLength(1);
        expect(made.utilities).toBeUndefined();
        expect(made.diagnostics.map(({ kind }) => kind)).toStrictEqual([
            "missing-reference",
            "option-deprecated",
            "option-renamed",
        ]);
    });
});
