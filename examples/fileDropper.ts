import { $, createEntity, ElementClassDescriptor, DOMContent, SubjectEmitter, createEventsSource } from "@xtia/jel";

type FileDropperOptions = {
	onDrop?: (files: File[]) => void;
	accept?: string; // e.g., 'image/*,.pdf'
	multiple?: boolean;
	classes?: ElementClassDescriptor;
	content?: DOMContent;
	on?: {
		[K in keyof FileDropperEvents]?: (value: FileDropperEvents[K]) => void;
	};
};

type FileDropperEvents = {
	drop: File[];
	dragEnter: void;
	dragLeave: void;
}

export function createFileDropper(options?: FileDropperOptions) {
	const events = createEventsSource<FileDropperEvents>(options?.on);
	const dragHoverCount = new SubjectEmitter(0);
	const isDragHovering = dragHoverCount.map((n) => n > 0);

	const fileInput = $.input({
		type: "file",
		attribs: {
			multiple: options?.multiple || false,
			accept: options?.accept
		},
		style: { display: "none" },
		on: {
			change: () => {
				const files = fileInput.element.files;
				if (files && files.length > 0) {
					events.trigger("drop", Array.from(files));
				}
				fileInput.value = "";
			}
		}
	});

	const contentEl = $.div({
		content: options?.content
	});

	const el = $.button({
		classes: [
			options?.classes,
			{
				"drag-hover": isDragHovering
			}
		],
		on: {
			click: () => fileInput.element.click(),
			dragenter: (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				dragHoverCount.next(dragHoverCount.value + 1);
			},
			dragleave: (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				dragHoverCount.next(dragHoverCount.value - 1);
			},
			dragover: (ev) => ev.preventDefault(),
			drop: (ev) => {
				ev.preventDefault();
				if (ev.dataTransfer?.files.length !== 1 && !options?.multiple) return;
				dragHoverCount.next(0);
				if (ev.dataTransfer?.files) {
					events.trigger("drop", Array.from(ev.dataTransfer.files));
				}
			}
		},
		content: [fileInput, contentEl]
	});

	isDragHovering.apply(v => events.trigger(v ? "dragEnter" : "dragLeave", undefined));

	return createEntity(el, {
		events: events.emitters,
		remove: () => el.remove(),
		get content() {
			return contentEl.content;
		},
		set content(v) {
			contentEl.content = v;
		}
	});
}
