export { DomEntity, ElementClassDescriptor, ElementDescriptor, DOMContent, DomHelper, StyleAccessor, JelEntity } from "./internal/types";
import { $ } from "./internal/element"
import { DomEntity, JelEntity } from "./internal/types";
export { createEntity } from "./internal/util"
export { createEventSource, interval, timeout, SubjectEmitter, toEventEmitter, type EventEmitter, type EventRecording, type EventRecorder, combineEmitters } from "./internal/emitter";
export { createEventsProxy, EventsProxy } from "./internal/proxy";

export { $ };
export const $body = "document" in globalThis ? $(document.body) : undefined as unknown as DomEntity<HTMLElement>;