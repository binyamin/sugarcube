import { describe, expect, it } from "vitest";
import { followCSS } from "../../src/controllers/page-css";
import { createStudio } from "../../src/controllers/studio";
import { asSent, demoMessage } from "./demo-message";

const now = (run: () => void) => run();

describe("followCSS", () => {
    it("sends the page the token CSS at once", () => {
        const studio = createStudio(demoMessage());
        const sent: string[] = [];

        followCSS(studio, (css) => sent.push(css), now);

        expect(sent).toEqual([studio.state.css]);
    });

    it("sends it again when the CSS changes", () => {
        const studio = createStudio(demoMessage());
        const sent: string[] = [];
        followCSS(studio, (css) => sent.push(css), now);

        studio.receive(
            demoMessage({
                config: asSent({ resolver: "tokens.resolver.json", variables: { prefix: "ds" } }),
            }),
        );

        expect(sent).toHaveLength(2);
        expect(sent[1]).toContain("--ds-color-text-onBrand:");
    });

    it("sends nothing new when only the theme shown changes", () => {
        const studio = createStudio(demoMessage());
        const sent: string[] = [];
        followCSS(studio, (css) => sent.push(css), now);

        studio.show({ mode: "dark" });

        expect(sent).toHaveLength(1);
    });

    it("sends once for changes that land before the next frame", () => {
        const studio = createStudio(demoMessage());
        const sent: string[] = [];
        const frames: (() => void)[] = [];
        followCSS(
            studio,
            (css) => sent.push(css),
            (run) => frames.push(run),
        );

        studio.receive(
            demoMessage({
                config: asSent({ resolver: "tokens.resolver.json", variables: { prefix: "a" } }),
            }),
        );
        studio.receive(
            demoMessage({
                config: asSent({ resolver: "tokens.resolver.json", variables: { prefix: "b" } }),
            }),
        );
        for (const frame of frames.splice(0)) frame();

        expect(sent).toHaveLength(1);
        expect(sent[0]).toContain("--b-color");
    });

    it("stops when told to", () => {
        const studio = createStudio(demoMessage());
        const sent: string[] = [];
        const stop = followCSS(studio, (css) => sent.push(css), now);

        stop();
        studio.receive(
            demoMessage({
                config: asSent({ resolver: "tokens.resolver.json", variables: { prefix: "ds" } }),
            }),
        );

        expect(sent).toHaveLength(1);
    });
});
