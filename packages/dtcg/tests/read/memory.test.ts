import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { readFromMemory } from "../../src/index.js";
import { tokens } from "../benchmarks/fixtures.js";

setFlagsFromString("--expose-gc");
const collect = runInNewContext("gc") as () => void;

describe("a read that is kept", () => {
    it("holds a few times its files' text, not what reading them took", () => {
        const text = JSON.stringify(tokens(100), null, 2);
        const read = () => readFromMemory({ files: { "tokens.json": ` ${text}`.slice(1) } });
        for (let i = 0; i < 3; i++) read();
        collect();
        collect();
        const before = process.memoryUsage().heapUsed;
        const kept = Array.from({ length: 20 }, read);
        collect();
        collect();
        const held = (process.memoryUsage().heapUsed - before) / kept.length;
        expect(held / text.length).toBeLessThan(15);
    });
});
