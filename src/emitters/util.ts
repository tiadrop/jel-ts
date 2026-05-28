import { createEventsProxy } from "../proxy.js";
import { EmissionSource, EventHandlerMap, EventSource, Handler, ListenFunc, UnsubscribeFunc } from "./types.js";
import { isReactiveSource, toMilliseconds } from "../util.js";
import { EventEmitter } from "./class.js";
import { Dictionary, Period } from "../types.js";

type EmitEmitterPair<T> = {
	emit: (value: T) => void;
	emitter: EventEmitter<T>;
}

type CreateEventSourceOptions<T> = {
	initialHandler?: Handler<T>;
	/**
	 * Function to call when subscription count changes from 0
	 * Return a *deactivation* function, which will be called when subscription count changes back to 0
	 */
	activate?(): UnsubscribeFunc;
}

/**
 * Creates a linked EventEmitter and emit() pair
 * @example
 * ```ts
 * function createForm(options?: { onsubmit?: (data: FormData) => void }) {
 *   const submitEvents = createEventSource(options?.onsubmit);
 *   const form = $.form({
 *     on: {
 *       submit: (e) => {
 *         e.preventDefault();
 *         const data = new FormData(e.target);
 *         submitEvents.emit(data); // emit when form is submitted
 *       }
 *     }
 *   });
 *   
 *   return createEntity(form, {
 *     events: {
 *       submit: submitEvents.emitter
 *     }
 *   })
 * }
 * 
 * const form = createForm({
 *   onsubmit: (data) => handleSubmission(data)
 * });
 * ```
 * 
 * @param initialHandler Optional listener automatically applied to the resulting Emitter
 * @returns 
 */
export function createEventSource<T>(initialHandler?: Handler<T>): EmitEmitterPair<T>
export function createEventSource<T>(options?: CreateEventSourceOptions<T>): EmitEmitterPair<T>
export function createEventSource<T>(arg?: Handler<T> | CreateEventSourceOptions<T>): EmitEmitterPair<T> {
	if (typeof arg === "function") {
		arg = { initialHandler: arg };
	}
	const { initialHandler, activate } = arg ?? {};
    const { emit, listen } = createEmitListenPair<T>(activate);
	if (initialHandler) listen(initialHandler);
    return {
        emit,
        emitter: new EventEmitter<T>(listen)
    }
}

export function createEventsSource<
	Map extends Dictionary<any>
>(initialListeners?: EventHandlerMap<Map>) {
	const handlers: {
		[K in keyof Map]?: {fn: (value: Map[K]) => void}[];
	} = {};

	const emitters = createEventsProxy<Map>({
		on: (name, handler) => {
			if (!handlers[name]) handlers[name] = [];
			const unique = {fn: handler};
			handlers[name].push(unique);
			return () => {
				const idx = handlers[name]!.indexOf(unique);
				handlers[name]!.splice(idx, 1);
				if (handlers[name]!.length == 0) delete handlers[name];
			}
		},
	}, initialListeners);
	
	return {
		emitters,
		trigger: <K extends keyof Map>(name: K, value: Map[K]) => {
			handlers[name]?.forEach(entry => entry.fn(value));
		}
	}
}

/**
 * Creates a quantum-entangled emit/listen pair
 * @param sourceListen 
 * @returns 
 */
export function createEmitListenPair<T>(sourceListen?: () => UnsubscribeFunc | undefined) {
	const handlers: {fn: (v: T) => void}[] = [];
	let onRemoveLast: undefined | UnsubscribeFunc;
	const addListener = (fn: (v: T) => void): UnsubscribeFunc => {
		const unique = {fn};
		handlers.push(unique);
		if (sourceListen && handlers.length == 1) onRemoveLast = sourceListen();
		return () => {
			const idx = handlers.indexOf(unique);
			if (idx === -1) throw new Error("Handler already unsubscribed")
			handlers.splice(idx, 1);
			if (onRemoveLast && handlers.length == 0) onRemoveLast();
		};
	}
	return {
		listen: addListener,
		emit: (value: T) => handlers.forEach(h => h.fn(value)),
	};
}

export function interval(ms: number): EventEmitter<number>
export function interval(period: Period): EventEmitter<number>
export function interval(t: number | Period) {
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let idx = 0;
	const {emit, listen} = createEmitListenPair<number>(
		() => {
			intervalId = setInterval(() => {
				emit(idx++);
			}, toMilliseconds(t));
			return () => clearInterval(intervalId!);
		},
	);
	return new EventEmitter(listen);
}

/**
 * Create an EventEmitter from an event source. Event source can be RxJS observable, existing `EventEmitter`, an object that
 * provides a `subscribe()`/`listen() => UnsubscribeFunc` method, or a subscribe function itself.
 * @param source 
 */
export function toEventEmitter<E>(source: EmissionSource<E>): EventEmitter<E>
/**
 * Create an EventEmitter from an event provider and event name. Event source may provide matching `addEventListener`/`on(name, handler)` and `removeEventListener`/`off(name, handler)` methods, or `addEventListener`/`on(name, handler): UnsubscribeFunc.
 * @param source 
 */
