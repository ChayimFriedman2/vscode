/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Keybinding, KeyCode, ResolvedKeybinding, JSONKey } from 'vs/base/common/keyCodes';
import { IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IResolveResult } from 'vs/platform/keybinding/common/keybindingResolver';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { MouseBinding, MouseButton, SelectionBinding } from 'vs/base/common/mouseButtons';

export interface IUserFriendlyKeybinding {
	key: JSONKey;
	command: string;
	args?: any;
	when?: string;
}

export const enum KeybindingSource {
	Default = 1,
	User
}

export interface IKeybindingEvent {
	source: KeybindingSource;
	keybindings?: IUserFriendlyKeybinding[];
}

export interface IKeyboardEvent {
	readonly _standardKeyboardEventBrand: true;

	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly keyCode: KeyCode;
	readonly code: string;
}

export interface IMouseEvent {
	readonly ctrlKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly button: MouseButton;
	readonly target: IContextKeyServiceTarget;
}

export interface KeybindingsSchemaContribution {
	readonly onDidChange?: Event<void>;

	getSchemaAdditions(): IJSONSchema[];
}

export const IKeybindingService = createDecorator<IKeybindingService>('keybindingService');

export interface IEditorMouseEvent extends IMouseEvent {
	position: { lineNumber: number; column: number; };
	times: number;
}

export interface IKeybindingService {
	_serviceBrand: undefined;

	readonly inChordMode: boolean;

	onDidUpdateKeybindings: Event<IKeybindingEvent>;

	/**
	 * Returns none, one or many (depending on keyboard layout)!
	 */
	resolveKeybinding(keybinding: Keybinding | MouseBinding | SelectionBinding): ResolvedKeybinding[];

	/**
	 * @returns true if a selection shortcut was reached. In that case, either completeSelection() or cancelSelection() should be called after.
	 */
	onEditorMouseDown(mouseEvent: IMouseEvent): boolean;

	/**
	 * Finishes the selection shortcut and executes the bound command.
	 * @returns Promise that will be resolved when the command execution is done.
	 */
	completeSelection(): Promise<void>;

	/**
	 * Finishes the selection shortcut without executing the bound command.
	 * Called for example when a key was pressed while selecting.
	 */
	cancelSelection(): void;

	/**
	 * Called in mouseup event if the event did not finish a selection - i.e. no selection, just mouse up.
	 */
	onEditorMouseUp(mouseEvent: IEditorMouseEvent): void;

	resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding;

	resolveUserBinding(userBinding: JSONKey): ResolvedKeybinding[];

	/**
	 * Resolve and dispatch `keyboardEvent` and invoke the command.
	 */
	dispatchEvent(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean;

	/**
	 * Resolve and dispatch `keyboardEvent`, but do not invoke the command or change inner state.
	 */
	softDispatch(keyboardEvent: IKeyboardEvent, target: IContextKeyServiceTarget): IResolveResult | null;

	dispatchByUserSettingsLabel(userSettingsLabel: string, target: IContextKeyServiceTarget): void;

	/**
	 * Look up keybindings for a command.
	 * Use `lookupKeybinding` if you are interested in the preferred keybinding.
	 */
	lookupKeybindings(commandId: string): ResolvedKeybinding[];

	/**
	 * Look up the preferred (last defined) keybinding for a command.
	 * @returns The preferred keybinding or null if the command is not bound.
	 */
	lookupKeybinding(commandId: string): ResolvedKeybinding | undefined;

	getDefaultKeybindingsContent(): string;

	getDefaultKeybindings(): readonly ResolvedKeybindingItem[];

	getKeybindings(): readonly ResolvedKeybindingItem[];

	customKeybindingsCount(): number;

	/**
	 * Will the given key event produce a character that's rendered on screen, e.g. in a
	 * text box. *Note* that the results of this function can be incorrect.
	 */
	mightProducePrintableCharacter(event: IKeyboardEvent): boolean;

	registerSchemaContribution(contribution: KeybindingsSchemaContribution): void;

	_dumpDebugInfo(): string;
	_dumpDebugInfoJSON(): string;
}

