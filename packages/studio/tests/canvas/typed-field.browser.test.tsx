import type { JsonValue, TokenType } from "@sugarcube-sh/dtcg";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { TypedField } from "../../src/canvas/TypedField";

function Row({ type, start }: { type: TokenType; start: JsonValue }) {
    const [written, setWritten] = useState(start);
    return (
        <>
            <TypedField type={type} written={written} label="base" path="x" onWrite={setWritten} />
            <output>{JSON.stringify(written)}</output>
        </>
    );
}

describe("a number field", () => {
    it("writes what you type", async () => {
        const screen = await render(<Row type="number" start={1.5} />);

        await screen.getByRole("spinbutton", { name: "base" }).fill("3");

        await expect.element(screen.getByRole("status")).toHaveTextContent("3");
    });
});

describe("typing", () => {
    it("keeps what you typed when the file then says the same thing", async () => {
        const screen = await render(<Row type="number" start={1.5} />);
        const box = screen.getByRole("spinbutton", { name: "base" });

        await box.fill("1e2");

        await expect.element(screen.getByRole("status")).toHaveTextContent("100");
        await expect.element(box).toHaveDisplayValue("1e2");
    });
});
