import { progressBar } from "../examples/progressBar";
import { toggleButton } from "../examples/toggleButton";
import { $, definePart, DOMContent } from "../src/index"; // from "@xtia/jel"

// wrap body
const body = $(document.body);



// toggle button

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


// custom 'part'

// spec: options to be passed to the component function
type SuperButtonSpec = {
    caption: DOMContent;
}

// api: interface returned by the component function
type SuperButtonAPI = {
    caption: DOMContent;
    readonly timesClicked: number;
}

// event map: events your component will emit, and the data associated with each
type SuperButtonEvents = {
    click: null;
}

const superbutton = definePart<
    SuperButtonSpec,
    SuperButtonAPI,
    SuperButtonEvents
>({
    caption: [],
}, (spec, append, trigger) => {

    let timesClicked = 0;

    const button = $.button({
        on: {
            click: () => {
                timesClicked++;
                trigger("click", null);
            },
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
        get timesClicked(){ return timesClicked },
    };
});

const mySuperbutton = superbutton({
    caption: "Click ☝️",
    on: {
        click: () => mySuperbutton.caption = `clicks: ${mySuperbutton.timesClicked}`
    }
});

mySuperbutton.on("click", () => alert("works"))

body.append([
    $.h2("Custom"),
    mySuperbutton,
]);


// progress bar

const demoProgressPlain = progressBar();
const demoProgressRed = progressBar({ classes: "red-fg" });

const progressDeltaButton = definePart<{
    delta: number,
}, void, {}>({
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
