# Jel
### Or, How I Learned To Stop Worrying And Love The DOM

Jel is a thin layer over the DOM to simplify element structure creation, manipulation and componentisation with 'vanilla' TS.

See [demo/index.ts](https://github.com/tiadrop/jel-ts/blob/main/demo/index.ts) for example operation. Compare with [resulting page](https://aleta.codes/jel-ts-demo/).

## `$` basic use:

`$.[tagname](details)` produces an element of `<tagname>`. `details` can be content of various types or a descriptor object.

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
        attribs: {
            href: "/recover-account",
        }
    })
]));

body.append([
    $.h2("Files"),
    $.ul(
        files.map(file => $.li(
            $.a({
                content: file.name,
                attribs: {
                    href: `/files/${file.name}`,
                }
            })
        ))
    )
])

```