# 🤖 HomeChatBot

A powerful, modern web application for creating and chatting with AI characters using customizable personas. Build immersive conversations with detailed AI personalities, complete with message variants, editing capabilities, and a beautiful responsive interface.

![HomeChatBot](https://via.placeholder.com/800x400/7c3aed/ffffff?text=HomeChatBot+%7C+AI+Character+Chat+Platform)

## ✨ Core Features

### 🎭 **Advanced Character System**
- **Detailed Character Creation** - Build AI personalities with rich backgrounds, scenarios, and speaking styles
- **Profile Names** - Optional display names for better organization
- **Example Dialogue** - Train character responses with conversation samples
- **Character Management** - Full CRUD operations with inline editing
- **Expandable Cards** - Preview or view full character details

### 👤 **Persona Management**
- **Multiple Conversation Styles** - Define different approaches (Professional, Casual, Creative, etc.)
- **Persona Profiles** - Detailed descriptions for consistent interaction styles
- **Flexible Assignment** - Mix and match personas with any character

### 💬 **Enhanced Chat Experience**
- **Real-time Streaming** - Watch AI responses generate live with smooth animations
- **Message Variants** - Generate multiple response options for any AI message
- **Variant Navigation** - Browse through different response versions with arrow controls
- **Smart Variant Management** - Auto-cleanup when conversation continues
- **Message Editing** - Edit any message (user or AI) to refine conversations
- **Continue Feature** - Extend AI responses naturally
- **Message Deletion** - Remove messages and all subsequent responses

### ⚙️ **Flexible Configuration**
- **AI Settings** - Adjustable temperature, streaming toggle, max tokens
- **User Prompts** - Global prompt templates for consistent behavior
- **API Key Management** - Secure DeepSeek API integration
- **Development Mode** - Debug tools and request logging

### 🎨 **Modern UI/UX**
- **Beautiful Design** - Purple-themed interface with gradients and smooth animations
- **Responsive Layout** - Perfect experience on desktop, tablet, and mobile
- **Inline Actions** - Hover-activated message controls for clean interface
- **Smart Scrolling** - Auto-scroll with streaming response optimization
- **Loading States** - Clear feedback for all operations
- **Form Validation** - User-friendly error handling

### 🔧 **Developer Features**
- **Request Logging** - Download complete API request payloads for debugging
- **Error Handling** - Comprehensive error reporting and recovery
- **Database Migrations** - Version-controlled schema updates
- **Type Safety** - Full TypeScript coverage

### 🔐 **Security & Authentication**
- **Password Protection** - Secure access to your conversations
- **JWT Sessions** - Stateless authentication with auto-refresh
- **Setup Wizard** - First-time configuration guide
- **Data Privacy** - Local database storage

### 💾 **Data Management**
- **PostgreSQL Database** - Robust, scalable database with Prisma ORM
- **Session Management** - Organized conversation history
- **Data Persistence** - All conversations, characters, and settings saved
- **Database Relationships** - Proper foreign keys and cascading deletes
- **Easy Migration** - Built-in export/import system for data portability

## 🚀 Quick Start

### 🐳 Using Docker (Recommended)

**Single Command Deployment:**
```bash
# Clone and deploy
git clone https://github.com/yourusername/homechatbot.git
cd homechatbot
./deploy.sh --rebuild
```

**Manual Docker Run:**
```bash
docker run -d \
  --name homechatbot \
  --restart unless-stopped \
  -p 3000:3000 \
  -v homechatbot_data:/app/data \
  ghcr.io/yourusername/homechatbot:latest
```

**Updating Your Deployment:**
```bash
# Pull latest changes and rebuild
git pull
./deploy.sh --rebuild
```

### 💻 Development Setup

1. **Clone and Install:**
   ```bash
   git clone https://github.com/yourusername/homechatbot.git
   cd homechatbot
   npm install
   ```

2. **Environment Configuration:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local and add your DeepSeek API key
   ```

3. **Database Setup (PostgreSQL):**
   ```bash
   # Automated setup (starts PostgreSQL with Docker)
   npm run db:setup
   
   # OR manual setup if you have PostgreSQL installed
   npx prisma migrate dev --name init
   npx prisma generate
   ```

4. **Start Development:**
   ```bash
   npm run dev
   ```

5. **Access Application:**
   - Open `http://localhost:3000`
   - Complete first-time setup wizard
   - Add your DeepSeek API key in settings

> **📖 For detailed migration information, see [POSTGRESQL_MIGRATION.md](POSTGRESQL_MIGRATION.md)**

## 🎯 Usage Guide

### 📋 **Initial Setup**
1. **First Run** - Access the setup wizard on first visit
2. **Create Password** - Set your access password for security
3. **API Configuration** - Add your DeepSeek API key in Settings

### 🎭 **Creating Characters**
1. **Navigate to Characters** - Use the main menu
2. **Click "New Character"** - Fill out the detailed form:
   - **Name**: How the character is referenced in chats
   - **Profile Name**: Optional display name for menus
   - **Scenario**: Setting and context for conversations
   - **Personality**: Traits, quirks, and behavior patterns
   - **First Message**: Opening message from the character
   - **Example Dialogue**: Sample conversations to train responses
3. **Save & Test** - Create and start chatting immediately

### 👤 **Managing Personas**
1. **Go to Personas** - Define your conversation approaches
2. **Create Personas** like:
   - **Professional**: Formal, business-focused interactions
   - **Casual**: Relaxed, friendly conversations
   - **Creative**: Imaginative, artistic discussions
   - **Academic**: Research-oriented, detailed responses

### 💬 **Advanced Chat Features**
- **Message Variants**: Click 🔄 on AI messages to generate alternatives
- **Navigate Variants**: Use ← → arrows to browse response options
- **Edit Messages**: Click ✏️ to modify any message in the conversation
- **Continue Responses**: Click ➡️ to extend AI responses naturally
- **Delete Messages**: Click 🗑️ to remove messages and all that follow

### ⚙️ **Configuration Options**
- **Temperature**: Control AI creativity (0.0 = focused, 1.0 = creative)
- **Streaming**: Toggle real-time response generation
- **User Prompts**: Create reusable prompt templates
- **Debug Mode**: Enable request logging and debugging tools

## 🛠️ Technical Details

### **Architecture**
- **Frontend**: Next.js 15 with TypeScript and modern CSS
- **Backend**: Next.js API routes with middleware
- **Database**: PostgreSQL with Prisma ORM v6
- **AI Provider**: DeepSeek API with streaming support
- **Authentication**: JWT with bcrypt password hashing
- **Deployment**: Docker with PostgreSQL and automated build scripts

### **Database Schema**
- **Personas**: Conversation styles and approaches
- **Characters**: AI personalities with detailed profiles  
- **Chat Sessions**: Organized conversations
- **Messages**: Individual chat messages with versions
- **Message Versions**: Alternative AI responses
- **Settings**: Application configuration
- **User Prompts**: Reusable prompt templates

### **API Endpoints**
```
GET    /api/personas         # List all personas
POST   /api/personas         # Create persona
PUT    /api/personas/:id     # Update persona
DELETE /api/personas/:id     # Delete persona

GET    /api/characters       # List all characters
POST   /api/characters       # Create character
PUT    /api/characters/:id   # Update character
DELETE /api/characters/:id   # Delete character

GET    /api/sessions         # List chat sessions
POST   /api/sessions         # Create session
GET    /api/sessions/:id     # Get session details
PUT    /api/sessions/:id     # Update session
DELETE /api/sessions/:id     # Delete session

POST   /api/chat             # Send message (streaming/non-streaming)
GET    /api/chat/request-log/:id  # Download API request payload

GET    /api/messages/:id/variants     # Get message variants
POST   /api/messages/:id/variants     # Generate new variant
PUT    /api/messages/:id/variants     # Set active variant
DELETE /api/messages/:id/variants     # Cleanup variants

GET    /api/settings         # Get application settings
POST   /api/settings         # Update settings
GET    /api/user-prompts     # List user prompts
POST   /api/user-prompts     # Create user prompt
```

## 📋 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL database connection string | See .env.example | Yes |
| `JWT_SECRET` | JWT signing secret | auto-generated | No |
| `DEEPSEEK_API_KEY` | DeepSeek API key | none | Optional* |
| `POSTGRES_DB` | PostgreSQL database name | `homechatbot` | No |
| `POSTGRES_USER` | PostgreSQL username | `homechatbot` | No |
| `POSTGRES_PASSWORD` | PostgreSQL password | `homechatbot_secure_password` | No |
| `POSTGRES_PORT` | PostgreSQL port | `5432` | No |
| `APP_PORT` | Application port | `3000` | No |
| `NODE_ENV` | Environment mode | `development` | No |

**Note**: *DeepSeek API key can be configured through the web interface in Settings or via environment variable.

## 🎮 Commands Reference

### **Development**
```bash
npm run dev          # Start development server
npm run build        # Build for production  
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

### **Database**
```bash
npm run db:setup         # Setup PostgreSQL (automated)
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run database migrations
npm run prisma:push      # Push schema changes
npm run prisma:studio    # Open Prisma Studio
npm run db:reset         # Reset database (CAUTION)
```

### **Docker**
```bash
./deploy.sh              # Deploy with current settings
./deploy.sh --rebuild    # Rebuild and deploy
./deploy.sh --logs       # Deploy and show logs
./deploy.sh --nginx      # Deploy with nginx profile
```

## 🔧 Troubleshooting

### **Common Issues**

**1. API Key Not Working**
- Verify your DeepSeek API key in Settings
- Check API key has sufficient credits
- Ensure network connectivity to DeepSeek API

**2. Database Errors**
```bash
# Reset and rebuild database
npm run db:reset
npm run prisma:migrate
```

**3. Docker Issues**
```bash
# View container logs
docker compose logs -f

# Restart containers
docker compose down && docker compose up -d

# Full rebuild
./deploy.sh --rebuild
```

**4. TypeScript Errors After Updates**
```bash
# Regenerate Prisma client
npm run prisma:generate

# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

### **Debug Mode**
Enable debug mode in Settings to access:
- **Request Logs**: Download complete API request payloads
- **Extended Logging**: Detailed console output
- **Error Details**: Full error traces

## 🚀 Advanced Usage

### **Custom AI Providers**
While built for DeepSeek, the architecture supports other OpenAI-compatible APIs by modifying the chat endpoint.

### **Bulk Character Import**
Characters can be imported by directly inserting into the database using Prisma Studio.

### **Backup & Restore**
```bash
# Backup PostgreSQL database
docker-compose exec postgres pg_dump -U homechatbot homechatbot > backup.sql

# Restore PostgreSQL database  
docker-compose exec -T postgres psql -U homechatbot homechatbot < backup.sql
```

**Alternative: Use the built-in Export/Import system through the web interface for data portability.**

### **Performance Optimization**
- Enable streaming for faster perceived response times
- Use lower temperature values for more consistent responses
- Regular database maintenance for optimal performance

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### **Development Process**
1. **Fork the repository** from GitHub
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with proper testing
4. **Follow code style**: Run `npm run lint` and `npm run type-check`
5. **Commit changes**: `git commit -m 'Add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request** with detailed description

### **Code Style Guidelines**
- Use TypeScript for all new code
- Follow existing component patterns
- Add proper error handling
- Include inline documentation for complex logic
- Ensure responsive design compatibility

### **Testing**
- Test all new features thoroughly
- Verify database migrations work correctly
- Check both streaming and non-streaming modes
- Test on mobile and desktop

## 📋 Roadmap

### **Version 2.0 - Enhanced Features**
- [ ] 🎵 Voice chat integration with speech-to-text
- [ ] 🖼️ Image generation support (DALL-E, Midjourney)
- [ ] 🌍 Multi-language support and translations
- [ ] 📁 Character import/export with JSON format
- [ ] 🎨 Custom themes and UI customization

### **Version 2.1 - AI Enhancements**
- [ ] 🔌 Plugin system for custom AI providers
- [ ] 🧠 Memory system for long-term character memory
- [ ] 📊 Conversation analytics and insights
- [ ] 🔄 Auto-retry with backoff for failed requests
- [ ] 📝 Rich text formatting in messages

### **Version 2.2 - Collaboration**
- [ ] 👥 Multi-user support with permissions
- [ ] ☁️ Cloud sync and backup options
- [ ] 📱 Mobile app (React Native)
- [ ] 🔗 API webhooks for integrations
- [ ] 📈 Usage statistics and reporting

### **Future Considerations**
- [ ] 🤖 Local AI model support (Ollama, etc.)
- [ ] 📺 Video chat with AI avatars
- [ ] 🎮 Integration with gaming platforms
- [ ] 📚 Knowledge base integration
- [ ] 🔐 Advanced security features

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for complete details.

### **Quick Summary**
- ✅ Commercial use allowed
- ✅ Modification allowed  
- ✅ Distribution allowed
- ✅ Private use allowed
- ❗ License and copyright notice required

## 🆘 Support & Community

### **Getting Help**
- **🐛 Bug Reports**: [GitHub Issues](https://github.com/yourusername/homechatbot/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/yourusername/homechatbot/discussions)
- **📖 Documentation**: [Wiki Pages](https://github.com/yourusername/homechatbot/wiki)
- **💡 Feature Requests**: [Enhancement Issues](https://github.com/yourusername/homechatbot/issues/new?template=feature_request.md)

### **Community Guidelines**
- Be respectful and inclusive
- Provide detailed information for bug reports
- Search existing issues before creating new ones
- Help others when you can

### **Security Issues**
For security vulnerabilities, please email directly rather than opening public issues.

---

## 🎉 Acknowledgments

- **[DeepSeek AI](https://deepseek.com/)** - Powerful AI chat completions
- **[Next.js](https://nextjs.org/)** - React framework for production
- **[Prisma](https://prisma.io/)** - Next-generation ORM
- **[Vercel](https://vercel.com/)** - Hosting and deployment platform
- **Contributors** - Everyone who has helped improve this project

---

<div align="center">

**Made with ❤️ by developers who love AI conversations**

[⭐ Star this project](https://github.com/yourusername/homechatbot) if you find it useful!

</div>
