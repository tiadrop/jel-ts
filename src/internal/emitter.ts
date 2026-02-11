import { EmitterLike } from "./types";
import { isReactiveSource } from "./util";

type Handler<T> = (value: T) => void;

export type ListenFunc<T> = (handler: Handler<T>) => UnsubscribeFunc;
export type UnsubscribeFunc = () => void;

export class EventEmitter<T> {
	constructor(protected onListen: ListenFunc<T>) {}

	protected transform<R = T>(
		handler: (value: T, emit: (value: R) => void) => void
	) {
		const {emit, listen} = createListenable<R>(
			() => this.onListen(value => {
				handler(value, emit);
			}),
		);
		return listen;
	}

	/**
	 * Compatibility alias for `apply()` - registers a function to receive emitted values
	 * @param handler 
	 * @returns A function to deregister the handler
	 */
	listen(handler: Handler<T>): UnsubscribeFunc {
		return this.onListen(handler);
	}
	/**
	 * Registers a function to receive emitted values
	 * @param handler 
	 * @returns A function to deregister the handler
	 */
	apply(handler: Handler<T>): UnsubscribeFunc {
		return this.onListen(handler);
	}
	/**
	 * Creates a chainable emitter that applies arbitrary transformation to values emitted by its parent
	 * @param mapFunc 
	 * @returns Listenable: emits transformed values
	 */
	map<R>(mapFunc: (value: T) => R) {
		const listen = this.transform<R>(
			(value, emit) => emit(mapFunc(value))
		)
		return new EventEmitter(listen);
	}
	/**
	 * Creates a chainable emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (value: T) => boolean) {
		const listen = this.transform<T>(
			(value, emit) => check(value) && emit(value)
		)
		return new EventEmitter<T>(listen);
	}
	/**
	 * Creates a chainable emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @param compare Optional function that takes the previous and next values and returns true if they should be considered equal
	 * 
	 * If no `compare` function is provided, values will be compared via `===`
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(compare?: (a: T, b: T) => boolean) {
		let previous: null | { value: T; } = null;
		const listen = this.transform(
			(value, emit) => {
				if (
					!previous || (
						compare
							? !compare(previous.value, value)
							: (previous.value !== value)
					)
				) {
					emit(value);
					previous = { value };
				}

			}
		)
		return new EventEmitter<T>(listen);
	}
	
	/**
	 * Creates a chainable emitter that mirrors emissions from the parent emitter, invoking the provided callback `cb` as a side effect for each emission.  
	 * 
	 * The callback `cb` is called exactly once per parent emission, regardless of how many listeners are attached to the returned emitter.
	 * All listeners attached to the returned emitter receive the same values as the parent emitter.
	 * 
	 * *Note*, the side effect `cb` is only invoked when there is at least one listener attached to the returned emitter
	 * 
	 * @param cb A function to be called as a side effect for each value emitted by the parent emitter.
	 * @returns A new emitter that forwards all values from the parent, invoking `cb` as a side effect.
	 */
	tap(cb: Handler<T>) {
		const listen = this.transform(
			(value, emit) => {
				cb(value);
				emit(value);
			}
		)
		return new EventEmitter<T>(listen);
	}
	/**
	 * Immediately passes this emitter to a callback and returns this emitter
	 * 
	 * Allows branching without breaking a composition chain
	 * 
	 * @example
	 * ```ts
	 * range
	 *   .tween("0%", "100%")
	 *   .fork(branch => branch
	 *       .map(s => `Loading: ${s}`)
	 *       .apply(s => document.title = s)
	 *   )
	 *   .apply(v => progressBar.style.width = v);
	 * ```
	 * @param cb 
	 */
	fork(...cb: ((branch: this) => void)[]): this {
		cb.forEach(cb => cb(this));
		return this;
	}

    debounce(ms: number) {
        let reset: null | (() => void) = null;
        const listen = this.transform((value, emit) => {
            reset?.();
            const timeout = setTimeout(() => {
                reset = null;
                emit(value);
            }, ms);
            reset = () => {
                reset = null;
                clearTimeout(timeout);
            }
        });
        return new EventEmitter(listen);
    }

    throttle(ms: number) {
        let lastTime = -Infinity;
        const listen = this.transform((value, emit) => {
            const now = performance.now();
            if (now >= lastTime + ms) {
                lastTime = now;
                emit(value);
            }
        });
        return new EventEmitter(listen);
    }

    batch(ms: number) {
        let items: T[] = [];
        let active = false;
        const listen = this.transform<T[]>((value, emit) => {
            items.push(value)
            if (!active) {
                active = true;
                setTimeout(() => {
                    emit(items);
                    items = [];
                    active = false;
                }, ms);
            }
        });
        return new EventEmitter(listen);
    }
	/**
	 * Creates a chainable emitter that 
	 * **Experimental**: May change in future revisions
	 * Note: only listens to the parent while at least one downstream subscription is present
	 * @param notifier 
	 * @returns 
	 */
	once() {
		let parentUnsubscribe: UnsubscribeFunc | null = null;
		let completed = false;

		const clear = () => {
			if (parentUnsubscribe) {
				parentUnsubscribe();
				parentUnsubscribe = null;
			}
		};
		
		const { emit, listen } = createListenable<T>(
			() => {
				if (completed) return;
				parentUnsubscribe = this.apply(v => {
					completed = true;
					clear();
					emit(v);
				});
				return clear;
			},
		);
		
		return new EventEmitter(listen);
	}

