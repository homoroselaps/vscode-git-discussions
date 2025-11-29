<!-- @format -->

# Resources

This directory contains static resources for the VSCodeDiscuss extension.

## Structure

```
resources/
├── icons/           # Extension icons and images
│   ├── icon.png            # Extension marketplace icon (128x128)
│   ├── icon-dark.svg       # Dark theme icons
│   └── icon-light.svg      # Light theme icons
├── themes/          # Color themes (if applicable)
├── snippets/        # Code snippets (if applicable)
└── templates/       # File templates (if applicable)
```

## Icon Guidelines

### Extension Icon (`icon.png`)

- Size: 128x128 pixels
- Format: PNG with transparency
- High contrast for visibility
- Works on both light and dark backgrounds
- Referenced in `package.json`

### Theme Icons

- Provide SVG icons when possible
- Support both light and dark themes
- Follow VS Code icon guidelines
- Use appropriate sizes for context

## Naming Conventions

- Use kebab-case for filenames
- Be descriptive: `command-icon.svg` not `icon1.svg`
- Include theme suffix: `-dark.svg`, `-light.svg`
- Use appropriate file extensions

## Best Practices

- Optimize images for size
- Use SVG for scalable graphics
- Provide retina versions if using PNG
- Test icons in both themes
- Follow VS Code design guidelines
