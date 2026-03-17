[English](../en/documentation-easter-egg.md) | [中文](../zh/documentation-easter-egg.md) | [繁體中文（香港）](../zh-hk/documentation-easter-egg.md) | [日本語](../ja/documentation-easter-egg.md) | [한국어](../ko/documentation-easter-egg.md) | [Français](../fr/documentation-easter-egg.md) | [Español](../es/documentation-easter-egg.md) | [Português](../pt/documentation-easter-egg.md) | [Deutsch](../de/documentation-easter-egg.md) | [Bahasa Melayu](../ms/documentation-easter-egg.md) | [தமிழ்](../ta/documentation-easter-egg.md)

[Back to Home](./documentation.md) | [Interface Overview](./documentation-interface.md) | [Keyboard Shortcuts](./documentation-shortcuts.md)

# Easter Egg

## Entry Point

The lobster icon `🦞` in the top-left brand area is not just decoration. It is a clickable easter egg.

You can find it:

- To the left of the `LalaClaw` brand text in the full header layout
- In the compact tab-brand layout as well

## What It Does

Clicking it triggers a lobster walk animation across the page:

- The lobster starts from the brand area
- There is a `50%` chance to spawn `1-10` companion lobsters for the same walk
- The static lobster icon is temporarily hidden while the animation is active
- When the animation finishes, the normal top-left lobster becomes visible again

This does not affect sessions, chat state, or inspector data. It is purely a frontend interaction detail.

## Interaction Rules

- Only one walk animation runs at a time
- Repeated clicks do not stack multiple overlapping runs while one is already active
- The animation layer uses `pointer-events: none`, so it does not block normal UI interaction

## Related Pages

- For the full layout, read [Interface Overview](./documentation-interface.md)
- For demo ideas, read [Product Showcase](./showcase.md)
