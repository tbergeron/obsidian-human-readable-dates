import { moment, Plugin, PluginSettingTab, App, Setting } from 'obsidian'
import { Range } from '@codemirror/state'
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'

interface HumanReadableDatesSettings {
	dateFormat: string;
}

const DEFAULT_SETTINGS: HumanReadableDatesSettings = {
	dateFormat: 'ddd MMM DD YYYY HH:mm'
}

/**
 * Strip Obsidian [[wikilink]] brackets from a string and return the link target
 * (the part before any `|` alias separator).
 *
 * Examples:
 *   "[[date]]"          → "date"
 *   "[[target|alias]]"  → "target"
 *   "plain"             → "plain"
 */
function stripWikilinkBrackets(text: string): string {
	const inner = text.startsWith('[[') && text.endsWith(']]')
		? text.slice(2, -2)
		: text;
	return inner.split('|')[0];
}

class HumanReadableDateWidget extends WidgetType {
	constructor(
		private originalText: string,
		private humanReadable: string,
		private isLink: boolean = false,
		private app?: App,
		private linkTarget?: string
	) {
		super();
	}

	toDOM(view: EditorView) {
		const doc = view.dom.ownerDocument;
		if (this.isLink && this.app) {
			const link = doc.createElement('a');
			link.className = 'human-readable-date human-readable-date-link';
			link.textContent = this.humanReadable;
			link.title = `Original: ${this.originalText}`;

			const target = this.linkTarget ?? stripWikilinkBrackets(this.originalText);

			link.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				void this.app?.workspace.openLinkText(target, '', false);
			});

			return link;
		} else {
			const span = doc.createElement('span');
			span.className = 'human-readable-date human-readable-date-plain';
			span.title = `Original: ${this.originalText}`;
			span.textContent = this.humanReadable;

			return span;
		}
	}
}

// Legacy format where trailing HH:mm is treated as optional for backward
// compatibility. The original plugin allowed "Thu Aug 28 2025" (no time) to
// match the default format. Only this exact format string gets the optional
// time treatment; other formats with HH:mm require the time component.
const LEGACY_OPTIONAL_TIME_FORMAT = 'ddd MMM DD YYYY HH:mm'
const LEGACY_OPTIONAL_TIME_FORMAT_NO_TIME = 'ddd MMM DD YYYY'

interface CompiledDateFormat {
	/** Regex source for candidate detection (no flags, no boundaries) */
	source: string
}

const dateFormatCache = new Map<string, CompiledDateFormat>()

// Moment-style tokens mapped to permissive detection regex patterns.
// Ordered longest-first so the scanner matches multi-char tokens before
// their single-char prefixes (e.g. MMMM before MMM before MM before M).
// Covers the commonly-used tokens; exotic Moment tokens not listed here
// will be treated as literal separator characters (harmless but unmatched).
const TOKEN_PATTERNS: Array<{ token: string; pattern: string }> = [
	// 4-char
	{ token: 'YYYY', pattern: '\\d{4}' },
	{ token: 'MMMM', pattern: '[A-Za-z]+' },
	{ token: 'dddd', pattern: '[A-Za-z]+' },
	// 3-char
	{ token: 'MMM', pattern: '[A-Za-z]+' },
	{ token: 'ddd', pattern: '[A-Za-z]+' },
	{ token: 'SSS', pattern: '\\d{3}' },
	// 2-char
	{ token: 'YY', pattern: '\\d{2}' },
	{ token: 'MM', pattern: '\\d{2}' },
	{ token: 'DD', pattern: '\\d{2}' },
	{ token: 'dd', pattern: '[A-Za-z]{2}' },
	{ token: 'HH', pattern: '\\d{2}' },
	{ token: 'hh', pattern: '\\d{2}' },
	{ token: 'mm', pattern: '\\d{2}' },
	{ token: 'ss', pattern: '\\d{2}' },
	{ token: 'ZZ', pattern: '[+-]\\d{4}' },
	// 1-char
	{ token: 'M', pattern: '\\d{1,2}' },
	{ token: 'D', pattern: '\\d{1,2}' },
	{ token: 'd', pattern: '\\d' },
	{ token: 'H', pattern: '\\d{1,2}' },
	{ token: 'h', pattern: '\\d{1,2}' },
	{ token: 'm', pattern: '\\d{1,2}' },
	{ token: 's', pattern: '\\d{1,2}' },
	{ token: 'Z', pattern: '[+-]\\d{2}:\\d{2}' },
	{ token: 'A', pattern: 'AM|PM' },
	{ token: 'a', pattern: 'am|pm' },
]

