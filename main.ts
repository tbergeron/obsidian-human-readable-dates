import { Plugin, PluginSettingTab, App, Setting, MarkdownView } from 'obsidian'
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'

interface HumanReadableDatesSettings {
	dateFormat: string;
}

const DEFAULT_SETTINGS: HumanReadableDatesSettings = {
	dateFormat: 'ddd MMM DD YYYY HH:mm'
}

class HumanReadableDateWidget extends WidgetType {
	constructor(
		private originalText: string, 
		private humanReadable: string, 
		private isLink: boolean = false
	) {
		super();
	}

	toDOM() {
		const span = document.createElement('span');
		span.className = 'human-readable-date';
		span.title = `Original: ${this.originalText}`;
		span.style.cursor = 'text';
		
		if (this.isLink) {
			span.textContent = this.humanReadable;
			span.style.color = 'var(--link-color)';
			span.style.textDecoration = 'underline';
		} else {
			span.textContent = this.humanReadable;
			span.style.color = 'var(--text-accent)';
			span.style.fontStyle = 'italic';
		}
		
		return span;
	}
}

export default class HumanReadableDates extends Plugin {
	settings: HumanReadableDatesSettings;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new HumanReadableDatesSettingTab(this.app, this));

		// Register editor extension for live preview mode only
		this.registerEditorExtension([
			this.createLivePreviewExtension()
		]);
	}

	onunload() {
		// Plugin cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	createLivePreviewExtension() {
		const plugin = this;
		
		return ViewPlugin.fromClass(
			class {
				decorations: DecorationSet = Decoration.set([]);

				constructor(view: EditorView) {
					this.decorations = this.buildDecorations(view);
				}

				update(update: ViewUpdate) {
					if (update.docChanged || update.viewportChanged || update.selectionSet) {
						this.decorations = this.buildDecorations(update.view);
					}
				}

				buildDecorations(view: EditorView): DecorationSet {
					const decorations: any[] = [];
					const doc = view.state.doc;
					const text = doc.toString();
					const selection = view.state.selection.main;

					// Create regex for date matching
					const dateRegex = plugin.createDateRegex(plugin.settings.dateFormat);
					const bracketedDateRegex = plugin.createBracketedDateRegex(plugin.settings.dateFormat);

					// Process bracketed dates first
					let match;
					bracketedDateRegex.lastIndex = 0;
					while ((match = bracketedDateRegex.exec(text)) !== null) {
						const fullMatch = match[0];
						const dateString = match[1];
						const humanReadable = plugin.formatDateAsHumanReadable(dateString);

						if (humanReadable) {
							const from = match.index;
							const to = match.index + fullMatch.length;
							
							// Only show overlay if cursor is not within this range
							const cursorInRange = selection.from >= from && selection.from <= to;
							
							if (!cursorInRange) {
								decorations.push(
									Decoration.widget({
										widget: new HumanReadableDateWidget(fullMatch, humanReadable, true),
										side: 1
									}).range(from)
								);
								
								// Hide the original text
								decorations.push(
									Decoration.mark({
										attributes: { style: "opacity: 0; position: absolute; pointer-events: none;" }
									}).range(from, to)
								);
							}
						}
					}

					// Process regular dates
					const processedRanges: Array<{from: number, to: number}> = [];
					
					// Track bracketed date ranges to avoid overlaps
					bracketedDateRegex.lastIndex = 0;
					while ((match = bracketedDateRegex.exec(text)) !== null) {
						processedRanges.push({ from: match.index, to: match.index + match[0].length });
					}
					
					dateRegex.lastIndex = 0;
					while ((match = dateRegex.exec(text)) !== null) {
						const dateString = match[0];
						const from = match.index;
						const to = match.index + dateString.length;
						
						// Check if this range overlaps with any bracketed date
						const overlaps = processedRanges.some(range => 
							(from >= range.from && from < range.to) || 
							(to > range.from && to <= range.to) ||
							(from <= range.from && to >= range.to)
						);
						
						if (!overlaps) {
							const humanReadable = plugin.formatDateAsHumanReadable(dateString);
							if (humanReadable) {
								// Only show overlay if cursor is not within this range
								const cursorInRange = selection.from >= from && selection.from <= to;
								
								if (!cursorInRange) {
									decorations.push(
										Decoration.widget({
											widget: new HumanReadableDateWidget(dateString, humanReadable, false),
											side: 1
										}).range(from)
									);
									
									// Hide the original text
									decorations.push(
										Decoration.mark({
											attributes: { style: "opacity: 0; position: absolute; pointer-events: none;" }
										}).range(from, to)
									);
								}
							}
						}
					}

					return Decoration.set(decorations.sort((a: any, b: any) => a.from - b.from));
				}
			},
			{
				decorations: (v: any) => v.decorations,
			}
		);
	}

	createDateRegex(format: string): RegExp {
		// Convert the format string to a regex pattern
		// Default format: ddd MMM DD YYYY HH:mm -> Fri Aug 29 2025 19:28
		const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		
		const dayPattern = `(${dayNames.join('|')})`;
		const monthPattern = `(${monthNames.join('|')})`;
		const dayOfMonthPattern = '(\\d{1,2})';
		const yearPattern = '(\\d{4})';
		const timePattern = '(?:\\s+(\\d{1,2}):(\\d{2}))?'; // Optional time part
		
		const pattern = `${dayPattern}\\s+${monthPattern}\\s+${dayOfMonthPattern}\\s+${yearPattern}${timePattern}`;
		
		return new RegExp(pattern, 'g');
	}

	createBracketedDateRegex(format: string): RegExp {
		// Create regex for dates in square brackets [[date]]
		const datePattern = this.createDateRegex(format).source;
		// Remove the 'g' flag from the source pattern and wrap in brackets
		const bracketedPattern = `\\[\\[(${datePattern})\\]\\]`;
		return new RegExp(bracketedPattern, 'g');
	}

	formatDateAsHumanReadable(dateString: string): string | null {
		const parsedDate = this.parseDateString(dateString, this.settings.dateFormat);
		if (!parsedDate) {
			return null;
		}

		const now = new Date();
		const diffMs = parsedDate.getTime() - now.getTime();
		const diffHours = diffMs / (1000 * 60 * 60);
		
		// Better day calculation - compare dates at midnight to avoid timezone issues
		const parsedDateMidnight = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
		const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const diffDays = Math.round((parsedDateMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));
		
		const absDiffDays = Math.abs(diffDays);
		const absDiffHours = Math.abs(diffHours);

		let result: string;

		// Check if the date has time component (not just midnight)
		const hasTimeComponent = parsedDate.getHours() !== 0 || parsedDate.getMinutes() !== 0;

		// For dates with time components within 24 hours, show precise time
		if (hasTimeComponent && absDiffHours < 24) {
			const diffMinutes = diffMs / (1000 * 60);
			const absDiffMinutes = Math.abs(diffMinutes);
			
			if (absDiffMinutes < 5) {
				result = 'Now'; // Less than 5 minutes
			} else if (absDiffMinutes < 60) {
				const minutesDiff = Math.round(absDiffMinutes);
				if (diffMinutes < 0) {
					result = minutesDiff === 1 ? '1 min ago' : `${minutesDiff} mins ago`;
				} else {
					result = minutesDiff === 1 ? 'In 1 min' : `In ${minutesDiff} mins`;
				}
			} else {
				const hoursDiff = Math.round(absDiffHours);
				if (diffHours < 0) {
					result = hoursDiff === 1 ? '1 hour ago' : `${hoursDiff} hours ago`;
				} else {
					result = hoursDiff === 1 ? 'In 1 hour' : `In ${hoursDiff} hours`;
				}
			}
		} else if (diffDays === 0) {
			result = 'Today';
		} else if (diffDays === 1) {
			result = 'Tomorrow';
		} else if (diffDays === -1) {
			result = 'Yesterday';
		} else if (diffDays > 1 && diffDays <= 7) {
			result = `In ${diffDays} days`;
		} else if (diffDays < -1 && diffDays >= -7) {
			result = `${absDiffDays} days ago`;
		} else if (diffDays > 7 && diffDays <= 14) {
			result = 'Next week';
		} else if (diffDays < -7 && diffDays >= -14) {
			result = 'Last week';
		} else if (diffDays > 14 && diffDays <= 30) {
			const weeks = Math.ceil(diffDays / 7);
			result = `In ${weeks} weeks`;
		} else if (diffDays < -14 && diffDays >= -30) {
			const weeks = Math.ceil(absDiffDays / 7);
			result = `${weeks} weeks ago`;
		} else if (diffDays > 30 && diffDays <= 365) {
			const months = Math.ceil(diffDays / 30);
			result = months === 1 ? 'Next month' : `In ${months} months`;
		} else if (diffDays < -30 && diffDays >= -365) {
			const months = Math.ceil(absDiffDays / 30);
			result = months === 1 ? 'Last month' : `${months} months ago`;
		} else if (diffDays > 365) {
			const years = Math.ceil(diffDays / 365);
			result = years === 1 ? 'Next year' : `In ${years} years`;
		} else {
			const years = Math.ceil(absDiffDays / 365);
			result = years === 1 ? 'Last year' : `${years} years ago`;
		}

		return result;
	}

	parseDateString(dateString: string, format: string): Date | null {
		// Use the same regex as createDateRegex but without global flag
		const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		
		const dayPattern = `(${dayNames.join('|')})`;
		const monthPattern = `(${monthNames.join('|')})`;
		const dayOfMonthPattern = '(\\d{1,2})';
		const yearPattern = '(\\d{4})';
		const timePattern = '(?:\\s+(\\d{1,2}):(\\d{2}))?'; // Optional time part
		
		const pattern = `${dayPattern}\\s+${monthPattern}\\s+${dayOfMonthPattern}\\s+${yearPattern}${timePattern}`;
		const regex = new RegExp(pattern);
		
		const match = dateString.match(regex);
		if (!match) {
			return null;
		}

		const [, , monthName, dayStr, yearStr, hourStr, minuteStr] = match;
		
		const monthIndex = monthNames.indexOf(monthName);
		if (monthIndex === -1) {
			return null;
		}

		const day = parseInt(dayStr, 10);
		const year = parseInt(yearStr, 10);
		const hour = hourStr ? parseInt(hourStr, 10) : 0; // Default to midnight if no time
		const minute = minuteStr ? parseInt(minuteStr, 10) : 0;

		return new Date(year, monthIndex, day, hour, minute);
	}
}

class HumanReadableDatesSettingTab extends PluginSettingTab {
	plugin: HumanReadableDates;

	constructor(app: App, plugin: HumanReadableDates) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Human Readable Dates Settings'});

		new Setting(containerEl)
			.setName('Date format')
			.setDesc('The format of dates to look for and replace. Use standard format tokens.')
			.addText(text => text
				.setPlaceholder('ddd MMM DD YYYY HH:mm')
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('p', {
			text: 'Examples of supported formats:',
			cls: 'setting-item-description'
		});
		
		const examplesList = containerEl.createEl('ul', {
			cls: 'setting-item-description'
		});
		
		examplesList.createEl('li', {text: 'Fri Aug 29 2025 19:20 (with time)'});
		examplesList.createEl('li', {text: 'Fri Aug 29 2025 (without time)'});
		examplesList.createEl('li', {text: '[[Fri Aug 29 2025]] (in square brackets)'});
		
		containerEl.createEl('p', {
			text: 'Note: This plugin only works in Live Preview mode. Dates will show as human-readable text (e.g., "Yesterday", "Tomorrow") but revert to original format when you move your cursor over them for editing.',
			cls: 'setting-item-description'
		});
	}
}
