import { createEventsProxy } from "./proxy.js";
import { Dictionary, EmissionSource, EmitterLike, EventHandlerMap, EventSource, Handler, ListenFunc, Period, UnsubscribeFunc } from "./types";
import { isReactiveSource } from "./util";

function periodAsMilliseconds(t: number | Period) {
	if (typeof t == "number") return t;
	return "asMilliseconds" in t ? t.asMilliseconds : (t.asSeconds * 1000);
}

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
	mapAsync<R>(mapFunc: (value: T) => Promise<R>) {
		const listen = this.transform<R>(
			(value, emit) => mapFunc(value).then(emit)
		);
		return new EventEmitter(listen);
	}
	as<R>(value: R) {
		const listen = this.transform<R>(
			(_, emit) => emit(value)
		);
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

	/**
	 * Creates a chainable emitter that forwards the parent's last emission after a period of time in which the parent doesn't emit
	 * @param ms Delay in milliseconds
	 * @returns Debounced emitter
	 */
    debounce(ms: number): EventEmitter<T>
	debounce(period: Period): EventEmitter<T>
	debounce(t: number | Period) {
        let reset: null | (() => void) = null;
        const listen = this.transform((value, emit) => {
            reset?.();
            const timeout = setTimeout(() => {
                reset = null;
                emit(value);
            }, periodAsMilliseconds(t));
            reset = () => {
                reset = null;
                clearTimeout(timeout);
            }
        });
        return new EventEmitter(listen);
    }

	/**
	 * Creates a chainable emitter that forwards the parent's emissions, with a minimum delay between emissions during which parent emssions are ignored
	 * @param ms Delay in milliseconds
	 * @returns Throttled emitter
	 */
    throttle(ms: number): EventEmitter<T>
	throttle(period: Period): EventEmitter<T>
	throttle(t: number | Period) {
        let lastTime = -Infinity;
        const listen = this.transform((value, emit) => {
            const now = performance.now();
            if (now >= lastTime + periodAsMilliseconds(t)) {
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
	 * Creates a chainable emitter that forwards the next emission from the parent
	 * **Experimental**: May change in future revisions
	 * Note: only listens to the parent while at least one downstream subscription is present
	 * @param notifier 
	 * @returns 
	 */
	once(): EventEmitter<T>
	once(handler: Handler<T>): UnsubscribeFunc
	once(handler?: Handler<T>) {
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
		
		const emitter = new EventEmitter(listen);
		return handler
			? emitter.apply(handler)
			: emitter;
	}

	getNext() {
		return new Promise<T>((resolve) => this.once(resolve));
	}

	delay(ms: number): EventEmitter<T>
	delay(period: Period): EventEmitter<T>
	delay(t: number | Period) {
		const ms = periodAsMilliseconds(t);
		return new EventEmitter(this.transform((value, emit) => {
			return timeout(ms).apply(() => emit(value));
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
				notifierUnsub = toEventEmitter(notifier).listen(() => {
					completed = true;
					clear();
				});
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

	record() {
		return new EventRecorder(this);
	}

}

export class EventRecorder<T> {
	private startTime: number = performance.now();
	private entries: [number, T][] = [];
	private recording: boolean = true;
	private unsubscribe: UnsubscribeFunc;
	constructor(emitter: EventEmitter<T>) {
		this.unsubscribe = emitter.listen(v => this.add(v));
	}
	private add(value: T) {
		const now = performance.now();
		let time = now - this.startTime;
		this.entries.push([time, value]);
	}
	stop() {
		if (!this.recording) {
			throw new Error("EventRecorder already stopped")
		}
		this.unsubscribe();
		return new EventRecording(this.entries);
	}
}

export class EventRecording<T> {
	private _entries: [number, T][];
    constructor(
        entries: [number, T][],
    ) {
		this._entries = entries;
	}

	export() {
		return [...this._entries];
	}

    play(speed: number = 1) {
        let idx = 0;
        let elapsed = 0;
        
        const { emit, listen } = createListenable<T>();
        
        const unsubscribe = animationFrames.listen((frameElapsed) => {
            elapsed += frameElapsed * speed;
            
            while (idx < this._entries.length && this._entries[idx][0] <= elapsed) {
                emit(this._entries[idx][1]);
                idx++;
            }
            
            if (idx >= this._entries.length) {
                unsubscribe();
            }
        });
        
        return new EventEmitter(listen);
    }
}

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
    const { emit, listen } = createListenable<T>(activate);
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

export function interval(ms: number): EventEmitter<number>
export function interval(period: Period): EventEmitter<number>
export function interval(t: number | Period) {
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let idx = 0;
	const {emit, listen} = createListenable<number>(
		() => {
			intervalId = setInterval(() => {
				emit(idx++);
			}, periodAsMilliseconds(t));
			return () => clearInterval(intervalId!);
		},
	);
	return new EventEmitter(listen);
}

class TimestampEmitter extends EventEmitter<number> {
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
	const {emit, listen} = createListenable<number>(
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
	const ms = periodAsMilliseconds(t);
	const targetTime = Date.now() + ms;
	const {emit, listen} = createListenable<void>(
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

    if (eventName !== undefined) {
        // addEL()
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
