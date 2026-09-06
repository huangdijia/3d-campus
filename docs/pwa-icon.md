# 山河学府 PWA 图标 · 第二版

设计方向：浅雾蓝底色，深蓝色校门、山峰、河流和书页组成一个标志，图形保留四周空间用于系统圆形或圆角裁切，不包含文字。

生成方式：内置 imagegen；保留完整生成原图 `design/pwa/icon-master-v2.png`，使用 macOS sips 等比导出安装图标。未采用 CLI/API 备用路径。

## 输出文件

- `public/icons/shanhe-192-v2.png`：PWA 192 × 192。
- `public/icons/shanhe-512-v2.png`：PWA 512 × 512。
- `public/icons/shanhe-maskable-512-v2.png`：512 × 512，完整不透明背景，核心图案置于安全圆内。
- `public/icons/shanhe-apple-v2.png`：Apple Touch 180 × 180。
- `public/icons/shanhe-32-v2.png`：浏览器 32 × 32。

## 验证

- 五个 PNG 的尺寸与配置一致，均完全不透明；32 像素图已实际查看。
- 512 像素 maskable 图标中深色主体距中心最大半径为 176.53 像素，小于 204.8 像素安全圆半径。
- Manifest 三个引用文件存在，声明尺寸与文件一致；布局 lint 和生产构建通过。
- 保留原 Manifest id、scope 和 start_url，新图标使用版本化文件名。

## 初始生成提示词

Use case: logo-brand. Asset type: finished square PWA app icon for 山河学府, a Chinese university atlas with 3D campus exploration. Create ONE striking, beautifully simplified app icon, straight-on and perfectly square. Full-bleed deep blue-teal background, very subtle smooth luminous gradient from desaturated jade at upper left to deep ink-blue lower right. Center a single cohesive ivory emblem combining an open book at the bottom, two angular mountain peaks above, and the outline of a Chinese university gateway with a broad horizontal roof; a slim winding river is formed by clean negative space through the middle. Make it feel like a refined contemporary cultural atlas, calm, intelligent and memorable. Flat vector-like graphic with exceptionally clean bold edges, optically balanced, large continuous shapes, minimal details, high contrast, readable at 32 pixels. The emblem must be completely contained inside the central 66 percent width and 60 percent height of the canvas, with all important content inside a circle centered on the canvas with radius 38 percent of image width, so OS circle/squircle masks cannot cut it. Background extends to all four square edges. Output one 1024x1024 PNG-ready image. No text, no letters, no numbers, no badge border, no extra floating symbols, no rounded outer corners, no transparency, no phone mockup, no multiple options, no drop shadow outside the icon, no photographic textures, no fine filigree.

## 最终配色修改提示词

Use case: precise-object-edit. Edit the supplied PWA icon. Change ONLY its palette. Replace the dark blue/green gradient background with a very light, clean mist-blue background (#EDF3FA), essentially a solid flat color without visible texture. Recolor the existing ivory emblem to a rich restrained slate navy (#31536D) so it is strongly legible against the light background. Preserve exactly the emblem's geometry, mountains, gateway, river negative space, book pages, arc, scale, center, edge spacing, and square composition. Keep the icon clean and modern, consistent with a light frosted-glass university atlas interface. Full-bleed opaque square background, no rounded outer corners, no text, no extra elements, no shadows, no 3D effects. Return one finished square icon, not a mockup or a comparison.
