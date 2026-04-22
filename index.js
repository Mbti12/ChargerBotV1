const SYSTEM_PROMPT = `
You are ChargerBot, the helpful assistant for Agoura High School.

## Response Rules
- Be concise
- Use **bold** for times and period numbers.
- Use bullet points only when listing multiple items.
- Never repeat the question back to the user.
- T

## Data Handling
- You will receive live scraped data (sometimes CSV). Parse it and extract only what's relevant to the question.
- If the data is missing or unhelpful, say so in one sentence and suggest the user check agourahighschool.net.

## Tone
- Friendly and brief. You're talking to high school students.
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
<html>
<head>
  <title>ChargerBot</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; background: #f8f9fa; display: flex; flex-direction: column; align-items: center; padding: 20px; }
    #chat { background: white; width: 100%; max-width: 600px; height: 65vh; border-radius: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.1); overflow-y: auto; padding: 20px; display: flex; flex-direction: column; }
    .msg { margin-bottom: 12px; padding: 12px 16px; border-radius: 18px; line-height: 1.6; max-width: 85%; }
    .bot { background: #f1f0f0; align-self: flex-start; border-bottom-left-radius: 4px; }
    .user { background: #000099; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .input-wrap { display: flex; width: 100%; max-width: 600px; gap: 8px; margin-top: 15px; }
    input { flex: 1; padding: 14px 20px; border-radius: 30px; border: 1px solid #ddd; outline: none; font-size: 16px; }
    button { background: #000099; color: white; border: none; padding: 0 25px; border-radius: 30px; cursor: pointer; font-weight: bold; }
    h1 { color: #000099; margin-bottom: 10px; }

    /* Formatted response styles */
    .msg.bot p { margin: 0 0 8px 0; }
    .msg.bot p:last-child { margin-bottom: 0; }
    .msg.bot ul, .msg.bot ol { margin: 6px 0 8px 0; padding-left: 20px; }
    .msg.bot li { margin-bottom: 4px; }
    .msg.bot strong { font-weight: 700; color: #000066; }
    .msg.bot h3 { margin: 10px 0 4px 0; font-size: 1em; color: #000066; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
    .msg.bot code { background: #e8e8e8; border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>ChargerBot v3</h1>
  <div id="chat"><div class="msg bot"><strong>ChargerBot:</strong> Ready to help! Ask me anything.</div></div>
  <div class="input-wrap">
    <input type="text" id="i" placeholder="Ask about AHS here..." onkeypress="if(event.key==='Enter')ask()">
    <button onclick="ask()">Send</button>
  </div>
  <script>
    function formatResponse(text) {
      // Escape raw HTML to prevent injection
      text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Headers: ### Heading
      text = text.replace(/^### (.+)$/gm, "<h3>$1</h3>");

      // Bold: **text**
      text = text.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");

      // Inline code: \`code\`
      text = text.replace(/\`([^\`]+)\`/g, "<code>$1</code>");

      // Bullet lists: lines starting with - or *
      text = text.replace(/^(?:[-*]) (.+)$/gm, "<li>$1</li>");
      text = text.replace(/(<li>.*<\\/li>)/s, (match) => "<ul>" + match + "</ul>");
      // Wrap consecutive <li> blocks into <ul>
      text = text.replace(/(<li>[\\s\\S]*?<\\/li>)(?!\\s*<li>)/g, (match) => {
        if (!match.startsWith("<ul>")) return "<ul>" + match + "</ul>";
        return match;
      });

      // Numbered lists: lines starting with 1. 2. etc.
      text = text.replace(/^\\d+\\. (.+)$/gm, "<li>$1</li>");

      // Wrap paragraphs (double newlines)
      const blocks = text.split(/\\n{2,}/);
      text = blocks.map(block => {
        block = block.trim();
        if (!block) return "";
        if (/^<(ul|ol|li|h3)/.test(block)) return block;
        // Convert single newlines within a block to <br>
        return "<p>" + block.replace(/\\n/g, "<br>") + "</p>";
      }).join("");

      return text;
    }

    async function ask() {
      const i = document.getElementById('i');
      const c = document.getElementById('chat');
      const p = i.value.trim();
      if (!p) return;
      c.innerHTML += '<div class="msg user">' + p + '</div>';
      i.value = '';
      c.scrollTop = c.scrollHeight;

      const res = await fetch('/api', { method: 'POST', body: JSON.stringify({ prompt: p }) });
      const d = await res.json();

      const formatted = formatResponse(d.content);
      c.innerHTML += '<div class="msg bot"><strong>ChargerBot:</strong><br>' + formatted + '</div>';
      c.scrollTop = c.scrollHeight;
    }
  </script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  }
};
