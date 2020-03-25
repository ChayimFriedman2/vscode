/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedKeybinding, ResolvedKeybindingPart, JSONKey } from 'vs/base/common/keyCodes';
import { OS } from 'vs/base/common/platform';
import { UILabelProvider, AriaLabelProvider } from 'vs/base/common/keybindingLabels';

export const enum MouseButton {
	Left = 0,
	Middle,
	Right
}

const uiStrToButton: { [key: string]: MouseButton } = { 'LMB': MouseButton.Left, 'MMB': MouseButton.Middle, 'RMB': MouseButton.Right };
const uiButtonToStr = ['LMB', 'MMB', 'RMB'];
const ariaStrToButton: { [key: string]: MouseButton } = { 'LMB': MouseButton.Left, 'MMB': MouseButton.Middle, 'RMB': MouseButton.Right };
const ariaButtonToStr = ['LMB', 'MMB', 'RMB'];
const userSettingsStrToButton: { [key: string]: MouseButton } = { 'left': MouseButton.Left, 'middle': MouseButton.Middle, 'right': MouseButton.Right };
const userSettingsButtonToStr = ['left', 'middle', 'right'];

export namespace MouseButtonUtils {
	export function toString(button: MouseButton): string {
		return uiButtonToStr[button];
	}
	export function fromString(button: string): MouseButton {
		return uiStrToButton[button.toLowerCase()];
	}

	export function toAriaString(button: MouseButton): string {
		return ariaButtonToStr[button];
	}
	export function fromAriaString(button: string): MouseButton {
		return ariaStrToButton[button.toLowerCase()];
	}

	export function toUserSettingsString(button: MouseButton): string {
		return userSettingsButtonToStr[button];
	}
	export function fromUserSettingsString(button: string): MouseButton {
		return userSettingsStrToButton[button.toLowerCase()];
	}
}

export abstract class BaseMouseBinding {

	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly button: MouseButton;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, button: MouseButton) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.button = button;
	}

	protected equals(other: BaseMouseBinding): boolean {
		return (
			this.ctrlKey === other.ctrlKey
			&& this.shiftKey === other.shiftKey
			&& this.altKey === other.altKey
			&& this.metaKey === other.metaKey
			&& this.button === other.button
		);
	}

	protected getHashCode(): string {
		const ctrl = this.ctrlKey ? '1' : '0';
		const shift = this.shiftKey ? '1' : '0';
		const alt = this.altKey ? '1' : '0';
		const meta = this.metaKey ? '1' : '0';
		return `${ctrl}${shift}${alt}${meta}${this.button}`;
	}

	protected getBaseLabel(): string | null {
		return UILabelProvider.toLabel(OS, [this], () => MouseButtonUtils.toString(this.button));
	}

	protected getBaseAriaLabel(): string | null {
		return AriaLabelProvider.toLabel(OS, [this], () => MouseButtonUtils.toAriaString(this.button));
	}

	abstract getLabel(): string | null;
	abstract getAriaLabel(): string | null;

	abstract get dispatchPrefix(): string;

	abstract asJSONKey(): JSONKey;
}

export class MouseBinding extends BaseMouseBinding {

	/**
	 * One is single click, two is double click, etc..
	 */
	public readonly times?: number;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, button: MouseButton, times?: number) {
		super(ctrlKey, shiftKey, altKey, metaKey, button);
		this.times = times;
	}

	protected equals(other: MouseBinding): boolean {
		return super.equals(other) && this.times === other.times;
	}

	getHashCode(): string {
		return `${this.times}m` + super.getHashCode();
	}

	getLabel(): string | null {
		return this.getBaseAriaLabel();
	}

	getAriaLabel(): string | null {
		return this.getBaseAriaLabel();
	}

	get dispatchPrefix(): string {
		return 'mouse';
	}

	asJSONKey(): JSONKey {
		return {
			type: 'mouse',
			button: MouseButtonUtils.toUserSettingsString(this.button),
			times: this.times
		};
	}
}

export class SelectionBinding extends BaseMouseBinding {

	equals(other: MouseBinding): boolean {
		return super.equals(other);
	}

	getHashCode(): string {
		return 's' + super.getHashCode();
	}

	getLabel(): string | null {
		const result = this.getBaseAriaLabel();
		return result && `SEL ${result}`;
	}

	getAriaLabel(): string | null {
		const result = this.getBaseAriaLabel();
		return result && `Selection Shortcut: ${result}`;
	}

	get dispatchPrefix(): string {
		return 'selection';
	}

	asJSONKey(): JSONKey {
		return {
			type: 'selection',
			button: MouseButtonUtils.toUserSettingsString(this.button)
		};
	}
}

export class ResolvedMouseBinding extends ResolvedKeybinding {

	private readonly _binding: BaseMouseBinding;

	constructor(binding: BaseMouseBinding) {
		super();
		this._binding = binding;
	}

	public getLabel(): string | null {
		return this._binding.getLabel();
	}

	public getAriaLabel(): string | null {
		return this._binding.getAriaLabel();
	}

	public getElectronAccelerator(): string | null {
		// Mouse buttons can not be represented using electron accelerators
		return null;
	}

	public getUserSettingsLabel(): JSONKey {
		return this._binding.asJSONKey();
	}

	public isWYSIWYG(): boolean {
		return false;
	}

	public isChord(): boolean {
		return false;
	}

	public getParts(): ResolvedKeybindingPart[] {
		return [new ResolvedKeybindingPart(
			this._binding.ctrlKey,
			this._binding.shiftKey,
			this._binding.altKey,
			this._binding.metaKey,
			MouseButtonUtils.toString(this._binding.button),
			MouseButtonUtils.toAriaString(this._binding.button),
			'SEL'
		)];
	}

	public getDispatchParts(): (string | null)[] {
		let result = this._binding.dispatchPrefix + ' ';

		if (this._binding.ctrlKey) {
			result += 'ctrl+';
		}
		if (this._binding.shiftKey) {
			result += 'shift+';
		}
		if (this._binding.altKey) {
			result += 'alt+';
		}
		if (this._binding.metaKey) {
			result += 'meta+';
		}
		result += MouseButtonUtils.toString(this._binding.button);

		return [result];
	}
}
