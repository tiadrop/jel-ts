import { progressBar } from "../examples/progressBar";
import { toggleButton } from "../examples/toggleButton";
import { $, definePart, DOMContent } from "../src/base";

const body = $(document.body);




// (custom) toggle button

body.append(
    $.h2("Toggle button"),
    toggleButton({
        caption: "Toggle theme",
        classes: "theme-toggle",
        state: true,
        on: {
            change: event => body.classes.toggle("dark-mode", event.state),
        }
    })
)


// custom

const superbutton = definePart<{
    caption: DOMContent,
}, {
    caption: DOMContent,
}, {
    click: null,
}>({
    caption: [],
}, (spec, append, trigger) => {
    const button = $.button({
        on: {
            click: () => trigger("click", null),
        }
    });
    const label = $.label(spec.caption);
    append($.div({
        classes: "superbutton",
        content: [
            button,
            label,
        ]
    }));
    return {
        get caption(){ return label.content },
        set caption(v){ label.content = v },
    };
});

const mySuperbutton = superbutton({
    caption: "Click ☝️",
    on: {
        click: () => mySuperbutton.caption = "thanks!"
    }
});

body.append([
    $.h2("Custom"),
    mySuperbutton,
]);


// progress bar

const demoProgressPlain = progressBar();
const demoProgressRed = progressBar({ classes: "red-fg" });

const progressDeltaButton = definePart<{
    delta: number,
}, {}, {}>({
    delta: .1
}, (spec, append, trigger) => {
    append($.button({
        content: $.code([`progressBar.value ${spec.delta >= 0 ? "+" : "-"}= ${Math.abs(spec.delta)}`]),
        on: {
            click: () => {
                demoProgressPlain.value -= spec.delta;
                demoProgressRed.value = demoProgressPlain.value;
            }
        }
    }));
})

body.append([
    $.h2("Progress"),
    $.blockquote([
        $.pre("progressBar()"),
        demoProgressPlain,
        $.pre("progressBar({ appearance: \"bar\", classes: \"red-fg\" })"),
        demoProgressRed,
    ]),
    $.div([
        progressDeltaButton({delta: .06}),
        progressDeltaButton({delta: -.05}),
    ]),
]);
