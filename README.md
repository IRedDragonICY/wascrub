# WAScrub 💬✨

**Clean  WhatsApp Chat Exports with Style**

---


## 🌟 Features

- **Drag & Drop Interface** 📤  
  Easily upload multiple WhatsApp chat `.txt` files with modern drag-and-drop functionality

- **Metadata Control** 🕒📅  
  Toggle removal of dates and times while preserving conversation flow

- **Batch Processing** 🔄  
  Handle multiple files simultaneously with individual processing tracking

- **Real-Time Preview** 👀  
  Instant preview of cleaned messages with syntax highlighting

- **Dark/Light Mode** 🌗  
  Automatic theme switching based on system preferences

- **Bulk Actions** 🗑️  
  Multi-select files for batch deletion with keyboard shortcuts

- **Modern UI** 🎨  
  Responsive design with smooth animations and intuitive controls

## 🚀 Quick Start

1. **Clone Repository**
   ```bash
   git clone https://github.com/yourusername/wascrub.git
   cd wascrub
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Access Application**
   ```
   http://localhost:3000
   ```

## 🛠️ Usage Guide

1. **Upload Chats**  
   → Drag WhatsApp export `.txt` files into the drop zone  
   → Or click to browse files (supports multi-select)

2. **Process Options**  
   → Toggle "Remove Dates" 📅 to exclude timestamps  
   → Toggle "Remove Times" 🕒 to hide message times

3. **Preview & Manage**  
   → Click files in sidebar to switch between conversations  
   → `Ctrl/Cmd + Click` for multi-select deletion  
   → Real-time message preview with applied filters

4. **Export Data**  
   → Click download button to get cleaned version  
   → File automatically named `WAScrub_originalfilename.txt`

## 🔧 Tech Stack

- **Frontend**: React + TypeScript
- **State Management**: React Hooks (useState, useCallback, useMemo)
- **Styling**: CSS-in-JS with dynamic theme switching
- **Icons**: Font Awesome (via CDN)
- **Build**: Vite/Next.js (configured for client-side rendering)

## 🧑💻 Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE.md](LICENSE.md) for details

---

**📝 Note**:
- Requires WhatsApp chat exports in standard format
- Works best with modern browsers (Chrome/Firefox/Edge latest versions)
- All processing happens locally - no data leaves your computer

**🙏 Credits**
- WhatsApp logo and name are trademarks of Meta Platforms Inc.
- Font Awesome icons by Dave Gandy

---

**Made with ❤️ by Mohammad Farid Hendianto**  

