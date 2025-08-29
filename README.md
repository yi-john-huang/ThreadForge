# 🧵 ThreadForge UI Improver

A Chrome extension that improves the Threads experience by enabling **inline comment expansion** instead of navigating to new pages.

## ✨ Features

- **🔗 Inline Comment Expansion**: Click on comments to expand replies directly in the current page instead of navigating to a new page
- **⚡ Fast & Smooth**: Seamless animations and loading states for better UX
- **🎨 Beautiful UI**: Modern, responsive design with gradient backgrounds and hover effects
- **⚙️ Customizable Settings**: Toggle features on/off through the extension popup
- **📊 Usage Statistics**: Track how many comments you've expanded and clicks intercepted
- **📱 Mobile Responsive**: Works on both desktop and mobile views of Threads

## 🚀 Installation

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/your-username/threadforge-ui-improver.git
   cd threadforge-ui-improver
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the `dist` folder

### From Chrome Web Store
*Coming soon!*

## 🛠️ Development

### Scripts

- `npm run build` - Build the extension for production
- `npm run dev` - Build and watch for changes during development
- `npm run type-check` - Check TypeScript types without building

### Project Structure

```
ThreadForge/
├── src/
│   ├── content.ts      # Main content script for Threads.com
│   ├── popup.ts        # Extension popup interface
│   ├── popup.html      # Popup HTML template
│   └── types.ts        # TypeScript type definitions
├── icons/              # Extension icons
├── dist/               # Built extension files
├── manifest.json       # Chrome extension manifest
├── package.json        # Node.js dependencies
├── tsconfig.json       # TypeScript configuration
└── webpack.config.js   # Webpack build configuration
```

## 🎯 How It Works

1. **Detection**: The extension detects clickable comment elements on Threads pages
2. **Interception**: When you click a comment that would normally redirect to a new page, the extension intercepts the click
3. **Inline Expansion**: Instead of navigating, it fetches the comment data and displays replies inline with smooth animations
4. **Enhancement**: Provides a better, faster user experience without page reloads

## 🎨 Screenshots

| Feature | Screenshot |
|---------|------------|
| Inline Expansion | *Screenshot coming soon* |
| Extension Popup | *Screenshot coming soon* |
| Settings Panel | *Screenshot coming soon* |

## ⚙️ Settings

Access settings by clicking the ThreadForge icon in your browser toolbar:

- **Enable inline expansion**: Toggle the main feature on/off
- **Auto-expand replies**: Automatically expand replies when loading comments
- **Refresh Current Tab**: Reload the current Threads page

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test them
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Bug Reports & Feature Requests

Please use the [GitHub Issues](https://github.com/your-username/threadforge-ui-improver/issues) page to report bugs or request new features.

## 🙏 Acknowledgments

- Built with ❤️ for the Threads community
- Inspired by Reddit's comment expansion UX
- Uses modern web technologies: TypeScript, Webpack, Chrome Extension APIs

---

**Note**: This extension is not affiliated with Meta/Instagram or Threads. It's an independent project to improve user experience.