# jxscout-vscode

A VSCode extension for integrating with [jxscout](https://github.com/herraristotle/jxscout), a tool that automatically saves JS files and extracts relevant code.

## Features

- Visualize references to behavior interesting for security researchers
- Copy paths, query parameters, and hostnames for brute forcing
- Project scope: browse every analyzed file and expand into its descriptors
- File Explorer view: assets related to the focused file
- Findings view (severity filter) and Bookmarks view, backed by the jxscout REST API
- Match state per workspace: cycle `all` / `unseen` / `interesting`, mark interesting, reset

Roadmap: explicit visualization of relationships between HTML, JS and Source Maps.

## Demo

https://github.com/user-attachments/assets/b32294ff-8942-46eb-9033-2e2632818787

## Installation

1. Download the latest `.vsix` file from the [releases](https://github.com/herraristotle/jxscout-vscode/releases) page
2. In VSCode, open the extensions sidebar menu
3. Click the three dots at the top and select "Install from VSIX..."
4. Select the `.vsix` file you just downloaded

![install](./docs/install.png)

## Configuration

The extension can be configured through VSCode settings:

| Setting              | Description                              | Default     |
| -------------------- | ---------------------------------------- | ----------- |
| `jxscout.serverHost` | Hostname of the jxscout server           | `localhost` |
| `jxscout.serverPort` | Port of the jxscout server               | `3333`      |
| `jxscout.apiToken`   | Optional bearer token for the HTTP API   | (empty)     |

## Usage

1. Open a JavaScript file in VSCode
2. The extension will automatically connect to the jxscout server and request analysis
3. Analysis results will be displayed in the jxscout Analysis panel

## Requirements

- A running jxscout server (version >=0.7.0)

## Development

```bash
npm install
npm run compile   # typecheck + lint + bundle
npm test          # unit tests (node:test, no extra deps)
npm run package   # production bundle
```

## Contributing

Feel free to leave suggestions and open pull requests - all contributions are welcome!

## Support

Happy hunting! 🐛 If jxscout helped you find cool bugs, [consider buying me a coffee](https://ko-fi.com/francisconeves97)! ☕

## License

This project is licensed under the GNU General Public License. See the COPYING file for the full license text.
