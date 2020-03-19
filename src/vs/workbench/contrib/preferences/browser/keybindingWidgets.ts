/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/keybindings';
import * as nls from 'vs/nls';
import { OS } from 'vs/base/common/platform';
import { Disposable, toDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { Widget } from 'vs/base/browser/ui/widget';
import { ResolvedKeybinding, KeyCode } from 'vs/base/common/keyCodes';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent, StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { attachInputBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorWidgetBackground, editorWidgetForeground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { SearchWidget, SearchOptions } from 'vs/workbench/contrib/preferences/browser/preferencesWidgets';
import { withNullAsUndefined } from 'vs/base/common/types';
import { StandardMouseEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';

export interface KeybindingsSearchOptions extends SearchOptions {
	recordEnter?: boolean;
	quoteRecordedKeys?: boolean;
}

export class KeybindingsSearchWidget extends SearchWidget {

	private _firstPart: ResolvedKeybinding | null;
	private _chordPart: ResolvedKeybinding | null;
	private _inputValue: string;

	/** When set to false, chord recording is not enabled. */
	enableChord: boolean = true;
	/** When set to true, keys are not recorded - only modifiers and mouse buttons. */
	recordOnlyMouse: boolean = false;

	private readonly recordDisposables = this._register(new DisposableStore());

	private _onKeybinding = this._register(new Emitter<[ResolvedKeybinding | null, ResolvedKeybinding | null]>());
	readonly onKeybinding: Event<[ResolvedKeybinding | null, ResolvedKeybinding | null]> = this._onKeybinding.event;

	private _onEnter = this._register(new Emitter<void>());
	readonly onEnter: Event<void> = this._onEnter.event;

	private _onEscape = this._register(new Emitter<void>());
	readonly onEscape: Event<void> = this._onEscape.event;

	private _onBlur = this._register(new Emitter<void>());
	readonly onBlur: Event<void> = this._onBlur.event;

	constructor(parent: HTMLElement, options: SearchOptions,
		@IContextViewService contextViewService: IContextViewService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(parent, options, contextViewService, instantiationService, themeService);
		this._register(attachInputBoxStyler(this.inputBox, themeService));
		this._register(toDisposable(() => this.stopRecordingKeys()));
		this._firstPart = null;
		this._chordPart = null;
		this._inputValue = '';

		this._reset();
	}

	clear(): void {
		this._reset();
		super.clear();
	}

	startRecordingKeys(): void {
		this.recordDisposables.add(dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => this._onKeyDown(new StandardKeyboardEvent(e))));
		this.recordDisposables.add(dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.MOUSE_UP, (e: MouseEvent) => this._onMouseUp(new StandardMouseEvent(e))));
		this.recordDisposables.add(dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.BLUR, () => this._onBlur.fire()));
		this.recordDisposables.add(dom.addDisposableListener(this.inputBox.inputElement, dom.EventType.INPUT, () => {
			// Prevent other characters from showing up
			this.setInputValue(this._inputValue);
		}));

		// Prevent context menu when recording
		this.recordDisposables.add(dom.addDisposableIgnoreListener(this.inputBox.inputElement, dom.EventType.CONTEXT_MENU));
	}

	stopRecordingKeys(): void {
		this._reset();
		this.recordDisposables.clear();
	}

	setInputValue(value: string): void {
		this._inputValue = value;
		this.inputBox.value = this._inputValue;
	}

	private _reset() {
		this._firstPart = null;
		this._chordPart = null;
	}

	private _onMouseUp(mouseEvent: IMouseEvent): void {
		mouseEvent.preventDefault();
		mouseEvent.stopPropagation();
		this.printMouseBinding(mouseEvent);
	}

	private _onKeyDown(keyboardEvent: IKeyboardEvent): void {
		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();

		const options = this.options as KeybindingsSearchOptions;
		if (!options.recordEnter && keyboardEvent.equals(KeyCode.Enter)) {
			this._onEnter.fire();
			return;
		}
		if (keyboardEvent.equals(KeyCode.Escape)) {
			this._onEscape.fire();
			return;
		}

		if (this.recordOnlyMouse) { return; }

		this.printKeybinding(keyboardEvent);
	}

	private printMouseBinding(mouseEvent: IMouseEvent): void {
		const keybinding = this.keybindingService.resolveMouseEvent(mouseEvent);
		const info = `button: ${mouseEvent.browserEvent.button}, => UI: ${keybinding.getAriaLabel()}, user settings: ${keybinding.getUserSettingsLabel()}, dispatch: ${keybinding.getDispatchParts()[0]}`;
		this.printBinding(keybinding, info);
	}

	private printKeybinding(keyboardEvent: IKeyboardEvent): void {
		if (keyboardEvent.browserEvent.repeat) {
			// The event was fired by holding a key - it's at least the second time (for the same key).
			// The problem without mouse keybindings is minimal: for instance, pressing and holding Alt
			// then pressing and holding Z will result in an alternate fast cycle of "ctrl+", "ctrl+z" and "ctrl+z ctrl+z".
			// however since there is not real reason to hold the key, it was mostly OK.
			// But when I added mouse keybindings, I've noticed a strange fact: if you hold down a modifier key
			// then press on a mouse button, the result is (for Alt+left button) "alt+lmb alt+" instead of
			// just "alt+lmb". Moreover, when there is already a key (say Ctrl+S) assigned, and we want
			// to add a chord, and click Ctrl+LMB, instead of "ctrl+s ctrl+lmb" you'll get "ctrl+"!
			// very frustrating, because this actually prevents chording mouse buttons.
			// Also there were times when this bug did not appeared.
			// After hours of debug I found the problem: when you press Ctrl, a keydown event is being fired as
			// long as you hold Ctrl down. If I then press LMB, a mouse event is being fired - but immediately
			// the series of Ctrl's keydowns continues. That results in that VSCode thinks you re-recording
			// your keybinding, and start new keybinding within Ctrl - unless you're fast enough to leave Ctrl
			// before the next keydown event is fired (that's hard! believe me :)). The problem can't appear
			// without mouse recording, because if I would replace the Ctrl+LMB in my example with Ctrl+K,
			// the keydown event for K will override the one of Ctrl - because there can't be two keydown events
			// in parallel, once you start new key the previous is removed even if it's still holden down.
			return;
		}

		const keybinding = this.keybindingService.resolveKeyboardEvent(keyboardEvent);
		const info = `code: ${keyboardEvent.browserEvent.code}, keyCode: ${keyboardEvent.browserEvent.keyCode}, key: ${keyboardEvent.browserEvent.key} => UI: ${keybinding.getAriaLabel()}, user settings: ${keybinding.getUserSettingsLabel()}, dispatch: ${keybinding.getDispatchParts()[0]}`;
		this.printBinding(keybinding, info);
	}

	private printBinding(keybinding: ResolvedKeybinding, info: string): void {
		const options = this.options as KeybindingsSearchOptions;
		let value = '';
		if (this.enableChord) {
			const hasFirstPart = (this._firstPart && this._firstPart.getDispatchParts()[0] !== null);
			const hasChordPart = (this._chordPart && this._chordPart.getDispatchParts()[0] !== null);
			if (hasFirstPart && hasChordPart) {
				// Reset
				this._firstPart = keybinding;
				this._chordPart = null;
			}
			else if (!hasFirstPart) {
				this._firstPart = keybinding;
			}
			else {
				this._chordPart = keybinding;
			}
			if (this._firstPart) {
				value = (this._firstPart.getUserSettingsLabel() || '');
			}
			if (this._chordPart) {
				value = value + ' ' + this._chordPart.getUserSettingsLabel();
			}
		} else {
			this._firstPart = keybinding;
			value = this._firstPart.getUserSettingsLabel() || '';
		}
		this.setInputValue(options.quoteRecordedKeys ? `"${value}"` : value);
		this.inputBox.inputElement.title = info;
		this._onKeybinding.fire([this._firstPart, this._chordPart]);
	}
}