export function toEventEmitter<E, N>(source: EventSource<E, N>, eventName: N): EventEmitter<E>;
export function toEventEmitter<E, N>(source: EmissionSource<E> | EventSource<E, N>, eventName?: N): EventEmitter<E> {
    if (source instanceof EventEmitter) return source;
	if (typeof source == "function") return new EventEmitter(source);
	if (source instanceof Promise) {
		const { emit, emitter } = createEventSource<E>();
		source.then(emit);
		return emitter;
	}

    if (eventName !== undefined) {
        // AEL()
        if ("addEventListener" in source) {
			if ("removeEventListener" in source && typeof source.removeEventListener == "function") {
				return new EventEmitter(h => {
					source.addEventListener(eventName, h);
					return () => source.removeEventListener(eventName, h);
				})
			}
            return new EventEmitter(h => {
				return source.addEventListener(eventName, h) as UnsubscribeFunc;
            });
        }

		// on()
        if ("on" in source) {
			if ("off" in source && typeof source.off == "function") {
				return new EventEmitter(h => {
					return source.on(eventName, h)
					|| (() => source.off(eventName, h));
				})
			}
            return new EventEmitter(h => {
				return source.on(eventName, h) as UnsubscribeFunc;
            });
        }
    }

	if (isReactiveSource(source)) {
        const subscribe: ListenFunc<E> = "subscribe" in source
            ? (h: any) => source.subscribe(h)
            : (h: any) => source.listen(h);
        return new EventEmitter(subscribe);
    }

	throw new Error("Invalid event source");
}


export class TimestampEmitter extends EventEmitter<number> {
    /**
     * Creates a chainable emitter that emits elapsed times from a parent timestamp emitter
     * @returns Delta time emitter
     */
    delta() {
        let last: number;
        return new EventEmitter(this.transform<number>((value, emit) => {
            const delta = last !== undefined ? value - last : 0;
            last = value;
            emit(delta);
        }));
    }
}

/**
 * Emits timestamps from a shared RAF loop
 */
export const animationFrames = (() => {
    const {emit, listen} = createEmitListenPair<number>(
        () => {
            let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
            const frame = (time: number) => {
                rafId = requestAnimationFrame(frame);
                emit(time);
            };
            rafId = requestAnimationFrame(frame);
            return () => cancelAnimationFrame(rafId!);
        }
    );
    return new TimestampEmitter(listen);
})();

export function timeout(ms: number): EventEmitter<void>
export function timeout(period: Period): EventEmitter<void>
export function timeout(t: number | Period) {
    const ms = toMilliseconds(t);
    const targetTime = Date.now() + ms;
    const {emit, listen} = createEmitListenPair<void>(
        () => {
            const reminaingMs = targetTime - Date.now();
            if (reminaingMs < 0) return;
            const timeoutId = setTimeout(() => {
                emit();
            }, reminaingMs);
            return () => clearTimeout(timeoutId!);
        },
    );


    return new EventEmitter(listen);
}

function combineArray(emitters: EventEmitter<any>[]) {
	let values: (undefined | {value: any})[] = Array.from({length: emitters.length});
	const { emit, listen } = createEmitListenPair(() => {
		const unsubFuncs = emitters.map((emitter, idx) => {
			return emitter.listen(v => {
				values[idx] = {value: v};
				if (values.every(v => v !== undefined)) emit(values.map(vc => vc.value));
			});
		});
		return () => unsubFuncs.forEach(f => f());
	});
	return new EventEmitter(listen);
}

function combineRecord<U extends Dictionary<EventEmitter<any>>>(emitters: U) {
    const keys = Object.keys(emitters);
    let values: Record<string | symbol, (undefined | {value: any})> = {};
    
    const { emit, listen } = createEmitListenPair(() => {
        const unsubFuncs = keys.map(key => {
            return emitters[key].listen(v => {
                values[key] = {value: v};
                if (keys.every(k => values[k] !== undefined)) {
					const record = Object.fromEntries(Object.entries(values).map(([k, vc]) => [k, vc!.value]));
                    emit(record);
                }
            });
        });
        
        return () => unsubFuncs.forEach(f => f());
    });
    
    return new EventEmitter(listen) as EventEmitter<any>;
}

type ExtractEmitterValue<T> = T extends EmissionSource<infer U> ? U : never;
type CombinedRecord<T extends Dictionary<EmissionSource<any>>> = {
    readonly [K in keyof T]: ExtractEmitterValue<T[K]>;
}

export function combineEmitters<U extends Dictionary<EmissionSource<any>>>(sourceMap: U): EventEmitter<CombinedRecord<U>>
export function combineEmitters<U extends EmissionSource<any>[]>(sources: [...U]): EventEmitter<{
    [K in keyof U]: ExtractEmitterValue<U[K]>;
}>
export function combineEmitters(sources: EmissionSource<any>[] | Dictionary<EmissionSource<any>>) {
	if (Array.isArray(sources)) return combineArray(sources.map(toEventEmitter));
	return combineRecord(Object.fromEntries(Object.entries(sources).map(([k, e]) => [k, toEventEmitter(e)])));
}

export class SubjectEmitter<T> extends EventEmitter<T> {
    private emit: (value: T) => void;
    private _value: T;
    constructor(initial: T) {
        const {emit, listen} = createEmitListenPair<T>();
        super(h => {
            h(this._value); // immediate emit on listen
            return listen(h);
        });
        this.emit = emit;
        this._value = initial;
    }

    get value() {
        return this._value;
    }

    next(value: T) {
        this._value = value;
        this.emit(value);
    }
    asReadOnly() {
        return new EventEmitter(h => this.apply(h));
    }
}