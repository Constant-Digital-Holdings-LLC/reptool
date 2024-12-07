# reptool

**reptool** is a simple report processor for Ham.Live. It is designed to manage and merge reports efficiently.

## Features

- Merge multiple CSV reports into a single consolidated report.
- Sort reports by check-in date in descending order.
- Handle quoted fields with commas in CSV files.
- Generate binaries for Linux, Windows, and macOS (both x86_64 and ARM64).

## Usage

### Command Line Interface

```sh
reptool <command> <target>
```

### Available Commands

- `merge`: Merge multiple CSV reports into a single consolidated report.

### Example

```sh
reptool merge /path/to/reports (directory containing .csv files)
```

### Output

The merged report will be saved as `MERGED.csv` in the specified target directory.

## Installation

### From Source

1. Clone the repository:

```sh
git clone https://github.com/Constant-Digital-Holdings-LLC/reptool/tree/main
cd reptool
```

2. Build the binaries:

```sh
deno task build
```

3. The binaries will be available in the `dist` directory for Linux, Windows, and macOS.

### Pre-built Binaries

Download the pre-built binaries from the [releases](https://github.com/Constant-Digital-Holdings-LLC/reptool/tree/main/dist) page.

## License

This software is distributed under the MIT license with no warranty. Ham.Live has no liability for any damages, misuse, or bugs.

## Support

For support, please contact [support@ham.live](mailto:support@ham.live).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.
