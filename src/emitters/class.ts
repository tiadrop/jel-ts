import { animationFrames, createEmitListenPair, createEventsSource, timeout, toEventEmitter } from "./util.js";
import { EmitterLike, Handler, ListenFunc, UnsubscribeFunc } from "./types.js";
import { toMilliseconds } from "../util.js";
import { Period } from "../types.js";

export class EventEmitter<T> {
	constructor(protected onListen: ListenFunc<T>) {}

	protected transform<R = T>(
		transformer: (value: T, emit: (value: R) => void) => void
	) {
		return (downstreamHandler: Handler<R>) => {
			return this.listen(value => {
				transformer(value, downstreamHandler);
			})
		};
	}

	/**
	 * Without arguments, returns a chainable emitter with `open()`/`close()` methods to manually
	 * control the parent subscription. **Starts open**.
	 * 
	 * With a `controller` argument, returns an `EventEmitter<T>` where the subscription
	 * is automatically managed by the given boolean emitter (`true` opens, `false` closes). **Starts closed**.
	 * This enables **automatic chain cleanup**; in the following example. when `element.domConnected$` becomes
	 * unreachable (the element is removed and not referenced), the entire downstream subscription chain from
	 * `gate(...)` can be garbage collected.
	 * 
	 * @example
	 * ```ts
	 * // Manual memory management: close gate to free subscription
	 * const gate = emitter.gate();
	 * gate.open();   // connect to parent (subscribe)
	 * gate.close();  // disconnect from parent (free memory)
	 * gate.map(..).filter(..) // continue the chain as normal
	 * 
	 * // Automatic memory management: only subscribe when element is in DOM
	 * interval(1000)
	 *   .gate(element.domConnected$)
	 *   .apply(v => doSomethingWith(element));
	 * // Subscription automatically freed when element leaves DOM
	 * ```
	 */
	gate(): EmitterGate<T>;
	gate(controller: EmitterLike<boolean>): EventEmitter<T>
	gate(controller?: EmitterLike<boolean>) {
		if (!controller) {
			return new EmitterGate(this.onListen);
		}
		const conditionEmitter = toEventEmitter(controller);
		const {listen, emit} = createEmitListenPair<T>();

		let parentUnsubscribe: UnsubscribeFunc | null = null;

		conditionEmitter.listen(open => {
			if (open) {
				if (!parentUnsubscribe) parentUnsubscribe = this.onListen(emit);
			} else {
				parentUnsubscribe?.();
				parentUnsubscribe = null;
			}
		});

		return new EventEmitter(listen);
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
	 * Creates a chainable emitter that applies a transformation to values emitted by its parent
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
	 * Creates a chainable emitter that discards emitted values that are the same as the last emitted value
	 * @param compare Optional function that takes the previous and next values and returns **true** if they should be considered equal
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
            }, toMilliseconds(t));
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
            if (now >= lastTime + toMilliseconds(t)) {
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
		
		const { emit, listen } = createEmitListenPair<T>(
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
		const ms = toMilliseconds(t);
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
		
		const { emit, listen } = createEmitListenPair<T>(
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

		const { emit, listen } = createEmitListenPair<T>(
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

		const { emit, listen } = createEmitListenPair<T>(
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
	immediate(value: T): EventEmitter<T>
	immediate<U>(value: U): EventEmitter<T | U>
	immediate<U>(value: U): EventEmitter<T | U> {
		return new EventEmitter<T | U>(handle => {
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
		const {listen, emit} = createEmitListenPair<T>(
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
	or(...emitters: EmitterLike<any>[]): EventEmitter<any> {
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

	watch() {
		return new Monitor(this.onListen);
	}
	record() {
		return new EventRecorder(this);
	}
}

export class EmitterGate<T> extends EventEmitter<T> {
	private emit: (value: T) => void;
    private unsubscribeParent: UnsubscribeFunc | undefined;
    constructor(private listenParent: ListenFunc<T>) {
		const {listen, emit} = createEmitListenPair<T>();
        super(listen);
		this.emit = emit;
    }

    get isOpen() {
        return !!this.unsubscribeParent;
    }

    open() {
		if (this.unsubscribeParent) return;
		this.unsubscribeParent = this.listenParent(this.emit);
    }

    close() {
        if (this.unsubscribeParent) {
            this.unsubscribeParent();
            this.unsubscribeParent = undefined;
        }
    }
}

export class Memo<T> {
	private _value: T;
	private unsubscribeFunc: UnsubscribeFunc | null;
	get value(){
		return this._value
	}
	constructor(source: EmitterLike<T>, initial: T) {
		this._value = initial;
		const emitter = toEventEmitter(source);
		this.unsubscribeFunc = emitter.listen(v => this._value = v);
	}

	dispose() {
        if (!this.unsubscribeFunc) {
			throw new Error("Memo object already disposed");
        }
        const fn = this.unsubscribeFunc;
        this.unsubscribeFunc = null;
		fn();
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
        
        const { emit, listen } = createEmitListenPair<T>();
        
        const unsubscribe = animationFrames.delta().listen((frameElapsed) => {
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

type MonitorEventMap<T> = {
    listen: void;
    unlisten: void;
}

export class Monitor<T> extends EventEmitter<T> {
    private eventManager = createEventsSource<MonitorEventMap<T>>();
    private _count: number = 0;
    get count() {
        return this._count;
    }
    events = this.eventManager.emitters;
    listen(handler: Handler<T>) {
        this._count++;
        const unsubscribe = this.onListen(handler);
        this.eventManager.trigger("listen", undefined);
        return () => {
            unsubscribe();
            this._count--;
            this.eventManager.trigger("unlisten", undefined);
        };
    }
    apply(handler: Handler<T>) {
        return this.listen(handler);
    }
}

