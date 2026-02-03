export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API handling 
    if (url.pathname === "/api") {
      if (request.method !== "POST") {
        return new Response("Only POST allowed", { status: 405 });
      }

      let prompt;
      try {
        const body = await request.json();
        prompt = body.prompt;
        if (!prompt) throw new Error("No prompt provided");
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON or missing prompt" }),
          { headers: { "Content-Type": "application/json" }, status: 400 }
        );
      }

      try {
        const schoolData = env.SCHOOL_DATA;

        const llmResponse = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              temperature: 0,
              messages: [
                {
                  role: "system",
                  content:
                  "You are ChargerBot, the official Agoura High School assistant." +

                  "Use the provided school data as your source of truth." +
                  "Answer questions clearly and naturally, summarizing when appropriate." +
                  
                  "If the answer is not found in the data, say:" +
                  "I can help with information that’s currently available about Agoura High School." +
                  
                  "Do not invent details or dates." +
                  "Do not quote large sections unless explicitly asked." +
                  "Be friendly, feel free to greet the user.",
                },
                {
                  role: "user",
                  content:
                    "DATA:\n" +
                    schoolData +
                    "\n\nQUESTION:\n" +
                    prompt,
                },
              ],
            }),
          }
        );

        const data = await llmResponse.json();
        const content =
          data?.choices?.[0]?.message?.content ||
          "I don't have that information.";

        return new Response(JSON.stringify({ content }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error(err);
        return new Response(
          JSON.stringify({ error: "LLM request failed: " + err.message }),
          { headers: { "Content-Type": "application/json" }, status: 500 }
        );
      }
    }

    // UI (DEFAULT) 
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>ChargerBot</title>
  <style>
    body {
      font-family: 'Segoe UI', Roboto, sans-serif;
      background: #f5f6fa;
      color: #333;
      text-align: center;
      padding: 3rem 1rem;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
    }

    h3 {
      margin-top: 0rem;
    }

    .input-container {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }

    input {
      width: 300px;
      padding: 0.75rem;
      border-radius: 10px;
      border: 1px solid #ccc;
    }

    button {
      padding: 0.75rem 1.5rem;
      border-radius: 10px;
      border: none;
      background: #000099;
      color: white;
      cursor: pointer;
    }

    #output {
      background: white;
      padding: 1rem;
      border-radius: 12px;
      max-width: 90%;
      max-height: 400px;
      overflow-y: auto;
      white-space: pre-wrap;
      text-align: left;
    }
  </style>
</head>
<body>
  <h1>ChargerBot</h1>
  <h3>AgourAI club</h3>

  <div class="input-container">
    <input id="prompt" placeholder="Ask any question about AHS here.." />
    <button onclick="askLLM()">Send</button>
  </div>

  <pre id="output"></pre>

  <script>
    async function askLLM() {
      const input = document.getElementById("prompt");
      const output = document.getElementById("output");
      const button = document.querySelector("button");
      const prompt = input.value;

      if (!prompt) return;

      button.disabled = true;
      output.textContent += "\\n\\nUser: " + prompt;

      try {
        const res = await fetch("/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });

        const data = await res.json();
        output.textContent += "\\n\\nChargerBot: " + data.content;
        output.scrollTop = output.scrollHeight;
      } finally {
        button.disabled = false;
        input.value = "";
      }
    }
  </script>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  },
};
