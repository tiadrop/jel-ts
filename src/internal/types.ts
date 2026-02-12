import { type ClassAccessor } from "./element";
import { EventEmitter, UnsubscribeFunc } from "./emitter";
import { entityDataSymbol } from "./util";

export type ElementClassDescriptor = string | Record<string, boolean | EmitterLike<boolean> | undefined> | undefined | ElementClassDescriptor[];
export type DOMContent = number | null | string | Element | JelEntity<object> | Text | DOMContent[];
export type DomEntity<T extends HTMLElement> = JelEntity<ElementAPI<T>>;

export type HTMLTag = keyof HTMLElementTagNameMap;

export type EmitterLike<T> = {
    subscribe: (callback: (value: T) => void) => UnsubscribeFunc;
} | {
    listen: (callback: (value: T) => void) => UnsubscribeFunc;
}
export type CSSValue = string | number | null | HexCodeContainer;
export type CSSProperty = keyof StylesDescriptor;

// @xia/rgba compat
type HexCodeContainer = {
    hexCode: string;
    toString(): string;
}

export type StylesDescriptor = {
    [K in keyof CSSStyleDeclaration as [
        K,
        CSSStyleDeclaration[K]
    ] extends [string, string] ? K : never]+?: CSSValue | EmitterLike<CSSValue>
}

export type SetStyleFunc = ((property: CSSProperty, value: CSSValue | EmitterLike<CSSValue>) => void);

export type SetGetStyleFunc = SetStyleFunc
& ((property: CSSProperty) => string | EmitterLike<CSSValue>);

export type StyleAccessor = ((styles: StylesDescriptor) => void)
& StylesDescriptor
& SetStyleFunc;

type ContentlessTag = "area" | "br" | "hr" | "iframe" | "input"
| "textarea" | "img" | "canvas" | "link" | "meta" | "source"
| "embed" | "track" | "base";
type TagWithHref = "a" | "link" | "base";
type TagWithSrc = "img" | "script" | "iframe" | "video" | "audio"
| "embed" | "source" | "track";
type TagWithValue = "input" | "textarea";
type TagWithWidthHeight = "canvas" | "img" | "embed" | "iframe" | "video";
type TagWithType = "input" | "source" | "button";
type TagWithName = 'input' | 'textarea' | 'select' | 'form';
type ContentlessElement = HTMLElementTagNameMap[ContentlessTag];

export type ElementDescriptor<Tag extends HTMLTag> = {
    classes?: ElementClassDescriptor;
    attribs?: Record<string, string | number | boolean | undefined>;
    on?: {[E in keyof HTMLElementEventMap]+?: (
        event: HTMLElementEventMap[E]
    ) => void};
    style?: StylesDescriptor;
    cssVariables?: Record<string, CSSValue | EmitterLike<CSSValue>>;
    init?: (entity: DomEntity<HTMLElementTagNameMap[Tag]>) => void;
} & (Tag extends TagWithValue ? {
    value?: string | number;
} : {}) & (Tag extends ContentlessTag ? {} : {
    content?: DOMContent | EmitterLike<DOMContent>;
}) & (Tag extends TagWithSrc ? {
    src?: string;
} : {}) & (Tag extends TagWithHref ? {
    href?: string;
} : {}) & (Tag extends TagWithWidthHeight ? {
    width?: number;
    height?: number;
} : {}) & (Tag extends TagWithType ? {
    type?: string;
} : {}) & (Tag extends TagWithName ? {
    name?: string;
} : {});

type ElementAPI<T extends HTMLElement> = {
    readonly element: T;
    readonly classes: ClassAccessor;
    readonly attribs: {
        [key: string]: string | null;
    },
    readonly events: EventsAccessor;
    readonly style: StyleAccessor;
    setCSSVariable(variableName: string, value: CSSValue | EmitterLike<CSSValue>): void;
    setCSSVariable(table: Record<string, CSSValue | EmitterLike<CSSValue>>): void;
    qsa(selector: string): (Element | DomEntity<HTMLElement>)[];
    remove(): void;
    getRect(): DOMRect;
    focus(): void;
    blur(): void;
    on<E extends keyof HTMLElementEventMap>(
        eventId: E, handler: (
            this: ElementAPI<T>, data: HTMLElementEventMap[E]
        ) => void
    ): UnsubscribeFunc;
} & (
    T extends ContentlessElement ? {} : {
        append(...content: DOMContent[]): void;
        innerHTML: string;
        content: DOMContent | EmitterLike<DOMContent>;
    }
) & (
    T extends HTMLElementTagNameMap[TagWithValue] ? {
        value: string;
        select(): void;
    } : {}
) & (T extends HTMLCanvasElement ? {
        width: number;
        height: number;
        getContext: HTMLCanvasElement["getContext"];
    } : {}
) & (T extends HTMLElementTagNameMap[TagWithSrc] ? {
        src: string;
    } : {}
) & (T extends HTMLElementTagNameMap[TagWithHref] ? {
        href: string;
    } : {}
) & (
    T extends HTMLMediaElement ? {
        play(): void;
        pause(): void;
        currentTime: number;
        readonly paused: boolean;
    } : {}
) & (
    T extends HTMLElementTagNameMap[TagWithName] ? {
        name: string | null;
    } : {}
);

// type of `$`, describing $.TAG(...), $(element) and $("tag#id.class")
export type DomHelper = (
    (
        /**
         * Creates an element of the specified tag
         */
        <T extends HTMLTag>(
            tagName: T,
            descriptor: ElementDescriptor<T>
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    &     (
        /**
         * Creates an element of the specified tag
         */
        <T extends HTMLTag>(
            tagName: T,
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        /**
         * Creates an element with ID and classes as specified by a selector-like string
         */
        <T extends HTMLTag>(
            selector: `${T}#${string}`,
            content?: T extends ContentlessTag ? void : DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        /**
         * Creates an element with ID and classes as specified by a selector-like string
         */
        <T extends HTMLTag>(
            selector: `${T}.${string}`,
            content?: T extends ContentlessTag ? void : DOMContent
        ) => DomEntity<HTMLElementTagNameMap[T]>
    )
    & (
        /**
         * Wraps an existing element as a DomEntity
         */
        <T extends HTMLElement>(element: T) => DomEntity<T>
    )
    & {
        [T in HTMLTag]: (
            descriptor: ElementDescriptor<T>
        ) => DomEntity<HTMLElementTagNameMap[T]>
    }
    & {
        [T in HTMLTag]: T extends ContentlessTag
            ? () => DomEntity<HTMLElementTagNameMap[T]>
            : (
                content?: DOMContent
            ) => DomEntity<HTMLElementTagNameMap[T]>
    }
)

type JelEntityData = {
    dom: DOMContent;
}

export type JelEntity<API extends object | void> = (API extends void ? {} : API) & {
    readonly [entityDataSymbol]: JelEntityData;
};

export type EventsAccessor = {
    [K in keyof HTMLElementEventMap]: EventEmitter<HTMLElementEventMap[K]>;
} & {
    addEventListener<K extends keyof HTMLElementEventMap>(
        eventName: K, 
        listener: (event: HTMLElementEventMap[K]) => void
    ): void;
    removeEventListener<K extends keyof HTMLElementEventMap>(
        eventName: K, 
        listener: (event: HTMLElementEventMap[K]) => void
    ): void;
};