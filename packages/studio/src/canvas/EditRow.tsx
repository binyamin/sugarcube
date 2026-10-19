import { type ValueOptions, setValue } from "@sugarcube-sh/dtcg-edit";
import { useStudio } from "../providers/studio-context";
import { ValueField } from "./ValueField";

export function EditRow({
    label,
    value,
    path,
    where,
}: {
    label: string | undefined;
    value: unknown;
    path: string;
    where: ValueOptions;
}) {
    const studio = useStudio();
    const shown = value === undefined ? "" : JSON.stringify(value);

    return (
        <>
            <dt>{label}</dt>
            <dd>
                <ValueField
                    key={shown}
                    shown={shown}
                    label={label ?? path}
                    onWrite={(next) =>
                        studio.do(setValue(studio.state.tokens, path, next, where)).refused?.reason
                    }
                />
            </dd>
        </>
    );
}
