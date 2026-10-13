// A slider that resizes a whole spacing scale at once. While it moves, the page previews every
// step without touching the files: each frame makes new design tokens and throws them away.
// Letting go keeps the last one, as one undo step.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { setValues, type Session } from "@sugarcube-sh/dtcg-edit";

declare const session: Session;
declare function showPreview(tokens: DesignTokens): void;

const steps = (session.tokens.permutation().group("space")?.tokens ?? []).flatMap((t) =>
    t.type === "dimension" && t.resolved && !t.referenceAt() && !t.generated
        ? [{ path: t.path, size: t.resolved }]
        : [],
);

const resized = (factor: number) =>
    setValues(
        session.tokens,
        steps.map(({ path, size }) => ({
            path,
            value: { value: Math.round(size.value * factor * 100) / 100, unit: size.unit },
        })),
    );

export function onSliderMove(factor: number): void {
    const preview = session.preview(resized(factor));
    if ("tokens" in preview) showPreview(preview.tokens);
}

export function onSliderRelease(factor: number): void {
    session.do(resized(factor));
}
