# Key Font Generator (Ohm Keyboard)

A local, zero-dependency (other than `opentype.js`) web application for designing and generating SVG files for laser-engraving custom keycaps on the Ohm Keyboard.

## What is this?

This tool acts as a web-based CAD assistant specifically built to design the typography for a custom mechanical keyboard and export it into an engraver-ready format. It allows you to visualize what different Google Fonts look like on the physical layout of the split Ohm Keyboard, individually tweak the scale and offsets of each key's legend, and export the resulting text as pure SVG paths ready to be dropped into your engraving software.

## Features

- **Google Font Integration**: Type in any Google Font name and the tool will automatically attempt to load it and convert its glyphs to SVG paths. 
- **Keyboard Visualization**: Views your keycap labels superimposed directly onto the physical Ohm Keyboard layout, mathematically rotated and positioned according to real-world millimeter coordinates from Fusion 360.
- **Per-Key Customization**: Tweak font sizes, X/Y offsets, and case settings globally, or click on an individual key to fine-tune its position. 
- **Bulk Label Input**: Easily paste all 36 key labels in at once rather than typing them individually.
- **Engraver-Ready Export**: Generates a 6x6 grid SVG file configured for a 18.1mm pitch. All text is exported as raw SVG paths (using `opentype.js`) so that laser engraving machines can accurately trace them without needing the original font installed.

## Usage

1. Open `index.html` in your web browser.
2. In the **Font** section, enter a Google Font name (e.g., *Roboto*, *Inter*, *Comic Neue*) and click **Load**.
3. Use the **Layout** section to toggle standard QWERTY labels, or provide your own custom labels in the **Bulk Labels** box.
4. Click on an individual key in the center interface to edit its label or override the global text size and offsets.
5. Use the **Preview Grid** button to verify the final layout for your engraving bed.
6. Click **Export SVG** to download the final cut-ready file. 

## Technical Stack

- **Vanilla web stack**: Plain HTML, CSS, and JavaScript contained in a single `index.html` file.
- **Path Generation**: Uses [opentype.js](https://opentype.js.org/) to convert text directly into standard vector paths.

## Current LightBurn Workaround

The software uses google fonts, but not all google fonts are able to be exported as paths. To allow LightBurn to figure out paths, the current workaround is to open the exported SVG in a browser, and use Microsoft Print to PDF to save it as a PDF. Opening the PDF in LightBurn allows it to see the paths. 

Eventually, we will switch to using something like Balor or MeerK04t so that the app directly outputs a file that can be run on the laser engraver.