/**
 * Compile a Moment format string into a permissive regex source for candidate
 * detection. The regex is deliberately loose — strict validation is deferred to
 * Moment's `moment(candidate, format, true)` in `parseDateString`.
 *
 * Supports:
 *   - All tokens listed in TOKEN_PATTERNS
 *   - Bracket literals [...]
 *   - Unknown characters are treated as regex-escaped literals
 *
 * Returns null when zero recognized tokens are found.
 */
function compileDateFormat(format: string): CompiledDateFormat | null {
	let source = ''
	let i = 0
	let tokenCount = 0

	while (i < format.length) {
		// Bracket literal: [escaped text]
		if (format[i] === '[') {
			const close = format.indexOf(']', i + 1)
			const literal = close === -1 ? format.slice(i + 1) : format.slice(i + 1, close)
			source += literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			i = close === -1 ? format.length : close + 1
			continue
		}

		// Try known tokens (longest match first)
		const rest = format.slice(i)
		let matched = false
		for (const { token, pattern } of TOKEN_PATTERNS) {
			if (rest.startsWith(token)) {
				source += pattern
				i += token.length
				matched = true
				tokenCount++
				break
			}
		}
		if (matched) continue

		// Unknown character — escape and treat as literal separator
		source += format[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		i++
	}

	if (tokenCount === 0) return null

	// Legacy exception: make trailing " HH:mm" optional so dates without
	// time (e.g. "Thu Aug 28 2025") still produce candidate matches.
	if (format === LEGACY_OPTIONAL_TIME_FORMAT) {
		const timeMarker = '\\d{2}:\\d{2}'
		const timeIdx = source.lastIndexOf(timeMarker)
		if (timeIdx !== -1) {
			const sepIdx = source.lastIndexOf(' ', timeIdx - 1)
			if (sepIdx !== -1) {
				source = source.slice(0, sepIdx) + '(?:' + source.slice(sepIdx) + ')?'
			}
		}
	}

	return { source }
}

function getCachedCompiledFormat(format: string): CompiledDateFormat | null {
	let compiled: CompiledDateFormat | null | undefined = dateFormatCache.get(format)
	if (!compiled) {
		compiled = compileDateFormat(format)
		if (compiled) {
			dateFormatCache.set(format, compiled)
		}
	}
	return compiled ?? null
}

function createDateRegex(format: string): RegExp | null {
	const compiled = getCachedCompiledFormat(format)
	if (!compiled) return null
	return new RegExp('\\b' + compiled.source + '\\b', 'g')
}

function createBracketedDateRegex(format: string): RegExp | null {
	// Still validate that the format is compilable
	const compiled = getCachedCompiledFormat(format)
	if (!compiled) return null
	// Match [[target]] or [[target|alias]] — date validation is done in buildDecorations
	return new RegExp('\\[\\[([^|\\]]+)(?:\\|([^\\[\\]]+))?\\]\\]', 'g')
}

/**
 * Parse a candidate date string using Moment strict mode.
 * Returns a Date if valid and finite, null otherwise.
 *
 * The detection regex (createDateRegex) is permissive — this function is
 * the gate that rejects non-dates and invalid dates like 2026-02-31.
 *
 * Legacy exception: the default format "ddd MMM DD YYYY HH:mm" also
 * accepts dates without the time component.
 */
function parseDateString(dateString: string, format: string): Date | null {
	// Strict Moment parsing — third argument `true` enables strict mode
	const m = moment(dateString, format, true)
	if (m.isValid()) {
		const d = m.toDate()
		if (Number.isFinite(d.getTime())) return d
	}

	// Legacy exception: if the full format fails and this is the legacy
	// default format, try without the time component.
	if (format === LEGACY_OPTIONAL_TIME_FORMAT) {
		const mFallback = moment(dateString, LEGACY_OPTIONAL_TIME_FORMAT_NO_TIME, true)
		if (mFallback.isValid()) {
			const d = mFallback.toDate()
			if (Number.isFinite(d.getTime())) return d
		}
	}

	return null
}

function formatDateAsHumanReadable(dateString: string, format: string): string | null {
	const parsedDate = parseDateString(dateString, format);
	if (!parsedDate) {
		return null;
	}

	const now = new Date();
	const diffMs = parsedDate.getTime() - now.getTime();
	const diffHours = diffMs / (1000 * 60 * 60);

	const parsedDateMidnight = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
	const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const diffDays = Math.round((parsedDateMidnight.getTime() - nowMidnight.getTime()) / (1000 * 60 * 60 * 24));

	const absDiffDays = Math.abs(diffDays);
	const absDiffHours = Math.abs(diffHours);

	let result: string;

	const hasTimeComponent = parsedDate.getHours() !== 0 || parsedDate.getMinutes() !== 0;

	if (hasTimeComponent && absDiffHours < 24) {
		const diffMinutes = diffMs / (1000 * 60);
		const absDiffMinutes = Math.abs(diffMinutes);

		if (absDiffMinutes < 5) {
			result = 'Now';
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

export default class HumanReadableDates extends Plugin {
	settings: HumanReadableDatesSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new HumanReadableDatesSettingTab(this.app, this));

		this.registerEditorExtension([
			this.createLivePreviewExtension()
		]);
	}

	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as HumanReadableDatesSettings);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refreshDecorations()
	}

	refreshDecorations() {
		window.requestAnimationFrame(() => {
			this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
				const view = leaf.view as { editor?: { cm?: EditorView } } | null
				if (view?.editor?.cm) {
					view.editor.cm.dispatch({
						selection: view.editor.cm.state.selection,
						scrollIntoView: false
					})
				}
			})
		})
	}

	createLivePreviewExtension() {
		const settings = this.settings
		const app = this.app

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
					const decorations: Range<Decoration>[] = [];
					const doc = view.state.doc;
					const text = doc.toString();
					const selection = view.state.selection.main;

					const format = settings.dateFormat

					const dateRegex = createDateRegex(format);
					const bracketedDateRegex = createBracketedDateRegex(format);

					if (!dateRegex || !bracketedDateRegex) {
						return Decoration.set([])
					}

					const processedRanges: Array<{from: number, to: number}> = [];

					let match;
					bracketedDateRegex.lastIndex = 0;
					while ((match = bracketedDateRegex.exec(text)) !== null) {
						const fullMatch = match[0];
						const target = match[1];
						const alias = match[2];
						const from = match.index
						const to = from + fullMatch.length

						processedRanges.push({ from, to })

						// Determine date string: prefer alias, fall back to target
						let humanReadable: string | null = null;
						if (alias) {
							humanReadable = formatDateAsHumanReadable(alias, format);
						}
						if (!humanReadable) {
							humanReadable = formatDateAsHumanReadable(target, format);
						}

						if (humanReadable) {
							const cursorInRange = selection.from >= from && selection.from <= to;

							if (!cursorInRange) {
								decorations.push(
									Decoration.widget({
										widget: new HumanReadableDateWidget(fullMatch, humanReadable, true, app, target),
										side: 1
									}).range(from)
								);

								decorations.push(
									Decoration.mark({
										attributes: { style: "opacity: 0; position: absolute; pointer-events: none;" }
									}).range(from, to)
								);
							}
						}
					}

					dateRegex.lastIndex = 0;
					while ((match = dateRegex.exec(text)) !== null) {
						const dateString = match[0];
						const from = match.index;
						const to = match.index + dateString.length;

						const overlaps = processedRanges.some(range =>
							(from >= range.from && from < range.to) ||
							(to > range.from && to <= range.to) ||
							(from <= range.from && to >= range.to)
						);

						if (!overlaps) {
							const humanReadable = formatDateAsHumanReadable(dateString, format);
							if (humanReadable) {
								const cursorInRange = selection.from >= from && selection.from <= to;

								if (!cursorInRange) {
									decorations.push(
										Decoration.widget({
											widget: new HumanReadableDateWidget(dateString, humanReadable, false, app),
											side: 1
										}).range(from)
									);

									decorations.push(
										Decoration.mark({
											attributes: { style: "opacity: 0; position: absolute; pointer-events: none;" }
										}).range(from, to)
									);
								}
							}
						}
					}

					return Decoration.set(decorations.sort((a, b) => a.from - b.from));
				}
			},
			{
				decorations: (v) => v.decorations,
			}
		);
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

		new Setting(containerEl)
			.setName('Date format')
			.setDesc('Moment-style format tokens are supported. Use square brackets around literal text for brackets in the output.')
			.addText(text => text
				.setValue(this.plugin.settings.dateFormat)
				.onChange(async (value) => {
					this.plugin.settings.dateFormat = value
					await this.plugin.saveSettings()
					this.updateFormatWarning(value)
				}))

		this.formatWarningEl = containerEl.createDiv({
			cls: 'setting-item-description'
		})
		this.updateFormatWarning(this.plugin.settings.dateFormat)

		containerEl.createEl('p', {
			text: 'This plugin only works in live preview mode. Dates show as human-readable text but revert to the original format when you move your cursor over them for editing.',
			cls: 'setting-item-description'
		});
	}

	private formatWarningEl?: HTMLElement

	private updateFormatWarning(format: string): void {
		if (!this.formatWarningEl) return
		if (!format || format.trim().length === 0) {
			this.formatWarningEl.setText('The date format is empty. No dates will be detected.')
			return
		}
		const compiled = compileDateFormat(format)
		if (!compiled) {
			this.formatWarningEl.setText('No recognized date tokens found. Use year, month, day, weekday, hour, or minute tokens.')
		} else {
			this.formatWarningEl.setText('')
		}
	}
}
