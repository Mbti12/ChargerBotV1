// --- BASE FACTS (kind of like a cache) ---
const BASE_KNOWLEDGE = `
School: Agoura High School (AHS)
Mascot: Chargers | Colors: Blue and Gold
Principal: Dr. Garrett Lepisto
Location: 28545 W Driver Ave, Agoura Hills, CA 91301
Programs: IB Program, Music, Theater, and Athletics.
`;

// --- URL MAP FOR SITES  ---
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
    // UPDATED: Now points specifically to your schedule tab
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

    // 1. HANDLE GOOGLE SHEETS/DOCS DIRECTLY
    // If it's a CSV or TXT export, we don't need the HTMLRewriter
    const contentType = res.headers.get("Content-Type") || "";
    if (url.includes("format=csv") || url.includes("format=txt") || contentType.includes("text/csv")) {
      const rawData = await res.text();
      // Clean up extra whitespace and return the raw text for the AI to parse
      return rawData.substring(0, 8000); 
    }

    // 2. HANDLE STANDARD WEBSITES (Like AgouraHighSchool.net)
    const ex = new TextExtractor();
    
    // We use the transform stream to stay within Cloudflare's memory limits
    await new HTMLRewriter()
      .on("*", ex)
      .transform(res)
      .text(); 

    // Clean up the scraped text 
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

      //rerouting incase of failing to scrape
      let target = "https://www.agourahighschool.net/about/ahs-at-a-glance"; // Default
      
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
              { role: "system", content: "You are ChargerBot, the helpful assistant for Agoura High School. Use the SCRAPED DATA (often in CSV format) to give exact times and schedules. If you see a schedule in the data, list it clearly for the user. Do not say you cannot parse it; simply read the rows and columns provided." },
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
    .msg { margin-bottom: 12px; padding: 12px 16px; border-radius: 18px; line-height: 1.5; max-width: 85%; }
    .bot { background: #f1f0f0; align-self: flex-start; border-bottom-left-radius: 4px; }
    .user { background: #000099; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .input-wrap { display: flex; width: 100%; max-width: 600px; gap: 8px; margin-top: 15px; }
    input { flex: 1; padding: 14px 20px; border-radius: 30px; border: 1px solid #ddd; outline: none; font-size: 16px; }
    button { background: #000099; color: white; border: none; padding: 0 25px; border-radius: 30px; cursor: pointer; font-weight: bold; }
    h1 { color: #000099; margin-bottom: 10px; }
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
    async function ask() {
      const i = document.getElementById('i');
      const c = document.getElementById('chat');
      const p = i.value.trim();
      if(!p) return;
      c.innerHTML += '<div class="msg user">' + p + '</div>';
      i.value = '';
      c.scrollTop = c.scrollHeight;
      const res = await fetch('/api', { method: 'POST', body: JSON.stringify({ prompt: p }) });
      const d = await res.json();
      c.innerHTML += '<div class="msg bot"><strong>ChargerBot:</strong> ' + d.content + '</div>';
      c.scrollTop = c.scrollHeight;
    }
  </script>
</body>
</html>`, { headers: { "Content-Type": "text/html" } });
  }
};
