export { DomEntity, ElementClassDescriptor, ElementDescriptor, DOMContent, DomHelper, StyleAccessor, JelEntity } from "./internal/types";
import { $ } from "./internal/element"
export { createEntity } from "./internal/util"
export { createEventSource, interval, timeout, SubjectEmitter, toEventEmitter } from "./internal/emitter";

export { $ };
export const $body = $(document.body);