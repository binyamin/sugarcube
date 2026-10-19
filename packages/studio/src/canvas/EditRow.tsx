import { type ValueOptions, setValue } from "@sugarcube-sh/dtcg-edit";
import { useStudio } from "../providers/studio-context";
import { useEdit } from "./use-edit";
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
    const edit = useEdit();
    const shown = value === undefined ? "" : JSON.stringify(value);

    return (
        <>
            <dt>{label}</dt>
            <dd>
                <ValueField
                    key={shown}
                    shown={shown}
                    label={label ?? path}
                    onWrite={(next) => edit.run(setValue(studio.state.tokens, path, next, where))}
                />
                {edit.view}
            </dd>
        </>
    );
}
