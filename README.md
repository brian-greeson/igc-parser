# IGC parser

### Utility to parse tracklogs and metadata from igc files.

Find it on [JSR](https://jsr.io/@brian-greeson/igc-parser)

### Usage

#### Deno

Import from jsr:

```Bash
deno add jsr:@brian-greeson/igc-parser
```

Provide a filepath to an IGC file.

```Typescript
import { igcParser } from '@brian-greeson/igc-parser';
const igcData = igcParser({ filepath: "./path/to/igc/file.igc" });
console.log(igcData)
```

Or provide the string contents of the file directly.

```Typescript
import { igcParser } from "@brian-greeson/igc-parser";
const igcString = await Deno.readTextFile("./path/to/igc/file.igc");
const igcData = igcParser({ igcString });
```

> [!NOTE]
> If you provide both a string and path, the parser will ignore the string and read directly from the file

The library outputs the header data, collection of track point objects, and a geoJSON line feature.

```Typescript
import { igcParser } from "@brian-greeson/igc-parser";
const igcString = await Deno.readTextFile("./path/to/igc/file.igc");

const igcData = await igcParser({ igcString });

const { metadata, trackPoints } = igcData;
console.log("metadata:", metadata);
console.log("trackPoints:", trackPoints);
console.log("geoJSON:", geoJSON)

```
