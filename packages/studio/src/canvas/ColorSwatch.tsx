import "hdr-color-input";
import type { ColorInput } from "hdr-color-input";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { type ColorField, colorCss, isTranslucent, picked } from "../controllers/color";

declare global {
    interface HTMLElementTagNameMap {
        "color-input": ColorInput;
    }
}

export function ColorSwatch({
    field,
    label,
    onPick,
}: {
    field: ColorField;
    label: string;
    onPick(field: ColorField): void;
}) {
    const swatch = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const css = colorCss(field);
    const opening = useEffectEvent(() => ({ value: css, translucent: isTranslucent(field) }));
    const onChange = useEffectEvent((value: string) => {
        const next = picked(field, value);
        if (next) onPick(next);
    });

    useEffect(() => {
        const anchor = swatch.current;
        if (!open || !anchor) return;
        const { value, translucent } = opening();
        const picker = document.createElement("color-input");
        picker.value = value;
        if (!translucent) picker.setAttribute("no-alpha", "");

        const wrapper = document.createElement("div");
        const rect = anchor.getBoundingClientRect();
        wrapper.style.cssText = `position: fixed; left: ${rect.left}px; top: ${rect.bottom + 4}px; z-index: 2000;`;
        wrapper.append(picker);
        document.body.append(wrapper);

        const changed = () => onChange(picker.value);
        const onOutside = (event: PointerEvent) => {
            if (event.target instanceof Node && !wrapper.contains(event.target)) {
                if (!anchor.contains(event.target)) setOpen(false);
            }
        };
        picker.addEventListener("change", changed);
        document.addEventListener("pointerdown", onOutside);
        const frame = requestAnimationFrame(() => picker.show());

        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener("pointerdown", onOutside);
            picker.removeEventListener("change", changed);
            wrapper.remove();
        };
    }, [open]);

    return (
        <>
            <button
                ref={swatch}
                type="button"
                aria-label={`${label}, colour`}
                aria-expanded={open}
                onClick={() => setOpen((was) => !was)}
                style={{ inlineSize: "1.5em", blockSize: "1.5em", background: css }}
            />{" "}
            <code>{css}</code>
        </>
    );
}
