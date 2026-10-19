import { describe, expect, it } from "vitest";
import { problemRows } from "../../src/controllers/views";
import { configProblem, demoMessage, studioOn, sugarcubeSent, withFile } from "./demo-message";

describe("problemRows", () => {
    it("gives each problem its file, line and column, severity, message and kind", () => {
        const studio = studioOn(withFile("dark.json", '{ "color": { "text": '));

        const [row] = problemRows(studio.state.problems);

        expect(row?.place).toMatch(/^dark\.json:1:\d+$/);
        expect(row?.severity).toBe("error");
        expect(row?.kind).toBe("invalid-json");
    });

    it("names the themes a problem is in, when it isn't in all of them", () => {
        const studio = studioOn(withFile("dark.json", '{ "color": { "text": '));

        expect(problemRows(studio.state.problems)[0]?.inPermutations).toBe("mode: dark");
    });

    it("gives a problem in no file no place", () => {
        const studio = studioOn(
            demoMessage({ adapter: sugarcubeSent({ problems: [configProblem] }) }),
        );

        const [row] = problemRows(studio.state.problems);

        expect(row?.place).toBeUndefined();
        expect(row?.message).toBe("`variables.prefix` must be a string");
        expect(row?.inPermutations).toBeUndefined();
    });

    it("gives no rows when there are no problems", () => {
        expect(problemRows(studioOn().state.problems)).toEqual([]);
    });
});
