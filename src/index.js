const SYSTEM_PROMPT = `
You are ChargerBot, the helpful assistant for Agoura High School.

## Response Rules
- Be concise
- Use **bold** for times and period numbers.
- Use bullet points only when listing multiple items.
- Never repeat the question back to the user.
- format responses in bulletpoints for clarity
- when formatting the bell schedule, output each period on a new line

## Data Handling
- You will receive live scraped data (sometimes CSV). Parse it and extract only what's relevant to the question.
- If the data is missing or unhelpful, say so in one sentence and suggest the user check agourahighschool.net.

## Tone
- Friendly and brief. You are talking to high school students.
`;

// 
const BASE_KNOWLEDGE = `
School: Agoura High School (AHS)
Mascot: Chargers | Colors: Blue and Gold
Principal: Dr. Garrett Lepisto
Location: 28545 W Driver Ave, Agoura Hills, CA 91301
Programs: IB Program, Music, Theater, and Athletics.
`;

// 
const AHS_ROUTES = [
  {
    keywords: ["principal", "message", "lepisto", "letter", "administrator"],
    url: "https://www.agourahighschool.net/about/principals-message"
  },
  {
    keywords: ["calendar", "event", "date", "break", "holiday", "vacation"],
    url: "https://www.agourahighschool.net/calendar1"
  },
  {
    keywords: ["bell", "schedule", "time", "period", "classes", "lunch"],
    url: "https://docs.google.com/spreadsheets/d/1vGPiWczlClW_9u_nEQF6QiW894MJa1MKEzL1hVv95gM/export?format=csv&gid=1453836606"
  },
  {
    keywords: ["contact", "phone", "email", "directory", "call", "office"],
    url: "https://www.agourahighschool.net/directory"
  },
  {
    keywords: ["counseling", "counselor", "college", "career", "social worker"],
    url: "https://www.agourahighschool.net/quick-links/counseling-appointments"
  },
  {
    keywords: ["athletics", "sports", "team", "coach", "game", "scores"],
    url: "https://www.agourahighschool.net/athletics"
  }
];

class TextExtractor {
  constructor() { this.content = ""; this.ignoreDepth = 0; }
  element(element) {
    const junk = ["script", "style", "noscript", "svg", "nav", "footer", "header"];
    if (junk.includes(element.tagName)) {
      this.ignoreDepth++;
      element.onEndTag(() => this.ignoreDepth--);
    }
  }
  text(textNode) {
    if (this.ignoreDepth === 0 && textNode.text.trim()) {
      this.content += textNode.text + (textNode.lastInTextNode ? " " : "");
    }
  }
}

