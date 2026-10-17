export type Building<T> = { -readonly [K in keyof T]: T[K] };
