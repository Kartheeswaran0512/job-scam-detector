# 🔍 Job Scam Detector - Agentic AI System

An intelligent job posting analyzer powered by Claude AI that detects fraudulent job postings using advanced agentic reasoning with ReAct framework.

**Live Demo:** Deploy on Railway.app or Render  
**GitHub:** https://github.com/Kartheeswaran0512/job-scam-detector

---

## 🎯 Features

✅ **Agentic AI Analysis** - Claude AI with ReAct reasoning framework  
✅ **5-Point Risk Analysis** - Company legitimacy, email domain, salary reality, offer quality, scam patterns  
✅ **Full-Stack Application** - Node.js backend + React frontend  
✅ **Real-Time Results** - Instant verdicts with confidence scores  
✅ **Dual Interface** - Web UI + CLI for flexibility  
✅ **Production Ready** - Deployed on Railway.app or Render  

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express.js
- **Frontend:** HTML, CSS, JavaScript (Vanilla)
- **AI:** Claude API (Anthropic) - Agentic AI with ReAct
- **Deployment:** Railway.app, Render, Vercel
- **Authentication:** API Key-based

---

## 📋 Prerequisites

- Node.js 16+ (or 18+ recommended)
- Anthropic Claude API key ([Get here](https://console.anthropic.com))
- npm (comes with Node.js)

---

## 🚀 Quick Start

### 1. Clone or Extract Project

```bash
# If ZIP file
unzip job-scam-detector.zip
cd job-scam-detector

# OR clone from GitHub
git clone https://github.com/Kartheeswaran0512/job-scam-detector.git
cd job-scam-detector
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

Get your API key from: https://console.anthropic.com

### 4. Run the Application

**Option A: Web UI (Recommended)**

```bash
npm start
```

Open browser: `http://localhost:5000`

**Option B: CLI (Interactive)**

```bash
npm run cli
```

---

## 📊 How It Works

### Web Interface Flow

```
User Input Form
    ↓
Node.js Express API
    ↓
Claude AI Agent (ReAct reasoning)
    ↓
5-Point Analysis:
  • Company legitimacy check
  • Email domain validation
  • Salary reality comparison
  • Job offer quality assessment
  • Scam pattern matching
    ↓
Risk Verdict: HIGH / MEDIUM / LOW
    ↓
Display Results with Colors
```

### CLI Flow

```
Interactive Prompt
    ↓
User enters job details
    ↓
Claude AI Analysis
    ↓
Terminal Output
```

---

## 🤖 Agent Analysis Dimensions

The AI agent checks 5 key areas:

1. **Company Legitimacy** 🏢
   - Is this a real company?
   - Does it have credible online presence?
   - Found on LinkedIn/official website?

2. **Email Domain Validation** 📧
   - Email from official company domain (e.g., @google.com)?
   - Free email provider (Gmail, Yahoo)?
   - Suspicious domain variations?

3. **Salary Reality Check** 💰
   - Is salary realistic for role/location?
   - Comparing to market standards
   - Too-good-to-be-true offers?

4. **Job Offer Quality** 🎯
   - Grammatical errors or poor writing?
   - Vague job descriptions?
   - Unusual communication patterns?

5. **Scam Pattern Matching** ⚠️
   - Advance fee requests?
   - Work-from-home too good to be true?
   - Matches known scam patterns?

---

## 📁 Project Structure

```
job-scam-detector/
├── server.js              # Express backend API with static serving
├── index.js               # CLI interactive version
├── package.json           # Dependencies
├── .env.example          # API key template
├── .gitignore            # Git configuration
├── README.md             # This file
└── public/
    └── index.html        # Frontend UI (HTML/CSS/JS)
```

---

## 🌐 Deployment

### Deploy to Railway.app (Recommended)

1. Push code to GitHub
2. Sign up at https://railway.app
3. Import GitHub repository
4. Add environment variable:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   ```
5. Deploy! Railway provides live URL

### Deploy to Render

1. Push code to GitHub
2. Sign up at https://render.com
3. Create new Web Service
4. Connect GitHub repository
5. Add environment variable
6. Deploy!

### Deploy to Heroku

```bash
heroku create your-app-name
heroku config:set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
git push heroku main
```

---

## 🧪 Testing

### Local Testing

**Web UI:**
```bash
npm start
# Open http://localhost:5000 in browser
# Fill form and submit
```

**CLI:**
```bash
npm run cli
# Enter company, job title, email, salary, location
# See verdict in terminal
```

### Test Cases

**Test 1: Suspicious Posting**
```
Company: Google India
Job Title: Junior Developer
Email: hiring@gmail.com
Salary: 500000
Location: Bangalore
Expected: HIGH RISK
```

**Test 2: Legitimate Posting**
```
Company: Google
Job Title: Software Engineer
Email: careers@google.com
Salary: 150000
Location: Mountain View
Expected: LOW RISK
```

---

## 📚 API Documentation

### POST /api/analyze-job

**Request:**
```json
{
  "company": "Google",
  "jobTitle": "Senior Developer",
  "email": "careers@google.com",
  "salary": 150000,
  "location": "California"
}
```

**Response:**
```json
{
  "success": true,
  "verdict": "RISK LEVEL: LOW\nCONFIDENCE: 92%\n...",
  "input": {...}
}
```

### GET /api/health

**Response:**
```json
{
  "status": "Server is running",
  "timestamp": "2024-05-31T10:00:00Z"
}
```

---

## 🔑 Key Technologies Used

| Technology | Purpose |
|-----------|---------|
| Claude API | Agentic AI with ReAct reasoning |
| Express.js | Backend server & routing |
| Node.js | Runtime environment |
| HTML/CSS/JS | Frontend UI |
| CORS | Cross-origin requests |
| Dotenv | Environment variables |

---

## 🚨 Important Notes

1. **API Key Security**
   - Never commit `.env` to GitHub
   - Use `.env.example` template
   - Regenerate key if exposed

2. **Rate Limiting**
   - Claude API has rate limits
   - Implement queueing for production

3. **Accuracy**
   - AI analysis is NOT 100% accurate
   - Always verify with official sources
   - Use as a first-line filter

4. **Data Privacy**
   - Job data sent to Anthropic API
   - Review privacy policy before use

---

## 🐛 Troubleshooting

### API Key Not Working
```
Error: 401 Unauthorized
→ Check ANTHROPIC_API_KEY in .env
→ Verify API key from console.anthropic.com
→ Regenerate if needed
```

### Port Already in Use
```
Error: listen EADDRINUSE :::5000
→ Change PORT in .env or use: PORT=3000 npm start
→ Or kill process: lsof -ti:5000 | xargs kill -9
```

### Module Not Found
```
Error: Cannot find module
→ Run: npm install
→ Clear cache: npm cache clean --force
→ Reinstall: rm -rf node_modules && npm install
```

---

## 📈 Future Enhancements

- [ ] User authentication & history
- [ ] Database integration (MongoDB/PostgreSQL)
- [ ] Advanced filtering & sorting
- [ ] Email verification integration
- [ ] LinkedIn API integration
- [ ] Salary database API
- [ ] Real web scraping
- [ ] Batch job analysis
- [ ] API rate limiting middleware
- [ ] Mobile app (React Native)

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

MIT License - Feel free to use for learning and projects.

---

## 👨‍💻 Author

**Kartheeswaran K**
- 📧 kartheeswarank0512@gmail.com
- 💼 LinkedIn: [Profile]
- 🐙 GitHub: https://github.com/Kartheeswaran0512

---

## 📞 Support

Having issues? 
1. Check Troubleshooting section
2. Review README.md
3. Check GitHub Issues
4. Create new GitHub Issue

---

**Built with ❤️ using Claude AI & Agentic Reasoning**

Last Updated: May 2024
