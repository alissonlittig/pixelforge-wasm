/* tslint:disable */
/* eslint-disable */

export class Processed {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly bytes: Uint8Array;
    readonly height: number;
    readonly src_height: number;
    readonly src_width: number;
    readonly width: number;
}

/**
 * Builds a zip (stored, images are already compressed) in memory.
 */
export class ZipBuilder {
    free(): void;
    [Symbol.dispose](): void;
    add(name: string, data: Uint8Array | number[]): void;
    finish(): Uint8Array;
    constructor();
}

/**
 * `format`: "jpeg" | "png" | "webp".
 */
export function process(data: Uint8Array | number[], format: string, quality: number, max_side: number): Processed;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_processed_free: (a: number, b: number) => void;
    readonly __wbg_zipbuilder_free: (a: number, b: number) => void;
    readonly process: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly processed_bytes: (a: number) => [number, number];
    readonly processed_height: (a: number) => number;
    readonly processed_src_height: (a: number) => number;
    readonly processed_src_width: (a: number) => number;
    readonly processed_width: (a: number) => number;
    readonly zipbuilder_add: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly zipbuilder_finish: (a: number) => [number, number, number, number];
    readonly zipbuilder_new: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
