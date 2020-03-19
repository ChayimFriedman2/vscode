/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, ResolvedKeybinding, ResolvedKeybindingPart, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';
import { UILabelProvider, AriaLabelProvider, UserSettingsLabelProvider } from 'vs/base/common/keybindingLabels';
import { ScanCodeBinding, ScanCode } from 'vs/base/common/scanCode';

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

const uiStrToButton: { [key: string]: MouseButton } = { 'LMB': MouseButton.Left, 'MMB': MouseButton.Middle, 'RMB': MouseButton.Right };
const uiButtonToStr = ['LMB', 'MMB', 'RMB'];
const ariaStrToButton: { [key: string]: MouseButton } = { 'LMB': MouseButton.Left, 'MMB': MouseButton.Middle, 'RMB': MouseButton.Right };
const ariaButtonToStr = ['LMB', 'MMB', 'RMB'];
const userSettingsStrToButton: { [key: string]: MouseButton } = { 'lmb': MouseButton.Left, 'mmb': MouseButton.Middle, 'rmb': MouseButton.Right };
const userSettingsButtonToStr = ['lmb', 'mmb', 'rmb'];

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

	export function toKeyCode(button: MouseButton): KeyCode {
		return button + KeyCode.MOUSE_LEFT;
	}
	export function fromKeyCode(key: KeyCode): MouseButton {
		return key - KeyCode.MOUSE_LEFT;
	}

	export function toScanCode(button: MouseButton): ScanCode {
		return button + ScanCode.MouseLeft;
	}
	export function fromScanCode(key: ScanCode): MouseButton {
		return key - ScanCode.MouseLeft;
	}
}

export class SelectionBinding {
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

	public equals(other: SimpleKeybinding | ScanCodeBinding | SelectionBinding): boolean {
		if (this.ctrlKey !== other.ctrlKey || this.shiftKey !== other.shiftKey || this.altKey !== other.altKey || this.metaKey !== other.metaKey) {
			return false;
		}
		if (other instanceof SelectionBinding) {
			return other.button === this.button;
		} else if (other instanceof SimpleKeybinding) {
			return MouseButtonUtils.fromKeyCode(other.keyCode) === this.button;
		} else {
			return MouseButtonUtils.fromScanCode(other.scanCode) === this.button;
		}
	}

	public getHashCode(): string {
		const ctrl = this.ctrlKey ? '1' : '0';
		const shift = this.shiftKey ? '1' : '0';
		const alt = this.altKey ? '1' : '0';
		const meta = this.metaKey ? '1' : '0';
		return `${ctrl}${shift}${alt}${meta}${this.button}`;
	}
}

export class ResolvedSelectionBinding extends ResolvedKeybinding {

	private readonly _os: OperatingSystem;
	private readonly _binding: SelectionBinding;

	constructor(os: OperatingSystem, binding: SelectionBinding) {
		super();
		this._os = os;
		this._binding = binding;
	}

	public getLabel(): string | null {
		return UiSelectionPrefix + UILabelProvider.toLabel(this._os, [this._binding], (binding) => MouseButtonUtils.toString(binding.button));
	}

	public getAriaLabel(): string | null {
		return AriaSelectionPrefix + AriaLabelProvider.toLabel(this._os, [this._binding], (binding) => MouseButtonUtils.toAriaString(binding.button));
	}

	public getElectronAccelerator(): string | null {
		// Mouse buttons can not be represented using electron accelerators
		return null;
	}

	public getUserSettingsLabel(): string | null {
		return UserSettingsSelectionPrefix + UserSettingsLabelProvider.toLabel(this._os, [this._binding], (binding) => MouseButtonUtils.toUserSettingsString(binding.button));
	}

	public isWYSIWYG(): boolean {
		return UserSettingsSelectionPrefix === UiSelectionPrefix;
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
			true
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