export class DefineKeybindingWidget extends Widget {

	private static readonly WIDTH = 400;
	private static readonly HEIGHT = 110;

	private _domNode: FastDomNode<HTMLElement>;
	private _keybindingInputWidget: KeybindingsSearchWidget;
	private _outputNode: HTMLElement;
	private _showExistingKeybindingsNode: HTMLElement;

	private _firstPart: ResolvedKeybinding | null = null;
	private _chordPart: ResolvedKeybinding | null = null;
	private _isVisible: boolean = false;

	private _onHide = this._register(new Emitter<void>());

	private _onDidChange = this._register(new Emitter<string>());
	onDidChange: Event<string> = this._onDidChange.event;

	private _onShowExistingKeybindings = this._register(new Emitter<string | null>());
	readonly onShowExistingKeybidings: Event<string | null> = this._onShowExistingKeybindings.event;

	constructor(
		parent: HTMLElement | null,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();

		this._domNode = createFastDomNode(document.createElement('div'));
		this._domNode.setDisplay('none');
		this._domNode.setClassName('defineKeybindingWidget');
		this._domNode.setWidth(DefineKeybindingWidget.WIDTH);
		this._domNode.setHeight(DefineKeybindingWidget.HEIGHT);

		const message = nls.localize('defineKeybinding.initial', "Press desired key combination and then press ENTER.");
		dom.append(this._domNode.domNode, dom.$('.message', undefined, message));

		this._register(attachStylerCallback(this.themeService, { editorWidgetBackground, editorWidgetForeground, widgetShadow }, colors => {
			if (colors.editorWidgetBackground) {
				this._domNode.domNode.style.backgroundColor = colors.editorWidgetBackground.toString();
			} else {
				this._domNode.domNode.style.backgroundColor = '';
			}
			if (colors.editorWidgetForeground) {
				this._domNode.domNode.style.color = colors.editorWidgetForeground.toString();
			} else {
				this._domNode.domNode.style.color = '';
			}

			if (colors.widgetShadow) {
				this._domNode.domNode.style.boxShadow = `0 2px 8px ${colors.widgetShadow}`;
			} else {
				this._domNode.domNode.style.boxShadow = '';
			}
		}));

		this._keybindingInputWidget = this._register(this.instantiationService.createInstance(KeybindingsSearchWidget, this._domNode.domNode, { ariaLabel: message }));
		this._keybindingInputWidget.startRecordingKeys();
		this._register(this._keybindingInputWidget.onKeybinding(keybinding => this.onKeybinding(keybinding)));
		this._register(this._keybindingInputWidget.onEnter(() => this.hide()));
		this._register(this._keybindingInputWidget.onEscape(() => this.onCancel()));
		this._register(this._keybindingInputWidget.onBlur(() => this.onCancel()));

		this._outputNode = dom.append(this._domNode.domNode, dom.$('.output'));
		this._showExistingKeybindingsNode = dom.append(this._domNode.domNode, dom.$('.existing'));

		if (parent) {
			dom.append(parent, this._domNode.domNode);
		}
	}

