type Handler<T> = (value: T) => void;
export type ListenFunc<T> = (handler: Handler<T>) => UnsubscribeFunc;
export type UnsubscribeFunc = () => void;

export class Emitter<T> {
	protected constructor(protected onListen: ListenFunc<T>) {}

	protected transform<R = T>(
		handler: (value: T, emit: (value: R) => void) => void
	) {
		let parentUnsubscribe: UnsubscribeFunc | null = null;
		const parentListen = this.onListen;
		const {emit, listen} = createListenable<R>(
			() => parentUnsubscribe = parentListen(value => {
				handler(value, emit);
			}),
			() => {
				parentUnsubscribe!();
				parentUnsubscribe = null;
			}
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
	map<R>(mapFunc: (value: T) => R): Emitter<R> {
		const listen = this.transform<R>(
			(value, emit) => emit(mapFunc(value))
		)
		return new Emitter(listen);
	}
	/**
	 * Creates a chainable emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (value: T) => boolean): Emitter<T> {
		const listen = this.transform<T>(
			(value, emit) => check(value) && emit(value)
		)
		return new Emitter<T>(listen);
	}
	/**
	 * Creates a chainable emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @param compare Optional function that takes the previous and next values and returns true if they should be considered equal
	 * 
	 * If no `compare` function is provided, values will be compared via `===`
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(compare?: (a: T, b: T) => boolean): Emitter<T> {
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
		return new Emitter<T>(listen);
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
	tap(cb: Handler<T>): Emitter<T> {
		const listen = this.transform(
			(value, emit) => {
				cb(value);
				emit(value);
			}
		)
		return new Emitter<T>(listen);
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
	fork(cb: (branch: this) => void): this {
		cb(this);
		return this;
	}
}

export class EventEmitter<T> extends Emitter<T> {
	constructor(listen: ListenFunc<T>) {
		super(listen);
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

    batch(ms: number): Emitter<T[]> {
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

	filter(check: (value: T) => boolean) {
		const listen = this.transform<T>(
			(value, emit) => check(value) && emit(value)
		)
		return new EventEmitter<T>(listen);
	}

	once() {
		const { emit, listen } = createListenable<T>();
		const unsub = this.apply(v => {
			unsub();
			emit(v);
		});
		return new EventEmitter(listen);
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

	take(limit: number) {
		const { emit, listen } = createListenable<T>();
		let count = 0;
		
		const unsub = this.apply(v => {
			if (count < limit) {
				emit(v);
				count++;
				if (count >= limit) {
					unsub();
				}
			}
		});
		
		return new EventEmitter(listen);
	}

	tap(cb: Handler<T>) {
		const listen = this.transform(
			(value, emit) => {
				cb(value);
				emit(value);
			}
		)
		return new EventEmitter<T>(listen);
	}

	takeUntil(notifier: Emitter<any>): Emitter<T> {
		const { emit, listen } = createListenable<T>();	
		const unsub = this.apply(v => {
			emit(v);
		});		
		const unsubNotifier = notifier.apply(() => {
			unsub();
			unsubNotifier();
		});
		
		return new Emitter(listen);
	}
}

/**
 * Creates a linked Emitter and emit() pair
 * @example
 * ```ts
 * function createForm(options: { onsubmit?: (data: FormData) => void }) {
 *   const submitEvents = createEventSource(options.onsubmit);
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

export function createListenable<T>(onAddFirst?: () => void, onRemoveLast?: () => void) {
	const handlers: {fn: (v: T) => void}[] = [];
	const addListener = (fn: (v: T) => void): UnsubscribeFunc => {
		const unique = {fn};
		handlers.push(unique);
		if (onAddFirst && handlers.length == 1) onAddFirst();
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
