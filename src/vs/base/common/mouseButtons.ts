/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, ResolvedKeybinding } from 'vs/base/common/keyCodes';

export const enum MouseButton {
	Left = 0,
	Middle,
	Right
}

/**
 * The prefix used in keybindings.json for selection bindings in order to distinguish them from regular bindings.
 */
export const SELECTION_SHORTCUT_PREFIX = 'SEL';

const strToButton: { [key: string]: MouseButton } = { 'LMB': MouseButton.Left, 'MMB': MouseButton.Middle, 'RMB': MouseButton.Right };
const buttonToStr = ['LMB', 'MMB', 'RMB'];

export namespace MouseButtonUtils {
	export function toString(button: MouseButton): string {
		return buttonToStr[button];
	}
	export function fromString(button: string): MouseButton {
		return strToButton[button];
	}

	export function toKeyCode(button: MouseButton): KeyCode {
		return button + KeyCode.MOUSE_LEFT;
	}
	export function fromKeyCode(key: KeyCode): MouseButton {
		return key - KeyCode.MOUSE_LEFT;
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

	public equals(other: SelectionBinding): boolean {
		return (
			this.ctrlKey === other.ctrlKey
			&& this.shiftKey === other.shiftKey
			&& this.altKey === other.altKey
			&& this.metaKey === other.metaKey
			&& this.button === other.button
		);
	}

	public getHashCode(): string {
		const ctrl = this.ctrlKey ? '1' : '0';
		const shift = this.shiftKey ? '1' : '0';
		const alt = this.altKey ? '1' : '0';
		const meta = this.metaKey ? '1' : '0';
		return `${ctrl}${shift}${alt}${meta}${this.button}`;
	}
}