	delay(ms: number) {
		return new EventEmitter(this.transform((value, emit) => {
			setTimeout(() => emit(value), ms)
		}));
	}

	scan<S>(updater: (state: S, value: T) => S, initial: S): EventEmitter<S> {
		let state = initial;
		const listen = this.transform<S>((value, emit) => {
			state = updater(state, value);
			emit(state);
		});
		return new EventEmitter(listen);
	}

	buffer(count: number) {
		let buffer: T[] = [];
		const listen = this.transform<T[]>((value, emit) => {
			buffer.push(value);
			if (buffer.length >= count) {
				emit(buffer);
				buffer = [];
			}
		});
		return new EventEmitter(listen);
	}

	/**
	 * **Experimental**: May change in future revisions
	 * Note: only listens to the notifier while at least one downstream subscription is present
	 * @param limit
	 * @returns 
	 */
	take(limit: number) {
		let sourceUnsub: UnsubscribeFunc | null = null;
		let count = 0;
		let completed = false;
		
		const { emit, listen } = createListenable<T>(
			() => {
				if (completed) return;
				
				if (!sourceUnsub) {
					sourceUnsub = this.apply(v => {
						if (count < limit) {
							emit(v);
							count++;
							if (count >= limit) {
								completed = true;
								if (sourceUnsub) {
									sourceUnsub();
									sourceUnsub = null;
								}
							}
						}
					});
				}
				return sourceUnsub
			}			
		);
		
		return new EventEmitter(listen);
	}

	/**
	 * **Experimental**: May change in future revisions
	 * Note: only listens to the notifier while at least one downstream subscription is present
	 * @param notifier 
	 * @returns 
	 */
	takeUntil(notifier: EmitterLike<any>) {
		let parentUnsubscribe: UnsubscribeFunc | null = null;
		let notifierUnsub: UnsubscribeFunc | null = null;
		let completed = false;
		const clear = () => {
			parentUnsubscribe?.();
			notifierUnsub?.();
		};
		
		const { emit, listen } = createListenable<T>(
			() => {
				if (completed) return;
				parentUnsubscribe = this.apply(emit);
				const handler = () => {
					completed = true;
					clear();
				};
				notifierUnsub = toEventEmitter(notifier).listen(handler);
				return clear;
			},
		);
		
		return new EventEmitter(listen);
	}

	/**
	 * Creates a chainable emitter that forwards its parent's emissions while the predicate returns true
	 * Disconnects from the parent and becomes inert when the predicate returns false
	 * @param predicate Callback to determine whether to keep forwarding
	 */
	takeWhile(predicate: (value: T) => boolean) {
		let parentUnsubscribe: UnsubscribeFunc | undefined;
		let completed = false;
		
		const { emit, listen } = createListenable<T>(
			() => {
				if (completed) return;
				parentUnsubscribe = this.apply(v => {
					if (predicate(v)) {
						emit(v);
					} else {
						completed = true;
						parentUnsubscribe!();
						parentUnsubscribe = undefined;
					}
				});
				return () => parentUnsubscribe?.();
			}
		);
		
		return new EventEmitter(listen);
	}

	/**
	 * Creates a chainable emitter that immediately emits a value to every new subscriber,
	 * then forwards parent emissions
	 * @param value 
	 * @returns A new emitter that emits a value to new subscribers and forwards all values from the parent
	 */
	immediate(value: T) {
		return new EventEmitter<T>(handle => {
			handle(value);
			return this.onListen(handle);
		});
	}

	/**
	 * Creates a chainable emitter that forwards its parent's emissions, and
	 * immediately emits the latest value to new subscribers
	 * @returns 
	 */
	cached() {
		let cache: null | {value: T} = null;
		const {listen, emit} = createListenable<T>(
			() => this.onListen((value => {
				cache = { value };
				emit(value);
			}))
		);
		return new EventEmitter<T>(handler => {
			if (cache) handler(cache.value);
			return listen(handler);
		})
	}

	/**
	 * Creates a chainable emitter that forwards emissions from the parent and any of the provided emitters
	 * @param emitters 
	 */
	or(...emitters: EmitterLike<T>[]): EventEmitter<T>
	or<U>(...emitters: EmitterLike<U>[]): EventEmitter<T | U>
	or(...emitters: EmitterLike<unknown>[]): EventEmitter<unknown> {
		return new EventEmitter(handler => {
			const unsubs = [this, ...emitters].map(e => toEventEmitter(e).listen(handler));
			return () => unsubs.forEach(unsub => unsub());
		})
	}

