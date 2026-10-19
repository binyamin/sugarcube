import type { Reported } from "@sugarcube-sh/core/client";
import { describe, expect, it, vi } from "vitest";
import { createStudio } from "../../src/controllers/studio";
import { asSent, demoMessage, withFile } from "./demo-message";

const configProblem: Reported = {
    kind: "invalid-config",
    severity: "error",
    message: "`variables.prefix` must be a string",
    docs: "https://sugarcube.sh/errors/invalid-config",
    detail: {
        reason: "wrong-type",
        setting: "variables.prefix",
        expected: ["string"],
        received: "number",
    },
};

describe("createStudio", () => {
    it("opens the files the host sent, showing the default permutation", () => {
        const studio = createStudio(demoMessage());

        expect(studio.state.tokens.has("color.text.onBrand")).toBe(true);
        expect(studio.state.showing.label).toBe("default");
        expect(studio.state.showing.isDefault).toBe(true);
        expect(studio.state.changes).toBe(0);
    });

    it("shows another permutation when asked, and tells its listeners", () => {
        const studio = createStudio(demoMessage());
        const before = studio.state;
        const listener = vi.fn();
        studio.subscribe(listener);

        studio.show({ mode: "dark" });

        expect(studio.state.showing.label).toBe("mode: dark");
        expect(studio.state).not.toBe(before);
        expect(studio.state.tokens).toBe(before.tokens);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("writes the page's CSS from the tokens, outside any cascade layer", () => {
        const studio = createStudio(
            demoMessage({
                config: asSent({
                    resolver: "tokens.resolver.json",
                    variables: { layer: "tokens" },
                }),
            }),
        );

        expect(studio.state.css).toContain("--color-text-onBrand:");
        expect(studio.state.css).not.toContain("@layer");
    });

    it("lists the host's problems first, then the ones a build finds", () => {
        const broken = withFile(
            "dark.json",
            '{ "color": { "text": ',
            demoMessage({ problems: [configProblem] }),
        );
        const studio = createStudio(broken);

        const kinds = studio.state.problems.map((problem) => problem.kind);
        expect(kinds[0]).toBe("invalid-config");
        expect(kinds).toContain("invalid-json");
    });

    it("has no problems for the demo as it is", () => {
        expect(createStudio(demoMessage()).state.problems).toEqual([]);
    });

    it("takes in a changed file, keeping the permutation shown and every token it didn't touch", () => {
        const studio = createStudio(demoMessage());
        studio.show({ mode: "dark" });
        const before = studio.state.tokens;
        const dark = demoMessage().files["dark.json"] ?? "";

        studio.receive(
            withFile("dark.json", dark.replace("{color.neutral.50}", "{color.neutral.100}")),
        );

        const after = studio.state.tokens;
        expect(after).not.toBe(before);
        expect(studio.state.showing.label).toBe("mode: dark");
        expect(studio.state.showing.token("color.text.default")?.value).toEqual({
            syntax: "curly-brace",
            path: "color.neutral.100",
        });
        expect(after.permutation({ mode: "dark" }).token("color.brand.500")).toBe(
            before.permutation({ mode: "dark" }).token("color.brand.500"),
        );
        expect(after.permutation().token("color.text.default")).toBe(
            before.permutation().token("color.text.default"),
        );
    });

    it("changes nothing when the host sends the same files again", () => {
        const studio = createStudio(demoMessage());
        const before = studio.state;
        const listener = vi.fn();
        studio.subscribe(listener);

        studio.receive(demoMessage());

        expect(studio.state).toBe(before);
        expect(listener).not.toHaveBeenCalled();
    });

    it("reads again with a changed config", () => {
        const studio = createStudio(demoMessage());

        studio.receive(
            demoMessage({
                config: asSent({ resolver: "tokens.resolver.json", variables: { prefix: "ds" } }),
            }),
        );

        expect(studio.state.css).toContain("--ds-color-text-onBrand:");
    });

    it("shows the default when the permutation shown is no longer read", () => {
        const studio = createStudio(demoMessage());
        studio.show({ mode: "dark" });
        const resolver = JSON.parse(demoMessage().files["tokens.resolver.json"] ?? "{}");
        resolver.resolutionOrder[1].contexts = { light: [] };

        studio.receive(withFile("tokens.resolver.json", JSON.stringify(resolver)));

        expect(studio.state.showing.label).toBe("default");
    });

    it("stops telling listeners once destroyed", () => {
        const studio = createStudio(demoMessage());
        const listener = vi.fn();
        studio.subscribe(listener);

        studio.destroy();
        studio.show({ mode: "dark" });

        expect(listener).not.toHaveBeenCalled();
    });
});
