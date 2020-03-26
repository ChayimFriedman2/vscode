/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { IntervalTimer } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode, Keybinding, ResolvedKeybinding, JSONKey } from 'vs/base/common/keyCodes';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService, IContextKeyServiceTarget } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingEvent, IKeybindingService, IKeyboardEvent, KeybindingsSchemaContribution, IEditorMouseEvent } from 'vs/platform/keybinding/common/keybinding';
import { IResolveResult, KeybindingResolver } from 'vs/platform/keybinding/common/keybindingResolver';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification } from 'vs/base/common/actions';
import { MouseBinding, ResolvedMouseBinding, SelectionBinding } from 'vs/base/common/mouseButtons';

interface CurrentChord {
	keypress: string;
	label: string | null;
}

export abstract class AbstractKeybindingService extends Disposable implements IKeybindingService {
	public _serviceBrand: undefined;

	protected readonly _onDidUpdateKeybindings: Emitter<IKeybindingEvent> = this._register(new Emitter<IKeybindingEvent>());
	get onDidUpdateKeybindings(): Event<IKeybindingEvent> {
		return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None; // Sinon stubbing walks properties on prototype
	}

	private _currentChord: CurrentChord | null;
	private _currentChordChecker: IntervalTimer;
	private _currentChordStatusMessage: IDisposable | null;

	/**
	 * Usually this is null. When started a selection shortcut it becomes the command to execute,
	 * and when finished we reset it again.
	 */
	private _selectionCommand: IResolveResult | null = null;

	public get inChordMode(): boolean {
		return !!this._currentChord;
	}

	constructor(
		private _contextKeyService: IContextKeyService,
		protected _commandService: ICommandService,
		protected _telemetryService: ITelemetryService,
		private _notificationService: INotificationService,
	) {
		super();

		this._currentChord = null;
		this._currentChordChecker = new IntervalTimer();
		this._currentChordStatusMessage = null;
	}

	public dispose(): void {
		super.dispose();
	}

	protected abstract _getResolver(): KeybindingResolver;
	protected abstract _documentHasFocus(): boolean;
	public abstract resolveKeybinding(keybinding: Keybinding | MouseBinding | SelectionBinding): ResolvedKeybinding[];
	public abstract resolveKeyboardEvent(keyboardEvent: IKeyboardEvent): ResolvedKeybinding;
	public abstract resolveUserBinding(userBinding: JSONKey): ResolvedKeybinding[];
	public abstract registerSchemaContribution(contribution: KeybindingsSchemaContribution): void;
	public abstract _dumpDebugInfo(): string;
	public abstract _dumpDebugInfoJSON(): string;

	public getDefaultKeybindingsContent(): string {
		return '';
	}

