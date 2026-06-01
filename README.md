# Human Readable Dates

An Obsidian plugin that transforms dates into human-readable, relative formats (e.g., "Yesterday", "2 hours ago", "In 3 days") while preserving the original date strings in your notes. Only works in Live Preview mode with seamless cursor-based editing.

## Usage

The plugin automatically detects and transforms dates in the user specified format.

### Time Precision

The plugin shows different levels of precision based on how recent the date is:

- **Within 5 minutes**: "Now"
- **5-59 minutes**: "15 mins ago", "30 mins ago", "In 20 mins"
- **1-23 hours**: "2 hours ago", "5 hours ago", "In 8 hours"
- **Days**: "Yesterday", "Tomorrow", "3 days ago", "In 5 days"
- **Weeks**: "Last week", "Next week", "2 weeks ago"
- **Months**: "Last month", "Next month", "3 months ago"
- **Years**: "Last year", "Next year", "2 years ago"

### Supported Tokens

Configure a date format in settings using standard Moment.js format tokens:

| Token | Meaning | Example output |
|-------|---------|----------------|
| `YYYY` | Year, 4 digits | 2026 |
| `YY` | Year, 2 digits | 26 |
| `M` | Month, 1-2 digits | 1, 12 |
| `MM` | Month, 2 digits | 01, 12 |
| `MMM` | Short month name | Jan, Dec |
| `MMMM` | Full month name | January, December |
| `D` | Day of month, 1-2 digits | 5, 25 |
| `DD` | Day of month, 2 digits | 05, 25 |
| `d` | Day of week, number (Sun=0) | 0-6 |
| `dd` | Weekday abbreviation, 2 chars | Su, Sa |
| `ddd` | Short weekday name | Mon, Sun |
| `dddd` | Full weekday name | Monday, Sunday |
| `H` | Hour (24h), 1-2 digits | 5, 23 |
| `HH` | Hour (24h), 2 digits | 05, 23 |
| `h` | Hour (12h), 1-2 digits | 5, 11 |
| `hh` | Hour (12h), 2 digits | 05, 11 |
| `m` | Minute, 1-2 digits | 5, 59 |
| `mm` | Minute, 2 digits | 05, 59 |
| `s` | Second, 1-2 digits | 5, 59 |
| `ss` | Second, 2 digits | 05, 59 |
| `SSS` | Fractional second, 3 digits | 123 |
| `A` | AM/PM (uppercase) | AM, PM |
| `a` | am/pm (lowercase) | am, pm |
| `Z` | Timezone offset with colon | +05:30 |
| `ZZ` | Timezone offset without colon | +0530 |

Use bracket literals for escaped text: `[at]` matches the literal word "at".

Non-token characters (spaces, hyphens, colons, slashes, etc.) are treated as literal separators.

### Examples (default format: `ddd MMM DD YYYY HH:mm`)

| Original Date | Display |
|---------------|---------|
| `Fri Aug 29 2025 14:55` (5 mins ago) | `5 mins ago` |
| `Fri Aug 29 2025 12:00` (2 hours ago) | `2 hours ago` |
| `Thu Aug 28 2025` (yesterday) | `Yesterday` |
| `Sat Aug 30 2025` (tomorrow) | `Tomorrow` |
| `[[Sun Aug 31 2025]]` (in 2 days) | `In 2 days` |

### Examples (format: `YYYY-MM-DD`)

| Original Date | Display |
|---------------|---------|
| `2026-01-25` | Relative label |
| `[[2026-01-25]]` | Clickable relative label |

### Examples (custom formats)

| Format | Matches | Notes |
|--------|---------|-------|
| `M/D/YYYY` | 1/25/2026 | Compact US format |
| `YYYY-MM-DD HH:mm:ss` | 2026-01-25 14:30:00 | With seconds |
| `MMMM D, YYYY [at] h:mm A` | January 25, 2026 at 2:30 PM | With bracket literal |
| `DD-MMM-YY` | 25-Jan-26 | Compact with month name |

Invalid dates such as `2026-02-31` are ignored and left as-is.

### Editing

Simply move your cursor over any transformed date to reveal the original text for editing. The human-readable display will automatically return when you move the cursor away.

## Settings

- **Date format**: Configure the date format to match your needs (default: `ddd MMM DD YYYY HH:mm`). Uses standard Moment.js format tokens.

## Installation

### Manual installation

Unzip the [latest release](https://github.com/tbergeron/obsidian-human-readable-dates/releases/latest) into your `<vault>/.obsidian/plugins/` folder.

## Requirements

- Obsidian v0.15.0+
- Live Preview mode

## License

MIT License
