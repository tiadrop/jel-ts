import { progressBar } from "../examples/progressBar";
import { toggleButton } from "../examples/toggleButton";
import { $, createEntity, definePart, DOMContent, ElementClassDescriptor } from "../src/index"; // from "@xtia/jel"

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
	classes?: ElementClassDescriptor;
}

// api: interface returned by the component function
type SuperButtonAPI = {
	caption: DOMContent;
	readonly timesClicked: number;
}

// event map: events your component will emit, and the data associated with each
type SuperButtonEvents = {
	click: {
		totalClicks: number;
	};
}

const superbutton = definePart<
	SuperButtonSpec,
	SuperButtonAPI,
	SuperButtonEvents
>({
	// provide default values for all optional Spec properties
	classes: [],
}, (spec, append, trigger) => {
	// and an init function, where `spec` represents what might be passed to your
	// part constructor, `append` adds DOM content to your component and `trigger`
	// raises an event
	
	let timesClicked = 0;
	
	const button = $.button({
		on: {
			click: () => {
				timesClicked++;
				trigger("click", { totalClicks: timesClicked });
			},
		}
	});
	
	const label = $.label(spec.caption);
	
	append($.div({
		classes: ["superbutton", spec.classes],
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

// using your new part:
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

const demoProgressPlain = progressBar({});
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



// a simpler component can just be a function:

const icon = (iconId: string) => $.span({
	classes: ["icon", `icon-${iconId}`],
});

const button = $.button({
	content: [icon("checkmark"), " Accept"],
});



// custom DOMContent:

type Person = {
	name: string;
	url: string;
}

function createCredit(person: Person) {
	const link = $.a({
		content: person.name,
		href: person.url,
	});
	const para = $.p([
		link,
		" made this.",
	]);
	// pass DOMContent and (optionally) an API to createEntity():
	return createEntity(para, {
		setLinkColour(c: string) {
			link.style.color = c;
		}
	});
}

const credit = createCredit({
	name: "Aleta",
	url: "https://aleta.codes"
});

// the 'entity' can be used as content
body.append(credit);

// and the API is functional
credit.setLinkColour("#fab");