	memo(): Memo<T | undefined>
	memo(initial: T): Memo<T>
	memo<U>(initial: U): Memo<T | U>
	memo(initial?: unknown) {
		return new Memo(this, initial);
	}

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
export function createEventSource<T>(initialHandler?: Handler<T>) {
    const { emit, listen } = createListenable<T>();
	if (initialHandler) listen(initialHandler);
    return {
        emit,
        emitter: new EventEmitter<T>(listen)
    }
}

function createListenable<T>(sourceListen?: () => UnsubscribeFunc | undefined) {
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

export function interval(ms: number | {asMilliseconds: number}) {
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let idx = 0;
	const {emit, listen} = createListenable<number>(
		() => {
			intervalId = setInterval(() => {
				emit(idx++);
			}, typeof ms == "number" ? ms : ms.asMilliseconds);
			return () => clearInterval(intervalId!);
		},
	);
	return new EventEmitter(listen);
}

export function timeout(t: number | {asMilliseconds: number}) {
    const ms = typeof t === "number" ? t : t.asMilliseconds;
	const targetTime = Date.now() + ms;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const {emit, listen} = createListenable<void>(
		() => {
			const reminaingMs = targetTime - Date.now();
			if (reminaingMs < 0) return;
			timeoutId = setTimeout(emit, reminaingMs);
			return () => clearTimeout(timeoutId!);
		},
	);
	return new EventEmitter(listen);
}

class Memo<T> {
	private _value: T;
	private unsubscribeFunc: UnsubscribeFunc;
	get value(){
		return this._value
	}
	constructor(source: EmitterLike<T>, initial: T) {
		this._value = initial;
		const emitter = toEventEmitter(source);
		this.unsubscribeFunc = emitter.listen(v => this._value = v);
	}

	dispose() {
		this.unsubscribeFunc();
		this.unsubscribeFunc = () => {
			throw new Error("Memo object already disposed");
		}
	}
}

export class SubjectEmitter<T> extends EventEmitter<T> {
	private emit: (value: T) => void;
	private _value: T;
	constructor(initial: T) {
		const {emit, listen} = createListenable<T>();
		super(h => {
			h(this._value);
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
}

type EventSource<T, E extends string> = {
    on: (eventName: E, handler: (value: T) => void) => UnsubscribeFunc;
} | {
    on: (eventName: E, handler: (value: T) => void) => void | UnsubscribeFunc;
    off: (eventName: E, handler: (value: T) => void) => void;
} | {
    addEventListener: (eventName: E, handler: (value: T) => void) => UnsubscribeFunc;
} | {
    addEventListener: (eventName: E, handler: (value: T) => void) => void | UnsubscribeFunc;
    removeEventListener: (eventName: E, handler: (value: T) => void) => void;
}

/**
 * Create an EventEmitter from an event source. Event sources can be RxJS observables, existing EventEmitters, or objects that
 * provide a subscribe()/listen() => UnsubscribeFunc method.
 * @param source 
 */
export function toEventEmitter<T>(source: EmitterLike<T>): EventEmitter<T>
export function toEventEmitter<T, E extends string>(source: EventSource<T, E>, eventName: E): EventEmitter<T>
export function toEventEmitter<T, E extends string>(source: EmitterLike<T> | EventSource<T, E>, eventName?: E): EventEmitter<T> {
    if (source instanceof EventEmitter) return source;

    if (eventName !== undefined) {
        // addEL()
        if ("addEventListener" in source) {
			if ("removeEventListener" in source && typeof source.removeEventListener == "function") {
				return new EventEmitter(h => {
					return source.addEventListener(eventName, h)
					|| (() => source.removeEventListener(eventName, h));
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
        const subscribe: ListenFunc<T> = "subscribe" in source
            ? (h: any) => source.subscribe(h)
            : (h: any) => source.listen(h);
        return new EventEmitter(subscribe);
    }

	throw new Error("Invalid event source");
}



function combineArray(emitters: EventEmitter<any>[]) {
	let values: (undefined | {value: any})[] = Array.from({length: emitters.length});
	const { emit, listen } = createListenable(() => {
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

function combineRecord(emitters: Record<string | symbol, EventEmitter<any>>) {
    const keys = Object.keys(emitters);
    let values: Record<string | symbol, (undefined | {value: any})> = {};
    
    const { emit, listen } = createListenable(() => {
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
    
    return new EventEmitter(listen);
}


type Dictionary<T> = Record<string | symbol, T>;

type ExtractEmitterValue<T> = T extends EmitterLike<infer U> ? U : never;
type CombinedRecord<T extends Dictionary<EmitterLike<any>>> = {
    readonly [K in keyof T]: ExtractEmitterValue<T[K]>;
}

export function combineEmitters<U extends Dictionary<EmitterLike<any>>>(emitters: U): EventEmitter<CombinedRecord<U>>
export function combineEmitters<U extends EmitterLike<any>[]>(emitters: [...U]): EventEmitter<{
    [K in keyof U]: ExtractEmitterValue<U[K]>;
}>
export function combineEmitters(emitters: EmitterLike<any>[] | Dictionary<EmitterLike<any>>) {
	if (Array.isArray(emitters)) return combineArray(emitters.map(toEventEmitter));
	return combineRecord(Object.fromEntries(Object.entries(emitters).map(([k, e]) => [k, toEventEmitter(e)])));
}
