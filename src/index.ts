import { $ } from "./internal/element"
import { createEventsProxy } from "./internal/proxy";
import { DomEntity } from "./internal/types";

export { DomEntity, ElementClassDescriptor, ElementDescriptor, DOMContent, DomHelper, StyleAccessor, JelEntity, EventEmitterMap, EmitterLike, CSSValue } from "./internal/types";
export { createEntity } from "./internal/util"
export { createEventSource, createEventsSource, interval, timeout, animationFrames, SubjectEmitter, toEventEmitter, type EventEmitter, type EventRecording, type EventRecorder, combineEmitters } from "./internal/emitter";
export { createEventsProxy } from "./internal/proxy"

export { $ };
export const $body = "document" in globalThis ? $(document.body) : undefined as unknown as DomEntity<HTMLElement>;
export const windowEvents = createEventsProxy<WindowEventMap>(window);