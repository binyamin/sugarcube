import { literal, no, ok, oneOf, tuple, wrongShape } from "./syntax.js";
import { number } from "./number.js";

function x(coordinate: "x1" | "x2") {
    return literal((raw) => {
        if (typeof raw !== "number" || !Number.isFinite(raw)) {
            return no({ reason: "not-a-number", value: raw });
        }
        return raw < 0 || raw > 1
            ? no({ reason: "x-out-of-range", value: raw, coordinate })
            : ok(raw);
    });
}

export const cubicBezier = oneOf({
    array: tuple([x("x1"), number, x("x2"), number], (raw) => ({
        reason: "not-four-numbers",
        count: raw.length,
    })),
    other: wrongShape,
});
