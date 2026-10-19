import { useState } from "react";
import { parsedJson } from "../controllers/token-page";
import type { JsonValue } from "@sugarcube-sh/dtcg";
import { JsonInput } from "./JsonInput";

export function ValueField({
    shown,
    label,
    onWrite,
}: {
    shown: string;
    label: string;
    onWrite(value: JsonValue): void;
}) {
    const [text, setText] = useState(shown);

    const write = () => {
        const parsed = parsedJson(text);
        if (parsed && JSON.stringify(parsed.value) !== shown) onWrite(parsed.value);
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
