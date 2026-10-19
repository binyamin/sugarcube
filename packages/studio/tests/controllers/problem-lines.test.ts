import { describe, expect, it } from "vitest";
import { createStudio } from "../../src/controllers/studio";
import { problemList } from "../../src/controllers/views";
import { configProblem, demoMessage, withFile } from "./demo-message";

describe("problemList", () => {
    it("writes each problem as generate prints it, with its file, line and column", () => {
        const studio = createStudio(withFile("dark.json", '{ "color": { "text": '));

        const lines = problemList(studio.state.problems).join("\n");

        expect(lines).toMatch(/^dark\.json:1:\d+ {2}error {2}/m);
    });

    it("writes a config problem with no place", () => {
        const studio = createStudio(demoMessage({ configProblems: [configProblem] }));

        expect(problemList(studio.state.problems)[0]).toMatch(
            /error {2}`variables\.prefix` must be a string/,
        );
    });

    it("writes nothing when there are no problems", () => {
        expect(problemList(createStudio(demoMessage()).state.problems)).toEqual([]);
    });
});
