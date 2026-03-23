import { $ } from "./element";
import { createEventsProxy } from "./proxy";
import { DomEntity } from "./types";

export const $body = "document" in globalThis ? $(document.body) : undefined as unknown as DomEntity<HTMLElement>;
export const windowEvents = createEventsProxy<WindowEventMap>(window);
export const documentEvents = createEventsProxy<DocumentEventMap>(document);
