import { progressBar } from "../examples/progressBar";
import { toggleButton } from "../examples/toggleButton";
import { $, createEntity, createEventSource, DOMContent, ElementClassDescriptor } from "../src/index"; // from "@xtia/jel"

// wrap body
const body = $(document.body);

// using a component (toggle button)
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

// custom component

type SuperButtonSpec = {
	caption: DOMContent;
	classes?: ElementClassDescriptor;
	on?: {
		click?: (data: SuperButtonClickEvent) => void;
	}
}

type SuperButtonClickEvent = {
	totalClicks: number;
}

const superbutton = (spec: SuperButtonSpec) => {
	let timesClicked = 0;

	// createEventSource creates a linked emit() and Emitter
	const clickEvent = createEventSource<SuperButtonClickEvent>(spec.on?.click);
	
	const button = $.button({
		on: {
			click: () => {
				timesClicked++;
				// use emit() privately
				clickEvent.emit({ totalClicks: timesClicked });
			},
		}
	});
	
	const label = $.label(spec.caption);
	
	const main = $.div({
		classes: ["superbutton", spec.classes],
		content: [
			button,
			label,
		]
	});
	
	// createEntity wraps an API object such that it can be appended as DOMContent
	// while retaining the interface
	return createEntity(main, {
		get caption(){ return label.content },
		set caption(v){ label.content = v },
		get timesClicked(){ return timesClicked },
		events: {
			// expose the Emitter
			click: clickEvent.emitter
		}
	});
}

// using your new component:
const mySuperbutton = superbutton({
	caption: "Click ☝️",
	on: {
		click: event => mySuperbutton.caption = `clicks: ${event.totalClicks}`
	}
});

body.append([
	$.h2("Custom"),
	mySuperbutton,
]);


// progress bar

const demoProgressPlain = progressBar();
const demoProgressRed = progressBar({ classes: "red-fg" });



// simple components can be simple functions
const progressDeltaButton = (delta: number) => $.button({
	content: $.code([`progressBar.value ${delta >= 0 ? "+" : "-"}= ${Math.abs(delta)}`]),
	on: {
		click: () => {
			demoProgressPlain.value += delta;
			demoProgressRed.value = demoProgressPlain.value;
		}
	}
});

body.append([
	$.h2("Progress"),
	$.blockquote([
		$.pre("progressBar()"),
		demoProgressPlain,
		$.pre("progressBar({ appearance: \"bar\", classes: \"red-fg\" })"),
		demoProgressRed,
	]),
	$.div([
		progressDeltaButton(-.05),
		progressDeltaButton(.06),
	]),
]);