async function scrape(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,text/csv,text/plain"
      },
      cf: { cacheTtl: 1800 }
    });

    if (!res.ok) return "";

    const contentType = res.headers.get("Content-Type") || "";
    if (url.includes("format=csv") || url.includes("format=txt") || contentType.includes("text/csv")) {
      const rawData = await res.text();
      return rawData.substring(0, 8000);
    }

    const ex = new TextExtractor();
    await new HTMLRewriter()
      .on("*", ex)
      .transform(res)
      .text();

    return ex.content
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000);

  } catch (err) {
    console.error("Scrape Error:", err);
    return "";
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response("OK", { headers: { "Access-Control-Allow-Origin": "*" } });
    const url = new URL(request.url);

    if (url.pathname === "/api") {
      const { prompt } = await request.json();
      const lowerPrompt = prompt.toLowerCase();

      let target = "https://www.agourahighschool.net/about/ahs-at-a-glance";

      for (const route of AHS_ROUTES) {
        if (route.keywords.some(k => lowerPrompt.includes(k))) {
          target = route.url;
          break;
        }
      }

      const liveData = await scrape(target);

      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: `BASE:\n${BASE_KNOWLEDGE}\n\nSCRAPED (from ${target}):\n${liveData}\n\nQUESTION: ${prompt}` }
            ]
          })
        });

        const json = await groqRes.json();
        return new Response(JSON.stringify({ content: json.choices[0].message.content }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch {
        return new Response(JSON.stringify({ content: "I'm having trouble thinking. Go Chargers!" }));
      }
    }

    // --- UI ---
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChargerBot</title>
  <style>
    :root {
      --primary: #000099;
      --bg-gradient: #f4f7f9;
      --bot-msg: #f0f2f5;
      --user-msg: #000099;
    }

    body { 
      font-family: 'Inter', -apple-system, sans-serif; 
      background: var(--bg-gradient); 
      margin: 0;
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      min-height: 100vh;
      padding: 20px;
    }

    .header-img-container {
      width: 100%;
      max-width: 700px;
      display: flex;
      justify-content: center;
      margin-bottom: 10px;
    }

    .header-img {
      width: 100px;
      height: 100px;
      border-radius: 20px;
      object-fit: cover;
      background: #eee;
    }

    h1 { 
      color: var(--primary); 
      margin: 0 0 5px 0;
      font-size: 40px;
      font-weight: 800;
      transition: transform 0.2s;
    }
    
    h3 {
      color: var(--primary);
      margin: 0 0 20px 0;
      font-size: 14px;
      font-weight: 350;
      transition: transform 0.2s;
    }

    #chat { 
      background: white;
      width: 100%; 
      max-width: 700px; 
      height: 60vh; 
      border-radius: 16px; 
      overflow-y: auto; 
      padding: 20px; 
      display: flex; 
      flex-direction: column;
      gap: 15px;
      box-sizing: border-box; 
    }

    .msg-row {
      display: flex;
      gap: 10px;
      align-items: flex-end; 
      width: 100%;
      animation: fadeIn 0.3s ease;
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #ddd;
      flex-shrink: 0;
      overflow: hidden;
    }

    .avatar img { width: 100%; height: 100%; object-fit: cover; }

    .msg-content {
      max-width: 75%;
      padding: 12px 16px;
      border-radius: 18px;
      font-size: 15px;
      line-height: 1.4;
    }

    .bot-row { justify-content: flex-start; }
    .bot-content { 
      background: var(--bot-msg); 
      color: #333; 
      border-bottom-left-radius: 4px;
    }

    .user-row { 
      display: flex;
      flex-direction: row-reverse; 
      justify-content: flex-end;   
      margin-left: auto;          
      width: fit-content;          
      gap: 10px;
    }
    .user-content { 
      background: var(--primary); 
      color: white; 
      border-bottom-right-radius: 4px; 
      margin-right: 0; 
    }

    .input-wrap { 
      display: flex; 
      width: 100%; 
      max-width: 700px; 
      gap: 12px; 
      margin-top: 20px; 
    }

    input { 
      flex: 1; 
      padding: 16px 20px; 
      border-radius: 30px; 
      border: 1px solid #ddd; 
      outline: none; 
      font-size: 16px;
      transition: border 0.2s, transform 0.2s;
    }
    
    input:focus { border-color: var(--primary); }

    button { 
      background: var(--primary); 
      color: white; 
      border: none; 
      width: 50px;
      height: 50px;
      border-radius: 50%; 
      cursor: pointer; 
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    }

    button:hover { transform: scale(1.15); }
    input:hover { transform: scale(1.03); }
    
    .msg-content p { margin: 0 0 8px 0; }
    .msg-content p:last-child { margin-bottom: 0; }
    .msg-content ul, .msg-content ol { margin: 6px 0 8px 0; padding-left: 20px; }
    .msg-content li { margin-bottom: 4px; }
    .msg-content strong { font-weight: 700; color: #000066; }
    .msg-content h3 { margin: 10px 0 4px 0; font-size: 1em; color: #000066; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
    .msg-content code { background: #e8e8e8; border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 0.9em; }
    
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>

  <div class="header-img-container">
  </div>
  <h1>ChargerBot V3</h1>
  <h3>Developed by Samir Kutty</h3>
  <div id="chat">
    <div class="msg-row bot-row">
      <div class="avatar"><img src="https://yt3.googleusercontent.com/ytc/AIdro_nUD6JXvA95v_ybt6b3VarSQ_8-IPwwbQr_BinFgCHJtQ=s900-c-k-c0x00ffffff-no-rj" alt="Bot"></div>
      <div class="msg-content bot-content">Ready to help! Ask me anything about AHS.</div>
    </div>
  </div>

  <div class="input-wrap">
    <input type="text" id="i" placeholder="Type a message..." onkeypress="if(event.key==='Enter')ask()">
    <button onclick="ask()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
    </button>
  </div>

<script>
    const chat = document.getElementById('chat');
    
    const BOT_IMAGE = "https://yt3.googleusercontent.com/ytc/AIdro_nUD6JXvA95v_ybt6b3VarSQ_8-IPwwbQr_BinFgCHJtQ=s900-c-k-c0x00ffffff-no-rj"; 
    const USER_IMAGE = "https://wallpapers.com/images/hd/generic-person-icon-profile-ulmsmhnz0kqafcqn-2.jpg";
    
    function typeWriter(element, text, speed = 25) {
      let i = 0;
      function type() {
        if (i < text.length) {
          element.innerHTML += text.charAt(i);
          i++;
          chat.scrollTop = chat.scrollHeight;
          setTimeout(type, speed);
        }
      }
      type();
    }

    function formatResponse(text) {
      text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      text = text.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
      text = text.replace(/\`([^\`]+)\`/g, "<code>$1</code>");
      text = text.replace(/^(?:[-*]) (.+)$/gm, "<li>$1</li>");
      text = text.replace(/(<li>.*<\\/li>)/s, (match) => "<ul>" + match + "</ul>");
      text = text.replace(/(<li>[\\s\\S]*?<\\/li>)(?!\\s*<li>)/g, (match) => {
        if (!match.startsWith("<ul>")) return "<ul>" + match + "</ul>";
        return match;
      });
      text = text.replace(/^\\d+\\. (.+)$/gm, "<li>$1</li>");

      const blocks = text.split(/\\n{2,}/);
      text = blocks.map(block => {
        block = block.trim();
        if (!block) return "";
        if (/^<(ul|ol|li|h3)/.test(block)) return block;
        return "<p>" + block.replace(/\\n/g, "<br>") + "</p>";
      }).join("");

      return text;
    }

    async function ask() {
      const input = document.getElementById('i');
      const val = input.value.trim();
      if (!val) return;

      const userHtml = `
        <div class="msg-row user-row">
          <div class="avatar"><img src="${USER_IMAGE}" alt="User"></div>
          <div class="msg-content user-content">${val}</div>
        </div>`;
      chat.insertAdjacentHTML('beforeend', userHtml);
      
      input.value = "";
      chat.scrollTop = chat.scrollHeight;

      try {
        const res = await fetch('/api', { method: 'POST', body: JSON.stringify({ prompt: val }) });
        const d = await res.json();
        
        const botId = "msg-" + Date.now();
        const botHtml = `
          <div class="msg-row bot-row">
            <div class="avatar"><img src="${BOT_IMAGE}" alt="Bot"></div>
            <div class="msg-content bot-content" id="${botId}"></div>
          </div>`;
        chat.insertAdjacentHTML('beforeend', botHtml);
        
        const formatted = formatResponse(d.content);
        document.getElementById(botId).innerHTML = formatted;
        chat.scrollTop = chat.scrollHeight;
      } catch {
        const botId = "msg-" + Date.now();
        const errorHtml = `
          <div class="msg-row bot-row">
            <div class="avatar"><img src="${BOT_IMAGE}" alt="Bot"></div>
            <div class="msg-content bot-content" id="${botId}"></div>
          </div>`;
        chat.insertAdjacentHTML('beforeend', errorHtml);
        typeWriter(document.getElementById(botId), "I'm having trouble thinking. Go Chargers!");
      }
    }
</script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  }
};