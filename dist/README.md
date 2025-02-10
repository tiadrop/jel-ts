# Jel
### Or, How I Learned To Stop Worrying And Love The DOM

Jel is a thin layer over the DOM to simplify element structure creation, manipulation and componentisation with 'vanilla' TS.

See [demo/index.ts](https://github.com/tiadrop/jel-ts/blob/main/demo/index.ts) for example operation. Compare with [resulting page](https://aleta.codes/jel-ts-demo/).

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

Content can be string, Text, HTMLElement, JelEntity or arbitrarily nested array of content. Typing as DOMContent where possible enables flexibility.

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