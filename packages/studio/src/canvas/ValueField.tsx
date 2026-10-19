import type { JsonValue } from "@sugarcube-sh/dtcg";
import { useState } from "react";
import { parsedJson } from "../controllers/token-page";

export function ValueField({
    shown,
    label,
    onWrite,
}: {
    shown: string;
    label: string;
    onWrite(value: JsonValue): string | undefined;
}) {
    const [text, setText] = useState(shown);
    const [refused, setRefused] = useState<string>();
    const parsed = parsedJson(text);

    const write = () => {
        if (!parsed || JSON.stringify(parsed.value) === shown) return;
        setRefused(onWrite(parsed.value));
    };

    return (
        <>
            <input
                aria-label={label}
                value={text}
                onChange={(event) => {
                    setText(event.target.value);
                    setRefused(undefined);
                }}
                onBlur={write}
                onKeyDown={(event) => {
                    if (event.key === "Enter") write();
                }}
            />
            {text !== "" && !parsed && <p>Not valid JSON yet, so nothing is written.</p>}
            {refused && <p>{refused}</p>}
        </>
    );
}