	public getDefaultKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._getResolver().getDefaultKeybindings();
	}

	public getKeybindings(): readonly ResolvedKeybindingItem[] {
		return this._getResolver().getKeybindings();
	}

	public customKeybindingsCount(): number {
		return 0;
	}

	public lookupKeybindings(commandId: string): ResolvedKeybinding[] {
		return arrays.coalesce(
			this._getResolver().lookupKeybindings(commandId).map(item => item.resolvedKeybinding)
		);
	}

	public lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
		const result = this._getResolver().lookupPrimaryKeybinding(commandId);
		if (!result) {
			return undefined;
		}
		return result.resolvedKeybinding;
	}

	public dispatchEvent(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._dispatch(e, target);
	}

	public softDispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): IResolveResult | null {
		const keybinding = this.resolveKeyboardEvent(e);
		if (keybinding.isChord()) {
			console.warn('Unexpected keyboard event mapped to a chord');
			return null;
		}
		const [firstPart,] = keybinding.getDispatchParts();
		if (firstPart === null) {
			// cannot be dispatched, probably only modifier keys
			return null;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const currentChord = this._currentChord ? this._currentChord.keypress : null;
		return this._getResolver().resolve(contextValue, currentChord, firstPart);
	}

	private _enterChordMode(firstPart: string, keypressLabel: string | null): void {
		this._currentChord = {
			keypress: firstPart,
			label: keypressLabel
		};
		this._currentChordStatusMessage = this._notificationService.status(nls.localize('first.chord', "({0}) was pressed. Waiting for second key of chord...", keypressLabel));
		const chordEnterTime = Date.now();
		this._currentChordChecker.cancelAndSet(() => {

			if (!this._documentHasFocus()) {
				// Focus has been lost => leave chord mode
				this._leaveChordMode();
				return;
			}

			if (Date.now() - chordEnterTime > 5000) {
				// 5 seconds elapsed => leave chord mode
				this._leaveChordMode();
			}

		}, 500);
	}

	private _leaveChordMode(): void {
		if (this._currentChordStatusMessage) {
			this._currentChordStatusMessage.dispose();
			this._currentChordStatusMessage = null;
		}
		this._currentChordChecker.cancel();
		this._currentChord = null;
	}

	public dispatchByUserSettingsLabel(userSettingsLabel: string, target: IContextKeyServiceTarget): void {
		const keybindings = this.resolveUserBinding(userSettingsLabel);
		if (keybindings.length >= 1) {
			this._doDispatch(keybindings[0], target);
		}
	}

	public onEditorMouseDown(mouseEvent: IEditorMouseEvent): boolean {
		const resolvedBinding = new ResolvedMouseBinding(new SelectionBinding(mouseEvent.ctrlKey, mouseEvent.shiftKey, mouseEvent.altKey, mouseEvent.metaKey, mouseEvent.button));
		this._selectionCommand = this._getCommand(resolvedBinding, mouseEvent.target);
		return this._selectionCommand !== null;
	}

	public completeSelection(): Promise<void> {
		const command = this._selectionCommand!;
		this._selectionCommand = null;
		return this._executeCommand(command);
	}

	public cancelSelection(): void {
		this._selectionCommand = null;
	}

	public onEditorMouseUp(mouseEvent: IEditorMouseEvent): void {
		const resolvedBinding = new ResolvedMouseBinding(new MouseBinding(mouseEvent.ctrlKey, mouseEvent.shiftKey, mouseEvent.altKey, mouseEvent.metaKey, mouseEvent.button, mouseEvent.times));
		const command = this._getCommand(resolvedBinding, mouseEvent.target);
		if (command) {
			// Use Object.create() instead of object literal so user has no access to Object's method
			const position = Object.create(null);
			position.lineNumber = mouseEvent.position.lineNumber;
			position.column = mouseEvent.position.column;
			this._executeCommand(command, { position });
		}
	}

	protected _dispatch(e: IKeyboardEvent, target: IContextKeyServiceTarget): boolean {
		return this._doDispatch(this.resolveKeyboardEvent(e), target);
	}

	private _getCommand(keybinding: ResolvedKeybinding, target: IContextKeyServiceTarget): IResolveResult | null {
		if (keybinding.isChord()) {
			console.warn('Unexpected keyboard event mapped to a chord');
			return null;
		}
		const [firstPart,] = keybinding.getDispatchParts();
		if (firstPart === null) {
			// cannot be dispatched, probably only modifier keys
			return null;
		}

		const contextValue = this._contextKeyService.getContext(target);
		const currentChord = this._currentChord ? this._currentChord.keypress : null;
		return this._getResolver().resolve(contextValue, currentChord, firstPart);
	}

	private _doDispatch(keybinding: ResolvedKeybinding, target: IContextKeyServiceTarget): boolean {
		let shouldPreventDefault = false;

		const keypressLabel = keybinding.getLabel();
		const resolveResult = this._getCommand(keybinding, target);

		if (resolveResult && resolveResult.enterChord) {
			shouldPreventDefault = true;
			this._enterChordMode(keybinding.getDispatchParts()[0]!, keypressLabel);
			return shouldPreventDefault;
		}

		if (this._currentChord) {
			if (!resolveResult || !resolveResult.commandId) {
				this._notificationService.status(nls.localize('missing.chord', "The key combination ({0}, {1}) is not a command.", this._currentChord.label, keypressLabel), { hideAfter: 10 * 1000 /* 10s */ });
				shouldPreventDefault = true;
			}
		}

		this._leaveChordMode();

		if (resolveResult && resolveResult.commandId) {
			if (!resolveResult.bubble) {
				shouldPreventDefault = true;
			}
			this._executeCommand(resolveResult);
		}

		return shouldPreventDefault;
	}

	/**
	 * Digs into an object and peeks up a property.
	 * @param obj The object to dig into.
	 * @param property A string specifies the property, using dot notation. Although array are not supported, you can simulate them using `array.index` syntax (e.g. `property.5.property` or `5.property`) because of JavaScript's array are objects.
	 * @throws {TypeError} If the property was not found.
	 */
	private static peekObjectProperty(obj: any, property: string): any {
		return property.split('.').reduce((obj: any, property: string) => obj[property], obj);
	}

	private static parseArg(commandArg: any, args: any): any {
		return (commandArg as string).replace(/\$\{(.*?)\}/g, (match: string, arg: string) => {
			return this.peekObjectProperty(args, arg);
		});
	}

	private static parseArgs(commandArgs: any, args: any): any {
		if (commandArgs === undefined) {
			return undefined;
		}
		if (args === undefined) {
			return commandArgs;
		}
		if (!Array.isArray(commandArgs)) {
			return this.parseArg(commandArgs, args);
		}
		return commandArgs.map(commandArg => this.parseArg(commandArg, args));
	}

	private _executeCommand(resolveResult: IResolveResult, args?: any): Promise<void> {
		let parsedArgs: any;
		try {
			parsedArgs = AbstractKeybindingService.parseArgs(resolveResult.commandArgs, args);
		} catch {
			this._notificationService.warn(nls.localize('invalidArg', "Invalid argument for command: property not found"));
			return Promise.resolve();
		}
		const commandId = resolveResult.commandId!;
		this._telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>('workbenchActionExecuted', { id: commandId, from: 'keybinding' });
		if (typeof parsedArgs === 'undefined') {
			return this._commandService.executeCommand(commandId).then(undefined, err => this._notificationService.warn(err));
		}
		else {
			return this._commandService.executeCommand(commandId, parsedArgs).then(undefined, err => this._notificationService.warn(err));
		}
	}

	mightProducePrintableCharacter(event: IKeyboardEvent): boolean {
		if (event.ctrlKey || event.metaKey) {
			// ignore ctrl/cmd-combination but not shift/alt-combinatios
			return false;
		}
		// weak check for certain ranges. this is properly implemented in a subclass
		// with access to the KeyboardMapperFactory.
		if ((event.keyCode >= KeyCode.KEY_A && event.keyCode <= KeyCode.KEY_Z)
			|| (event.keyCode >= KeyCode.KEY_0 && event.keyCode <= KeyCode.KEY_9)) {
			return true;
		}
		return false;
	}
}
