import type { JsonValue } from "@sugarcube-sh/dtcg";
import { changes, parsedJson } from "../controllers/value-field";
import { JsonInput } from "./JsonInput";
import { useDraft } from "./use-draft";

export function JsonField({
    written,
    label,
    onWrite,
}: {
    written: JsonValue | undefined;
    label: string;
    onWrite(value: JsonValue): void;
}) {
    const shown = written === undefined ? "" : JSON.stringify(written);
    const [text, setText] = useDraft(shown, shown, (kept) => {
        const parsed = parsedJson(kept);
        return parsed !== undefined && !changes({ kind: "json", value: parsed.value }, written);
    });

    const write = () => {
        const parsed = parsedJson(text);
        if (parsed && changes({ kind: "json", value: parsed.value }, written))
            onWrite(parsed.value);
    };

    return (
        <JsonInput
            aria-label={label}
            text={text}
            onText={setText}
            onBlur={write}
            onKeyDown={(event) => {
                if (event.key === "Enter") write();
            }}
        />
    );
}
