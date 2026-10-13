// A slider that resizes a whole spacing scale at once. While it moves, the page previews every
// step without touching the files: each frame makes a new design system and throws it away.
// Letting go keeps the last one, as one undo step.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { setValues, type Session } from "@sugarcube-sh/dtcg-edit";

declare const session: Session;
declare function showPreview(doc: DesignSystem): void;

const steps = (session.ds.permutation().group("space")?.tokens ?? []).flatMap((t) =>
    t.type === "dimension" && t.resolved && !t.referenceAt() && !t.generated
        ? [{ path: t.path, size: t.resolved }]
        : [],
);

const resized = (factor: number) =>
    setValues(
        session.ds,
        steps.map(({ path, size }) => ({
            path,
            value: { value: Math.round(size.value * factor * 100) / 100, unit: size.unit },
        })),
    );

export function onSliderMove(factor: number): void {
    const preview = session.preview(resized(factor));
    if ("ds" in preview) showPreview(preview.ds);
}

export function onSliderRelease(factor: number): void {
    session.do(resized(factor));
}
