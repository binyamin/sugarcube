import { beforeAll, describe, expect, it } from "vitest";
import { type Breaks, readOnlyBreaks } from "../../dtcg/tests/lookup/read-only-audit.js";

let breaks: Breaks;

beforeAll(() => {
    breaks = readOnlyBreaks();
}, 60_000);

describe("the read-only rule, checked over every exported type", () => {
    it("leaves nothing a session keeps, its unsaved edits, assignable or changeable in place", () => {
        expect(breaks.snapshot).toStrictEqual([]);
    });

    it("lets every editor function that is given a list take a read-only one", () => {
        expect(breaks.parameters["dtcg-edit"]).toStrictEqual([]);
    });
});