	get domNode(): HTMLElement {
		return this._domNode.domNode;
	}

	/** When set to false, chord recording is not enabled. */
	public get enableChord(): boolean {
		return this._keybindingInputWidget.enableChord;
	}
	public set enableChord(value: boolean) {
		this._keybindingInputWidget.enableChord = value;
	}

	/** When set to true, keys are not recorded - only modifiers and mouse buttons. */
	public get recordOnlyMouse(): boolean {
		return this._keybindingInputWidget.recordOnlyMouse;
	}
	public set recordOnlyMouse(value: boolean) {
		this._keybindingInputWidget.recordOnlyMouse = value;
	}


	define(): Promise<string | null> {
		this._keybindingInputWidget.clear();
		return new Promise<string | null>((c) => {
			if (!this._isVisible) {
				this._isVisible = true;
				this._domNode.setDisplay('block');

				this._firstPart = null;
				this._chordPart = null;
				this._keybindingInputWidget.setInputValue('');
				dom.clearNode(this._outputNode);
				dom.clearNode(this._showExistingKeybindingsNode);
				this._keybindingInputWidget.focus();
			}
			const disposable = this._onHide.event(() => {
				c(this.getUserSettingsLabel());
				disposable.dispose();
			});
		});
	}

	layout(layout: dom.Dimension): void {
		const top = Math.round((layout.height - DefineKeybindingWidget.HEIGHT) / 2);
		this._domNode.setTop(top);

		const left = Math.round((layout.width - DefineKeybindingWidget.WIDTH) / 2);
		this._domNode.setLeft(left);
	}

