import type { JsonValue, TokenType } from "@sugarcube-sh/dtcg";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TypedField } from "../../src/canvas/TypedField";

function Row({ type, start }: { type: TokenType | undefined; start: JsonValue }) {
    const [written, setWritten] = useState(start);
    return (
        <>
            <TypedField type={type} written={written} label="base" path="x" onWrite={setWritten} />
            <output aria-label="written">{JSON.stringify(written)}</output>
        </>
    );
}

describe("a number field", () => {
    it("writes what you type", async () => {
        const screen = await render(<Row type="number" start={1.5} />);

        await screen.getByRole("spinbutton", { name: "base" }).fill("3");

        await expect
            .element(screen.getByRole("status", { name: "written" }))
            .toHaveTextContent("3");
    });
});

describe("typing", () => {
    it("keeps what you typed when the file then says the same thing", async () => {
        const screen = await render(<Row type="number" start={1.5} />);
        const box = screen.getByRole("spinbutton", { name: "base" });

        await box.fill("1e2");

        await expect
            .element(screen.getByRole("status", { name: "written" }))
            .toHaveTextContent("100");
        await expect.element(box).toHaveDisplayValue("1e2");
    });
});

describe("the JSON box", () => {
    it("keeps your text, spaces and all, once what you wrote is in the file", async () => {
        const screen = await render(
            <Row type={undefined} start={{ colorSpace: "srgb", components: [0, 0, 0] }} />,
        );
        const box = screen.getByRole("textbox", { name: "base" });
        const typed = '{ "colorSpace": "srgb", "components": [1, 0, 0] }';

        await box.fill(typed);
        await userEvent.keyboard("{Enter}");

        await expect
            .element(screen.getByRole("status", { name: "written" }))
            .toHaveTextContent('"components":[1,0,0]');
        await expect.element(box).toHaveDisplayValue(typed);
    });
});

describe("the colour picker", () => {
    const brand = { colorSpace: "oklch", components: [0.624, 0.181, 258], hex: "#3884f2" };
    const pickers = () => document.querySelectorAll("color-input");
    const pressElsewhere = () =>
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    it("opens a fresh picker set to the colour, opaque, and writes what it is changed to", async () => {
        const screen = await render(<Row type="color" start={brand} />);
        const swatch = screen.getByRole("button", { name: "base, colour" });

        await swatch.click();
        await expect.poll(() => pickers().length).toBe(1);
        const [picker] = pickers();
        expect(picker?.hasAttribute("no-alpha")).toBe(true);
        expect(picker?.value).toMatch(/^oklch\(/);

        if (picker) {
            picker.value = "oklch(0.65 0.2 258)";
            picker.dispatchEvent(new Event("change"));
        }

        await expect
            .element(screen.getByRole("status", { name: "written" }))
            .toHaveTextContent('"colorSpace":"oklch"');
        const written = JSON.parse(
            screen.getByRole("status", { name: "written" }).element().textContent ?? "{}",
        );
        expect(written.components[0]).toBeCloseTo(0.65);
        expect(written.hex).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("removes the picker when you click elsewhere, and opens a new one next time", async () => {
        const screen = await render(<Row type="color" start={brand} />);
        const swatch = screen.getByRole("button", { name: "base, colour" });

        await swatch.click();
        await expect.poll(() => pickers().length).toBe(1);
        const first = pickers()[0];
        pressElsewhere();
        await expect.poll(() => pickers().length).toBe(0);

        await swatch.click();
        await expect.poll(() => pickers().length).toBe(1);
        expect(pickers()[0]).not.toBe(first);
    });

    it("keeps the alpha slider for a translucent colour", async () => {
        const screen = await render(<Row type="color" start="#26262f1a" />);

        await screen.getByRole("button", { name: "base, colour" }).click();

        await expect.poll(() => pickers().length).toBe(1);
        expect(pickers()[0]?.hasAttribute("no-alpha")).toBe(false);
        pressElsewhere();
    });
});
