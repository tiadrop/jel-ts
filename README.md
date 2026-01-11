# Jel
### Or, How I Learned To Stop Worrying And Love The DOM

Jel is a thin layer over the DOM to simplify element structure creation, manipulation and componentisation with 'vanilla' TS/JS.

See [demo/index.ts](https://github.com/tiadrop/jel-ts/blob/main/demo/index.ts) for reusable components. Compare with [resulting page](https://aleta.codes/jel-ts-demo/).

## `$` Basic Use:

`$.[tagname](details)` produces an element of `<tagname>`. `details` can be content of various types or a descriptor object.
```
$ npm i @xtia/jel
```

```ts
import { $ } from "@xtia/jel";

// wrap body
const body = $(document.body);

body.append($.form([
    $.h2("Sign in"),
    $.label("Email"),
    $.input({ attribs: { name: "email" }}),
    $.label("Password"),
    $.input({ attribs: { name: "password", type: "password" }}),
    $.button("Sign in"),
    $.a({
        content: ["Having trouble? ", $.strong("Recover account")],
        href: "/recover-account",
    })
]));

body.append([
    $.h2("Files"),
    $.ul(
        files.map(file => $.li(
            $.a({
                content: file.name,
                href: `/files/${file.name}`,
            })
        ))
    )
])

```

## `DOMContent`

Content can be string, Text, HTMLElement, JelEntity or arbitrarily nested array of content. Typing as DOMContent carries that flexibility to your own interfaces.

```ts
function showDialogue(content: DOMContent) => {
    const element = $.div({
        classes: "dialogue",
        content: [
            content,
            $.div({
                classes: "buttons",
                // content: [...]
            })
        ]
    });
    // ...
}

interface Job {
    name: string;
    completionMessage: DOMContent;
}

showDialogue("Hello, world");
showDialogue(["Hello, ", $.i("world")]);
showDialogue([
    $.h2(`${job.name} Complete`),
    $.p(job.completionMessage),
]);
```

## `ElementClassDescriptor`

Element classes can be specified as string, `{ [className]: boolean }` and arbitrarily nested array thereof.

```ts
function renderFancyButton(
    caption: DOMContent,
    onClick: () => void,
    classes: ElementClassDescriptor = []
) {
    return $.button({
        content: caption,
        classes: ["fancy-button", classes],
        // ...
    });
}

function showDialogue(content: DOMContent, danger: boolean = false) {
    const element = $.div({
        // ...
        classes: "dialogue",
        content: [
            content, 
            renderFancyButton("OK", close, ["ok-button", { danger }]),
        ]
    });
    // ...
}
```

## Jel-Wrapped Elements

Jel wraps its elements in an interface for common operations plus an `append()` method that accepts `DOMContent`.

For other operations the element is accessible via `ent.element`:

```ts
const div = $.div();
div.element.requestFullscreen();
```

## Shorthand

If you need an element with just a class, id and/or content you can use `tag#id.classes` notation, ie `$("div#someId.class1.class2", content?)`.

```ts
showDialogue(["Hello ", $("span.green", "world")]);
```

## Event composition

Event emitters can be chained:

```ts
element.events.mousemove
	.takeUntil(body.events.mousedown.filter(e => e.button === 1))
	.map(ev => [ev.offsetX, ev.offsetY])
	.apply(([x, y]) => console.log("mouse @ ", x, y));
```

For RxJS users, events can be observed with `fromEvent(element.events, "mousemove")`.

## Reactive styles

Style properties can be emitter subscriptions:

```ts
const mousePosition$ = $(document.body).events.mousemove
    .map(ev => ({x: ev.clientX, y: ev.clientY}));

const virtualCursor = $.div({
    classes: "virtual-cursor",
    style: {
        left: mousePosition$.map(v => v.x + "px"),
        top: mousePosition$.map(v => v.y + "px")
    }
});
```

Emitters for this purpose can be Jel events, [@xtia/timeline](https://github.com/tiadrop/timeline) progressions, RxJS Observables or any object with either `subscribe()` or `listen()` that returns teardown logic.

```ts
import { animate } from "@xtia/timeline";

button.style.opacity = animate(500).tween(0, 1);
```