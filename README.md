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

### Examples

| Original Date | Display |
|---------------|---------|
| `Fri Aug 29 2025 14:55` (5 mins ago) | `5 mins ago` |
| `Fri Aug 29 2025 12:00` (2 hours ago) | `2 hours ago` |
| `Thu Aug 28 2025` (yesterday) | `Yesterday` |
| `Sat Aug 30 2025` (tomorrow) | `Tomorrow` |
| `[[Sun Aug 31 2025]]` (in 2 days) | `In 2 days` |

### Editing

Simply move your cursor over any transformed date to reveal the original text for editing. The human-readable display will automatically return when you move the cursor away.

## Settings

- **Date format**: Configure the date format to match your needs (default: `ddd MMM DD YYYY HH:mm`)

## Installation

### Manual installation

Unzip the [latest release](https://github.com/tbergeron/obsidian-human-readable-dates/releases/latest) into your `<vault>/.obsidian/plugins/` folder.

## Requirements

- Obsidian v0.15.0+
- Live Preview mode

## License

MIT License
