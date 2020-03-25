/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResolvedKeybinding, ResolvedKeybindingPart } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';
import { UILabelProvider, AriaLabelProvider, UserSettingsLabelProvider } from 'vs/base/common/keybindingLabels';

export const enum MouseButton {
	Left = 0,
	Middle,
	Right
}

/**
 * The prefix used in keybindings.json for selection bindings in order to distinguish them from regular bindings.
 */
export const UserSettingsSelectionPrefix: string = 'sel ';
export const UiSelectionPrefix: string = 'SEL ';
const AriaSelectionPrefix: string = 'SEL ';

/**
 * The prefix used in keybindings.json for mouse bindings in order to distinguish them from regular bindings.
 */
export const UserSettingsMousePrefix: string = 'mouse ';

const uiStrToButton: { [key: string]: MouseButton } = { 'LMB': MouseButton.Left, 'MMB': MouseButton.Middle, 'RMB': MouseButton.Right };
const uiButtonToStr = ['LMB', 'MMB', 'RMB'];
const ariaStrToButton: { [key: string]: MouseButton } = { 'LMB': MouseButton.Left, 'MMB': MouseButton.Middle, 'RMB': MouseButton.Right };
const ariaButtonToStr = ['LMB', 'MMB', 'RMB'];
const userSettingsStrToButton = { 'left': MouseButton.Left, 'middle': MouseButton.Middle, 'right': MouseButton.Right };
const userSettingsButtonToStr = ['left', 'middle', 'right'];

export type UserSettingsMouseButtons = keyof typeof userSettingsStrToButton;

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
		return userSettingsStrToButton[button.toLowerCase() as UserSettingsMouseButtons];
	}
}

export class MouseBinding {
	public readonly ctrlKey: boolean;
	public readonly shiftKey: boolean;
	public readonly altKey: boolean;
	public readonly metaKey: boolean;
	public readonly button: MouseButton;
	public readonly isSelectionBinding: boolean;
	/**
	 * One is single click, two is double click, etc..
	 */
	public readonly times: number;

	constructor(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, button: MouseButton, isSelectionBinding: boolean, times: number) {
		this.ctrlKey = ctrlKey;
		this.shiftKey = shiftKey;
		this.altKey = altKey;
		this.metaKey = metaKey;
		this.button = button;
		this.isSelectionBinding = isSelectionBinding;
		this.times = times;
	}

	public equals(other: MouseBinding): boolean {
		return (
			this.ctrlKey === other.ctrlKey
			&& this.shiftKey === other.shiftKey
			&& this.altKey === other.altKey
			&& this.metaKey === other.metaKey
			&& this.button === other.button
			&& this.isSelectionBinding === other.isSelectionBinding
			&& this.times === other.times
		);
	}

	public getHashCode(): string {
		const ctrl = this.ctrlKey ? '1' : '0';
		const shift = this.shiftKey ? '1' : '0';
		const alt = this.altKey ? '1' : '0';
		const meta = this.metaKey ? '1' : '0';
		const type = this.isSelectionBinding ? 's' : 'm';
		return `${type}${this.times};${ctrl}${shift}${alt}${meta}${this.button}`;
	}
}

export class ResolvedMouseBinding extends ResolvedKeybinding {

	private readonly _os: OperatingSystem;
	private readonly _binding: MouseBinding;

	constructor(os: OperatingSystem, binding: MouseBinding) {
		super();
		this._os = os;
		this._binding = binding;
	}

	private get uiPrefix() {
		return this._binding.isSelectionBinding ? UiSelectionPrefix : '';
	}
	private get userSettingsPrefix() {
		return this._binding.isSelectionBinding ? UserSettingsSelectionPrefix : UserSettingsMousePrefix;
	}
	private get ariaPrefix() {
		return this._binding.isSelectionBinding ? AriaSelectionPrefix : '';
	}

	public getLabel(): string | null {
		return this.uiPrefix + UILabelProvider.toLabel(this._os, [this._binding], (binding) => MouseButtonUtils.toString(binding.button));
	}

	public getAriaLabel(): string | null {
		return this.ariaPrefix + AriaLabelProvider.toLabel(this._os, [this._binding], (binding) => MouseButtonUtils.toAriaString(binding.button));
	}

	public getElectronAccelerator(): string | null {
		// Mouse buttons can not be represented using electron accelerators
		return null;
	}

	public getUserSettingsLabel(): string | null {
		return this.userSettingsPrefix + UserSettingsLabelProvider.toLabel(this._os, [this._binding], (binding) => MouseButtonUtils.toUserSettingsString(binding.button));
	}

	public isWYSIWYG(): boolean {
		return this.userSettingsPrefix === this.uiPrefix;
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
			this._binding.isSelectionBinding
		)];
	}

	public getDispatchParts(): (string | null)[] {
		let result = '';

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