	printExisting(numberOfExisting: number): void {
		if (numberOfExisting > 0) {
			const existingElement = dom.$('span.existingText');
			const text = numberOfExisting === 1 ? nls.localize('defineKeybinding.oneExists', "1 existing command has this keybinding", numberOfExisting) : nls.localize('defineKeybinding.existing', "{0} existing commands have this keybinding", numberOfExisting);
			dom.append(existingElement, document.createTextNode(text));
			this._showExistingKeybindingsNode.appendChild(existingElement);
			existingElement.onmousedown = (e) => { e.preventDefault(); };
			existingElement.onmouseup = (e) => { e.preventDefault(); };
			existingElement.onclick = () => { this._onShowExistingKeybindings.fire(this.getUserSettingsLabel()); };
		}
	}

	private onKeybinding(keybinding: [ResolvedKeybinding | null, ResolvedKeybinding | null]): void {
		const [firstPart, chordPart] = keybinding;
		this._firstPart = firstPart;
		this._chordPart = chordPart;
		dom.clearNode(this._outputNode);
		dom.clearNode(this._showExistingKeybindingsNode);
		new KeybindingLabel(this._outputNode, OS).set(withNullAsUndefined(this._firstPart));
		if (this._chordPart) {
			this._outputNode.appendChild(document.createTextNode(nls.localize('defineKeybinding.chordsTo', "chord to")));
			new KeybindingLabel(this._outputNode, OS).set(this._chordPart);
		}
		const label = this.getUserSettingsLabel();
		if (label) {
			this._onDidChange.fire(label);
		}
	}

	private getUserSettingsLabel(): string | null {
		let label: string | null = null;
		if (this._firstPart) {
			label = this._firstPart.getUserSettingsLabel();
			if (this._chordPart) {
				label = label + ' ' + this._chordPart.getUserSettingsLabel();
			}
		}
		return label;
	}

	private onCancel(): void {
		this._firstPart = null;
		this._chordPart = null;
		this.hide();
	}

	private hide(): void {
		this._domNode.setDisplay('none');
		this._isVisible = false;
		this._onHide.fire();
	}
}

export class DefineKeybindingOverlayWidget extends Disposable implements IOverlayWidget {

	private static readonly ID = 'editor.contrib.defineKeybindingWidget';

	private readonly _widget: DefineKeybindingWidget;

	constructor(private _editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		this._widget = instantiationService.createInstance(DefineKeybindingWidget, null);
		this._editor.addOverlayWidget(this);
	}

	getId(): string {
		return DefineKeybindingOverlayWidget.ID;
	}

	getDomNode(): HTMLElement {
		return this._widget.domNode;
	}

	getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}

	dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	start(): Promise<string | null> {
		if (this._editor.hasModel()) {
			this._editor.revealPositionInCenterIfOutsideViewport(this._editor.getPosition(), ScrollType.Smooth);
		}
		const layoutInfo = this._editor.getLayoutInfo();
		this._widget.layout(new dom.Dimension(layoutInfo.width, layoutInfo.height));
		return this._widget.define();
	}
}
