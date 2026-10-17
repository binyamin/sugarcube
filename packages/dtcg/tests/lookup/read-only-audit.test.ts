import { beforeAll, describe, expect, it } from "vitest";
import { type Breaks, readOnlyBreaks } from "./read-only-audit.js";

let breaks: Breaks;

beforeAll(() => {
    breaks = readOnlyBreaks();
}, 60_000);

describe("the read-only rule, checked over every exported type", () => {
    it("leaves nothing the read gives assignable or changeable in place, however deep", () => {
        expect(breaks.snapshot).toStrictEqual([]);
    });

    it("lets every dtcg function that is given a list take a read-only one", () => {
        expect(breaks.parameters.dtcg).toStrictEqual([]);
    });
});
