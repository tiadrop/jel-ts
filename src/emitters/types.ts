import { type EventEmitter } from "./class";

export type ListenFunc<T> = (handler: Handler<T>) => UnsubscribeFunc;
export type UnsubscribeFunc = () => void;

export type EmitterLike<T> = {
    subscribe: ListenFunc<T>;
} | {
    listen: ListenFunc<T>;
}
export type EmissionSource<T> = EmitterLike<T> | ListenFunc<T> | Promise<T>;

export type EventEmitterMap<Map> = {
    [K in keyof Map]: EventEmitter<Map[K]>;
};

export type EventHandlerMap<Map> = {
    [K in keyof Map]?: (value: Map[K]) => void;
};


export type EventSource<E, N> = {
    on: (eventName: N, handler: Handler<E>) => UnsubscribeFunc;
} | {
    on: (eventName: N, handler: Handler<E>) => void | UnsubscribeFunc;
    off: (eventName: N, handler: Handler<E>) => void;
} | {
    addEventListener: (eventName: N, handler: Handler<E>) => UnsubscribeFunc;
} | {
    addEventListener: (eventName: N, handler: Handler<E>) => void;
    removeEventListener: (eventName: N, handler: Handler<E>) => void;
};


export type Handler<T> = (value: T) => void;